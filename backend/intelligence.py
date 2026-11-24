"""OCR, reference-based logo comparison and fact-preserving translation."""
import io
import re
from collections import Counter
from typing import Literal
from PIL import Image, ImageChops, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from . import ai

class Region(BaseModel):
    text:str=Field(max_length=3000)
    box:list[int]=Field(min_length=4,max_length=4,description='[ymin,xmin,ymax,xmax], normalized 0..1000')
class OCRResult(BaseModel):
    text:str=Field(max_length=12000)
    language:str=Field(max_length=100)
    regions:list[Region]=Field(max_length=60)
    warnings:list[str]=Field(max_length=10)
class LogoMatch(BaseModel):
    reference_id:str
    result:Literal['match','modified','not_found','uncertain']
    explanation:str=Field(max_length=1000)
    box:list[int]=Field(min_length=4,max_length=4)
class VisionResult(BaseModel):
    ocr:OCRResult
    logos:list[LogoMatch]=Field(max_length=3)
    suggested_alt_text:str=Field(max_length=600)
    warnings:list[str]=Field(max_length=10)
class TranslationResult(BaseModel):
    translated_text:str=Field(min_length=1,max_length=5000)
    back_translation:str=Field(min_length=1,max_length=5000)
    warnings:list[str]=Field(max_length=10)

LANGUAGES={'en':'English','hi':'Hindi','te':'Telugu','ta':'Tamil','kn':'Kannada','ml':'Malayalam','bn':'Bengali','mr':'Marathi','gu':'Gujarati','es':'Spanish','fr':'French','de':'German','pt':'Portuguese','ar':'Arabic','ja':'Japanese','ko':'Korean','zh':'Chinese'}

def normalize_image(blob,reference=False):
    if len(blob)>3_000_000:raise ValueError('Use an image no larger than 3 MB.')
    try:
        with Image.open(io.BytesIO(blob)) as image:
            if image.format not in ('PNG','JPEG','WEBP') or image.width*image.height>8_000_000:raise ValueError('Use PNG, JPEG or WebP up to 8 megapixels.')
            image.load();image=ImageOps.exif_transpose(image).convert('RGBA')
            background=Image.new('RGBA',image.size,'white');background.alpha_composite(image);image=background.convert('RGB')
            image.thumbnail((1000,1000) if reference else (2000,2000))
            output=io.BytesIO();image.save(output,format='JPEG',quality=90)
            return output.getvalue()
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):raise ValueError('This is not a readable, supported image.') from None

def valid_boxes(regions):
    for region in regions:
        y1,x1,y2,x2=region.box
        if not (0<=x1<=x2<=1000 and 0<=y1<=y2<=1000):raise ai.ProviderError('The provider returned invalid image coordinates. No result was accepted.')

def inspect_visual(blob,references):
    media=[('Creative to inspect','image/jpeg',normalize_image(blob))]
    for ref in references:media.append((f'Approved logo reference {ref["id"]}: {ref["name"]}','image/jpeg',ref['blob']))
    result=ai.generate('Transcribe visible text faithfully, preserving spelling and numbers. Never invent unreadable text; put uncertainty in warnings. Locate visible text. Compare each approved logo reference with the creative: match, modified, not_found, or uncertain. Only report reference IDs provided. Use 0..1000 [ymin,xmin,ymax,xmax] boxes; use [0,0,0,0] for not_found. A match is visual resemblance, not legal authenticity or pixel identity. Suggest descriptive alt text. All outputs require human review.',{'references':[{'id':r['id'],'name':r['name']} for r in references]},VisionResult,media)
    valid_boxes(result.ocr.regions);valid_boxes(result.logos)
    ids=[r['id'] for r in references]
    if sorted(m.reference_id for m in result.logos)!=sorted(ids):raise ai.ProviderError('The provider did not account for each approved logo reference. No comparison was accepted.')
    out=result.model_dump()
    # The AI's "match" is checked against what Brandora can measure itself; a disagreement goes to a person.
    image=normalize_image(blob)
    for logo in out['logos']:
        if logo['result']=='match':
            ref=next(r for r in references if r['id']==logo['reference_id'])
            doubt=logo_doubts(image,logo['box'],ref,out['ocr']['regions'])
            if doubt:logo['result']='uncertain';logo['explanation']=(logo['explanation']+' '+doubt).strip()[:1000];logo['checked_by_brandora']=doubt
    return out

GENERIC_LOGO_WORDS={'approved','logo','reference','mark','wordmark','primary','official','brand','version','new','old','full','colour','color','the','and'}
def ink_box(image):
    """Bounding box of the pixels that differ clearly from the image's border colour: the logo without its margin."""
    rgb=image.convert('RGB');W,H=rgb.size
    if W<4 or H<4:return None
    px=rgb.load();edge=[px[x,0] for x in range(W)]+[px[x,H-1] for x in range(W)]+[px[0,y] for y in range(H)]+[px[W-1,y] for y in range(H)]
    bg=tuple(sorted(c[i] for c in edge)[len(edge)//2] for i in range(3))
    mask=Image.eval(ImageChops.difference(rgb,Image.new('RGB',rgb.size,bg)).convert('L'),lambda v:255 if v>48 else 0)
    return mask.getbbox()
def near_miss(word,target):
    """True when a word is one or two edits from a target name but not the name itself ("Inkbloom" for "Inkloom")."""
    a,b=word.lower(),target.lower()
    if a==b or min(len(a),len(b))<5 or abs(len(a)-len(b))>2:return False
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        prev,row[0]=row[0],i
        for j,y in enumerate(b,1):prev,row[j]=row[j],min(row[j]+1,row[j-1]+1,prev+(x!=y))
    return row[-1]<=2
def logo_doubts(image_bytes,box,ref,regions):
    """Why an AI "match" needs a person: the measured proportions differ from the reference, or the text read inside the logo
    is a near-miss of the approved name. '' when neither applies or nothing can be measured."""
    reasons=[]
    with Image.open(io.BytesIO(image_bytes)) as creative, Image.open(io.BytesIO(ref['blob'])) as reference:
        W,H=creative.size;y0,x0,y1,x1=box
        crop=creative.crop((round(x0*W/1000),round(y0*H/1000),round(x1*W/1000),round(y1*H/1000)))
        a,b=ink_box(crop),ink_box(reference)
        if a and b and a[3]>a[1] and b[3]>b[1]:
            ratio=((a[2]-a[0])/(a[3]-a[1]))/((b[2]-b[0])/(b[3]-b[1]))
            if not 0.75<=ratio<=1.33:reasons.append(f'Brandora measured the logo at {ratio:.2f} times the width-to-height ratio of the approved reference, so it may be stretched or squashed.')
    names=[w for w in re.findall(r'[A-Za-z]{5,}',ref.get('name','')) if w.lower() not in GENERIC_LOGO_WORDS]
    inside=[r['text'] for r in regions if r['box'][0]<box[2] and box[0]<r['box'][2] and r['box'][1]<box[3] and box[1]<r['box'][3]]
    for word in re.findall(r'[A-Za-z]{5,}',' '.join(inside)):
        name=next((n for n in names if near_miss(word,n)),None)
        if name:reasons.append(f'The wordmark reads “{word}”; the approved name is “{name}”.');break
    return ' '.join(reasons)

def extract_document(blob,mime):
    result=ai.generate('Extract text in reading order, preserving exact wording and numbers. Do not summarize or infer missing text. Mark page breaks as [Page N]. Put unreadable or uncertain areas in warnings. Return empty text if there is no readable text. For PDF return an empty regions list; page-relative region boxes are not supported. This is a transcription to be reviewed, not approved evidence.',{},OCRResult,[('Document for transcription',mime,blob)])
    valid_boxes(result.regions)
    if not result.text.strip():raise ai.ProviderError('No readable text was found.')
    return result.model_dump()

def translate(text,target,terms):
    if target not in LANGUAGES:raise ValueError('Select a supported language.')
    if '__BRANDORA_KEEP_' in text:raise ValueError('Reserved translation marker in text.')
    fragments=[re.escape(t) for t in sorted(set(terms),key=len,reverse=True) if t]
    pattern='|'.join(fragments+[r'https?://[^\s]+',r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',r'(?:[₹$€£]\s*)?\d+(?:[.,]\d+)*(?:\s?%|\s*/\s*(?:month|year))?'])
    keep={}
    def protect(match):
        key=f'__BRANDORA_KEEP_{len(keep)}__';keep[key]=match.group();return key
    protected=re.sub(pattern,protect,text,flags=re.I)
    result=ai.generate('Translate the supplied text into the requested language naturally. Preserve every __BRANDORA_KEEP_N__ marker verbatim, exactly once, without altering or adding claims. Back-translate that translation to English, also preserving all markers. Do not embellish or add numeric values. List ambiguity and cultural/tone concerns in warnings. Return a review draft only.',{'text':protected,'target_language':LANGUAGES[target]},TranslationResult)
    for key,value in keep.items():
        if result.translated_text.count(key)!=1 or result.back_translation.count(key)!=1:raise ai.ProviderError('Protected facts changed during translation. No translation was accepted; try a shorter draft.')
        result.translated_text=result.translated_text.replace(key,value);result.back_translation=result.back_translation.replace(key,value)
    for value in (result.translated_text,result.back_translation):
        if '__BRANDORA_KEEP_' in value or Counter(re.findall(r'\d+(?:[.,]\d+)*',value))!=Counter(re.findall(r'\d+(?:[.,]\d+)*',text)):
            raise ai.ProviderError('Numeric facts changed during translation. No translation was accepted.')
    return {**result.model_dump(),'target_language':target,'protected_terms':list(dict.fromkeys(keep.values())),'requires_human_review':True}

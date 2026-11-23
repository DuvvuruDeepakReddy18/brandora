"""Private, expiring judge sandboxes for the fictional Inkloom AI company. No owner account or shared demo credential."""
import base64, io, os, secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select, delete
from .models import *

ENABLED=os.getenv('BRANDORA_EXPLORE_DEMO','1')=='1'
HOURS=2
AI_LIMIT=30
AI_GLOBAL_LIMIT=int(os.getenv('BRANDORA_DEMO_AI_GLOBAL_LIMIT','200'))
ROLES=('creator','reviewer','manager','partner')
COOKIE='brandora_demo_session'
MODE='brandora_demo_mode'
COMPANY='Inkloom AI'
AD_TITLE='Spring launch ad · employee upload'

def visit_for_org(db,org_id):
    return db.scalar(select(DemoVisit).where(DemoVisit.org_id==org_id))

def font(size):return ImageFont.load_default(size=size)

def write(draw,xy,text,size,fill,bold=False):
    """Draw one line and return its pixel box. The bundled font lacks ₹, so the rupee sign is drawn as strokes."""
    f=font(size);x,y=xy;x0=None;top=bottom=None
    for i,part in enumerate(text.split('₹')):
        if i:
            l,t,r,b=draw.textbbox((x,y),'R',font=f);h=b-t;w=round(h*.62);s=max(2,round(h*.1))
            draw.line((x,t+s/2,x+w,t+s/2),fill=fill,width=s);draw.line((x,t+h*.3,x+w,t+h*.3),fill=fill,width=s)
            draw.arc((x-w*.55,t+s/2,x+w*.62,t+h*.58),-90,90,fill=fill,width=s)
            draw.line((x+w*.05,t+h*.58,x,t+h*.58),fill=fill,width=s);draw.line((x,t+h*.58,x+w*.78,b),fill=fill,width=s+1)
            x0=x if x0 is None else x0;top=t if top is None else min(top,t);bottom=b if bottom is None else max(bottom,b);x+=w+round(size*.12)
        if part:
            l,t,r,b=draw.textbbox((x,y),part,font=f)
            draw.text((x,y),part,font=f,fill=fill,stroke_width=1 if bold else 0,stroke_fill=fill)
            x0=l if x0 is None else x0;top=t if top is None else min(top,t);bottom=b if bottom is None else max(bottom,b);x=r
    return (x0,top,x,bottom)

def approved_logo():
    logo=Image.new('RGB',(460,120),'white');d=ImageDraw.Draw(logo)
    d.rounded_rectangle((14,16,102,104),22,fill='#5b3df5')
    d.ellipse((40,44,76,84),fill='white');d.polygon([(58,26),(41,58),(75,58)],fill='white')
    write(d,(122,34),COMPANY,44,'#17133a',bold=True)
    return logo

def outdated_logo():
    """The wrong treatment in the employee upload: an old orange mark, horizontally stretched."""
    mark=Image.new('RGB',(300,96),'#fff8ee');d=ImageDraw.Draw(mark)
    d.ellipse((6,10,82,86),fill='#ff6a13');write(d,(22,28),'ik',34,'white',bold=True)
    write(d,(96,26),'inkloom',40,'#ff6a13',bold=True)
    return mark.resize((420,96))

def draw_ad(corrected=False):
    """The fictional employee advertisement (or its corrected sample), with the exact pixel box of every text line."""
    W,H=1200,900;ad=Image.new('RGB',(W,H),'#fff8ee');d=ImageDraw.Draw(ad)
    d.rectangle((760,0,W,H),fill='#ece7ff' if corrected else '#ffe7d1')
    accent,soft,line='#7a62f7' if corrected else '#ffb27a','#e3dcff' if corrected else '#f6dcc4','#d9d0ff' if corrected else '#f3cfae'
    for i,(y,h) in enumerate([(210,150),(390,120),(540,170)]):
        d.rounded_rectangle((800,y,1140,y+h),18,fill='#ffffff',outline=line,width=2)
        d.rounded_rectangle((830,y+28,830+150+i*40,y+46),9,fill=accent);d.rounded_rectangle((830,y+64,1100,y+78),7,fill=soft)
    if corrected:
        logo=approved_logo().resize((368,96));logo_box=(60,48,60+368,48+96)
    else:
        logo=outdated_logo();logo_box=(60,48,60+420,48+96)
    ad.paste(logo,logo_box[:2])
    d.rounded_rectangle((842,66,1140,112),23,fill='#17133a');write(d,(866,76),'SPRING LAUNCH 2026',22,'white')
    copy=[("The central workspace",(64,200),64,True),('for campaign content.',(64,284),64,True),('Organise your creative workflows in one place.',(66,420),34,False),('Enjoy a 14-day free trial.',(86,520),34,True),('Get our Professional plan for ₹1,999 per month + GST.',(66,622),29,False),('Start free today',(100,726),32,True)] if corrected else [("The world's No. 1",(64,200),76,True),('creative platform.',(64,292),76,True),('Reduce your marketing production time by 80%.',(66,420),34,False),('Enjoy a 30-day free trial.',(86,520),34,True),('Get our Professional plan for ₹1,499 per month.',(66,620),34,False),('Start free today',(100,726),32,True)]
    d.rounded_rectangle((60,500,560,576),20,fill='#e3dcff' if corrected else '#ffd9b8')
    d.rounded_rectangle((60,706,370,782),38,fill='#5b3df5' if corrected else '#d9530b')
    lines=[]
    for i,(text,xy,size,bold) in enumerate(copy):
        colour='white' if i==5 else ('#17133a' if bold else '#3a3358')
        lines.append(write(d,xy,text,size,colour,bold=bold))
    write(d,(1000,846),'inkloom.ai',22,'#5f574e')
    def norm(box,pad=6):
        x0,y0,x1,y1=box;return [max(0,round((y0-pad)*1000/H)),max(0,round((x0-pad)*1000/W)),min(1000,round((y1+pad)*1000/H)),min(1000,round((x1+pad)*1000/W))]
    out=io.BytesIO();ad.save(out,format='PNG')
    return out.getvalue(),[{'text':t[0],'box':norm(b)} for t,b in zip(copy,lines)],norm(logo_box,4)

@lru_cache(maxsize=1)
def sample_ad():
    return draw_ad(False)

def text_pdf(lines):
    """A small text-layer PDF (Helvetica, WinAnsi). Its text extracts on the server without AI."""
    def esc(t):return t.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
    y=740;ops=[]
    for size,bold,text in lines:
        ops.append(f'BT /{"F2" if bold else "F1"} {size} Tf 64 {y} Td ({esc(text)}) Tj ET');y-=int(size*1.9)
    stream='\n'.join(ops).encode('latin-1')
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
        b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']
    out=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):
        offsets.append(len(out));out+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(out)
    out+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()+b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out+=f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return out

def pdf_document(pages,size=(612,792)):
    """A multi-page PDF with filled boxes and coloured text (Helvetica, WinAnsi). Built by hand: no PDF library."""
    def esc(t):return t.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
    def rgb(h):return ' '.join(f'{int(h[i:i+2],16)/255:.3f}' for i in (1,3,5))
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',None,b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']
    kids=[]
    for ops in pages:
        stream=[]
        for op in ops:
            if op[0]=='rect':
                _,x,y,w,h,colour=op;stream.append(f'{rgb(colour)} rg {x} {y} {w} {h} re f')
            else:
                _,x,y,size_,bold,colour,text=op;stream.append(f'BT {rgb(colour)} rg /{"F2" if bold else "F1"} {size_} Tf {x} {y} Td ({esc(text)}) Tj ET')
        data='\n'.join(stream).encode('latin-1')
        objects.append(b'<< /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream')
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {size[0]} {size[1]}] /Contents {len(objects)} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>'.encode())
        kids.append(len(objects))
    objects[1]=f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {len(kids)} >>'.encode()
    out=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):
        offsets.append(len(out));out+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(out)
    out+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()+b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out+=f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return out

# The fictional 10-page festive brochure. Every problem in it is deliberate and listed in JUDGES.md.
INK,BODY='#17133a','#3a3358'
def _page(title,lines,extra=()):
    ops=list(extra)+[('text',64,700,22,True,INK,title)];y=650
    for size_,bold,colour,text in lines:
        ops.append(('text',64,y,size_,bold,colour,text));y-=int(size_*2.2)
    ops.append(('text',64,40,9,False,'#6b6680','Inkloom AI - Festive campaign brochure 2026'))
    return ops
def brochure_pages(corrected=False):
    """The fictional 10-page festive brochure, or its corrected edition (every finding fixed in the file)."""
    c=corrected
    return [
        [('rect',0,520,612,272,'#5b3df5'),('text',64,690,34,True,'#ffffff','Inkloom AI'),('text',64,650,16,False,'#ffffff','Festive campaign brochure 2026'),
         ('text',64,460,14,False,'#4b4470' if c else '#b8b2d9','Make every campaign shine this festive season.'),('text',64,420,11,False,BODY,'Prepared by the regional marketing team.')],
        _page('Why teams choose Inkloom AI',[(13,False,BODY,'Inkloom AI helps marketing teams organise creative workflows.'),(13,False,BODY,'Our platform gives every brand faster reviews.' if c else 'Our revolutionary platform delivers instant results for every brand.'),(13,False,BODY,'Inkloom AI provides a central workspace for campaign content.')]),
        _page('Plans for every team',[(13,False,BODY,'Starter plan: INR 999/month.' if c else 'Starter plan: INR 799/month.'),(13,False,BODY,'Professional plan: INR 1,999/month + GST.'),(13,False,BODY,'Enterprise: custom pricing for large teams.')]),
        _page('Start with a free trial',[(13,False,BODY,'Every new team gets a 14-day free trial.' if c else 'Every new team gets a 30-day free trial.'),(13,False,BODY,'No credit card is needed to begin.')]),
        _page('Trusted across India',[(13,False,BODY,'Teams across India plan their campaigns here.' if c else 'Trusted by 10,000+ marketing teams.'),(13,False,BODY,'Inkloom AI supports collaborative content review.' if c else "India's fastest creative workflow platform.")]),
        _page('Everything in one place',[(13,False,BODY,'Comments, versions and approvals stay together.')],[('rect',56,560,500,64,'#5b3df5' if c else '#ffb27a'),('text',76,584,16,True,'#ffffff','Review every asset in one place')]),
        _page('For agency partners',[(13,False,BODY,('Inkloom AI' if c else 'Ink Loom')+' for agencies: manage every client brand in one place.'),(13,False,BODY,('Use' if c else 'Utilise')+' shared templates across client campaigns.')]),
        _page('The festive offer',[(13,False,BODY,'Join the festive offer before 15 December.' if c else 'Hurry, last chance to join the festive offer!'),(13,False,BODY,'Refunds are available within 7 days of the first payment.')]),
        _page('How approval works',[(13,False,BODY,'Upload a draft, review the marked findings, fix them and request approval.'),(13,False,BODY,'Inkloom AI supports collaborative content review.')]),
        _page('Talk to us',[(13,False,BODY,'Write to the partnerships team to plan your festive campaign.'),(9 if c else 6,False,'#6b6680','Offer valid until 15 Dec 2026. Terms apply. Fictional sample brochure.')]),
    ]
BROCHURE10=brochure_pages()
BROCHURE_TITLE='Festive brochure · 10-page PDF'
DECK_TITLE='Partner sales deck · 6 slides'
DECK_FILE=os.path.join(os.path.dirname(__file__),'fixtures','inkloom-partner-deck.pptx')

@lru_cache(maxsize=1)
def sample_documents():
    """Pages and positioned lines for the two seeded documents, read through the same pipeline as uploads."""
    from . import documents
    brochure=documents.read_pdf(pdf_document(BROCHURE10))
    with open(DECK_FILE,'rb') as handle:deck=documents.read_pptx(handle.read())
    return {'brochure':brochure,'deck':deck}

@lru_cache(maxsize=64)
def fixture_colours(key,index):
    from . import documents
    image=fixture_page(key,index)
    return documents.measure_colours(image,page=index) if image else []

def fixture_page(key,index):
    """Seeded document pages are served from this cache, so sandboxes do not store copies of the page images."""
    pages=sample_documents()[key][0]
    return pages[index]['image'] if 0<=index<len(pages) else None

BROCHURE=[(20,True,'Inkloom AI - Festive offer brochure'),(13,False,"India's fastest creative workflow platform."),(13,False,'Starter plan: now just INR 799/month.'),(13,False,'Professional plan: INR 1,999/month + GST.'),(13,False,'Every new team gets a 30-day free trial.'),(13,False,'Trusted by 10,000+ marketing teams.'),(13,False,'Inkloom AI supports collaborative content review.'),(10,False,'Prepared by the regional marketing team for the festive campaign.')]
SOCIAL='New on Inkloom AI: plan, review and approve every campaign in one place. Try it free for 30 days. Professional is only ₹1,499/month! Ink Loom is the best tool your team will ever use. #creativity #marketing'
BILLING='Inkloom AI refund and billing policy (effective 1 Nov 2026). Monthly plans are billed in advance and can be cancelled at any time. Annual plans receive a 20% discount on the monthly price. Refunds are available within 7 days of the first payment. Owner: Finance team.'

@lru_cache(maxsize=1)
def assets():
    def encode(image,format):
        out=io.BytesIO();image.save(out,format=format);return out.getvalue()
    page=Image.new('RGB',(1000,620),'white');d=ImageDraw.Draw(page)
    write(d,(60,50),'Inkloom AI · Pricing & plans policy',36,'#17133a',bold=True)
    for y,line in [(140,'Starter: ₹999/month.'),(200,'Professional: ₹1,999/month.'),(260,'Enterprise: custom pricing.'),(320,'Plan prices exclude GST.'),(380,'Free trial: 14 days from sign-up.'),(470,'Owner: Product team · effective 1 Nov 2026')]:write(d,(60,y),line,30,'#17133a')
    return {'logo.png':('image/png',encode(approved_logo(),'PNG')),'creative.png':('image/png',sample_ad()[0]),'corrected-creative.png':('image/png',draw_ad(True)[0]),
        'brochure.pdf':('application/pdf',text_pdf(BROCHURE)),'social-post.txt':('text/plain; charset=utf-8',SOCIAL.encode('utf-8')),
        'billing-policy.txt':('text/plain; charset=utf-8',BILLING.encode('utf-8')),'scanned-source.pdf':('application/pdf',encode(page,'PDF')),
        'festive-brochure-10-pages.pdf':('application/pdf',pdf_document(BROCHURE10)),
        'festive-brochure-corrected.pdf':('application/pdf',pdf_document(brochure_pages(True))),
        'partner-deck.pptx':('application/vnd.openxmlformats-officedocument.presentationml.presentation',open(DECK_FILE,'rb').read())}

PRICING='Inkloom AI plans, effective 1 Nov 2026: Starter ₹999/month. Professional ₹1,999/month. Enterprise: custom pricing. Plan prices exclude GST. Free trial: 14 days from sign-up. Refunds are available within 7 days of the first payment. Never describe a plan as free forever.'
BRAND='The approved product name is Inkloom AI. Use the approved Inkloom AI logo, the violet ink-drop mark with the dark wordmark, on every creative. Do not recolour, stretch or replace it. Approved colours: Ink violet #5B3DF5, Violet #7A62F7, Night #17133A, Slate #3A3358, Lavender #E3DCFF, Mist #ECE7FF and Paper #FFF8EE, with white and neutral greys. Do not introduce other brand colours.'
CLAIMS='Approved claims: Inkloom AI helps marketing teams organise creative workflows. Inkloom AI provides a central workspace for campaign content. Inkloom AI supports collaborative content review.'
EVIDENCE='No approved study or ranking supports “the world’s No. 1 creative platform” or “reduce your marketing production time by 80%”. Superiority and quantified performance claims need an approved study before use.'
VOICE='Inkloom AI brand voice guide: write like a calm, expert colleague. Avoid hype words such as “revolutionary”, “game-changing”, “mind-blowing” and “magic”. Avoid pressure phrases such as “act now”, “hurry” and “last chance”. Never promise “instant results” or call an offer “risk-free”. Prefer “use” to “utilise” or “leverage”, and “affordable” to “cheap”. Use at most one exclamation mark in a piece of content. In emails and social posts, do not write whole words in capitals, except acronyms such as GST and AI. Keep sentences under 30 words.'
ACCESSIBILITY='Accessibility standard (WCAG 2.2 AA, Inkloom AI edition): text needs a contrast ratio of at least 4.5:1 against its background. Large text (18 pt and above, or 14 pt bold) needs at least 3:1. Body text in documents and slides should be at least 9 pt. Every image needs alt text that describes what it shows and why it is there; file names and words like “image” or “banner” are not alt text. Text that is part of a logo is exempt from the contrast requirement.'

# One register, used by every demo workspace and by the labelled evaluation set (backend/evaluation.py).
SOURCES=[('pricing','Pricing & plans policy','Product team',PRICING),('brand','Brand identity guidelines','Brand team',BRAND),('claims','Approved claims register','Brand team',CLAIMS),
    ('evidence','Evidence library · performance & ranking claims','Marketing analytics',EVIDENCE),('voice','Brand voice guide','Brand team',VOICE),('access','Accessibility standard (WCAG 2.2 AA)','Design team',ACCESSIBILITY)]
TONE_CONFIG={'avoid':{'revolutionary':'','game-changing':'','mind-blowing':'','magic':'','act now':'start today','hurry':'','last chance':''},
    'messaging':{'instant results':'faster reviews','risk-free':''},'preferred':{'utilise':'use','leverage':'use','cheap':'affordable'},
    'max_exclamations':1,'shouting':True,'shouting_channels':['Email','Social'],'allow_caps':['GST','AI','INR','PDF','UPI'],'max_sentence_words':30,
    'cite':{'exclamations':'at most one exclamation mark','shouting':'do not write whole words in capitals','sentences':'Keep sentences under 30 words'}}
ACCESS_CONFIG={'contrast_normal':4.5,'contrast_large':3,'large_pt':18,'large_bold_pt':14,'min_pt':9,
    'cite':{'contrast':'contrast ratio of at least 4.5:1','contrast_large':'needs at least 3:1','size':'at least 9 pt','alt':'Every image needs alt text'}}
PALETTE_CONFIG={'colours':{'Ink violet':'#5B3DF5','Violet':'#7A62F7','Night':'#17133A','Slate':'#3A3358','Lavender':'#E3DCFF','Mist':'#ECE7FF','Paper':'#FFF8EE'},
    'tolerance':18,'min_share':0.012,'cite':{'palette':'Approved colours'}}
RULES=[('P01','Starter plan price','number','999','pricing',{'metric':'price','plan':'Starter'}),
    ('P02','Professional plan price','number','1999','pricing',{'metric':'price','plan':'Professional','qualifier':'GST','qualifier_review':True,'qualifier_text':'+ GST'}),
    ('F02','Free trial','number','14','pricing',{'metric':'trial'}),
    ('T01','Product name','term',COMPANY,'brand',{'variants':['Ink Loom','Ink-loom']}),
    ('R03','Substantiate ranking & performance claims','substantiation','Approved study required','evidence',{'unsupported_terms':["The world's No. 1 creative platform",'Reduce your marketing production time by 80%'],'replacements':{"The world's No. 1 creative platform":'The central workspace for campaign content','Reduce your marketing production time by 80%':'Organise your creative workflows in one place'}}),
    ('B01','No “free forever” wording','banned','free forever','pricing',{'replacement':'free for 14 days'}),
    ('Q01','Refund terms with refund mentions','required','Refunds are available within 7 days of the first payment.','pricing',{'trigger':'refund'}),
    ('V01','Brand voice: tone & messaging','tone','Brand voice guide','voice',TONE_CONFIG),
    ('A01','Accessibility: contrast, text size, alt text','accessibility','WCAG 2.2 AA','access',ACCESS_CONFIG),
    ('C01','Approved colour palette','palette','Brand palette','brand',PALETTE_CONFIG)]

def populate(db,ws):
    from .main import password_hash,run_scan,snapshot_source,audit,approve
    from . import intelligence
    users={}
    for role,name in [('manager','Maya Chen'),('creator','Alex Morgan'),('reviewer','Sam Rivera'),('partner','Jordan Lee')]:
        actor=User(org_id=ws.id,name=name,email=f'{role}-{ws.id}@demo.brandora.invalid',password=password_hash(secrets.token_urlsafe(32)),role=role)
        db.add(actor);db.flush();users[role]=actor
    campaign=Campaign(org_id=ws.id,name='Spring launch',description='Fictional Inkloom AI launch. Detect → review → fix → approve.',members=[users['partner'].id]);db.add(campaign)
    internal=Campaign(org_id=ws.id,name='Internal brand refresh',description='Visible to the internal team; not assigned to the partner.');db.add(internal);db.flush()
    review=(datetime.now(timezone.utc)+timedelta(days=90)).date().isoformat()
    sources={}
    for key,title,owner,excerpt in SOURCES:
        source=Source(org_id=ws.id,title=title,owner=owner,excerpt=excerpt,review_date=review);db.add(source);db.flush();sources[key]=source
    for code,title,kind,value,key,config in RULES:
        db.add(Rule(org_id=ws.id,source_id=sources[key].id,code=code,title=title,kind=kind,value=value,subject=COMPANY,config=config))
    db.flush()
    for source in sources.values():snapshot_source(db,source)
    logo=LogoReference(org_id=ws.id,name='Inkloom AI approved logo',image=base64.b64encode(intelligence.normalize_image(assets()['logo.png'][1],reference=True)).decode());db.add(logo);db.flush()
    # The signature sample: a wrong employee advertisement. Text findings come from the live rule engine;
    # its text positions come from the known sample layout, and its logo result is a labelled, predefined fixture.
    png,regions,logo_box=sample_ad()
    from .main import regions_to_body,new_creative
    body,placed=regions_to_body(regions)
    ad=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=campaign.id,title=AD_TITLE,channel='Advertisement',subject=COMPANY,body=body)
    db.add(ad);db.flush();db.add(ContentVersion(content_id=ad.id,version=1,body=body))
    new_creative(db,users['creator'],ad,intelligence.normalize_image(png),'inkloom-spring-ad.png','fixture',placed,
        [{'reference_id':logo.id,'name':logo.name,'result':'modified','box':logo_box,'explanation':'Predefined demo finding (no AI call): the submitted mark is the outdated orange wordmark, stretched horizontally. It does not match the approved Inkloom AI logo in Company Hub.'}],
        ['Sample layout: text positions are known from the fictional creative, not read by OCR. Use “Re-read with live AI” to analyse the same image.'],'Advertisement for Inkloom AI with a headline, offer, price and a Start free today button.')
    run_scan(db,ad,users['creator'])
    examples=[('Welcome email','Email','Welcome to Inkloom AI. Your 14-day free trial starts today. Inkloom AI helps marketing teams organise creative workflows in one shared workspace.','creator',campaign),
        ('Pricing page hero','Website','Inkloom AI Professional is ₹1,999/month + GST. Start with a 14-day free trial.','creator',campaign),
        ('Partner social post','Social','Plan your next campaign in one place. Try Inkloom AI free for 14 days.','partner',campaign)]
    for title,channel,text,role,camp in examples:
        content=Content(org_id=ws.id,author_id=users[role].id,campaign_id=camp.id,title=title,channel=channel,subject=COMPANY,body=text)
        db.add(content);db.flush();db.add(ContentVersion(content_id=content.id,version=1,body=text));run_scan(db,content,users[role])
        if title=='Welcome email':content.status='In review'
        if title=='Pricing page hero':
            content.status='In review';approve(content.id,users['reviewer'],db)
    # Two multi-page documents, read by the same PDF and PowerPoint pipeline as uploads (no AI), with page-by-page marks.
    from .documents import join_lines
    from .main import new_document
    for key,title,name,origin,channel in (('brochure',BROCHURE_TITLE,'festive-brochure-10-pages.pdf','pdf','Advertisement'),('deck',DECK_TITLE,'partner-deck.pptx','pptx','Advertisement')):
        parts=sample_documents()[key];pages,lines=parts[0],parts[1];images=parts[2] if len(parts)>2 else []
        body,placed=join_lines(lines)
        doc=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=campaign.id,title=title,channel=channel,subject=COMPANY,body=body)
        db.add(doc);db.flush();db.add(ContentVersion(content_id=doc.id,version=1,body=body))
        new_document(db,users['creator'],doc,name,origin,[{**p,'image':f'fixture:{key}:{i}'} for i,p in enumerate(pages)],placed,images)
        run_scan(db,doc,users['creator'])
    # A separate add-on demonstrates conflicting approved sources without blocking the main journey.
    for price in ('299','349'):
        source=Source(org_id=ws.id,title=f'Asset Vault price sheet ({price})',owner='Product team',excerpt=f'Inkloom Asset Vault costs ₹{price}/month.');db.add(source);db.flush()
        db.add(Rule(org_id=ws.id,source_id=source.id,code='AV'+price,title='Asset Vault add-on price',kind='number',value=price,subject='Inkloom Asset Vault',config={'metric':'price'}));db.flush();snapshot_source(db,source)
    conflict=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=internal.id,title='Asset Vault add-on page',channel='Website',subject='Inkloom Asset Vault',body='Inkloom Asset Vault costs ₹299/month.');db.add(conflict);db.flush();db.add(ContentVersion(content_id=conflict.id,version=1,body=conflict.body));run_scan(db,conflict,users['creator'])
    seed_history(db,ws,users)
    audit(db,users['manager'],'Created isolated judge demo',COMPANY,{'fictional':True})
    # Keep seeded receipts honest: AI is opt-in, and enabling it invalidates prior scans.
    return {role:actor.id for role,actor in users.items()}

# Eight weeks of fictional review history, produced by running the real rule engine on fictional drafts and
# recording fictional reviewer decisions. It powers Guideline insights; every record is labelled fictional.
GST_REASON='The email footer carries the GST note for every price, so the body copy does not need it.'
HISTORY=[
    # (days ago, channel, campaign, team, text, decision per rule code, reason)
    *[(d,'Email','Diwali offers','Internal team',t,{'P02':'Verified by reviewer'},GST_REASON) for d,t in [
        (54,'Upgrade to Professional for ₹1,999/month and unlock unlimited reviews.'),(50,'Professional is ₹1,999/month with every feature included.'),
        (46,'Move your team to Professional at ₹1,999/month this Diwali.'),(41,'Professional: ₹1,999/month, billed monthly.'),
        (35,'Your Professional plan renews at ₹1,999/month.'),(29,'Unlock approvals on Professional for ₹1,999/month.'),
        (22,'Professional costs ₹1,999/month and includes partner seats.'),(15,'Switch to Professional (₹1,999/month) for unlimited campaigns.'),
        (9,'Professional, ₹1,999/month: every review tool in one plan.')]],
    (4,'Email','Diwali offers','Internal team','Professional at ₹1,999/month is ready when you are.',{},''),
    *[(d,ch,camp,team,t,{'P02':'Confirmed'},'Ads and public pages must show + GST next to the price.') for d,ch,camp,team,t in [
        (52,'Advertisement','Diwali offers','Internal team','Professional: ₹1,999/month.'),(43,'Website','Spring launch','Internal team','Go Professional for ₹1,999/month.'),
        (31,'Social','Partner launch kit','Partner agencies','Professional is ₹1,999/month for agencies.'),(19,'Advertisement','Spring launch','Internal team','Professional plan ₹1,999/month.'),
        (8,'Website','Spring launch','Internal team','Professional costs ₹1,999/month.')]],
    (3,'Advertisement','Spring launch','Internal team','Professional, now ₹1,999/month.',{},''),
    *[(d,ch,camp,team,t,{'F02':'Confirmed'},'The approved free trial is 14 days.') for d,ch,camp,team,t in [
        (55,'Email','Diwali offers','Internal team','Start your 30-day free trial this Diwali.'),(38,'Social','Partner launch kit','Partner agencies','Try Inkloom AI free for 30 days.'),
        (27,'Social','Partner launch kit','Partner agencies','Get 30 days free when you sign up today.'),(21,'Social','Partner launch kit','Partner agencies','Free for 30 days: plan your next campaign.'),
        (16,'Social','Partner launch kit','Partner agencies','Enjoy a 30-day free trial of Inkloom AI.'),(12,'Advertisement','Partner launch kit','Partner agencies','30-day free trial for new agencies.'),
        (6,'Social','Partner launch kit','Partner agencies','Sign up for a 30-day free trial.'),(2,'Email','Spring launch','Internal team','Your 21-day free trial starts now.')]],
    *[(d,'Social','Partner launch kit','Partner agencies',t,{'T01':'Confirmed'},'The approved product name is Inkloom AI.') for d,t in [
        (33,'Ink Loom keeps every client brand in one place.'),(24,'Plan, review and approve with Ink Loom.'),(13,'Agencies love Ink Loom shared boards.'),(5,'Ink-loom makes approvals simple.')]],
    *[(d,'Website','Diwali offers','Internal team',t,{'P01':'Confirmed'},'The approved Starter price is ₹999/month.') for d,t in [
        (48,'Starter from ₹799/month this festive season.'),(36,'Starter plan: ₹799/month.'),(11,'Starter is just ₹899/month.')]],
    *[(d,'Email','Diwali offers','Internal team',t,{'V01':'Confirmed'},'Pressure wording is off-brand.') for d,t in [
        (40,'Hurry, the festive offer ends soon.'),(26,'Last chance to claim festive pricing.'),(14,'Hurry and book your onboarding call.')]],
    *[(d,'Website','Spring launch','Internal team',t,{'REVIEW':review},reason) for d,t,review,reason in [
        (45,'Trusted by 10,000+ marketing teams.','Verified by reviewer','Customer count confirmed by Finance in the October 2026 board report.'),
        (34,'Trusted by 10,000+ marketing teams across India.','Verified by reviewer','Customer count confirmed by Finance in the October 2026 board report.'),
        (23,'Join 10,000+ marketing teams on Inkloom AI.','Verified by reviewer','Customer count confirmed by Finance in the October 2026 board report.'),
        (10,'Trusted by 10,000+ teams.','Verified by reviewer','Customer count confirmed by Finance in the October 2026 board report.'),
        (7,'The best review tool for marketing teams.','Confirmed','“Best” has no approved support.')]],
]

def seed_history(db,ws,users):
    from .engine import scan
    rules=list(db.scalars(select(Rule).where(Rule.org_id==ws.id)));sources={s.id:s for s in db.scalars(select(Source).where(Source.org_id==ws.id))}
    started=datetime.now(timezone.utc)
    for days,channel,campaign,team,text,decisions,reason in HISTORY:
        created=(started-timedelta(days=days,hours=(days*7)%11)).isoformat()
        for f in scan(text,COMPANY,channel,rules,sources)[0]:
            review=decisions.get(f['rule_code'],'')
            db.add(FindingEvent(org_id=ws.id,content_id='',version=1,finding_id=f['id'],rule_id=f['rule_id'],rule_code=f['rule_code'],outcome=f['outcome'],title=f['title'],span=f['span'][:500],
                content_title=f'{campaign} · {channel.lower()} draft (fictional history)',channel=channel,subject=COMPANY,campaign=campaign,team=team,body=text,
                review=review,review_reason=reason if review else '',review_by='Reviewer (fictional)' if review else '',fictional=1,created=created))

def remove_visit(db,visit):
    """Only records owned by a server-created demo visit are eligible for cleanup."""
    org_id=visit.org_id
    if db.get(DemoVisit,visit.id) is not visit:raise ValueError('Demo cleanup requires a persisted visit.')
    content_ids=list(db.scalars(select(Content.id).where(Content.org_id==org_id)))
    source_ids=list(db.scalars(select(Source.id).where(Source.org_id==org_id)))
    user_ids=list(db.scalars(select(User.id).where(User.org_id==org_id)))
    db.execute(delete(LoginSession).where(LoginSession.user_id.in_(user_ids)))
    db.execute(delete(Dependency).where(Dependency.content_id.in_(content_ids)))
    db.execute(delete(ContentVersion).where(ContentVersion.content_id.in_(content_ids)))
    db.execute(delete(SourceVersion).where(SourceVersion.source_id.in_(source_ids)))
    for cls in (ApiKey,CreativePage,FindingEvent,RuleProposal,Creative,Translation,Approval,Task,Decision,Content,Rule,Source,LogoReference,Campaign,Audit,User):db.execute(delete(cls).where(cls.org_id==org_id))
    db.delete(visit);db.flush();db.execute(delete(Workspace).where(Workspace.id==org_id))
    # Keep quota counters until their normal daily boundary, so reset cannot bypass caps.

def cleanup_expired(db):
    visits=list(db.scalars(select(DemoVisit).where(DemoVisit.expires<now()).limit(5)))
    for visit in visits:
        # Match normal mutations' lock order; skip an in-flight sandbox reset.
        workspace=db.scalar(select(Workspace).where(Workspace.id==visit.org_id).with_for_update(skip_locked=True))
        if workspace:remove_visit(db,visit)

"""Opt-in live verification using synthetic, non-confidential fixtures only."""
import io,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image,ImageDraw,ImageFont
from backend import ai,intelligence

def fixtures():
    try:font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',38)
    except OSError:font=ImageFont.load_default(size=38)
    logo=Image.new('RGB',(400,120),'white');d=ImageDraw.Draw(logo);d.rounded_rectangle((8,20,78,90),14,fill='#174f47');d.text((95,35),'HarborDesk',font=font,fill='#152b43')
    creative=Image.new('RGB',(1000,600),'#f4f7f4');creative.paste(logo,(60,50));d=ImageDraw.Draw(creative)
    d.text((65,230),'A clearer workday',font=font,fill='#152b43');d.text((65,310),'Try it free for 14 days.',font=font,fill='#152b43');d.text((65,390),'INR 499/month, billed annually.',font=font,fill='#152b43')
    def blob(image):out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
    return blob(logo),blob(creative)

if __name__=='__main__':
    reference,creative=fixtures();result={'provider':ai.provider(),'model':ai.model(),'synthetic_only':True}
    vision=intelligence.inspect_visual(creative,[{'id':'fixture-logo','name':'HarborDesk synthetic reference','blob':reference}])
    assert '14' in vision['ocr']['text'] and '499' in vision['ocr']['text'],vision
    assert vision['logos'][0]['reference_id']=='fixture-logo' and vision['logos'][0]['result']=='match',vision
    result['ocr_and_logo']=vision
    translated=intelligence.translate('HarborDesk costs INR 499/month, billed annually. Try it free for 14 days.','hi',['HarborDesk'])
    assert 'HarborDesk' in translated['translated_text'] and '499' in translated['translated_text'] and '14' in translated['translated_text']
    result['translation']=translated
    pdf=io.BytesIO();Image.open(io.BytesIO(creative)).convert('RGB').save(pdf,format='PDF')
    ocr=intelligence.extract_document(pdf.getvalue(),'application/pdf')
    assert '499' in ocr['text'] and '14' in ocr['text']
    result['scanned_pdf_ocr']=ocr
    from types import SimpleNamespace
    rule=SimpleNamespace(id='tone-rule',code='TONE',value='obviously',source_id='tone-source',active=1,subject='HarborDesk',config={})
    source=SimpleNamespace(id='tone-source',title='Fictional voice guide',version=1,status='approved',review_date='',owner='Test brand owner',excerpt='Use supportive, respectful language. Avoid the word obviously and a dismissive tone.')
    findings,coverage,hidden=ai.semantic('Obviously, you should already know how to use HarborDesk.','HarborDesk','Social',[rule],{'tone-source':source})
    assert not coverage.startswith('AI incomplete:'),coverage
    assert all(f['evidence']['source_id']=='tone-source' and f['outcome']=='Low Confidence' for f in findings)
    result['semantic_review']={'coverage':coverage,'findings':findings,'hidden':hidden}
    path=Path(__file__).resolve().parents[1]/'docs'/'provider-verification.json';path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'provider':ai.provider(),'model':ai.model(),'ocr':'passed','logo_match':'passed','translation':'passed','scanned_pdf':'passed','semantic_review':'passed','report':str(path)}))

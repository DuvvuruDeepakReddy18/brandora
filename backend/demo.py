"""Private, expiring judge sandboxes for the fictional Inkloom AI company. No owner account or shared demo credential."""
import base64, io, os, secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select, delete
from .models import *

ENABLED=os.getenv('BRANDORA_EXPLORE_DEMO','1')=='1'
HOURS=2
AI_LIMIT=12
AI_GLOBAL_LIMIT=int(os.getenv('BRANDORA_DEMO_AI_GLOBAL_LIMIT','80'))
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
    d.rounded_rectangle((60,706,370,782),38,fill='#5b3df5' if corrected else '#ff6a13')
    lines=[]
    for i,(text,xy,size,bold) in enumerate(copy):
        colour='white' if i==5 else ('#17133a' if bold else '#3a3358')
        lines.append(write(d,xy,text,size,colour,bold=bold))
    write(d,(1000,846),'inkloom.ai',22,'#8a7f73')
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
        'billing-policy.txt':('text/plain; charset=utf-8',BILLING.encode('utf-8')),'scanned-source.pdf':('application/pdf',encode(page,'PDF'))}

PRICING='Inkloom AI plans, effective 1 Nov 2026: Starter ₹999/month. Professional ₹1,999/month. Enterprise: custom pricing. Plan prices exclude GST. Free trial: 14 days from sign-up.'
BRAND='The approved product name is Inkloom AI. Use the approved Inkloom AI logo, the violet ink-drop mark with the dark wordmark, on every creative. Do not recolour, stretch or replace it.'
CLAIMS='Approved claims: Inkloom AI helps marketing teams organise creative workflows. Inkloom AI provides a central workspace for campaign content. Inkloom AI supports collaborative content review.'
EVIDENCE='No approved study or ranking supports “the world’s No. 1 creative platform” or “reduce your marketing production time by 80%”. Superiority and quantified performance claims need an approved study before use.'

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
    for key,title,owner,excerpt in [('pricing','Pricing & plans policy','Product team',PRICING),('brand','Brand identity guidelines','Brand team',BRAND),('claims','Approved claims register','Brand team',CLAIMS),('evidence','Evidence library · performance & ranking claims','Marketing analytics',EVIDENCE)]:
        source=Source(org_id=ws.id,title=title,owner=owner,excerpt=excerpt,review_date=review);db.add(source);db.flush();sources[key]=source
    for code,title,kind,value,key,config in [
        ('P01','Starter plan price','number','999','pricing',{'metric':'price','plan':'Starter'}),
        ('P02','Professional plan price','number','1999','pricing',{'metric':'price','plan':'Professional','qualifier':'GST','qualifier_review':True,'qualifier_text':'+ GST'}),
        ('F02','Free trial','number','14','pricing',{'metric':'trial'}),
        ('T01','Product name','term',COMPANY,'brand',{'variants':['Ink Loom','Ink-loom']}),
        ('R03','Substantiate ranking & performance claims','substantiation','Approved study required','evidence',{'unsupported_terms':["The world's No. 1 creative platform",'Reduce your marketing production time by 80%'],'replacements':{"The world's No. 1 creative platform":'The central workspace for campaign content','Reduce your marketing production time by 80%':'Organise your creative workflows in one place'}})]:
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
    # A separate add-on demonstrates conflicting approved sources without blocking the main journey.
    for price in ('299','349'):
        source=Source(org_id=ws.id,title=f'Asset Vault price sheet ({price})',owner='Product team',excerpt=f'Inkloom Asset Vault costs ₹{price}/month.');db.add(source);db.flush()
        db.add(Rule(org_id=ws.id,source_id=source.id,code='AV'+price,title='Asset Vault add-on price',kind='number',value=price,subject='Inkloom Asset Vault',config={'metric':'price'}));db.flush();snapshot_source(db,source)
    conflict=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=internal.id,title='Asset Vault add-on page',channel='Website',subject='Inkloom Asset Vault',body='Inkloom Asset Vault costs ₹299/month.');db.add(conflict);db.flush();db.add(ContentVersion(content_id=conflict.id,version=1,body=conflict.body));run_scan(db,conflict,users['creator'])
    audit(db,users['manager'],'Created isolated judge demo',COMPANY,{'fictional':True})
    # Keep seeded receipts honest: AI is opt-in, and enabling it invalidates prior scans.
    return {role:actor.id for role,actor in users.items()}

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
    for cls in (Creative,Translation,Approval,Task,Decision,Content,Rule,Source,LogoReference,Campaign,Audit,User):db.execute(delete(cls).where(cls.org_id==org_id))
    db.delete(visit);db.flush();db.execute(delete(Workspace).where(Workspace.id==org_id))
    # Keep quota counters until their normal daily boundary, so reset cannot bypass caps.

def cleanup_expired(db):
    visits=list(db.scalars(select(DemoVisit).where(DemoVisit.expires<now()).limit(5)))
    for visit in visits:
        # Match normal mutations' lock order; skip an in-flight sandbox reset.
        workspace=db.scalar(select(Workspace).where(Workspace.id==visit.org_id).with_for_update(skip_locked=True))
        if workspace:remove_visit(db,visit)

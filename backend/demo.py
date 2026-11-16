"""Private, expiring judge sandboxes. No owner account or shared demo credential."""
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

def visit_for_org(db,org_id):
    return db.scalar(select(DemoVisit).where(DemoVisit.org_id==org_id))

@lru_cache(maxsize=1)
def assets():
    font=ImageFont.load_default(size=32)
    logo=Image.new('RGB',(440,120),'white');draw=ImageDraw.Draw(logo)
    draw.rounded_rectangle((12,23,78,89),12,fill='#174f47')
    draw.text((96,38),'HarborDesk',font=font,fill='#152b43')
    creative=Image.new('RGB',(1000,600),'#f4f7f4');creative.paste(logo,(60,50));draw=ImageDraw.Draw(creative)
    for y,line in [(235,'A clearer workday'),(315,'Try it free for 14 days.'),(395,'INR 499/month, billed annually.')]:draw.text((65,y),line,font=font,fill='#152b43')
    def encode(image,format):
        out=io.BytesIO();image.save(out,format=format);return out.getvalue()
    return {'logo.png':('image/png',encode(logo,'PNG')),'creative.png':('image/png',encode(creative,'PNG')),'scanned-source.pdf':('application/pdf',encode(creative,'PDF'))}

def populate(db,ws):
    from .main import password_hash,run_scan,snapshot_source,audit,approve
    from . import intelligence, ai
    users={}
    for role,name in [('manager','Maya Chen'),('creator','Alex Morgan'),('reviewer','Sam Rivera'),('partner','Jordan Lee')]:
        actor=User(org_id=ws.id,name=name,email=f'{role}-{ws.id}@demo.brandora.invalid',password=password_hash(secrets.token_urlsafe(32)),role=role)
        db.add(actor);db.flush();users[role]=actor
    campaign=Campaign(org_id=ws.id,name='A clearer workday',description='Fictional HarborDesk launch. Correct → check → request review → approve.',members=[users['partner'].id]);db.add(campaign)
    internal=Campaign(org_id=ws.id,name='Internal brand strategy',description='Visible to the internal team; not assigned to the partner.');db.add(internal);db.flush()
    definitions=[('Pricing sheet','Product team','HarborDesk costs INR 499/month, billed annually. Free trial: 14 days from sign-up.'),('Brand voice','Brand team','The approved product name is HarborDesk. Use clear, helpful language. Avoid magical and effortless promises.'),('Evidence policy','Brand owner','Quantified guarantees require approved evidence. No approved evidence supports guarantees 80% less admin or fastest in the industry.')]
    sources=[]
    for title,owner,excerpt in definitions:
        source=Source(org_id=ws.id,title=title,owner=owner,excerpt=excerpt,review_date=(datetime.now(timezone.utc)+timedelta(days=90)).date().isoformat());db.add(source);db.flush();sources.append(source)
    for code,title,kind,value,source,config in [('F01','Annual price','number','499',sources[0],{'metric':'price','qualifier':'billed annually'}),('F02','Free trial','number','14',sources[0],{'metric':'trial'}),('T01','Product name','term','HarborDesk',sources[1],{'variants':['Harbor Desk','HarbourDesk']}),('R03','Substantiate quantified claims','substantiation','Approved evidence required',sources[2],{'unsupported_terms':['guarantees 80% less admin','fastest in the industry']})]:
        db.add(Rule(org_id=ws.id,source_id=source.id,code=code,title=title,kind=kind,value=value,subject='HarborDesk',config=config))
    db.flush()
    for source in sources:snapshot_source(db,source)
    examples=[('Launch announcement','Social','Harbor Desk guarantees 80% less admin. Try it free for 30 days. Plans start at INR 499/month.','creator'),('Welcome email','Email','Meet HarborDesk. Try it free for 14 days. Plans start at INR 499/month, billed annually.','creator'),('Approved website example','Website','HarborDesk starts at INR 499/month, billed annually. Try it free for 14 days.','creator'),('Partner social draft','Social','Discover HarborDesk. Start a free trial for 14 days.','partner')]
    for title,channel,body,role in examples:
        content=Content(org_id=ws.id,author_id=users[role].id,campaign_id=campaign.id,title=title,channel=channel,subject='HarborDesk',body=body)
        db.add(content);db.flush();db.add(ContentVersion(content_id=content.id,version=1,body=body));run_scan(db,content,users[role])
        if title=='Welcome email':content.status='In review'
        if title=='Approved website example':
            content.status='In review';approve(content.id,users['reviewer'],db)
    # A separate subject demonstrates conflicting sources without blocking the main trial.
    for price in ('99','149'):
        source=Source(org_id=ws.id,title=f'Archive add-on price {price}',owner='Demo product owner',excerpt=f'ArchivePack costs INR {price}/month, billed annually.');db.add(source);db.flush()
        db.add(Rule(org_id=ws.id,source_id=source.id,code='ARCH'+price,title='Archive add-on price',kind='number',value=price,subject='ArchivePack',config={'metric':'price','qualifier':'billed annually'}));db.flush();snapshot_source(db,source)
    conflict=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=internal.id,title='Resolve an add-on source conflict',channel='Website',subject='ArchivePack',body='ArchivePack costs INR 99/month, billed annually.');db.add(conflict);db.flush();db.add(ContentVersion(content_id=conflict.id,version=1,body=conflict.body));run_scan(db,conflict,users['creator'])
    logo=intelligence.normalize_image(assets()['logo.png'][1],reference=True)
    db.add(LogoReference(org_id=ws.id,name='HarborDesk approved demo logo',image=base64.b64encode(logo).decode()))
    audit(db,users['manager'],'Created isolated judge demo','HarborDesk',{'fictional':True})
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
    for cls in (Translation,Approval,Task,Decision,Content,Rule,Source,LogoReference,Campaign,Audit,User):db.execute(delete(cls).where(cls.org_id==org_id))
    db.delete(visit);db.flush();db.execute(delete(Workspace).where(Workspace.id==org_id))
    # Keep quota counters until their normal daily boundary, so reset cannot bypass caps.

def cleanup_expired(db):
    visits=list(db.scalars(select(DemoVisit).where(DemoVisit.expires<now()).limit(5)))
    for visit in visits:
        # Match normal mutations' lock order; skip an in-flight sandbox reset.
        workspace=db.scalar(select(Workspace).where(Workspace.id==visit.org_id).with_for_update(skip_locked=True))
        if workspace:remove_visit(db,visit)

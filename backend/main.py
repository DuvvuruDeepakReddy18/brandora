import base64, hashlib, hmac, io, json, math, os, re, secrets, threading
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, delete
from PIL import Image, UnidentifiedImageError
from .models import *
from .engine import scan, digest, current, applies, verified as verified_spans, conflict_key, amount, access, sentence_bounds, palette
from . import ai, intelligence, limits, documents, evaluation, insights, demo as judge_demo

app=FastAPI(title='Brandora API',version='1.0.0',docs_url=None if os.getenv('BRANDORA_ENV')=='production' else '/docs',redoc_url=None)
PRODUCTION=os.getenv('BRANDORA_ENV')=='production'
DEMO=os.getenv('BRANDORA_DEMO','0' if PRODUCTION else '1')=='1'
if PRODUCTION and DEMO:raise RuntimeError('Demo sign-in must be disabled in production.')
ALLOWED_ORIGINS=set(os.getenv('ALLOWED_ORIGINS','http://localhost:3200,http://127.0.0.1:3200').split(','))
write_lock=threading.Lock()
AI_DAILY_LIMIT=int(os.getenv('BRANDORA_AI_DAILY_LIMIT','30'))
AI_GLOBAL_LIMIT=int(os.getenv('BRANDORA_AI_GLOBAL_LIMIT','200'))

def fail(code,message): raise HTTPException(code,message)
def reserve_ai(db,actor,vision=False):
    ws=db.get(Workspace,actor.org_id)
    if not ws.settings.get('ai_enabled'):fail(409,'A manager must enable AI in Privacy & settings before sending material to the provider.')
    if not ai.available() or (vision and not ai.vision_available()):fail(409,'A compatible AI provider is not configured.')
    demo_visit=judge_demo.visit_for_org(db,actor.org_id)
    cap=judge_demo.AI_LIMIT if demo_visit else AI_DAILY_LIMIT
    quotas=[(f'ai:global:{limits.day()}',AI_GLOBAL_LIMIT),(f'ai:{actor.org_id}:{limits.day()}',cap)]
    if demo_visit:quotas.append((f'ai:demo-global:{limits.day()}',judge_demo.AI_GLOBAL_LIMIT))
    try:limits.reserve(quotas)
    except limits.LimitReached:fail(429,'The daily AI request limit has been reached. Try again tomorrow.')
def password_hash(password):
    salt=secrets.token_hex(16)
    return salt+':'+hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def verify_password(password,stored):
    salt,value=stored.split(':')
    return hmac.compare_digest(hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex(),value)
def row(obj,exclude=()):return {c.name:getattr(obj,c.name) for c in obj.__table__.columns if c.name not in exclude}
def audit(db,user,action,target,detail=None):db.add(Audit(org_id=user.org_id,actor=user.name,action=action,target=target,detail=detail or {}))

@app.middleware('http')
async def headers(request,call_next):
    if request.method in ('POST','PUT','PATCH','DELETE'):
        origin=request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS:return JSONResponse({'detail':'Origin is not allowed.'},403)
        if request.headers.get('sec-fetch-site')=='cross-site':return JSONResponse({'detail':'Cross-site writes are not allowed.'},403)
        try:
            if int(request.headers.get('content-length','0'))>3_500_000:return JSONResponse({'detail':'Upload limit is 3 MB.'},413)
        except ValueError:return JSONResponse({'detail':'Invalid content length.'},400)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Cache-Control']='no-store'
    response.headers['X-Frame-Options']='DENY'
    return response

def database(request:Request):
    write=request.method not in ('GET','HEAD','OPTIONS')
    if write:write_lock.acquire()
    db=Session()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback();raise
    finally:
        db.close()
        if write:write_lock.release()

def user(request:Request,db=Depends(database)):
    if request.cookies.get(judge_demo.MODE)=='demo':
        visit=db.get(DemoVisit,digest(request.cookies.get(judge_demo.COOKIE,'')))
        if not judge_demo.ENABLED or not visit or visit.expires<now():fail(401,'Demo expired. Please sign in or open a fresh Explore demo.')
        actor=db.get(User,visit.users.get(visit.active_role,''))
        if not actor or actor.org_id!=visit.org_id or actor.role!=visit.active_role:fail(401,'Demo is unavailable. Please sign in or start again.')
        if request.method not in ('GET','HEAD','OPTIONS'):
            try:limits.reserve([(f'demo:write:{visit.id}',250)])
            except limits.LimitReached:fail(429,'This demo has reached its action limit. Start a new session later.')
            db.scalar(select(Workspace).where(Workspace.id==actor.org_id).with_for_update())
        return actor
    token=request.cookies.get('brandora_session','')
    session=db.get(LoginSession,digest(token)) if token else None
    if not session or session.expires<now():fail(401,'Please sign in.')
    actor=db.get(User,session.user_id)
    if not actor:fail(401,'Account no longer exists.')
    if judge_demo.visit_for_org(db,actor.org_id):fail(401,'Demo accounts are available only through Explore demo. Please sign in with your own account.')
    # Serialize mutations per workspace across PostgreSQL processes as well.
    if request.method not in ('GET','HEAD','OPTIONS'):
        db.scalar(select(Workspace).where(Workspace.id==actor.org_id).with_for_update())
    return actor
def require(user,*roles):
    if user.role not in roles:fail(403,'Your role does not allow this action.')
def get(db,cls,id,user):
    obj=db.get(cls,id)
    if not obj or obj.org_id!=user.org_id:fail(404,'Record not found.')
    if cls is Campaign and user.role=='partner' and user.id not in obj.members:fail(404,'Campaign not found.')
    if cls is Content:
        get(db,Campaign,obj.campaign_id,user)
        if obj.status=='Deleted':fail(404,'Content was deleted.')
    return obj
def content_allowed(item,user):
    if user.role in ('creator','partner') and item.author_id!=user.id:fail(403,'Only the author or a manager can edit this draft.')
    if user.role=='reviewer':fail(403,'Reviewers can review content; editing belongs to creators and managers.')
def org_rules(db,user):return list(db.scalars(select(Rule).where(Rule.org_id==user.org_id)))
def org_sources(db,user):return {s.id:s for s in db.scalars(select(Source).where(Source.org_id==user.org_id))}
def visible_content(db,user):
    items=list(db.scalars(select(Content).where(Content.org_id==user.org_id,Content.status!='Deleted').order_by(Content.updated.desc())))
    if user.role=='partner':
        ids={c.id for c in db.scalars(select(Campaign).where(Campaign.org_id==user.org_id)) if user.id in c.members}
        items=[c for c in items if c.campaign_id in ids]
    return items
def status(db,c):
    if c.status!='Approved':return c.status
    approval=db.scalar(select(Approval).where(Approval.content_id==c.id).order_by(Approval.created.desc()))
    if not approval or approval.content_hash!=digest(c.body) or approval.version!=c.version:return 'Needs reassessment'
    for dep in db.scalars(select(Dependency).where(Dependency.content_id==c.id)):
        source=db.get(Source,dep.source_id)
        if not source or source.version!=dep.source_version or not current(source):return 'Needs reassessment'
    return 'Approved'
def snapshot_source(db,s):
    db.add(SourceVersion(source_id=s.id,version=s.version,snapshot={'source':row(s),'rules':[row(r) for r in db.scalars(select(Rule).where(Rule.source_id==s.id))]}))
def invalidate(db,user,source_id=None,subject=None,rule_id=None):
    ids={d.content_id for d in db.scalars(select(Dependency).where(Dependency.source_id==source_id))} if source_id else set()
    changed=[]
    for c in db.scalars(select(Content).where(Content.org_id==user.org_id,Content.status!='Deleted')):
        newly_applicable=False
        if rule_id and subject in ('*',c.subject):
            new_findings,new_deps=scan(c.body,c.subject,c.channel,[db.get(Rule,rule_id)],org_sources(db,user))
            newly_applicable=bool(new_findings or new_deps)
        if c.id in ids or newly_applicable:
            c.scan_revision=0
            if c.status in ('Approved','In review'):c.status='Needs reassessment'
            changed.append(c.id)
    return changed
def bump(db,user):
    ws=db.get(Workspace,user.org_id);ws.revision+=1;return ws
def current_creative(db,c):
    return db.scalar(select(Creative).where(Creative.content_id==c.id,Creative.version==c.version).order_by(Creative.created.desc()))
LOGO_TITLES={'modified':'Logo differs from the approved reference','not_found':'Approved logo not found','uncertain':'Check the logo treatment'}
def visual_findings(creative):
    out=[]
    for logo in creative.logos or []:
        if logo.get('result') not in LOGO_TITLES:continue
        outcome='Low Confidence' if logo['result']=='uncertain' else 'Visual Violation'
        out.append({'id':digest(f"visual:{creative.id}:{logo['reference_id']}:{logo['result']}")[:20],'rule_id':'','rule_code':'LOGO','outcome':outcome,'title':LOGO_TITLES[logo['result']],
            'message':logo.get('explanation',''),'suggestion':'','severity':'high' if outcome=='Visual Violation' else 'medium','start':0,'end':0,'span':'','kind':'visual','box':logo.get('box',[0,0,0,0]),
            'engine':'Demo fixture · predefined' if creative.origin=='fixture' else 'Vision AI · '+(creative.provider or 'provider'),'resolved':False,
            'evidence':{'source_id':'logo:'+logo['reference_id'],'title':'Approved logo · '+logo.get('name','reference'),'version':1,'excerpt':'Approved logo reference registered in Company Hub. The submitted mark must match it without recolouring, stretching or replacement.','owner':'Brand team','rule_value':logo.get('name',''),'logo_reference_id':logo['reference_id']}})
    return out
def reserve_semantic(db,actor):
    """Reserve the text-review request before a handler writes, so quota commits never wait on its transaction."""
    if not db.get(Workspace,actor.org_id).settings.get('ai_enabled'):return False
    try:reserve_ai(db,actor)
    except HTTPException as exc:
        if exc.status_code==429:return 'limit'
        raise
    return True
DOCUMENT_ORIGINS=('pdf','pdf-ocr','pptx')
def creative_images(creative):
    """Images whose alt text is checked: the creative itself, or each picture in a deck. PDF figures need a tagged PDF."""
    if creative.origin=='pptx':return list(creative.images or [])
    if creative.origin in DOCUMENT_ORIGINS:return []
    return [{'page':0,'box':None,'alt':creative.alt_text,'name':creative.name,'label':'This creative'}]
def team_of(db,c):
    author=db.get(User,c.author_id)
    return 'Partner agencies' if author and author.role=='partner' else 'Internal team'
def record_findings(db,c,findings):
    """Keep each finding once per exact version, with the text it was raised on, for insights and rule replays."""
    seen=set(db.scalars(select(FindingEvent.finding_id).where(FindingEvent.content_id==c.id,FindingEvent.version==c.version)))
    campaign=db.get(Campaign,c.campaign_id);team=team_of(db,c)
    for f in findings:
        if f['id'] in seen:continue
        db.add(FindingEvent(org_id=c.org_id,content_id=c.id,version=c.version,finding_id=f['id'],rule_id=f.get('rule_id',''),rule_code=f.get('rule_code',''),outcome=f['outcome'],title=f['title'],span=(f.get('span') or '')[:500],
            content_title=c.title,channel=c.channel,subject=c.subject,campaign=campaign.name if campaign else '',team=team,body=c.body))
def masked_sentence(text,start,end):
    """The sentence around a finding with the finding's own words masked: the 'position' of a judgement call."""
    a,b=sentence_bounds(text,start,end)
    return ' '.join((text[a:start]+'§'+text[end:b]).split()).casefold()
def carry_judgements(db,c,findings):
    """A reviewer's accept/reject on a judgement call (needs review, tone, accessibility) carries to a later version of
    the same content when the same rule raises the same question with the surrounding wording unchanged.
    Approval of the new version still needs an independent reviewer, and the carried decision is labelled."""
    if c.version<=1:return
    events=[e for e in db.scalars(select(FindingEvent).where(FindingEvent.content_id==c.id,FindingEvent.version<c.version,FindingEvent.review.in_(('Verified by reviewer','AI finding rejected'))).order_by(FindingEvent.version.desc())) if e.body and e.span]
    for f in findings:
        if f.get('resolved') or f['outcome'] not in DISMISSIBLE or not f.get('span') or f.get('end',0)<=f.get('start',0) or not f.get('evidence'):continue
        here=masked_sentence(c.body,f['start'],f['end'])
        for e in events:
            at=e.body.find(e.span)
            if e.rule_id!=f['rule_id'] or e.title!=f['title'] or at<0 or masked_sentence(e.body,at,at+len(e.span))!=here:continue
            reason=f'{e.review_reason} (carried over from version {e.version}: same rule, same surrounding wording)'
            f['resolved']=True;f['resolution']=reason;f['carried_from']=e.version
            f['review']={'state':e.review,'by':e.review_by or 'Reviewer','at':e.created,'reason':reason,'carried_from':e.version}
            break
AI_LIMIT_COVERAGE="AI incomplete: the daily AI request limit has been reached. Rule checks completed; retry tomorrow or have a manager turn AI off."
def run_scan(db,c,user,ai_reserved=False):
    rules=org_rules(db,user);sources=org_sources(db,user)
    findings,deps=scan(c.body,c.subject,c.channel,rules,sources)
    coverage='Rules only';hidden=0
    ws=db.get(Workspace,user.org_id)
    if ws.settings.get('ai_enabled'):
        # A reached daily limit degrades to rule checks and an explicit incomplete label instead of failing the scan.
        limited=ai_reserved=='limit'
        if not ai_reserved:
            try:reserve_ai(db,user)
            except HTTPException as exc:
                if exc.status_code!=429:raise
                limited=True
        extra,coverage,hidden=([],AI_LIMIT_COVERAGE,0) if limited else ai.semantic(c.body,c.subject,c.channel,rules,sources)
        # An AI suggestion that repeats a rule finding (same rule, overlapping text) is not shown twice.
        extra=[e for e in extra if not any(f['rule_id']==e['rule_id'] and f['start']<e['end'] and e['start']<f['end'] for f in findings)]
        # Nor does AI second-guess a value the rule engine verified against the same approved record.
        confirmed=verified_spans(c.body,c.subject,c.channel,rules,sources)
        extra=[e for e in extra if not any(v['rule_id']==e['rule_id'] and v['start']<e['end'] and e['start']<v['end'] for v in confirmed)]
        findings.extend(extra)
        for f in extra:
            ev=f['evidence']
            if not any(d['rule_id']==f['rule_id'] for d in deps):deps.append({'rule_id':f['rule_id'],'source_id':ev['source_id'],'source_version':ev['version']})
    creative=current_creative(db,c)
    visual=visual_findings(creative) if creative else []
    findings.extend(visual)
    if creative:
        measured,access_deps=access(creative.regions or [],creative_images(creative),rules,sources,c.subject,c.channel,creative.logos or [])
        colour_findings,colour_deps=palette(creative.colours or [],rules,sources,c.subject,c.channel,creative.logos or [])
        findings.extend(measured+colour_findings)
        for d in access_deps+colour_deps:
            if not any(x['rule_id']==d['rule_id'] for x in deps):deps.append(d)
    if creative:
        # Text findings carry the page their span sits on, so multi-page documents can be navigated by finding.
        for f in findings:
            if f.get('page') is None and f.get('end',0)>f.get('start',0):
                region=next((r for r in creative.regions or [] if f['start']<r['end'] and f['end']>r['start']),None)
                if region:f['page']=region.get('page',0)
    previous={f['id']:f for f in (c.findings or [])}
    for f in findings:
        # Reviewer notes stay attached to an unchanged finding across a rescan of the same version.
        p=previous.get(f['id'])
        if not p:continue
        if p.get('review_log'):f['review_log']=p['review_log']
        if (p.get('review') or {}).get('state') in ('Confirmed','Needs evidence','Escalated'):f['review']=p['review']
    carry_judgements(db,c,findings)
    db.execute(delete(Dependency).where(Dependency.content_id==c.id))
    for d in deps:db.add(Dependency(content_id=c.id,**d))
    c.findings=findings;c.scan_hash=digest(c.body);c.scan_revision=ws.revision;c.updated=now()
    if creative:creative.findings=[dict(f) for f in findings]
    c.scan_coverage=coverage+(f' · {hidden} Citation Failed hidden' if hidden else '')
    c.status='Needs changes' if findings or coverage.startswith('AI incomplete:') else 'Ready for review'
    open_tasks=list(db.scalars(select(Task).where(Task.content_id==c.id,Task.status=='Open')))
    for task in open_tasks:task.status='Superseded by rescan'
    for f in findings:
        if f['outcome']=='Evidence Gap':db.add(Task(org_id=user.org_id,content_id=c.id,title=f'Substantiate: {f["span"][:100]}',owner=f['evidence']['owner']))
    record_findings(db,c,findings)
    audit(db,user,'Scanned content',c.title,{'content_id':c.id,'version':c.version,'findings':len(findings),'visual':len(visual),'coverage':coverage,'hidden':hidden})
    return row(c)

class LoginBody(BaseModel):
    email:str=Field(max_length=200);password:str=Field(min_length=1,max_length=200)
class Signup(LoginBody):
    name:str=Field(min_length=2,max_length=80);workspace:str=Field(min_length=2,max_length=80)
    setup_token:str=Field(default='',max_length=200)
    @field_validator('password')
    @classmethod
    def strong(cls,v):
        if len(v)<12:raise ValueError('Use at least 12 characters.')
        return v
class SourceInput(BaseModel):
    title:str=Field(min_length=2,max_length=120)
    owner:str=Field(min_length=2,max_length=80)
    excerpt:str=Field(min_length=8,max_length=12000)
    review_date:str=''
    status:Literal['approved','withdrawn']='approved'
    @field_validator('review_date')
    @classmethod
    def date(cls,v):
        if v:datetime.strptime(v,'%Y-%m-%d')
        return v
class RuleInput(BaseModel):
    source_id:str;code:str=Field(min_length=1,max_length=20);title:str=Field(min_length=2,max_length=100)
    kind:Literal['term','number','required','banned','substantiation','tone','accessibility','palette']
    value:str=Field(min_length=1,max_length=300);subject:str=Field(min_length=1,max_length=80)
    config:dict=Field(default_factory=dict)
    @field_validator('config')
    @classmethod
    def bounded(cls,v):
        if len(json.dumps(v))>4000:raise ValueError('Configuration is too large.')
        for key in ('variants','unsupported_terms','channels','qualifier_channels','shouting_channels','allow_caps'):
            if key in v and (not isinstance(v[key],list) or any(not isinstance(x,str) or not x or len(x)>300 for x in v[key]) or len(v[key])>30):raise ValueError('Use a bounded list of text values.')
        for key in ('avoid','messaging','preferred','cite'):
            if key in v and (not isinstance(v[key],dict) or len(v[key])>40 or any(not isinstance(a,str) or not a or not isinstance(b,str) or len(a)>300 or len(b)>300 for a,b in v[key].items())):raise ValueError(f'{key} must map text to text.')
        for key,(low,high) in {'max_exclamations':(0,20),'max_sentence_words':(5,200),'contrast_normal':(1,21),'contrast_large':(1,21),'large_pt':(1,200),'large_bold_pt':(1,200),'min_pt':(1,72)}.items():
            if key in v and (isinstance(v[key],bool) or not isinstance(v[key],(int,float)) or not low<=v[key]<=high):raise ValueError(f'{key} must be a number from {low} to {high}.')
        if 'shouting' in v and not isinstance(v['shouting'],bool):raise ValueError('shouting must be true or false.')
        if 'colours' in v and (not isinstance(v['colours'],dict) or not 0<len(v['colours'])<=24 or any(not isinstance(n,str) or not n or len(n)>60 or not isinstance(h,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',h) for n,h in v['colours'].items())):raise ValueError('colours must map a colour name to a #RRGGBB value.')
        for key,(low,high) in {'tolerance':(1,100),'min_share':(0.001,0.5)}.items():
            if key in v and (isinstance(v[key],bool) or not isinstance(v[key],(int,float)) or not low<=v[key]<=high):raise ValueError(f'{key} must be a number from {low} to {high}.')
        for key in ('metric','qualifier','trigger','replacement','plan','qualifier_text'):
            if key in v and (not isinstance(v[key],str) or len(v[key])>300):raise ValueError('Rule conditions must be text of at most 300 characters.')
        if 'qualifier_review' in v and not isinstance(v['qualifier_review'],bool):raise ValueError('qualifier_review must be true or false.')
        if 'replacements' in v and (not isinstance(v['replacements'],dict) or len(v['replacements'])>30 or any(not isinstance(a,str) or not isinstance(b,str) or len(a)>300 or len(b)>300 for a,b in v['replacements'].items())):raise ValueError('replacements must map claim text to approved rewrites.')
        return v
class Draft(BaseModel):
    title:str=Field(min_length=2,max_length=120);body:str=Field(min_length=1,max_length=5000)
    campaign_id:str;channel:Literal['Website','Email','Social','Advertisement']='Social';subject:str=Field(min_length=1,max_length=80)
    language:str=Field(default='en',max_length=5)
    @field_validator('language')
    @classmethod
    def valid_language(cls,value):
        if value not in intelligence.LANGUAGES:raise ValueError('Unsupported language.')
        return value
class EditDraft(BaseModel):
    body:str=Field(min_length=1,max_length=5000);title:str=Field(min_length=2,max_length=120);expected_version:int
class CampaignInput(BaseModel):
    name:str=Field(min_length=2,max_length=100);description:str=Field(default='',max_length=500)
class MemberInput(BaseModel):
    name:str=Field(min_length=2,max_length=80);email:str=Field(min_length=3,max_length=200);password:str=Field(min_length=12,max_length=200)
    role:Literal['manager','creator','reviewer','partner']
class DecisionInput(BaseModel):
    finding_id:str;reason:str=Field(min_length=10,max_length=1000)
class SettingsInput(BaseModel):
    ai_enabled:bool=False
class ImpactInput(BaseModel):
    rule_id:str;value:str=Field(min_length=1,max_length=300)
class Assignment(BaseModel):
    user_id:str

def create_session(db,actor,response):
    token=secrets.token_urlsafe(40)
    db.add(LoginSession(id=digest(token),user_id=actor.id,expires=(datetime.now(timezone.utc)+timedelta(hours=8)).isoformat()))
    response.set_cookie('brandora_session',token,httponly=True,secure=PRODUCTION,samesite='lax',max_age=28800,path='/')
    response.delete_cookie(judge_demo.MODE)
    return row(actor,('password',))
@app.get('/api/health')
def health(db=Depends(database)):
    db.execute(text('SELECT 1'))
    owner_exists=db.scalar(select(User.id).where(~User.org_id.in_(select(DemoVisit.org_id))).limit(1))
    return {'status':'ok','version':'1.0.0','demo':DEMO,'explore_demo':judge_demo.ENABLED,'ai_configured':ai.available(),'provider':ai.provider() if ai.available() else None,'vision_configured':ai.vision_available(),'setup_required':PRODUCTION and not owner_exists,'production':PRODUCTION}
@app.post('/api/auth/login')
def login(data:LoginBody,request:Request,response:Response,db=Depends(database)):
    key=digest(data.email.lower().strip());bucket=int(datetime.now().timestamp())//600
    try:limits.reserve([(f'login:{key}:{bucket}',20)])
    except limits.LimitReached:fail(429,'Too many attempts. Try again in ten minutes.')
    actor=db.scalar(select(User).where(User.email==data.email.lower().strip()))
    if not actor or judge_demo.visit_for_org(db,actor.org_id) or not verify_password(data.password,actor.password):
        fail(401,'Email or password is incorrect.')
    return create_session(db,actor,response)
@app.post('/api/auth/register')
def register(data:Signup,response:Response,db=Depends(database)):
    if PRODUCTION:
        if engine.dialect.name=='postgresql':db.execute(text('SELECT pg_advisory_xact_lock(784325127)'))
        token=os.getenv('BRANDORA_SETUP_TOKEN','')
        owner_exists=db.scalar(select(User.id).where(~User.org_id.in_(select(DemoVisit.org_id))).limit(1))
        if not token or not hmac.compare_digest(data.setup_token,token) or owner_exists:fail(403,'Workspace setup is closed or the setup code is incorrect. Ask a manager for an account.')
    if '@' not in data.email or db.scalar(select(User).where(User.email==data.email.lower().strip())):fail(400,'Use an available email address.')
    ws=Workspace(name=data.workspace,settings={'ai_enabled':False});db.add(ws);db.flush()
    actor=User(org_id=ws.id,name=data.name,email=data.email.lower().strip(),password=password_hash(data.password),role='manager');db.add(actor);db.flush()
    db.add(Campaign(org_id=ws.id,name='First campaign',description='Your first review workflow.'))
    audit(db,actor,'Created workspace',ws.name);return create_session(db,actor,response)
@app.post('/api/auth/demo/{role}')
def demo(role:str,response:Response,db=Depends(database)):
    if not DEMO:fail(404,'Demo sign-in is disabled.')
    actor=db.scalar(select(User).where(User.email==f'{role}@demo.brandora.test'))
    if not actor:fail(404,'Demo account not found.')
    return create_session(db,actor,response)
@app.post('/api/auth/logout')
def logout(request:Request,response:Response,db=Depends(database)):
    if request.cookies.get(judge_demo.MODE)=='demo':
        response.delete_cookie(judge_demo.MODE);return {'ok':True}
    db.execute(delete(LoginSession).where(LoginSession.id==digest(request.cookies.get('brandora_session',''))))
    response.delete_cookie('brandora_session');return {'ok':True}

class DemoRole(BaseModel):
    role:Literal['creator','reviewer','manager','partner']

@app.post('/api/demo/start')
def demo_start(request:Request,response:Response,db=Depends(database)):
    if not judge_demo.ENABLED:fail(404,'Explore demo is unavailable.')
    token=request.cookies.get(judge_demo.COOKIE,'')
    visit=db.get(DemoVisit,digest(token)) if token else None
    if not visit or visit.expires<now():
        # Global creation limits remain authoritative even behind a proxy.
        host=request.client.host if request.client else 'unknown'
        # Vercel overwrites this header at its edge; never trust it on other hosts.
        if os.getenv('VERCEL')=='1':host=request.headers.get('x-vercel-forwarded-for',host).split(',')[0].strip()
        bucket=int(datetime.now(timezone.utc).timestamp())//3600
        try:limits.reserve([(f'demo:start:{digest(host)}:{bucket}',12),(f'demo:start:global:{limits.day()}',200)])
        except limits.LimitReached:fail(429,'Demo capacity is busy. Please try again later.')
        if engine.dialect.name=='postgresql':db.execute(text('SELECT pg_advisory_xact_lock(784325128)'))
        judge_demo.cleanup_expired(db)
        ws=Workspace(name='Inkloom AI · Judge demo',settings={'ai_enabled':False});db.add(ws);db.flush()
        users=judge_demo.populate(db,ws)
        if ai.available():
            # Live AI is on by default in demos. Samples are seeded first with rule checks, so entry stays fast.
            ws.settings={**ws.settings,'ai_enabled':True}
            audit(db,db.get(User,users['manager']),'Updated AI policy',ws.name,{'ai_enabled':True,'demo_default':True})
        token=secrets.token_urlsafe(40)
        visit=DemoVisit(id=digest(token),org_id=ws.id,users=users,active_role='creator',expires=(datetime.now(timezone.utc)+timedelta(hours=judge_demo.HOURS)).isoformat());db.add(visit);db.flush()
    response.set_cookie(judge_demo.COOKIE,token,httponly=True,secure=PRODUCTION,samesite='lax',max_age=judge_demo.HOURS*3600,path='/')
    response.set_cookie(judge_demo.MODE,'demo',httponly=True,secure=PRODUCTION,samesite='lax',max_age=judge_demo.HOURS*3600,path='/')
    return {'ok':True,'expires':visit.expires}

@app.post('/api/demo/role')
def demo_role(data:DemoRole,actor=Depends(user),db=Depends(database)):
    visit=judge_demo.visit_for_org(db,actor.org_id)
    if not visit:fail(403,'Role switching is available only in your isolated demo.')
    target=db.get(User,visit.users[data.role])
    if not target or target.org_id!=actor.org_id or target.role!=data.role:fail(409,'This demo role is unavailable.')
    visit.active_role=data.role
    return {'role':data.role}

@app.post('/api/demo/exit')
def demo_exit(response:Response):
    response.delete_cookie(judge_demo.MODE);return {'ok':True}

@app.post('/api/demo/reset')
def demo_reset(request:Request,response:Response,actor=Depends(user),db=Depends(database)):
    visit=judge_demo.visit_for_org(db,actor.org_id)
    if not visit:fail(403,'Only a demo can be reset here.')
    judge_demo.remove_visit(db,visit)
    response.delete_cookie(judge_demo.COOKIE);response.delete_cookie(judge_demo.MODE)
    return {'ok':True}

@app.get('/api/demo/assets/{name}')
def demo_asset(name:str,actor=Depends(user),db=Depends(database)):
    if not judge_demo.visit_for_org(db,actor.org_id):fail(403,'Sample files belong to Explore demo.')
    item=judge_demo.assets().get(name)
    if not item:fail(404,'Sample file not found.')
    mime,blob=item
    return Response(blob,media_type=mime,headers={'Content-Disposition':f'attachment; filename="brandora-{name}"'})

def creative_payload(db,cr):
    data=dict(row(cr,('image',)),image_url=f'/api/creatives/{cr.id}/image' if cr.image else '')
    if cr.origin in DOCUMENT_ORIGINS:
        data['pages']=[{'index':p.page,'width':p.width,'height':p.height,'image_url':f'/api/creatives/{cr.id}/pages/{p.page}/image'} for p in db.scalars(select(CreativePage).where(CreativePage.creative_id==cr.id).order_by(CreativePage.page)) if p.image]
    else:data['pages']=[{'index':0,'width':cr.width,'height':cr.height,'image_url':data['image_url']}] if cr.image else []
    return data
@app.get('/api/workspace')
def workspace(actor=Depends(user),db=Depends(database)):
    items=visible_content(db,actor);ids={c.id for c in items}
    campaigns=[c for c in db.scalars(select(Campaign).where(Campaign.org_id==actor.org_id)) if actor.role!='partner' or actor.id in c.members]
    users=list(db.scalars(select(User).where(User.org_id==actor.org_id)))
    sources=org_sources(db,actor);rules=org_rules(db,actor)
    decisions=list(db.scalars(select(Decision).where(Decision.org_id==actor.org_id)))
    visit=judge_demo.visit_for_org(db,actor.org_id)
    return {'user':row(actor,('password',)),'workspace':row(db.get(Workspace,actor.org_id)),
      'judge_demo':{'expires':visit.expires,'ai_limit':judge_demo.AI_LIMIT,'roles':judge_demo.ROLES} if visit else None,
      'demo':bool(visit) or (DEMO and actor.email.endswith('@demo.brandora.test')),'ai_configured':ai.available(),'ai_provider':ai.provider() if ai.available() else None,'vision_configured':ai.vision_available(),
      'members':[row(u,('password',)) for u in users] if actor.role=='manager' else [{'id':u.id,'name':u.name,'role':u.role} for u in users],
      'campaigns':[row(c) for c in campaigns], 'sources':[dict(row(s),current=current(s)) for s in sources.values()], 'rules':[row(r) for r in rules],
      'content':[dict(row(c),status=status(db,c),verified=verified_spans(c.body,c.subject,c.channel,rules,sources)) for c in items],
      'creatives':[creative_payload(db,cr) for cr in db.scalars(select(Creative).where(Creative.org_id==actor.org_id).order_by(Creative.created.desc())) if cr.content_id in ids],
      'approvals':[row(a) for a in db.scalars(select(Approval).where(Approval.org_id==actor.org_id).order_by(Approval.created.desc())) if a.content_id in ids],
      'dependencies':[row(d) for d in db.scalars(select(Dependency).join(Content,Content.id==Dependency.content_id).where(Content.org_id==actor.org_id)) if d.content_id in ids],
      'tasks':[row(t) for t in db.scalars(select(Task).where(Task.org_id==actor.org_id)) if t.content_id in ids],
      'decisions':[row(d) for d in decisions if d.content_id in ids],
      'activity':[row(a) for a in db.scalars(select(Audit).where(Audit.org_id==actor.org_id).order_by(Audit.created.desc()).limit(100)) if actor.role!='partner' or a.detail.get('content_id') in ids]}

@app.post('/api/campaigns')
def campaign_create(data:CampaignInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');c=Campaign(org_id=actor.org_id,**data.model_dump());db.add(c);db.flush();audit(db,actor,'Created campaign',c.name);return row(c)
@app.post('/api/campaigns/{id}/assign')
def assign(id:str,data:Assignment,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');c=get(db,Campaign,id,actor);u=get(db,User,data.user_id,actor)
    c.members=list(set(c.members+[u.id]));audit(db,actor,'Assigned campaign',c.name,{'member':u.name});return row(c)
@app.post('/api/members')
def member(data:MemberInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    if judge_demo.visit_for_org(db,actor.org_id):
        # Public demos cannot reserve or probe real account email addresses.
        data.email=f'{digest(data.email.lower().strip())[:16]}-{actor.org_id}@demo.brandora.invalid'
    if '@' not in data.email or db.scalar(select(User).where(User.email==data.email.lower().strip())):fail(400,'Use an available email address.')
    u=User(org_id=actor.org_id,name=data.name,email=data.email.lower().strip(),password=password_hash(data.password),role=data.role);db.add(u);db.flush();audit(db,actor,'Created member',u.name,{'role':u.role});return row(u,('password',))
@app.post('/api/sources')
def source_create(data:SourceInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');s=Source(org_id=actor.org_id,**data.model_dump());db.add(s);db.flush();snapshot_source(db,s);audit(db,actor,'Registered source',s.title);return row(s)
@app.put('/api/sources/{id}')
def source_edit(id:str,data:SourceInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');s=get(db,Source,id,actor)
    for k,v in data.model_dump().items():setattr(s,k,v)
    s.version+=1;bump(db,actor);affected=invalidate(db,actor,s.id);snapshot_source(db,s)
    audit(db,actor,'Published source version',s.title,{'source_id':s.id,'version':s.version,'affected':affected});return dict(row(s),affected=affected)
@app.post('/api/rules')
def rule_create(data:RuleInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');s=get(db,Source,data.source_id,actor)
    if data.kind=='number':
        try:
            if not math.isfinite(float(data.value)) or float(data.value)<0:raise ValueError()
        except ValueError:fail(422,'A numeric rule needs a numeric value.')
        if data.config.get('metric') not in ('price','trial'):fail(422,'Choose price or trial.')
    if db.scalar(select(Rule).where(Rule.org_id==actor.org_id,Rule.code==data.code)):fail(409,'Rule code already exists.')
    r=Rule(org_id=actor.org_id,**data.model_dump());db.add(r);db.flush();s.version+=1;bump(db,actor)
    invalidate(db,actor,s.id,data.subject,r.id);snapshot_source(db,s);audit(db,actor,'Approved rule',r.title);return row(r)
@app.put('/api/rules/{id}')
def rule_edit(id:str,data:RuleInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');r=get(db,Rule,id,actor);s=get(db,Source,r.source_id,actor)
    if data.source_id!=s.id:fail(422,'Create a new rule to change its source.')
    if db.scalar(select(Rule).where(Rule.org_id==actor.org_id,Rule.code==data.code,Rule.id!=id)):fail(409,'Rule code already exists.')
    if data.kind=='number':
        try:
            if not math.isfinite(float(data.value)) or float(data.value)<0:raise ValueError()
        except ValueError:fail(422,'A numeric rule needs a numeric value.')
        if data.config.get('metric') not in ('price','trial'):fail(422,'Choose price or trial.')
    old_subject=r.subject
    for k,v in data.model_dump().items():setattr(r,k,v)
    s.version+=1;bump(db,actor);affected=invalidate(db,actor,s.id)
    affected+=invalidate(db,actor,subject=r.subject,rule_id=r.id);snapshot_source(db,s)
    audit(db,actor,'Updated approved rule',r.title,{'affected':list(set(affected)),'source_id':s.id,'version':s.version});return row(r)
@app.get('/api/sources/{id}/history')
def source_history(id:str,actor=Depends(user),db=Depends(database)):
    get(db,Source,id,actor);return [row(v) for v in db.scalars(select(SourceVersion).where(SourceVersion.source_id==id).order_by(SourceVersion.version.desc()))]

@app.post('/api/content')
def content_create(data:Draft,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','creator','partner');get(db,Campaign,data.campaign_id,actor)
    c=Content(org_id=actor.org_id,author_id=actor.id,**data.model_dump());db.add(c);db.flush();db.add(ContentVersion(content_id=c.id,version=1,body=c.body));audit(db,actor,'Created content',c.title,{'content_id':c.id});return row(c)
@app.put('/api/content/{id}')
def content_edit(id:str,data:EditDraft,actor=Depends(user),db=Depends(database)):
    c=get(db,Content,id,actor);content_allowed(c,actor)
    if data.expected_version!=c.version:fail(409,'This draft changed. Reload before saving.')
    attached=current_creative(db,c)
    if attached and attached.origin in DOCUMENT_ORIGINS:fail(409,'This content is a PDF or PowerPoint file. Apply the corrections in the file and upload the revised file; Brandora re-checks it page by page.')
    c.body=data.body;c.title=data.title;c.last_editor_id=actor.id;c.version+=1;c.status='Draft';c.scan_revision=0;c.findings=[];c.language_review={};c.updated=now()
    db.add(ContentVersion(content_id=c.id,version=c.version,body=c.body));audit(db,actor,'Saved new content version',c.title,{'content_id':c.id,'version':c.version});return row(c)
@app.post('/api/content/{id}/scan')
def content_scan(id:str,actor=Depends(user),db=Depends(database)):
    c=get(db,Content,id,actor)
    if actor.role=='partner':content_allowed(c,actor)
    return run_scan(db,c,actor)
@app.post('/api/content/{id}/request-review')
def request_review(id:str,actor=Depends(user),db=Depends(database)):
    c=get(db,Content,id,actor);content_allowed(c,actor)
    if c.scan_hash!=digest(c.body) or c.scan_revision!=db.get(Workspace,actor.org_id).revision:fail(409,'Scan the current version against the latest rules first.')
    c.status='In review';audit(db,actor,'Requested review',c.title,{'content_id':c.id});return row(c)
@app.post('/api/content/{id}/resolve')
def resolve(id:str,data:DecisionInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');c=get(db,Content,id,actor)
    if actor.id in (c.author_id,c.last_editor_id):fail(403,'The author or last editor cannot resolve their own review.')
    findings=[dict(f) for f in c.findings];f=next((f for f in findings if f['id']==data.finding_id),None)
    if not f:fail(404,'Finding not found.')
    if f['outcome'] not in ('Low Confidence','Tone Issue','Accessibility'):fail(409,'Correct the content or approved source and rescan. Evidence gaps and contradictions cannot be dismissed into approval.')
    if not f.get('evidence') or f['title'] in ('Source needs review','Approved sources disagree'):
        fail(409,'Resolve the source or claim mapping in the rulebook and rescan before approving.')
    f['resolved']=True;f['resolution']=data.reason;c.findings=findings
    db.add(Decision(org_id=actor.org_id,content_id=c.id,rule_id=f['rule_id'],actor=actor.name,reason=data.reason,outcome='Human resolution'))
    audit(db,actor,'Resolved uncertain finding',c.title,{'content_id':c.id,'finding_id':f['id']});return row(c)
@app.post('/api/content/{id}/approve')
def approve(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');c=get(db,Content,id,actor)
    if actor.id in (c.author_id,c.last_editor_id):fail(403,'Self-approval is not allowed for the author or last editor. Ask another reviewer.')
    if c.status!='In review':fail(409,'The author must request review before approval.')
    ws=db.get(Workspace,actor.org_id)
    if c.scan_hash!=digest(c.body) or c.scan_revision!=ws.revision:fail(409,'The scan is stale. Rescan against current sources.')
    if c.scan_coverage.startswith('AI incomplete:'):fail(409,'AI review did not complete. Retry the scan or have a manager explicitly disable AI and rescan.')
    if (c.language!='en' or c.language_review_required) and c.language_review.get('content_hash')!=digest(c.body):fail(409,'A separate reviewer must record a language review for this exact draft.')
    if any(not f.get('resolved') for f in c.findings):fail(409,'Resolve all findings before approval. High-risk gaps need evidence or removal.')
    deps=list(db.scalars(select(Dependency).where(Dependency.content_id==c.id)))
    for dep in deps:
        s=db.get(Source,dep.source_id)
        if not current(s) or s.version!=dep.source_version:fail(409,'A source changed or expired. Rescan first.')
    approved_creative=current_creative(db,c)
    a=Approval(org_id=actor.org_id,content_id=c.id,reviewer_id=actor.id,version=c.version,content_hash=digest(c.body),snapshot={'title':c.title,'body':c.body,'alt_text':approved_creative.alt_text if approved_creative else '','pages':approved_creative.page_count if approved_creative else 0,'reviewer':actor.name,'coverage':c.scan_coverage,'language':c.language,'language_review':c.language_review,'policy_revision':ws.revision,'dependencies':[dict(row(dep),source_title=db.get(Source,dep.source_id).title,rule_value=db.get(Rule,dep.rule_id).value) for dep in deps]})
    db.add(a);db.flush();c.status='Approved';c.updated=now();audit(db,actor,'Approved exact version',c.title,{'content_id':c.id,'receipt_id':a.id,'version':c.version});return row(a)
@app.get('/api/content/{id}/history')
def content_history(id:str,actor=Depends(user),db=Depends(database)):
    get(db,Content,id,actor);return [row(v) for v in db.scalars(select(ContentVersion).where(ContentVersion.content_id==id).order_by(ContentVersion.version.desc()))]
@app.delete('/api/content/{id}')
def content_delete(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');c=get(db,Content,id,actor);c.body='';c.findings=[];c.title='Deleted content';c.status='Deleted';c.scan_hash=''
    for v in db.scalars(select(ContentVersion).where(ContentVersion.content_id==id)):v.body='[Deleted]'
    for a in db.scalars(select(Approval).where(Approval.content_id==id)):a.snapshot={**a.snapshot,'body':'[Deleted]','title':'Deleted content'}
    for t in db.scalars(select(Task).where(Task.content_id==id)):t.title='Deleted content';t.status='Closed'
    for d in db.scalars(select(Decision).where(Decision.content_id==id)):d.reason='[Deleted]'
    for t in db.scalars(select(Translation).where(Translation.org_id==actor.org_id)):
        if t.content_id==id or t.saved_content_id==id:t.result={'deleted':True}
    c.language_review={}
    for cr in db.scalars(select(Creative).where(Creative.content_id==id)):
        cr.image='';cr.regions=[];cr.findings=[];cr.alt_text='';cr.name='Deleted creative';cr.images=[]
        for page in db.scalars(select(CreativePage).where(CreativePage.creative_id==cr.id)):page.image=''
    for event in db.scalars(select(FindingEvent).where(FindingEvent.content_id==id)):event.body='';event.span='';event.content_title='Deleted content';event.review_reason=''
    for event in db.scalars(select(Audit).where(Audit.org_id==actor.org_id)):
        if event.detail.get('content_id')==id:event.target='Deleted content'
    db.execute(delete(Dependency).where(Dependency.content_id==id));audit(db,actor,'Deleted content payload',id,{'content_id':id});return {'ok':True}

@app.post('/api/impact')
def impact(data:ImpactInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');r=get(db,Rule,data.rule_id,actor)
    if r.kind=='number':
        try:
            if not math.isfinite(float(data.value)) or float(data.value)<0:raise ValueError()
        except ValueError:fail(422,'Use a numeric value.')
    # A detached copy makes the replay incapable of modifying live rule/source/approval state.
    from types import SimpleNamespace
    rules=[SimpleNamespace(**dict(row(rule),value=data.value if rule.id==r.id else rule.value)) for rule in org_rules(db,actor)]
    sources=org_sources(db,actor);results=[]
    for c in visible_content(db,actor):
        after,deps=scan(c.body,c.subject,c.channel,rules,sources,hypothetical=(r.id,))
        before,_=scan(c.body,c.subject,c.channel,org_rules(db,actor),sources)
        if any(d['rule_id']==r.id for d in deps) or after!=before:results.append({'id':c.id,'title':c.title,'channel':c.channel,'status':status(db,c),'before':len(before),'after':len(after),'findings':after})
    return {'dry_run':True,'rule':r.code,'from':r.value,'to':data.value,'affected':results,'message':'Assumes the proposed value is approved. These are projected findings, not current verdicts. Original source excerpts are retained; no sources, content or approvals were changed.'}
@app.get('/api/conflicts')
def conflicts(actor=Depends(user),db=Depends(database)):
    rules=org_rules(db,actor);sources=org_sources(db,actor);groups={}
    for r in rules:
        if r.kind=='number' and r.active and current(sources[r.source_id]):groups.setdefault(conflict_key(r),[]).append(r)
    return [{'subject':key[0],'metric':key[1],'condition':' · '.join(x for x in key[2:] if x),'rules':[dict(row(r),source=sources[r.source_id].title) for r in group]} for key,group in groups.items() if len({amount(r.value) for r in group})>1]
@app.post('/api/campaigns/{id}/compare')
def compare(id:str,actor=Depends(user),db=Depends(database)):
    get(db,Campaign,id,actor);sources=org_sources(db,actor);rules=org_rules(db,actor)
    return [{'id':c.id,'title':c.title,'channel':c.channel,'findings':scan(c.body,c.subject,c.channel,rules,sources)[0]} for c in visible_content(db,actor) if c.campaign_id==id]
@app.post('/api/tasks/{id}/close')
def close_task(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');t=get(db,Task,id,actor);c=get(db,Content,t.content_id,actor)
    if any(f['outcome']=='Evidence Gap' for f in c.findings):fail(409,'The evidence gap is still present. Update evidence or content, then rescan.')
    t.status='Closed';audit(db,actor,'Closed evidence task',t.title,{'content_id':c.id});return row(t)
@app.put('/api/settings')
def settings(data:SettingsInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    if data.ai_enabled and not ai.available():fail(409,'Configure a Gemini or Anthropic provider on the API host first.')
    ws=db.get(Workspace,actor.org_id)
    if bool(ws.settings.get('ai_enabled'))!=data.ai_enabled:
        ws.revision+=1
        for c in db.scalars(select(Content).where(Content.org_id==actor.org_id,Content.status!='Deleted')):
            c.scan_revision=0
            if c.status in ('Approved','In review'):c.status='Needs reassessment'
    ws.settings={**ws.settings,'ai_enabled':data.ai_enabled};audit(db,actor,'Updated AI policy',ws.name,{'ai_enabled':data.ai_enabled});return ws.settings
@app.get('/api/export')
def export(actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    return {**workspace(actor,db),'logos':[row(r) for r in db.scalars(select(LogoReference).where(LogoReference.org_id==actor.org_id))],'translations':[row(t) for t in db.scalars(select(Translation).where(Translation.org_id==actor.org_id))]}

class VisualInput(BaseModel):
    foreground:str=Field(pattern=r'^#[0-9a-fA-F]{6}$');background:str=Field(pattern=r'^#[0-9a-fA-F]{6}$')
    large_text:bool=False;alt_text:str=Field(default='',max_length=500)
@app.post('/api/visual/contrast')
def contrast(data:VisualInput,actor=Depends(user)):
    def lum(color):
        rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
        values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
        return sum(v*w for v,w in zip(values,[.2126,.7152,.0722]))
    a,b=sorted([lum(data.foreground),lum(data.background)]);ratio=(b+.05)/(a+.05);threshold=3 if data.large_text else 4.5
    return {'ratio':round(ratio,2),'threshold':threshold,'passes':ratio>=threshold,'alt_present':bool(data.alt_text.strip()),'coverage':'Selected colours only. Alt-text quality, reading order and full accessibility require human review.'}
@app.post('/api/visual/image')
async def image_inspect(file:UploadFile=File(...),actor=Depends(user)):
    blob=await file.read(3_000_001)
    if len(blob)>3_000_000:fail(413,'Image must be no larger than 3 MB.')
    try:
        with Image.open(io.BytesIO(blob)) as image:
            if image.format not in ('PNG','JPEG'):fail(422,'Use a PNG or JPEG image.')
            if image.width*image.height>4_000_000:fail(422,'Image must be no larger than 4 megapixels.')
            width,height=image.size;image.thumbnail((128,128));colors=image.convert('RGB').quantize(colors=6).convert('RGB').getcolors(16384)
            palette=['#%02x%02x%02x'%color for _,color in sorted(colors,reverse=True)[:6]]
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):fail(422,'This file could not be read as a safe image.')
    return {'width':width,'height':height,'palette':palette,'bytes':len(blob),'stored':False,'coverage':'Palette extracted on the API server. Use the OCR and logo comparison panel for optional AI analysis.'}

def document_text(blob,name):
    extension=name.lower().rsplit('.',1)[-1]
    try:
        if extension=='pdf':
            from pypdf import PdfReader
            doc=PdfReader(io.BytesIO(blob))
            if doc.is_encrypted:fail(422,'Upload an unencrypted document.')
            if len(doc.pages)>20:fail(422,'Import at most 20 pages at a time.')
            pages=[page.extract_text() or '' for page in doc.pages]
            if not any(p.strip() for p in pages):fail(422,'No text found. Select AI OCR to transcribe a scanned PDF.')
            text='\n\n'.join(f'[Page {i+1}]\n'+page for i,page in enumerate(pages) if page.strip())
        elif extension=='docx':
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                info=archive.getinfo('word/document.xml')
                if info.file_size>2_000_000:fail(422,'Expanded document text is too large.')
                xml=archive.read('word/document.xml')
                if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:fail(422,'Unsupported XML declarations.')
                tree=ElementTree.fromstring(xml);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                text='\n'.join(''.join(p.itertext()) for p in tree.findall('.//w:p',ns))
        elif extension in ('txt','md'):text=blob.decode('utf-8-sig')
        else:fail(422,'Use PDF, DOCX, TXT or Markdown.')
    except HTTPException:raise
    except Exception:fail(422,'The document could not be read. Try copying its approved text manually.')
    if len(text.strip())<8:fail(422,'No usable text found. Select AI OCR to transcribe a scanned document.')
    if len(text)>12000:fail(422,'Extracted text exceeds 12,000 characters. Import a shorter excerpt.')
    return text

@app.post('/api/sources/extract')
async def extract_source(file:UploadFile=File(...),actor=Depends(user)):
    require(actor,'manager')
    blob=await file.read(3_000_001)
    if len(blob)>3_000_000:fail(413,'Document must be no larger than 3 MB.')
    name=file.filename or 'Source'
    text=document_text(blob,name)
    return {'title':name.rsplit('.',1)[0][:120],'excerpt':text,'stored':False,'message':'Review extracted text before registering it as an approved source. No facts or rules have been created.'}

@app.get('/api/intelligence/status')
def intelligence_status(actor=Depends(user),db=Depends(database)):
    used=db.get(Quota,f'ai:{actor.org_id}:{limits.day()}')
    cap=judge_demo.AI_LIMIT if judge_demo.visit_for_org(db,actor.org_id) else AI_DAILY_LIMIT
    return {'provider':ai.provider(),'model':ai.model(),'configured':ai.available(),'vision_configured':ai.vision_available(),'enabled':bool(db.get(Workspace,actor.org_id).settings.get('ai_enabled')),'requests_today':used.count if used else 0,'daily_limit':cap,'languages':intelligence.LANGUAGES}

@app.get('/api/logos')
def logos(actor=Depends(user),db=Depends(database)):
    return [dict(row(r,('image',)),image_url=f'/api/logos/{r.id}/image') for r in db.scalars(select(LogoReference).where(LogoReference.org_id==actor.org_id,LogoReference.active==1))]

@app.get('/api/logos/{id}/image')
def logo_image(id:str,actor=Depends(user),db=Depends(database)):
    r=get(db,LogoReference,id,actor)
    return Response(base64.b64decode(r.image),media_type='image/jpeg')

@app.post('/api/logos')
async def logo_register(name:str=Form(min_length=2,max_length=100),file:UploadFile=File(...),actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    if len(list(db.scalars(select(LogoReference.id).where(LogoReference.org_id==actor.org_id,LogoReference.active==1))))>=12:fail(409,'At most 12 active logo references are supported. Withdraw an old reference first.')
    try:blob=intelligence.normalize_image(await file.read(3_000_001),reference=True)
    except ValueError as exc:fail(422,str(exc))
    r=LogoReference(org_id=actor.org_id,name=name,image=base64.b64encode(blob).decode());db.add(r);db.flush()
    audit(db,actor,'Registered approved logo reference',name,{'reference_id':r.id})
    return row(r,('image',))

@app.post('/api/logos/{id}/withdraw')
def logo_withdraw(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');r=get(db,LogoReference,id,actor);r.active=0
    audit(db,actor,'Withdrew logo reference',r.name,{'reference_id':id});return {'ok':True}

@app.post('/api/visual/analyze')
async def visual_analyze(file:UploadFile=File(...),reference_ids:str=Form(default='[]'),actor=Depends(user),db=Depends(database)):
    try:
        ids=json.loads(reference_ids)
        if not isinstance(ids,list) or len(ids)>3 or any(not isinstance(x,str) for x in ids) or len(set(ids))!=len(ids):raise ValueError()
    except ValueError:fail(422,'Select up to three distinct logo references.')
    refs=[]
    for id in ids:
        r=get(db,LogoReference,id,actor)
        if not r.active:fail(409,'A selected logo reference has been withdrawn.')
        refs.append({'id':r.id,'name':r.name,'blob':base64.b64decode(r.image)})
    blob=await file.read(3_000_001)
    try:blob=intelligence.normalize_image(blob)
    except ValueError as exc:fail(422,str(exc))
    reserve_ai(db,actor,vision=True)
    try:result=await run_in_threadpool(intelligence.inspect_visual,blob,refs)
    except ai.ProviderError as exc:fail(502,str(exc))
    audit(db,actor,'Ran OCR and logo review','Creative image',{'reference_ids':ids,'input_hash':hashlib.sha256(blob).hexdigest()})
    return {**result,'requires_human_review':True,'provider':ai.provider(),'model':ai.model(),'stored':False,'reference_names':{r['id']:r['name'] for r in refs}}

@app.post('/api/sources/ocr')
async def source_ocr(file:UploadFile=File(...),actor=Depends(user),db=Depends(database)):
    require(actor,'manager');blob=await file.read(3_000_001)
    if len(blob)>3_000_000:fail(413,'Use a document no larger than 3 MB.')
    extension=(file.filename or '').lower().rsplit('.',1)[-1]
    if extension=='pdf':
        from pypdf import PdfReader
        try:
            pdf=PdfReader(io.BytesIO(blob))
            if pdf.is_encrypted or len(pdf.pages)>10:fail(422,'Use an unencrypted PDF of at most ten pages.')
        except HTTPException:raise
        except Exception:fail(422,'This PDF could not be read.')
        mime='application/pdf'
    else:
        try:blob=intelligence.normalize_image(blob)
        except ValueError as exc:fail(422,str(exc))
        mime='image/jpeg'
    reserve_ai(db,actor,vision=True)
    try:result=await run_in_threadpool(intelligence.extract_document,blob,mime)
    except ai.ProviderError as exc:fail(502,str(exc))
    audit(db,actor,'Transcribed document with AI','Unapproved extraction',{'provider':ai.provider()})
    return {'title':(file.filename or 'OCR source').rsplit('.',1)[0][:120],'excerpt':result['text'],'warnings':result['warnings'],'stored':False,'message':'AI transcription: check every word and number before registering an approved source.'}

class TranslateInput(BaseModel):
    language:str=Field(min_length=2,max_length=5)
    expected_version:int=Field(ge=1)
class LanguageReviewInput(BaseModel):
    reason:str=Field(min_length=20,max_length=1000)
    expected_version:int=Field(ge=1)

@app.post('/api/content/{id}/translate')
def translate_content(id:str,data:TranslateInput,actor=Depends(user),db=Depends(database)):
    c=get(db,Content,id,actor);content_allowed(c,actor)
    if c.version!=data.expected_version:fail(409,'The source draft changed. Reload before translating.')
    if data.language not in intelligence.LANGUAGES:fail(422,'Select a supported language.')
    rules=org_rules(db,actor);sources=org_sources(db,actor)
    terms=[r.value for r in rules if r.kind=='term' and applies(r,c.subject,c.channel) and current(sources[r.source_id])]
    reserve_ai(db,actor)
    try:result=intelligence.translate(c.body,data.language,terms)
    except ValueError as exc:fail(422,str(exc))
    except ai.ProviderError as exc:fail(502,str(exc))
    t=Translation(org_id=actor.org_id,content_id=c.id,version=c.version,content_hash=digest(c.body),language=data.language,result=result);db.add(t);db.flush()
    audit(db,actor,'Generated translation for review',c.title,{'content_id':c.id,'language':data.language,'translation_id':t.id})
    return row(t)

@app.get('/api/content/{id}/translations')
def translations(id:str,actor=Depends(user),db=Depends(database)):
    get(db,Content,id,actor)
    return [row(t) for t in db.scalars(select(Translation).where(Translation.content_id==id,Translation.org_id==actor.org_id).order_by(Translation.created.desc())) if not t.result.get('deleted')]

@app.post('/api/translations/{id}/save')
def save_translation(id:str,actor=Depends(user),db=Depends(database)):
    t=get(db,Translation,id,actor);original=get(db,Content,t.content_id,actor);content_allowed(original,actor)
    if original.version!=t.version or digest(original.body)!=t.content_hash:fail(409,'The original changed. Generate a new translation from its latest version.')
    if t.saved_content_id:return row(get(db,Content,t.saved_content_id,actor))
    if t.result.get('deleted'):fail(404,'Translation was deleted.')
    c=Content(org_id=actor.org_id,campaign_id=original.campaign_id,author_id=actor.id,title=(original.title[:100]+' · '+intelligence.LANGUAGES[t.language])[:120],channel=original.channel,subject=original.subject,body=t.result['translated_text'],language=t.language,language_review_required=1)
    db.add(c);db.flush();db.add(ContentVersion(content_id=c.id,version=1,body=c.body));t.saved_content_id=c.id
    audit(db,actor,'Saved translated draft',c.title,{'content_id':c.id,'source_content_id':original.id,'translation_id':t.id});return row(c)

@app.post('/api/content/{id}/language-review')
def language_review(id:str,data:LanguageReviewInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');c=get(db,Content,id,actor)
    if actor.id in (c.author_id,c.last_editor_id):fail(403,'The author or last editor cannot review their own translation.')
    if c.version!=data.expected_version:fail(409,'The draft changed. Review its latest version.')
    c.language_review={'reviewer':actor.name,'reviewer_id':actor.id,'reason':data.reason,'content_hash':digest(c.body),'created':now()}
    audit(db,actor,'Recorded native-language review',c.title,{'content_id':id,'version':c.version});return row(c)

# --- Scan & Detect: uploaded creatives and documents become annotated, versioned content. ---
IMAGE_TYPES=('png','jpg','jpeg','webp')
DOCUMENT_TYPES=('pdf','docx','txt','md')
CHANNELS=('Website','Email','Social','Advertisement')

def logo_refs(db,actor,reference_ids):
    try:
        ids=json.loads(reference_ids or '[]')
        if not isinstance(ids,list) or len(ids)>3 or any(not isinstance(x,str) for x in ids) or len(set(ids))!=len(ids):raise ValueError()
    except ValueError:fail(422,'Select up to three distinct logo references.')
    refs=[]
    for id in ids:
        r=get(db,LogoReference,id,actor)
        if not r.active:fail(409,'A selected logo reference has been withdrawn.')
        refs.append({'id':r.id,'name':r.name,'blob':base64.b64decode(r.image)})
    return refs

def regions_to_body(regions):
    """Join OCR regions in reading order and keep each region's character range in the joined text."""
    body='';placed=[]
    for region in regions:
        text=' '.join(str(region.get('text','')).split())
        if not text:continue
        if body:body+=' '
        start=len(body);body+=text
        placed.append({'text':text,'box':list(region['box']),'start':start,'end':len(body)})
    return body,placed

async def read_creative(db,actor,blob,refs):
    """Run OCR and logo comparison. Fails loudly; nothing is saved when the provider fails."""
    reserve_ai(db,actor,vision=True)
    try:result=await run_in_threadpool(intelligence.inspect_visual,blob,refs)
    except ai.ProviderError as exc:fail(502,f'Processing failed: {exc} Nothing was saved. You can paste the text to review it manually.')
    body,regions=regions_to_body(result['ocr']['regions'])
    warnings=list(result['ocr']['warnings'])+list(result['warnings'])
    if not body.strip():
        body=' '.join(result['ocr']['text'].split());regions=[]
        if body:warnings.append('Text was read, but its location on the image was not returned. Findings are marked on the text only.')
    if not body.strip():fail(422,'No readable text was found in this image. Nothing was saved. Paste the text to review it manually.')
    if len(body)>5000:fail(422,'The readable text exceeds 5,000 characters. Split the creative and try again.')
    names={r['id']:r['name'] for r in refs}
    logos=[{**logo,'name':names.get(logo['reference_id'],'reference')} for logo in result['logos']]
    return body,regions,logos,warnings,result['suggested_alt_text']

def new_creative(db,actor,c,blob,name,origin,regions,logos,warnings,alt_text):
    with Image.open(io.BytesIO(blob)) as image:width,height=image.size
    if regions:regions=documents.measure_raster(blob,regions)
    colours=documents.measure_colours(blob)
    cr=Creative(colours=colours,org_id=actor.org_id,content_id=c.id,version=c.version,name=name[:120],image=base64.b64encode(blob).decode(),width=width,height=height,origin=origin,regions=regions,logos=logos,warnings=warnings[:12],alt_text=alt_text[:600],
        provider=f'{ai.provider()} · {ai.model()}' if origin=='ai' else 'Sample layout data',sha256=hashlib.sha256(blob).hexdigest(),created_by=actor.name)
    db.add(cr);db.flush();return cr

DOCUMENT_NOTES={'pdf':'Pages rendered from the PDF. Text positions, sizes and colours come from the file; backgrounds are sampled from the rendered page.',
    'pdf-ocr':'Scanned PDF: each page was read with AI OCR. Text positions are AI estimates; contrast is sampled from the page image.',
    'pptx':'Slides drawn by Brandora from the deck file (text boxes, fills and pictures). Fonts and effects are approximated; text colours, fills and sizes come from the file.'}
def page_colours(page,index):
    image=page['image']
    if isinstance(image,str) and image.startswith('fixture:'):
        _,key,i=image.split(':');return judge_demo.fixture_colours(key,int(i))
    return documents.measure_colours(base64.b64decode(image) if isinstance(image,str) else image,page=index)
def new_document(db,actor,c,name,origin,pages,regions,images):
    """A multi-page document or deck tied to one exact content version. Each page is stored and served separately."""
    first=pages[0]
    cr=Creative(org_id=actor.org_id,content_id=c.id,version=c.version,name=name[:120],image='',width=first['width'],height=first['height'],origin=origin,regions=regions,logos=[],warnings=[DOCUMENT_NOTES[origin]],
        alt_text='',provider='Rule engine · no AI' if origin!='pdf-ocr' else f'{ai.provider()} · {ai.model()}',sha256=digest(name+c.body),created_by=actor.name,page_count=len(pages),images=images,
        colours=[colour for i,page in enumerate(pages) for colour in page_colours(page,i)])
    db.add(cr);db.flush()
    for i,page in enumerate(pages):
        image=page['image'] if isinstance(page['image'],str) else base64.b64encode(page['image']).decode()
        db.add(CreativePage(org_id=actor.org_id,creative_id=cr.id,page=i,image=image,width=page['width'],height=page['height']))
    return cr

async def read_document(db,actor,blob,extension):
    """Return (origin, pages, regions, images, body) for a PDF or PowerPoint file, or None for other documents."""
    try:
        if extension=='pptx':
            pages,lines,images=await run_in_threadpool(documents.read_pptx,blob);origin='pptx'
        else:
            pages,lines=await run_in_threadpool(documents.read_pdf,blob);images=[];origin='pdf'
    except documents.DocumentError as exc:fail(422,str(exc))
    body,placed=documents.join_lines(lines)
    if not body.strip() and extension=='pdf':
        # A scanned PDF has no text layer: read each rendered page with AI OCR, then measure contrast on the pixels.
        if not db.get(Workspace,actor.org_id).settings.get('ai_enabled'):fail(422,'This PDF has no text layer. A manager can turn on AI in Trust & Audit to read scanned pages with OCR, or paste the text instead. Nothing was saved.')
        if len(pages)>5:fail(422,'Scanned PDFs are read with AI one page at a time. Upload at most 5 pages. Nothing was saved.')
        ocr=[]
        for i,page in enumerate(pages):
            reserve_ai(db,actor,vision=True)
            try:result=await run_in_threadpool(intelligence.inspect_visual,page['image'],[])
            except ai.ProviderError as error:fail(502,f'Processing failed on page {i+1}: {error} Nothing was saved.')
            lines=[{'text':r['text'],'box':list(r['box']),'page':i} for r in result['ocr']['regions'] if str(r.get('text','')).strip()]
            ocr+=documents.measure_raster(page['image'],lines)
        body,placed=documents.join_lines(ocr);origin='pdf-ocr'
    if not body.strip():fail(422,'No readable text was found in this file. Nothing was saved.')
    if len(body)>5000:fail(422,'The document text exceeds 5,000 characters. Upload a shorter section.')
    return origin,pages,placed,images,body

@app.post('/api/scan/upload')
async def scan_upload(file:UploadFile=File(...),title:str=Form(min_length=2,max_length=120),campaign_id:str=Form(...),subject:str=Form(min_length=1,max_length=80),channel:str=Form(default='Advertisement'),reference_ids:str=Form(default='[]'),actor=Depends(user),db=Depends(database)):
    require(actor,'manager','creator','partner');get(db,Campaign,campaign_id,actor)
    if channel not in CHANNELS:fail(422,'Choose a supported channel.')
    name=file.filename or 'upload';extension=name.lower().rsplit('.',1)[-1]
    blob=await file.read(3_000_001)
    if len(blob)>3_000_000:fail(413,'Use a file no larger than 3 MB.')
    document=None
    if extension in IMAGE_TYPES:
        refs=logo_refs(db,actor,reference_ids)
        try:blob=intelligence.normalize_image(blob)
        except ValueError as exc:fail(422,str(exc))
        body,regions,logos,warnings,alt_text=await read_creative(db,actor,blob,refs)
    elif extension in ('pdf','pptx'):
        document=await read_document(db,actor,blob,extension);body=document[4]
    elif extension in DOCUMENT_TYPES:
        try:text=document_text(blob,name)
        except HTTPException as exc:
            if extension!='pdf' or 'AI OCR' not in str(exc.detail):raise
            reserve_ai(db,actor,vision=True)
            try:text=(await run_in_threadpool(intelligence.extract_document,blob,'application/pdf'))['text']
            except ai.ProviderError as error:fail(502,f'Processing failed: {error} Nothing was saved.')
        body=text.strip()
        if len(body)>5000:fail(422,'The document text exceeds 5,000 characters. Upload a shorter section.')
    else:fail(422,'Use PNG, JPEG, WebP, PDF, PowerPoint (.pptx), DOCX, TXT or Markdown.')
    reserved=reserve_semantic(db,actor)
    c=Content(org_id=actor.org_id,author_id=actor.id,campaign_id=campaign_id,title=title,channel=channel,subject=subject,body=body);db.add(c);db.flush()
    db.add(ContentVersion(content_id=c.id,version=1,body=body))
    if extension in IMAGE_TYPES:new_creative(db,actor,c,blob,name,'ai',regions,logos,warnings,alt_text)
    if document:new_document(db,actor,c,name,document[0],document[1],document[2],document[3])
    audit(db,actor,'Uploaded content for scanning',c.title,{'content_id':c.id,'file':name[:120],'kind':'image' if extension in IMAGE_TYPES else ('pages' if document else 'document'),'pages':len(document[1]) if document else 1,'sha256':hashlib.sha256(blob).hexdigest()})
    return run_scan(db,c,actor,reserved)

@app.post('/api/content/{id}/creative')
async def creative_revision(id:str,expected_version:int=Form(...),reference_ids:str=Form(default='[]'),reuse:str=Form(default=''),file:UploadFile|None=File(default=None),actor=Depends(user),db=Depends(database)):
    """Upload a revised creative or document, or re-read a stored image with live AI. Each becomes a new exact version."""
    c=get(db,Content,id,actor);content_allowed(c,actor)
    if c.version!=expected_version:fail(409,'This content changed. Reload before adding a creative.')
    extension=((file.filename if file else '') or '').lower().rsplit('.',1)[-1]
    if not reuse and file and extension in ('pdf','pptx'):
        blob=await file.read(3_000_001)
        if len(blob)>3_000_000:fail(413,'Use a file no larger than 3 MB.')
        origin,pages,placed,images,body=await read_document(db,actor,blob,extension)
        reserved=reserve_semantic(db,actor)
        c.body=body;c.last_editor_id=actor.id;c.version+=1;c.status='Draft';c.scan_revision=0;c.findings=[];c.language_review={};c.updated=now()
        db.add(ContentVersion(content_id=c.id,version=c.version,body=body))
        new_document(db,actor,c,file.filename or 'document',origin,pages,placed,images)
        audit(db,actor,'Uploaded revised document',c.title,{'content_id':c.id,'version':c.version,'pages':len(pages),'sha256':hashlib.sha256(blob).hexdigest()})
        return run_scan(db,c,actor,reserved)
    if reuse:
        previous=get(db,Creative,reuse,actor)
        if previous.content_id!=c.id or not previous.image:fail(404,'Creative not found.')
        blob=base64.b64decode(previous.image);name=previous.name
    else:
        if not file:fail(422,'Choose an image.')
        name=file.filename or 'creative'
        if name.lower().rsplit('.',1)[-1] not in IMAGE_TYPES:fail(422,'Use a PNG, JPEG or WebP image, or a PDF or PowerPoint file.')
        try:blob=intelligence.normalize_image(await file.read(3_000_001))
        except ValueError as exc:fail(422,str(exc))
    refs=logo_refs(db,actor,reference_ids)
    body,regions,logos,warnings,alt_text=await read_creative(db,actor,blob,refs)
    reserved=reserve_semantic(db,actor)
    c.body=body;c.last_editor_id=actor.id;c.version+=1;c.status='Draft';c.scan_revision=0;c.findings=[];c.language_review={};c.updated=now()
    db.add(ContentVersion(content_id=c.id,version=c.version,body=body))
    new_creative(db,actor,c,blob,name,'ai',regions,logos,warnings,alt_text)
    audit(db,actor,'Re-read creative with AI' if reuse else 'Uploaded creative revision',c.title,{'content_id':c.id,'version':c.version})
    return run_scan(db,c,actor,reserved)

@app.get('/api/creatives/{id}/image')
def creative_image(id:str,actor=Depends(user),db=Depends(database)):
    cr=get(db,Creative,id,actor);get(db,Content,cr.content_id,actor)
    if not cr.image:fail(404,'This creative was deleted.')
    return Response(base64.b64decode(cr.image),media_type='image/jpeg')

@app.get('/api/creatives/{id}/pages/{page}/image')
def creative_page_image(id:str,page:int,actor=Depends(user),db=Depends(database)):
    cr=get(db,Creative,id,actor);get(db,Content,cr.content_id,actor)
    p=db.scalar(select(CreativePage).where(CreativePage.creative_id==cr.id,CreativePage.page==page))
    if not p or not p.image:fail(404,'This page is not available.')
    if p.image.startswith('fixture:'):
        _,key,index=p.image.split(':');blob=judge_demo.fixture_page(key,int(index))
        if blob is None:fail(404,'This page is not available.')
    else:blob=base64.b64decode(p.image)
    return Response(blob,media_type='image/jpeg',headers={'Cache-Control':'private, max-age=3600'})

class AltTextInput(BaseModel):
    alt_text:str=Field(default='',max_length=600);expected_version:int=Field(ge=1)
@app.put('/api/creatives/{id}/alt-text')
def creative_alt_text(id:str,data:AltTextInput,actor=Depends(user),db=Depends(database)):
    """Alt text is part of the deliverable: changing it ends any approval and re-checks the exact version."""
    cr=get(db,Creative,id,actor);c=get(db,Content,cr.content_id,actor);content_allowed(c,actor)
    if c.version!=data.expected_version or cr.version!=c.version:fail(409,'This content changed. Reload before editing alt text.')
    if cr.origin in DOCUMENT_ORIGINS:fail(422,'Alt text for pictures in a document is set in the file itself. Update the file and upload it again.')
    reserved=reserve_semantic(db,actor)
    cr.alt_text=' '.join(data.alt_text.split());c.last_editor_id=actor.id;c.status='Draft';c.updated=now()
    audit(db,actor,'Updated alt text',c.title,{'content_id':c.id,'version':c.version,'alt_text':cr.alt_text[:200]})
    return run_scan(db,c,actor,reserved)

class FindingDecision(BaseModel):
    action:Literal['confirm','verify','reject','request_evidence','escalate','comment']
    reason:str=Field(min_length=3,max_length=1000)
DISMISSIBLE=('Low Confidence','Tone Issue','Accessibility')
REVIEW_STATES={'confirm':'Confirmed','verify':'Verified by reviewer','reject':'AI finding rejected','request_evidence':'Needs evidence','escalate':'Escalated'}
REVIEW_ACTIONS={'confirm':'Confirmed finding','verify':'Marked finding verified','reject':'Rejected AI finding','request_evidence':'Requested evidence','escalate':'Escalated finding','comment':'Commented on finding'}

@app.post('/api/content/{id}/findings/{finding_id}/decision')
def finding_decision(id:str,finding_id:str,data:FindingDecision,actor=Depends(user),db=Depends(database)):
    c=get(db,Content,id,actor)
    findings=[dict(f) for f in c.findings];f=next((x for x in findings if x['id']==finding_id),None)
    if not f:fail(404,'Finding not found. Rescan and try again.')
    if data.action!='comment':
        require(actor,'manager','reviewer')
        if actor.id in (c.author_id,c.last_editor_id):fail(403,'The author or last editor cannot decide on their own content. Ask another reviewer.')
    if data.action in ('verify','reject'):
        if f.get('resolved'):fail(409,'This finding already has a recorded resolution.')
        if f['outcome'] not in DISMISSIBLE:fail(409,'Confirmed contradictions, evidence gaps and visual violations come from approved records. Correct the content, or update the approved record in Company Hub, then rescan.')
        if not f.get('evidence') or f['title'] in ('Source needs review','Approved sources disagree'):fail(409,'This claim has no approved mapping. Map it in Company Hub or remove it, then rescan.')
        if len(data.reason.strip())<10:fail(422,'Record a reason of at least 10 characters.')
        f['resolved']=True;f['resolution']=data.reason
    entry={'action':data.action,'by':actor.name,'role':actor.role,'reason':data.reason,'at':now()}
    f['review_log']=list(f.get('review_log') or [])+[entry]
    if data.action in REVIEW_STATES:f['review']={'state':REVIEW_STATES[data.action],'by':actor.name,'at':entry['at'],'reason':data.reason}
    label=(f['span'] or f['title'])[:90]
    if data.action=='request_evidence':db.add(Task(org_id=actor.org_id,content_id=c.id,title=f'Evidence requested: {label}',owner=(f.get('evidence') or {}).get('owner','Evidence owner')))
    if data.action=='escalate':db.add(Task(org_id=actor.org_id,content_id=c.id,title=f'Compliance review: {label}',owner='Compliance reviewer'))
    c.findings=findings
    creative=current_creative(db,c)
    if creative:creative.findings=[dict(x) for x in findings]
    if data.action in REVIEW_STATES:
        for event in db.scalars(select(FindingEvent).where(FindingEvent.content_id==c.id,FindingEvent.version==c.version,FindingEvent.finding_id==f['id'])):
            event.review=REVIEW_STATES[data.action];event.review_reason=data.reason[:500];event.review_by=actor.name
    db.add(Decision(org_id=actor.org_id,content_id=c.id,rule_id=f.get('rule_id') or f.get('rule_code',''),actor=actor.name,reason=data.reason,outcome=REVIEW_STATES.get(data.action,'Comment')))
    audit(db,actor,REVIEW_ACTIONS[data.action],c.title,{'content_id':c.id,'finding_id':f['id'],'version':c.version,'reason':data.reason[:200]})
    return row(c)

# --- Measured reliability, guideline insights and clarified rules ---
@app.get('/api/reliability')
def reliability(actor=Depends(user)):
    """The labelled evaluation, re-run by the same engine the product uses (and by CI on every push)."""
    return evaluation.evaluate()

def history(db,actor):
    return list(db.scalars(select(FindingEvent).where(FindingEvent.org_id==actor.org_id).order_by(FindingEvent.created)))

def proposal_row(db,p):
    rule=db.get(Rule,p.rule_id)
    return dict(row(p),rule_code=rule.code if rule else '',rule_title=rule.title if rule else '',current_value=rule.value if rule else '',current_config=rule.config if rule else {},
        stale=p.status in ('Draft','Replayed') and bool(p.replay) and rule is not None and p.replay.get('rule_hash')!=insights.rule_hash(rule))

@app.get('/api/insights')
def insights_view(actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer')
    events=history(db,actor);rules=org_rules(db,actor)
    proposals=[proposal_row(db,p) for p in db.scalars(select(RuleProposal).where(RuleProposal.org_id==actor.org_id).order_by(RuleProposal.created.desc()))]
    decided=sum(bool(e.review) for e in events)
    return {**insights.build(events,rules),'proposals':proposals,
        'summary':{'findings':len(events),'decisions':decided,'fictional':sum(e.fictional for e in events),'since':events[0].created if events else None,'content':len({(e.content_id or e.content_title,e.version) for e in events})}}

@app.get('/api/insights/tips')
def insights_tips(actor=Depends(user),db=Depends(database)):
    return insights.tips(history(db,actor),org_rules(db,actor))

class ProposalInput(BaseModel):
    rule_id:str;rationale:str=Field(min_length=10,max_length=1000)
    value:str=Field(default='',max_length=300);config:dict=Field(default_factory=dict)

@app.post('/api/rule-proposals')
def proposal_create(data:ProposalInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');r=get(db,Rule,data.rule_id,actor)
    try:checked=RuleInput(source_id=r.source_id,code=r.code,title=r.title,kind=r.kind,value=data.value or r.value,subject=r.subject,config=data.config)
    except ValueError as exc:fail(422,f'The clarified rule is not valid: {exc}')
    if checked.value==r.value and checked.config==(r.config or {}):fail(422,'The clarified rule is identical to the current rule.')
    p=RuleProposal(org_id=actor.org_id,rule_id=r.id,proposer_id=actor.id,proposer=actor.name,rationale=data.rationale,value=checked.value,config=checked.config,base_hash=insights.rule_hash(r))
    db.add(p);db.flush();audit(db,actor,'Proposed rule clarification',r.title,{'proposal_id':p.id,'rule':r.code,'rationale':data.rationale[:200]})
    return proposal_row(db,p)

@app.post('/api/rule-proposals/{id}/replay')
def proposal_replay(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager','reviewer');p=get(db,RuleProposal,id,actor)
    if p.status not in ('Draft','Replayed'):fail(409,'This proposal was already decided.')
    r=get(db,Rule,p.rule_id,actor)
    result=insights.replay(history(db,actor),r,p.value,p.config,org_sources(db,actor),visible_content(db,actor))
    p.replay=result;p.status='Replayed'
    audit(db,actor,'Replayed rule clarification on history',r.title,{'proposal_id':p.id,'decided':result['decided'],'agreement_before':result['agreement_before'],'agreement_after':result['agreement_after'],'confirmed_missed':result['confirmed_missed']})
    return proposal_row(db,p)

class ProposalDecision(BaseModel):
    note:str=Field(min_length=10,max_length=1000)

@app.post('/api/rule-proposals/{id}/apply')
def proposal_apply(id:str,data:ProposalDecision,actor=Depends(user),db=Depends(database)):
    """Only a manager who did not propose it can apply a clarified rule, and only after a current replay."""
    require(actor,'manager');p=get(db,RuleProposal,id,actor)
    if p.status!='Replayed':fail(409,'Replay the clarified rule on history before applying it.')
    if p.proposer_id==actor.id:fail(403,'A different manager must approve a rule clarification you proposed.')
    r=get(db,Rule,p.rule_id,actor);s=get(db,Source,r.source_id,actor)
    if p.replay.get('rule_hash')!=insights.rule_hash(r):fail(409,'The rule changed after this replay. Replay it again first.')
    before={'value':r.value,'config':r.config}
    r.value=p.value;r.config=p.config;s.version+=1;bump(db,actor)
    affected=invalidate(db,actor,s.id)+invalidate(db,actor,subject=r.subject,rule_id=r.id);snapshot_source(db,s)
    p.status='Applied';p.decided_by=actor.name;p.decision_note=data.note;p.decided=now()
    p.replay={**p.replay,'previous_value':before['value'],'previous_config':before['config']}
    audit(db,actor,'Applied clarified rule',r.title,{'proposal_id':p.id,'rule':r.code,'before':before,'after':{'value':r.value,'config':r.config},'proposer':p.proposer,'approver':actor.name,'note':data.note[:300],
        'replay':{k:p.replay.get(k) for k in ('decided','agreement_before','agreement_after','confirmed_missed','overrides_removed')},'source_version':s.version,'affected':list(set(affected))})
    return proposal_row(db,p)

@app.post('/api/rule-proposals/{id}/discard')
def proposal_discard(id:str,data:ProposalDecision,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');p=get(db,RuleProposal,id,actor)
    if p.status in ('Applied','Discarded'):fail(409,'This proposal was already decided.')
    p.status='Discarded';p.decided_by=actor.name;p.decision_note=data.note;p.decided=now()
    audit(db,actor,'Discarded rule clarification',db.get(Rule,p.rule_id).title,{'proposal_id':p.id,'note':data.note[:300]})
    return proposal_row(db,p)

# --- Check-before-publish API: a CMS, webhook or CI step asks before anything goes live ---
API_KEY_LIMIT=5
class ApiKeyInput(BaseModel):
    name:str=Field(min_length=2,max_length=60)

@app.get('/api/api-keys')
def api_keys(actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    return [row(k,('key_hash',)) for k in db.scalars(select(ApiKey).where(ApiKey.org_id==actor.org_id).order_by(ApiKey.created.desc()))]

@app.post('/api/api-keys')
def api_key_create(data:ApiKeyInput,actor=Depends(user),db=Depends(database)):
    require(actor,'manager')
    active=len(list(db.scalars(select(ApiKey.id).where(ApiKey.org_id==actor.org_id,ApiKey.revoked==0))))
    if active>=(2 if judge_demo.visit_for_org(db,actor.org_id) else API_KEY_LIMIT):fail(409,'Revoke an existing key before creating another.')
    token='brk_'+secrets.token_urlsafe(32)
    k=ApiKey(org_id=actor.org_id,name=data.name,prefix=token[:10],key_hash=digest(token),created_by=actor.id,creator=actor.name);db.add(k);db.flush()
    audit(db,actor,'Created API key',data.name,{'key_id':k.id,'prefix':k.prefix})
    return {**row(k,('key_hash',)),'key':token,'message':'Copy this key now. Brandora stores only a hash and cannot show it again.'}

@app.post('/api/api-keys/{id}/revoke')
def api_key_revoke(id:str,actor=Depends(user),db=Depends(database)):
    require(actor,'manager');k=get(db,ApiKey,id,actor);k.revoked=1
    audit(db,actor,'Revoked API key',k.name,{'key_id':k.id,'prefix':k.prefix});return row(k,('key_hash',))

class CheckInput(BaseModel):
    text:str=Field(min_length=1,max_length=5000)
    channel:Literal['Website','Email','Social','Advertisement']='Website'
    subject:str=Field(default='',max_length=80)
    title:str=Field(default='API submission',min_length=2,max_length=120)
    submit:bool=False
    campaign_id:str=Field(default='',max_length=64)

def api_key_actor(request:Request,db):
    header=request.headers.get('authorization','')
    token=header[7:].strip() if header.lower().startswith('bearer ') else ''
    key=db.scalar(select(ApiKey).where(ApiKey.key_hash==digest(token))) if token.startswith('brk_') else None
    if not key or key.revoked:fail(401,'Send a valid, unrevoked API key as "Authorization: Bearer brk_...".')
    if not db.get(Workspace,key.org_id):fail(401,'This key belongs to a workspace that no longer exists.')
    demo_key=bool(judge_demo.visit_for_org(db,key.org_id))
    try:limits.reserve([(f'api:{key.id}:{int(datetime.now(timezone.utc).timestamp())//60}',30 if demo_key else 120),(f'api:{key.id}:{limits.day()}',200 if demo_key else 5000)])
    except limits.LimitReached:fail(429,'This API key has reached its rate limit. Try again shortly.')
    owner=db.get(User,key.created_by)
    if not owner or owner.org_id!=key.org_id:fail(401,'The manager who created this key no longer exists. Create a new key.')
    key.uses+=1;key.last_used=now()
    return key,owner

API_BLOCKING=('Verified Contradiction','Evidence Gap','Visual Violation')
@app.post('/api/v1/check')
def api_check(data:CheckInput,request:Request,db=Depends(database)):
    """Rules-only check of copy before it is published. It never sends text to an AI provider, never approves and never publishes."""
    key,owner=api_key_actor(request,db)
    rules=org_rules(db,owner);sources=org_sources(db,owner)
    subject=data.subject or (Counter(r.subject for r in rules if r.subject!='*').most_common(1) or [[db.get(Workspace,owner.org_id).name]])[0][0]
    findings,deps=scan(data.text,subject,data.channel,rules,sources)
    confirmed=verified_spans(data.text,subject,data.channel,rules,sources)
    verdict='blocked' if any(f['outcome'] in API_BLOCKING for f in findings) else ('needs_review' if findings else 'clear')
    ws=db.get(Workspace,owner.org_id)
    out={'verdict':verdict,
        'summary':{'blocked':'Do not publish: at least one statement contradicts an approved record or lacks approved evidence.','needs_review':'A person should review the flagged items before publishing.','clear':'No issues in the checked rules. A person must still approve before publishing.'}[verdict],
        'findings':[{'id':f['id'],'rule':f['rule_code'],'outcome':f['outcome'],'title':f['title'],'message':f['message'],'suggestion':f.get('suggestion',''),'span':f['span'],'start':f['start'],'end':f['end'],
            'evidence':{'source':f['evidence']['title'],'version':f['evidence']['version'],'excerpt':f['evidence']['excerpt']} if f.get('evidence') else None} for f in findings],
        'verified':[{'span':v['span'],'rule':v['rule_code'],'source':v['evidence']['title'],'version':v['evidence']['version']} for v in confirmed],
        'checked_against':{'workspace':ws.name,'subject':subject,'channel':data.channel,'policy_revision':ws.revision,'rules':len(rules),'sources':len(sources)},
        'ai_used':False,'approval':'This API never approves or publishes. Approval is a separate, human step in Brandora.'}
    if data.submit:
        campaign=get(db,Campaign,data.campaign_id,owner) if data.campaign_id else db.scalar(select(Campaign).where(Campaign.org_id==owner.org_id).order_by(Campaign.name))
        if not campaign:fail(422,'Create a campaign before submitting drafts through the API.')
        c=Content(org_id=owner.org_id,author_id=owner.id,campaign_id=campaign.id,title=data.title,channel=data.channel,subject=subject,body=data.text);db.add(c);db.flush()
        db.add(ContentVersion(content_id=c.id,version=1,body=c.body))
        audit(db,owner,'Submitted draft through the API',c.title,{'content_id':c.id,'key':key.name,'prefix':key.prefix})
        run_scan(db,c,owner)
        out['submitted']={'content_id':c.id,'title':c.title,'campaign':campaign.name,'status':c.status,'next':'The draft is in Verify & Review for a person to review and approve.'}
    audit(db,owner,'API check',key.name,{'prefix':key.prefix,'verdict':verdict,'findings':len(findings),'channel':data.channel,'submitted':bool(data.submit)})
    return out

def seed():
    if not DEMO:return
    with Session.begin() as db:
        if db.scalar(select(User).where(User.email=='manager@demo.brandora.test')):return
        ws=Workspace(name='HarborDesk',settings={'ai_enabled':False});db.add(ws);db.flush()
        users={}
        for role,name in [('manager','Maya Chen'),('creator','Alex Morgan'),('reviewer','Sam Rivera'),('partner','Jordan Lee')]:
            u=User(org_id=ws.id,name=name,email=f'{role}@demo.brandora.test',password=password_hash(secrets.token_urlsafe(30)),role=role);db.add(u);db.flush();users[role]=u
        campaign=Campaign(org_id=ws.id,name='A clearer workday',description='Fictional HarborDesk launch · English marketing content',members=[users['partner'].id]);db.add(campaign);db.flush()
        other=Campaign(org_id=ws.id,name='Customer stories',description='A separate campaign for internal creators.');db.add(other);db.flush()
        source_data=[('Pricing sheet','Product team','HarborDesk costs ₹499/month, billed annually. Free trial: 14 days from sign-up.'),('Brand voice and terminology','Brand team','The approved product name is HarborDesk. Use clear, helpful language. Avoid magical and effortless promises.'),('Claim substantiation policy','Brand team','Quantified guarantees require approved supporting evidence. The approved register has no support for “guarantees 80% less admin” or “fastest in the industry”.')]
        sources=[]
        for title,owner,excerpt in source_data:
            s=Source(org_id=ws.id,title=title,owner=owner,excerpt=excerpt,review_date=(datetime.now(timezone.utc)+timedelta(days=90)).date().isoformat());db.add(s);db.flush();sources.append(s)
        rules=[('F01','Annual price','number','499',sources[0],{'metric':'price','qualifier':'billed annually'}),('F02','Free trial','number','14',sources[0],{'metric':'trial'}),('T01','Product name','term','HarborDesk',sources[1],{'variants':['Harbor Desk','HarbourDesk']}),('R03','Substantiate quantified claims','substantiation','Approved evidence required',sources[2],{'unsupported_terms':['guarantees 80% less admin','fastest in the industry']})]
        for code,title,kind,value,s,config in rules:db.add(Rule(org_id=ws.id,source_id=s.id,code=code,title=title,kind=kind,value=value,subject='HarborDesk',config=config))
        db.flush()
        for s in sources:snapshot_source(db,s)
        for title,channel,body in [('Launch announcement','Social','Harbor Desk guarantees 80% less admin. Try it free for 30 days. Plans start at ₹499/month.'),('Welcome to your clearer workday','Email','Meet HarborDesk. Try it free for 14 days. Plans start at ₹499/month, billed annually.'),('Simple plans for focused teams','Website','HarborDesk starts at ₹499/month, billed annually. Your team can try it free for 14 days.'),('Meet the people behind the product','Social','A closer look at the people and ideas behind our new workspace.')]:
            c=Content(org_id=ws.id,author_id=users['creator'].id,campaign_id=campaign.id,title=title,channel=channel,subject='HarborDesk',body=body);db.add(c);db.flush();db.add(ContentVersion(content_id=c.id,version=1,body=c.body))
            run_scan(db,c,users['creator'])
        audit(db,users['manager'],'Created fictional demo workspace','HarborDesk',{'fixture':True})
seed()

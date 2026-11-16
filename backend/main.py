import base64, hashlib, hmac, io, json, math, os, secrets, threading
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
from .engine import scan, digest, current, applies
from . import ai, intelligence, limits

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
    try:limits.reserve([(f'ai:global:{limits.day()}',AI_GLOBAL_LIMIT),(f'ai:{actor.org_id}:{limits.day()}',AI_DAILY_LIMIT)])
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
    token=request.cookies.get('brandora_session','')
    session=db.get(LoginSession,digest(token)) if token else None
    if not session or session.expires<now():fail(401,'Please sign in.')
    actor=db.get(User,session.user_id)
    if not actor:fail(401,'Account no longer exists.')
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
def run_scan(db,c,user):
    rules=org_rules(db,user);sources=org_sources(db,user)
    findings,deps=scan(c.body,c.subject,c.channel,rules,sources)
    coverage='Rules only';hidden=0
    ws=db.get(Workspace,user.org_id)
    if ws.settings.get('ai_enabled'):
        reserve_ai(db,user)
        extra,coverage,hidden=ai.semantic(c.body,c.subject,c.channel,rules,sources)
        findings.extend(extra)
        for f in extra:
            ev=f['evidence']
            if not any(d['rule_id']==f['rule_id'] for d in deps):deps.append({'rule_id':f['rule_id'],'source_id':ev['source_id'],'source_version':ev['version']})
    db.execute(delete(Dependency).where(Dependency.content_id==c.id))
    for d in deps:db.add(Dependency(content_id=c.id,**d))
    c.findings=findings;c.scan_hash=digest(c.body);c.scan_revision=ws.revision;c.updated=now()
    c.scan_coverage=coverage+(f' · {hidden} Citation Failed hidden' if hidden else '')
    c.status='Needs changes' if findings else 'Ready for review'
    open_tasks=list(db.scalars(select(Task).where(Task.content_id==c.id,Task.status=='Open')))
    for task in open_tasks:task.status='Superseded by rescan'
    for f in findings:
        if f['outcome']=='Evidence Gap':db.add(Task(org_id=user.org_id,content_id=c.id,title=f'Substantiate: {f["span"][:100]}',owner=f['evidence']['owner']))
    audit(db,user,'Scanned content',c.title,{'content_id':c.id,'version':c.version,'findings':len(findings),'coverage':coverage,'hidden':hidden})
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
    kind:Literal['term','number','required','banned','substantiation']
    value:str=Field(min_length=1,max_length=300);subject:str=Field(min_length=1,max_length=80)
    config:dict=Field(default_factory=dict)
    @field_validator('config')
    @classmethod
    def bounded(cls,v):
        if len(json.dumps(v))>4000:raise ValueError('Configuration is too large.')
        for key in ('variants','unsupported_terms','channels'):
            if key in v and (not isinstance(v[key],list) or any(not isinstance(x,str) or not x or len(x)>300 for x in v[key]) or len(v[key])>30):raise ValueError('Use a bounded list of text values.')
        for key in ('metric','qualifier','trigger','replacement'):
            if key in v and (not isinstance(v[key],str) or len(v[key])>300):raise ValueError('Rule conditions must be text of at most 300 characters.')
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
    return row(actor,('password',))
@app.get('/api/health')
def health(db=Depends(database)):
    db.execute(text('SELECT 1'))
    return {'status':'ok','version':'1.0.0','demo':DEMO,'ai_configured':ai.available(),'provider':ai.provider() if ai.available() else None,'vision_configured':ai.vision_available(),'setup_required':PRODUCTION and not db.scalar(select(User.id).limit(1)),'production':PRODUCTION}
@app.post('/api/auth/login')
def login(data:LoginBody,request:Request,response:Response,db=Depends(database)):
    key=digest(data.email.lower().strip());bucket=int(datetime.now().timestamp())//600
    try:limits.reserve([(f'login:{key}:{bucket}',20)])
    except limits.LimitReached:fail(429,'Too many attempts. Try again in ten minutes.')
    actor=db.scalar(select(User).where(User.email==data.email.lower().strip()))
    if not actor or not verify_password(data.password,actor.password):
        fail(401,'Email or password is incorrect.')
    return create_session(db,actor,response)
@app.post('/api/auth/register')
def register(data:Signup,response:Response,db=Depends(database)):
    if PRODUCTION:
        if engine.dialect.name=='postgresql':db.execute(text('SELECT pg_advisory_xact_lock(784325127)'))
        token=os.getenv('BRANDORA_SETUP_TOKEN','')
        if not token or not hmac.compare_digest(data.setup_token,token) or db.scalar(select(User.id).limit(1)):fail(403,'Workspace setup is closed or the setup code is incorrect. Ask a manager for an account.')
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
    db.execute(delete(LoginSession).where(LoginSession.id==digest(request.cookies.get('brandora_session',''))))
    response.delete_cookie('brandora_session');return {'ok':True}

@app.get('/api/workspace')
def workspace(actor=Depends(user),db=Depends(database)):
    items=visible_content(db,actor);ids={c.id for c in items}
    campaigns=[c for c in db.scalars(select(Campaign).where(Campaign.org_id==actor.org_id)) if actor.role!='partner' or actor.id in c.members]
    users=list(db.scalars(select(User).where(User.org_id==actor.org_id)))
    sources=org_sources(db,actor);rules=org_rules(db,actor)
    decisions=list(db.scalars(select(Decision).where(Decision.org_id==actor.org_id)))
    return {'user':row(actor,('password',)),'workspace':row(db.get(Workspace,actor.org_id)),
      'demo':DEMO and actor.email.endswith('@demo.brandora.test'),'ai_configured':ai.available(),'ai_provider':ai.provider() if ai.available() else None,'vision_configured':ai.vision_available(),
      'members':[row(u,('password',)) for u in users] if actor.role=='manager' else [{'id':u.id,'name':u.name,'role':u.role} for u in users],
      'campaigns':[row(c) for c in campaigns], 'sources':[dict(row(s),current=current(s)) for s in sources.values()], 'rules':[row(r) for r in rules],
      'content':[dict(row(c),status=status(db,c)) for c in items],
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
    if f['outcome']!='Low Confidence':fail(409,'Correct the content or approved source and rescan. Evidence gaps and contradictions cannot be dismissed into approval.')
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
    a=Approval(org_id=actor.org_id,content_id=c.id,reviewer_id=actor.id,version=c.version,content_hash=digest(c.body),snapshot={'title':c.title,'body':c.body,'reviewer':actor.name,'coverage':c.scan_coverage,'language':c.language,'language_review':c.language_review,'policy_revision':ws.revision,'dependencies':[dict(row(dep),source_title=db.get(Source,dep.source_id).title,rule_value=db.get(Rule,dep.rule_id).value) for dep in deps]})
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
        if r.kind=='number' and r.active and current(sources[r.source_id]):groups.setdefault((r.subject,r.config.get('metric'),r.config.get('qualifier','')),[]).append(r)
    return [{'subject':key[0],'metric':key[1],'condition':key[2],'rules':[dict(row(r),source=sources[r.source_id].title) for r in group]} for key,group in groups.items() if len({r.value for r in group})>1]
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
    ws=db.get(Workspace,actor.org_id);ws.settings={**ws.settings,'ai_enabled':data.ai_enabled};audit(db,actor,'Updated AI policy',ws.name,{'ai_enabled':data.ai_enabled});return ws.settings
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

@app.post('/api/sources/extract')
async def extract_source(file:UploadFile=File(...),actor=Depends(user)):
    require(actor,'manager')
    blob=await file.read(3_000_001)
    if len(blob)>3_000_000:fail(413,'Document must be no larger than 3 MB.')
    name=file.filename or 'Source';extension=name.lower().rsplit('.',1)[-1]
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
    return {'title':name.rsplit('.',1)[0][:120],'excerpt':text,'stored':False,'message':'Review extracted text before registering it as an approved source. No facts or rules have been created.'}

@app.get('/api/intelligence/status')
def intelligence_status(actor=Depends(user),db=Depends(database)):
    used=db.get(Quota,f'ai:{actor.org_id}:{limits.day()}')
    return {'provider':ai.provider(),'model':ai.model(),'configured':ai.available(),'vision_configured':ai.vision_available(),'enabled':bool(db.get(Workspace,actor.org_id).settings.get('ai_enabled')),'requests_today':used.count if used else 0,'daily_limit':AI_DAILY_LIMIT,'languages':intelligence.LANGUAGES}

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

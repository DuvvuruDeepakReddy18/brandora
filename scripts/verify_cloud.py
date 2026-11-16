"""Explicit production smoke test with a temporary synthetic tenant and exact cleanup.

Uses the linked Vercel CLI's protected deployment access. The owner setup code
is never used, and no real user or local demo data is uploaded.
"""
import io,json,os,secrets,subprocess,sys
from pathlib import Path
from uuid import uuid4
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
for line in (ROOT/'.env.production.local').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1)
        if key=='DATABASE_URL':os.environ[key]=json.loads(value) if value.startswith('"') else value
os.environ['BRANDORA_ENV']='production';os.environ['BRANDORA_DEMO']='0'
from backend.models import Session,Workspace,User,Campaign,Source,SourceVersion,Rule,Content,ContentVersion,Dependency,Approval,Audit,Task,Decision,Translation,LogoReference,LoginSession,Quota,uid
from backend.main import password_hash
from sqlalchemy import select,delete
from scripts.verify_provider import fixtures
from PIL import Image
CLI=Path(os.environ['APPDATA'])/'npm/node_modules/vercel/dist/index.js'
TEAM='duvvurudeepakreddy18s-projects'
URL=sys.argv[1]
core_only='--core-only' in sys.argv[2:]
if not URL.startswith('https://brandora-') or not URL.endswith('.vercel.app'):raise SystemExit('Use the verified Brandora deployment URL.')
suffix=uuid4().hex;org_id=uid();password=secrets.token_urlsafe(24)
folder=ROOT/'.local'/('cloud-check-'+suffix);folder.mkdir(parents=True)
report={'deployment':URL,'synthetic_only':True,'core_only':core_only,'passed':False,'checks':[]}
def call(path,method='GET',body=None,role='manager',upload=None,fields=None,expected=200):
    args=['node',str(CLI),'curl',path,'--deployment',URL,'--scope',TEAM,'--','--silent','--show-error','--request',method,'--write-out','\n%{http_code}']
    if role:
        cookie=str(folder/(role+'.cookies'));args+=['--cookie',cookie,'--cookie-jar',cookie]
    if body is not None:
        payload=folder/'request.json';payload.write_text(json.dumps(body,ensure_ascii=False),encoding='utf-8');args+=['--header','Content-Type: application/json','--data-binary','@'+str(payload)]
    if upload:
        args+=['--form','file=@'+str(upload)]
        for key,value in (fields or {}).items():args+=['--form-string',key+'='+value]
    result=subprocess.run(args,cwd=ROOT,capture_output=True,encoding='utf-8',timeout=100)
    raw,_,status=result.stdout.strip().rpartition('\n')
    if result.returncode or status!=str(expected):raise RuntimeError(f'{method} {path}: expected {expected}, received {status}; response '+raw[:700])
    data=json.loads(raw) if raw else {}
    report['checks'].append({'method':method,'path':path,'status':int(status)})
    print(method,path,status,flush=True)
    return data

with Session.begin() as db:
    db.add(Workspace(id=org_id,name='Synthetic release verification '+suffix,settings={'ai_enabled':False}));db.flush()
    for role in ('manager','reviewer'):
        db.add(User(org_id=org_id,name='Synthetic '+role,email=f'{role}-{suffix}@brandora.invalid',password=password_hash(password),role=role))
try:
    assert call('/api/health',role=None)['production']
    call('/api/workspace',role=None,expected=401)
    call('/api/auth/demo/manager','POST',role=None,expected=404)
    for role in ('manager','reviewer'):call('/api/auth/login','POST',{'email':f'{role}-{suffix}@brandora.invalid','password':password},role=role)
    campaign=call('/api/campaigns','POST',{'name':'Synthetic release check'})
    source=call('/api/sources','POST',{'title':'Synthetic approved trial','owner':'Synthetic owner','excerpt':'HarborDesk offers a free trial for 14 days.','review_date':'','status':'approved'})
    call('/api/rules','POST',{'source_id':source['id'],'code':'F01','title':'Trial duration','kind':'number','value':'14','subject':'HarborDesk','config':{'metric':'trial'}})
    content=call('/api/content','POST',{'title':'Synthetic release draft','campaign_id':campaign['id'],'channel':'Social','subject':'HarborDesk','body':'Try HarborDesk free for 14 days.'})
    if not core_only:call('/api/settings','PUT',{'ai_enabled':True})
    checked=call('/api/content/'+content['id']+'/scan','POST')
    assert not checked['findings'],checked['scan_coverage']
    if not core_only:assert 'validated gemini' in checked['scan_coverage'],checked['scan_coverage']
    call('/api/content/'+content['id']+'/request-review','POST')
    receipt=call('/api/content/'+content['id']+'/approve','POST',role='reviewer');assert len(receipt['content_hash'])==64
    if not core_only:
        translated=call('/api/content/'+content['id']+'/translate','POST',{'language':'hi','expected_version':1});assert '14' in translated['result']['translated_text']
        saved=call('/api/translations/'+translated['id']+'/save','POST');assert saved['language_review_required']==1
        reference,creative=fixtures();(folder/'reference.png').write_bytes(reference);(folder/'creative.png').write_bytes(creative)
        logo=call('/api/logos','POST',upload=folder/'reference.png',fields={'name':'Synthetic HarborDesk'})
        visual=call('/api/visual/analyze','POST',upload=folder/'creative.png',fields={'reference_ids':json.dumps([logo['id']])})
        assert '499' in visual['ocr']['text'] and visual['logos'][0]['result']=='match'
        pdf=io.BytesIO();Image.open(io.BytesIO(creative)).convert('RGB').save(pdf,format='PDF');(folder/'scanned.pdf').write_bytes(pdf.getvalue())
        ocr=call('/api/sources/ocr','POST',upload=folder/'scanned.pdf');assert '499' in ocr['excerpt'] and not ocr['stored']
    state=call('/api/workspace');assert len(state['sources'])==1 and len(state['approvals'])==1
    report['ai_features']='not exercised' if core_only else {'semantic_review':'passed','translation':'passed','ocr':'passed','logo_comparison':'passed','scanned_pdf':'passed'}
    report['approval_receipt']='passed'
    report['passed']=True
except Exception as exc:
    report['error']=str(exc)
    raise
finally:
    # All deletes are limited to the exact newly-created synthetic workspace.
    with Session.begin() as db:
        ws=db.get(Workspace,org_id)
        if not ws or ws.name!='Synthetic release verification '+suffix:raise RuntimeError('Cleanup scope did not match; manual review required.')
        content_ids=list(db.scalars(select(Content.id).where(Content.org_id==org_id)))
        source_ids=list(db.scalars(select(Source.id).where(Source.org_id==org_id)))
        user_ids=list(db.scalars(select(User.id).where(User.org_id==org_id)))
        db.execute(delete(LoginSession).where(LoginSession.user_id.in_(user_ids)))
        db.execute(delete(Dependency).where(Dependency.content_id.in_(content_ids)))
        db.execute(delete(ContentVersion).where(ContentVersion.content_id.in_(content_ids)))
        db.execute(delete(SourceVersion).where(SourceVersion.source_id.in_(source_ids)))
        for cls in (Translation,Approval,Task,Decision,Content,Rule,Source,LogoReference,Campaign,Audit,User):db.execute(delete(cls).where(cls.org_id==org_id))
        db.execute(delete(Quota).where(Quota.id.like('ai:'+org_id+':%')))
        db.delete(ws)
    report['temporary_tenant_removed']=True
    report_name='cloud-core-verification.json' if core_only else 'cloud-verification.json'
    (ROOT/'docs'/report_name).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Removed only the synthetic release tenant; first-owner setup remains available.',flush=True)

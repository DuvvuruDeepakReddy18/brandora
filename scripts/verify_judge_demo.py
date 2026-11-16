"""Hosted judge-flow verification with no owner credentials or database access."""
import json,os,subprocess,sys
from pathlib import Path
from uuid import uuid4
ROOT=Path(__file__).resolve().parents[1]
CLI=Path(os.environ['APPDATA'])/'npm/node_modules/vercel/dist/index.js'
URL=sys.argv[1]
if not URL.startswith('https://brandora-') or not URL.endswith('.vercel.app'):raise SystemExit('Use the verified Brandora deployment URL.')
folder=ROOT/'.local'/('judge-check-'+uuid4().hex);folder.mkdir(parents=True)
report={'deployment':URL,'passed':False,'checks':[],'synthetic_only':True}
started=[]

def call(path,method='GET',body=None,visitor='first',upload=None,fields=None,output=None,expected=200):
    cookie=folder/(visitor+'.cookies')
    args=['node',str(CLI),'curl',path,'--deployment',URL,'--scope','duvvurudeepakreddy18s-projects','--','--silent','--show-error','--request',method,'--cookie',str(cookie),'--cookie-jar',str(cookie),'--write-out','\n%{http_code}']
    if body is not None:
        payload=folder/'request.json';payload.write_text(json.dumps(body),encoding='utf-8');args+=['--header','Content-Type: application/json','--data-binary','@'+str(payload)]
    if upload:
        args+=['--form','file=@'+str(upload)]
        for key,value in (fields or {}).items():args+=['--form-string',key+'='+value]
    if output:args+=['--output',str(output)]
    result=subprocess.run(args,cwd=ROOT,capture_output=True,encoding='utf-8',timeout=125)
    raw,_,status=result.stdout.strip().rpartition('\n')
    if output:status=result.stdout.strip()
    if result.returncode or status!=str(expected):raise RuntimeError(f'{method} {path}: expected {expected}, received {status}; '+raw[:500])
    report['checks'].append({'method':method,'path':path,'status':int(status),'visitor':visitor})
    print(method,path,status,flush=True)
    return json.loads(raw) if raw and not output else {}

try:
    assert call('/api/health')['explore_demo']
    call('/api/workspace',expected=401)
    for visitor in ('first','second'):
        call('/api/demo/start','POST',visitor=visitor);started.append(visitor)
    first=call('/api/workspace');second=call('/api/workspace',visitor='second')
    assert first['workspace']['id']!=second['workspace']['id']
    call('/api/content/'+second['content'][0]['id']+'/history',expected=404)
    draft=next(c for c in first['content'] if c['title']=='Launch announcement')
    call('/api/content/'+draft['id'],'PUT',{'title':draft['title'],'body':'Meet HarborDesk. Try it free for 14 days. Plans start at INR 499/month, billed annually.','expected_version':1})
    assert not call('/api/content/'+draft['id']+'/scan','POST')['findings']
    call('/api/content/'+draft['id']+'/request-review','POST')
    call('/api/content/'+draft['id']+'/approve','POST',expected=403)
    call('/api/demo/role','POST',{'role':'reviewer'})
    assert len(call('/api/content/'+draft['id']+'/approve','POST')['content_hash'])==64
    call('/api/demo/role','POST',{'role':'partner'})
    partner=call('/api/workspace');assert len(partner['campaigns'])==1
    call('/api/demo/role','POST',{'role':'manager'})
    call('/api/settings','PUT',{'ai_enabled':True})
    checked=call('/api/content/'+draft['id']+'/scan','POST');assert 'validated gemini' in checked['scan_coverage'] and not checked['findings'],checked['scan_coverage']
    translated=call('/api/content/'+draft['id']+'/translate','POST',{'language':'hi','expected_version':2})
    assert '14' in translated['result']['translated_text'] and '499' in translated['result']['translated_text']
    assert call('/api/translations/'+translated['id']+'/save','POST')['language_review_required']
    for name in ('creative.png','scanned-source.pdf'):call('/api/demo/assets/'+name,output=folder/name)
    logos=call('/api/logos');assert len(logos)==1
    visual=call('/api/visual/analyze','POST',upload=folder/'creative.png',fields={'reference_ids':json.dumps([logos[0]['id']])})
    assert '499' in visual['ocr']['text'] and visual['logos'][0]['result']=='match'
    assert '499' in call('/api/sources/ocr','POST',upload=folder/'scanned-source.pdf')['excerpt']
    assert call('/api/intelligence/status')['requests_today']==4
    assert call('/api/workspace',visitor='second')['workspace']['id']==second['workspace']['id']
    report['features']={'isolated_visitors':'passed','creator_reviewer_approval':'passed','partner_scope':'passed','gemini_review':'passed','translation':'passed','image_ocr_logo':'passed','scanned_pdf':'passed','ai_quota':'passed'}
    report['passed']=True
except Exception as exc:
    report['error']=str(exc);raise
finally:
    cleaned=[]
    for visitor in started:
        try:
            call('/api/demo/reset','POST',visitor=visitor)
            call('/api/workspace',visitor=visitor,expected=401)
            cleaned.append(visitor)
        except Exception as exc:report['cleanup_error']=str(exc)
    report['temporary_demos_removed']=len(cleaned)==len(started)
    (ROOT/'docs/judge-demo-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Synthetic demo verification finished; cleanup recorded in the report.',flush=True)
if not report['temporary_demos_removed']:raise SystemExit('Temporary demo cleanup needs review.')

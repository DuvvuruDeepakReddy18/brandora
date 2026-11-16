import os, tempfile, json
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.engine import validate_ai

def client(role='manager'):
    c=TestClient(app)
    assert c.post('/api/auth/demo/'+role).status_code==200
    return c
def ws(c):
    r=c.get('/api/workspace');assert r.status_code==200,r.text;return r.json()
def new(c,body='HarborDesk costs ₹499/month, billed annually. Try it for 14 days.'):
    w=ws(c);r=c.post('/api/content',json={'title':'Test content','campaign_id':w['campaigns'][0]['id'],'channel':'Social','subject':'HarborDesk','body':body});assert r.status_code==200,r.text;return r.json()
def ready(c,item):
    r=c.post('/api/content/'+item['id']+'/scan');assert r.status_code==200,r.text
    r=c.post('/api/content/'+item['id']+'/request-review');assert r.status_code==200,r.text

def test_unauthenticated_cannot_read():
    assert TestClient(app).get('/api/workspace').status_code==401
def test_four_demo_findings():
    c=client('creator');item=new(c,'Harbor Desk guarantees 80% less admin. Try it free for 30 days. Plans start at ₹499/month.')
    f=c.post('/api/content/'+item['id']+'/scan').json()['findings']
    assert len(f)==4
    assert sum(x['outcome']=='Verified Contradiction' for x in f)==3
    assert sum(x['outcome']=='Evidence Gap' for x in f)==1
    assert all(x['evidence']['source_id'] for x in f)
def test_clean_content_and_real_approval_receipt():
    c=client('creator');r=client('reviewer');item=new(c);ready(c,item)
    a=r.post('/api/content/'+item['id']+'/approve')
    assert a.status_code==200,a.text
    assert len(a.json()['content_hash'])==64
    assert len(a.json()['snapshot']['dependencies'])==3
    assert next(x for x in ws(c)['content'] if x['id']==item['id'])['status']=='Approved'
def test_self_approval_is_rejected():
    c=client('manager');item=new(c);ready(c,item)
    assert c.post('/api/content/'+item['id']+'/approve').status_code==403
def test_last_editor_cannot_self_approve():
    c=client('creator');m=client();item=new(c)
    assert m.put('/api/content/'+item['id'],json={'title':'Manager edited','body':item['body'],'expected_version':1}).status_code==200
    ready(m,item)
    assert m.post('/api/content/'+item['id']+'/approve').status_code==403
def test_price_fix_preserves_the_billing_unit():
    c=client('creator');item=new(c,'HarborDesk starts at ₹499/month.')
    f=c.post('/api/content/'+item['id']+'/scan').json()['findings'][0]
    assert f['span']=='₹499/month' and f['suggestion']=='₹499/month, billed annually'
def test_non_trial_days_are_not_trial_conflicts():
    c=client('creator');item=new(c,'HarborDesk sends a summary every 30 days.')
    findings=c.post('/api/content/'+item['id']+'/scan').json()['findings']
    assert not any(f['rule_code']=='F02' for f in findings)
def test_mapped_gap_cannot_be_dismissed_or_approved():
    c=client('creator');r=client('reviewer');item=new(c,'HarborDesk guarantees 80% less admin.');ready(c,item)
    item=next(x for x in ws(c)['content'] if x['id']==item['id'])
    assert r.post('/api/content/'+item['id']+'/resolve',json={'finding_id':item['findings'][0]['id'],'reason':'Please ignore this claim for testing.'}).status_code==409
    assert r.post('/api/content/'+item['id']+'/approve').status_code==409
def test_unknown_guarantee_is_uncertain_and_cannot_be_bypassed():
    c=client('creator');r=client('reviewer');item=new(c,'HarborDesk guarantees 99% faster output.')
    f=c.post('/api/content/'+item['id']+'/scan').json()['findings'][0]
    assert f['outcome']=='Low Confidence'
    assert r.post('/api/content/'+item['id']+'/resolve',json={'finding_id':f['id'],'reason':'No supporting source, please accept.'}).status_code==409
def test_content_edit_invalidates_approval_and_preserves_history():
    c=client('creator');r=client('reviewer');item=new(c);ready(c,item)
    assert r.post('/api/content/'+item['id']+'/approve').status_code==200
    assert c.put('/api/content/'+item['id'],json={'title':'Edited','body':'An edited message','expected_version':1}).status_code==200
    assert r.post('/api/content/'+item['id']+'/approve').status_code==409
    assert len(c.get('/api/content/'+item['id']+'/history').json())==2
    assert any(a['content_id']==item['id'] for a in ws(c)['approvals'])
def test_lost_update_conflict():
    c=client('creator');item=new(c)
    body={'title':'Edited','body':'A new message','expected_version':1}
    assert c.put('/api/content/'+item['id'],json=body).status_code==200
    assert c.put('/api/content/'+item['id'],json=body).status_code==409
def test_creator_cannot_modify_sources():
    c=client('creator');s=ws(c)['sources'][0]
    assert c.put('/api/sources/'+s['id'],json={k:s[k] for k in ['title','owner','excerpt','review_date','status']}).status_code==403
def test_cross_tenant_content_is_hidden():
    c=client();victim=ws(c)['content'][0]['id'];other=TestClient(app)
    assert other.post('/api/auth/register',json={'name':'Other user','workspace':'Other tenant','email':'other@example.test','password':'a-long-testing-password'}).status_code==200
    assert other.post('/api/content/'+victim+'/scan').status_code==404
    assert not ws(other)['content']
def test_partner_is_scoped_to_assigned_campaign():
    c=client('manager');p=client('partner');w=ws(c)
    hidden=next(x for x in w['campaigns'] if not x['members'])
    r=c.post('/api/content',json={'title':'Private campaign','campaign_id':hidden['id'],'body':'Internal draft','subject':'HarborDesk','channel':'Email'})
    assert r.status_code==200
    assert p.post('/api/content/'+r.json()['id']+'/scan').status_code==404
    assert hidden['id'] not in [x['id'] for x in ws(p)['campaigns']]
def test_impact_does_not_mutate_live_records():
    c=client();w=ws(c);rule=next(r for r in w['rules'] if r['code']=='F01')
    preview=c.post('/api/impact',json={'rule_id':rule['id'],'value':'599'})
    assert preview.status_code==200,preview.text
    assert preview.json()['dry_run'] is True
    projected=[f for item in preview.json()['affected'] for f in item['findings'] if f['rule_id']==rule['id']]
    assert any(f['outcome']=='Projected Contradiction' and f['hypothetical'] for f in projected)
    assert all(f['evidence']['hypothetical_rule_value'] for f in projected)
    after=ws(c)
    assert w['rules']==after['rules'] and w['sources']==after['sources'] and w['content']==after['content'] and w['approvals']==after['approvals']

def test_invalid_rule_configuration_is_rejected():
    c=client();rule=next(r for r in ws(c)['rules'] if r['code']=='F01')
    body={k:rule[k] for k in ('source_id','code','title','kind','value','subject','config')}
    body['config']={**body['config'],'qualifier':True}
    assert c.put('/api/rules/'+rule['id'],json=body).status_code==422
    for value in ('NaN','Infinity','-1'):
        assert c.post('/api/impact',json={'rule_id':rule['id'],'value':value}).status_code==422
def test_contrast_thresholds_and_missing_alt():
    c=client();r=c.post('/api/visual/contrast',json={'foreground':'#000000','background':'#ffffff','large_text':False,'alt_text':''})
    assert r.json()['ratio']==21 and r.json()['passes'] and not r.json()['alt_present']
    assert not c.post('/api/visual/contrast',json={'foreground':'#aaaaaa','background':'#ffffff'}).json()['passes']
def test_fake_image_rejected():
    c=client();assert c.post('/api/visual/image',files={'file':('fake.png',b'not an image','image/png')}).status_code==422
def test_document_import_requires_review_and_does_not_create_sources():
    c=client();before=len(ws(c)['sources'])
    r=c.post('/api/sources/extract',files={'file':('guidelines.txt',b'Approved wording: clear and helpful.', 'text/plain')})
    assert r.status_code==200,r.text
    assert r.json()['excerpt']=='Approved wording: clear and helpful.' and not r.json()['stored']
    assert len(ws(c)['sources'])==before
def test_partner_cannot_import_approved_documents():
    c=client('partner')
    assert c.post('/api/sources/extract',files={'file':('guide.txt',b'Approved facts for this project.','text/plain')}).status_code==403
def test_blank_pdf_is_not_evidence():
    import io
    from pypdf import PdfWriter
    writer=PdfWriter();writer.add_blank_page(width=100,height=100);blob=io.BytesIO();writer.write(blob)
    assert client().post('/api/sources/extract',files={'file':('blank.pdf',blob.getvalue(),'application/pdf')}).status_code==422
def test_cross_site_write_rejected():
    c=client();assert c.post('/api/campaigns',json={'name':'Forged'},headers={'Origin':'https://evil.example'}).status_code==403
def test_invalid_ai_citation_hidden():
    valid,hidden=validate_ai([{'rule_id':'invented'}],'Draft',[],{})
    assert valid==[] and hidden==1
def test_ai_enable_requires_configuration(monkeypatch):
    from backend import ai
    monkeypatch.setattr(ai,'available',lambda:False)
    assert client().put('/api/settings',json={'ai_enabled':True}).status_code==409
def test_source_change_only_invalidates_dependents():
    c=client('creator');r=client('reviewer');m=client('manager')
    dependent=new(c);control=new(c,'Meet the people behind the product.')
    for item in [dependent,control]:
        ready(c,item);assert r.post('/api/content/'+item['id']+'/approve').status_code==200
    s=next(x for x in ws(m)['sources'] if x['title']=='Pricing sheet')
    body={k:s[k] for k in ['title','owner','excerpt','review_date','status']};body['excerpt']=body['excerpt'].replace('499','599')
    changed=m.put('/api/sources/'+s['id'],json=body)
    assert changed.status_code==200
    current={x['id']:x for x in ws(c)['content']}
    assert current[dependent['id']]['status']=='Needs reassessment'
    assert current[control['id']]['status']=='Approved'
    result=c.post('/api/content/'+dependent['id']+'/scan').json()
    assert any(f['title']=='Source needs review' for f in result['findings'])
def test_payload_deletion_removes_version_text():
    c=client('creator');m=client();item=new(c,'Private draft with personally identifying details.')
    assert m.delete('/api/content/'+item['id']).status_code==200
    assert item['id'] not in [x['id'] for x in ws(c)['content']]
    assert c.get('/api/content/'+item['id']+'/history').status_code==404
    from backend.models import Session, ContentVersion
    from sqlalchemy import select
    with Session() as db:
        versions=list(db.scalars(select(ContentVersion).where(ContentVersion.content_id==item['id'])))
        assert all(v.body=='[Deleted]' for v in versions)

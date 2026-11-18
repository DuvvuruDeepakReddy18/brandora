"""Visual error marking, evidence-backed review decisions and dynamic creative scanning."""
import io
from types import SimpleNamespace as N
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import delete
from backend import main, demo, ai, intelligence
from backend.engine import scan, verified, group_like
from backend.models import Session, Quota, Creative, Content

CORRECTED='The central workspace for campaign content. Organise your creative workflows in one place. Enjoy a 14-day free trial. Get our Professional plan for ₹1,999 per month + GST. Start free today'

@pytest.fixture(autouse=True)
def demo_on(monkeypatch):
    monkeypatch.setattr(demo,'ENABLED',True)
    with Session.begin() as db:
        db.execute(delete(Quota).where(Quota.id.like('demo:%')))
        db.execute(delete(Quota).where(Quota.id.like('ai:%')))

def visitor():
    client=TestClient(main.app,base_url='https://testserver')
    assert client.post('/api/demo/start').status_code==200
    return client,client.get('/api/workspace').json()
def switch(client,role):
    assert client.post('/api/demo/role',json={'role':role}).status_code==200
    return client.get('/api/workspace').json()
def ad_of(state):return next(c for c in state['content'] if c['title']==demo.AD_TITLE)

def test_sample_ad_is_marked_with_the_six_specified_findings():
    client,state=visitor();ad=ad_of(state)
    outcomes=sorted((f['rule_code'],f['outcome']) for f in ad['findings'])
    assert outcomes==sorted([('P02','Verified Contradiction'),('P02','Low Confidence'),('F02','Verified Contradiction'),('R03','Evidence Gap'),('R03','Evidence Gap'),('LOGO','Visual Violation')])
    spans={f['span'] for f in ad['findings']}
    assert {'₹1,499 per month','30-day',"The world's No. 1 creative platform",'Reduce your marketing production time by 80%'}<=spans
    for f in ad['findings']:
        assert f['evidence'] and f['evidence']['excerpt']
        if f['span']:assert ad['body'][f['start']:f['end']]==f['span']
    price=next(f for f in ad['findings'] if f['outcome']=='Verified Contradiction' and f['rule_code']=='P02')
    assert price['suggestion']=='₹1,999 per month' and '₹1,999/month' in price['evidence']['excerpt']
    creative=next(c for c in state['creatives'] if c['content_id']==ad['id'])
    assert creative['origin']=='fixture' and creative['version']==1 and len(creative['regions'])==6 and creative['logos'][0]['result']=='modified'
    assert all(ad['body'][r['start']:r['end']]==r['text'] for r in creative['regions'])
    assert len(creative['findings'])==6 and 'image' not in creative
    image=client.get(creative['image_url']);assert image.status_code==200 and image.headers['content-type']=='image/jpeg'

def test_corrections_clear_findings_show_verified_values_and_keep_the_annotated_original():
    client,state=visitor();ad=ad_of(state)
    assert client.put('/api/content/'+ad['id'],json={'title':ad['title'],'body':CORRECTED,'expected_version':1}).status_code==200
    checked=client.post('/api/content/'+ad['id']+'/scan').json();assert checked['findings']==[]
    state=client.get('/api/workspace').json();ad=ad_of(state)
    assert {v['span'] for v in ad['verified']}>={'₹1,999 per month','14-day'}
    original=next(c for c in state['creatives'] if c['content_id']==ad['id'])
    assert original['version']==1 and len(original['findings'])==6
    assert client.post('/api/content/'+ad['id']+'/request-review').status_code==200
    switch(client,'reviewer')
    assert client.post('/api/content/'+ad['id']+'/approve').status_code==200

def test_reviewer_decisions_are_independent_recorded_and_bounded():
    client,state=visitor();ad=ad_of(state)
    price=next(f for f in ad['findings'] if f['outcome']=='Verified Contradiction' and f['rule_code']=='P02')
    review=next(f for f in ad['findings'] if f['outcome']=='Low Confidence')
    gap=next(f for f in ad['findings'] if f['outcome']=='Evidence Gap')
    url=lambda f:f"/api/content/{ad['id']}/findings/{f['id']}/decision"
    assert client.post(url(price),json={'action':'confirm','reason':'Confirmed against pricing policy.'}).status_code==403
    assert client.post(url(price),json={'action':'comment','reason':'I will fix this price.'}).status_code==200
    switch(client,'reviewer')
    assert client.post(url(price),json={'action':'reject','reason':'Trying to dismiss a contradiction.'}).status_code==409
    assert client.post(url(price),json={'action':'confirm','reason':'Policy v1 says ₹1,999.'}).status_code==200
    assert client.post(url(review),json={'action':'verify','reason':'GST note is shown in the ad footer.'}).status_code==200
    assert client.post(url(gap),json={'action':'request_evidence','reason':'Need the study behind this claim.'}).status_code==200
    state=client.get('/api/workspace').json();ad=ad_of(state)
    found={f['id']:f for f in ad['findings']}
    assert found[price['id']]['review']['state']=='Confirmed' and len(found[price['id']]['review_log'])==2
    assert found[review['id']]['resolved'] and found[review['id']]['review']['state']=='Verified by reviewer'
    assert any(t['title'].startswith('Evidence requested') for t in state['tasks'])
    assert {'Confirmed finding','Marked finding verified','Requested evidence','Commented on finding'}<={a['action'] for a in state['activity']}
    # Rescanning the same version keeps reviewer notes on unchanged findings.
    switch(client,'creator');rescanned=client.post('/api/content/'+ad['id']+'/scan').json()
    assert next(f for f in rescanned['findings'] if f['id']==price['id'])['review']['state']=='Confirmed'

def test_visual_violation_cannot_be_dismissed():
    client,state=visitor();ad=ad_of(state);switch(client,'reviewer')
    logo=next(f for f in ad['findings'] if f['outcome']=='Visual Violation')
    assert client.post(f"/api/content/{ad['id']}/findings/{logo['id']}/decision",json={'action':'verify','reason':'Looks fine to me honestly.'}).status_code==409

def fake_vision(blob,refs):
    return {'ocr':{'text':'x','language':'en','regions':[{'text':'Try InkloomAI free','box':[100,100,200,800]},{'text':'for 30 days. Only ₹1,499 per month for Professional.','box':[300,100,400,900]}],'warnings':[]},
        'logos':[{'reference_id':r['id'],'result':'not_found','explanation':'No approved mark visible.','box':[0,0,0,0]} for r in refs],'suggested_alt_text':'An ad','warnings':['Low contrast footer']}

def png():
    out=io.BytesIO();Image.new('RGB',(400,300),'white').save(out,format='PNG');return out.getvalue()

def test_uploaded_creative_is_analysed_dynamically(monkeypatch):
    client,state=visitor();switch(client,'manager')
    monkeypatch.setattr(ai,'available',lambda:True);monkeypatch.setattr(ai,'vision_available',lambda:True)
    monkeypatch.setattr(ai,'semantic',lambda *a:([], 'Rules + validated test suggestions',0))
    monkeypatch.setattr(intelligence,'inspect_visual',fake_vision)
    assert client.put('/api/settings',json={'ai_enabled':True}).status_code==200
    logo=client.get('/api/logos').json()[0]
    camp=state['campaigns'][0]['id']
    r=client.post('/api/scan/upload',data={'title':'Partner banner','campaign_id':camp,'subject':'Inkloom AI','channel':'Advertisement','reference_ids':f'["{logo["id"]}"]'},files={'file':('banner.png',png(),'image/png')})
    assert r.status_code==200,r.text
    item=r.json();assert item['body'].startswith('Try InkloomAI free for 30 days.')
    codes={(f['rule_code'],f['outcome']) for f in item['findings']}
    assert ('F02','Verified Contradiction') in codes and ('P02','Verified Contradiction') in codes and ('LOGO','Visual Violation') in codes
    state=client.get('/api/workspace').json()
    creative=next(c for c in state['creatives'] if c['content_id']==item['id'])
    assert creative['origin']=='ai' and creative['regions'][1]['start']==len('Try InkloomAI free ')
    assert 'Low contrast footer' in creative['warnings']
    # Re-reading the stored image with live AI produces a new exact version, not a silent overwrite.
    again=client.post('/api/content/'+item['id']+'/creative',data={'expected_version':1,'reuse':creative['id'],'reference_ids':'[]'})
    assert again.status_code==200,again.text and again.json()['version']==2

def test_provider_failure_saves_nothing_and_is_explicit(monkeypatch):
    client,state=visitor();switch(client,'manager')
    monkeypatch.setattr(ai,'available',lambda:True);monkeypatch.setattr(ai,'vision_available',lambda:True)
    def broken(*a):raise ai.ProviderError('The provider timed out.')
    monkeypatch.setattr(intelligence,'inspect_visual',broken)
    client.put('/api/settings',json={'ai_enabled':True})
    before=len(client.get('/api/workspace').json()['content'])
    r=client.post('/api/scan/upload',data={'title':'Broken','campaign_id':state['campaigns'][0]['id'],'subject':'Inkloom AI'},files={'file':('a.png',png(),'image/png')})
    assert r.status_code==502 and 'Processing failed' in r.json()['detail']
    assert len(client.get('/api/workspace').json()['content'])==before

def test_image_scan_requires_enabled_ai_and_documents_do_not():
    client,state=visitor()
    camp=state['campaigns'][0]['id']
    r=client.post('/api/scan/upload',data={'title':'Image','campaign_id':camp,'subject':'Inkloom AI'},files={'file':('a.png',png(),'image/png')})
    assert r.status_code==409
    r=client.post('/api/scan/upload',data={'title':'Brochure copy','campaign_id':camp,'subject':'Inkloom AI','channel':'Website'},files={'file':('brochure.txt','Starter is now ₹899/month. Enjoy a 7-day free trial.'.encode(),'text/plain')})
    assert r.status_code==200,r.text
    assert {f['rule_code'] for f in r.json()['findings']}>={'P01','F02'}
    assert client.post('/api/scan/upload',data={'title':'Bad','campaign_id':camp,'subject':'Inkloom AI'},files={'file':('a.exe',b'MZ','application/octet-stream')}).status_code==422

def test_other_workspaces_cannot_read_a_creative():
    client,state=visitor();other,_=visitor()
    creative=state['creatives'][0]
    assert other.get(creative['image_url']).status_code==404

def R(code,value,cfg,kind='number'):return N(id=code,code=code,title=code,kind=kind,value=value,subject='Inkloom AI',config=cfg,active=1,source_id='s')
SRC=N(id='s',title='Pricing',version=1,excerpt='Starter ₹999/month. Professional ₹1,999/month. Enterprise ₹1,00,000/year. Trial: 14 days.',owner='Product',status='approved',review_date='')

def test_grouped_prices_plans_and_typographic_quotes():
    rules=[R('P01','999',{'metric':'price','plan':'Starter'}),R('P02','1999',{'metric':'price','plan':'Professional'}),R('E01','100000',{'metric':'price','plan':'Enterprise'})]
    f,_=scan('Starter is ₹999/month. Professional is ₹1,499/month. Enterprise is ₹90,000/year.','Inkloom AI','Website',rules,{'s':SRC})
    assert sorted((x['rule_code'],x['span'],x['suggestion']) for x in f)==[('E01','₹90,000/year','₹1,00,000/year'),('P02','₹1,499/month','₹1,999/month')]
    assert not any(x['title']=='Approved sources disagree' for x in f)
    assert [v['rule_code'] for v in verified('Starter is ₹999/month.','Inkloom AI','Website',rules,{'s':SRC})]==['P01']
    gap=R('R03','Approved study required',{'unsupported_terms':["The world's No. 1 creative platform"]},kind='substantiation')
    f,_=scan('The world’s No. 1 creative platform.','Inkloom AI','Website',[gap],{'s':SRC})
    assert [x['outcome'] for x in f]==['Evidence Gap']
    f,_=scan('Rated No. 1 by teams. Save 40% today.','Inkloom AI','Website',[],{})
    assert [x['span'] for x in f]==['Rated No. 1 by teams.','Save 40% today.'] and all(x['outcome']=='Low Confidence' for x in f)
    assert group_like('1,499','1999')=='1,999' and group_like('1,00,000','250000')=='2,50,000' and group_like('1,000,000','2500000')=='2,500,000' and group_like('499','1999')=='1999'

def test_rule_configuration_for_plans_and_rewrites_is_validated():
    client,state=visitor();switch(client,'manager')
    source=state['sources'][0]['id']
    base={'source_id':source,'code':'X1','title':'Bad rewrite','kind':'substantiation','value':'Approved study required','subject':'Inkloom AI'}
    assert client.post('/api/rules',json={**base,'config':{'unsupported_terms':['x'],'replacements':['not a map']}}).status_code==422
    assert client.post('/api/rules',json={**base,'config':{'unsupported_terms':['fastest launch'],'replacements':{'fastest launch':'a faster launch workflow'}}}).status_code==200
    assert client.post('/api/rules',json={**base,'code':'X2','kind':'number','value':'1999','config':{'metric':'price','qualifier_review':'yes'}}).status_code==422

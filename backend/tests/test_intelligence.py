import io,json
from uuid import uuid4
from PIL import Image
from fastapi.testclient import TestClient
from backend.main import app
from backend import ai,intelligence,limits
from backend.models import Session,Workspace,Content,Quota
import pytest

def image_bytes():
    output=io.BytesIO();Image.new('RGB',(100,100),'white').save(output,format='PNG');return output.getvalue()

@pytest.fixture
def workspace(monkeypatch):
    manager=TestClient(app);suffix=uuid4().hex
    r=manager.post('/api/auth/register',json={'name':'Test manager','email':suffix+'@example.test','password':'a-long-regression-password','workspace':'Isolated AI test'})
    assert r.status_code==200,r.text
    state=manager.get('/api/workspace').json()
    monkeypatch.setattr(ai,'available',lambda:True);monkeypatch.setattr(ai,'vision_available',lambda:True)
    assert manager.put('/api/settings',json={'ai_enabled':True}).status_code==200
    reviewer_email='r'+suffix+'@example.test'
    assert manager.post('/api/members',json={'name':'Test reviewer','email':reviewer_email,'password':'a-long-regression-password','role':'reviewer'}).status_code==200
    reviewer=TestClient(app);assert reviewer.post('/api/auth/login',json={'email':reviewer_email,'password':'a-long-regression-password'}).status_code==200
    content=manager.post('/api/content',json={'title':'Original','body':'HarborDesk costs 499. Try for 14 days.','subject':'HarborDesk','channel':'Social','campaign_id':state['campaigns'][0]['id']}).json()
    return manager,reviewer,content

def test_logo_registration_role_scope_and_withdrawal(workspace):
    manager,reviewer,_=workspace
    assert reviewer.post('/api/logos',data={'name':'Approved'},files={'file':('logo.png',image_bytes(),'image/png')}).status_code==403
    created=manager.post('/api/logos',data={'name':'Approved'},files={'file':('logo.png',image_bytes(),'image/png')})
    assert created.status_code==200,created.text
    id=created.json()['id'];assert manager.get('/api/logos/'+id+'/image').status_code==200
    stranger=TestClient(app);stranger.post('/api/auth/demo/manager')
    assert stranger.get('/api/logos/'+id+'/image').status_code==404
    assert manager.post('/api/logos/'+id+'/withdraw').status_code==200
    assert manager.get('/api/logos').json()==[]

def test_visual_requires_enabled_ai_and_rejects_foreign_refs(workspace):
    manager,_,_=workspace
    manager.put('/api/settings',json={'ai_enabled':False})
    assert manager.post('/api/visual/analyze',files={'file':('image.png',image_bytes(),'image/png')}).status_code==409
    assert manager.post('/api/visual/analyze',data={'reference_ids':'["foreign"]'},files={'file':('image.png',image_bytes(),'image/png')}).status_code==404

def test_vision_rejects_invented_reference_and_bad_box(monkeypatch):
    result=intelligence.VisionResult(ocr={'text':'hi','language':'en','regions':[],'warnings':[]},logos=[{'reference_id':'invented','result':'match','box':[0,0,100,100],'explanation':'match'}],suggested_alt_text='Image',warnings=[])
    monkeypatch.setattr(ai,'generate',lambda *a,**k:result)
    with pytest.raises(ai.ProviderError):intelligence.inspect_visual(image_bytes(),[])
    with pytest.raises(ai.ProviderError):intelligence.valid_boxes([intelligence.Region(text='x',box=[20,20,0,0])])

def test_translation_rejects_missing_protected_fact(monkeypatch):
    monkeypatch.setattr(ai,'generate',lambda *a,**k:intelligence.TranslationResult(translated_text='Unrelated text',back_translation='Unrelated text',warnings=[]))
    with pytest.raises(ai.ProviderError):intelligence.translate('HarborDesk costs 499.','hi',['HarborDesk'])

def test_translation_restores_protected_facts(monkeypatch):
    def response(instruction,payload,*args):
        return intelligence.TranslationResult(translated_text=payload['text'],back_translation=payload['text'],warnings=[])
    monkeypatch.setattr(ai,'generate',response)
    result=intelligence.translate('HarborDesk costs 499/month. Contact hello@example.test.','hi',['HarborDesk'])
    assert result['translated_text']=='HarborDesk costs 499/month. Contact hello@example.test.'
    assert 'hello@example.test' in result['protected_terms']

def test_translation_save_stale_version_and_language_review(workspace,monkeypatch):
    manager,reviewer,content=workspace
    monkeypatch.setattr(intelligence,'translate',lambda *args:{'translated_text':'HarborDesk 499 रुपये, 14 दिन।','back_translation':'HarborDesk 499 rupees, 14 days.','warnings':[],'protected_terms':['HarborDesk','499','14'],'requires_human_review':True})
    r=manager.post('/api/content/'+content['id']+'/translate',json={'language':'hi','expected_version':1});assert r.status_code==200,r.text
    t=r.json();saved=manager.post('/api/translations/'+t['id']+'/save');assert saved.status_code==200,saved.text
    translated=saved.json();assert translated['language']=='hi' and translated['status']=='Draft'
    assert manager.post('/api/content/'+translated['id']+'/language-review',json={'reason':'I checked all meaning and numeric facts.','expected_version':1}).status_code==403
    manager.put('/api/settings',json={'ai_enabled':False})
    manager.post('/api/content/'+translated['id']+'/scan');manager.post('/api/content/'+translated['id']+'/request-review')
    assert reviewer.post('/api/content/'+translated['id']+'/approve').status_code==409
    assert reviewer.post('/api/content/'+translated['id']+'/language-review',json={'reason':'I checked all meaning and numeric facts.','expected_version':1}).status_code==200
    assert reviewer.post('/api/content/'+translated['id']+'/approve').status_code==200
    manager.put('/api/content/'+content['id'],json={'title':'Changed','body':'New wording','expected_version':1})
    assert manager.post('/api/translations/'+t['id']+'/save').status_code==409

def test_failed_ai_cannot_be_silently_approved(workspace):
    manager,reviewer,content=workspace
    r=manager.post('/api/content/'+content['id']+'/scan');assert r.status_code==200,r.text
    assert r.json()['scan_coverage'].startswith('AI incomplete:')
    manager.post('/api/content/'+content['id']+'/request-review')
    assert reviewer.post('/api/content/'+content['id']+'/approve').status_code==409

def test_durable_quota_counts_failed_call(workspace):
    manager,_,content=workspace
    before=manager.get('/api/intelligence/status').json()['requests_today']
    assert manager.post('/api/content/'+content['id']+'/scan').status_code==200
    assert manager.get('/api/intelligence/status').json()['requests_today']==before+1
    key='test:'+uuid4().hex;limits.reserve([(key,1)])
    with pytest.raises(limits.LimitReached):limits.reserve([(key,1)])
    with Session() as db:assert db.get(Quota,key).count==1

def test_document_ocr_requires_review_and_creates_no_source(workspace,monkeypatch):
    manager,_,_=workspace
    monkeypatch.setattr(intelligence,'extract_document',lambda *a:{'text':'HarborDesk trial lasts 14 days.','warnings':['Check the original before approval.']})
    r=manager.post('/api/sources/ocr',files={'file':('scanned.png',image_bytes(),'image/png')})
    assert r.status_code==200,r.text
    assert not r.json()['stored'] and r.json()['warnings']
    assert manager.get('/api/workspace').json()['sources']==[]

def test_ai_policy_change_invalidates_prior_approval(workspace):
    manager,reviewer,content=workspace
    manager.put('/api/settings',json={'ai_enabled':False})
    manager.post('/api/content/'+content['id']+'/scan');manager.post('/api/content/'+content['id']+'/request-review')
    assert reviewer.post('/api/content/'+content['id']+'/approve').status_code==200
    assert manager.put('/api/settings',json={'ai_enabled':True}).status_code==200
    state=manager.get('/api/workspace').json()
    assert next(c for c in state['content'] if c['id']==content['id'])['status']=='Needs reassessment'

def test_english_translation_also_requires_language_review(workspace,monkeypatch):
    manager,reviewer,content=workspace
    monkeypatch.setattr(intelligence,'translate',lambda *args:{'translated_text':'HarborDesk costs 499. Try for 14 days.','back_translation':'HarborDesk costs 499. Try for 14 days.','warnings':[],'protected_terms':[]})
    t=manager.post('/api/content/'+content['id']+'/translate',json={'language':'en','expected_version':1}).json()
    translated=manager.post('/api/translations/'+t['id']+'/save').json()
    assert translated['language_review_required']==1
    manager.put('/api/settings',json={'ai_enabled':False})
    manager.post('/api/content/'+translated['id']+'/scan');manager.post('/api/content/'+translated['id']+'/request-review')
    assert reviewer.post('/api/content/'+translated['id']+'/approve').status_code==409

import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, delete
from backend import main, demo, ai
from backend.models import Session, DemoVisit, Workspace, User, Content, Quota

@pytest.fixture(autouse=True)
def demo_limits_and_flag(monkeypatch):
    monkeypatch.setattr(demo,'ENABLED',True)
    with Session.begin() as db:
        db.execute(delete(Quota).where(Quota.id.like('demo:%')))
        db.execute(delete(Quota).where(Quota.id.like('ai:demo-global:%')))

def visitor():
    client=TestClient(main.app,base_url='https://testserver')
    result=client.post('/api/demo/start')
    assert result.status_code==200,result.text
    return client,client.get('/api/workspace').json()

def switch(client,role):
    result=client.post('/api/demo/role',json={'role':role})
    assert result.status_code==200,result.text
    return client.get('/api/workspace').json()

def test_public_demo_works_when_legacy_production_demo_is_disabled(monkeypatch):
    monkeypatch.setattr(main,'PRODUCTION',True);monkeypatch.setattr(main,'DEMO',False)
    client,state=visitor()
    assert client.post('/api/auth/demo/manager').status_code==404
    assert state['user']['role']=='creator' and state['judge_demo']
    assert len(state["content"])==7 and len(state['approvals'])==1 and state['tasks']
    assert state['judge_demo']['ai_limit']==demo.AI_LIMIT
    assert client.cookies.get('brandora_session') is None
    assert client.post('/api/demo/start').status_code==200
    assert client.get('/api/workspace').json()['workspace']['id']==state['workspace']['id']
    assert client.get('/api/demo/assets/scanned-source.pdf').content.startswith(b'%PDF')
    logo=client.get('/api/logos').json()[0]
    assert client.get(logo['image_url']).status_code==200

def test_visitors_and_owner_are_isolated_and_role_cannot_escalate():
    first,a=visitor();second,b=visitor()
    assert a['workspace']['id']!=b['workspace']['id']
    switch(first,'manager')
    assert first.get('/api/content/'+b['content'][0]['id']+'/history').status_code==404
    assert first.put('/api/sources/'+b['sources'][0]['id'],json={k:b['sources'][0][k] for k in ('title','owner','excerpt','review_date','status')}).status_code==404
    assert first.post('/api/demo/role',json={'role':'owner'}).status_code==422
    owner=TestClient(main.app);owner.post('/api/auth/demo/manager')
    assert owner.post('/api/demo/role',json={'role':'manager'}).status_code==403
    assert owner.post('/api/demo/reset').status_code==403
    assert owner.get('/api/demo/assets/creative.png').status_code==403

def test_creator_to_reviewer_approval_and_partner_scope():
    client,state=visitor()
    draft=next(c for c in state['content'] if c['title']==demo.AD_TITLE)
    body={'title':draft['title'],'expected_version':1,'body':'The central workspace for campaign content. Organise your creative workflows in one place. Enjoy a 14-day free trial. Get our Professional plan for ₹1,999 per month + GST. Start free today'}
    assert client.put('/api/content/'+draft['id'],json=body).status_code==200
    checked=client.post('/api/content/'+draft['id']+'/scan').json();assert checked['findings']==[]
    assert client.post('/api/content/'+draft['id']+'/request-review').status_code==200
    assert client.post('/api/content/'+draft['id']+'/approve').status_code==403
    switch(client,'reviewer')
    receipt=client.post('/api/content/'+draft['id']+'/approve');assert receipt.status_code==200,receipt.text
    assert len(receipt.json()['content_hash'])==64
    partner=switch(client,'partner')
    assert len(partner['campaigns'])==1
    internal=next(c for c in state['content'] if c['subject']=='Inkloom Asset Vault')
    assert client.get('/api/content/'+internal['id']+'/history').status_code==404
    assert client.post('/api/content/'+draft['id']+'/scan').status_code==403

def test_leaving_and_reset_preserve_owner_session():
    owner=TestClient(main.app);owner.post('/api/auth/demo/manager')
    before=owner.get('/api/workspace').json();token=owner.cookies.get('brandora_session')
    assert owner.post('/api/demo/start').status_code==200
    state=owner.get('/api/workspace').json();org=state['workspace']['id']
    assert org!=before['workspace']['id']
    assert owner.cookies.get('brandora_session')==token
    assert owner.post('/api/demo/exit').status_code==200
    assert owner.get('/api/workspace').json()['workspace']['id']==before['workspace']['id']
    assert owner.post('/api/demo/start').status_code==200
    assert owner.get('/api/workspace').json()['workspace']['id']==org
    assert owner.post('/api/demo/reset').status_code==200
    with Session() as db:
        assert db.get(Workspace,org) is None
        assert db.get(Workspace,before['workspace']['id']) is not None
    assert owner.get('/api/workspace').json()['workspace']['id']==before['workspace']['id']

def test_expiry_and_tampered_cookie_do_not_fall_back_to_owner():
    client,state=visitor()
    with Session.begin() as db:
        visit=demo.visit_for_org(db,state['workspace']['id']);visit.expires=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
    assert client.get('/api/workspace').status_code==401
    assert client.post('/api/demo/role',json={'role':'manager'}).status_code==401
    fresh,_=visitor()
    with Session() as db:assert db.get(Workspace,state['workspace']['id']) is None
    fresh.cookies.set(demo.COOKIE,'forged',domain='testserver.local',path='/')
    assert fresh.get('/api/workspace').status_code==401

def test_demo_member_credentials_cannot_escape_expiry():
    client,_=visitor();switch(client,'manager')
    email=uuid4().hex+'@example.test'
    member=client.post('/api/members',json={'name':'Demo member','email':email,'password':'synthetic-password-only','role':'manager'})
    assert member.status_code==200
    assert member.json()['email']!=email and member.json()['email'].endswith('@demo.brandora.invalid')
    separate=TestClient(main.app)
    assert separate.post('/api/auth/login',json={'email':member.json()['email'],'password':'synthetic-password-only'}).status_code==401

def test_demo_ai_cap_is_shared_across_role_switches(monkeypatch):
    client,state=visitor();switch(client,'manager')
    monkeypatch.setattr(ai,'available',lambda:True)
    assert client.put('/api/settings',json={'ai_enabled':True}).status_code==200
    with Session.begin() as db:db.add(Quota(id=f'ai:{state["workspace"]["id"]}:{main.limits.day()}',count=demo.AI_LIMIT))
    switch(client,'creator')
    response=client.post('/api/content/'+state['content'][0]['id']+'/scan')
    # The cap holds: no provider call is made, rule checks still complete and the result says AI is incomplete.
    assert response.status_code==200 and response.json()['scan_coverage'].startswith('AI incomplete: the daily AI request limit')
    switch(client,'reviewer')
    assert client.get('/api/intelligence/status').json()['requests_today']==demo.AI_LIMIT
    assert client.get('/api/intelligence/status').json()['daily_limit']==demo.AI_LIMIT

def test_creation_cap_disabled_flag_and_origin_protection(monkeypatch):
    client=TestClient(main.app)
    assert client.post('/api/demo/start',headers={'Origin':'https://evil.invalid'}).status_code==403
    with Session.begin() as db:db.add(Quota(id=f'demo:start:global:{main.limits.day()}',count=200))
    assert client.post('/api/demo/start').status_code==429
    monkeypatch.setattr(demo,'ENABLED',False)
    assert client.post('/api/demo/start').status_code==404
    assert not client.get('/api/health').json()['explore_demo']

def test_demo_global_ai_cap_survives_reset(monkeypatch):
    client,state=visitor();switch(client,'manager')
    monkeypatch.setattr(ai,'available',lambda:True)
    client.put('/api/settings',json={'ai_enabled':True})
    with Session.begin() as db:db.add(Quota(id=f'ai:demo-global:{main.limits.day()}',count=demo.AI_GLOBAL_LIMIT))
    limited=client.post('/api/content/'+state['content'][0]['id']+'/scan')
    assert limited.status_code==200 and 'daily AI request limit' in limited.json()['scan_coverage']
    assert client.post('/api/demo/reset').status_code==200
    assert client.post('/api/demo/start').status_code==200
    state=switch(client,'manager');client.put('/api/settings',json={'ai_enabled':True})
    assert 'daily AI request limit' in client.post('/api/content/'+state['content'][0]['id']+'/scan').json()['scan_coverage']
    owner=TestClient(main.app);owner.post('/api/auth/demo/manager')
    assert owner.get('/api/intelligence/status').json()['daily_limit']==main.AI_DAILY_LIMIT

def test_demo_action_cap_blocks_writes_but_not_reading():
    client,state=visitor()
    with Session.begin() as db:
        visit=demo.visit_for_org(db,state['workspace']['id'])
        db.add(Quota(id=f'demo:write:{visit.id}',count=250))
    assert client.post('/api/demo/role',json={'role':'manager'}).status_code==429
    assert client.get('/api/workspace').status_code==200
    assert client.post('/api/demo/exit').status_code==200


def test_demo_starts_with_live_ai_when_a_provider_is_configured(monkeypatch):
    monkeypatch.setattr(ai,'available',lambda:True)
    client,state=visitor()
    assert state['workspace']['settings']['ai_enabled'] is True
    # Samples are seeded with rule checks first, so starting a demo makes no provider call.
    assert all(c['scan_coverage']=='Rules only' for c in state['content'])
    assert any(a['action']=='Updated AI policy' for a in state['activity'])

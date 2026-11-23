"""Round 3: measured reliability, tone and messaging, page-by-page documents with accessibility, guideline insights."""
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from backend import main, demo, evaluation
from backend.engine import scan
from backend.models import Session, Quota


@pytest.fixture(autouse=True)
def demo_limits(monkeypatch):
    monkeypatch.setattr(demo, 'ENABLED', True)
    with Session.begin() as db:
        db.execute(delete(Quota).where(Quota.id.like('demo:%')))


def visitor():
    client = TestClient(main.app, base_url='https://testserver')
    assert client.post('/api/demo/start').status_code == 200
    return client, client.get('/api/workspace').json()


def switch(client, role):
    assert client.post('/api/demo/role', json={'role': role}).status_code == 200
    return client.get('/api/workspace').json()


def item(state, title):
    return next(c for c in state['content'] if c['title'] == title)


# ---------- 1. Measured reliability ----------
def test_reliability_meets_thresholds_and_published_report_is_current():
    report = evaluation.evaluate()
    assert report['dataset']['items'] == 80 and report['dataset']['splits'] == {'dev': 40, 'heldout': 40}
    assert report['dataset']['clean_controls'] >= 20
    assert report['splits']['dev']['precision'] >= 0.95 and report['splits']['dev']['recall'] >= 0.95
    assert report['splits']['heldout']['precision'] >= 0.9 and report['splits']['heldout']['recall'] >= 0.8
    assert report['citations']['rate'] == 1.0 and report['citations']['checked'] >= 40
    assert report['clean_controls']['false_alarm_rate'] <= 0.1
    assert all(f['why'] for f in report['failures'] if f['split'] == 'heldout')
    published = json.loads(evaluation.REPORT.read_text(encoding='utf-8'))
    assert published == json.loads(json.dumps(report, ensure_ascii=False)), 'Run python -m backend.evaluation --write and commit docs/reliability.json'


def test_reliability_endpoint_requires_sign_in():
    assert TestClient(main.app, base_url='https://testserver').get('/api/reliability').status_code == 401
    client, _ = visitor()
    body = client.get('/api/reliability').json()
    assert body['overall']['tp'] > 50 and body['failures']


# ---------- Tone and messaging ----------
def test_tone_checks_cite_the_voice_guide_and_respect_channels():
    rules, sources = evaluation.register()
    text = 'HURRY! Our revolutionary editor gives instant results!! Leverage it today.'
    social = scan(text, demo.COMPANY, 'Social', rules, sources)[0]
    titles = sorted(f['title'] for f in social if f['rule_code'] == 'V01')
    assert titles.count('Off-brand wording') == 2 and 'Off-message promise' in titles and 'Use the preferred term' in titles
    assert 'Words written in capitals' in titles and 'Too many exclamation marks' in titles
    for f in social:
        if f['rule_code'] == 'V01':
            assert f['outcome'] == 'Tone Issue' and f['evidence']['rule_value'] in demo.VOICE
    preferred = next(f for f in social if f['title'] == 'Use the preferred term')
    assert preferred['span'] == 'Leverage' and preferred['suggestion'] == 'Use'
    website = scan(text, demo.COMPANY, 'Website', rules, sources)[0]
    assert not any(f['title'] == 'Words written in capitals' for f in website)


def test_tone_finding_can_be_accepted_by_a_reviewer_but_not_by_the_author():
    client, state = visitor()
    deck = item(state, demo.DECK_TITLE)
    tone = next(f for f in deck['findings'] if f['outcome'] == 'Tone Issue')
    assert client.post(f"/api/content/{deck['id']}/findings/{tone['id']}/decision", json={'action': 'verify', 'reason': 'Approved launch slide wording.'}).status_code == 403
    switch(client, 'reviewer')
    r = client.post(f"/api/content/{deck['id']}/findings/{tone['id']}/decision", json={'action': 'verify', 'reason': 'Partner slide may use this phrase per the campaign brief.'})
    assert r.status_code == 200
    contradiction = next(f for f in deck['findings'] if f['outcome'] == 'Verified Contradiction')
    assert client.post(f"/api/content/{deck['id']}/findings/{contradiction['id']}/decision", json={'action': 'reject', 'reason': 'Trying to dismiss a contradiction.'}).status_code == 409


# ---------- 2. Page by page, with accessibility ----------
def test_ten_page_brochure_and_deck_have_page_specific_marks_and_measured_contrast():
    client, state = visitor()
    brochure, deck = item(state, demo.BROCHURE_TITLE), item(state, demo.DECK_TITLE)
    creatives = {c['content_id']: c for c in state['creatives']}
    assert len(creatives[brochure['id']]['pages']) == 10 and len(creatives[deck['id']]['pages']) == 6
    pages = {f['page'] for f in brochure['findings']}
    assert len(pages) >= 7 and all(isinstance(p, int) for p in pages)
    contrast = [f for f in brochure['findings'] if f['title'] == 'Low text contrast']
    assert {f['page'] for f in contrast} == {0, 5}
    assert all(f['measure']['ratio'] < f['measure']['target'] and f['measure']['fg'].startswith('#') for f in contrast)
    assert any(f['title'] == 'Very small text' and f['page'] == 9 and f['measure']['size_pt'] == 6 for f in brochure['findings'])
    alt = sorted(f['title'] for f in deck['findings'] if f['page'] == 3)
    assert alt == ['Alt text is not helpful', 'Alt text missing']
    assert any(f['title'] == 'Low text contrast' and f['measure']['ratio'] == 2.32 for f in deck['findings'])
    page = client.get(creatives[brochure['id']]['pages'][5]['image_url'])
    assert page.status_code == 200 and page.headers['content-type'] == 'image/jpeg' and page.content[:2] == b'\xff\xd8'
    ad = item(state, demo.AD_TITLE)
    assert len(ad['findings']) == 7 and not any(f['outcome'] == 'Accessibility' for f in ad['findings'])
    page6 = [f for f in brochure['findings'] if f['rule_code'] == 'C01']
    assert [f['page'] for f in page6] == [5] and page6[0]['measure']['colours'][0]['hex'] == '#ffb27a'


def test_uploaded_pdf_and_pptx_are_read_page_by_page_without_ai():
    client, state = visitor()
    camp = state['campaigns'][0]['id']
    for name, mime, pages in (('festive-brochure-10-pages.pdf', 'application/pdf', 10), ('partner-deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 6)):
        blob = client.get(f'/api/demo/assets/{name}').content
        r = client.post('/api/scan/upload', data={'title': 'Upload ' + name, 'campaign_id': camp, 'subject': 'Inkloom AI', 'channel': 'Advertisement'}, files={'file': (name, blob, mime)})
        assert r.status_code == 200, r.text
        uploaded = r.json()
        assert uploaded['findings'] and all('page' in f for f in uploaded['findings'] if f.get('end', 0) > f.get('start', 0) or f.get('kind') == 'access')
        creative = next(c for c in client.get('/api/workspace').json()['creatives'] if c['content_id'] == uploaded['id'])
        assert creative['page_count'] == pages and len(creative['pages']) == pages
        assert client.get(creative['pages'][-1]['image_url']).status_code == 200


def test_alt_text_is_part_of_the_reviewed_version():
    client, state = visitor()
    ad = item(state, demo.AD_TITLE)
    creative = next(c for c in state['creatives'] if c['content_id'] == ad['id'])
    r = client.put(f"/api/creatives/{creative['id']}/alt-text", json={'alt_text': 'banner', 'expected_version': ad['version']})
    assert r.status_code == 200, r.text
    assert any(f['title'] == 'Alt text is not helpful' for f in r.json()['findings'])
    good = 'Inkloom AI spring launch advertisement with headline, free trial offer, price and Start free today button.'
    r = client.put(f"/api/creatives/{creative['id']}/alt-text", json={'alt_text': good, 'expected_version': ad['version']})
    assert not any(f['outcome'] == 'Accessibility' for f in r.json()['findings'])
    switch(client, 'reviewer')
    assert client.put(f"/api/creatives/{creative['id']}/alt-text", json={'alt_text': good, 'expected_version': ad['version']}).status_code == 403


# ---------- 3. Guideline insights and clarified rules ----------
def test_insights_flag_the_unclear_rule_and_hide_people():
    client, state = visitor()
    assert client.get('/api/insights').status_code == 403
    tips = client.get('/api/insights/tips').json()
    assert any(t['rule_code'] == 'F02' for t in tips)
    switch(client, 'reviewer')
    data = client.get('/api/insights').json()
    assert data['summary']['fictional'] > 30 and data['summary']['decisions'] > 30
    assert data['recurring'][0]['count'] >= data['recurring'][-1]['count']
    unclear = next(u for u in data['unclear'] if u['rule_code'] == 'P02')
    assert unclear['channel'] == 'Email' and 'Email' not in unclear['suggestion']['config']['qualifier_channels']
    teams = {t['name'] for t in data['by_team']}
    assert teams <= {'Internal team', 'Partner agencies'}
    assert 'Alex Morgan' not in json.dumps(data) and 'Jordan Lee' not in json.dumps(data)


def test_clarified_rule_is_replayed_then_applied_only_by_a_different_manager():
    client, _ = visitor()
    state = switch(client, 'manager')
    unclear = next(u for u in client.get('/api/insights').json()['unclear'] if u['rule_code'] == 'P02')
    body = {'rule_id': unclear['rule_id'], 'rationale': 'Email footers already carry the GST note.', 'config': unclear['suggestion']['config']}
    own = client.post('/api/rule-proposals', json=body).json()
    assert client.post(f"/api/rule-proposals/{own['id']}/apply", json={'note': 'Applying without a replay.'}).status_code == 409
    client.post(f"/api/rule-proposals/{own['id']}/replay")
    assert client.post(f"/api/rule-proposals/{own['id']}/apply", json={'note': 'Approving my own proposal.'}).status_code == 403
    client.post(f"/api/rule-proposals/{own['id']}/discard", json={'note': 'Superseded by the reviewer proposal.'})
    switch(client, 'reviewer')
    proposal = client.post('/api/rule-proposals', json=body).json()
    replayed = client.post(f"/api/rule-proposals/{proposal['id']}/replay").json()['replay']
    assert replayed['decided'] == 14 and replayed['agreement_before'] < 0.5 and replayed['agreement_after'] == 1.0 and replayed['confirmed_missed'] == 0
    assert client.post(f"/api/rule-proposals/{proposal['id']}/apply", json={'note': 'Reviewers cannot apply.'}).status_code == 403
    switch(client, 'manager')
    applied = client.post(f"/api/rule-proposals/{proposal['id']}/apply", json={'note': 'Replay matches every reviewer decision.'})
    assert applied.status_code == 200 and applied.json()['status'] == 'Applied'
    state = client.get('/api/workspace').json()
    rule = next(r for r in state['rules'] if r['code'] == 'P02')
    assert rule['config']['qualifier_channels'] == unclear['suggestion']['config']['qualifier_channels']
    event = next(a for a in state['activity'] if a['action'] == 'Applied clarified rule')
    assert event['detail']['proposer'] != event['detail']['approver'] and event['detail']['replay']['agreement_after'] == 1.0
    rules, sources = evaluation.register()
    email = scan('Professional costs ₹1,999/month.', demo.COMPANY, 'Email', [type(rules[0])(**{**vars(rules[1]), 'config': rule['config']})], sources)[0]
    assert not email


def test_stale_replay_cannot_be_applied():
    client, _ = visitor()
    switch(client, 'reviewer')
    unclear = next(u for u in client.get('/api/insights').json()['unclear'] if u['rule_code'] == 'P02')
    proposal = client.post('/api/rule-proposals', json={'rule_id': unclear['rule_id'], 'rationale': 'Email footers already carry the GST note.', 'config': unclear['suggestion']['config']}).json()
    client.post(f"/api/rule-proposals/{proposal['id']}/replay")
    state = switch(client, 'manager')
    rule = next(r for r in state['rules'] if r['code'] == 'P02')
    edit = {k: rule[k] for k in ('source_id', 'code', 'title', 'kind', 'value', 'subject')}
    assert client.put(f"/api/rules/{rule['id']}", json={**edit, 'config': {**rule['config'], 'qualifier_text': 'plus GST'}}).status_code == 200
    assert client.post(f"/api/rule-proposals/{proposal['id']}/apply", json={'note': 'Applying a stale replay.'}).status_code == 409


def test_judgement_call_carries_to_the_corrected_version_and_it_can_be_approved():
    """Following the documented walkthrough: the reviewer accepts the GST question, the creator fixes the price."""
    client, state = visitor()
    ad = item(state, demo.AD_TITLE)
    gst = next(f for f in ad['findings'] if f['title'] == 'Check the pricing qualification')
    switch(client, 'reviewer')
    assert client.post(f"/api/content/{ad['id']}/findings/{gst['id']}/decision", json={'action': 'verify', 'reason': 'The ad footer carries the GST note.'}).status_code == 200
    switch(client, 'creator')
    body = ad['body'].replace('₹1,499 per month', '₹1,999 per month').replace('30-day', '14-day')
    body = body.replace("The world's No. 1 creative platform", 'The central workspace for campaign content').replace('Reduce your marketing production time by 80%', 'Organise your creative workflows in one place')
    assert client.put(f"/api/content/{ad['id']}", json={'body': body, 'title': ad['title'], 'expected_version': ad['version']}).status_code == 200
    rescanned = client.post(f"/api/content/{ad['id']}/scan").json()
    carried = [f for f in rescanned['findings'] if f.get('carried_from')]
    assert carried and all(f['resolved'] for f in rescanned['findings']), [f['title'] for f in rescanned['findings']]
    assert carried[0]['review']['by'] == 'Sam Rivera' and 'carried over from version 1' in carried[0]['resolution']
    assert client.post(f"/api/content/{ad['id']}/request-review").status_code == 200
    switch(client, 'reviewer')
    assert client.post(f"/api/content/{ad['id']}/approve").status_code == 200


def test_changed_wording_does_not_inherit_a_judgement():
    client, state = visitor()
    ad = item(state, demo.AD_TITLE)
    gst = next(f for f in ad['findings'] if f['title'] == 'Check the pricing qualification')
    switch(client, 'reviewer')
    client.post(f"/api/content/{ad['id']}/findings/{gst['id']}/decision", json={'action': 'verify', 'reason': 'The ad footer carries the GST note.'})
    switch(client, 'creator')
    body = ad['body'].replace('Get our Professional plan for ₹1,499 per month.', 'Professional now costs ₹1,999 per month for every team.')
    client.put(f"/api/content/{ad['id']}", json={'body': body, 'title': ad['title'], 'expected_version': ad['version']})
    rescanned = client.post(f"/api/content/{ad['id']}/scan").json()
    gst2 = next(f for f in rescanned['findings'] if f['title'] == 'Check the pricing qualification')
    assert not gst2['resolved'] and not gst2.get('carried_from')


def test_logo_text_is_exempt_from_contrast():
    from backend.engine import access, contrast_ratio
    rules, sources = evaluation.register()
    region = {'text': 'ik inkloom', 'start': 0, 'end': 10, 'page': 0, 'box': [50, 50, 150, 400], 'px': 30, 'contrast': {'fg': '#ffb27a', 'bg': '#fff8ee', 'ratio': contrast_ratio('#ffb27a', '#fff8ee'), 'method': 'test'}}
    assert access([region], [], rules, sources, demo.COMPANY, 'Advertisement')[0]
    assert not access([region], [], rules, sources, demo.COMPANY, 'Advertisement', [{'box': [48, 48, 160, 420]}])[0]


def test_decisions_are_recorded_in_finding_history():
    client, state = visitor()
    ad = item(state, demo.AD_TITLE)
    gst = next(f for f in ad['findings'] if f['title'] == 'Check the pricing qualification')
    switch(client, 'reviewer')
    client.post(f"/api/content/{ad['id']}/findings/{gst['id']}/decision", json={'action': 'confirm', 'reason': 'The ad must show + GST.'})
    p02 = next(r for r in client.get('/api/insights').json()['recurring'] if r['rule_code'] == 'P02')
    assert p02['confirmed'] == 6


def test_document_is_revised_by_uploading_the_corrected_file():
    client, state = visitor()
    brochure = item(state, demo.BROCHURE_TITLE)
    edit = client.put(f"/api/content/{brochure['id']}", json={'body': brochure['body'].replace('799', '999'), 'title': brochure['title'], 'expected_version': brochure['version']})
    assert edit.status_code == 409 and 'upload the revised file' in edit.json()['detail']
    fixed = client.get('/api/demo/assets/festive-brochure-corrected.pdf').content
    r = client.post(f"/api/content/{brochure['id']}/creative", data={'expected_version': str(brochure['version'])}, files={'file': ('festive-brochure-corrected.pdf', fixed, 'application/pdf')})
    assert r.status_code == 200, r.text
    revised = r.json()
    assert revised['version'] == brochure['version'] + 1 and revised['findings'] == [], [f['title'] + ' ' + f['span'] for f in revised['findings']]
    creative = next(c for c in client.get('/api/workspace').json()['creatives'] if c['content_id'] == brochure['id'] and c['version'] == revised['version'])
    assert creative['page_count'] == 10


def test_uncited_ai_suggestion_is_hidden_without_blocking_the_check(monkeypatch):
    """Normal use: an AI suggestion without an exact citation is never shown, and the check still completes."""
    from types import SimpleNamespace
    from backend import ai
    rules, sources = evaluation.register()
    bad = SimpleNamespace(findings=[SimpleNamespace(model_dump=lambda: {'rule_id': 'rule-V01', 'start': 0, 'end': 4, 'span': 'Plan', 'source_id': 'src-voice', 'source_version': 1, 'excerpt': 'not in the source', 'message': 'x', 'suggestion': ''})])
    monkeypatch.setattr(ai, 'available', lambda: True)
    monkeypatch.setattr(ai, 'generate', lambda *a, **k: bad)
    valid, coverage, hidden = ai.semantic('Plan your next campaign in one place.', demo.COMPANY, 'Social', rules, sources)
    assert valid == [] and hidden == 1 and not coverage.startswith('AI incomplete')


def test_ai_does_not_second_guess_a_verified_value(monkeypatch):
    """An AI suggestion on a price the rule engine verified against the same approved record is not shown."""
    from backend import ai
    client, state = visitor()
    hero = item(state, 'Pricing page hero')
    rule = next(r for r in state['rules'] if r['code'] == 'P02')
    switch(client, 'manager')
    monkeypatch.setattr(ai, 'available', lambda: True)
    client.put('/api/settings', json={'ai_enabled': False})
    assert client.put('/api/settings', json={'ai_enabled': True}).status_code == 200
    span = '₹1,999/month'
    start = hero['body'].index(span)
    pricing = next(x for x in state['sources'] if x['id'] == rule['source_id'])
    suggestion = {'id': 'ai-x', 'rule_id': rule['id'], 'rule_code': 'P02', 'outcome': 'Low Confidence', 'title': 'Suggested semantic review', 'message': 'Consider the format.', 'suggestion': '',
                  'severity': 'medium', 'span': span, 'start': start, 'end': start + len(span), 'engine': 'AI-assisted', 'resolved': False,
                  'evidence': {'source_id': pricing['id'], 'title': pricing['title'], 'version': pricing['version'], 'excerpt': pricing['excerpt'], 'owner': pricing['owner'], 'rule_value': '1999'}}
    calls = []
    monkeypatch.setattr(ai, 'semantic', lambda *a, **k: (calls.append(1), ([dict(suggestion)], 'Rules + validated gemini suggestions', 0))[1])
    monkeypatch.setattr(main, 'reserve_ai', lambda *a, **k: None)
    r = client.post(f"/api/content/{hero['id']}/scan").json()
    assert calls and r['scan_coverage'].startswith('Rules + validated')
    assert not any(f['engine'] == 'AI-assisted' for f in r['findings'])


# ---------- Check-before-publish API ----------
def test_api_key_lifecycle_and_rules_only_verdicts():
    client, _ = visitor()
    assert client.post('/api/api-keys', json={'name': 'CMS'}).status_code == 403
    switch(client, 'manager')
    created = client.post('/api/api-keys', json={'name': 'CMS publishing check'}).json()
    key = created['key']
    assert key.startswith('brk_') and 'key_hash' not in created
    listed = client.get('/api/api-keys').json()
    assert listed[0]['prefix'] == key[:10] and 'key_hash' not in listed[0] and key not in str(listed)
    cms = TestClient(main.app, base_url='https://testserver')
    assert cms.post('/api/v1/check', json={'text': 'Hello'}).status_code == 401
    assert cms.post('/api/v1/check', json={'text': 'Hello'}, headers={'Authorization': 'Bearer brk_wrong'}).status_code == 401
    auth = {'Authorization': 'Bearer ' + key}
    bad = cms.post('/api/v1/check', json={'text': 'Try Inkloom AI free for 30 days. Professional is only ₹1,499/month!', 'channel': 'Social'}, headers=auth).json()
    assert bad['verdict'] == 'blocked' and bad['ai_used'] is False and 'never approves' in bad['approval']
    assert {f['rule'] for f in bad['findings']} >= {'F02', 'P02'} and all(f['evidence'] for f in bad['findings'] if f['rule'] != 'REVIEW')
    good = cms.post('/api/v1/check', json={'text': 'Inkloom AI Professional is ₹1,999/month + GST. Start with a 14-day free trial.'}, headers=auth).json()
    assert good['verdict'] == 'clear' and good['findings'] == [] and len(good['verified']) >= 2
    review = cms.post('/api/v1/check', json={'text': 'Inkloom AI is the best tool for agencies.'}, headers=auth).json()
    assert review['verdict'] == 'needs_review'
    keys = client.get('/api/api-keys').json()
    assert keys[0]['uses'] == 3 and keys[0]['last_used']
    client.post(f"/api/api-keys/{keys[0]['id']}/revoke")
    assert cms.post('/api/v1/check', json={'text': 'Hello'}, headers=auth).status_code == 401
    trail = [a['action'] for a in client.get('/api/workspace').json()['activity']]
    assert 'Created API key' in trail and 'API check' in trail and 'Revoked API key' in trail


def test_api_submission_lands_in_the_review_queue():
    client, _ = visitor()
    switch(client, 'manager')
    key = client.post('/api/api-keys', json={'name': 'Webhook'}).json()['key']
    cms = TestClient(main.app, base_url='https://testserver')
    r = cms.post('/api/v1/check', json={'text': 'Start your 30-day free trial of Ink Loom.', 'channel': 'Email', 'title': 'Newsletter intro', 'submit': True}, headers={'Authorization': 'Bearer ' + key}).json()
    assert r['submitted']['status'] == 'Needs changes'
    queued = item(client.get('/api/workspace').json(), 'Newsletter intro')
    assert {f['rule_code'] for f in queued['findings']} >= {'F02', 'T01'}


def test_palette_check_flags_off_brand_colours_and_passes_the_corrected_ad():
    from backend import documents
    from backend.engine import palette
    rules, sources = evaluation.register()
    wrong, _, logo_box = demo.draw_ad(False)
    right, _, logo2 = demo.draw_ad(True)
    found = palette(documents.measure_colours(wrong), rules, sources, demo.COMPANY, 'Advertisement', [{'box': logo_box}])[0]
    assert len(found) == 1 and found[0]['outcome'] == 'Low Confidence' and found[0]['kind'] == 'visual'
    first = found[0]['measure']['colours'][0]
    assert first['delta_e'] > 60 and first['nearest'] in ('Violet', 'Ink violet') and found[0]['evidence']['rule_value'] == 'Approved colours'
    assert not palette(documents.measure_colours(right), rules, sources, demo.COMPANY, 'Advertisement', [{'box': logo2}])[0]
    # Evidence-gated: a palette colour missing from the approved source silences the check.
    from types import SimpleNamespace
    rule = next(r for r in rules if r.kind == 'palette')
    broken = SimpleNamespace(**{**vars(rule), 'config': {**rule.config, 'colours': {**rule.config['colours'], 'Orange': '#FF6A13'}}})
    assert not palette(documents.measure_colours(wrong), [broken], sources, demo.COMPANY, 'Advertisement')[0]

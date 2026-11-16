"""Verify public production routing and first-owner protection without credentials."""
import json
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://brandora-omega-three.vercel.app'
report = {'url': URL, 'checks': []}
with httpx.Client(base_url=URL, timeout=60, follow_redirects=False) as client:
    for path, expected in [('/', 200), ('/api/health', 200), ('/api/workspace', 401)]:
        response = client.get(path)
        assert response.status_code == expected, (path, response.status_code)
        report['checks'].append({'path': path, 'status': response.status_code})
        if path == '/api/health':
            health = response.json()
            assert health['production'] and not health['demo']
            assert health['ai_configured'] and health['vision_configured']
            assert health['setup_required']
            report['health'] = health
    response = client.post('/api/auth/demo/manager', headers={'Origin': URL})
    assert response.status_code == 404
    report['checks'].append({'path': '/api/auth/demo/manager', 'status': 404})
    body = {'name': 'Synthetic verification', 'workspace': 'Never created',
            'email': 'not-created@brandora.invalid', 'password': 'never-created-test-password',
            'setup_token': 'intentionally-incorrect-code'}
    for origin, message in [(URL, 'setup code is incorrect'), ('https://untrusted.invalid', 'Origin is not allowed')]:
        response = client.post('/api/auth/register', headers={'Origin': origin}, json=body)
        assert response.status_code == 403 and message in response.json()['detail']
        report['checks'].append({'path': '/api/auth/register', 'origin': origin, 'status': 403})
report['passed'] = True
(ROOT / 'docs/public-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))

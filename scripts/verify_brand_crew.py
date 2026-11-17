"""Read-only verification of the product's integrated public Brand Crew entry."""
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'https://brandora-omega-three.vercel.app'

def read(path):
    with urlopen(Request(base + path, headers={'User-Agent': 'Brandora-release-check/1.0'}), timeout=30) as response:
        return response.read(), response.headers, response.status

checks = []
_, root_headers, code = read('/')
assert code == 200 and root_headers.get('X-Frame-Options', '').upper() == 'DENY'
checks.append('Product root remains protected from framing')
for name in ('index.html', 'host-bridge.js', 'host.css'):
    body, headers, code = read('/brand-crew/' + name)
    digest = hashlib.sha256(body).hexdigest()
    expected = hashlib.sha256((ROOT / 'public' / 'brand-crew' / name).read_bytes()).hexdigest()
    assert code == 200 and digest == expected, f'{name}: deployed source mismatch'
    if name == 'index.html':
        assert headers.get('X-Frame-Options', '').upper() == 'SAMEORIGIN'
        assert "frame-ancestors 'self'" in headers.get('Content-Security-Policy', '')
        checks.append('Landing permits only same-origin embedding')
    checks.append(f'{name}: HTTP 200 and exact source hash')
report = {'url': base, 'passed': True, 'checks': checks}
(ROOT / 'docs' / 'brand-crew-http-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))

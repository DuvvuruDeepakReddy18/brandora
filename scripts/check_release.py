"""Check the staged source set without ever printing secret values."""
import os,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
locked=(ROOT/'backend/requirements-lock.txt').read_text().strip()
pinned='\n'.join(line for line in (ROOT/'backend/requirements.txt').read_text().splitlines() if line and not line.startswith('#'))
if pinned!=locked:raise SystemExit('Release blocked: Vercel requirements differ from the verified Python lockfile.')
files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
blocked=[]
patterns=[rb'AIza[0-9A-Za-z_-]{30,}',rb'gh[pousr]_[0-9A-Za-z]{25,}',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
values=[os.environ[k].encode() for k in ('GEMINI_API_KEY','ANTHROPIC_API_KEY','DATABASE_URL') if len(os.environ.get(k,''))>20]
for name in filter(None,files):
    if name.startswith(('.local/','.vercel/','data/','.env.production','.venv')) or name=='deployment-access.txt':blocked.append(name);continue
    data=(ROOT/name).read_bytes()
    if any(re.search(pattern,data) for pattern in patterns) or any(value in data for value in values):blocked.append(name)
if blocked:raise SystemExit('Release blocked: sensitive content or paths detected in '+', '.join(blocked))
print(f'Release scan passed for {len(list(filter(None,files)))} tracked files. No configured secrets or protected paths detected.')

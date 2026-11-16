"""Transfer explicit deployment configuration via CLI stdin; never print secrets."""
import os,secrets,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CLI=Path(os.environ['APPDATA'])/'npm/node_modules/vercel/dist/index.js'
TEAM='duvvurudeepakreddy18s-projects'
setup=ROOT/'.local/setup-token'
setup.parent.mkdir(exist_ok=True)
if not setup.exists():setup.write_text(secrets.token_urlsafe(36),encoding='utf-8')
values={'BRANDORA_ENV':'production','BRANDORA_DEMO':'0','BRANDORA_AI_PROVIDER':'gemini','GEMINI_MODEL':'gemini-3.5-flash-lite','GEMINI_API_KEY':os.environ['GEMINI_API_KEY'],'BRANDORA_SETUP_TOKEN':setup.read_text().strip(),'BRANDORA_AI_DAILY_LIMIT':'30','BRANDORA_AI_GLOBAL_LIMIT':'200','ALLOWED_ORIGINS':'https://brandora.vercel.app,https://brandora-duvvurudeepakreddy18s-projects.vercel.app'}
for key,value in values.items():
    result=subprocess.run(['node',str(CLI),'env','add',key,'production','--sensitive','--force','--yes','--scope',TEAM],input=value,text=True,capture_output=True,cwd=ROOT)
    if result.returncode:raise SystemExit(f'Failed to configure {key}; check the Vercel project settings. No secret output emitted.')
    print(f'Configured {key}',flush=True)
(ROOT/'deployment-access.txt').write_text('Brandora first workspace setup\n\nOpen the live site, choose Create your workspace, and enter your own name, email and password.\nOne-time setup code: '+values['BRANDORA_SETUP_TOKEN']+'\n\nThis code works only until the first account is created. Keep this file private. It is excluded from Git and deployment uploads.\n',encoding='utf-8')

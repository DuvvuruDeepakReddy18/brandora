"""Run regressions in a unique disposable schema, never in production tables."""
import json,os,subprocess,sys
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode,unquote
import psycopg
from psycopg import sql
ROOT=Path(__file__).resolve().parents[1]
values={}
for line in (ROOT/'.env.production.local').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1)
        values[key]=json.loads(value) if value.startswith('"') else value
url=values.get('DATABASE_URL_UNPOOLED') or values.get('POSTGRES_URL_NON_POOLING') or values['DATABASE_URL']
url=url.replace('postgresql+psycopg://','postgresql://',1)
schema='brandora_test_'+uuid4().hex
with psycopg.connect(url,autocommit=True,connect_timeout=15) as connection:
    connection.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
try:
    parts=urlsplit(url);params=dict(parse_qsl(parts.query));params['options']='-csearch_path='+schema
    test_url=urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(params),parts.fragment))
    env={**os.environ,'TEST_DATABASE_URL':test_url,'BRANDORA_ENV':'local','BRANDORA_DEMO':'1'}
    # Database-driver tracebacks may include connection dictionaries. Redact them
    # before any output leaves this process, including on failed verification.
    protected=[test_url,url,unquote(urlsplit(url).password or '')]
    protected += [v for k,v in values.items() if ('PASSWORD' in k or 'SECRET' in k or 'KEY' in k) and v]
    result=subprocess.Popen([sys.executable,'-m','pytest',*(sys.argv[1:] or ['backend/tests']),'-q'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
    for line in result.stdout:
        for value in protected:
            if value:line=line.replace(value,'[REDACTED]')
        print(line,end='',flush=True)
    result.wait()
finally:
    with psycopg.connect(url,autocommit=True,connect_timeout=15) as connection:
        connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
    print('Removed the isolated test schema; production tables were not used.')
raise SystemExit(result.returncode)

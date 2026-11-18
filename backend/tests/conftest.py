import os,tempfile
import pytest
os.environ['BRANDORA_ENV']='local'
os.environ['BRANDORA_DEMO']='1'
os.environ['BRANDORA_DATA_DIR']=tempfile.mkdtemp(prefix='brandora-test-')
# Provider keys on a developer machine must not change behaviour; tests opt in with monkeypatch.
for key in ('GEMINI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_MODEL','BRANDORA_AI_PROVIDER'):os.environ.pop(key,None)
if os.getenv('TEST_DATABASE_URL'):os.environ['DATABASE_URL']=os.environ['TEST_DATABASE_URL']
else:os.environ.pop('DATABASE_URL',None)

@pytest.fixture(autouse=True)
def no_unplanned_provider_calls(monkeypatch):
    from backend import ai
    def disabled(*args,**kwargs):raise ai.ProviderError('External provider calls are disabled in the automated regression suite.')
    monkeypatch.setattr(ai,'generate',disabled)

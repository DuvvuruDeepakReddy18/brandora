"""Interactive bootstrap for a non-demo workspace; never log passwords."""
import getpass
from sqlalchemy import select
from .models import Session, Workspace, User, Campaign
from .main import password_hash

if __name__=='__main__':
    name=input('Your name: ').strip();email=input('Email: ').strip().lower();workspace=input('Workspace: ').strip()
    password=getpass.getpass('Password (at least 12 characters): ')
    if len(password)<12 or '@' not in email or len(name)<2 or len(workspace)<2:raise SystemExit('Invalid input; no account created.')
    if password!=getpass.getpass('Confirm password: '):raise SystemExit('Passwords did not match; no account created.')
    with Session.begin() as db:
        if db.scalar(select(User).where(User.email==email)):raise SystemExit('Email already registered.')
        ws=Workspace(name=workspace,settings={'ai_enabled':False});db.add(ws);db.flush()
        db.add(User(org_id=ws.id,name=name,email=email,password=password_hash(password),role='manager'))
        db.add(Campaign(org_id=ws.id,name='First campaign',description=''))
    print('Workspace and manager account created.')

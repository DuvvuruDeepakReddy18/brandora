import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from sqlalchemy import create_engine, String, Text, Integer, ForeignKey, JSON, UniqueConstraint, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.getenv('BRANDORA_DATA_DIR', ROOT / 'data'))
URL = os.getenv('DATABASE_URL', f'sqlite:///{(DATA / "brandora.db").as_posix()}')
if URL.startswith('postgres://'):URL=URL.replace('postgres://','postgresql+psycopg://',1)
elif URL.startswith('postgresql://'):URL=URL.replace('postgresql://','postgresql+psycopg://',1)
if os.getenv('BRANDORA_ENV')=='production' and URL.startswith('sqlite'):raise RuntimeError('Production requires persistent PostgreSQL DATABASE_URL.')
if URL.startswith('sqlite'):DATA.mkdir(parents=True,exist_ok=True)
engine = create_engine(URL, connect_args={'check_same_thread': False, 'timeout': 30} if URL.startswith('sqlite') else {}, pool_pre_ping=True)
if URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
Session = sessionmaker(engine, expire_on_commit=False)

def uid(): return uuid4().hex
def now(): return datetime.now(timezone.utc).isoformat()

class Base(DeclarativeBase): pass
class Workspace(Base):
    __tablename__='workspaces'
    id: Mapped[str]=mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str]=mapped_column(String)
    revision: Mapped[int]=mapped_column(Integer,default=1)
    settings: Mapped[dict]=mapped_column(JSON,default=dict)
class User(Base):
    __tablename__='users'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    name: Mapped[str]=mapped_column(String)
    email: Mapped[str]=mapped_column(String,unique=True,index=True)
    password: Mapped[str]=mapped_column(String)
    role: Mapped[str]=mapped_column(String)
class LoginSession(Base):
    __tablename__='sessions'
    id: Mapped[str]=mapped_column(String,primary_key=True)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    expires: Mapped[str]=mapped_column(String)
class DemoVisit(Base):
    __tablename__='demo_visits'
    id: Mapped[str]=mapped_column(String,primary_key=True)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),unique=True,index=True)
    users: Mapped[dict]=mapped_column(JSON)
    active_role: Mapped[str]=mapped_column(String,default='creator')
    expires: Mapped[str]=mapped_column(String,index=True)
class Campaign(Base):
    __tablename__='campaigns'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    name: Mapped[str]=mapped_column(String)
    description: Mapped[str]=mapped_column(Text,default='')
    members: Mapped[list]=mapped_column(JSON,default=list)
class Source(Base):
    __tablename__='sources'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    title: Mapped[str]=mapped_column(String)
    owner: Mapped[str]=mapped_column(String)
    excerpt: Mapped[str]=mapped_column(Text)
    version: Mapped[int]=mapped_column(Integer,default=1)
    status: Mapped[str]=mapped_column(String,default='approved')
    review_date: Mapped[str]=mapped_column(String,default='')
    created: Mapped[str]=mapped_column(String,default=now)
class SourceVersion(Base):
    __tablename__='source_versions'
    __table_args__=(UniqueConstraint('source_id','version'),)
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    source_id: Mapped[str]=mapped_column(ForeignKey('sources.id'),index=True)
    version: Mapped[int]=mapped_column(Integer)
    snapshot: Mapped[dict]=mapped_column(JSON)
    created: Mapped[str]=mapped_column(String,default=now)
class Rule(Base):
    __tablename__='rules'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    source_id: Mapped[str]=mapped_column(ForeignKey('sources.id'))
    code: Mapped[str]=mapped_column(String)
    title: Mapped[str]=mapped_column(String)
    kind: Mapped[str]=mapped_column(String)
    value: Mapped[str]=mapped_column(String)
    subject: Mapped[str]=mapped_column(String,default='HarborDesk')
    config: Mapped[dict]=mapped_column(JSON,default=dict)
    active: Mapped[int]=mapped_column(Integer,default=1)
class Content(Base):
    __tablename__='content'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id'))
    author_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    last_editor_id: Mapped[str|None]=mapped_column(ForeignKey('users.id'),nullable=True)
    title: Mapped[str]=mapped_column(String)
    channel: Mapped[str]=mapped_column(String)
    subject: Mapped[str]=mapped_column(String)
    body: Mapped[str]=mapped_column(Text)
    language: Mapped[str]=mapped_column(String,default='en')
    language_review_required: Mapped[int]=mapped_column(Integer,default=0)
    language_review: Mapped[dict]=mapped_column(JSON,default=dict)
    version: Mapped[int]=mapped_column(Integer,default=1)
    status: Mapped[str]=mapped_column(String,default='Draft')
    findings: Mapped[list]=mapped_column(JSON,default=list)
    scan_revision: Mapped[int]=mapped_column(Integer,default=0)
    scan_hash: Mapped[str]=mapped_column(String,default='')
    scan_coverage: Mapped[str]=mapped_column(String,default='Not scanned')
    updated: Mapped[str]=mapped_column(String,default=now)
class ContentVersion(Base):
    __tablename__='content_versions'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'),index=True)
    version: Mapped[int]=mapped_column(Integer)
    body: Mapped[str]=mapped_column(Text)
    created: Mapped[str]=mapped_column(String,default=now)
class Dependency(Base):
    __tablename__='dependencies'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'),index=True)
    rule_id: Mapped[str]=mapped_column(ForeignKey('rules.id'),index=True)
    source_id: Mapped[str]=mapped_column(ForeignKey('sources.id'),index=True)
    source_version: Mapped[int]=mapped_column(Integer)
class Approval(Base):
    __tablename__='approvals'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'),index=True)
    reviewer_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    version: Mapped[int]=mapped_column(Integer)
    content_hash: Mapped[str]=mapped_column(String)
    snapshot: Mapped[dict]=mapped_column(JSON)
    created: Mapped[str]=mapped_column(String,default=now)
class Audit(Base):
    __tablename__='audit'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    actor: Mapped[str]=mapped_column(String)
    action: Mapped[str]=mapped_column(String)
    target: Mapped[str]=mapped_column(String)
    detail: Mapped[dict]=mapped_column(JSON,default=dict)
    created: Mapped[str]=mapped_column(String,default=now)
class Decision(Base):
    __tablename__='decisions'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'))
    rule_id: Mapped[str]=mapped_column(String)
    actor: Mapped[str]=mapped_column(String)
    reason: Mapped[str]=mapped_column(Text)
    outcome: Mapped[str]=mapped_column(String)
    created: Mapped[str]=mapped_column(String,default=now)
class Task(Base):
    __tablename__='tasks'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'))
    title: Mapped[str]=mapped_column(String)
    owner: Mapped[str]=mapped_column(String)
    status: Mapped[str]=mapped_column(String,default='Open')
    created: Mapped[str]=mapped_column(String,default=now)

class Quota(Base):
    __tablename__='request_quotas'
    id: Mapped[str]=mapped_column(String,primary_key=True)
    count: Mapped[int]=mapped_column(Integer,default=0)
class LogoReference(Base):
    __tablename__='logo_references'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    name: Mapped[str]=mapped_column(String)
    image: Mapped[str]=mapped_column(Text)
    active: Mapped[int]=mapped_column(Integer,default=1)
    created: Mapped[str]=mapped_column(String,default=now)
class Translation(Base):
    __tablename__='translations'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'),index=True)
    version: Mapped[int]=mapped_column(Integer)
    content_hash: Mapped[str]=mapped_column(String)
    language: Mapped[str]=mapped_column(String)
    result: Mapped[dict]=mapped_column(JSON)
    saved_content_id: Mapped[str]=mapped_column(String,default='')
    created: Mapped[str]=mapped_column(String,default=now)

class Creative(Base):
    """An uploaded or sample creative tied to one exact content version, with its annotation coordinates."""
    __tablename__='creatives'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(ForeignKey('content.id'),index=True)
    version: Mapped[int]=mapped_column(Integer)
    name: Mapped[str]=mapped_column(String,default='Creative')
    image: Mapped[str]=mapped_column(Text,default='')
    width: Mapped[int]=mapped_column(Integer,default=0)
    height: Mapped[int]=mapped_column(Integer,default=0)
    origin: Mapped[str]=mapped_column(String,default='ai')
    regions: Mapped[list]=mapped_column(JSON,default=list)
    logos: Mapped[list]=mapped_column(JSON,default=list)
    findings: Mapped[list]=mapped_column(JSON,default=list)
    warnings: Mapped[list]=mapped_column(JSON,default=list)
    alt_text: Mapped[str]=mapped_column(Text,default='')
    provider: Mapped[str]=mapped_column(String,default='')
    sha256: Mapped[str]=mapped_column(String,default='')
    created_by: Mapped[str]=mapped_column(String,default='')
    created: Mapped[str]=mapped_column(String,default=now)
    page_count: Mapped[int]=mapped_column(Integer,default=1)
    images: Mapped[list]=mapped_column(JSON,default=list)
    colours: Mapped[list]=mapped_column(JSON,default=list)

class CreativePage(Base):
    """One rendered page of a multi-page document or deck. Regions and findings refer to it by page index."""
    __tablename__='creative_pages'
    __table_args__=(UniqueConstraint('creative_id','page'),)
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    creative_id: Mapped[str]=mapped_column(ForeignKey('creatives.id'),index=True)
    page: Mapped[int]=mapped_column(Integer)
    image: Mapped[str]=mapped_column(Text,default='')
    width: Mapped[int]=mapped_column(Integer,default=0)
    height: Mapped[int]=mapped_column(Integer,default=0)

class FindingEvent(Base):
    """Every finding a check raised, with the text it was raised on and the reviewer's eventual decision.
    Guideline insights and rule replays read this history; contributors are grouped by team, never scored individually."""
    __tablename__='finding_events'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    content_id: Mapped[str]=mapped_column(String,default='',index=True)
    version: Mapped[int]=mapped_column(Integer,default=1)
    finding_id: Mapped[str]=mapped_column(String,index=True)
    rule_id: Mapped[str]=mapped_column(String,default='',index=True)
    rule_code: Mapped[str]=mapped_column(String,default='')
    outcome: Mapped[str]=mapped_column(String)
    title: Mapped[str]=mapped_column(String,default='')
    span: Mapped[str]=mapped_column(Text,default='')
    content_title: Mapped[str]=mapped_column(String,default='')
    channel: Mapped[str]=mapped_column(String,default='')
    subject: Mapped[str]=mapped_column(String,default='')
    campaign: Mapped[str]=mapped_column(String,default='')
    team: Mapped[str]=mapped_column(String,default='Internal team')
    body: Mapped[str]=mapped_column(Text,default='')
    review: Mapped[str]=mapped_column(String,default='')
    review_reason: Mapped[str]=mapped_column(Text,default='')
    review_by: Mapped[str]=mapped_column(String,default='')
    fictional: Mapped[int]=mapped_column(Integer,default=0)
    created: Mapped[str]=mapped_column(String,default=now)

class ApiKey(Base):
    """A workspace key for the check-before-publish API. Only a SHA-256 hash of the key is stored."""
    __tablename__='api_keys'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    name: Mapped[str]=mapped_column(String)
    prefix: Mapped[str]=mapped_column(String)
    key_hash: Mapped[str]=mapped_column(String,unique=True,index=True)
    created_by: Mapped[str]=mapped_column(String)
    creator: Mapped[str]=mapped_column(String,default='')
    uses: Mapped[int]=mapped_column(Integer,default=0)
    last_used: Mapped[str]=mapped_column(String,default='')
    revoked: Mapped[int]=mapped_column(Integer,default=0)
    created: Mapped[str]=mapped_column(String,default=now)

class RuleProposal(Base):
    """A clarified rule: drafted, replayed on recorded history, then applied only by a different manager."""
    __tablename__='rule_proposals'
    id: Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    org_id: Mapped[str]=mapped_column(ForeignKey('workspaces.id'),index=True)
    rule_id: Mapped[str]=mapped_column(ForeignKey('rules.id'),index=True)
    proposer_id: Mapped[str]=mapped_column(String)
    proposer: Mapped[str]=mapped_column(String)
    rationale: Mapped[str]=mapped_column(Text)
    value: Mapped[str]=mapped_column(String)
    config: Mapped[dict]=mapped_column(JSON,default=dict)
    base_hash: Mapped[str]=mapped_column(String,default='')
    status: Mapped[str]=mapped_column(String,default='Draft')
    replay: Mapped[dict]=mapped_column(JSON,default=dict)
    decided_by: Mapped[str]=mapped_column(String,default='')
    decision_note: Mapped[str]=mapped_column(Text,default='')
    created: Mapped[str]=mapped_column(String,default=now)
    decided: Mapped[str]=mapped_column(String,default='')

with engine.begin() as connection:
    if engine.dialect.name=='postgresql':connection.execute(text('SELECT pg_advisory_xact_lock(784325126)'))
    Base.metadata.create_all(connection)
    columns={c['name'] for c in inspect(connection).get_columns('content')}
    if 'last_editor_id' not in columns:
        connection.execute(text('ALTER TABLE content ADD COLUMN last_editor_id VARCHAR REFERENCES users(id)'))
    if 'language' not in columns:connection.execute(text("ALTER TABLE content ADD COLUMN language VARCHAR NOT NULL DEFAULT 'en'"))
    if 'language_review_required' not in columns:connection.execute(text('ALTER TABLE content ADD COLUMN language_review_required INTEGER NOT NULL DEFAULT 0'))
    if 'language_review' not in columns:connection.execute(text("ALTER TABLE content ADD COLUMN language_review JSON NOT NULL DEFAULT '{}'"))
    creative_columns={c['name'] for c in inspect(connection).get_columns('creatives')}
    if 'page_count' not in creative_columns:connection.execute(text('ALTER TABLE creatives ADD COLUMN page_count INTEGER NOT NULL DEFAULT 1'))
    if 'images' not in creative_columns:connection.execute(text("ALTER TABLE creatives ADD COLUMN images JSON NOT NULL DEFAULT '[]'"))
    if 'colours' not in creative_columns:connection.execute(text("ALTER TABLE creatives ADD COLUMN colours JSON NOT NULL DEFAULT '[]'"))
    event_columns={c['name'] for c in inspect(connection).get_columns('finding_events')}
    if 'review_by' not in event_columns:connection.execute(text("ALTER TABLE finding_events ADD COLUMN review_by VARCHAR NOT NULL DEFAULT ''"))

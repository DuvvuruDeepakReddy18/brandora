"""Atomic database-backed limits, committed independently of provider failures."""
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .models import Session, Quota, engine

class LimitReached(Exception):pass

def reserve(limits):
    statement=pg_insert if engine.dialect.name=='postgresql' else sqlite_insert
    with Session.begin() as db:
        for key,maximum in limits:
            q=statement(Quota).values(id=key,count=1).on_conflict_do_update(index_elements=[Quota.id],set_={'count':Quota.count+1},where=Quota.count<maximum).returning(Quota.count)
            if maximum<1 or db.execute(q).scalar_one_or_none() is None:raise LimitReached()

def day():return datetime.now(timezone.utc).date().isoformat()

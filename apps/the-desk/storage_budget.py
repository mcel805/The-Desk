import os
from pathlib import Path
import sqlite3
import time
import uuid

SCHEMA='''
CREATE TABLE IF NOT EXISTS budget_meta (
  id INTEGER PRIMARY KEY CHECK(id=1),
  external_root TEXT NOT NULL,
  limit_bytes INTEGER NOT NULL,
  base_used INTEGER NOT NULL,
  committed_bytes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_reservations (
  token TEXT PRIMARY KEY,
  owner_pid INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
'''

def path_for(policy):return Path(policy['control'])/'storage-budget.sqlite3'

def _db(path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path,timeout=15)
    db.execute('PRAGMA busy_timeout=15000');db.executescript(SCHEMA)
    return db

def _alive(pid):
    try:os.kill(pid,0);return True
    except (ProcessLookupError,PermissionError):return True
    except OSError:return False

def _clean(db):
    for token,pid in db.execute('SELECT token,owner_pid FROM budget_reservations').fetchall():
        if not _alive(pid):db.execute('DELETE FROM budget_reservations WHERE token=?',(token,))

def _ensure(db,policy,used):
    row=db.execute('SELECT * FROM budget_meta WHERE id=1').fetchone()
    if not row or row[1]!=policy['external_root'] or row[2]!=policy['limit_bytes']:
        db.execute('DELETE FROM budget_reservations')
        db.execute('INSERT OR REPLACE INTO budget_meta VALUES(1,?,?,?,0)',(policy['external_root'],policy['limit_bytes'],max(0,int(used))))

def initialize(policy,used=0):
    db=_db(path_for(policy))
    try:
        with db:
            _ensure(db,policy,used);_clean(db)
    finally:db.close()

def reconcile(policy,used):
    db=_db(path_for(policy))
    try:
        with db:
            _ensure(db,policy,used);_clean(db)
            db.execute('UPDATE budget_meta SET base_used=?,committed_bytes=0 WHERE id=1',(max(0,int(used)),))
    finally:db.close()

def snapshot(policy):
    db=_db(path_for(policy))
    try:
        with db:
            _ensure(db,policy,0);_clean(db)
            meta=db.execute('SELECT base_used,committed_bytes FROM budget_meta WHERE id=1').fetchone()
            reserved=db.execute('SELECT COALESCE(SUM(bytes),0) FROM budget_reservations').fetchone()[0]
            return max(0,meta[0]+meta[1]),max(0,int(reserved))
    finally:db.close()

class Reservation:
    def __init__(self,policy,token):self.policy=policy;self.token=token;self.done=False
    def finish(self,delta=0):
        if self.done:return
        db=_db(path_for(self.policy))
        try:
            with db:
                if db.execute('SELECT 1 FROM budget_reservations WHERE token=?',(self.token,)).fetchone():
                    db.execute('DELETE FROM budget_reservations WHERE token=?',(self.token,))
                    db.execute('UPDATE budget_meta SET committed_bytes=MAX(0,committed_bytes+?) WHERE id=1',(int(delta),))
        finally:db.close();self.done=True

def reserve(policy,requested):
    if requested<0 or type(requested) is not int:raise RuntimeError('Invalid storage reservation')
    db=_db(path_for(policy));token=uuid.uuid4().hex
    try:
        with db:
            _ensure(db,policy,0);_clean(db)
            meta=db.execute('SELECT base_used,committed_bytes FROM budget_meta WHERE id=1').fetchone()
            current=db.execute('SELECT COALESCE(SUM(bytes),0) FROM budget_reservations').fetchone()[0]
            if meta[0]+meta[1]+current+requested>policy['limit_bytes']:raise RuntimeError('External storage budget reached')
            db.execute('INSERT INTO budget_reservations VALUES(?,?,?,?)',(token,os.getpid(),requested,int(time.time())))
    finally:db.close()
    return Reservation(policy,token)

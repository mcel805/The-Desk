"""Revision-checked workspace saves. Server acknowledgement follows SQLite commit."""
import json
import time

class SettingsConflict(ValueError):
    def __init__(self,state):
        self.state=state;super().__init__('These settings changed in another tab. Your local draft is retained; review it before saving over the newer version.')

class SettingsStore:
    def __init__(self,engine):
        self.engine=engine
        with engine.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS settings_revisions(key TEXT PRIMARY KEY,revision INTEGER NOT NULL,saved_at INTEGER NOT NULL,writer TEXT NOT NULL)')

    def state(self,db=None):
        if db is None:
            with self.engine.db() as connection:return self.state(connection)
        values={r['key']:json.loads(r['value']) for r in db.execute('SELECT * FROM settings')}
        rows={r['key']:dict(r) for r in db.execute('SELECT * FROM settings_revisions')}
        return {'values':values,'revisions':{k:rows.get(k,{}).get('revision',0) for k in values},
                'saved_at':max((r['saved_at'] for r in rows.values()),default=None)}

    def commit(self,values,expected=None,writer='legacy'):
        if expected is not None and (not isinstance(expected,dict) or any(type(v) is not int or v<0 for v in expected.values()) or set(expected)!=set(values)):raise ValueError('A revision is required for each changed setting')
        if not isinstance(writer,str) or not 1<=len(writer)<=100:raise ValueError('Invalid settings writer')
        # Serialize and validate JSON before opening the write transaction.
        encoded={k:json.dumps(v,allow_nan=False,separators=(',',':')) for k,v in values.items()}
        with self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE')
            revisions={r['key']:r['revision'] for r in db.execute('SELECT key,revision FROM settings_revisions')}
            if expected is not None and any(expected[k]!=revisions.get(k,0) for k in values):raise SettingsConflict(self.state(db))
            at=int(time.time()*1000)
            for k,value in encoded.items():
                revision=revisions.get(k,0)+1;revisions[k]=revision
                db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(k,value))
                db.execute('INSERT INTO settings_revisions VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,saved_at=excluded.saved_at,writer=excluded.writer',(k,revision,at,writer))
        return {'saved':True,'revisions':revisions,'saved_at':at}

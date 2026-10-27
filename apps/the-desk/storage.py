"""Durable local storage and verified SQLite snapshots. No credentials or provider calls."""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import uuid

DATABASES=('desk.sqlite3','swing-research.sqlite3','robinhood-workspace.sqlite3')
JSON_COLUMNS={'settings':('value',),'runs':('config',),'ledger':('payload',),
              'predictions':('state','response','outcome'),'jev_usage':('pricing',),
              'collection_checkpoints':('snapshot',),'run_bars':('payload',)}

class StorageFault(RuntimeError):pass

def external_guard(additional=0):
    """Fail closed for a lost volume; never create a fake /Volumes directory."""
    policy_path=os.environ.get('DESK_STORAGE_POLICY')
    if not policy_path or os.environ.get('DESK_STORAGE_MODE')!='EXTERNAL':return
    from storage_budget import snapshot
    from storage_host import drive_ready
    policy=json.loads(Path(policy_path).read_text())
    if not drive_ready(policy):raise StorageFault('SAMSUNG USB disconnected. Connect it or choose temporary local storage in The Desk.')
    if additional:
        from storage_host import capacity_available
        available,_=capacity_available(policy,additional)
        if not available:raise StorageFault('External storage budget or free-space reserve reached. Free space or choose temporary local storage.')
    used,reserved=snapshot(policy)
    try:free=shutil.disk_usage(policy['volume']).free
    except OSError:raise StorageFault('External storage volume is unavailable.')
    reserve=64*1024*1024+additional
    if used+reserved+reserve>policy['limit_bytes'] or free<=max(64*1024*1024,reserve):raise StorageFault('External storage budget or free-space reserve reached. Free space or choose temporary local storage.')


def fsync_dir(path):
    fd=os.open(str(path),os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)

def atomic_json(path,value):
    external_guard()
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    lease=None;before=path.stat().st_size if path.exists() else 0
    policy_path=os.environ.get('DESK_STORAGE_POLICY')
    if policy_path and os.environ.get('DESK_STORAGE_MODE')=='EXTERNAL':
        from storage_budget import reserve
        lease=reserve(json.loads(Path(policy_path).read_text()),64*1024*1024)
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:
            os.chmod(tmp,0o600);json.dump(value,f,sort_keys=True,allow_nan=False);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path);fsync_dir(path.parent)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
        if lease:lease.finish((path.stat().st_size if path.exists() else 0)-before)

SWING_PAUSE_MARKER='swing-pause.json'

def _storage_control_dir(data_dir=None,control=None):
    if control:return Path(control)
    configured=os.environ.get('DESK_STORAGE_CONTROL')
    if configured:return Path(configured)
    policy_path=os.environ.get('DESK_STORAGE_POLICY')
    if policy_path:
        try:
            configured=json.loads(Path(policy_path).read_text())['control']
            if not isinstance(configured,str) or not configured:raise ValueError()
            return Path(configured)
        except (OSError,ValueError,KeyError,TypeError):
            raise StorageFault('Storage control policy is unavailable.')
    if data_dir is None:raise StorageFault('Storage control directory is unavailable.')
    return Path(data_dir)/'.storage-control'

def swing_pause_path(data_dir=None,control=None):
    return _storage_control_dir(data_dir,control)/SWING_PAUSE_MARKER

def read_swing_pause(data_dir=None,control=None):
    path=swing_pause_path(data_dir,control)
    try:
        if path.stat().st_size>4096:return {'symbol':None,'reason':'INVALID_MARKER','at':0}
        value=json.loads(path.read_text())
        if not isinstance(value,dict) or not isinstance(value.get('symbol'),str) or not value['symbol'] or not isinstance(value.get('reason'),str) or not isinstance(value.get('at'),int):raise ValueError()
        return {'symbol':value['symbol'],'reason':value['reason'],'at':value['at']}
    except FileNotFoundError:return None
    except (OSError,ValueError,TypeError, json.JSONDecodeError):return {'symbol':None,'reason':'INVALID_MARKER','at':0}

def persist_swing_pause(symbol,reason='USER_PAUSED',data_dir=None,control=None):
    if not isinstance(symbol,str) or not symbol or len(symbol)>64 or not isinstance(reason,str) or not reason or len(reason)>128:raise ValueError('Invalid Swing pause marker')
    directory=_storage_control_dir(data_dir,control);directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=directory/SWING_PAUSE_MARKER;temp=directory/('.'+path.name+'-'+uuid.uuid4().hex)
    try:
        with open(temp,'w') as f:
            os.chmod(temp,0o600);json.dump({'symbol':symbol,'reason':reason,'at':int(time.time()*1000)},f,separators=(',',':'));f.flush();os.fsync(f.fileno())
        os.replace(temp,path);fsync_dir(directory)
    finally:
        if temp.exists():temp.unlink()

def clear_swing_pause(data_dir=None,control=None):
    path=swing_pause_path(data_dir,control)
    try:path.unlink()
    except FileNotFoundError:return
    fsync_dir(path.parent)

def connect(path):
    """Every writer uses FULL sync, WAL, a bounded busy wait, and FK validation."""
    external_guard()
    lease=None;before=sum(Path(str(path)+suffix).stat().st_size for suffix in ('','-wal','-shm') if Path(str(path)+suffix).exists())
    policy_path=os.environ.get('DESK_STORAGE_POLICY')
    if policy_path and os.environ.get('DESK_STORAGE_MODE')=='EXTERNAL':
        from storage_budget import reserve
        lease=reserve(json.loads(Path(policy_path).read_text()),64*1024*1024)
    class Guarded(sqlite3.Connection):
        def __exit__(self,*args):
            try:return super().__exit__(*args)
            finally:
                if lease:self.close()
        def close(self):
            try:return super().close()
            finally:
                if lease:lease.finish(sum(Path(str(path)+suffix).stat().st_size for suffix in ('','-wal','-shm') if Path(str(path)+suffix).exists())-before)
    try:db=sqlite3.connect(str(path),timeout=15,factory=Guarded)
    except BaseException:
        if lease:lease.finish()
        raise
    db.row_factory=sqlite3.Row
    try:
        db.execute('PRAGMA busy_timeout=15000');db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA synchronous=FULL');db.execute('PRAGMA foreign_keys=ON')
        return db
    except BaseException:db.close();raise

def connect_readonly(path):
    """Read existing evidence without write guards or recursive capacity scans."""
    policy_path=os.environ.get('DESK_STORAGE_POLICY')
    if policy_path and os.environ.get('DESK_STORAGE_MODE')=='EXTERNAL':
        from storage_host import drive_ready
        if not drive_ready(json.loads(Path(policy_path).read_text())):
            raise StorageFault('External storage disconnected')
    db=sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True,timeout=3)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


@contextmanager
def transaction(path):
    db=connect(path)
    try:
        with db:yield db
    finally:db.close()

class DirectoryLock:
    """One server or installer may own a data directory, including across ports."""
    def __init__(self,directory):
        self.directory=Path(directory);self.file=None
    def acquire(self):
        self.directory.mkdir(parents=True,exist_ok=True)
        self.file=open(self.directory/'.desk-data.lock','a+')
        try:fcntl.flock(self.file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.file.close();self.file=None;raise StorageFault('This data directory is already open in another Desk process. Stop it before restoring or starting another server.')
        return self
    def close(self):
        if self.file:
            fcntl.flock(self.file,fcntl.LOCK_UN);self.file.close();self.file=None
    def __enter__(self):return self.acquire()
    def __exit__(self,*args):self.close()

def inspect_database(path):
    path=Path(path)
    with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=15) as db:
        result=[r[0] for r in db.execute('PRAGMA integrity_check')]
        if result!=['ok']:raise StorageFault('SQLite integrity check failed: '+path.name)
        if db.execute('PRAGMA foreign_key_check').fetchone():raise StorageFault('Foreign-key integrity check failed: '+path.name)
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        for table,columns in JSON_COLUMNS.items():
            if table not in tables:continue
            present={r[1] for r in db.execute('PRAGMA table_info("'+table+'")')}
            for column in set(columns)&present:
                if db.execute(f'SELECT 1 FROM "{table}" WHERE "{column}" IS NOT NULL AND NOT json_valid("{column}") LIMIT 1').fetchone():
                    raise StorageFault('Unreadable JSON: '+path.name+' / '+table+' / '+column)
        counts={t:db.execute('SELECT COUNT(*) FROM "'+t+'"').fetchone()[0] for t in sorted(tables)}
        coverage={}
        if 'predictions' in tables:
            coverage=dict(zip(('first_observation','last_observation'),db.execute('SELECT MIN(at),MAX(at) FROM predictions').fetchone()))
        return {'integrity':'ok','rows':counts,'coverage':coverage,'checked_at':int(time.time()*1000)}

def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def safe_file(root,name):
    p=Path(name)
    if p.is_absolute() or not p.parts or any(x in ('.','..') for x in p.parts):raise ValueError('Invalid backup file')
    path=Path(root)/p
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('Invalid backup file')
    return path

class DataVault:
    def __init__(self,directory,journal=None,interval=900):
        self.directory=Path(directory).resolve();self.directory.mkdir(parents=True,exist_ok=True)
        self.root=self.directory/'backups';self.root.mkdir(exist_ok=True,mode=0o700);self.root.chmod(0o700)
        self.sources={name:self.directory/name for name in DATABASES}
        if journal:self.sources['journal.sqlite3']=Path(journal).resolve()
        self.interval=interval;self.budget_bytes=512*1024*1024;self.lock=threading.RLock();self.stop=threading.Event();self.worker=None
        self.error=None;self.busy=False;self.last_check={};self.last_restore=None;self.mirror_error=None
        self.settings_path=self.directory/'backup-settings.json';self.mirror=None
        self.mirror_marker=None
        if self.settings_path.exists():
            try:
                saved=json.loads(self.settings_path.read_text());self.mirror=saved.get('mirror');self.mirror_marker=saved.get('marker')
            except (OSError,ValueError,TypeError):self.error='Backup destination settings are unreadable; local backups remain available.'
        for path in self.root.glob('.building-*'):
            if path.is_dir() and not path.is_symlink() and path.stat().st_mtime<time.time()-86400:shutil.rmtree(path)
        self.preflight()

    def preflight(self):
        for name,path in self.sources.items():
            if not path.exists():continue
            try:self.last_check[name]=inspect_database(path)
            except (sqlite3.Error,StorageFault,OSError) as e:self.last_check[name]={'integrity':'FAILED','error':str(e),'checked_at':int(time.time()*1000)}
        return not any(v['integrity']!='ok' for v in self.last_check.values())

    def writable(self,additional=0):
        external_guard(additional)
        if any(v['integrity']!='ok' for v in self.last_check.values()):raise StorageFault('Data integrity failed. Open Data & Backups; collection is stopped.')
        if shutil.disk_usage(self.directory).free<64*1024*1024:raise StorageFault('Low disk space. Free space before starting collection.')

    def catalog(self):
        rows=[]
        for folder in self.root.iterdir():
            if not folder.is_dir() or folder.name.startswith('.'):continue
            try:
                m=json.loads((folder/'manifest.json').read_text())
                if m['id']==folder.name and m['verified'] is True:rows.append(m)
            except (OSError,ValueError,KeyError):continue
        return sorted(rows,key=lambda m:m['created_at'],reverse=True)

    def snapshot(self,reason='manual'):
        if not self.lock.acquire(blocking=False):raise StorageFault('A backup or verification is already running.')
        stage=None
        try:
            self.busy=True
            reports=self.directory/'spider'
            report_sources=tuple(p for p in reports.rglob('*.json') if not p.is_symlink() and p.resolve().is_relative_to(reports.resolve())) if reports.exists() else ()
            needed=sum(p.stat().st_size for p in self.sources.values() if p.exists())+sum(p.stat().st_size for p in report_sources)+64*1024*1024
            self.writable(needed)
            if shutil.disk_usage(self.root).free<needed:raise StorageFault('Insufficient free space for a verified backup.')
            now=datetime.now(timezone.utc);sid=now.strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
            stage=Path(tempfile.mkdtemp(prefix='.building-',dir=self.root));stage.chmod(0o700)
            manifest={'version':1,'id':sid,'dataset':str(self.directory),'created_at':int(now.timestamp()*1000),'reason':reason,'verified':False,'files':{},
                      'scope':'Independent consistent SQLite snapshots; not one cross-database transaction. Credentials, keys, logs, and process files are excluded.'}
            for name,source in self.sources.items():
                if not source.exists():continue
                dest=stage/name
                src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=15);target=sqlite3.connect(dest)
                try:
                    started=time.monotonic()
                    def progress(*args):
                        if time.monotonic()-started>60:raise StorageFault('Backup timed out; previous verified snapshots are retained')
                    src.backup(target,pages=256,sleep=.01,progress=progress)
                    target.execute('PRAGMA journal_mode=DELETE')
                finally:target.close();src.close()
                dest.chmod(0o600)
                check=inspect_database(dest);self.last_check[name]=check
                # The backup API includes committed WAL frames; the output has no live sidecars.
                with open(dest,'rb') as f:os.fsync(f.fileno())
                manifest['files'][name]={'kind':'sqlite','bytes':dest.stat().st_size,'sha256':sha256(dest),**check}
            if reports.exists():
                for source in reports.rglob('*.json'):
                    if source.is_symlink() or not source.resolve().is_relative_to(reports.resolve()):continue
                    name=str(source.relative_to(self.directory));dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                    # Report writers publish complete files with atomic rename.
                    payload=source.read_bytes();json.loads(payload);dest.write_bytes(payload);dest.chmod(0o600)
                    with open(dest,'rb') as f:os.fsync(f.fileno())
                    manifest['files'][name]={'kind':'json','bytes':len(payload),'sha256':sha256(dest)}
            if not manifest['files']:raise StorageFault('No saved data exists to back up yet.')
            for folder in sorted((p for p in stage.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):fsync_dir(folder)
            manifest['verified']=True;atomic_json(stage/'manifest.json',manifest);fsync_dir(stage)
            os.replace(stage,self.root/sid);stage=None;fsync_dir(self.root);self.error=None
            if self.mirror:
                try:self.mirror_snapshot(sid);self.mirror_error=None
                except (OSError,ValueError,StorageFault) as e:self.mirror_error=type(e).__name__+': external copy unavailable'
            self.prune();return manifest
        except Exception as e:
            self.error=type(e).__name__+': '+str(e);raise
        finally:
            if stage and stage.exists():shutil.rmtree(stage)
            self.busy=False;self.lock.release()

    def manifest(self,sid):
        if not re.fullmatch(r'\d{8}T\d{12}Z-[a-f0-9]{8}',sid):raise ValueError('Invalid backup ID')
        root=self.root/sid
        if root.is_symlink():raise ValueError('Invalid backup directory')
        m=json.loads((root/'manifest.json').read_text())
        if m.get('id')!=sid or m.get('verified') is not True:raise StorageFault('Backup was not fully published')
        return m

    def verify(self,sid):
        m=self.manifest(sid);root=self.root/sid
        if not m.get('files'):raise StorageFault('Backup has no data files')
        for name,info in m['files'].items():
            path=safe_file(root,name)
            if not path.is_file() or path.stat().st_size!=info['bytes'] or sha256(path)!=info['sha256']:raise StorageFault('Backup checksum mismatch: '+name)
            if info['kind']=='sqlite':
                if name not in (*DATABASES,'journal.sqlite3'):raise ValueError('Unknown database in backup')
                if inspect_database(path)['rows']!=info['rows']:raise StorageFault('Backup row counts differ: '+name)
            elif info['kind']=='json':
                if not name.startswith('spider/') or not name.endswith('.json'):raise ValueError('Unknown report file in backup')
                json.loads(path.read_text())
            else:raise ValueError('Unknown backup data type')
        return {'id':sid,'verified':True,'files':len(m['files']),'checked_at':int(time.time()*1000)}

    def restore_copy(self,sid,destination):
        self.verify(sid);destination=Path(destination)
        if destination.exists():raise ValueError('Restore destination must be a new folder')
        destination.mkdir(parents=True,mode=0o700)
        try:
            for name in self.manifest(sid)['files']:
                dst=safe_file(destination,name);dst.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                shutil.copyfile(safe_file(self.root/sid,name),dst);dst.chmod(0o600)
                if name.endswith(('.sqlite3','.db')):inspect_database(dst)
            atomic_json(destination/'restore-manifest.json',{'backup':sid,'verified':True,'restored_at':int(time.time()*1000)})
        except BaseException:shutil.rmtree(destination);raise
        return destination

    def test_restore(self,sid):
        with self.lock:
            with tempfile.TemporaryDirectory(prefix='desk-restore-test-',dir=self.directory) as tmp:self.restore_copy(sid,Path(tmp)/'restored')
            self.last_restore={'id':sid,'passed':True,'checked_at':int(time.time()*1000)}
            atomic_json(self.directory/'last-restore-test.json',self.last_restore)
            return self.last_restore

    def set_mirror(self,value):
        if value:
            p=Path(value).expanduser()
            if not p.is_absolute():raise ValueError('Choose an absolute folder path')
            p=p.resolve()
            if p==self.directory or p.is_relative_to(self.directory) or self.directory.is_relative_to(p):raise ValueError('Choose a separate folder outside the Desk data directory')
            if len(p.parts)>2 and p.parts[1]=='Volumes' and not os.path.ismount(Path('/Volumes')/p.parts[2]):raise ValueError('Mount the selected backup drive before saving this destination')
            p.mkdir(parents=True,exist_ok=True,mode=0o700)
            if self.directory.stat().st_dev==p.stat().st_dev:device='same volume'
            else:device='separate volume'
            self.mirror=str(p)
            marker=p/'.desk-backup-destination.json'
            self.mirror_marker=json.loads(marker.read_text())['id'] if marker.exists() else uuid.uuid4().hex
            atomic_json(marker,{'id':self.mirror_marker})
        else:self.mirror=None;self.mirror_marker=None;device=None
        atomic_json(self.settings_path,{'mirror':self.mirror,'marker':self.mirror_marker});return {'mirror':self.mirror,'device':device}

    def mirror_snapshot(self,sid):
        root=Path(self.mirror)
        if not root.is_dir() or not (root/'.desk-backup-destination.json').exists() or json.loads((root/'.desk-backup-destination.json').read_text()).get('id')!=self.mirror_marker:raise StorageFault('Backup destination is not mounted or its identity changed')
        target=root/sid
        if target.exists():
            for name,info in self.manifest(sid)['files'].items():
                if sha256(safe_file(target,name))!=info['sha256']:raise StorageFault('Existing external snapshot is damaged')
            return
        stage=Path(tempfile.mkdtemp(prefix='.desk-copy-',dir=root))
        try:
            shutil.copytree(self.root/sid,stage,dirs_exist_ok=True)
            for name,info in self.manifest(sid)['files'].items():
                if sha256(safe_file(stage,name))!=info['sha256']:raise StorageFault('External backup checksum mismatch')
                with open(safe_file(stage,name),'rb') as f:os.fsync(f.fileno())
            for folder in sorted((p for p in stage.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):fsync_dir(folder)
            fsync_dir(stage);os.replace(stage,target);fsync_dir(root)
        finally:
            if stage.exists():shutil.rmtree(stage)

    def prune(self):
        self.prune_rows(self.root,self.catalog(),self.budget_bytes)
        if self.mirror and not self.mirror_error:
            root=Path(self.mirror);rows=[]
            for path in root.glob('*/manifest.json'):
                try:
                    m=json.loads(path.read_text())
                    if m.get('dataset')==str(self.directory) and m.get('verified') is True and m.get('id')==path.parent.name and re.fullmatch(r'\d{8}T\d{12}Z-[a-f0-9]{8}',m['id']):rows.append(m)
                except (OSError,ValueError,KeyError):continue
            try:self.prune_rows(root,sorted(rows,key=lambda r:r['created_at'],reverse=True),self.budget_bytes)
            except OSError:self.mirror_error='External backup retention could not finish; verified copies remain available.'

    @staticmethod
    def prune_rows(root,rows,budget):
        keep={r['id'] for r in rows[:8]};manual=[r for r in rows if r['reason']=='manual']
        keep.update(r['id'] for r in manual[:10])
        for fmt,count in (('%Y%m%d%H',24),('%Y%m%d',7),('%G%V',4)):
            seen=set()
            for r in rows:
                key=datetime.fromtimestamp(r['created_at']/1000,timezone.utc).strftime(fmt)
                if key not in seen and len(seen)<count:seen.add(key);keep.add(r['id'])
        protected={r['id'] for r in rows[:2]}
        baseline=next((r for r in rows if r['reason']=='before-rebuild'),None)
        if baseline:protected.add(baseline['id']);keep.add(baseline['id'])
        sizes={r['id']:sum(f['bytes'] for f in r['files'].values()) for r in rows};total=sum(sizes[k] for k in keep)
        for r in reversed(rows):
            if total<=budget:break
            if r['id'] in keep and r['id'] not in protected:keep.remove(r['id']);total-=sizes[r['id']]
        for r in rows:
            if r['id'] not in keep:shutil.rmtree(root/r['id'])

    def start(self):
        if self.worker and self.worker.is_alive():return
        def run():
            while not self.stop.wait(self.interval):
                try:self.snapshot('scheduled')
                except Exception:pass # Error is retained in status; a bad backup never replaces a good one.
        self.worker=threading.Thread(target=run,daemon=True,name='desk-verified-backups');self.worker.start()

    def close(self):
        self.stop.set()
        if self.worker:self.worker.join(timeout=20)

    def status(self):
        rows=self.catalog();now=int(time.time()*1000);latest=rows[0] if rows else None
        free=shutil.disk_usage(self.directory).free
        separate=None;mirror_error=self.mirror_error
        if self.mirror:
            try:
                p=Path(self.mirror);separate=p.stat().st_dev!=self.directory.stat().st_dev
                if json.loads((p/'.desk-backup-destination.json').read_text()).get('id')!=self.mirror_marker:raise OSError()
            except (OSError,ValueError):mirror_error='The configured backup destination is unavailable; local backups continue.'
        restore=self.last_restore
        if restore is None and (self.directory/'last-restore-test.json').exists():
            try:restore=json.loads((self.directory/'last-restore-test.json').read_text())
            except (OSError,ValueError):pass
        state='RECOVERY_REQUIRED' if any(v['integrity']!='ok' for v in self.last_check.values()) else 'BACKUP_ERROR' if self.error else 'NO_BACKUP' if not latest else 'STALE' if now-latest['created_at']>self.interval*2000 else 'PROTECTED'
        return {'state':state,'busy':self.busy,'error':self.error,'directory':str(self.directory),'backup_directory':str(self.root),
                'source_directory':str(Path(__file__).resolve().parent),
                'databases':self.last_check,'backups':rows,'latest':latest,'interval_seconds':self.interval,
                'disk_free_bytes':free,'disk_warning':'Low free space on the data volume. Free space or choose a separate backup volume.' if free<2*1024**3 else None,
                'backup_budget_bytes':self.budget_bytes,'backup_bytes':sum(f['bytes'] for r in rows for f in r['files'].values()),
                'mirror':self.mirror,'mirror_error':mirror_error,'mirror_on_separate_volume':separate,
                'last_restore_test':restore,
                'retention':'Latest 8, one per hour for 24 hours, one per day for 7 days, one per week for 4 weeks, and latest 10 manual snapshots, within a 512 MiB target. The newest two verified snapshots and the pre-rebuild baseline are always retained, even when they exceed that target.',
                'scope':'Desk layouts/indicators and research, Robinhood workspace records, Spider JSON reports, and Journal when configured. Login keys and credentials are excluded; reconnect accounts after recovery.',
                'protection':'Verified snapshots on the active data volume protect against application/data corruption. A copy on another physical drive is needed for disk-loss protection.'}

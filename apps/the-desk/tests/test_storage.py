import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from storage import DataVault,DirectoryLock,StorageFault,atomic_json,transaction,inspect_database,sha256
from storage_cli import install
from engine import Engine
from settings_store import SettingsStore,SettingsConflict

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'data';self.root.mkdir()
        with transaction(self.root/'desk.sqlite3') as db:
            db.execute('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');db.execute('INSERT INTO settings VALUES(?,?)',('workspace',json.dumps({'charts':[{'symbol':'hyperliquid:BTC','timeframe':'1','indicators':['test']}]})))
        with transaction(self.root/'swing-research.sqlite3') as db:
            db.execute('CREATE TABLE predictions(id TEXT PRIMARY KEY,at INTEGER,state TEXT,response TEXT,outcome TEXT)')
            db.execute('INSERT INTO predictions VALUES(?,?,?,?,?)',('saved',1000,'{"tick":1}',None,None))
        (self.root/'spider').mkdir();atomic_json(self.root/'spider/report.json',{'summary':'saved research'})
        (self.root/'robinhood-profile.key').write_bytes(b'do-not-back-up-this-secret')
        self.v=DataVault(self.root)
    def tearDown(self):self.v.close();self.tmp.cleanup()

    def test_snapshot_captures_committed_wal_and_restores_exact_rows_and_reports(self):
        writer=sqlite3.connect(self.root/'desk.sqlite3');writer.execute('INSERT INTO settings VALUES(?,?)',('pineLibrary','[{"name":"saved indicator"}]'));writer.commit()
        try:
            m=self.v.snapshot();self.assertTrue(m['verified']);self.assertNotIn('robinhood-profile.key',m['files'])
            self.assertEqual(m['files']['desk.sqlite3']['rows']['settings'],2)
            self.assertEqual(self.v.verify(m['id'])['files'],3)
            out=self.v.restore_copy(m['id'],Path(self.tmp.name)/'restored')
            self.assertEqual(inspect_database(out/'desk.sqlite3')['rows']['settings'],2)
            self.assertEqual(json.loads((out/'spider/report.json').read_text())['summary'],'saved research')
            self.assertEqual(self.v.test_restore(m['id'])['passed'],True)
            self.assertEqual((self.v.root/m['id']).stat().st_mode&0o077,0)
        finally:writer.close()

    def test_interrupted_transaction_rolls_back_and_leaves_a_recoverable_committed_database(self):
        code="import os;from storage import transaction;import sys\nwith transaction(sys.argv[1]) as db:\n db.execute(\"INSERT INTO settings VALUES('committed','1')\")\nwith transaction(sys.argv[1]) as db:\n db.execute(\"INSERT INTO settings VALUES('uncommitted','2')\");os._exit(0)"
        subprocess.run([sys.executable,'-B','-c',code,str(self.root/'desk.sqlite3')],check=True)
        with transaction(self.root/'desk.sqlite3') as db:
            self.assertIsNotNone(db.execute("SELECT 1 FROM settings WHERE key='committed'").fetchone());self.assertIsNone(db.execute("SELECT 1 FROM settings WHERE key='uncommitted'").fetchone())
        self.assertEqual(inspect_database(self.root/'desk.sqlite3')['integrity'],'ok');self.v.snapshot()

    def test_incomplete_snapshot_never_publishes_or_replaces_a_verified_backup(self):
        good=self.v.snapshot();old=sha256(self.v.root/good['id']/'desk.sqlite3')
        with patch('storage.inspect_database',side_effect=StorageFault('injected verification failure')):
            with self.assertRaises(StorageFault):self.v.snapshot()
        self.assertEqual(len(self.v.catalog()),1);self.assertEqual(sha256(self.v.root/good['id']/'desk.sqlite3'),old)
        self.assertFalse(any(p.name.startswith('.building-') for p in self.v.root.iterdir()))

    def test_corrupt_backup_and_path_traversal_are_rejected_before_restore(self):
        m=self.v.snapshot();path=self.v.root/m['id']/'desk.sqlite3';path.write_bytes(b'corrupt')
        with self.assertRaises(StorageFault):self.v.restore_copy(m['id'],Path(self.tmp.name)/'bad-copy')
        self.assertFalse((Path(self.tmp.name)/'bad-copy').exists())
        with self.assertRaises(ValueError):self.v.verify('../outside')

    def test_corrupt_source_stops_writes_and_keeps_verified_history(self):
        good=self.v.snapshot();(self.root/'swing-research.sqlite3').write_bytes(b'broken sqlite')
        self.assertFalse(self.v.preflight());self.assertEqual(self.v.status()['state'],'RECOVERY_REQUIRED')
        with self.assertRaises(StorageFault):self.v.snapshot()
        self.assertTrue(self.v.verify(good['id'])['verified'])

    def test_install_refuses_live_directory_and_preserves_previous_database(self):
        m=self.v.snapshot();before=sha256(self.root/'desk.sqlite3')
        with DirectoryLock(self.root):
            with self.assertRaises(StorageFault):install(self.v,m['id'],'desk.sqlite3')
        self.assertEqual(sha256(self.root/'desk.sqlite3'),before)
        with transaction(self.root/'desk.sqlite3') as db:db.execute("INSERT INTO settings VALUES('newer','2')")
        result=install(self.v,m['id'],'desk.sqlite3')
        self.assertTrue((Path(result['previous_files'])/'desk.sqlite3').exists())
        self.assertEqual(inspect_database(self.root/'desk.sqlite3')['rows']['settings'],1)
        with self.assertRaises(ValueError):install(self.v,m['id'],'journal.sqlite3')

    def test_unavailable_mirror_does_not_create_a_fake_replacement_destination(self):
        mirror=Path(self.tmp.name)/'external';self.v.set_mirror(str(mirror));first=self.v.snapshot()
        self.assertTrue((mirror/first['id']/'manifest.json').exists())
        mirror.rename(Path(self.tmp.name)/'unmounted');second=self.v.snapshot()
        self.assertFalse(mirror.exists());self.assertIsNotNone(self.v.mirror_error);self.assertTrue(self.v.verify(second['id'])['verified'])
        with self.assertRaises(ValueError):self.v.set_mirror(str(self.root/'nested'))

    def test_atomic_json_keeps_the_old_document_when_publication_fails(self):
        path=self.root/'document.json';atomic_json(path,{'version':1})
        with patch('storage.os.replace',side_effect=OSError('injected disk failure')):
            with self.assertRaises(OSError):atomic_json(path,{'version':2})
        self.assertEqual(json.loads(path.read_text()),{'version':1})

    def test_retention_keeps_recent_manual_snapshots_without_touching_preserved_corruption(self):
        preserved=self.root/'swing-research.corrupt-original.sqlite3';preserved.write_bytes(b'preserved original')
        for _ in range(12):self.v.snapshot('manual')
        self.assertEqual(len(self.v.catalog()),10);self.assertEqual(preserved.read_bytes(),b'preserved original')

    def test_scheduler_is_single_instance_and_continues_after_a_failed_attempt(self):
        import threading
        done=threading.Event();calls=[];self.v.interval=.01
        def attempt(reason):
            calls.append(reason)
            if len(calls)==1:raise StorageFault('injected attempt failure')
            done.set()
        with patch.object(self.v,'snapshot',side_effect=attempt):
            self.v.start();worker=self.v.worker;self.v.start()
            self.assertIs(self.v.worker,worker);self.assertTrue(done.wait(2));self.v.close()
        self.assertGreaterEqual(len(calls),2)

    def test_capacity_rotation_preserves_the_newest_two_verified_snapshots(self):
        first=self.v.snapshot();size=sum(f['bytes'] for f in first['files'].values());self.v.budget_bytes=size*2
        ids=[first['id']]+[self.v.snapshot()['id'] for _ in range(5)]
        kept=self.v.catalog();self.assertEqual(len(kept),2);self.assertEqual({r['id'] for r in kept},set(ids[-2:]))
        for r in kept:self.assertTrue(self.v.verify(r['id'])['verified'])

class SettingsStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.engine=Engine(Path(self.tmp.name)/'desk.sqlite3');self.store=SettingsStore(self.engine)
    def tearDown(self):self.tmp.cleanup()
    def test_stale_tab_cannot_overwrite_newer_layout_or_partially_change_other_keys(self):
        a=self.store.commit({'workspace':{'layout':'1'},'pineLibrary':['original']},{'workspace':0,'pineLibrary':0},'tab-a')
        b=self.store.commit({'workspace':{'layout':'4'}},{'workspace':a['revisions']['workspace']},'tab-b')
        with self.assertRaises(SettingsConflict):self.store.commit({'workspace':{'layout':'2'},'pineLibrary':['stale']},{'workspace':1,'pineLibrary':1},'tab-a')
        self.assertEqual(self.store.state()['values'],{'workspace':{'layout':'4'},'pineLibrary':['original']})
        self.assertEqual(self.store.state()['revisions']['workspace'],b['revisions']['workspace'])
    def test_committed_settings_survive_reopening_and_keep_full_sync(self):
        self.store.commit({'workspace':{'charts':[{'indicators':['saved'],'timeframe':'1'}]}},{'workspace':0},'tab')
        reopened=SettingsStore(Engine(self.engine.path));self.assertEqual(reopened.state()['values']['workspace']['charts'][0]['indicators'],['saved'])
        with self.engine.db() as db:self.assertEqual(db.execute('PRAGMA synchronous').fetchone()[0],2);self.assertEqual(db.execute('PRAGMA journal_mode').fetchone()[0],'wal')

if __name__=='__main__':unittest.main()

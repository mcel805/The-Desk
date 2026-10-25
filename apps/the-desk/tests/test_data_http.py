"""Isolated local API acceptance. No live accounts, model requests or source data."""
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen
import zipfile
from engine import Engine
from storage import DataVault,sha256

ROOT=Path(__file__).resolve().parents[1]
class DataHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.data=Path(self.tmp.name)/'data';self.data.mkdir();self.proc=None
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));self.port=sock.getsockname()[1]
        self.url='http://127.0.0.1:'+str(self.port)
    def tearDown(self):
        if self.proc:
            self.proc.terminate();self.proc.wait(timeout=25);self.proc.stderr.close()
        self.tmp.cleanup()
    def start(self):
        env={**os.environ,'DESK_JEV_KEYCHAIN':'disabled','DESK_STORAGE_MANAGED':'1'}
        for k in ('TYPESAFE_API_KEY','DESK_JOURNAL_DB_PATH'):env.pop(k,None)
        self.proc=subprocess.Popen([sys.executable,'-B','server.py','--port',str(self.port),'--data-dir',str(self.data),'--no-workers'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        for _ in range(120):
            if self.proc.poll() is not None:raise RuntimeError(self.proc.stderr.read().decode())
            try:self.request('/api/data/status');return
            except OSError:time.sleep(.05)
        raise RuntimeError('Data service fixture did not start')
    def request(self,path,body=None,origin=True):
        headers={'Content-Type':'application/json'}
        if origin:headers['Origin']=self.url
        req=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        with urlopen(req,timeout=10) as r:return json.load(r)

    def test_backup_verify_restore_download_and_revision_checked_settings(self):
        self.start();state=self.request('/api/data/status');self.assertEqual(state['state'],'PROTECTED')
        before=self.request('/api/state')
        with self.assertRaises(HTTPError) as err:self.request('/api/data/backup',{},origin=False)
        self.assertEqual(err.exception.code,403)
        initial=self.request('/api/settings/state');revision=initial['revisions'].get('workspace',0)
        save=self.request('/api/settings/commit',{'values':{'workspace':{'layout':'4'}},'expected':{'workspace':revision},'writer':'test'})
        self.assertTrue(save['saved'])
        with self.assertRaises(HTTPError) as err:self.request('/api/settings/commit',{'values':{'workspace':{'layout':'1'}},'expected':{'workspace':revision},'writer':'stale'})
        self.assertEqual(err.exception.code,409);self.assertEqual(self.request('/api/settings')['workspace']['layout'],'4')
        backup=self.request('/api/data/backup',{});self.assertTrue(self.request('/api/data/verify',{'id':backup['id']})['verified'])
        self.assertTrue(self.request('/api/data/test-restore',{'id':backup['id']})['passed'])
        with urlopen(self.url+'/api/data/download?id='+backup['id']) as r:payload=r.read()
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            self.assertIn('manifest.json',z.namelist());self.assertIn('desk.sqlite3',z.namelist());self.assertNotIn('robinhood-profile.key',z.namelist())
        after=self.request('/api/state')
        for key in ('orders','positions','fills','accounts'):self.assertEqual(before[key],after[key])

    def test_corrupt_source_starts_read_only_recovery_page_and_preserves_original(self):
        engine=Engine(self.data/'desk.sqlite3')
        with engine.db() as db:db.execute("INSERT INTO settings VALUES('workspace','{\"layout\":\"4\"}')")
        vault=DataVault(self.data);good=vault.snapshot();(self.data/'desk.sqlite3').write_bytes(b'corrupt database')
        fingerprint=sha256(self.data/'desk.sqlite3');self.start()
        self.assertEqual(self.request('/api/data/status')['state'],'RECOVERY_REQUIRED')
        for path in ('/api/state','/api/settings'):
            with self.assertRaises(HTTPError) as err:self.request(path)
            self.assertEqual(err.exception.code,503)
        with self.assertRaises(HTTPError):self.request('/api/swing/control',{'action':'start','symbol':'hyperliquid:BTC'})
        self.assertTrue(self.request('/api/data/test-restore',{'id':good['id']})['passed'])
        self.assertEqual(sha256(self.data/'desk.sqlite3'),fingerprint)
        with urlopen(self.url+'/data-health.html') as r:self.assertIn(b'Your data, collection',r.read())

if __name__=='__main__':unittest.main()

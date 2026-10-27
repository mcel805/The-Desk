"""Account-free integration tests against isolated local server processes."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
ROOT=Path(__file__).resolve().parents[1]

class IBKRHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='desk-ibkr-http-')
        with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port)
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(cls.port),
            '--data-dir',cls.temp.name,'--no-workers','--ibkr-mode','demo'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,env={**os.environ,'DESK_STORAGE_MANAGED':'1'})
        try:
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                if cls.proc.poll() is not None:raise RuntimeError(cls.proc.stderr.read().decode())
                try:cls.request('/api/health');return
                except OSError:time.sleep(.05)
            raise RuntimeError('Isolated Desk did not start')
        except BaseException:
            cls.tearDownClass();raise
    @classmethod
    def tearDownClass(cls):
        if cls.proc.poll() is None:
            cls.proc.terminate()
            try:cls.proc.wait(5)
            except subprocess.TimeoutExpired:cls.proc.kill();cls.proc.wait()
        cls.proc.stderr.close();cls.temp.cleanup()
    @classmethod
    def request(cls,path,payload=None,headers=None):
        req=Request(cls.base+path,data=None if payload is None else json.dumps(payload).encode(),
                    headers={'Content-Type':'application/json',**(headers or {})})
        with urlopen(req,timeout=10) as response:return json.load(response)
    def test_demo_is_separate_from_engine_and_cannot_trade(self):
        health=self.request('/api/health');self.assertEqual(health['ibkr']['mode'],'DEMO_DATA')
        before=self.request('/api/state')
        self.assertEqual(before['quotes'],{})
        with self.assertRaises(HTTPError) as err:
            self.request('/api/command',{'action':'order','payload':{'account_id':before['active_account'],
                'instrument':'ibkr:MYM-202612','side':'buy','kind':'market','qty':'1'}},{'Idempotency-Key':'ibkr-rejection'})
        self.assertEqual(err.exception.code,400)
        after=self.request('/api/state');self.assertEqual(after['orders'],before['orders']);self.assertEqual(after['fills'],before['fills'])
    def test_bars_and_input_validation(self):
        data=self.request('/api/ibkr/bars?instrument=ibkr:MYM-202612&timeframe=1m&limit=10')
        self.assertEqual(len(data['bars']),10);self.assertTrue(data['read_only']);self.assertFalse(data['orders_enabled'])
        for suffix in ['instrument=ibkr:MYM-202603','instrument=ibkr:MYM-202612&timeframe=1w',
                       'instrument=ibkr:MYM-202612&from=nan','instrument=ibkr:MYM-202612&limit=-1']:
            with self.subTest(suffix=suffix),self.assertRaises(HTTPError) as err:self.request('/api/ibkr/bars?'+suffix)
            self.assertEqual(err.exception.code,400)
    def test_disconnect_resume_and_origin_boundary(self):
        try:
            paused=self.request('/api/ibkr/demo',{'paused':True});self.assertFalse(paused['connected'])
            data=self.request('/api/ibkr/bars?instrument=ibkr:MYM-202612');self.assertTrue(data['history_stale'])
            for headers in [{'Origin':'https://example.org'},{'Host':'example.org'}]:
                with self.subTest(headers=headers),self.assertRaises(HTTPError) as err:self.request('/api/ibkr/status',headers=headers)
                self.assertEqual(err.exception.code,403)
            with self.assertRaises(HTTPError) as err:self.request('/api/ibkr/demo',{'paused':False},{'Origin':'null'})
            self.assertEqual(err.exception.code,403)
        finally:self.request('/api/ibkr/demo',{'paused':False})
        resumed=self.request('/api/ibkr/status');self.assertTrue(resumed['connected']);self.assertEqual(resumed['mode'],'DEMO_DATA')
        for invalid in [{'paused':'false'},{'paused':False,'mode':'gateway'},[]]:
            with self.subTest(invalid=invalid),self.assertRaises(HTTPError) as err:self.request('/api/ibkr/demo',invalid)
            self.assertEqual(err.exception.code,400)

if __name__=='__main__':unittest.main()

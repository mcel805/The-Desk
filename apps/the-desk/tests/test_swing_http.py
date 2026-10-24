"""Research API boundary: isolated server, worker disabled in this fixture, no network."""
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

ROOT=Path(__file__).resolve().parents[1]
class SwingHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='desk-swing-http-')
        with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port)
        env={**os.environ};env.pop('TYPESAFE_API_KEY',None)
        # Explicitly disable the research worker only inside this test process.
        code='import swing_research; swing_research.SwingResearch.start=lambda self:None; import server; server.main()'
        cls.proc=subprocess.Popen([sys.executable,'-c',code,'--port',str(cls.port),'--data-dir',cls.tmp.name,'--no-workers'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if cls.proc.poll() is not None:raise RuntimeError(cls.proc.stderr.read().decode())
                try:cls.request('/api/swing/status');return
                except OSError:time.sleep(.05)
            raise RuntimeError('Research API fixture timeout')
        except BaseException:cls.tearDownClass();raise
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.wait(timeout=5);cls.proc.stderr.close();cls.tmp.cleanup()
    @classmethod
    def request(cls,path,body=None,headers=None):
        req=Request(cls.base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**(headers or {})})
        with urlopen(req,timeout=3) as r:return json.load(r)
    def test_pause_configure_start_have_no_order_or_account_effects(self):
        before=self.request('/api/state')
        self.request('/api/swing/control',{'action':'configure','symbol':'hyperliquid:ETH','config':{'cadence_seconds':15,'quantity':.01}})
        s=self.request('/api/swing/control',{'action':'start','symbol':'hyperliquid:ETH'})
        self.assertTrue(s['symbols']['hyperliquid:ETH']['running'])
        self.request('/api/swing/control',{'action':'pause','symbol':'hyperliquid:ETH'})
        after=self.request('/api/state')
        for key in ('orders','positions','fills','accounts'):self.assertEqual(before[key],after[key])
        e=self.request('/api/swing/export?symbol=hyperliquid:ETH')
        self.assertEqual(e['execution'],'none');self.assertTrue(e['runs']);self.assertFalse(self.request('/api/swing/status')['jev_configured'])
    def test_invalid_symbols_cadence_key_and_cross_origin_rejected(self):
        for p in [{'action':'start','symbol':'coinbase:BTC-USD'}, {'action':'configure','symbol':'hyperliquid:BTC','config':{'cadence_seconds':1}}, {'action':'configure','symbol':'hyperliquid:BTC','config':{'jev_enabled':True}}]:
            with self.assertRaises(HTTPError) as e:self.request('/api/swing/control',p)
            self.assertEqual(e.exception.code,400)
        with self.assertRaises(HTTPError) as e:self.request('/api/swing/control',{'action':'pause','symbol':'hyperliquid:BTC'},{'Origin':'https://external.example'})
        self.assertEqual(e.exception.code,403)
        with self.assertRaises(HTTPError) as e:self.request('/api/swing/status',headers={'Host':'external.example'})
        self.assertEqual(e.exception.code,403)
    def test_ui_and_module_are_served_without_model_or_order_keys(self):
        with urlopen(self.base+'/swing-lab.html') as r:html=r.read().decode()
        self.assertIn('Swing Tracker / Decision Lab',html)
        self.assertIn('4× / minute',html)
        self.assertIn('id="jevApiKey"',html)
        self.assertIn('type="password"',html)
        self.assertNotIn('Authorization: Bearer',html)
        self.assertEqual(self.request('/api/swing/history?symbol=hyperliquid:BTC')['metrics']['n'],0)

    def test_key_route_requires_browser_origin_and_returns_presence_only(self):
        key='test-only-http-key-never-sent-to-provider'
        for headers in ({},{'Origin':'https://external.example'}):
            with self.assertRaises(HTTPError) as e:self.request('/api/swing/key',{'api_key':key},headers)
            self.assertEqual(e.exception.code,403)
        try:
            result=self.request('/api/swing/key',{'api_key':key},{'Origin':self.base})
            self.assertTrue(result['configured']);self.assertFalse(result['verified'])
            self.assertNotIn(key,json.dumps(result))
            status=self.request('/api/swing/status')
            self.assertEqual(status['jev_key_source'],'server_memory')
            self.assertNotIn(key,json.dumps(status))
            self.assertNotIn(key,json.dumps(self.request('/api/swing/export?symbol=hyperliquid:BTC')))
        finally:self.request('/api/swing/key',{'api_key':''},{'Origin':self.base})
        self.assertFalse(self.request('/api/swing/status')['jev_configured'])

if __name__=='__main__':unittest.main()

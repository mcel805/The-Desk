"""Actual loopback HTTP checks with isolated SQLite and no market workers."""
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError

class AgentsHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.root=Path(__file__).resolve().parents[1]
        with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port)
        cls.proc=subprocess.Popen([sys.executable,'-B','server.py','--port',str(cls.port),'--data-dir',cls.temp.name,'--no-workers'],cwd=cls.root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen(cls.base+'/api/health',timeout=.2):break
            except Exception:
                if cls.proc.poll() is not None:raise RuntimeError('Isolated server failed.')
                time.sleep(.05)
        else:cls.proc.terminate();raise RuntimeError('Isolated server unavailable.')
    @classmethod
    def tearDownClass(cls):cls.proc.terminate();cls.proc.wait(timeout=5);cls.temp.cleanup()
    def request(self,path,payload=None,origin=None):
        req=Request(self.base+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json','Origin':self.base if origin is None else origin})
        with urlopen(req,timeout=5) as r:return json.load(r)
    def test_state_exposes_paused_demo_and_honest_venue_capabilities(self):
        s=self.request('/api/agents/state');self.assertFalse(s['liveEnabled']);self.assertEqual(len(s['adapters']),6)
        self.assertEqual(next(a for a in s['agents'] if a['name']=='Test Agent')['state'],'paused')
        self.assertEqual([a['id'] for a in s['adapters'] if a['submit']],['simulation'])
    def test_foreign_and_missing_origin_mutations_rejected(self):
        for origin in ('https://foreign.example','null',''):
            with self.assertRaises(HTTPError) as e:self.request('/api/agents/control',{'action':'pause-all'},origin)
            self.assertEqual(e.exception.code,403)
    def test_profile_save_revision_and_export(self):
        a=next(a for a in self.request('/api/agents/state')['agents'] if a['name']=='Test Agent')
        c={k:a[k] for k in ('name','avatar','color','description','mode','account','instrument','modules')};c['name']='HTTP fixture'
        saved=self.request('/api/agents/save',c);d=self.request('/api/agents/export?id='+saved['id'])
        self.assertEqual(d['agent']['name'],'HTTP fixture');self.assertEqual(d['runs'],[])
        self.assertEqual(d['coverage'],'All durable records.')
    def test_no_live_execution_or_generic_tool_passthrough(self):
        for path in ('/api/agents/submit','/api/agents/tools/call'):
            with self.assertRaises(HTTPError) as e:self.request(path,{'tool':'place_crypto_order'})
            self.assertEqual(e.exception.code,404)
    def test_replay_context_is_visible_but_cannot_arm_without_quote(self):
        context={'instrument':'hyperliquid:BTC','timeframe':'1','observedAt':time.time(),'replay':True,'levels':[]}
        self.assertTrue(self.request('/api/agents/chart',context)['replay'])
        a=next(a for a in self.request('/api/agents/state')['agents'] if a['name']=='Test Agent')
        with self.assertRaises(HTTPError) as e:self.request('/api/agents/control',{'action':'arm','id':a['id'],'revision':a['revision']})
        self.assertEqual(e.exception.code,400)

if __name__=='__main__':unittest.main()

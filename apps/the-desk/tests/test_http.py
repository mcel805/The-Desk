"""Opt-in tests against loopback QA only; never targets the production port."""
import json
import math
import os
from pathlib import Path
import unittest
import uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE='http://127.0.0.1:18881'
ROOT=Path(__file__).resolve().parents[1]
def request(path,payload=None,headers=None,raw=None):
    data=raw if raw is not None else json.dumps(payload).encode() if payload is not None else None
    req=Request(BASE+path,data=data,headers={'Content-Type':'application/json',**(headers or {})})
    with urlopen(req,timeout=30) as r:return json.load(r)
def command(action,payload,key=None):return request('/api/command',{'action':action,'payload':payload},{'Idempotency-Key':key or str(uuid.uuid4())})
@unittest.skipUnless(os.environ.get('DESK_QA_HTTP')=='1','Requires isolated QA Desk port 18881')
class HttpTests(unittest.TestCase):
    def test_health_and_six_fresh_books(self):
        self.assertTrue((ROOT/'qa-data/desk.sqlite3').is_file())
        h=request('/api/health');self.assertEqual(h['application'],'The Desk');self.assertEqual(h['mode'],'paper')
        s=request('/api/state');self.assertEqual(len(s['quotes']),6)
        for i,q in s['quotes'].items():
            with self.subTest(i=i):
                self.assertLess(q['age'],15);self.assertLessEqual(float(q['bid']),float(q['ask']));self.assertTrue(q['book']['bids']);self.assertTrue(q['book']['asks'])
    def test_idempotent_http_order_and_scoped_export(self):
        a=command('account',{'name':'HTTP QA','capital':'10000','fee_bps':'5','leverage':'1'})['id']
        p={'account_id':a,'instrument':'hyperliquid:BTC','side':'buy','kind':'market','qty':'.001','price':'1'}
        key=str(uuid.uuid4());one=command('order',p,key);two=command('order',p,key)
        self.assertEqual(one['id'],two['id']);self.assertGreater(float(one['filled_price']),1)
        s=request('/api/state?account_id='+a);self.assertEqual(len(s['fills']),1)
        pos=s['positions'][0];command('close',{'account_id':a,'id':pos['id'],'revision':pos['revision']})
        exported=request('/api/export?account_id='+a);self.assertEqual(len(exported['fills']),2)
        self.assertTrue(all(f['account_id']==a for f in exported['fills']));self.assertEqual(exported['mode'],'PAPER · SIMULATED')
    def test_error_contracts(self):
        cases=[('/api/command',{},None,400),('/api/command',{'action':'order','payload':{}},None,400),('/api/unknown',{},None,404),('/api/settings',{'secret':'x'},None,400),('/api/command',None,b'{bad',400),('/api/command',None,b'[]',400),('/api/command',None,b'',413)]
        for path,payload,raw,code in cases:
            with self.subTest(path=path,raw=raw):
                with self.assertRaises(HTTPError) as err:request(path,payload,raw=raw)
                self.assertEqual(err.exception.code,code);self.assertIn('error',json.load(err.exception))
        for path in ['/api/unknown','/api/export?account_id=missing','/api/bars?instrument=unsupported','/api/bars?timeframe=not-an-interval']:
            with self.subTest(path=path):
                with self.assertRaises(HTTPError) as err:request(path)
                self.assertIn(err.exception.code,[400,404])
    def test_mutation_origin_host_and_missing_auth_boundary(self):
        for headers in [{'Origin':'null'},{'Origin':'https://untrusted.example'},{'Host':'untrusted.example'},{'Content-Type':'text/plain'}]:
            with self.subTest(headers=headers):
                with self.assertRaises(HTTPError) as err:request('/api/settings',{},headers)
                self.assertEqual(err.exception.code,403)
    def test_settings_roundtrip_without_clobbering_other_keys(self):
        before=request('/api/settings')
        try:
            marker={'theme':'light','qa':str(uuid.uuid4())};request('/api/settings',{'appearance':marker})
            after=request('/api/settings');self.assertEqual(after['appearance'],marker)
            for key,value in before.items():
                if key!='appearance':self.assertEqual(after[key],value)
        finally:request('/api/settings',{'appearance':before.get('appearance',{'theme':'dark'})})
    def test_pine_library_source_roundtrip_and_limits(self):
        before=request('/api/settings').get('pineLibrary',[])
        script={'name':'HTTP Pine test','source':'//@version=6\nindicator("Test")\nplot(close)','version':'6'}
        try:
            request('/api/settings',{'pineLibrary':[script]})
            self.assertEqual(request('/api/settings')['pineLibrary'],[script])
            for invalid in [[script]*7,{},[{'name':'missing source'}],[dict(script,source='x'*250001)]]:
                with self.subTest(invalid_type=type(invalid).__name__):
                    with self.assertRaises(HTTPError) as error:request('/api/settings',{'pineLibrary':invalid})
                    self.assertEqual(error.exception.code,400)
            self.assertEqual(request('/api/settings')['pineLibrary'],[script])
        finally:request('/api/settings',{'pineLibrary':before})
    def test_server_retry_endpoint(self):self.assertTrue(request('/api/journal/retry',{})['queued'])

if __name__=='__main__':unittest.main()

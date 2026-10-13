"""Self-contained HTTP contract checks; ephemeral loopback port and database."""
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.request import build_opener,HTTPCookieProcessor,Request,urlopen
from urllib.error import HTTPError
from funding_routes import FundingRoutes
try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
except ImportError:Account=None

@unittest.skipUnless(Account is not None,'Install requirements-wallet.txt for wallet HTTP tests')
class FundingHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();root=Path(__file__).resolve().parents[1]
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port)
        cls.proc=subprocess.Popen([sys.executable,str(root/'server.py'),'--port',str(cls.port),'--data-dir',cls.temp.name,'--no-workers'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen(cls.base+'/api/health',timeout=.2):break
            except Exception:
                if cls.proc.poll() is not None:raise RuntimeError('Isolated Desk failed to start')
                time.sleep(.05)
        else:cls.proc.terminate();raise RuntimeError('Isolated Desk did not become healthy')
    @classmethod
    def tearDownClass(cls):cls.proc.terminate();cls.proc.wait(timeout=5);cls.temp.cleanup()
    def setUp(self):self.cookies=http.cookiejar.CookieJar();self.client=build_opener(HTTPCookieProcessor(self.cookies));self.wallet=Account.create()
    def request(self,path,p=None,headers=None):
        req=Request(self.base+path,data=json.dumps(p).encode() if p is not None else None,headers={'Content-Type':'application/json','Origin':self.base,**(headers or {})})
        with self.client.open(req,timeout=5) as response:return json.load(response)
    def login(self):
        c=self.request('/api/wallet/challenge',{'address':self.wallet.address})
        sig=Account.sign_message(encode_defunct(text=c['message']),private_key=self.wallet.key).signature.hex()
        return self.request('/api/wallet/verify',{'address':self.wallet.address,**c,'signature':sig})
    def test_http_wallet_cookie_replay_logout_and_paper_mode(self):
        self.assertTrue(self.login()['authenticated']);session=self.request('/api/wallet/session');self.assertEqual(session['address'],self.wallet.address)
        cookie=next(iter(self.cookies));self.assertIn('HttpOnly',cookie._rest);self.assertEqual(cookie._rest['SameSite'],'Lax')
        self.assertEqual(self.request('/api/health')['mode'],'paper')
        self.request('/api/wallet/logout',{});self.assertFalse(self.request('/api/wallet/session')['authenticated'])
    def test_live_submit_and_client_acknowledgement_routes_are_unavailable(self):
        self.login();settings=self.request('/api/integrations');self.assertFalse(settings['liveEnabled']);self.assertFalse(settings['hyperliquidLiveEnabled']);self.assertTrue(settings['walletVerificationAvailable'])
        self.assertNotIn('token',self.request('/api/wallet/session'))
        for path,payload in [
            ('/api/robinhood/submit',{'id':'invented','confirmation':'PLACE LIVE ORDER'}),
            ('/api/integrations/hyperliquid/acknowledge',{'network':'testnet','clientOrderId':'0x'+'a'*32,'state':'filled','venueOrderId':'1'}),
        ]:
            with self.subTest(path=path):
                with self.assertRaises(HTTPError) as e:self.request(path,payload)
                self.assertEqual(e.exception.code,404)
    def test_hyperliquid_flag_does_not_enable_other_funding_writes(self):
        class Handler:
            def json(self,value,status=200):self.value=value
        with tempfile.TemporaryDirectory() as isolated:
            with patch.dict(os.environ,{'DESK_HYPERLIQUID_LIVE_ENABLED':'1'}):
                routes=FundingRoutes(self.port,isolated);handler=Handler()
                self.assertTrue(routes.get(handler,'/api/integrations',{}))
                self.assertTrue(handler.value['hyperliquidLiveEnabled'])
                self.assertFalse(handler.value['liveEnabled'])
                self.assertFalse(hasattr(routes.broker,'submit'))
    def test_foreign_origin_cannot_issue_challenges_or_begin_broker_login(self):
        for path in ['/api/wallet/challenge','/api/robinhood/connect']:
            with self.assertRaises(HTTPError) as e:self.request(path,{'address':self.wallet.address},headers={'Origin':'https://other.example'})
            self.assertEqual(e.exception.code,403)
    def test_disconnected_venue_and_broker_routes_require_wallet_session(self):
        for path in ['/api/robinhood/status','/api/robinhood/portfolio?accountId=bad','/api/integrations/hyperliquid']:
            with self.assertRaises(HTTPError) as e:self.request(path)
            self.assertEqual(e.exception.code,400)

if __name__=='__main__':unittest.main()

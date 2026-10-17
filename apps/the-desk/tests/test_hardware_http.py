"""Real HTTP/server/worker boundary with an isolated synthetic device signer."""
import http.cookiejar
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request,build_opener,HTTPCookieProcessor,urlopen
from urllib.error import HTTPError

class HardwareHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='desk-usb-http-');target=Path(cls.temp.name);root=Path(__file__).resolve().parents[1]
        for name in ['server.py','ibkr_data.py','engine.py','market_stream.py','wallet_auth.py','hardware_wallet.py','funding_routes.py','broker_connection.py','hyperliquid_requests.py']:shutil.copyfile(root/name,target/name)
        # Explicitly test-only RPC fixture in a disposable copy. The installed
        # application has no synthetic/device test switch or synthetic key.
        with (target/'hardware_wallet.py').open('a') as f:f.write("\nHardwareWallet._rpc = lambda self, method, params: '0x2105' if method == 'eth_chainId' else '0x10'\n")
        subprocess.run([str(root/'node_modules/esbuild/bin/esbuild'),str(root/'tests/hardware-native-fixture.mjs'),'--bundle','--platform=node','--format=esm','--outfile='+str(target/'native-ledger.mjs')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        (target/'web').mkdir()
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1]
        cls.base=f'http://127.0.0.1:{cls.port}'
        cls.proc=subprocess.Popen([sys.executable,str(target/'server.py'),'--port',str(cls.port),'--data-dir',str(target/'data'),'--no-workers'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen(cls.base+'/api/health',timeout=.2):return
            except Exception:
                if cls.proc.poll() is not None:raise RuntimeError('Synthetic HTTP fixture could not start')
                time.sleep(.05)
        raise RuntimeError('Synthetic HTTP fixture readiness timed out')
    @classmethod
    def tearDownClass(cls):cls.proc.terminate();cls.proc.wait(timeout=5);cls.temp.cleanup()
    def setUp(self):self.cookies=http.cookiejar.CookieJar();self.client=build_opener(HTTPCookieProcessor(self.cookies))
    def request(self,path,p=None,headers=None):
        req=Request(self.base+path,data=json.dumps(p).encode() if p is not None else None,headers={'Content-Type':'application/json','Origin':self.base,**(headers or {})})
        with self.client.open(req,timeout=10) as response:return json.load(response)
    def connect(self):
        self.assertTrue(self.request('/api/wallet/hardware/capabilities')['available'])
        devices=self.request('/api/wallet/hardware/discover',{})['devices']
        return self.request('/api/wallet/hardware/connect',{'deviceId':devices[0]['id'],'scheme':'ledger-live','index':0})
    def login(self):
        connected=self.connect();challenge=self.request('/api/wallet/challenge',{'address':connected['address']})
        signed=self.request('/api/wallet/hardware/sign-login',challenge)
        self.assertFalse(self.request('/api/wallet/session')['authenticated'])
        session=self.request('/api/wallet/verify',{'address':connected['address'],**challenge,**signed})
        return connected,challenge,session
    def test_extension_free_cookie_challenge_signature_and_balance_flow(self):
        connected,c,session=self.login();self.assertTrue(session['authenticated']);self.assertEqual(connected['address'],session['address'])
        cookie=next(c for c in self.cookies if c.name=='desk_hardware_session');self.assertIn('HttpOnly',cookie._rest);self.assertEqual(cookie._rest['SameSite'],'Strict');self.assertNotIn(cookie.value,json.dumps(connected))
        self.assertEqual(self.request('/api/wallet/hardware/selected',{})['address'],connected['address'])
        value=self.request('/api/wallet/hardware/rpc',{'method':'eth_getBalance','params':[connected['address'],'0x10']});self.assertEqual(value['result'],'0x10')
        with self.assertRaises(HTTPError):self.request('/api/wallet/hardware/sign-login',c)
        self.request('/api/wallet/logout',{});self.request('/api/wallet/hardware/disconnect',{});self.assertFalse(self.request('/api/wallet/session')['authenticated'])
        with self.assertRaises(HTTPError):self.request('/api/wallet/hardware/selected',{})
    def test_no_origin_foreign_origin_and_wrong_host_cannot_touch_hardware(self):
        for headers in [{'Origin':''},{'Origin':'https://foreign.example'},{'Host':'foreign.example'}]:
            with self.subTest(headers=headers):
                with self.assertRaises(HTTPError) as e:self.request('/api/wallet/hardware/discover',{},headers)
                self.assertEqual(e.exception.code,403)
    def test_other_client_arbitrary_text_broadcast_and_unknown_routes_fail(self):
        connected,c,_=self.login()
        other=build_opener()
        req=Request(self.base+'/api/wallet/hardware/selected',data=b'{}',headers={'Content-Type':'application/json','Origin':self.base})
        with self.assertRaises(HTTPError):other.open(req)
        for path,p in [('/api/wallet/hardware/sign-login',{**c,'message':'Sign arbitrary text'}),('/api/wallet/hardware/rpc',{'method':'eth_sendRawTransaction','params':['0xbad']}),('/api/wallet/hardware/rpc',{'method':'eth_getBalance','params':['0x'+'2'*40,'latest']})]:
            with self.assertRaises(HTTPError) as e:self.request(path,p)
            self.assertEqual(e.exception.code,400)
        with self.assertRaises(HTTPError) as e:self.request('/api/wallet/hardware/transfer',{})
        self.assertEqual(e.exception.code,404)

if __name__=='__main__':unittest.main()

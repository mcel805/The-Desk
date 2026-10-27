"""Actual loopback server checks, private temporary data, no provider calls."""
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
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor, urlopen


class WorkspaceHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(__file__).resolve().parents[1]
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); cls.port = sock.getsockname()[1]
        cls.base = 'http://127.0.0.1:' + str(cls.port)
        cls.proc = subprocess.Popen([sys.executable, '-B', str(cls.root/'server.py'), '--port', str(cls.port), '--data-dir', cls.temp.name, '--no-workers'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,env={**os.environ,'DESK_STORAGE_MANAGED':'1'})
        for _ in range(100):
            try:
                with urlopen(cls.base+'/api/health', timeout=.2): break
            except Exception:
                if cls.proc.poll() is not None: raise RuntimeError('Isolated server failed to start.')
                time.sleep(.05)
        else:
            cls.proc.terminate(); raise RuntimeError('Isolated server unavailable.')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=5); cls.temp.cleanup()

    def setUp(self):
        self.jar = http.cookiejar.CookieJar()
        self.client = build_opener(HTTPCookieProcessor(self.jar))

    def request(self, path, payload=None, headers=None):
        req = Request(self.base+path, data=json.dumps(payload).encode() if payload is not None else None, headers={'Content-Type':'application/json', 'Origin':self.base, **(headers or {})})
        with self.client.open(req, timeout=5) as res: return json.load(res)

    def test_bootstrap_without_wallet_sets_private_cookie_and_disconnected_state(self):
        p = '/api/robinhood/workspace'
        self.assertTrue(self.request(p+'/session', {})['localProfile'])
        cookie = next(iter(self.jar)); self.assertEqual(cookie.path, p)
        self.assertIn('HttpOnly', cookie._rest); self.assertEqual(cookie._rest['SameSite'], 'Lax')
        state = self.request(p+'/status')
        self.assertFalse(state['connected']); self.assertFalse(state['liveEnabled'])
        self.assertEqual(state['accounts'], [])
        self.assertNotIn('token', state)

    def test_new_profile_has_empty_private_agents_runs_and_snapshots(self):
        p = '/api/robinhood/workspace'; self.request(p+'/session', {})
        self.assertEqual(self.request(p+'/agents')['agents'], [])
        self.assertEqual(self.request(p+'/runs')['runs'], [])
        self.assertEqual(self.request(p+'/snapshot?accountId=someone-else')['sources'], {})

    def test_missing_profile_and_invalid_cookie_cannot_read_account_state(self):
        for headers in [{}, {'Cookie':'desk_robinhood_profile=forged'}]:
            with self.assertRaises(HTTPError) as e: self.request('/api/robinhood/workspace/status', headers=headers)
            self.assertEqual(e.exception.code, 400)

    def test_foreign_or_missing_origin_cannot_bootstrap(self):
        for origin in ['https://foreign.example', 'null', '']:
            with self.assertRaises(HTTPError) as e: self.request('/api/robinhood/workspace/session', {}, {'Origin':origin})
            self.assertEqual(e.exception.code, 403)

    def test_write_routes_and_client_tool_passthrough_are_unavailable(self):
        p = '/api/robinhood/workspace'; self.request(p+'/session', {})
        for suffix in ['/submit', '/cancel', '/exercise', '/tools/call', '/agents/activate']:
            with self.assertRaises(HTTPError) as e: self.request(p+suffix, {'tool':'place_crypto_order'})
            self.assertEqual(e.exception.code, 404)
        self.assertEqual(self.request('/api/health')['mode'], 'paper')

    def test_malformed_and_disconnected_requests_return_json_errors(self):
        p = '/api/robinhood/workspace'; self.request(p+'/session', {})
        for path, payload in [('/sync', []), ('/sync', {'accountId':'foreign','sources':['portfolio']}), ('/agents/save', {'mode':'live'})]:
            with self.assertRaises(HTTPError) as e: self.request(p+path, payload)
            self.assertEqual(e.exception.code, 400)
            self.assertIn('error', json.load(e.exception))


if __name__ == '__main__': unittest.main()

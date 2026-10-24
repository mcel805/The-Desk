"""Persistent credential lifecycle with an injected vault: never real API keys."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from jev_swing import Jev
from jev_keychain import KeychainError
from swing_research import SwingResearch

class Vault:
    def __init__(self):self.value='';self.fail=False
    def load(self,prompt=False):
        if self.fail:raise KeychainError('Denied')
        return self.value
    def save(self,key):
        if self.fail:raise KeychainError('Denied')
        self.value=key
    def delete(self):
        if self.fail:raise KeychainError('Denied')
        self.value=''

class KeychainTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict('os.environ',{},clear=True);self.env.start()
        self.tmp=tempfile.TemporaryDirectory();self.vault=Vault()
        self.judge=Jev(store=self.vault)
        self.service=SwingResearch(object(),Path(self.tmp.name),self.judge)
    def tearDown(self):self.service.close();self.tmp.cleanup();self.env.stop()
    def start(self):return self.service.command({'action':'start','symbol':'hyperliquid:BTC'})
    def test_saved_key_survives_fresh_adapter_and_service_but_never_autostarts(self):
        self.start();secret='test-only-persistent-secret'
        result=self.service.configure_key({'action':'save','api_key':secret})
        self.assertEqual(result['key_source'],'macos_keychain');self.assertFalse(self.service.active)
        other=SwingResearch(object(),Path(self.tmp.name),Jev(store=self.vault))
        self.assertTrue(other.judge.configured);self.assertEqual(other.judge.key_source,'macos_keychain');self.assertFalse(other.active)
        public=[result,self.service.status(),self.service.export('hyperliquid:BTC'),other.status()]
        self.assertNotIn(secret,json.dumps(public));self.assertNotIn(secret.encode(),self.service.path.read_bytes())
        other.close()
    def test_replace_and_forget_persist_across_instances(self):
        self.service.configure_key({'action':'save','api_key':'test-old'})
        self.service.configure_key({'action':'save','api_key':'test-new'})
        self.assertEqual(Jev(store=self.vault)._key(),'test-new')
        self.start();self.service.configure_key({'action':'forget'})
        self.assertFalse(self.service.active);self.assertFalse(Jev(store=self.vault).configured)
    def test_failed_replacement_or_deletion_preserves_run_and_old_key(self):
        self.service.configure_key({'action':'save','api_key':'test-old'});self.start();self.vault.fail=True
        for payload in ({'action':'save','api_key':'test-new'},{'action':'forget'}):
            with self.assertRaises(KeychainError):self.service.configure_key(payload)
            self.assertIn('hyperliquid:BTC',self.service.active);self.assertEqual(self.judge._key(),'test-old')
    def test_remember_existing_memory_key_does_not_end_or_restart_collection(self):
        self.judge.set_session_key('test-current');run=self.start()['symbols']['hyperliquid:BTC']['run']
        self.service.configure_key({'action':'remember'})
        self.assertEqual(self.service.status()['symbols']['hyperliquid:BTC']['run'],run)
        self.assertIn('hyperliquid:BTC',self.service.active)
        self.assertEqual(Jev(store=self.vault)._key(),'test-current')
    def test_locked_keychain_is_visible_and_retried_only_on_explicit_load(self):
        self.vault.value='test-saved';self.vault.fail=True
        j=Jev(store=self.vault);self.assertFalse(j.configured);self.assertTrue(j.key_storage['error'])
        self.vault.fail=False;j.load_saved_key()
        self.assertTrue(j.configured);self.assertIsNone(j.key_storage['error'])
    def test_unavailable_storage_has_no_plaintext_fallback(self):
        self.service.judge=Jev(store=False);self.start()
        with self.assertRaises(KeychainError):self.service.configure_key({'action':'save','api_key':'test-secret'})
        self.assertIn('hyperliquid:BTC',self.service.active);self.assertFalse(self.service.judge.configured)
    def test_invalid_actions_never_touch_the_vault_or_collection(self):
        self.start()
        for payload in ({'action':'save','api_key':''},{'action':'save','api_key':'secret space'}, {'action':'forget','api_key':'x'},{'action':'remember','extra':True},{'action':'unknown'}):
            with self.assertRaises(ValueError):self.service.configure_key(payload)
            self.assertIn('hyperliquid:BTC',self.service.active);self.assertEqual(self.vault.value,'')

if __name__=='__main__':unittest.main()

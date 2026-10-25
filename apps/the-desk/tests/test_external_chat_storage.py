import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from spider_codex import CodexSession
from spider_service import Spider
from storage import DataVault

class ExternalChatStorageTests(unittest.TestCase):
 def test_managed_analyst_thread_is_ephemeral_without_changing_auth_home(self):
  with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'DESK_CODEX_STATE_DIR':tmp}):
   session=CodexSession(tmp);calls=[]
   session.start=lambda:None
   def request(method,params,**kwargs):calls.append((method,params));return {'thread':{'id':'fixture'}}
   session.request=request;session.ensure_thread('fixture instructions')
   self.assertTrue(calls[0][1]['ephemeral'])
   self.assertEqual(calls[0][1]['approvalPolicy'],'never')
 def test_durable_chat_events_are_included_in_verified_backup(self):
  with tempfile.TemporaryDirectory() as tmp:
   spider=Spider(None,None,None,tmp);spider.current={'id':'fixture-run'}
   spider.event('user',{'text':'fixture question'});spider.event('answer',{'text':'fixture answer'})
   files=list((Path(tmp)/'spider/chat-events').glob('*.json'))
   self.assertEqual(len(files),2)
   self.assertEqual({json.loads(p.read_text())['kind'] for p in files},{'user','answer'})
   vault=DataVault(tmp);snapshot=vault.snapshot()
   self.assertEqual(sum(name.startswith('spider/chat-events/') for name in snapshot['files']),2)
   self.assertTrue(vault.verify(snapshot['id'])['verified'])

if __name__=='__main__':unittest.main()

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import storage_host as host

class StorageHostTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.volume=self.root/'USB';self.volume.mkdir()
  self.policy={'volume':str(self.volume),'volume_uuid':'uuid','marker':'marker',
    'external_root':str(self.volume/'Store'),'control':str(self.root/'control'),
    'limit_bytes':200_000_000_000,'aliases':[]}
  (self.volume/'.mark-storage-volume.json').write_text(json.dumps({'volume_uuid':'uuid','id':'marker'}))
 def tearDown(self):self.temp.cleanup()
 def test_directory_is_not_a_connected_drive(self):
  self.assertFalse(host.drive_ready(self.policy))
 def test_wrong_drive_marker_rejected(self):
  with patch.object(Path,'is_mount',return_value=True):
   self.assertTrue(host.drive_ready(self.policy))
   self.policy['volume_uuid']='different';self.assertFalse(host.drive_ready(self.policy))
 def test_copy_hashes_all_files_and_preserves_source(self):
  src=self.root/'source';src.mkdir();(src/'record').write_text('old history')
  dst=self.root/'destination';receipt=host.verified_copy(src,dst)
  self.assertEqual(host.inventory(src),host.inventory(dst));self.assertEqual(len(receipt),1)
  with self.assertRaises(RuntimeError):host.verified_copy(src,dst)
  self.assertEqual((src/'record').read_text(),'old history')
 def test_mutating_source_prevents_publication(self):
  src=self.root/'source';src.mkdir();(src/'record').write_text('before')
  copy=host.shutil.copytree
  def mutate(*a,**kw):
   result=copy(*a,**kw);(src/'record').write_text('after');return result
  dst=self.root/'destination'
  with patch.object(host.shutil,'copytree',side_effect=mutate):
   with self.assertRaises(RuntimeError):host.verified_copy(src,dst)
  self.assertFalse(dst.exists());self.assertTrue(src.exists())
 def test_alias_never_replaces_regular_directory(self):
  alias=self.root/'alias';alias.mkdir()
  with self.assertRaises(RuntimeError):host.set_alias(alias,self.volume)
 def test_offline_archive_does_not_replace_external_history(self):
  external=Path(self.policy['external_root']);live=external/'live/desk';live.mkdir(parents=True)
  (live/'history').write_text('external history')
  h=host.Host(self.policy,18880);h.active=self.root/'temporary/session';h.active.mkdir(parents=True)
  (h.active/'offline').write_text('offline history');h.mode='LOCAL_TEMPORARY'
  with patch.object(host,'drive_ready',return_value=True):h.archive_local()
  self.assertEqual((live/'history').read_text(),'external history')
  self.assertEqual((external/'offline-sessions/session/offline').read_text(),'offline history')
  self.assertTrue(h.active.exists()) # Cleanup follows the durable archive receipt.
 def test_archive_over_budget_keeps_local_data(self):
  h=host.Host(self.policy,18880);h.active=self.root/'temporary';h.active.mkdir()
  (h.active/'offline').write_text('offline');h.mode='LOCAL_TEMPORARY';h.policy['limit_bytes']=1
  with patch.object(host,'drive_ready',return_value=True):
   with self.assertRaises(RuntimeError):h.archive_local()
  self.assertTrue((h.active/'offline').exists())
 def test_capture_stays_local_while_disconnected_then_moves_verified(self):
  h=host.Host(self.policy,18880);inbox=h.control/'Capture-Inbox';inbox.mkdir()
  capture=inbox/'fixture.png';capture.write_bytes(b'fixture screenshot')
  os.utime(capture,(0,0))
  with patch.object(host,'drive_ready',return_value=False):h.flush_captures()
  self.assertTrue(capture.exists())
  from types import SimpleNamespace
  with patch.object(host,'drive_ready',return_value=True),patch.object(host.subprocess,'run',return_value=SimpleNamespace(returncode=1)):
   h.flush_captures()
  self.assertFalse(capture.exists())
  self.assertEqual((Path(self.policy['external_root'])/'live/captures/macOS/fixture.png').read_bytes(),b'fixture screenshot')
 def test_explicit_alternate_data_dir_bypasses_policy(self):
  policy=self.root/'policy.json';policy.write_text(json.dumps({**self.policy,'desk_alias':str(self.root/'desk')}))
  with patch.object(host,'POLICY',policy):self.assertFalse(host.route_if_configured(str(self.root/'fixture'),18891))

if __name__=='__main__':unittest.main()

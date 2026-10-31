import concurrent.futures
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from trade_recordings import TradeRecordings, MAX_CHUNK
from storage import StorageFault

class RecordingTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.engine=Engine(Path(self.tmp.name)/'desk.sqlite3')
  self.account=self.engine.execute('init','account',{'name':'Video QA','capital':'10000','fee_bps':'0','leverage':'1'})['id']
  self.archive=TradeRecordings(self.tmp.name,self.engine,require_usb=False)
 def start(self):return self.archive.start({'account_id':self.account,'instrument':'hyperliquid:BTC','timeframe':'1','mime':'video/webm'})
 def test_usb_required_without_policy_never_falls_back(self):
  from unittest.mock import patch
  with patch.dict('os.environ',{'DESK_RECORDING_POLICY':str(Path(self.tmp.name)/'missing-policy.json')}):
   archive=TradeRecordings(self.tmp.name,self.engine)
   with self.assertRaises(StorageFault):archive.start({'account_id':self.account,'instrument':'hyperliquid:BTC','mime':'video/webm'})
   self.assertFalse(archive.root.exists())
 def test_chunk_retry_order_and_versions(self):
  clip=self.start();other=self.start();self.assertNotEqual(clip['id'],other['id'])
  with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:self.archive.append(clip['id'],0,b'first'),range(2)))
  self.assertEqual(results[0],results[1]);self.archive.append(clip['id'],1,b'second')
  self.assertEqual((self.archive.folder(clip['id'])/'chart.webm').read_bytes(),b'firstsecond')
  with self.assertRaises(ValueError):self.archive.append(clip['id'],0,b'changed')
  with self.assertRaises(ValueError):self.archive.append(clip['id'],3,b'gap')
  result=self.archive.finish({'id':clip['id'],'reason':'closed'});self.assertEqual(result['status'],'complete')
  with self.assertRaises(ValueError):self.archive.append(clip['id'],2,b'late')
  self.assertEqual(len(self.archive.catalog()['recordings']),2)
 def test_unacknowledged_tail_is_replaced(self):
  clip=self.start();self.archive.append(clip['id'],0,b'good')
  with (self.archive.folder(clip['id'])/'chart.webm').open('ab') as f:f.write(b'uncommitted-tail')
  self.archive.append(clip['id'],1,b'next');self.assertEqual((self.archive.folder(clip['id'])/'chart.webm').read_bytes(),b'goodnext')
 def test_missing_drive_never_creates_recording(self):
  def unavailable():raise StorageFault('USB absent')
  self.archive.guard=unavailable
  with self.assertRaises(StorageFault):self.start()
  self.assertFalse(self.archive.root.exists())
 def test_failed_write_retains_previous_bytes(self):
  clip=self.start();self.archive.append(clip['id'],0,b'good')
  def unavailable():raise StorageFault('USB absent')
  self.archive.guard=unavailable
  with self.assertRaises(StorageFault):self.archive.append(clip['id'],1,b'new')
  self.assertEqual(self.archive.read(clip['id'])['bytes'],4)
 def test_scope_size_and_paths(self):
  with self.assertRaises(ValueError):self.archive.folder('../../secret')
  with self.assertRaises(ValueError):self.archive.start({'account_id':'foreign','instrument':'hyperliquid:BTC','mime':'video/webm'})
  clip=self.start()
  with self.assertRaises(ValueError):self.archive.append(clip['id'],0,b'x'*(MAX_CHUNK+1))
  self.assertEqual(self.archive.finish({'id':clip['id'],'reason':'hidden'})['status'],'interrupted')

if __name__=='__main__':unittest.main()

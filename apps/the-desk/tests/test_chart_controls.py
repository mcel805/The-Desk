import base64
import tempfile
import time
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine import Engine
from chart_controls import ChartControls,image

class ChartControlTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.controls=ChartControls(Engine(Path(self.tmp.name)/'qa.sqlite3'))
  now=int(time.time()*1000)//60000*60000
  self.request={'text':'Inspect chart','image':'data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode(),'snapshot':{'symbol':'fixture:TEST','timeframe':'1m','style':'candles','cutoff':now,'bars':[{'time':now-(20-i)*60000,'open':100,'high':101,'low':99,'close':100,'volume':1} for i in range(20)]}}
 def test_plan_and_receipt_persist(self):
  self.controls.ask=lambda *args:{'answer':'Synthetic review','commands':[]} if 'commands' in args[1]['properties'] else {'answer':'Rendered chart inspected'}
  plan=self.controls.plan(self.request);self.assertEqual(plan['status'],'planned')
  result=self.controls.verify({'id':plan['id'],'image':self.request['image'],'facts':{'receipts':[]}})
  self.assertEqual(result['answer'],'Rendered chart inspected')
  with self.controls.engine.db() as db:self.assertIn('reviewed',db.execute('SELECT payload FROM chart_control_runs').fetchone()[0])
 def test_invalid_image_and_context_rejected_before_model(self):
  self.controls.ask=lambda *args:self.fail('Invalid input reached model')
  for change in [{'image':'https://example.com/image.png'},{'context':'invalid'},{'text':''}]:
   with self.assertRaises(ValueError):self.controls.plan({**self.request,**change})
 def test_unavailable_chart_and_strategy_code_are_refused(self):
  for cmd in [{'op':'market','cell':4,'value':'{}','source':'','indicatorId':''},{'op':'pine','cell':0,'value':'','source':'strategy("not allowed")','indicatorId':''}]:
   self.controls.ask=lambda *args:{'answer':'Fixture','commands':[cmd]}
   with self.assertRaises(ValueError):self.controls.plan(self.request)
 def test_unknown_receipt_cannot_claim_application(self):
  with self.assertRaises(ValueError):self.controls.verify({'id':'unknown','image':self.request['image'],'facts':{}})

if __name__=='__main__':unittest.main()

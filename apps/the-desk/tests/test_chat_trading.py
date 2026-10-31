import json,tempfile,time,unittest
from pathlib import Path
from engine import Engine
from chat_trading import ChatTrading
class TradingTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.e=Engine(Path(self.tmp.name)/'qa.db');self.t=ChatTrading(self.e);self.a=self.e.execute('init','account',{'name':'CHAT QA','capital':'100000','fee_bps':'0','leverage':'1'})['id'];self.m='hyperliquid:BTC';self.e.ingest(self.m,'77596','77597',{'tick':'1','qty_step':'.001'})
 def plan(self,items):
  ctx=self.t.context({'account_id':self.a},self.m);commands,concern=self.t.prepare({'concern':'','commands':[{'action':a,'payload':json.dumps(p)} for a,p in items]},ctx)
  return {'id':str(time.time_ns()),'createdAt':time.time(),'trade':{'account_id':self.a,'instrument':self.m,'commands':commands}},concern
 def execute(self,r):return self.t.execute(r,{'account_id':self.a,'instrument':self.m})
 def order(self):return {'side':'sell','kind':'limit','qty':'.001','price':'77699','stop':'78094','target':'77072'}
 def test_exact_requested_order_and_retry(self):
  r,c=self.plan([('order',self.order())]);self.assertFalse(c);self.assertFalse(self.e.state(self.a)['orders']);self.assertEqual(self.execute(r),self.execute(r));rows=self.e.state(self.a)['orders'];self.assertEqual(len(rows),1);self.assertEqual(rows[0]['price'],'77699');self.assertEqual(rows[0]['stop'],'78094');self.assertEqual(rows[0]['status'],'working')
 def test_missing_details_and_scope(self):
  for missing in ('qty','stop'):
   p=self.order();p.pop(missing);r,c=self.plan([('order',p)]);self.assertTrue(c);self.assertFalse(r['trade']['commands'])
  for flag in ('broker','replay'):
   with self.assertRaises(ValueError):self.t.context({'account_id':self.a,flag:True},self.m)
  r,_=self.plan([('order',self.order())]);r['createdAt']-=181
  with self.assertRaises(ValueError):self.execute(r)
  with self.assertRaises(ValueError):self.t.execute(r,{'account_id':'foreign','instrument':self.m})
 def test_batch_is_atomic(self):
  r,_=self.plan([('order',self.order()),('order',self.order())]);r['trade']['commands'][1]['payload']['qty']='99999'
  with self.assertRaises(ValueError):self.execute(r)
  self.assertFalse(self.e.state(self.a)['orders'])
 def test_amend_cancel_partial_and_flatten(self):
  r,_=self.plan([('order',self.order())]);o=self.execute(r)[0]['result'];r,_=self.plan([('amend',{'id':o['id'],'price':'77700'})]);self.execute(r);self.assertEqual(self.e.state(self.a)['orders'][0]['target'],'77072')
  r,_=self.plan([('cancel_orders',{})]);self.execute(r)
  r,_=self.plan([('order',{'side':'buy','kind':'market','qty':'.002','stop':'77000'})]);self.execute(r);p=self.e.state(self.a)['positions'][0]
  r,_=self.plan([('close',{'id':p['id'],'qty':'.001'})]);self.execute(r);self.assertEqual(self.e.state(self.a)['positions'][0]['qty'],'0.001')
  r,_=self.plan([('flatten',{})]);self.execute(r);self.assertFalse(self.e.state(self.a)['positions'])
 def test_position_bracket_reverse_and_stale_changes(self):
  r,_=self.plan([('order',{'side':'buy','kind':'market','qty':'.001','stop':'77000','target':'79000'})]);self.execute(r);p=self.e.state(self.a)['positions'][0]
  r,_=self.plan([('bracket',{'id':p['id'],'stop':'77100'})]);self.execute(r);p=self.e.state(self.a)['positions'][0];self.assertEqual(p['target'],'79000');self.assertEqual(p['stop'],'77100')
  stale,_=self.plan([('close',{'id':p['id']})]);reverse,_=self.plan([('reverse',{})]);self.execute(reverse);self.assertEqual(self.e.state(self.a)['positions'][0]['side'],'sell')
  with self.assertRaises(ValueError):self.execute(stale)
 def test_quote_staleness_and_restricted_payload(self):
  r,_=self.plan([('order',self.order())]);self.e.quotes[self.m]['received_at']=time.time()-30
  with self.assertRaises(ValueError):self.execute(r)
  self.assertFalse(self.e.state(self.a)['orders'])
  with self.assertRaises(ValueError):self.plan([('order',{**self.order(),'account_id':'other'})])

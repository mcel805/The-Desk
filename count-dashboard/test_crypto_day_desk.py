import tempfile,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
import crypto_day_desk as desk
class DeskTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();desk.DB_PATH=Path(self.tmp.name)/'desk.sqlite3';self.asof=1800000000000;desk.now=lambda:self.asof
 def tearDown(self):self.tmp.cleanup()
 def payload(self,n=25,gap=False):
  start=self.asof//60000*60000-30*60000
  bars=[{'time':start+i*60000,'open':100,'high':102,'low':98,'close':100,'volume':1} for i in range(n)]
  if gap:bars.pop(-3)
  return {'source':{'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','snapshotAsOf':self.asof,'completedCutoff':bars[-1]['time']},'bars':bars,'raw':[],'frames':[]}
 def test_idempotent_and_freeze(self):
  p=self.payload();a=desk.observe(p);b=desk.observe(p);self.assertEqual(a['id'],b['id']);self.assertEqual(b['newCount'],0)
  with desk.connection() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM decisions').fetchone()[0],25)
 def test_forming_rejected(self):
  p=self.payload();p['source']['snapshotAsOf']=p['bars'][-1]['time']+59999
  with self.assertRaises(ValueError):desk.observe(p)
 def test_future_and_stale_rejected(self):
  p=self.payload();p['source']['snapshotAsOf']=self.asof+400000
  with self.assertRaises(ValueError):desk.observe(p)
 def test_policy_version_retains_old(self):
  desk.observe(self.payload());p=desk.update_policy({'policy':{'confirmBars':3}});self.assertEqual(p['confirmBars'],3)
  s=desk.state();self.assertEqual(len(s['policies']),2);self.assertTrue(all(d['policy']=='policy-1' for d in desk.state(export=True)['decisions']));self.assertEqual(s['retainedDecisionCount'],25);self.assertEqual(s['decisions'],[])
 def test_reconstructed_excluded_from_learning(self):
  desk.observe(self.payload());desk.observe(self.payload(30));self.assertEqual(desk.state()['learning']['samples'],0)
 def test_horizon_gap_unscored(self):
  desk.observe(self.payload());desk.observe(self.payload(30,True));s=desk.state();out=[d['outcome'] for d in s['decisions'] if d['outcome']];self.assertTrue(any(o['gap'] for o in out));self.assertTrue(all(not o['eligible'] for o in out))
 def test_unauthorized_approval_role(self):
  d=desk.observe(self.payload())
  with self.assertRaises(ValueError):desk.review({'decision':d['id'],'role':'taper','action':'approve'})
 def test_decision_api_opt_in(self):
  with self.assertRaises(ValueError):desk.model_read({'evidence':self.payload()})
 def test_failed_attempt_not_rebilled(self):
  desk.update_policy({'policy':{'apiEnabled':True}});p={'evidence':self.payload()}
  with self.model_session(p['evidence']), patch.object(desk.taper_decisions,'decide',side_effect=RuntimeError('offline')) as mock:
   with self.assertRaises(RuntimeError):desk.model_read(p)
   with self.assertRaises(ValueError):desk.model_read(p)
   self.assertEqual(mock.call_count,1)
 def test_pool_future_excluded(self):
  p=self.payload();policy={**desk.DEFAULT_POLICY,'id':'test'};b=p['bars'];future={'id':'future','price':100,'born':b[-1]['time']+60000,'takenAt':0,'side':1,'weight':16,'tf':0}
  d=desk.tape_rule(b,len(b)-2,[future],policy,[]);self.assertEqual(d['stage'],'WAIT');self.assertIsNone(d['level'])
 def test_revised_ohlc_keeps_canonical_evidence(self):
  original=self.payload();desk.observe(original);revised=self.payload(26);revised['bars'][0]['high']=104
  result=desk.observe(revised);self.assertEqual(result['sourceRevisions'],1)
  exported=desk.state(export=True);self.assertEqual(exported['bars'][0]['high'],102)
 def test_export_keeps_context_and_policy(self):
  p=self.payload();desk.observe(p);desk.save_context({'source':p['source'],'series':[{'timeframe':'1m','bars':p['bars']}]})
  x=desk.state(export=True);self.assertEqual(len(x['bars']),25);self.assertEqual(len(x['sourceContext']),25);self.assertIn('apiAttempts',x)
 def test_forward_score_requires_observation_before_outcome(self):
  d=desk.observe(self.payload())
  with desk.connection() as db:
   d.update(direction=1,bias='LONG',observedAt=d['barTime']+60000)
   db.execute('UPDATE decisions SET body=? WHERE id=?',(desk.encode(d),d['id']))
  p=self.payload(30);p['bars'][-1]['close']=101;desk.observe(p)
  rows=desk.state()['decisions'];row=next(x for x in rows if x['id']==d['id']);self.assertTrue(row['outcome']['eligible']);self.assertTrue(row['outcome']['directionCorrect'])
  with desk.connection() as db:
   d['observedAt']=d['barTime']+6*60000;db.execute('UPDATE decisions SET body=?,outcome=NULL WHERE id=?',(desk.encode(d),d['id']));desk.settle(db,d['provider'],d['symbol'])
  row=next(x for x in desk.state()['decisions'] if x['id']==d['id']);self.assertFalse(row['outcome']['eligible'])
 def test_confirmed_sweep_has_opposite_liquidity_target(self):
  p=self.payload();b=p['bars'];b[-3].update(open=100,low=97,high=102,close=100);b[-2].update(open=100,high=103,low=99,close=101);b[-1].update(open=101,high=105,low=100,close=104)
  pools=[{'id':'lower','price':98,'side':-1,'born':b[0]['time'],'takenAt':b[-3]['time']+60000,'weight':16,'tf':0},{'id':'upper','price':145,'side':1,'born':b[0]['time'],'takenAt':0,'weight':8,'tf':1}]
  frames=[{'timeframe':'1h','cutoff':b[-1]['time'],'degrees':[{'candidate':{'quality':70}}]}]
  d=desk.tape_rule(b,len(b)-1,pools,{**desk.DEFAULT_POLICY,'id':'test'},frames)
  self.assertEqual(d['stage'],'CONFIRMED');self.assertEqual(d['target'],145);self.assertLess(d['stop'],d['entry']);self.assertEqual(d['direction'],1)
 def test_paper_fill_and_exit_journal_link(self):
  import server
  d=desk.observe(self.payload());db=server.connect(Path(self.tmp.name)/'sim.sqlite3')
  try:
   a=server.create_chart_sim_account(db,{'name':'Crypto Day isolated test','starting_balance':10000})
   pos=server.open_quant_lab_sim_position(db,{'account_id':a['account_id'],'provider':d['provider'],'symbol':d['symbol'],'timeframe':'1m','side':'long','quantity':.01,'entry_price':100,'bar_time':d['barTime']//1000,'stop_price':90,'target_price':110})
   self.assertTrue(desk.link_trade({'position':pos['position_id'],'decision':d['id']},db)['linked'])
   with desk.connection() as ledger:
    ledger.execute('INSERT INTO api_attempts VALUES(?,?,?,?)',(f"{d['provider']}:{d['symbol']}:{d['barTime']}",'completed',desk.now(),desk.encode({'estimatedUsd':.001,'usage':{'input_tokens':100}})))
   result=server.advance_quant_lab_sim_positions(db,{'provider':d['provider'],'symbol':d['symbol'],'timeframe':'1m','bars':[{'time':d['barTime']//1000+60,'open':100,'high':111,'low':99,'close':110}]})
   self.assertEqual(result['positions'][0]['close_reason'],'target');self.assertEqual(db.execute("SELECT COUNT(*) FROM chart_sim_journal_outbox WHERE event_type IN ('trade_opened','trade_closed')").fetchone()[0],2)
   snapshot=desk.state(trading_db=db);trade=snapshot['positions'][0];self.assertEqual(trade['decisionApiTokens'],100);self.assertEqual(trade['decisionApiUsd'],.001)
   self.assertEqual(desk.state(trading_db=db)['positions'][0]['decisionApiReads'],1)
  finally:db.close()
 def model_session(self,evidence):
  from contextlib import ExitStack
  stack=ExitStack()
  hunt={'id':'test-hunt','ended':None,'provider':'coinbase','symbol':'BTC-USD','apiRequested':True,
        'policy':{**desk.DEFAULT_POLICY,'id':'policy-1','maxApiReads':0,'maxApiUsd':0},
        'startCutoff':evidence['bars'][-1]['time']-60000,
        'levels':[{'id':'manual:test','price':100,'tf':6}]}
  stack.enter_context(patch.object(desk.hunts,'state',return_value={'session':hunt,'sessionCandidates':[]}))
  stack.enter_context(patch.object(desk.rider_auto,'candidates',return_value=[]))
  stack.enter_context(patch.object(desk.taper_decisions,'status',return_value={'configured':True}))
  return stack
 def test_legacy_api_caps_do_not_block_requests(self):
  evidence=self.payload()
  with desk.connection() as db:
   for i in range(150):
    db.execute('INSERT INTO api_attempts VALUES(?,?,?,?)',('old:'+str(i),'failed',desk.now(),desk.encode({'estimatedUsd':1})))
   usage=desk.api_budget_status(db,{'maxApiReads':0,'maxApiUsd':0})
  self.assertFalse(usage['blocked']);self.assertIsNone(usage['maxAttempts']);self.assertIsNone(usage['maxUsd'])
  self.assertEqual(usage['attempts'],150);self.assertEqual(usage['failedAttempts'],150)
  with self.model_session(evidence),patch.object(desk.taper_decisions,'decide',side_effect=RuntimeError('provider offline')) as model:
   with self.assertRaisesRegex(RuntimeError,'provider offline'):desk.model_read({'evidence':evidence})
   self.assertEqual(model.call_count,1)
 def test_policy_discards_legacy_api_caps(self):
  updated=desk.update_policy({'policy':{'maxApiReads':0,'maxApiUsd':0}})
  self.assertNotIn('maxApiReads',updated);self.assertNotIn('maxApiUsd',updated)
 def test_live_payload_keeps_full_evidence_in_export(self):
  decision=desk.observe(self.payload())
  model={'answers':[{'name':'test','choice':'WAIT'}],'estimatedUsd':.001,'questions':{'q':'full question'},'rawAnswers':{'q':'raw'},'marketGeometry':{'source':'retained'},'volumeEvidence':{'bars':[]}}
  with desk.connection() as db:
   row=db.execute('SELECT body FROM decisions WHERE id=?',(decision['id'],)).fetchone()
   body=__import__('json').loads(row[0]);body['model']=model
   db.execute('UPDATE decisions SET body=? WHERE id=?',(desk.encode(body),decision['id']))
  live=desk.state()['decisions'];export=desk.state(export=True)['decisions']
  retained=next(d for d in export if d['id']==decision['id'])
  compact=next(d for d in live if d['id']==decision['id'])
  self.assertEqual(retained['model'],model);self.assertEqual(compact['model']['answers'],model['answers'])
  self.assertEqual(compact['model']['estimatedUsd'],.001);self.assertNotIn('questions',compact['model'])
  self.assertEqual(len(live),len(export));self.assertTrue(all('context' not in d and 'indicatorSettings' not in d for d in live))
  self.assertTrue(all('context' in d and 'indicatorSettings' in d for d in export))
if __name__=='__main__':unittest.main()

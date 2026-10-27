import io,json,unittest,sqlite3,tempfile
from pathlib import Path
from copy import deepcopy
from unittest.mock import patch
from urllib.error import HTTPError,URLError
from jev_swing import Jev,MODEL,QUESTIONS,prepare_state,validate_response,JevRequestError,JevResponseError
from swing_research import request_reliability
from jev_costs import JevCostMeter

def answer():
 return {'model':MODEL,'usage':{'input_tokens':100,'output_tokens':10},'answers':{k:({'type':'noul','noul':.6} if q['type']=='noul' else {'type':'choice','choice':next(iter(q['criteria'])),'confidence':.4,'probabilities':{v:1/len(q['criteria']) for v in q['criteria']}}) for k,q in QUESTIONS.items()}}
class Reply:
 def __init__(self,value):self.value=value
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self):return json.dumps(self.value).encode()
def failure(status,detail='overloaded',headers=None):
 return HTTPError('https://api.typesafe.ai/v1/systemone',status,'test',headers or {},io.BytesIO(json.dumps({'detail':{'error_type':detail,'secret':'never-store-me'}}).encode()))
class ReliabilityTests(unittest.TestCase):
 def setUp(self):self.j=Jev(store=False);self.j.set_session_key('test-key-not-real')
 def test_context_projection_preserves_anchors_cutoffs_and_input(self):
  levels=[{'id':str(i),'price':100+i,'side':'high','timeframe':'4h','source':'auto'} for i in range(20)]
  manual={'id':'manual','price':1000,'side':'high','timeframe':'4h','source':'manual'}
  state={'bid':100,'ask':101,'closed_bars':[{'time':i} for i in range(30)],'market_synth':{'recent':[{'time':i} for i in range(12)]},'liquidity_study':{'levels':levels+[manual],'summaries':[{'outcome':'WIN'}],'plans':[{'outcome':'LOSS'}],'context':{'levels':levels,'parent_direction':-1,'frames':{'4h':{'cutoff':24,'bars':159,'hash':'hash','evidence':[{'time':i} for i in range(24)]}}},'campaigns':[{'reference':levels[-1],'target':manual,'model_receipts':['old-judgment'],'contact_cutoff':21}]}}
  original=deepcopy(state);s=prepare_state(state);study=s['liquidity_study'];frame=study['context']['frames']['4h']
  self.assertEqual(state,original);self.assertNotIn('summaries',study);self.assertNotIn('plans',study);self.assertNotIn('levels',study['context']);self.assertEqual(frame['cutoff'],24);self.assertEqual(frame['bars'],159);self.assertEqual(frame['evidence'][0]['time'],18)
  self.assertEqual(study['campaigns'][0]['reference'],levels[-1]);self.assertEqual(study['campaigns'][0]['target'],manual);self.assertIn(manual,study['levels']);self.assertEqual(len(s['closed_bars']),12)
 def test_rounded_distribution_is_preserved_but_invalid_mass_is_rejected(self):
  r=answer();r['answers']['next_bar'].update(choice='down',probabilities={'up':.33,'down':.34,'flat':.32})
  self.assertEqual(validate_response(r)['answers']['next_bar']['probabilities'],{'up':.33,'down':.34,'flat':.32})
  for dist in ({'up':.3,'down':.4,'flat':.2},{'up':0,'down':0,'flat':0},{'up':float('nan'),'down':.5,'flat':.5}):
   r['answers']['next_bar']['probabilities']=dist
   with self.assertRaises(ValueError):validate_response(r)
 def test_temporary_overload_recovers_with_bounded_backoff(self):
  with patch('jev_swing.urlopen',side_effect=[failure(529),Reply(answer())]) as send,patch('jev_swing.time.sleep') as sleep:
   r=self.j.judge({'bid':100,'ask':101})
  self.assertEqual(send.call_count,2);self.assertGreaterEqual(sleep.call_args.args[0],.15);self.assertEqual(r['transport']['attempt_count'],2);self.assertEqual(r['transport']['unpriced_attempts'],0)
 def test_server_error_recovery_keeps_unknown_first_attempt_cost(self):
  with patch('jev_swing.urlopen',side_effect=[failure(503),Reply(answer())]),patch('jev_swing.time.sleep'):
   r=self.j.judge({})
  self.assertEqual(r['transport']['unpriced_attempts'],1)
 def test_recovered_request_does_not_claim_complete_billing_when_attempt_cost_is_unknown(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'cost.sqlite3'
   with sqlite3.connect(path) as db:
    db.executescript('CREATE TABLE runs(id TEXT,symbol TEXT,started INTEGER,config TEXT); CREATE TABLE predictions(id TEXT,run TEXT,symbol TEXT,at INTEGER,state TEXT,response TEXT);')
   meter=JevCostMeter(path)
   with sqlite3.connect(path) as db:
    db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?)',('p','r','hyperliquid:BTC',1,'{}',json.dumps({'transport':{'unpriced_attempts':1}})))
   meter.record('p','r','hyperliquid:BTC',1,1,'AVAILABLE',MODEL,{'input_tokens':100,'output_tokens':10})
   total=meter.data()['total'];self.assertFalse(total['complete']);self.assertEqual(total['unknown_cost_requests'],1);self.assertGreater(total['estimated_usd'],0)
 def test_context_or_auth_failure_is_not_retried_and_has_safe_diagnostics(self):
  for status,code in ((400,'max_tokens_exceeded'),(401,'invalid_api_key')):
   with patch('jev_swing.urlopen',side_effect=failure(status,code)) as send:
    with self.assertRaises(JevRequestError) as caught:self.j.judge({})
   self.assertEqual(send.call_count,1);self.assertEqual(caught.exception.diagnostics['http_status'],status);self.assertEqual(caught.exception.diagnostics['error_code'],code);self.assertNotIn('never-store-me',str(caught.exception.diagnostics))
 def test_retry_after_larger_than_freshness_budget_is_honored_without_early_retry(self):
  with patch('jev_swing.urlopen',side_effect=failure(429,headers={'Retry-After':'10'})) as send,patch('jev_swing.time.sleep') as sleep:
   with self.assertRaises(JevRequestError):self.j.judge({})
  self.assertEqual(send.call_count,1);sleep.assert_not_called()
 def test_retries_stop_after_three_attempts(self):
  with patch('jev_swing.urlopen',side_effect=lambda *a,**k:(_ for _ in ()).throw(failure(529))) as send,patch('jev_swing.time.sleep'):
   with self.assertRaises(JevRequestError) as caught:self.j.judge({})
  self.assertEqual(send.call_count,3);self.assertEqual(caught.exception.diagnostics['attempt_count'],3)
 def test_large_context_is_withheld_without_paid_request(self):
  with patch('jev_swing.urlopen') as send:
   with self.assertRaises(JevRequestError) as caught:self.j.judge({'unbounded':'x'*64000})
  send.assert_not_called();self.assertEqual(caught.exception.diagnostics['error_code'],'local_context_budget_exceeded')
 def test_individual_question_context_limit_is_checked_separately(self):
  with patch('jev_swing.urlopen') as send:
   with self.assertRaises(JevRequestError) as caught:self.j.judge({'large':'x'*33000})
  send.assert_not_called();self.assertLess(caught.exception.diagnostics['request_bytes'],63000);self.assertGreater(caught.exception.diagnostics['largest_question_bytes'],32000)
 def test_transport_timeout_is_not_replayed_with_unknown_billing(self):
  with patch('jev_swing.urlopen',side_effect=URLError('do-not-log-this-body')) as send:
   with self.assertRaises(JevRequestError) as caught:self.j.judge({})
  self.assertEqual(send.call_count,1);self.assertNotIn('do-not-log',str(caught.exception.diagnostics))
 def test_past_deadline_never_sends_a_request(self):
  with patch('jev_swing.urlopen') as send:
   with self.assertRaises(JevRequestError):self.j.judge({'prediction_bar':1})
  send.assert_not_called()
 def test_validation_reason_is_safe_and_usage_is_retained(self):
  r=answer();r['answers']['next_bar']['probabilities']={'up':1};r['secret']='never-store-me'
  with patch('jev_swing.urlopen',return_value=Reply(r)):
   with self.assertRaises(JevResponseError) as caught:self.j.judge({})
  self.assertEqual(caught.exception.safe_usage,r['usage']);self.assertEqual(caught.exception.diagnostics['error_code'],'next_bar: invalid_distribution');self.assertNotIn('never-store-me',str(caught.exception.diagnostics))
 def test_failure_rate_counts_stale_and_unknown_without_counting_pending_as_success(self):
  rows=[{'status':status,'prompt':'test','http_status':None,'error_code':None,'attempts':attempts,'n':n} for status,attempts,n in [('AVAILABLE',1,98),('AVAILABLE',2,1),('STALE',1,1),('UNRESOLVED',1,1),('PENDING',1,3),('DISABLED',1,7)]]
  r=request_reliability(rows);self.assertEqual(r['completed'],101);self.assertEqual(r['failed'],2);self.assertEqual(r['recovered'],1);self.assertFalse(r['below_target']);self.assertEqual(r['pending'],3)
 def test_zero_failures_needs_at_least_299_samples_for_95_percent_upper_bound(self):
  row={'status':'AVAILABLE','prompt':'test','http_status':None,'error_code':None,'attempts':1,'n':10}
  self.assertGreater(request_reliability([row])['zero_failure_upper_95'],.01);row['n']=300
  self.assertLess(request_reliability([row])['zero_failure_upper_95'],.01)
if __name__=='__main__':unittest.main()

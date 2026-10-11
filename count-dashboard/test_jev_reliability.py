"""Jev regression coverage: fixture transport, no orders or paid requests."""
import io
import json
import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import taper_decisions as jev

class JevReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'receipts.jsonl'
        self.q={'direction':{'type':'choice','instructions':'Read the tape','criteria':{'UP':'Up','DOWN':'Down','WAIT':'Wait'}}}
        self.good={'type':'choice','choice':'UP','confidence':.6,'probabilities':{'UP':.7,'DOWN':.3,'WAIT':0}}
        self.state={'marketGeometry':None,'riderCandidates':[],'source':{'completedCutoff':0},'game':None}
        for obj,name,kwargs in [(jev,'_evidence',{'return_value':self.state}),(jev,'decision_questions',{'return_value':self.q})]:
            p=patch.object(obj,name,**kwargs);p.start();self.addCleanup(p.stop)
        p=patch.dict(jev.os.environ,{'TYPESAFE_API_KEY':'secret-test-only'});p.start();self.addCleanup(p.stop)
    def response(self,answer=None,tokens=100):
        return io.StringIO(json.dumps({'model':jev.MODEL,'answers':{'direction':answer or self.good},'usage':{'input_tokens':tokens,'output_tokens':5}}))
    def http(self,status,body):return HTTPError(jev.API_URL,status,'failure',{},io.BytesIO(json.dumps(body).encode()))
    def test_rounding_failure_retries_question_without_normalization(self):
        bad={**self.good,'probabilities':{'UP':.7,'DOWN':.29,'WAIT':0}}
        with patch.object(jev,'urlopen',side_effect=[self.response(bad),self.response(tokens=40)]) as send:
            r=jev.decide({},self.path)
        self.assertEqual(2,send.call_count);self.assertEqual(140,r['usage']['input_tokens'])
        self.assertEqual(.29,r['initialRawAnswers']['direction']['probabilities']['DOWN'])
        self.assertEqual(.3,r['rawAnswers']['direction']['probabilities']['DOWN'])
        self.assertIn('sum=0.990000',r['attempts'][0]['validationErrors']['direction'])
        self.assertEqual(r['estimatedUsd'],round(140*jev.INPUT_USD_PER_MILLION/1e6,8))
    def test_only_invalid_question_is_retried(self):
        self.q['other']=self.q['direction']
        bad={**self.good,'probabilities':{'UP':.7,'DOWN':.29,'WAIT':0}}
        first=json.loads(self.response(bad).getvalue());first['answers']['other']=self.good
        with patch.object(jev,'urlopen',side_effect=[io.StringIO(json.dumps(first)),self.response()]) as send:
            r=jev.decide({},self.path)
        self.assertEqual(['direction'],list(json.loads(send.call_args_list[1].args[0].data)['questions']))
        self.assertEqual(2,len(r['answers']))
    def test_repeated_invalid_answer_never_enters_ledger(self):
        bad={**self.good,'probabilities':{'UP':.7,'DOWN':.29,'WAIT':0}}
        with patch.object(jev,'urlopen',side_effect=[self.response(bad),self.response(bad)]):
            with self.assertRaises(jev.JevResponseError) as failure:jev.decide({},self.path)
        self.assertFalse(self.path.exists());self.assertTrue(failure.exception.retryable)
        self.assertEqual(200,failure.exception.receipt['usage']['input_tokens'])
    def test_http400_has_sanitized_detail_and_is_not_retryable(self):
        err=self.http(400,{'error':{'code':'context_length','message':'Exceeded context secret-test-only Bearer hidden-secret'}})
        with patch.object(jev,'urlopen',side_effect=err):
            with self.assertRaises(jev.JevResponseError) as failure:jev.decide({},self.path)
        e=failure.exception;self.assertFalse(e.retryable);self.assertEqual(400,e.receipt['httpStatus'])
        self.assertIn('context_length',str(e));self.assertNotIn('secret-test-only',str(e));self.assertNotIn('hidden-secret',str(e))
        self.assertTrue(e.receipt['costUnknown']);self.assertEqual(0,e.receipt['estimatedUsd'])
    def test_temporary_http_and_timeout_wait_for_fresh_minute(self):
        for error in (self.http(429,{'detail':'Slow down'}),self.http(529,{'error':'Busy'}),TimeoutError()):
            with patch.object(jev,'urlopen',side_effect=error) as send:
                with self.assertRaises(jev.JevResponseError) as failure:jev.decide({},self.path)
            self.assertTrue(failure.exception.retryable);self.assertEqual(1,send.call_count)
    def test_retry_failure_preserves_first_measured_usage(self):
        bad={**self.good,'probabilities':{'UP':.7,'DOWN':.29,'WAIT':0}}
        with patch.object(jev,'urlopen',side_effect=[self.response(bad),self.http(503,{'message':'Busy'})]):
            with self.assertRaises(jev.JevResponseError) as failure:jev.decide({},self.path)
        r=failure.exception.receipt;self.assertEqual(100,r['usage']['input_tokens']);self.assertEqual(2,r['apiRequests']);self.assertTrue(r['costUnknown'])

class RetryAccountingTests(unittest.TestCase):
    def test_measured_first_request_survives_unknown_retry_billing(self):
        import sqlite3
        import crypto_hunt_sessions as hunts
        import taper_session_review as review
        with sqlite3.connect(':memory:') as db:
            db.row_factory=sqlite3.Row
            hunts.schema(db)
            db.execute('CREATE TABLE api_attempts(key TEXT,state TEXT,created INTEGER,body TEXT)')
            failure={'apiRequests':2,'costUnknown':True,'costReservedUsd':.002688,'estimatedUsd':.000042,'usage':{'input_tokens':1000,'output_tokens':20}}
            hunts.event(db,'test','taper','api_request',{'barTime':60000,'source':{'provider':'test','symbol':'test'}})
            hunts.event(db,'test','taper','api_failed',{'barTime':60000,'failure':failure})
            metrics=review.api_summary(db,'test')
            self.assertEqual(1000,metrics['apiInputTokens']);self.assertEqual(.000042,metrics['apiUsd'])
            self.assertEqual(.002688,metrics['apiReservedUsd']);self.assertEqual(2,metrics['apiProviderRequests'])

class SharedHistoryTests(unittest.TestCase):
    def test_background_and_chart_tape_cover_every_geometry_volume_bar(self):
        here=Path(__file__).resolve().parent
        script="""import {analyze,FRAMES} from './web/wave-court-port.mjs';import {taperEvidence} from './web/quant-wave-court.mjs';import {marketGeometryEvidence,geometryTape} from './web/jev-market-geometry.mjs';
const bars=Array.from({length:140},(_,i)=>{const price=100+i*.08+(i%20<=10?i%20:20-i%20)*.5;return {time:i*60000,open:price,close:price,high:price+.2,low:price-.2,volume:100};});
const read=analyze(FRAMES.map(timeframe=>({timeframe,bars:timeframe==='1m'?bars:[]})),'1m');const source={id:'coinbase',market:'BTC-USD',timeframe:'1m',snapshotAsOf:bars.at(-1).time+60000};const evidence=taperEvidence(read,read.frames[6].barData,source);evidence.bars=geometryTape(read.frames[6].barData);evidence.marketGeometry=marketGeometryEvidence(read,source);console.log(JSON.stringify(evidence));"""
        evidence=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=here))
        self.assertEqual(28,len(evidence['bars']));self.assertEqual('wave-court.geometry-evidence.v2',jev._evidence(evidence)['marketGeometry']['method'])
        for file in ('rider_snapshot.mjs','web/crypto-day-desk.js'):
            self.assertIn('geometryTape(', (here/file).read_text())
        short={**evidence,'bars':evidence['bars'][-24:]}
        with self.assertRaisesRegex(ValueError,'match supplied completed tape'):jev._evidence(short)

if __name__=='__main__':unittest.main()

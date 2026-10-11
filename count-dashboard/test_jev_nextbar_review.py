import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import jev_nextbar_review as review

class Response:
    def __init__(self,x):self.x=x
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return json.dumps(self.x).encode()

class NextBarTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=review.DB_PATH;review.DB_PATH=Path(self.temp.name)/'receipts.sqlite3'
        self.bars=[{'time':1700000040000+i*60000,'open':100,'high':102,'low':98,'close':100,'volume':5} for i in range(60)]
        self.payload={'run':'test-run-123','source':{'kind':'demo','provider':'synthetic','symbol':'DEMO','completedCutoff':self.bars[-1]['time']},'bars':self.bars,'tick':.25,'atrMult':3,'jev':False}
        self.actual={**self.bars[-1],'time':self.bars[-1]['time']+60000,'high':103,'low':97}
    def tearDown(self):review.DB_PATH=self.old;self.temp.cleanup()
    def result(self,choice_high='b12',choice_low='b4',mass=1):
        def answer(choice):return {'type':'choice','choice':choice,'confidence':.9,'probabilities':{k:mass if k==choice else 0 for k in [*[f'b{i}' for i in range(17)],'UNAVAILABLE']}}
        return {'model':review.MODEL,'answers':{'high':answer(choice_high),'low':answer(choice_low),'close_up':{'type':'noul','noul':.6}},'usage':{'input_tokens':500,'output_tokens':100}}
    def model(self,result):
        self.payload['jev']=True
        return patch.object(review,'configured',return_value=True),patch.dict('os.environ',{'TYPESAFE_API_KEY':'test-only'}),patch.object(review,'urlopen',return_value=Response(result))
    def test_baseline_frozen_before_exact_next_outcome(self):
        row=review.predict(self.payload);self.assertEqual(row['baseline']['high'],112);self.assertIsNone(row['actual'])
        resolved=review.resolve({'run':row['run'],'targetTime':row['targetTime'],'actual':self.actual});self.assertTrue(resolved['baseline']['result']['contained']);self.assertEqual(resolved['baseline']['result']['highErrorTicks'],36)
    def test_future_candle_cannot_resolve_wrong_target(self):
        row=review.predict(self.payload)
        with self.assertRaisesRegex(ValueError,'immediately next'):review.resolve({'run':row['run'],'targetTime':row['targetTime'],'actual':{**self.actual,'time':self.actual['time']+60000}})
    def test_no_outcome_without_prior_prediction(self):
        with self.assertRaisesRegex(ValueError,'Freeze'):review.resolve({'run':'none-run-123','targetTime':self.actual['time'],'actual':self.actual})
    def test_repeated_request_idempotent_and_settings_frozen(self):
        row=review.predict(self.payload);self.assertEqual(row,review.predict(self.payload))
        with self.assertRaisesRegex(ValueError,'frozen'):review.predict({**self.payload,'atrMult':2})
    def test_outcome_cannot_be_rewritten(self):
        row=review.predict(self.payload);p={'run':row['run'],'targetTime':row['targetTime'],'actual':self.actual};review.resolve(p)
        with self.assertRaisesRegex(ValueError,'already frozen'):review.resolve({**p,'actual':{**self.actual,'high':104}})
    def test_invalid_ohlc_and_gaps_rejected(self):
        for key,value in [('time',self.bars[-1]['time']+60000),('high',95),('volume',-1)]:
            bars=[*self.bars[:-1],{**self.bars[-1],key:value}]
            with self.assertRaises(ValueError):review.clean_bars(bars)
    def test_valid_grid_and_only_past_input(self):
        a,b,c=self.model(self.result())
        with a,b,c as network:
            row=review.predict({**self.payload,'hunt':{'private':True},'future':self.actual});sent=json.loads(network.call_args[0][0].data)
        self.assertEqual(row['status'],'predicted');self.assertEqual(row['jev']['high'],104);self.assertEqual(row['jev']['low'],96);self.assertEqual(row['usage']['total_tokens'],600)
        self.assertNotIn('hunt',sent['state']);self.assertNotIn('future',sent['state']);self.assertEqual(max(x['time'] for x in sent['state']['completedBars']),self.bars[-1]['time']);self.assertEqual(len(sent['questions']),3)
    def test_bad_probability_not_normalized_and_usage_preserved(self):
        a,b,c=self.model(self.result(mass=.99))
        with a,b,c:row=review.predict(self.payload)
        self.assertEqual(row['status'],'failed');self.assertIsNone(row['jev']);self.assertEqual(row['rawAnswers']['high']['probabilities']['b12'],.99);self.assertEqual(row['usage']['input_tokens'],500);self.assertGreater(row['estimatedUsd'],0)
    def test_unavailable_not_substituted_with_baseline(self):
        a,b,c=self.model(self.result(choice_high='UNAVAILABLE'))
        with a,b,c:row=review.predict(self.payload)
        self.assertEqual(row['status'],'abstained');self.assertIsNone(row['jev'])
    def test_crossed_predictions_rejected(self):
        a,b,c=self.model(self.result(choice_high='b4',choice_low='b12'))
        with a,b,c:row=review.predict(self.payload)
        self.assertEqual(row['status'],'failed');self.assertIsNone(row['jev'])
    def test_live_cannot_accept_forged_browser_bars(self):
        self.payload['source'].update(kind='live',provider='hyperliquid',symbol='BTC')
        with patch.object(review,'public_source',return_value={'bars':[{**b,'close':101} for b in self.bars]}):
            with self.assertRaisesRegex(ValueError,'changed'):review.predict(self.payload)
    def test_slow_whole_prediction_excluded(self):
        a,b,c=self.model(self.result())
        with a,b,c,patch.object(review,'now',side_effect=[1000,32000]): row=review.predict(self.payload)
        self.assertTrue(row['slow']);self.assertFalse(row['comparisonEligible']);self.assertEqual(row['latencyMs'],31000)
    def test_forward_timely_prediction_saved_before_outcome(self):
        self.payload['source'].update(kind='live',provider='hyperliquid',symbol='BTC');target=self.actual['time']
        a,b,c=self.model(self.result())
        with a,b,c,patch.object(review,'public_source',return_value={'bars':self.bars}),patch.object(review,'now',side_effect=[target+1000,target+2000,target+3500]): row=review.predict(self.payload)
        self.assertIsNone(row['actual']);self.assertTrue(row['comparisonEligible']);self.assertEqual(row['leadSeconds'],56.5)
        with patch.object(review,'public_source',return_value={'bars':self.bars}): pending=review.resolve({'run':row['run'],'targetTime':target})
        self.assertTrue(pending['waiting'])
        with patch.object(review,'public_source',return_value={'bars':[*self.bars,self.actual]}): resolved=review.resolve({'run':row['run'],'targetTime':target})
        self.assertEqual(resolved['actual'],self.actual)
    def test_forward_late_prediction_retained_but_ineligible(self):
        self.payload['source'].update(kind='live',provider='hyperliquid',symbol='BTC');target=self.actual['time'];a,b,c=self.model(self.result())
        with a,b,c,patch.object(review,'public_source',return_value={'bars':self.bars}),patch.object(review,'now',side_effect=[target+1000,target+2000,target+60001]): row=review.predict(self.payload)
        self.assertTrue(row['late']);self.assertFalse(row['comparisonEligible']);self.assertIsNotNone(row['jev'])
    def test_public_fetch_excludes_forming_candle(self):
        raw=[{'t':b['time'],'o':b['open'],'h':b['high'],'l':b['low'],'c':b['close'],'v':b['volume']} for b in [*self.bars,self.actual]]
        with patch.object(review,'urlopen',return_value=Response(raw)),patch.object(review,'now',return_value=self.actual['time']+1000): source=review.public_source()
        self.assertEqual(source['source']['completedCutoff'],self.bars[-1]['time']);self.assertEqual(len(source['bars']),60)
    def test_jev_call_budget_frozen_at_120(self):
        a,b,c=self.model(self.result())
        with a,b,c as network:
            for i in range(121):
                bars=[{**x,'time':x['time']+i*60000} for x in self.bars];p={**self.payload,'bars':bars,'source':{**self.payload['source'],'completedCutoff':bars[-1]['time']}}
                if i<120: review.predict(p)
                else:
                    with self.assertRaisesRegex(ValueError,'120-read'):review.predict(p)
            self.assertEqual(network.call_count,120)
    def test_source_mode_mismatch_rejected(self):
        self.payload['source']['provider']='hyperliquid'
        with self.assertRaisesRegex(ValueError,'identity'):review.predict(self.payload)

if __name__=='__main__':unittest.main()

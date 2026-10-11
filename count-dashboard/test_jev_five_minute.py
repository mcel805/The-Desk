import copy
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import jev_nextbar_review as review
import jev_five_minute as five
import jev_paper_sim as paper

class FiveMinuteTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db=patch.object(review,'DB_PATH',Path(self.temp.name)/'receipts.sqlite3');self.db.start()
        self.env=patch.dict(os.environ,{'TYPESAFE_API_KEY':'fixture-only'});self.env.start()
        start=1800000000000//300000*300000
        self.bars=[{'time':start+i*60000,'open':83000+i,'high':83015+i,'low':82985+i,'close':83001+i,'volume':10} for i in range(400)]
        self.config={'strategy':'five-minute','capital':500,'riskProfile':'balanced','maxRiskUsd':2.5,'maxNotional':500,'feeBps':1.5,'takerFeeBps':4.5,'slippageBps':1,'sessionMinutes':60}
        self.calls=[]
    def tearDown(self):self.db.stop();self.env.stop();self.temp.cleanup()
    def answer(self,req,timeout):
        wire=json.loads(req.data);self.calls.append(wire)
        answers={}
        for side,choice in [('high','b16'),('low','b0')]:
            opts=wire['questions'][side]['criteria']
            answers[side]={'type':'choice','choice':choice,'confidence':1,'probabilities':{k:float(k==choice) for k in opts}}
        answers['close_up']={'type':'noul','noul':.7}
        return io.BytesIO(json.dumps({'model':review.MODEL,'answers':answers,'usage':{'input_tokens':100,'output_tokens':20}}).encode())
    def payload(self,i):
        prefix=self.bars[max(0,i-360):i]
        return {'run':'fixture-five-minute','source':{'kind':'replay','provider':'hyperliquid','symbol':'BTC','completedCutoff':prefix[-1]['time']},'bars':prefix,'paperSim':self.config,'tick':1,'atrMult':3,'jev':True}
    def test_aggregation_excludes_partial_and_preserves_volume(self):
        out=five.aggregate(self.bars[1:12]);self.assertEqual(len(out),1)
        self.assertEqual(out[0]['time'],self.bars[5]['time']);self.assertEqual(out[0]['volume'],50)
        self.assertEqual(out[0]['close'],self.bars[9]['close'])
    @patch.object(five,'urlopen')
    def test_horizon_reuse_resolution_and_no_future(self,network):
        network.side_effect=self.answer
        for i in range(305,365):
            frozen=review.predict(self.payload(i))
            self.assertEqual(len(frozen['directionInput']),60)
            self.assertLess(frozen['directionInput'][-1]['time']+300000,frozen['forecastEnd'])
            self.assertEqual(review.predict(self.payload(i))['stateHash'],frozen['stateHash'])
            resolved=review.resolve({'run':frozen['run'],'targetTime':frozen['targetTime'],'actual':self.bars[i]})
            self.assertEqual(bool(resolved.get('forecastActual')),i%5==4)
            if i%5!=4:self.assertNotIn('result',resolved['jev'])
        self.assertEqual(len(self.calls),12)
        for wire in self.calls:
            self.assertEqual(wire['state']['source']['timeframe'],'5m')
            self.assertEqual(wire['state']['completedBars'][-1]['time']+300000,wire['state']['forecastStart'])
            self.assertNotIn('paperSim',wire['state'])
        statement=review.finalize_paper({'run':'fixture-five-minute'})
        self.assertTrue(statement['complete']);self.assertEqual(statement['summary']['resolvedCandles'],60)
        self.assertEqual(statement['summary']['apiCostEstimate'],.0000504)
    @patch.object(five,'urlopen')
    def test_revision_and_setting_changes_rejected(self,network):
        network.side_effect=self.answer;p=self.payload(305);r=review.predict(p)
        review.resolve({'run':r['run'],'targetTime':r['targetTime'],'actual':self.bars[305]})
        changed=self.payload(306);changed['bars']=copy.deepcopy(changed['bars']);changed['bars'][-2]['volume']+=1
        with self.assertRaisesRegex(ValueError,'tape changed'):review.predict(changed)
        changed=self.payload(306);changed['paperSim']={**self.config,'maxRiskUsd':3}
        with self.assertRaisesRegex(ValueError,'changing settings'):review.predict(changed)
    def row(self):
        bars=copy.deepcopy(self.bars[:305]);bars[-1].update(open=83302,high=83311,low=83300,close=83310)
        return {'run':'fixture-plan-five','targetTime':bars[-1]['time']+60000,'createdAt':1000,'returnedAt':1001,'completedInput':bars,'directionInput':five.aggregate(bars)[-60:],'forecastId':bars[-1]['time']+60000,'forecastEnd':bars[-1]['time']+360000,'tick':1,'atr':35,'status':'predicted','comparisonEligible':True,'jev':{'low':83000,'high':83400}}
    def test_qualified_order_risk_and_frozen_limit_expiry(self):
        row=self.row();config=paper.validate_config(self.config);p=paper.plan(row,[],config)
        self.assertEqual(p['status'],'working');self.assertLessEqual(p['plannedRisk'],2.5)
        self.assertGreaterEqual(p['netRewardRisk'],1.25)
        outside={'time':row['targetTime'],'open':83310,'high':83320,'low':83300,'close':83315,'volume':1}
        working=paper.settle(p,outside,config);self.assertEqual(working['status'],'working')
        old={**row,'paperTrade':working,'actual':outside,'resolvedAt':1002}
        nextrow={**row,'targetTime':row['targetTime']+60000,'createdAt':1003,'jev':{'low':83010,'high':83430}}
        carried=paper.plan(nextrow,[old],config)
        self.assertEqual(carried['entry'],p['entry']);self.assertEqual(carried['quantity'],p['quantity'])
        self.assertEqual(carried['initialStop'],p['initialStop'])
        self.assertEqual(carried['plannedNetReward'],p['plannedNetReward'])
        expired=paper.plan({**nextrow,'targetTime':row['targetTime']+300000},[old],config)
        self.assertEqual(expired['status'],'cancelled')
    def test_two_distinct_failed_horizons_and_stop_never_widens(self):
        row=self.row();config=paper.validate_config(self.config);p=self.position()
        position={**p,'status':'open','openedAt':row['targetTime']-60000,'netPnl':0}
        previous={**row,'targetTime':row['targetTime']-60000,'forecastId':row['forecastId']-300000,'paperTrade':position,'actual':self.bars[304],'resolvedAt':999}
        held=paper.plan(row,[previous],config);self.assertGreaterEqual(held['stop'],position['stop'])
        failed={**row,'status':'failed','jev':None,'comparisonEligible':False}
        first=paper.plan(failed,[previous],config);self.assertNotIn('exitAtOpen',first)
        priorfailed={**failed,'paperTrade':position,'actual':self.bars[305],'resolvedAt':1002}
        cached=paper.plan({**failed,'targetTime':row['targetTime']+60000,'createdAt':1003},[previous,priorfailed],config)
        self.assertNotIn('exitAtOpen',cached)
        second=paper.plan({**failed,'forecastId':row['forecastId']+300000,'targetTime':row['targetTime']+300000,'createdAt':1003},[previous,priorfailed],config)
        self.assertEqual(second['exitAtOpen'],'FORECAST_UNAVAILABLE')
    def position(self):return {'version':paper.FIVE_MINUTE_VERSION,'status':'holding','side':'LONG','entry':83000,'entryFill':83000,'stop':82900,'target':83400,'quantity':.005,'balanceBefore':500,'targetTime':self.bars[305]['time'],'sessionClose':False,'positionOpenedAt':self.bars[304]['time']}
    def test_target_maker_and_stop_taker_costs(self):
        config=paper.validate_config(self.config);p=self.position()
        target={'time':p['targetTime'],'open':83200,'high':83410,'low':83100,'close':83300,'volume':1}
        result=paper.settle(p,target,config);self.assertEqual(result['reason'],'JEV_BAND_TARGET');self.assertEqual(result['exitFill'],83400);self.assertEqual(result['exitFeeBps'],1.5);self.assertEqual(result['slippage'],0)
        stop={**target,'open':82800,'low':82790,'high':83000,'close':82900}
        result=paper.settle(p,stop,config);self.assertEqual(result['reason'],'STOP_GAP');self.assertLess(result['exitFill'],82800);self.assertEqual(result['exitFeeBps'],4.5)
    def test_session_end_closes_position(self):
        p={**self.position(),'sessionClose':True};config=paper.validate_config(self.config)
        bar={'time':p['targetTime'],'open':83100,'high':83200,'low':83000,'close':83150,'volume':1}
        result=paper.settle(p,bar,config);self.assertEqual(result['reason'],'SESSION_END');self.assertEqual(result['exitFeeBps'],4.5)

class ExplorationTests(FiveMinuteTests):
    def exploration(self, **extra):
        return paper.validate_config({**self.config,'entryPreset':'exploration',**extra})
    def test_validated_defaults_and_legacy_preserved(self):
        c=self.exploration()
        self.assertEqual(c['version'],paper.EXPLORATION_VERSION)
        self.assertEqual(c['costMargin'],1.25);self.assertEqual(c['minNetRewardRisk'],.25)
        legacy=paper.validate_config(self.config)
        self.assertEqual(legacy['version'],paper.FIVE_MINUTE_VERSION)
        self.assertNotIn('entryPreset',legacy)
        for key,val in [('costMargin',.9),('costMargin',True),('costMargin',float('nan')),('minNetRewardRisk',0),('minNetRewardRisk',6)]:
            with self.assertRaises(ValueError):self.exploration(**{key:val})
    def test_immediate_passive_entry_and_structural_stop(self):
        row=self.row();row['completedInput'][-1]['close']=83301
        c=self.exploration();plan=paper.plan(row,[],c)
        self.assertEqual(plan['status'],'working');self.assertEqual(plan['version'],paper.EXPLORATION_VERSION)
        self.assertEqual(plan['stop'],82999)
        self.assertAlmostEqual(plan['roundTripCostPerUnit'],(83000+83400)*.00015)
        self.assertLessEqual(plan['plannedRisk'],2.5)
        self.assertLessEqual(plan['quantity']*plan['entry'],500)
        strict=paper.plan(row,[],paper.validate_config(self.config))
        self.assertEqual(strict['status'],'skipped')
        self.assertIn('pullback/rejection',strict['reason'])
    def test_thresholds_and_passivity_still_enforced(self):
        row=self.row();row['jev']={'low':83280,'high':83320}
        self.assertEqual(paper.plan(row,[],self.exploration(costMargin=5))['status'],'skipped')
        self.assertEqual(paper.plan(row,[],self.exploration(minNetRewardRisk=5))['status'],'skipped')
        row['jev']={'low':83315,'high':83400}
        self.assertIn('passive',paper.plan(row,[],self.exploration())['reason'])
    def test_stop_uses_structure_and_only_tightens(self):
        row=self.row();row['completedInput'][-2]['low']=82900
        plan=paper.plan(row,[],self.exploration());self.assertEqual(plan['stop'],82899)
        pos={**self.position(),'status':'open','openedAt':row['targetTime']-60000,'stop':82899,'netPnl':0}
        old={**row,'paperTrade':pos,'actual':self.bars[304],'resolvedAt':999,'targetTime':row['targetTime']-60000}
        for low in [82800,83100]:
            current=copy.deepcopy(row);current['jev']['low']=low
            result=paper.plan(current,[old],self.exploration())
            self.assertGreaterEqual(result['stop'],pos['stop'])
            self.assertLess(result['stop'],current['completedInput'][-1]['close'])
    @patch.object(five,'urlopen')
    def test_exploration_settings_frozen(self,network):
        network.side_effect=self.answer
        self.config={**self.config,'entryPreset':'exploration'}
        row=review.predict(self.payload(305))
        self.assertEqual(row['paperPlan']['version'],paper.EXPLORATION_VERSION)
        review.resolve({'run':row['run'],'targetTime':row['targetTime'],'actual':self.bars[305]})
        changed=self.payload(306);changed['paperSim']={**self.config,'costMargin':1.5}
        with self.assertRaisesRegex(ValueError,'changing settings'):review.predict(changed)

    def test_buffer_version_validation_and_legacy_zero(self):
        c=self.exploration(stopBufferAtr=.5)
        self.assertEqual(c['version'],paper.BUFFERED_VERSION)
        self.assertEqual(self.exploration(stopBufferAtr=0),self.exploration())
        for v in [True,-.1,3.1,float('nan'),float('inf')]:
            with self.assertRaises(ValueError):self.exploration(stopBufferAtr=v)
    def test_buffer_uses_completed_one_minute_true_ranges(self):
        row=self.row();row['actual']={'high':1000000,'low':1,'close':1}
        c=self.exploration(stopBufferAtr=.5);p=paper.plan(row,[],c)
        bars=row['completedInput'][-15:]
        expected=sum(max(b['high']-b['low'],abs(b['high']-bars[i-1]['close']),abs(b['low']-bars[i-1]['close'])) for i,b in enumerate(bars) if i)/14
        self.assertAlmostEqual(p['executionAtr'],expected)
        self.assertAlmostEqual(p['stopBuffer'],max(row['tick'],expected*.5))
        import math
        self.assertEqual(p['stop'],math.floor((83000-p['stopBuffer'])/row['tick'])*row['tick'])
        self.assertLess(p['stop'],paper.plan(row,[],self.exploration())['stop'])
        self.assertLessEqual(p['plannedRisk'],2.5)
        self.assertLessEqual(p['quantity'],paper.plan(row,[],self.exploration())['quantity'])
    def test_short_stop_padding_and_never_widens(self):
        row=self.row();row['completedInput'][-1]['close']=83301;c=self.exploration(stopBufferAtr=.5)
        with patch.object(paper,'_sar_direction',return_value=('DOWN',83500)):
            p=paper.plan(row,[],c);self.assertEqual(p['side'],'SHORT')
            self.assertGreater(p['stop'],row['jev']['high']+1)
            pos={**p,'status':'open','entryFill':p['entry'],'openedAt':row['targetTime']-60000,'netPnl':0}
            old={**row,'targetTime':row['targetTime']-60000,'paperTrade':pos,'actual':self.bars[304],'resolvedAt':999}
            for high in [83500,83315]:
                current=copy.deepcopy(row);current['jev']['high']=high
                held=paper.plan(current,[old],c)
                self.assertLessEqual(held['stop'],pos['stop'])
                self.assertGreater(held['stop'],current['completedInput'][-1]['close'])
    def test_resting_buffer_is_frozen_across_volatility_change(self):
        row=self.row();c=self.exploration(stopBufferAtr=.5);p=paper.plan(row,[],c)
        actual={'time':row['targetTime'],'open':83310,'high':83320,'low':83300,'close':83315,'volume':1}
        working=paper.settle(p,actual,c);old={**row,'paperTrade':working,'actual':actual,'resolvedAt':1002}
        changed=copy.deepcopy(row);changed['targetTime']+=60000;changed['createdAt']=1003;changed['completedInput'][-1]['high']+=1000
        carried=paper.plan(changed,[old],c)
        for key in ['stop','initialStop','quantity','stopBuffer','executionAtr']:
            self.assertEqual(carried[key],p[key])
    @patch.object(five,'urlopen')
    def test_buffer_setting_is_frozen_in_session(self,network):
        network.side_effect=self.answer;self.config={**self.config,'entryPreset':'exploration','stopBufferAtr':.5}
        row=review.predict(self.payload(305));self.assertEqual(row['paperPlan']['version'],paper.BUFFERED_VERSION)
        review.resolve({'run':row['run'],'targetTime':row['targetTime'],'actual':self.bars[305]})
        changed=self.payload(306);changed['paperSim']={**self.config,'stopBufferAtr':1}
        with self.assertRaisesRegex(ValueError,'changing settings'):review.predict(changed)

if __name__=='__main__':unittest.main()

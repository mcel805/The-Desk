import json
import math
import tempfile
import time
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from swing_tracker import Config, SwingTracker
from swing_research import SwingResearch
from jev_swing import Jev, validate_response, QUESTIONS, MODEL

BASE=1770000000000//60000*60000

def bar(i,o=100,h=102,l=98,c=100):return {'time':BASE+i*60000,'open':o,'high':h,'low':l,'close':c,'volume':10}
def candidate(side=1):
    return {'id':1,'parent':1,'side':side,'profile':'LONG_REVERSAL' if side==1 else 'SHORT_REVERSAL','a':{'price':90 if side==1 else 110,'index':0,'origin':BASE,'known':BASE+60000},'b':{'price':110 if side==1 else 90,'index':1,'origin':BASE+60000,'known':BASE+120000},'born':BASE+120000,'born_index':1,'c':99 if side==1 else 101,'c_index':3,'c_origin':BASE+180000,'target':120 if side==1 else 80,'target_known':BASE,'target_role':'RECOGNIZED_PIVOT','state':'WATCH','reason':'DEVELOPING_C'}
def response():
    return {'model':MODEL,'answers':{k:({'type':'noul','noul':.6} if q['type']=='noul' else {'type':'choice','choice':next(iter(q['criteria'])),'confidence':.2,'probabilities':{x:1/len(q['criteria']) for x in q['criteria']}}) for k,q in QUESTIONS.items()},'usage':{}}

class TrackerTests(unittest.TestCase):
    def test_confirmed_pivot_is_causal_and_not_backdated(self):
        t=SwingTracker(Config(swing_minutes=1,micro_bars=1),tick=1)
        t.feed(bar(0,h=103));t.feed(bar(1,h=110));self.assertEqual(t.path,[])
        t.feed(bar(2,h=104));self.assertEqual(t.path[0]['origin'],BASE+60000);self.assertEqual(t.path[0]['known'],BASE+180000)

    def test_aggregated_pivot_waits_for_complete_confirmation_bucket(self):
        t=SwingTracker(Config(swing_minutes=2,micro_bars=1),tick=1)
        # Align source buckets despite arbitrary BASE.
        start=BASE//120000*120000
        for i in range(5):t.feed({**bar(i,h=110 if i in (2,3) else 103),'time':start+i*60000})
        self.assertEqual(t.path,[])
        t.feed({**bar(5,h=103),'time':start+300000})
        self.assertEqual(t.path[0]['known'],start+360000)

    def test_prefix_replay_matches_incremental_snapshot(self):
        bars=[bar(i,o=100+math.sin(i/4)*10,h=103+math.sin(i/4)*10,l=97+math.sin(i/4)*10,c=101+math.sin(i/4)*10) for i in range(150)]
        live=SwingTracker(Config(swing_minutes=3,target_mode='measured'),tick=.1)
        for i,b in enumerate(bars):
            live.feed(b)
            if i in (29,75,149):
                replay=SwingTracker(live.config,tick=.1)
                for x in bars[:i+1]:replay.feed(x)
                self.assertEqual(live.snapshot(),replay.snapshot())

    def prepared(self,side=1,**kwargs):
        t=SwingTracker(Config(swing_minutes=1,geometry=False,max_chase_ticks=30,quantity=.1,**kwargs),tick=1)
        t.bars=[{**bar(i,h=102,l=99,c=100),'index':i} for i in range(5)];t.index=5;t.day=BASE//86400000;t.candidates=[candidate(side)]
        return t

    def test_mirrored_sweep_ready_and_fractional_risk(self):
        for side,b in [(1,bar(5,o=99,h=102,l=97,c=101)),(-1,bar(5,o=101,h=103,l=98,c=99))]:
            t=self.prepared(side)
            if side==-1:t.bars=[{**bar(i,h=101,l=98,c=100),'index':i} for i in range(5)]
            t.evaluate(t.candidates[0],b,b['time']+60000)
            self.assertEqual(t.candidates[0]['state'],'READY')
            self.assertAlmostEqual(t.plans[0]['reserved_risk'],.9)
            self.assertEqual(t.plans[0]['signal_at'],b['time']+60000)

    def test_blocked_attempt_does_not_retry(self):
        t=self.prepared(attempt_risk=.1);b=bar(5,o=99,h=102,l=97,c=101)
        t.evaluate(t.candidates[0],b,b['time']+60000)
        self.assertEqual(t.candidates[0]['state'],'BLOCKED');self.assertEqual(t.plans,[])
        t.last_time=b['time'];t.feed(bar(6,o=99,h=102,l=96,c=101));self.assertEqual(t.plans,[])

    def test_parent_cap_does_not_refund_or_rewrite_a_qualified_attempt(self):
        t=self.prepared();t.parent_count=2;t.reserved_parent=12
        t.evaluate(t.candidates[0],bar(5,o=99,h=102,l=97,c=101),BASE+360000)
        self.assertEqual(t.candidates[0]['state'],'BLOCKED');self.assertEqual(t.candidates[0]['reason'],'PARENT_COUNT')
        self.assertEqual(t.reserved_parent,12)

    def test_ready_record_freezes_every_plan_field(self):
        t=self.prepared();t.evaluate(t.candidates[0],bar(5,o=99,h=102,l=97,c=101),BASE+360000)
        frozen=deepcopy(t.events[-1]['frozen_plan'])
        t.plans[0]['stop']=100;t.candidates[0]['c']=80
        self.assertEqual(t.events[-1]['frozen_plan'],frozen)

    def test_gap_ends_watch_and_drops_old_pools(self):
        t=self.prepared();t.last_time=BASE+240000;t.pools=[{'price':110,'side':1,'known':BASE}]
        t.feed(bar(8));self.assertEqual(t.candidates[0]['reason'],'DATA_GAP');self.assertEqual(t.pools,[])

    def test_channel_does_not_include_evaluation_extreme(self):
        t=self.prepared();c=t.candidates[0];before=t.envelope(c,BASE+360000)
        t.evaluate(c,bar(5,o=99,h=104,l=95,c=101),BASE+360000)
        self.assertEqual(c['channel'],before);self.assertEqual(c['c'],95)

    def plan(self):
        return {'id':1,'status':'PENDING','signal_at':BASE,'reference':100,'side':1,'stop':95,'target':110,'reserved_risk':25,'b':{'price':105}}

    def test_shadow_both_barriers_is_unknown(self):
        t=SwingTracker(Config(quantity=1));t.plans=[self.plan()];t.observe_plans(bar(0,h=111,l=94),BASE+60000)
        self.assertEqual(t.plans[0]['status'],'AMBIGUOUS');self.assertNotIn('gross_r',t.plans[0])

    def test_be_only_effective_following_bar(self):
        t=SwingTracker(Config(quantity=1),tick=1);t.plans=[self.plan()]
        t.observe_plans(bar(0,h=108,l=98,c=106),BASE+60000)
        self.assertEqual(t.plans[0]['status'],'OPEN');self.assertEqual(t.plans[0]['stop'],100)
        t.observe_plans(bar(1,o=106,h=107,l=99,c=101),BASE+120000)
        self.assertEqual(t.plans[0]['status'],'STOP');self.assertEqual(t.plans[0]['gross_r'],0)

    def test_live_confirmation_cannot_inherit_an_earlier_minute_open(self):
        t=self.prepared();b=bar(5,o=99,h=102,l=97,c=101);at=b['time']+60000
        t.observed_at=at+15000;t.evaluate(t.candidates[0],b,at)
        p=t.plans[0];self.assertEqual(p['eligible_open'],at+60000)
        t.observe_plans(bar(6,o=101,h=102,l=99,c=101),at+60000)
        self.assertEqual(p['status'],'PENDING');self.assertNotIn('entry',p)
        t.observe_plans(bar(7,o=101,h=102,l=99,c=101),at+120000)
        self.assertEqual(p['status'],'OPEN');self.assertEqual(p['entry_at'],at+60000)
        self.assertGreater(p['entry_at'],p['observed_at'])

    def test_next_open_gap_has_no_shadow_fill(self):
        t=SwingTracker(Config(quantity=1),tick=1);t.plans=[self.plan()]
        t.observe_plans(bar(0,o=104,h=105,l=103,c=104),BASE+60000)
        self.assertEqual(t.plans[0]['status'],'MISSED');self.assertNotIn('entry',t.plans[0])

    def test_bad_config_and_bar_rejected(self):
        for cfg in ({'swing_minutes':4},{'quantity':float('nan')},{'geometry':'yes'},{'micro_bars':True}):
            with self.assertRaises(ValueError):Config(**cfg)
        t=SwingTracker();t.feed(bar(0))
        with self.assertRaises(ValueError):t.feed(bar(0))
        with self.assertRaises(ValueError):t.feed(bar(1,h=99))

class JevTests(unittest.TestCase):
    def test_session_key_overrides_environment_and_clears_without_mutating_it(self):
        with patch.dict('os.environ',{'TYPESAFE_API_KEY':'test-only-environment-token'}):
            j=Jev();self.assertTrue(j.configured);self.assertEqual(j.key_source,'environment')
            j.set_session_key('test-only-session-token')
            self.assertEqual(j.key_source,'server_memory')
            j.set_session_key('');self.assertFalse(j.configured);self.assertIsNone(j.key_source)
            self.assertTrue(Jev().configured)

    def test_strict_typed_contract(self):
        self.assertEqual(validate_response(response())['model'],MODEL)
        for mutate in [lambda r:r.update(model='jev-latest'),lambda r:r['answers']['long_fit'].update(noul=float('nan')),lambda r:r['answers']['next_bar'].update(probabilities={'up':1}),lambda r:r['answers']['next_bar'].update(confidence=2)]:
            r=response();mutate(r)
            with self.assertRaises(ValueError):validate_response(r)

class FakeJudge:
    configured=True
    def judge(self,state):return response()
class FakeGateway:
    def __init__(self,now):self.now=now
    def bars(self,*args):
        start=(self.now//60000-70)*60000
        return {'bars':[{'time':start+i*60000,'open':100,'high':103+math.sin(((start//60000+i)%100)/3),'low':97+math.sin(((start//60000+i)%100)/3),'close':101,'volume':10} for i in range(71)],'as_of':self.now}
    def quote(self,*args):return '100','101',{'tick':'1','qty_step':'.001','source_time':self.now,'metadata_verified':True}

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.now=BASE+9000000+10000;self.gateway=FakeGateway(self.now);self.service=SwingResearch(self.gateway,Path(self.tmp.name),FakeJudge())
    def tearDown(self):self.service.close();self.tmp.cleanup()
    def command(self,action,**kw):
        with patch('swing_research.time.time',return_value=self.now/1000):return self.service.command({'action':action,'symbol':'hyperliquid:BTC',**kw})
    def sample(self):
        with patch('swing_research.time.time',return_value=self.now/1000):self.service.sample('hyperliquid:BTC',self.service.active['hyperliquid:BTC'])
    def test_restart_paused_config_boundary_and_no_order_engine(self):
        self.command('start');old=self.service.active['hyperliquid:BTC']['run'];self.command('configure',config={'cadence_seconds':10})
        self.assertNotIn('hyperliquid:BTC',self.service.active);self.command('start');self.assertNotEqual(old,self.service.active['hyperliquid:BTC']['run'])
        second=SwingResearch(self.gateway,Path(self.tmp.name));self.assertEqual(second.active,{});self.assertFalse(hasattr(second,'engine'))
    def test_closed_bar_forward_labels_and_intrabar_not_extra_primary(self):
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample();self.now+=15000;self.gateway.now=self.now;self.sample()
        h=self.service.history('hyperliquid:BTC');self.assertEqual(len(h['predictions']),2);self.assertEqual(sum(p['primary_sample'] for p in h['predictions']),1)
        self.assertEqual(h['metrics']['n'],0)
        self.now+=45000;self.gateway.now=self.now;self.sample()
        self.now+=60000;self.gateway.now=self.now;self.sample()
        h=self.service.history('hyperliquid:BTC');self.assertEqual(h['metrics']['n'],1);self.assertEqual(h['predictions'][-1]['outcome']['label'],'up')
    def test_revision_stops_without_rewriting_history(self):
        self.command('start');self.sample();original=self.gateway.bars
        def revised(*args):
            r=original(*args);r['bars'][-3]['close']=100;return r
        self.gateway.bars=revised;self.sample()
        self.assertNotIn('hyperliquid:BTC',self.service.active)
        self.assertIn('REVISED',self.service.last['hyperliquid:BTC']['detail'])
    def test_cached_forming_bar_cannot_be_promoted_by_wall_clock(self):
        self.command('start');original=self.gateway.bars
        self.gateway.bars=lambda *args:{**original(*args),'as_of':self.now-15000}
        self.sample();s=self.service.last['hyperliquid:BTC']
        expected=(self.now-15000)//60000*60000
        self.assertEqual(s['snapshot']['cutoff'],expected)
        # The previously partial bar is not in the immutable closed-input set.
        a=self.service.active['hyperliquid:BTC'];self.assertNotIn(expected,a['seen'])
        self.now+=15000;self.gateway.now=self.now;self.gateway.bars=original;self.sample()
        self.assertIn('hyperliquid:BTC',self.service.active)
        self.assertGreater(self.service.last['hyperliquid:BTC']['snapshot']['cutoff'],expected)

    def test_exactly_four_slots_keep_votes_and_failures_distinct(self):
        self.command('configure',config={'jev_enabled':True});self.command('start')
        class Votes:
            configured=True
            def __init__(self):self.i=0
            def judge(self,state):
                r=response();r['answers']['directional_lean']['choice']=['long','short','neutral','long'][self.i];self.i+=1;return r
        self.service.judge=Votes()
        self.now=self.now//60000*60000+1000
        for i in range(4):
            self.gateway.now=self.now;self.sample();self.sample();self.now+=15000
        s=self.service.status()['symbols']['hyperliquid:BTC']
        self.assertEqual(len(s['dots']),4);self.assertEqual([d['slot'] for d in s['dots']],[1,2,3,4])
        self.assertEqual([d['vote'] for d in s['dots']],['up','down','flat','up'])
        self.command('pause')
        self.assertEqual(len(self.service.status()['symbols']['hyperliquid:BTC']['dots']),4)

    def test_minute_crossing_response_is_stored_but_not_colored(self):
        self.command('configure',config={'jev_enabled':True});self.command('start')
        with patch('swing_research.time.time',side_effect=[self.now/1000,(self.now+60000)/1000]):
            self.service.sample('hyperliquid:BTC',self.service.active['hyperliquid:BTC'])
        s=self.service.status()['symbols']['hyperliquid:BTC']
        self.assertEqual(s['jev']['status'],'STALE');self.assertEqual(s['dots'][0]['vote'],'unavailable')
        self.assertEqual(s['dots'][0]['service'],'STALE')

    def test_result_returning_after_pause_cannot_reattach_to_run(self):
        service=self.service
        class Pausing:
            configured=True
            def judge(self,state):
                service.command({'action':'pause','symbol':'hyperliquid:BTC'})
                return response()
        self.service.judge=Pausing();self.command('configure',config={'jev_enabled':True});self.command('start');self.sample()
        s=self.service.status()['symbols']['hyperliquid:BTC']
        self.assertFalse(s['running']);self.assertEqual(s['dots'][0]['vote'],'unavailable')

    def test_interrupted_run_cannot_invent_catchup_signals(self):
        self.command('start');self.sample();self.now+=180000;self.gateway.now=self.now;self.sample()
        self.assertNotIn('hyperliquid:BTC',self.service.active)
        self.assertIn('INTERRUPTED',self.service.last['hyperliquid:BTC']['detail'])

    def test_no_key_cannot_enable_model(self):
        self.service.judge=type('Missing',(),{'configured':False})()
        with self.assertRaises(ValueError):self.command('configure',config={'jev_enabled':True})

    def test_key_entry_is_memory_only_pauses_both_markets_and_never_exports_secret(self):
        self.service.judge=Jev()
        self.command('start')
        self.service.command({'action':'start','symbol':'hyperliquid:ETH'})
        key='test-only-never-a-real-provider-key'
        result=self.service.configure_key({'api_key':key})
        self.assertTrue(result['configured']);self.assertFalse(result['verified'])
        self.assertEqual(self.service.active,{})
        self.assertNotIn(key,json.dumps(self.service.status()))
        self.assertNotIn(key,json.dumps(self.service.export('hyperliquid:BTC')))
        self.assertNotIn(key.encode(),self.service.path.read_bytes())
        self.service.configure_key({'api_key':''})
        self.assertFalse(self.service.judge.configured)
        with patch.dict('os.environ',{},clear=True):
            restarted=SwingResearch(self.gateway,Path(self.tmp.name))
            self.assertFalse(restarted.judge.configured)
            restarted.close()

    def test_invalid_key_shapes_do_not_echo_key_or_pause_running_state(self):
        self.command('start')
        for payload in ({'api_key':12},{'api_key':'secret with spaces'},{'api_key':'x'*4097},{'api_key':'x','extra':True}):
            with self.assertRaises(ValueError):self.service.configure_key(payload)
        self.assertIn('hyperliquid:BTC',self.service.active)
    def test_model_failure_cannot_create_signal(self):
        self.service.judge=type('Broken',(),{'configured':True,'judge':lambda *a:(_ for _ in ()).throw(TimeoutError())})()
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample()
        self.assertEqual(self.service.last['hyperliquid:BTC']['jev']['status'],'UNAVAILABLE')
        self.assertEqual(self.service.history('hyperliquid:BTC')['metrics']['n'],0)

if __name__=='__main__':unittest.main()

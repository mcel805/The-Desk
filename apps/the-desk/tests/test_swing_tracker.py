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

    def test_study_tracker_requires_known_campaign_and_freezes_its_htf_target(self):
        t=self.prepared();b=bar(5,o=99,h=102,l=97,c=101);at=b['time']+60000
        t.observed_at=at+10000;t.set_study_campaigns([])
        t.evaluate(t.candidates[0],b,at)
        self.assertEqual(t.candidates[0]['reason'],'WAIT_HTF_CAMPAIGN');self.assertEqual(t.plans,[])
        campaign={'id':'known-htf-contact','state':'WATCH','side':1,'observed_at':at-60000,
                  'expires':at+600000,'target':{'price':130,'known_at':at-120000,'available_at':at-60000}}
        t.set_study_campaigns([campaign]);t.evaluate(t.candidates[0],b,at)
        self.assertEqual(t.plans[0]['target'],130)
        self.assertEqual(t.plans[0]['target_role'],'HTF_STUDY_OBJECTIVE')
        self.assertEqual(t.plans[0]['study_campaign'],'known-htf-contact')
        t.set_study_campaigns([{**campaign,'target':{'price':150,'known_at':at-120000}}])
        self.assertEqual(t.plans[0]['target'],130)

    def test_study_wait_does_not_suspend_candidate_expiry(self):
        t=self.prepared(candidate_bars=3);t.index=10;t.set_study_campaigns([])
        t.evaluate(t.candidates[0],bar(10,o=99,h=102,l=97,c=101),BASE+660000)
        self.assertEqual(t.candidates[0]['reason'],'EXPIRED')

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
            j=Jev(store=False);self.assertTrue(j.configured);self.assertEqual(j.key_source,'environment')
            j.set_session_key('test-only-session-token')
            self.assertEqual(j.key_source,'server_memory')
            j.set_session_key('');self.assertFalse(j.configured);self.assertIsNone(j.key_source)
            self.assertTrue(Jev(store=False).configured)

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

    def test_paused_status_reuses_evidence_but_external_commits_invalidate_it(self):
        first=self.service.status()
        first['symbols']['hyperliquid:BTC']['status']='caller mutation'
        with patch.object(self.service,'read_db',side_effect=AssertionError('unchanged archive reread')):
            cached=self.service.status()
        self.assertNotEqual(cached['symbols']['hyperliquid:BTC']['status'],'caller mutation')
        with self.service.db() as db:
            db.execute("INSERT INTO runs VALUES(?,?,?,?)",('external','hyperliquid:BTC',self.now,json.dumps({'jev_enabled':False})))
            db.execute("INSERT INTO jev_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",('external','external','hyperliquid:BTC',self.now,None,'DISABLED',None,None,None,0,None,'request_snapshot'))
        refreshed=self.service.status()
        self.assertEqual(refreshed['costs']['total']['observations'],1)

    def test_latest_dot_query_uses_run_time_index_without_sorting_archive_payloads(self):
        with self.service.read_db() as db:
            plan=' '.join(str(tuple(r)) for r in db.execute('EXPLAIN QUERY PLAN SELECT p.id,p.at,p.state,p.response,u.status FROM predictions p LEFT JOIN jev_usage u ON u.prediction_id=p.id WHERE p.run=? ORDER BY p.at DESC LIMIT 360',('run',)))
        self.assertIn('predictions_run_at',plan)
        self.assertNotIn('TEMP B-TREE',plan)

    def test_active_status_reuses_unchanged_evidence_and_still_becomes_stale(self):
        self.command('start');self.sample()
        with patch('swing_research.time.time',return_value=self.now/1000):self.service.status()
        with patch.object(self.service,'read_db',side_effect=AssertionError('unchanged active evidence reread')):
            with patch('swing_research.time.time',return_value=(self.now+80000)/1000):
                result=self.service.status()
        self.assertTrue(result['symbols']['hyperliquid:BTC']['running'])
        self.assertEqual(result['symbols']['hyperliquid:BTC']['status'],'STALE')

    def test_quick_status_keeps_control_state_responsive_during_slow_evidence_read(self):
        import threading
        from contextlib import contextmanager
        self.command('start');self.sample();self.service.status()
        entered=threading.Event();release=threading.Event();original=self.service.read_db
        @contextmanager
        def slow_read():
            entered.set();release.wait(2)
            with original() as db:yield db
        self.service.last['hyperliquid:BTC']['detail']='new control state'
        with patch.object(self.service,'read_db',slow_read):
            try:
                self.service.quick_status();self.assertTrue(entered.wait(1))
                current=self.service.quick_status()
                self.assertTrue(current['symbols']['hyperliquid:BTC']['running'])
                self.assertEqual(current['symbols']['hyperliquid:BTC']['detail'],'new control state')
                self.assertTrue(current['evidence_refreshing'])
                with self.service.lock:self.service.last['hyperliquid:BTC']['run']='replacement-run'
                changed=self.service.quick_status()
                self.assertEqual(changed['symbols']['hyperliquid:BTC']['dots'],[])
                self.assertIsNone(changed['symbols']['hyperliquid:BTC']['collection'])
                self.assertIsNone(changed['costs'])
            finally:release.set();self.service._status_worker.join(timeout=2)

    def test_cold_quick_status_reports_unknown_evidence_without_starting_an_observer(self):
        import threading
        release=threading.Event();entered=threading.Event();calls=[]
        def slow_status():
            calls.append(1);entered.set();release.wait(2)
        with patch.object(self.service,'status',slow_status):
            try:
                first=self.service.quick_status();self.assertTrue(entered.wait(1))
                second=self.service.quick_status()
                self.assertIsNone(first['costs']);self.assertIsNone(second['costs'])
                self.assertIsNone(first['symbols']['hyperliquid:BTC']['evidence_as_of'])
                self.assertIsNone(first['symbols']['hyperliquid:BTC']['collection'])
                self.assertEqual(self.service.active,{})
                self.assertEqual(len(calls),1)
            finally:release.set();self.service._status_worker.join(timeout=2)

    def test_quick_status_returns_timestamped_previous_state_while_collector_commits(self):
        import threading
        first=self.service.quick_status();entered=threading.Event();release=threading.Event()
        def commit():
            with self.service.lock:entered.set();release.wait(2)
        writer=threading.Thread(target=commit);writer.start()
        try:
            self.assertTrue(entered.wait(1))
            retained=self.service.quick_status()
            self.assertTrue(writer.is_alive())
            self.assertTrue(retained['control_refresh_pending'])
            self.assertEqual(retained['as_of'],first['as_of'])
        finally:release.set();writer.join(timeout=2)

    def test_startup_publishes_unknown_evidence_before_slow_auto_resume(self):
        import threading
        entered=threading.Event();release=threading.Event()
        def warmup():
            with self.service.lock:entered.set();release.wait(2)
        with patch.object(self.service,'loop',warmup),patch.object(self.service.lab,'start'):
            try:
                self.service.start();self.assertTrue(entered.wait(1))
                started=time.monotonic();state=self.service.quick_status()
                self.assertLess(time.monotonic()-started,.1)
                self.assertTrue(state['control_refresh_pending'])
                self.assertIsNone(state['costs'])
                self.assertIsNone(state['symbols']['hyperliquid:BTC']['collection'])
                self.assertIsNone(state['symbols']['hyperliquid:BTC']['evidence_as_of'])
                self.assertFalse(state['symbols']['hyperliquid:BTC']['running'])
                self.assertIsNone(self.service._status_worker)
            finally:release.set();self.service.worker.join(timeout=2)

    def test_auto_resume_does_not_read_display_archive_under_control_lock(self):
        self.service.lab.intent('hyperliquid:BTC',True)
        with patch.object(self.service,'status',side_effect=AssertionError('display evidence read during auto resume')):
            self.assertTrue(self.service.recover_auto())
        self.assertIn('hyperliquid:BTC',self.service.active)
        self.assertEqual(self.service.last['hyperliquid:BTC']['status'],'WARMING')

    def test_initial_sample_precedes_archive_learning_review(self):
        self.command('start');events=[]
        with patch.object(self.service,'sample',side_effect=lambda *args:events.append('sample')), \
             patch.object(self.service.lab,'start',side_effect=lambda:events.append('review')), \
             patch('swing_research.time.time',return_value=self.now/1000), \
             patch.object(self.service.stop,'wait',side_effect=lambda *args:self.service.stop.set()):
            self.service.loop()
        self.assertEqual(events,['sample','review'])

    def test_observation_is_atomic_and_storage_failure_stops_before_a_model_call(self):
        import sqlite3
        calls=[];self.service.judge.judge=lambda s:(calls.append(s) or response())
        self.command('configure',config={'jev_enabled':True});self.command('start')
        record=self.service.cost_meter.record
        def fail_after_usage(*args,**kw):
            record(*args,**kw);raise sqlite3.OperationalError('injected disk full')
        with patch.object(self.service.cost_meter,'record',side_effect=fail_after_usage):
            with self.assertRaises(sqlite3.OperationalError):self.sample()
        self.assertEqual(calls,[]);self.assertEqual(self.service.active,{})
        self.assertEqual(self.service.last['hyperliquid:BTC']['status'],'STORAGE_ERROR')
        with self.service.db() as db:
            for table in ('predictions','jev_usage','run_bars','collection_checkpoints'):self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ledger WHERE kind='WARMUP'").fetchone()[0],0)

    def test_response_and_usage_commit_together_or_both_remain_unresolved(self):
        import sqlite3
        self.command('configure',config={'jev_enabled':True});self.command('start');record=self.service.cost_meter.record
        def fail_final_usage(*args,**kw):
            record(*args,**kw)
            if args[5]=='AVAILABLE':raise sqlite3.OperationalError('injected final commit failure')
        with patch.object(self.service.cost_meter,'record',side_effect=fail_final_usage):
            with self.assertRaises(sqlite3.OperationalError):self.sample()
        with self.service.db() as db:
            self.assertIsNone(db.execute('SELECT response FROM predictions').fetchone()[0])
            self.assertEqual(db.execute('SELECT status FROM jev_usage').fetchone()[0],'PENDING')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM collection_checkpoints').fetchone()[0],1)
        self.assertFalse(self.service.active)

    def test_complete_warmup_source_bars_and_checkpoint_survive_a_paused_restart(self):
        self.command('start');self.sample()
        with self.service.db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM run_bars').fetchone()[0],70)
            snap=json.loads(db.execute('SELECT snapshot FROM collection_checkpoints').fetchone()[0])
        second=SwingResearch(self.gateway,Path(self.tmp.name),Jev(store=False))
        state=second.status()['symbols']['hyperliquid:BTC'];self.assertFalse(state['running'])
        self.assertTrue(state['archived']);self.assertEqual(state['snapshot'],snap)
        self.assertEqual(state['collection']['saved_candles'],70);self.assertEqual(state['collection']['source_bar_gaps'],0)
    def test_restart_paused_config_boundary_and_no_order_engine(self):
        self.command('start');old=self.service.active['hyperliquid:BTC']['run'];self.command('configure',config={'warning_settings':{'slowRatio':.6}})
        self.assertNotIn('hyperliquid:BTC',self.service.active);self.command('start');self.assertNotEqual(old,self.service.active['hyperliquid:BTC']['run'])
        second=SwingResearch(self.gateway,Path(self.tmp.name),Jev(store=False));self.assertEqual(second.active,{});self.assertFalse(hasattr(second,'engine'))
    def test_closed_bar_forward_labels_and_intrabar_not_extra_primary(self):
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample();self.now+=15000;self.gateway.now=self.now;self.sample()
        h=self.service.history('hyperliquid:BTC');self.assertEqual(len(h['predictions']),2);self.assertEqual(sum(p['primary_sample'] for p in h['predictions']),1)
        self.assertEqual(h['metrics']['n'],0)
        self.now+=45000;self.gateway.now=self.now;self.sample()
        self.now+=60000;self.gateway.now=self.now;self.sample()
        h=self.service.history('hyperliquid:BTC');self.assertEqual(h['metrics']['n'],1);self.assertEqual(h['predictions'][-1]['outcome']['label'],'up')

    def test_forecast_metrics_cover_the_entire_run_beyond_the_history_display_limit(self):
        self.command('start');run=self.service.active['hyperliquid:BTC']['run']
        with self.service.db() as db:
            for i in range(305):
                at=self.now+i*60000;target=(at//60000+1)*60000
                state={'tick':1,'closed_bars':[{'open':100,'close':101}]}
                result={'status':'AVAILABLE','received_at':at+10,'answers':{'next_bar':{'choice':'up','probabilities':{'up':.6,'down':.3,'flat':.1}}}}
                db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?,?,?,?)',(str(i),run,'hyperliquid:BTC',at,target,1,json.dumps(state),json.dumps(result),json.dumps({'label':'up'})))
        h=self.service.history('hyperliquid:BTC')
        self.assertEqual(len(h['predictions']),300);self.assertEqual(h['metrics']['n'],305)
        self.assertEqual(h['metrics']['observation_count'],305);self.assertEqual(h['metrics']['accuracy'],1)
        self.assertEqual(h['metrics']['baseline_accuracy'],1);self.assertAlmostEqual(h['metrics']['brier'],.26)

    def test_ended_run_forecasts_are_unresolved_without_rewriting_the_archive(self):
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample()
        self.assertEqual(self.service.history('hyperliquid:BTC')['metrics']['pending_primary'],1)
        self.command('pause');h=self.service.history('hyperliquid:BTC')
        self.assertTrue(h['run_ended']);self.assertEqual(h['metrics']['unresolved_primary'],1)
        self.assertEqual(h['metrics']['pending_primary'],0);self.assertIsNone(h['predictions'][0]['outcome'])

    def test_cost_meter_counts_each_actual_request_and_updates_status_without_extra_calls(self):
        calls=[]
        def judge(state):
            calls.append(state);r=response();r['usage']={'input_tokens':6000,'output_tokens':164};return r
        self.service.judge.judge=judge
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample()
        first=self.service.status()['costs']['total'];self.assertEqual(first['requests'],1)
        self.assertEqual(first['input_tokens'],6000);self.assertAlmostEqual(first['estimated_usd'],.000252)
        self.now+=15000;self.gateway.now=self.now;self.sample()
        second=self.service.status()['costs']['total'];self.assertEqual(second['requests'],2)
        self.assertAlmostEqual(second['estimated_usd'],.000504)
        for _ in range(3):self.service.status()
        self.assertEqual(len(calls),2)
        h=self.service.history('hyperliquid:BTC')
        self.assertEqual(h['predictions'][0]['response']['pricing_snapshot']['input_usd_per_million'],'0.042')
    def test_duplicate_chart_starts_share_one_run_and_one_model_request_per_slot(self):
        calls=[]
        self.service.judge.judge=lambda state:(calls.append(state) or response())
        self.command('configure',config={'jev_enabled':True})
        run=None
        for _ in range(4):
            state=self.command('start')
            current=self.service.active['hyperliquid:BTC']['run']
            if run is None:run=current
            self.assertEqual(current,run)
            self.sample()
        self.assertEqual(len(calls),1)
        self.assertEqual(len(self.service.export('hyperliquid:BTC')['runs']),1)
        self.assertEqual(self.service.status()['observation']['max_active'],1)

    def test_concurrent_markets_cannot_start_two_collectors(self):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        gate=threading.Barrier(2)
        def start(symbol):
            gate.wait()
            try:self.service.command({'action':'start','symbol':symbol});return True
            except ValueError as e:
                self.assertIn('One observation run',str(e));return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(start,['hyperliquid:BTC','hyperliquid:ETH']))
        self.assertEqual(sorted(results),[False,True]);self.assertEqual(len(self.service.active),1)
        first=next(iter(self.service.active));self.service.command({'action':'pause','symbol':first})
        other='hyperliquid:ETH' if first.endswith('BTC') else 'hyperliquid:BTC'
        self.service.command({'action':'start','symbol':other})
        self.assertEqual(list(self.service.active),[other])

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
        self.command('configure',config={'jev_enabled':True,'study_enabled':False});self.command('start')
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

    def test_key_entry_is_memory_only_pauses_active_market_and_never_exports_secret(self):
        self.service.judge=Jev(store=False)
        self.command('start')
        self.command('pause')
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
            restarted=SwingResearch(self.gateway,Path(self.tmp.name),Jev(store=False))
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

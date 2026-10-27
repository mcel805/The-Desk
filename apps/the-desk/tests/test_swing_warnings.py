"""Executable parity, cadence and full observation persistence; no network."""
from copy import deepcopy
import json, math, sqlite3
from pathlib import Path
import subprocess, tempfile, unittest
from unittest.mock import patch
from swing_warnings import WarningEngine, validate_config
from swing_research import SwingResearch
from jev_swing import prepare_state, PROMPT_VERSION
from test_swing_tracker import BASE, bar, FakeJudge, response
from test_swing_study_service import Gateway, context, SYMBOL, BASE as SERVICE_BASE

def waves(n=100):
    result=[]
    for i in range(n):
        p=1000+i*.3+20*math.sin(i/6)
        result.append({**bar(i,p-1,p+3,p-4,p+math.sin(i)), 'volume':100+(i%9)*10})
    return result

class WarningTests(unittest.TestCase):
    def compare(self,config,steps):
        e=WarningEngine(config);out=[]
        for s in steps:
            if s['kind']=='levels':e.set_levels(s['levels'],s['at']);out.append(None)
            elif s['kind']=='live':out.append(e.observe(s['bar'],s['at'],s.get('sourceAt')))
            else:out.append(e.feed(s['bar'],s['at']))
        r=subprocess.run(['node',str(Path(__file__).with_name('warning_reference.mjs'))],input=json.dumps(dict(config=config,steps=steps)),text=True,capture_output=True,check=True)
        reference=json.loads(r.stdout)
        def eq(a,b,path='root'):
            if isinstance(a,dict):
                for k in b:
                    if k=='featureConfig':self.assertEqual(json.loads(a[k]),json.loads(b[k]));continue
                    self.assertIn(k,a,path+'.'+k);eq(a[k],b[k],path+'.'+k)
            elif isinstance(a,list):
                self.assertEqual(len(a),len(b),path)
                for i,(v,w) in enumerate(zip(a,b)):eq(v,w,path+str(i))
            elif type(a) in (int,float) and type(b) in (int,float):self.assertAlmostEqual(a,b,places=8,msg=path)
            else:self.assertEqual(a,b,path)
        eq(out,reference['out']);eq(e.events,reference['events']);return e,out

    def test_closed_features_lifecycle_and_auto_direction_match_reference(self):
        for side in (0,1,-1):
            with self.subTest(side=side):
                e,out=self.compare({'side':side,'volumeEnabled':True},[dict(kind='close',bar=b,at=b['time']+60000) for b in waves(160)])
                self.assertTrue(any(x['kind']=='START' for x in e.events));self.assertTrue(any(x['kind']=='CLEARED' for x in e.events));self.assertIsNone(out[-1]['probability'])

    def test_four_provisional_slots_match_reference_without_committing_history(self):
        rows=waves(40);b=waves(41)[-1]
        steps=[dict(kind='close',bar=x,at=x['time']+60000) for x in rows]+[dict(kind='live',bar=b,at=b['time']+i*15000+1000) for i in range(4)]
        e,out=self.compare({'side':1,'volumeEnabled':True},steps)
        self.assertEqual(len(e.rows),40);self.assertEqual(e.last_snapshot,out[39]);self.assertTrue(all(x['severity'][6] is None for x in out[-4:]));self.assertIsNone(e.observe(b,b['time']+47000))
        before=deepcopy(e.events);e.observe(b,b['time']+48000);self.assertEqual(before,e.events)

    def test_known_levels_gap_and_prefix_replay(self):
        rows=waves(60);level=dict(id='known',price=1020,side='upper',knownAt=BASE-60000)
        steps=[dict(kind='levels',levels=[level],at=BASE-1)]+[dict(kind='close',bar=b,at=b['time']+60000) for b in rows]
        e,out=self.compare({'side':1},steps)
        prefix=WarningEngine({'side':1});prefix.set_levels([level],BASE-1)
        for b in rows[:35]:got=prefix.feed(b)
        self.assertEqual(got,out[35])
        reset=e.feed({**rows[-1],'time':rows[-1]['time']+120000});self.assertEqual(reset['state'],'UNAVAILABLE');self.assertEqual(len(e.rows),1)
        self.assertTrue(any(x['kind']=='DATA_GAP' for x in e.events))

    def test_new_reference_cannot_backdate_and_first_availability_is_preserved(self):
        e=WarningEngine({'side':1})
        for b in waves(40):e.feed(b)
        at=b['time']+60000
        with self.assertRaises(ValueError):e.set_levels([dict(id='future',side='upper',price=1000,knownAt=at+1)],at)
        e.set_levels([dict(id='new',side='upper',price=1000,knownAt=at)],at)
        self.assertIsNone(e.last_snapshot['severity'][4]);first=e.levels[0]['availableAt']
        e.set_levels([dict(id='new',side='upper',price=1000,knownAt=at)],at+15000);self.assertEqual(e.levels[0]['availableAt'],first)

    def test_missing_volume_zero_weights_configuration_copy_and_invalid_clocks(self):
        original={'weights':[0]*6};e=WarningEngine(original);original['weights'][0]=5
        for b in waves(40):s=e.feed({**b,'volume':None})
        self.assertIsNone(s['pressure']);self.assertIsNone(s['severity'][6]);self.assertEqual(e.config['weights'],[0]*6)
        for cfg in ({'side':True},{'weights':[1]},{'cadenceMs':10000},{'bogus':1}):
            with self.assertRaises(ValueError):validate_config(cfg)
        with self.assertRaises(ValueError):e.feed(waves(40)[-1])
        with self.assertRaises(ValueError):e.observe(waves(41)[-1],BASE+40*60000+1000,BASE+40*60000-30000)

class WarningServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.gateway=Gateway();self.calls=[]
        judge=FakeJudge();judge.judge=lambda state:(self.calls.append(deepcopy(state)) or response())
        self.service=SwingResearch(self.gateway,Path(self.tmp.name),judge);self.service.context_for=lambda *args:context()
    def tearDown(self):self.service.close();self.tmp.cleanup()
    def command(self,action,**kw):
        with patch('swing_research.time.time',return_value=self.gateway.now/1000):return self.service.command(dict(symbol=SYMBOL,action=action,**kw))
    def sample(self):
        with patch('swing_research.time.time',return_value=self.gateway.now/1000):self.service.sample(SYMBOL,self.service.active[SYMBOL])

    def test_warning_collection_requires_four_slots_and_normalizes_legacy_settings_for_new_runs(self):
        for cadence in (10,30,60):
            with self.assertRaisesRegex(ValueError,'15-second cadence'):self.command('configure',config={'cadence_seconds':cadence})
        self.service.close()
        legacy='legacy-cadence-run'
        with sqlite3.connect(self.service.path) as db:
            db.execute('INSERT INTO settings VALUES(?,?)',(SYMBOL,json.dumps({'cadence_seconds':60})))
            db.execute('INSERT INTO runs VALUES(?,?,?,?)',(legacy,SYMBOL,SERVICE_BASE,json.dumps({'cadence_seconds':60})))
            db.execute('INSERT INTO ledger(run,symbol,kind,at,payload) VALUES(?,?,?,?,?)',(legacy,SYMBOL,'RUN_START',SERVICE_BASE,json.dumps({'config':{'cadence_seconds':60}})))
        self.service=SwingResearch(self.gateway,Path(self.tmp.name),FakeJudge());self.service.context_for=lambda *args:context()
        self.assertEqual(self.service.configs[SYMBOL]['cadence_seconds'],15)
        self.service.command({'symbol':SYMBOL,'action':'start'})
        exported=self.service.export(SYMBOL)
        runs={row['id']:json.loads(row['config'])['cadence_seconds'] for row in exported['runs']}
        self.assertEqual(runs[legacy],60)
        self.assertEqual(runs[self.service.last[SYMBOL]['run']],15)

    def test_four_slots_persist_to_jev_export_and_checkpoint_without_duplicates(self):
        self.command('configure',config={'jev_enabled':True,'warning_settings':{'side':1,'volumeEnabled':True}});self.command('start')
        for i in range(4):self.gateway.now=SERVICE_BASE+i*15000+1000;self.sample();self.sample()
        self.assertEqual(len(self.calls),4);h=self.service.history(SYMBOL)
        self.assertEqual(len(h['predictions']),4);self.assertEqual(sum(x['primary_sample'] for x in h['predictions']),1)
        closed=[x['state']['swing_warnings']['closed'] for x in h['predictions']];self.assertTrue(all(x==closed[0] for x in closed))
        self.assertEqual(len({x['state']['swing_warnings']['provisional']['observedAt'] for x in h['predictions']}),4)
        self.assertTrue(all(x['state']['swing_warnings']['provisional']['severity'][6] is None for x in h['predictions']))
        self.assertEqual(self.calls[-1]['swing_warnings'],h['predictions'][0]['state']['swing_warnings'])
        checkpoint=json.loads(self.service.export(SYMBOL)['checkpoints'][0]['snapshot']);self.assertEqual(checkpoint['warnings'],self.calls[-1]['swing_warnings'])
        self.assertTrue(all(x.get('scope')=='WARMUP' for x in checkpoint['warnings']['events']));self.assertEqual(self.service.status()['warning_version'],'swing-warnings-1.3.0')

    def test_warning_rules_enrich_existing_observations_without_changing_tracker_or_volume(self):
        # Opposing warning recipes must not change existing structure or shadow plans.
        with tempfile.TemporaryDirectory() as other_dir:
            other=SwingResearch(self.gateway,Path(other_dir),FakeJudge())
            other.context_for=lambda *args:context()
            try:
                self.command('configure',config={'warning_settings':{'side':1,'weights':[0]*6}})
                with patch('swing_research.time.time',return_value=self.gateway.now/1000):
                    other.command(dict(symbol=SYMBOL,action='configure',config={'warning_settings':{'side':-1,'weights':[2,2,1,2,1,3]}}))
                    other.command(dict(symbol=SYMBOL,action='start'))
                self.command('start')
                for minute in range(4):
                    for slot in range(4):
                        self.gateway.now=SERVICE_BASE+minute*60000+slot*15000+1000
                        self.sample()
                        with patch('swing_research.time.time',return_value=self.gateway.now/1000):
                            other.sample(SYMBOL,other.active[SYMBOL])
                        left=self.service.last[SYMBOL]['snapshot']
                        right=other.last[SYMBOL]['snapshot']
                        self.assertEqual({k:v for k,v in left.items() if k!='warnings'},
                                         {k:v for k,v in right.items() if k!='warnings'})
                        self.assertIn('market_synth',left)
                left_history=self.service.history(SYMBOL)['predictions']
                right_history=other.history(SYMBOL)['predictions']
                self.assertEqual(len(left_history),16);self.assertEqual(len(right_history),16)
                for row in left_history:
                    self.assertIn('swing_warnings',row['state'])
                    self.assertIn('market_synth',row['state'])
                    self.assertIn('liquidity_study',row['state'])
                self.assertNotEqual(left['warnings']['closed']['featureConfig'],right['warnings']['closed']['featureConfig'])
            finally:other.close()

    def test_closed_warning_ledger_and_pause_restart_retain_evidence(self):
        self.command('configure',config={'warning_settings':{'side':1}});self.command('start');self.sample();old=self.service.last[SYMBOL]['snapshot']['warnings']
        original_bars=self.gateway.bars
        def rejection_feed(*args):
            feed=original_bars(*args)
            for b in feed['bars']:
                if b['time']>=SERVICE_BASE:b['high']=115;b['low']=min(b['open'],b['close'])-1
            return feed
        self.gateway.bars=rejection_feed
        self.gateway.now+=60000;self.sample();latest=deepcopy(self.service.last[SYMBOL]['snapshot']['warnings'])
        self.assertGreater(latest['closed']['closedCutoff'],old['closed']['closedCutoff']);records=self.service.export(SYMBOL)['ledger'];self.assertTrue(any(x['kind']=='WARNING_EVENT' for x in records))
        self.command('pause');self.assertEqual(self.service.last[SYMBOL]['snapshot']['warnings'],latest)
        restarted=SwingResearch(self.gateway,Path(self.tmp.name),FakeJudge())
        try:self.assertFalse(restarted.active);self.assertEqual(restarted.last[SYMBOL]['snapshot']['warnings'],latest)
        finally:restarted.close()

    def test_rule_change_ends_run_and_changes_recipe(self):
        self.command('start');self.sample();run=self.service.last[SYMBOL]['run'];recipe=self.service.recipe_id(SYMBOL,self.service.configs[SYMBOL])
        self.command('configure',config={'warning_settings':{'slowRatio':.6}})
        self.assertNotIn(SYMBOL,self.service.active);self.assertNotEqual(recipe,self.service.recipe_id(SYMBOL,self.service.configs[SYMBOL]));self.command('start');self.assertNotEqual(run,self.service.last[SYMBOL]['run'])
        with self.assertRaises(ValueError):self.command('configure',config={'warning_settings':{'weights':[9]*6}})

    def test_jev_projection_preserves_features_and_clocks_without_full_history(self):
        self.command('configure',config={'jev_enabled':True});self.command('start');self.sample();source=self.calls[-1];original=deepcopy(source);projected=prepare_state(source)
        self.assertEqual(source,original)
        for key in ('closed','provisional'):
            for field in ('observedAt','closedCutoff','severity','values','pressure','coverage','probability'):self.assertEqual(projected['swing_warnings'][key][field],source['swing_warnings'][key][field])
            self.assertNotIn('episodes',projected['swing_warnings'][key])
        self.assertLessEqual(len(projected['swing_warnings']['events']),8);self.assertIn('warnings',PROMPT_VERSION)

    def test_atomic_settings_start_freezes_warning_rules_and_rejects_stale_tabs(self):
        current=self.service.settings_state()['symbols'][SYMBOL]['revision']
        state=self.command('start_auto',expected_revision=current,config={'warning_settings':{'side':1,'slowRatio':.6}})
        run=self.service.last[SYMBOL]['run'];self.assertTrue(state['symbols'][SYMBOL]['running'])
        self.assertEqual(self.service.active[SYMBOL]['config']['warning_settings']['slowRatio'],.6)
        self.command('start_auto',expected_revision=current);self.assertEqual(run,self.service.last[SYMBOL]['run'])
        self.command('pause')
        with self.assertRaises(ValueError):self.command('start_auto',expected_revision=current)
        self.assertFalse(self.service.active)

    def test_jev_failure_diagnostics_survive_history_export_and_reliability(self):
        from jev_swing import JevRequestError
        self.command('configure',config={'jev_enabled':True});self.command('start')
        diagnostics={'http_status':400,'error_code':'max_tokens_exceeded','attempt_count':1,
                     'request_bytes':24000,'largest_question_bytes':18000,
                     'attempt_errors':[{'http_status':400,'error_code':'max_tokens_exceeded','body':'PRIVATE_PROVIDER_BODY'}],
                     'provider_body':'PRIVATE_PROVIDER_BODY'}
        def fail(state):raise JevRequestError(diagnostics)
        self.service.judge.judge=fail;self.sample()
        h=self.service.history(SYMBOL);failure=h['predictions'][0]['response']
        for field in ('http_status','error_code','attempt_count','request_bytes','largest_question_bytes'):
            self.assertEqual(failure[field],diagnostics[field])
        self.assertEqual(failure['transport']['attempt_count'],1)
        self.assertEqual(failure['transport']['attempt_errors'],[{'http_status':400,'error_code':'max_tokens_exceeded'}])
        self.assertEqual(h['reliability']['errors']['400 / max_tokens_exceeded'],1)
        exported=self.service.export(SYMBOL)
        saved=json.loads(exported['predictions'][0]['response'])
        self.assertEqual(saved,failure);self.assertNotIn('PRIVATE_PROVIDER_BODY',json.dumps(exported))
        self.assertEqual(exported['jev_costs']['unknown_cost_requests'],1)

    def test_exhausted_retry_diagnostics_and_invalid_response_usage_are_retained(self):
        from jev_swing import JevRequestError,JevResponseError
        self.command('configure',config={'jev_enabled':True});self.command('start')
        attempts=[{'http_status':503,'error_code':'http_error'},{'http_status':529,'error_code':'overloaded'}]
        def fail(state):raise JevRequestError({'http_status':529,'error_code':'overloaded','attempt_count':2,'attempt_errors':attempts,'request_bytes':1234})
        self.service.judge.judge=fail;self.sample()
        saved=self.service.history(SYMBOL)['predictions'][0]['response']
        self.assertEqual(saved['transport']['attempt_count'],2);self.assertEqual(saved['transport']['unpriced_attempts'],1)
        self.assertEqual(saved['transport']['attempt_errors'],attempts)
        self.gateway.now+=15000
        def invalid(state):
            e=JevResponseError({'model':'jev-1.14.0','usage':{'input_tokens':100,'output_tokens':10}},'next_bar: invalid_distribution')
            e.diagnostics.update(attempt_count=1,request_bytes=999,attempt_errors=[])
            raise e
        self.service.judge.judge=invalid;self.sample()
        saved=self.service.history(SYMBOL)['predictions'][0]['response']
        self.assertEqual(saved['error_code'],'next_bar: invalid_distribution');self.assertEqual(saved['usage'],{'input_tokens':100,'output_tokens':10})
        self.assertEqual(saved['transport']['unpriced_attempts'],0)

import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from jev_costs import JevCostMeter,RATES,estimated_nano,safe_usage
from jev_swing import Jev,JevResponseError

MODEL='jev-1.14.0'
class JevCostTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'swing-research.sqlite3'
        with sqlite3.connect(self.path) as db:
            db.executescript('CREATE TABLE runs(id TEXT PRIMARY KEY,symbol TEXT,started INTEGER,config TEXT); CREATE TABLE predictions(id TEXT PRIMARY KEY,run TEXT,symbol TEXT,at INTEGER,state TEXT,response TEXT);')
            db.execute('INSERT INTO runs VALUES(?,?,?,?)',('r','hyperliquid:BTC',1000,json.dumps({'jev_enabled':True})))
            db.execute('INSERT INTO runs VALUES(?,?,?,?)',('off','hyperliquid:BTC',500,json.dumps({'jev_enabled':False})))
    def tearDown(self):self.tmp.cleanup()
    def meter(self):return JevCostMeter(self.path)
    def contexts(self,**kw):return {'hyperliquid:BTC':{'run':'r','parent_id':7,'running':True,'jev_enabled':True,'key_configured':True,'cadence_seconds':15,**kw}}
    def add(self,m,id='p',status='AVAILABLE',parent=7,usage=None,model=MODEL,at=2000,run='r',symbol='hyperliquid:BTC',**kw):
        m.record(id,run,symbol,at,parent,status,model,usage,**kw)

    def test_published_rate_counts_billable_input_once_output_free(self):
        self.assertEqual(estimated_nano({'input_tokens':1_000_000,'output_tokens':999999},RATES[MODEL]),42_000_000)
        self.assertEqual(estimated_nano({'input_tokens':416918,'output_tokens':11152},RATES[MODEL]),17_510_556)
        self.assertEqual(estimated_nano({'input_tokens':0,'output_tokens':123},RATES[MODEL]),0)
        for value in ({},{'input_tokens':True,'output_tokens':0},{'input_tokens':-1,'output_tokens':0},{'input_tokens':2.5,'output_tokens':0},{'input_tokens':'100','output_tokens':0}):self.assertIsNone(safe_usage(value))
    def test_unknown_usage_and_unknown_model_never_become_free_costs(self):
        m=self.meter();self.add(m,usage={'input_tokens':1_000_000,'output_tokens':100})
        self.add(m,id='failed',status='UNAVAILABLE')
        self.add(m,id='other',model='unpriced-model',usage={'input_tokens':100,'output_tokens':10},pricing=RATES[MODEL])
        s=m.summary(self.contexts(),MODEL)['total']
        self.assertEqual(s['requests'],3);self.assertEqual(s['priced_requests'],1);self.assertEqual(s['unknown_cost_requests'],2)
        self.assertAlmostEqual(s['estimated_usd'],.042);self.assertFalse(s['complete'])
    def test_disabled_observations_are_not_paid_api_requests(self):
        m=self.meter();self.add(m,status='DISABLED')
        total=m.summary(self.contexts(),MODEL)['total']
        self.assertEqual(total['observations'],1);self.assertEqual(total['requests'],0)
        self.assertEqual(total['unknown_cost_requests'],0);self.assertEqual(total['estimated_usd'],0);self.assertTrue(total['complete'])
    def test_pending_becomes_metered_once_and_completed_price_is_immutable(self):
        m=self.meter();self.add(m,status='PENDING',pricing=RATES[MODEL])
        self.assertEqual(m.summary(self.contexts(),MODEL)['total']['pending_requests'],1)
        self.add(m,usage={'input_tokens':1000,'output_tokens':3},pricing=RATES[MODEL])
        changed={**RATES[MODEL],'input_usd_per_million':'999'}
        self.add(m,usage={'input_tokens':1000,'output_tokens':3},pricing=changed)
        total=m.summary(self.contexts(),MODEL)['total']
        self.assertEqual(total['requests'],1);self.assertEqual(total['pending_requests'],0)
        self.assertEqual(total['estimated_usd'],.000042)
    def test_restarted_pending_requests_are_unknown_not_pending_forever(self):
        m=self.meter();self.add(m,status='PENDING')
        r=self.meter().summary(self.contexts(),MODEL)['total']
        self.assertEqual(r['pending_requests'],0);self.assertEqual(r['unknown_cost_requests'],1)
    def test_stale_and_validation_failed_answers_with_usage_still_cost_money(self):
        m=self.meter()
        for i,status in enumerate(('STALE','UNAVAILABLE')):self.add(m,id=str(i),status=status,usage={'input_tokens':1000,'output_tokens':10})
        total=m.summary(self.contexts(),MODEL)['total']
        self.assertEqual(total['priced_requests'],2);self.assertAlmostEqual(total['estimated_usd'],.000084)
    def test_sessions_parent_groups_and_symbols_do_not_cross_charge(self):
        m=self.meter()
        self.add(m,id='a',parent=7,usage={'input_tokens':1000,'output_tokens':10})
        self.add(m,id='b',parent=8,usage={'input_tokens':2000,'output_tokens':10})
        self.add(m,id='eth',symbol='hyperliquid:ETH',run='eth-run',parent=7,usage={'input_tokens':3000,'output_tokens':10})
        s=m.summary(self.contexts(),MODEL);btc=s['symbols']['hyperliquid:BTC']
        self.assertEqual(btc['session']['requests'],2);self.assertEqual(btc['current_parent_swing']['requests'],1)
        self.assertEqual(btc['current_parent_swing']['estimated_usd'],.000042)
        self.assertEqual(btc['observed_parent_groups_in_session'],2);self.assertEqual(s['total']['requests'],3)
    def test_hourly_projection_respects_cadence_market_model_and_paused_state(self):
        m=self.meter();self.add(m,usage={'input_tokens':6000,'output_tokens':164})
        q=m.summary(self.contexts(),MODEL)['symbols']['hyperliquid:BTC']['projection']
        self.assertEqual(q['requests_per_hour'],240);self.assertAlmostEqual(q['estimated_usd_per_hour_if_enabled'],.06048)
        self.assertAlmostEqual(q['estimated_usd_8h_if_enabled'],.48384)
        q=m.summary(self.contexts(running=False),MODEL)['symbols']['hyperliquid:BTC']['projection']
        self.assertEqual(q['current_usd_per_hour'],0);self.assertAlmostEqual(q['estimated_usd_per_hour_if_enabled'],.06048)
        q=m.summary(self.contexts(cadence_seconds=30),MODEL)['symbols']['hyperliquid:BTC']['projection']
        self.assertAlmostEqual(q['estimated_usd_per_hour_if_enabled'],.03024)
        q=self.meter().summary({'hyperliquid:ETH':{'cadence_seconds':15}},MODEL)['symbols']['hyperliquid:ETH']['projection']
        self.assertIsNone(q['estimated_usd_per_hour_if_enabled'])
    def test_legacy_backfill_is_idempotent_and_does_not_change_original_predictions(self):
        response={'status':'AVAILABLE','model':MODEL,'usage':{'input_tokens':6000,'output_tokens':164}}
        with sqlite3.connect(self.path) as db:
            for id,run,r in [('ok','r',json.dumps(response)),('failed','r',json.dumps({'status':'UNAVAILABLE'})),('off','off',None),('interrupted','r',None)]:
                db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?)',(id,run,'hyperliquid:BTC',2000,json.dumps({'parent_id':7}),r))
        m=self.meter();a=m.summary(self.contexts(),MODEL)['total'];b=self.meter().summary(self.contexts(),MODEL)['total']
        self.assertEqual(a,b);self.assertEqual(a['requests'],3);self.assertEqual(a['unknown_cost_requests'],2)
        self.assertEqual(a['legacy_repriced_requests'],3);self.assertEqual(a['estimated_usd'],.000252)
        with sqlite3.connect(self.path) as db:self.assertEqual(db.execute("SELECT response FROM predictions WHERE id='ok'").fetchone()[0],json.dumps(response))
    def test_totals_are_not_capped_by_display_session_parent_or_export_limits(self):
        m=self.meter()
        for i in range(105):self.add(m,id=str(i),parent=i,usage={'input_tokens':100,'output_tokens':1})
        s=m.summary(self.contexts(),MODEL);btc=s['symbols']['hyperliquid:BTC']
        self.assertEqual(s['total']['requests'],105);self.assertEqual(btc['observed_parent_groups_in_session'],105)
        self.assertEqual(len(s['parent_swings']),100);self.assertAlmostEqual(s['total']['estimated_usd'],.000441)
    def test_live_observer_prices_late_response_once_without_touching_source(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location('watch_costs',Path(__file__).resolve().parents[1]/'scripts/watch-jev-costs.py')
        observer=importlib.util.module_from_spec(spec);spec.loader.exec_module(observer)
        with sqlite3.connect(self.path) as db:
            db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?)',('late','r','hyperliquid:BTC',2000,json.dumps({'parent_id':7}),None))
        m=self.meter();self.assertEqual(m.summary(self.contexts(),MODEL)['total']['unknown_cost_requests'],1)
        response=json.dumps({'status':'AVAILABLE','model':MODEL,'usage':{'input_tokens':6000,'output_tokens':164}})
        with sqlite3.connect(self.path) as db:db.execute("UPDATE predictions SET response=? WHERE id='late'",(response,))
        state={'model':MODEL,'jev_configured':True,'symbols':{'hyperliquid:BTC':{'run':'r','running':True,'snapshot':{'parent_id':7},'config':{'jev_enabled':True,'cadence_seconds':15}},'hyperliquid:ETH':{'run':None,'snapshot':None,'config':{'jev_enabled':False,'cadence_seconds':15}}}}
        output=Path(self.tmp.name)/'costs.json'
        a=observer.publish(m,state,output);b=observer.publish(m,state,output)
        self.assertEqual(a['total'],b['total']);self.assertEqual(b['total']['estimated_usd'],.000252)
        self.assertEqual(b['total']['unknown_cost_requests'],0);self.assertTrue(b['symbols']['hyperliquid:BTC']['projection']['active'])
        self.assertNotIn('api_key',output.read_text());self.assertEqual(json.loads(output.read_text())['total'],b['total'])
        with sqlite3.connect(self.path) as db:self.assertEqual(db.execute("SELECT response FROM predictions WHERE id='late'").fetchone()[0],response)
    def test_invalid_answer_retains_only_safe_usage_without_exposing_provider_body(self):
        value={'model':MODEL,'usage':{'input_tokens':6000,'output_tokens':164},'answers':{},'secret':'never-echo-this'}
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps(value).encode()
        with patch.dict('os.environ',{'TYPESAFE_API_KEY':'test-not-a-real-key'}),patch('jev_swing.urlopen',return_value=Response()):
            with self.assertRaises(JevResponseError) as caught:Jev().judge({'public':True})
        self.assertEqual(caught.exception.safe_usage,{'input_tokens':6000,'output_tokens':164})
        self.assertNotIn('never-echo-this',str(caught.exception))

if __name__=='__main__':unittest.main()

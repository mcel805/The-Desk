import copy
from pathlib import Path
import sys
import tempfile
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from agents import Agents,defaults
from agent_signals import AgentSignals
from agent_workspaces import chart_defaults
from engine import Engine

class SignalTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.engine=Engine(Path(self.tmp.name)/'desk.db');self.now=time.time();self.agents=Agents(self.engine,lambda:self.now)
        self.engine.ingest('hyperliquid:BTC','100','100.01',{'tick':'.01','qty_step':'.001','metadata_verified':True,'metadata_observed_at':self.now},received_at=self.now)
        self.c=defaults('placeholder');self.c['chart']=chart_defaults();self.c['chart']['liquidity']['enabled']=True
        outer=self
        class Gateway:
            calls=[]
            def bars(inner,instrument,timeframe,limit):
                inner.calls.append((instrument,timeframe,limit));return {'instrument':instrument,'timeframe':timeframe,'as_of':outer.now*1000,'last_completed':(outer.now-60)*1000,'coverage':'SYNTHETIC TEST HISTORY','bars':[{'time':(outer.now-120)*1000,'open':101,'high':102,'low':99,'close':100,'volume':1},{'time':(outer.now-60)*1000,'open':100,'high':101,'low':98,'close':99,'volume':1}]}
        self.g=Gateway()
    def service(self,calculate):
        s=AgentSignals(self.agents,self.g,lambda:self.now,calculate);self.addCleanup(s.close);return s
    def test_provider_metadata_expires_instead_of_being_reverified_by_quotes(self):
        from unittest.mock import patch
        from server import Gateway
        g=Gateway()
        with patch('server.http_json',side_effect=[{'quote_increment':'.01','base_increment':'.001','quote_currency':'USD'},{'quote_increment':'.1','base_increment':'.001','quote_currency':'USD'}]) as request:
            with patch('server.time.time',return_value=1000):first=g.metadata('coinbase:BTC-USD')
            with patch('server.time.time',return_value=1200):cached=g.metadata('coinbase:BTC-USD')
            self.assertEqual(cached['metadata_observed_at'],first['metadata_observed_at']);self.assertEqual(request.call_count,1)
            with patch('server.time.time',return_value=1301):refreshed=g.metadata('coinbase:BTC-USD')
            self.assertEqual(refreshed['tick'],'.1');self.assertEqual(refreshed['metadata_observed_at'],1301);self.assertEqual(request.call_count,2)

    def test_published_jobs_preserve_exact_frame_coverage_and_revision(self):
        calls=[]
        def calculate(config,bars,series,meta):
            calls.append(series);return {'levels':[{'id':'pool-1','price':'100','source':'liquidity','label':'Fixture pool'}],'liquidityReady':True,'sourceHash':config['chart']['liquidity']['sourceHash']}
        s=self.service(calculate);s.refresh('a',7,self.c);r=s.snapshot('a',7)
        self.assertTrue(r['liquidityReady']);self.assertEqual(r['revision'],7);self.assertIsNone(s.snapshot('a',8));self.assertEqual(set(calls[0]),{'1','5','15','30','60'});self.assertEqual(len(r['coverage']),6)
        before=len(self.g.calls);s.refresh('b',1,self.c);self.assertEqual(len(self.g.calls),before,'cached histories shared across agents, not indicator state')
    def test_missing_verified_metadata_blocks_calculation_until_quote_arrives(self):
        calls=[];s=self.service(lambda *args:calls.append(1) or {'levels':[],'liquidityReady':True})
        self.engine.quotes.clear();s.refresh('a',1,self.c);self.assertFalse(calls);self.assertIn('verified instrument tick',s.errors['a'])
        self.engine.ingest('hyperliquid:BTC','100','100.01',{'tick':'.01','qty_step':'.001','metadata_verified':True,'metadata_observed_at':self.now},received_at=self.now)
        s.refresh('a',1,self.c);self.assertEqual(calls,[1]);self.assertEqual(s.snapshot('a',1)['instrumentMetadata']['tick'],'.01')

    def test_recent_quotes_cannot_refresh_expired_contract_metadata(self):
        s=self.service(lambda *args:{'levels':[],'liquidityReady':True})
        self.engine.ingest('hyperliquid:BTC','100','100.01',{'tick':'.01','metadata_verified':True,'metadata_observed_at':self.now-301},received_at=self.now)
        s.refresh('a',1,self.c);self.assertIsNone(s.snapshot('a',1));self.assertIn('verified instrument tick',s.errors['a'])

    def test_failure_invalidates_old_signal_and_keeps_chart_for_inspection(self):
        s=self.service(lambda *args:{'levels':[],'liquidityReady':True});s.refresh('a',1,self.c)
        self.now+=20;self.engine.ingest('hyperliquid:BTC','100','100.01',{'tick':'.01','qty_step':'.001','metadata_verified':True,'metadata_observed_at':self.now},received_at=self.now)
        def bad(*args):raise ValueError('fixture source failure')
        s.calculate=bad;s.refresh('a',1,self.c);self.assertFalse(s.snapshot('a',1)['liquidityReady']);self.assertTrue(s.snapshot('a',1)['bars']);self.assertIn('source failure',s.errors['a'])
    def test_old_asof_cannot_be_laundered_by_job_completion(self):
        s=self.service(lambda *args:{'levels':[],'liquidityReady':True})
        self.g.bars=lambda *args:{'as_of':(self.now-100)*1000,'bars':[{'time':1},{'time':2}]}
        s.refresh('a',1,self.c);self.assertIsNone(s.snapshot('a',1));self.assertIn('stale',s.errors['a'])
    def test_current_response_timestamp_does_not_hide_old_provider_candles(self):
        s=self.service(lambda *args:{'levels':[],'liquidityReady':True})
        original=self.g.bars
        def old(*args):
            value=original(*args);value['bars']=[{**r,'time':r['time']-86400000} for r in value['bars']];return value
        self.g.bars=old;s.refresh('a',1,self.c);self.assertIsNone(s.snapshot('a',1));self.assertIn('candle tail',s.errors['a'])

    def test_manual_levels_have_no_pine_dependency(self):
        c=copy.deepcopy(self.c);c['chart']['liquidity']['enabled']=False
        def never(*args):raise AssertionError('Pine should not run')
        s=self.service(never);s.refresh('a',2,c);self.assertTrue(s.snapshot('a',2)['bars']);self.assertFalse(s.snapshot('a',2)['liquidityReady'])
    def test_publication_schedules_new_version_without_waiting_old_cooldown(self):
        s=self.service(None);s.start();a=self.agents.listing()['agents'][0]
        end=time.monotonic()+3
        while not s.snapshot(a['id'],a['revision']) and time.monotonic()<end:time.sleep(.03)
        self.assertIsNotNone(s.snapshot(a['id'],a['revision']))
        config={k:copy.deepcopy(a[k]) for k in ('name','avatar','color','description','mode','account','instrument','executionInstrument','modules','chart')}
        draft=self.agents.save({**config,'id':a['id'],'expectedRevision':a['revision'],'draftRevision':None})
        published=self.agents.publish_draft({'id':a['id'],'expectedRevision':a['revision'],'draftRevision':draft['draftRevision']})
        end=time.monotonic()+3
        while not s.snapshot(a['id'],published['revision']) and time.monotonic()<end:time.sleep(.03)
        self.assertIsNotNone(s.snapshot(a['id'],published['revision']))

    def test_installed_pine_worker_executes_pinned_source_without_network(self):
        # Exact installed study against bounded synthetic multiframe history.
        import math
        c=copy.deepcopy(self.c);c['chart']['liquidity'].update(sourceBars=200,masterBars=500)
        frames={'1':1,'5':5,'15':15,'30':30,'60':60};end=int(self.now//3600)*3600000
        series={tf:[{'time':end-(900-i)*minutes*60000,'open':100+math.sin(i/5),'high':101+math.sin(i/5),'low':99+math.sin(i/5),'close':100+.8*math.sin(i/5),'volume':100} for i in range(900)] for tf,minutes in frames.items()}
        s=self.service(None);result=s.pine(c,series['60'],series,{'tick':'.01'})
        self.assertTrue(result['liquidityReady']);self.assertEqual(result['sourceHash'],c['chart']['liquidity']['sourceHash']);self.assertIsInstance(result['levels'],list)
        self.assertTrue(result['requests']);self.assertTrue(all(r['instrument']=='hyperliquid:BTC' for r in result['requests']))

if __name__=='__main__':unittest.main()

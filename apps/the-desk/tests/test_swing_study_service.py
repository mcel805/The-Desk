"""Actual collector integration and run boundary persistence with fake public data."""
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
from swing_research import SwingResearch
from jev_swing import PROMPT_VERSION
from test_swing_tracker import FakeJudge
from test_swing_liquidity import BASE, SYMBOL, bar, context


class Gateway:
    def __init__(self):self.now=BASE+10000
    def bars(self,symbol,tf,limit=1000):
        last=(self.now-BASE)//60000
        rows=[bar(i,l=99 if i==1 else 103 if i<1 else 101,c=105 if i<1 else 103) for i in range(-80,last+1)]
        return {'instrument':symbol,'timeframe':tf,'as_of':self.now,'bars':rows}
    def quote(self,symbol):return '103','104',{'tick':1,'qty_step':.001,'source_time':self.now,'metadata_verified':True}


class StudyServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.gateway=Gateway()
        self.service=SwingResearch(self.gateway,Path(self.tmp.name),FakeJudge())
        self.service.context_for=lambda *args:context()
    def tearDown(self):self.service.close();self.tmp.cleanup()
    def command(self,action,**kw):
        with patch('swing_research.time.time',return_value=self.gateway.now/1000):
            return self.service.command({'symbol':SYMBOL,'action':action,**kw})
    def sample(self):
        with patch('swing_research.time.time',return_value=self.gateway.now/1000):
            self.service.sample(SYMBOL,self.service.active[SYMBOL])
    def test_warmup_creates_no_campaign_then_forward_touch_is_durably_recorded(self):
        self.command('start');self.sample()
        self.assertEqual(self.service.study_report(SYMBOL)['campaigns'],[])
        self.gateway.now=BASE+70000;self.sample()
        self.gateway.now=BASE+130000;self.sample()
        report=self.service.study_report(SYMBOL)
        self.assertEqual(len(report['campaigns']),1)
        self.assertEqual(report['plans'][0]['status'],'PENDING')
        export=self.service.export(SYMBOL)
        self.assertTrue(any(r['kind']=='STUDY_EVENT' for r in export['ledger']))
        self.assertEqual(export['study']['run'],report['run'])
        self.assertEqual(export['study']['cohort']['prompt'],PROMPT_VERSION)
        self.assertIn('market_synth',json.loads(export['predictions'][0]['state']))
        self.assertIn('liquidity_study',json.loads(export['predictions'][0]['state']))
        self.command('pause')
        self.assertEqual(self.service.study_report(SYMBOL)['plans'][0]['status'],'UNRESOLVED')
        self.assertTrue(self.service.status()['symbols'][SYMBOL]['study']['ended'])
    def test_crash_restart_keeps_records_but_ends_outstanding_shadow_plans(self):
        self.command('start');self.sample()
        for now in (BASE+70000,BASE+130000):self.gateway.now=now;self.sample()
        # Simulate a crash without close; a fresh service audits the existing run.
        restarted=SwingResearch(self.gateway,Path(self.tmp.name),FakeJudge())
        self.assertFalse(restarted.active)
        report=restarted.study_report(SYMBOL)
        self.assertEqual(report['ended']['reason'],'SERVER_RESTART')
        self.assertEqual(report['plans'][0]['status'],'UNRESOLVED')
        self.assertEqual(report['summaries'][0]['pending'],0)
        restarted.close()
    def test_manual_references_are_service_timestamped_and_end_prior_run(self):
        self.command('start');self.sample()
        self.command('level_add',level={'price':99,'side':'low','timeframe':'4h','label':'Test support','role':'both'})
        self.assertNotIn(SYMBOL,self.service.active)
        p=self.service.configs[SYMBOL]['study_levels'][0]
        self.assertEqual(p['known_at'],self.gateway.now)
        with self.assertRaises(ValueError):self.command('configure',config={'study_levels':[p]})
        with self.assertRaises(ValueError):self.command('level_add',level={**p,'known_at':1})
        self.command('level_remove',level_id=p['id'])
        self.assertEqual(self.service.configs[SYMBOL]['study_levels'],[])

    def test_forward_validation_requires_exact_closed_reference_and_remains_separate(self):
        self.command('configure',config={'study_phase':'forward_validation'})
        with self.assertRaises(ValueError):self.command('start')
        self.command('configure',config={'study_phase':'development'})
        self.command('start');self.sample();reference=self.service.last[SYMBOL]['run']
        self.command('pause')
        self.command('configure',config={'study_phase':'forward_validation'})
        self.command('start');self.sample()
        report=self.service.study_report(SYMBOL)
        self.assertEqual(report['validation_reference']['run'],reference)
        self.assertEqual(report['settings']['study_phase'],'forward_validation')
        self.command('pause');self.command('configure',config={'study_jev_min':.8})
        with self.assertRaises(ValueError):self.command('start')
        archive=self.service.study_archive(SYMBOL)
        self.assertEqual(archive['total_runs'],2)
        self.assertEqual({r['settings']['study_phase'] for r in archive['reports']},{'development','forward_validation'})


if __name__=='__main__':unittest.main()

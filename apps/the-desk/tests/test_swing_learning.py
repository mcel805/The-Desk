import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from swing_research import SwingResearch
from swing_lab import LearningLab,challenger,compare,verdict,ENGINE,replay,ident
from storage import connect_readonly
from test_swing_tracker import FakeJudge,FakeGateway

class LearningTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.service=SwingResearch(FakeGateway(1770000000000),Path(self.tmp.name),FakeJudge())
    def tearDown(self):self.service.close();self.tmp.cleanup()
    def test_complete_fast_settings_do_not_touch_db_and_one_click_is_atomic(self):
        with patch.object(self.service,'db',side_effect=AssertionError('heavy read')):
            state=self.service.settings_state()
        s=state['symbols']['hyperliquid:BTC'];self.assertGreater(s['config']['quantity'],0)
        self.assertEqual(s['config']['study_window'],5)
        started=self.service.command({'action':'start_auto','symbol':'hyperliquid:BTC','expected_revision':s['revision'],'config':{'micro_bars':2}})
        self.assertTrue(started['symbols']['hyperliquid:BTC']['running'])
        run=started['symbols']['hyperliquid:BTC']['run'];self.assertTrue(self.service.lab.intent()['enabled'])
        assignment=json.loads(self.service.lab.read('select payload from lab_assignments where run=?',(run,))[0]['payload'])
        self.assertEqual(assignment['baseline']['micro_bars'],2)
        self.assertEqual(sum(assignment['baseline'][k]!=assignment['challenger'][k] for k in assignment['baseline']),1)
        self.assertEqual(self.service.command({'action':'start_auto','symbol':'hyperliquid:BTC'})['symbols']['hyperliquid:BTC']['run'],run)
    def test_stale_tab_cannot_start_or_reconfigure(self):
        state=self.service.settings_state()['symbols']['hyperliquid:BTC']
        self.service.command({'action':'configure','symbol':'hyperliquid:BTC','config':{'micro_bars':2}})
        with self.assertRaisesRegex(ValueError,'another tab'):
            self.service.command({'action':'start_auto','symbol':'hyperliquid:BTC','expected_revision':state['revision'],'config':{'micro_bars':1}})
        self.assertFalse(self.service.active);self.assertEqual(self.service.configs['hyperliquid:BTC']['micro_bars'],2)
    def test_legacy_start_preserves_promoted_policy(self):
        symbol='hyperliquid:BTC';cfg=self.service.configs[symbol]
        trial,factor=challenger(cfg)
        promoted={'symbol':symbol,'engine':ENGINE,'baseline':trial,'challenger':cfg,'factor':factor,'stage':'EXPLORATION',
                  'frozen_at':1,'index':1,'revision':1,'promoted_from':ident(cfg)}
        self.service.lab.write('INSERT OR REPLACE INTO lab_policies VALUES(?,?)',(symbol,json.dumps(promoted,sort_keys=True,separators=(',',':'))))
        self.service.command({'action':'start','symbol':symbol})
        run=self.service.active[symbol]['run']
        assignment=json.loads(self.service.lab.read('SELECT payload FROM lab_assignments WHERE run=?',(run,))[0]['payload'])
        expected=json.loads(json.dumps(trial))
        self.assertEqual(self.service.configs[symbol],expected)
        self.assertEqual(assignment['baseline'],expected)
        self.assertFalse(self.service.lab.intent()['enabled'])
    def test_pause_disables_recovery_restart_preserves_opt_in_and_records_gap(self):
        start=self.service.command({'action':'start_auto','symbol':'hyperliquid:BTC'})
        run=start['symbols']['hyperliquid:BTC']['run'];self.service.close()
        other=SwingResearch(FakeGateway(1770000000000),Path(self.tmp.name),FakeJudge())
        try:
            self.assertFalse(other.active);self.assertTrue(other.lab.intent()['enabled'])
            other.command({'action':'start_auto','symbol':'hyperliquid:BTC'})
            self.assertNotEqual(other.last['hyperliquid:BTC']['run'],run)
            other.command({'action':'pause','symbol':'hyperliquid:BTC'})
            self.assertFalse(other.lab.intent()['enabled'])
        finally:other.close()
    def test_readonly_paths_do_not_scan_capacity_and_refuse_writes(self):
        with patch('storage.external_guard',side_effect=AssertionError('capacity scan')):
            db=connect_readonly(self.service.path)
            try:
                self.assertEqual(db.execute('select count(*) from runs').fetchone()[0],0)
                with self.assertRaises(sqlite3.OperationalError):db.execute('delete from runs')
            finally:db.close()
            self.service.status();self.service.history('hyperliquid:BTC')
    def test_policy_does_not_reset_from_json_list_tuple_conversion(self):
        cfg=self.service.configs['hyperliquid:BTC'];a=self.service.lab.policy('hyperliquid:BTC',cfg)
        b=self.service.lab.policy('hyperliquid:BTC',cfg);self.assertEqual(a,b)
    def test_all_archive_runs_reviewed_and_historical_trials_not_promoted(self):
        self.service.command({'action':'start','symbol':'hyperliquid:BTC'})
        self.service.command({'action':'pause','symbol':'hyperliquid:BTC'})
        self.service.lab.review();report=self.service.lab.status()
        self.assertEqual(report['runs_reviewed'],1);self.assertEqual(report['recorded_resolved_plans'],0)
        self.assertFalse(report['decisions'])

class StatisticsTests(unittest.TestCase):
    def results(self,days=10,n=60,delta=.5,unknown=False):
        a=[];b=[]
        for i in range(n):
            common={'key':str(i),'at':(i%days)*86400000,'entered':True,'resolved':True}
            a.append({**common,'value':0});b.append({**common,'value':None if unknown else delta})
        return [{'baseline':{'campaigns':a},'challenger':{'campaigns':b}}]
    def test_later_validation_not_small_optimistic_sample(self):
        small=compare(self.results(days=2,n=60));self.assertEqual(verdict(small,'VALIDATION'),'COLLECTING')
        good=compare(self.results());self.assertEqual(verdict(good,'EXPLORATION'),'VALIDATE');self.assertEqual(verdict(good,'VALIDATION'),'PROMOTE')
        bad=compare(self.results(delta=-.5));self.assertEqual(verdict(bad,'VALIDATION'),'REJECT')
    def test_duplicate_contacts_not_independent_and_unknown_not_zero(self):
        r=self.results();self.assertEqual(compare(r+r)['paired_contacts'],60)
        unknown=compare(self.results(unknown=True));self.assertEqual(unknown['paired_contacts'],0);self.assertEqual(unknown['unresolved_or_unmatched'],60)
    def test_one_factor_never_alters_risk_or_permissions(self):
        from swing_lab import complete
        base=complete('hyperliquid:BTC',{})
        for i in range(6):
            trial,factor=challenger(base,i);self.assertEqual([k for k in base if trial[k]!=base[k]],[factor])

if __name__=='__main__':unittest.main()

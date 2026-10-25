import json
import math
import tempfile
import unittest
from unittest.mock import patch
from swing_volume import SwingVolume
from swing_research import SwingResearch
from test_swing_tracker import bar, BASE


def waves(n=220):
    result = []
    for i in range(n):
        p = 100 + 12 * math.sin(i / 8)
        result.append(bar(i, p - math.sin(i), p + 2, p - 2, p + math.sin(i)))
    return result


class VolumeTests(unittest.TestCase):
    def engine(self, bars):
        e = SwingVolume('hyperliquid:BTC', .1)
        for b in bars: e.feed(b)
        return e

    def test_actual_volume_changes_volume_fields_but_not_a_or_b(self):
        bars = waves(); a = self.engine(bars).snapshot()
        bars[-1]['volume'] = 1000
        b = self.engine(bars).snapshot()
        self.assertEqual(a['latest']['a'], b['latest']['a'])
        self.assertEqual(a['latest']['b'], b['latest']['b'])
        self.assertEqual(b['latest']['volume']['relative'], 100)
        self.assertNotEqual(a['latest']['volume']['mfi'], b['latest']['volume']['mfi'])
        self.assertNotEqual(a['latest']['volume']['cmf'], b['latest']['volume']['cmf'])

    def test_prior_baseline_excludes_current_and_zero_is_unavailable(self):
        bars = [bar(i) for i in range(21)]; bars[-1]['volume'] = 100
        row = self.engine(bars).snapshot()['latest']
        self.assertEqual(row['volume']['prior_mean'], 10)
        self.assertEqual(row['volume']['relative'], 10)
        flat = [{**bar(i,100,100,100,100), 'volume':0} for i in range(80)]
        snap = self.engine(flat).snapshot()
        self.assertIsNone(snap['latest']['volume']['relative'])
        self.assertIsNone(snap['latest']['volume']['cmf'])
        self.assertIsNone(snap['latest']['volume']['mfi'])
        self.assertEqual(snap['latest']['tags'], [])
        json.dumps(snap, allow_nan=False)

    def test_prefix_causality_and_divergence_confirmation(self):
        bars = waves(); e = self.engine(bars[:130]); before = e.snapshot()
        for b in bars[130:]: e.feed(b)
        shared = {r['time']:r for r in e.rows}
        for r in before['recent']: self.assertEqual(r, shared[r['time']])
        for r in e.rows:
            for div in r['b']['divergences']:
                self.assertEqual(div['known_at'], div['pivot']['origin'] + 180000)
                self.assertEqual(div['known_at'], r['known_at'])

    def test_cmf_and_mfi_match_independent_hand_calculation(self):
        bars=[{**bar(i,102,104,100,103),'volume':2} for i in range(20)]
        bars[-1].update(close=101,volume=10)
        self.assertAlmostEqual(self.engine(bars).snapshot()['latest']['volume']['cmf'],14/48)
        for direction,expected in ((1,100),(-1,0)):
            sequence=[{**bar(i,100+direction*i,102+direction*i,98+direction*i,100+direction*i),'volume':2} for i in range(20)]
            self.assertEqual(self.engine(sequence).snapshot()['latest']['volume']['mfi'],expected)

    def test_gap_resets_history_and_rolling_baselines(self):
        e = self.engine(waves(100)); e.feed(bar(102))
        s = e.snapshot()
        self.assertEqual(s['source']['gap_resets'], 1)
        self.assertEqual(s['source']['processed_bars'], 1)
        self.assertIsNone(s['latest']['volume']['relative'])
        self.assertEqual(s['status'], 'WARMUP')
        with self.assertRaises(ValueError): e.feed(bar(102))

    def test_rejection_and_extension_are_symmetric_hypotheses(self):
        prefix = [bar(i,100,102,98,100) for i in range(60)]
        low = {**bar(60,100,102,90,101),'volume':30}
        high = {**bar(60,100,110,98,99),'volume':30}
        self.assertIn('high_volume_lower_rejection', self.engine(prefix+[low]).snapshot()['latest']['tags'])
        self.assertIn('high_volume_upper_rejection', self.engine(prefix+[high]).snapshot()['latest']['tags'])
        prefix[-1]['volume']=0
        small={**bar(60,100,104,98,102),'volume':1}
        self.assertIn('low_volume_high_extension',self.engine(prefix+[small]).snapshot()['latest']['tags'])

    def test_collector_persists_features_and_ignores_forming_volume(self):
        now = BASE + 100*60000 + 10000
        class Gateway:
            def bars(self,*args):return {'bars':waves(101),'as_of':now}
            def quote(self,*args):return 100,100.1,{'source_time':now,'tick':.1,'qty_step':.001,'metadata_verified':True}
        class Judge:
            configured=False
        with tempfile.TemporaryDirectory() as d, patch('swing_research.time.time',return_value=now/1000):
            s=SwingResearch(Gateway(),d,Judge());s.command({'action':'start','symbol':'hyperliquid:BTC'})
            s.sample('hyperliquid:BTC',s.active['hyperliquid:BTC'])
            current=s.status()['symbols']['hyperliquid:BTC']
            feature=current['snapshot']['market_synth']
            self.assertEqual(feature['source']['processed_bars'],100)
            self.assertEqual(feature['latest']['time'],BASE+99*60000)
            with s.db() as db:
                state=json.loads(db.execute('SELECT state FROM predictions').fetchone()[0])
                checkpoint=json.loads(db.execute('SELECT snapshot FROM collection_checkpoints').fetchone()[0])
            self.assertEqual(state['market_synth']['latest'],feature['latest'])
            self.assertEqual(checkpoint['market_synth'],feature)
            self.assertEqual(len(state['market_synth']['recent']),12)
            self.assertEqual(state['forming']['time'],BASE+100*60000)

    def test_partial_swing_coverage_is_explicit(self):
        e=self.engine(waves(100))
        c={'id':1,'profile':'LONG_REVERSAL','a':{'origin':BASE-60000,'known':BASE},'b':{'origin':BASE+60000,'known':BASE+120000}}
        leg=e.snapshot([c])['candidate_legs'][0]['ab']
        self.assertFalse(leg['complete']);self.assertIsNone(leg['total_volume'])


if __name__=='__main__':unittest.main()

"""Causal campaign and comparison tests, entirely synthetic/no network."""
from copy import deepcopy
from dataclasses import asdict
import math
import unittest
from swing_tracker import Config
from swing_liquidity import (DEFAULTS, FRAME_MS, LiquidityStudy, build_htf_context,
                             swing_measurements, validate_settings)

BASE = 1792800000000 // 86400000 * 86400000
SYMBOL = 'hyperliquid:BTC'


def bar(i, o=104, h=106, l=101, c=103):
    return {'time':BASE+i*60000,'open':o,'high':h,'low':l,'close':c,'volume':10}


def level(key, price, side, tf='4h', **extra):
    return {'id':key,'price':price,'side':side,'timeframe':tf,'known_at':BASE-120000,
            'source':'confirmed-htf-pivot.1','role':'both','label':'SYNTHETIC '+key,**extra}


def context(side=0):
    return {'observed_at':BASE-60000,'complete':True,'parent_direction':side,
            'frames':{tf:{'status':'AVAILABLE','trend':side,'cutoff':BASE} for tf in FRAME_MS},
            'levels':[level('lower',100,'low'),level('upper',120,'high')]}


def config(**kw):
    return {**asdict(Config(quantity=.1, geometry=False)),**deepcopy(DEFAULTS),**kw}


def study(**kw):
    s=LiquidityStudy('test-run',SYMBOL,config(**kw),1,BASE)
    s.set_context(context());s.last_bar=bar(-1,c=105)
    return s


def ready(at, side=1):
    return {'id':1,'state':'READY','side':side,'signal_at':at-10000,
            'observed_at':at,'initial_stop':95}


def observe(s,i,plans=None,**kw):
    b=bar(i,**kw)
    s.observe(b,b['time']+70000,{'plans':plans or [],'pivots':[],'parent_id':1},[bar(j) for j in range(i-11,i)]+[b])
    return b


class MeasurementTests(unittest.TestCase):
    def test_equal_windows_measure_deceleration_without_calling_it_reversal(self):
        closes=[100,102,104,106,107,108,109]
        rows=[bar(i,o=c,h=c+1,l=c-1,c=c) for i,c in enumerate(closes)]
        m=swing_measurements(rows,3,1)
        self.assertEqual(m['state'],'slowing');self.assertEqual(m['efficiency'],1)
        self.assertEqual(m['velocity_per_minute'],1);self.assertEqual(m['prior_velocity_per_minute'],2)
        self.assertEqual(m['speed_ratio'],.5)
        self.assertEqual(swing_measurements(rows[:4],3)['status'],'INSUFFICIENT_HISTORY')
        rows[-1]['time']+=60000
        self.assertEqual(swing_measurements(rows,3)['status'],'INSUFFICIENT_HISTORY')

    def test_direction_change_is_distinct_from_same_direction_slowdown(self):
        closes=[100,102,104,106,105,104,103]
        rows=[bar(i,o=c,h=c+1,l=c-1,c=c) for i,c in enumerate(closes)]
        self.assertEqual(swing_measurements(rows,3)['state'],'direction_changed')


class HTFTests(unittest.TestCase):
    def feeds(self):
        result={};now=BASE+86400000*30+10000
        for tf,span in FRAME_MS.items():
            cutoff=now//span*span
            rows=[]
            for i in range(30):
                center=100+math.sin(i/2)*10
                rows.append({'time':cutoff-(30-i)*span,'open':center,'high':center+3,'low':center-3,'close':center+1,'volume':10})
            result[tf]={'instrument':SYMBOL,'timeframe':tf,'as_of':now,'bars':rows}
        return result,now

    def test_context_keeps_own_frame_cutoffs_and_causal_known_times(self):
        feeds,now=self.feeds();c=build_htf_context(SYMBOL,feeds,now)
        self.assertTrue(c['complete']);self.assertTrue(c['levels'])
        for p in c['levels']:
            self.assertEqual(p['known_at'],p['origin']+3*FRAME_MS[p['timeframe']])
            self.assertLessEqual(p['known_at'],c['frames'][p['timeframe']]['cutoff'])
            self.assertEqual(p['source'],'confirmed-htf-pivot.1')

    def test_forming_history_wrong_source_and_missing_frame_cannot_supply_context(self):
        feeds,now=self.feeds();end=now//FRAME_MS['1h']*FRAME_MS['1h']
        f=feeds['1h'];f['bars'].append({**f['bars'][-1],'time':end,'high':999})
        c=build_htf_context(SYMBOL,feeds,now)
        self.assertNotIn(end,[x['time'] for x in c['frames']['1h']['evidence']])
        feeds['4h']['instrument']='hyperliquid:ETH'
        c=build_htf_context(SYMBOL,feeds,now)
        self.assertFalse(c['complete']);self.assertEqual(c['parent_direction'],0)

    def test_recent_closed_lower_frame_touch_consumes_new_reference_without_backdating(self):
        s=study();c=context();c['observed_at']=BASE+70000
        s=LiquidityStudy('r',SYMBOL,config(),1,BASE)
        s.set_context(c,[bar(0,l=99)])
        self.assertTrue(s.levels['lower']['consumed'])
        self.assertEqual(s.levels['lower']['available_at'],BASE+70000)

    def test_existing_reference_survives_htf_refresh_until_1m_contact_is_recorded(self):
        s=study();c=context();c['levels']=[p for p in c['levels'] if p['id']!='lower']
        s.set_context(c);observe(s,0,l=99)
        self.assertEqual(s.campaigns[0]['reference']['id'],'lower')
        self.assertTrue(s.levels['lower']['consumed'])


class CampaignTests(unittest.TestCase):
    def test_touch_entry_is_next_actual_eligible_open_and_campaign_is_unique(self):
        s=study();observe(s,0,l=99)
        self.assertEqual(len(s.campaigns),1);p=s.plans[0]
        self.assertEqual(p['eligible_open'],BASE+120000);self.assertEqual(p['status'],'PENDING')
        observe(s,1);self.assertEqual(p['status'],'PENDING')
        observe(s,2);self.assertEqual(p['entry_at'],BASE+120000)
        observe(s,3,l=99);self.assertEqual(len(s.campaigns),1)

    def test_no_warmup_or_newly_discovered_reference_can_own_an_earlier_touch(self):
        s=study();s.levels['lower']['available_at']=BASE+70000
        observe(s,0,l=99)
        self.assertEqual(s.campaigns,[])

    def test_touch_alone_does_not_qualify_tracker_or_jev_variant(self):
        s=study();observe(s,0,l=99)
        self.assertEqual([p['variant'] for p in s.plans],['touch_only'])
        s.model({'status':'AVAILABLE','answers':{'long_fit':{'noul':1}}},'early',BASE+70000,BASE+71000)
        self.assertEqual(len(s.plans),1)

    def test_three_variants_keep_same_stop_target_and_measure_delay_and_costs(self):
        s=study(study_cost_bps=10);observe(s,0,l=99)
        observe(s,1,[ready(BASE+130000)])
        s.model({'status':'AVAILABLE','answers':{'long_fit':{'noul':.9}}},'jev',BASE+130000,BASE+130500)
        self.assertEqual(set(p['variant'] for p in s.plans),{'touch_only','tracker','tracker_jev'})
        self.assertEqual({p['stop'] for p in s.plans},{97});self.assertEqual({p['target'] for p in s.plans},{120})
        for i in (2,3):observe(s,i)
        observe(s,4,h=121,c=118)
        self.assertTrue(all(p['status']=='TARGET' for p in s.plans))
        self.assertTrue(all(p['net_r']<p['gross_r'] for p in s.plans))
        self.assertGreater(s.plans[1]['confirmation_delay_minutes'],0)
        self.assertEqual(s.snapshot()['summaries'][0]['resolved'],1)

    def test_stale_future_and_preconfirmation_model_receipts_do_not_create_entry(self):
        s=study();observe(s,0,l=99);observe(s,1,[ready(BASE+130000)])
        answer={'status':'AVAILABLE','answers':{'long_fit':{'noul':1}}}
        for status,observed,received in [('STALE',BASE+130000,BASE+131000),('AVAILABLE',BASE+70000,BASE+71000),('AVAILABLE',BASE+130000,BASE+134000)]:
            s.model({**answer,'status':status},'bad',observed,received)
        self.assertNotIn('tracker_jev',s.campaigns[0]['variants'])

    def test_same_bar_stop_target_is_ambiguous_and_stop_gap_is_adverse(self):
        s=study();observe(s,0,l=99);observe(s,1);observe(s,2,h=121,l=95,c=100)
        self.assertEqual(s.plans[0]['status'],'AMBIGUOUS');self.assertNotIn('gross_r',s.plans[0])
        s=study();observe(s,0,l=99);observe(s,1);observe(s,2);observe(s,3,o=94,h=100,l=93,c=95)
        self.assertEqual(s.plans[0]['exit'],94);self.assertLess(s.plans[0]['gross_r'],-1)

    def test_preentry_barrier_and_entry_gap_are_missed_not_favorable_fills(self):
        s=study();observe(s,0,l=99);observe(s,1,h=121,c=118)
        self.assertEqual(s.plans[0]['status'],'MISSED');self.assertNotIn('entry',s.plans[0])
        s=study();observe(s,0,l=99);observe(s,1);observe(s,2,o=110,h=111,l=109,c=110)
        self.assertEqual(s.plans[0]['reason'],'OPEN_GAP')

    def test_blocked_side_missing_target_and_incomplete_htf_remain_in_inventory(self):
        for kind in ('side','target','context'):
            s=study(allow_long=kind!='side')
            if kind=='target':s.levels.pop('upper')
            if kind=='context':s.context['complete']=False
            observe(s,0,l=99)
            self.assertEqual(s.campaigns[0]['state'],'BLOCKED');self.assertEqual(s.plans,[])
            self.assertEqual(s.snapshot()['summaries'][0]['no_entry_campaigns'],1)

    def test_duplicate_time_gap_pause_and_expiry_do_not_borrow_future(self):
        s=study();observe(s,0,l=99);observe(s,2)
        self.assertEqual(s.ended['reason'],'DATA_GAP');self.assertEqual(s.plans[0]['status'],'UNRESOLVED')
        s=study(study_horizon=3);observe(s,0,l=99)
        for i in range(1,4):observe(s,i)
        self.assertEqual(s.campaigns[0]['state'],'TERMINAL')
        s.end('USER_PAUSED',BASE+300000)
        self.assertTrue(all(p['status'] not in ('OPEN','PENDING') for p in s.plans))

    def test_continuation_requires_parent_and_uses_separate_campaign_and_results(self):
        s=study(study_playbook='continuation');s.context['parent_direction']=1
        pivot={'origin':BASE-600000,'known':BASE-60000,'side':-1,'price':102}
        b=bar(0,l=101,c=104)
        s.observe(b,BASE+70000,{'plans':[],'pivots':[pivot],'parent_id':7},[bar(-1,l=103,c=105),b])
        self.assertEqual(s.campaigns[0]['playbook'],'DRAW_CONTINUATION')
        self.assertEqual(s.campaigns[0]['target']['price'],120)
        self.assertEqual(s.snapshot()['summaries'][0]['eligible_campaigns'],0)
        self.assertEqual(s.snapshot()['summaries'][3]['eligible_campaigns'],1)
        s=study(study_playbook='continuation')
        s.observe(b,BASE+70000,{'plans':[],'pivots':[pivot],'parent_id':7},[bar(-1),b])
        self.assertEqual(s.campaigns,[])

    def test_model_waiting_does_not_relax_tracker_risk_and_cost_unknown_stays_null(self):
        s=study(attempt_risk=.01);observe(s,0,l=99);observe(s,1,[ready(BASE+130000)])
        s.model({'status':'AVAILABLE','answers':{'long_fit':{'noul':1}}},'jev',BASE+130000,BASE+130500)
        self.assertTrue(all(p['status']=='BLOCKED' for p in s.plans))
        self.assertIsNone(s.snapshot()['summaries'][0]['mean_net_r'])

    def test_manual_config_rejects_backdated_or_nonfinite_provenance_fields(self):
        for kw in ({'study_jev_min':float('nan')},{'study_cost_bps':-1},{'allow_long':'yes'},{'study_window':True}):
            with self.assertRaises(ValueError):validate_settings(config(**kw))


if __name__=='__main__':unittest.main()

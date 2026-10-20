import copy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from agents import Agents,validate
from agent_adapters import ExecutionAdapter
from engine import Engine


class AgentsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.e=Engine(Path(self.temp.name)/'desk.db');self.now=time.time();self.s=Agents(self.e,lambda:self.now)
        self.a=self.s.listing()['agents'][0];self.i=self.a['instrument'];self.quote(101)
    def quote(self,mid,spread='.02',age=0):
        from decimal import Decimal
        mid,spread=Decimal(str(mid)),Decimal(spread)
        self.e.ingest(self.i,str(mid-spread/2),str(mid+spread/2),{'tick':'.01','qty_step':'.001'},received_at=self.now-age)
    def publish(self,price='100',**changes):
        self.s.publish({'instrument':self.i,'timeframe':'1','observedAt':self.now,'replay':False,'levels':[{'id':'cyan-1','price':price,'source':'manual-cyan','label':'Cyan fixture'}],**changes})
    def arm(self):self.s.control({'id':self.a['id'],'revision':self.a['revision'],'action':'arm'})
    def touch(self):
        self.publish();self.arm();self.s.tick();self.quote(100);self.s.tick();return self.s.detail(self.a['id'])
    def config(self,**changes):
        c={k:copy.deepcopy(self.a[k]) for k in ('name','avatar','color','description','mode','account','instrument','modules')}
        c.update(changes);return c
    def save(self,c):
        self.s.save({**c,'id':self.a['id'],'expectedRevision':self.a['revision']});self.a=self.s.detail(self.a['id'])['agent']

    def test_seed_is_paused_dedicated_and_not_reseeded(self):
        self.assertEqual(self.a['name'],'Test Agent');self.assertEqual(self.a['state'],'paused')
        self.assertEqual(self.a['metrics']['fills'],0);self.assertIsNone(self.a['metrics']['winRate'])
        self.assertEqual(len(Agents(self.e).listing()['agents']),1)
        self.assertEqual(self.e.state()['accounts'][0]['capital'],'10000')

    def test_observed_touch_creates_attributed_paper_fill_and_bracket(self):
        d=self.touch();self.assertEqual(d['runs'][0]['decision'],'submitted');self.assertEqual(len(d['fills']),1)
        self.assertEqual(d['orders'][0]['side'],'buy');self.assertEqual(d['positions'][0]['stop'],'99.80')
        self.assertTrue(d['runs'][0]['payload']['simulation']);self.assertEqual(d['agent']['metrics']['openPositions'],1)

    def test_touch_at_arm_or_new_line_is_not_entry(self):
        self.quote(100);self.publish();self.arm();self.s.tick();self.s.tick();self.assertFalse(self.s.detail(self.a['id'])['runs'])
        self.quote(101);self.s.tick();self.quote(100);self.s.tick();self.assertEqual(len(self.s.detail(self.a['id'])['runs']),1)

    def test_one_signal_per_arm_even_after_price_leaves_and_returns(self):
        self.touch();self.quote(101);self.s.tick();self.quote(100);self.s.tick()
        self.assertEqual(len(self.s.detail(self.a['id'])['runs']),1)

    def test_line_move_sets_new_baseline(self):
        self.publish();self.arm();self.s.tick();self.publish(price='101');self.s.tick()
        self.assertFalse(self.s.detail(self.a['id'])['runs'])

    def test_gap_across_level_is_not_invented_touch(self):
        self.publish();self.arm();self.s.tick();self.quote(99);self.s.tick()
        self.assertFalse(self.s.detail(self.a['id'])['runs'])

    def test_chart_identity_replay_and_expired_heartbeat_gate_entries(self):
        self.publish();self.arm();self.s.tick();self.quote(100);self.publish(replay=True);self.s.tick()
        self.assertFalse(self.s.detail(self.a['id'])['runs'])
        self.publish(instrument='hyperliquid:ETH');self.s.tick();self.assertFalse(self.s.detail(self.a['id'])['runs'])
        self.publish();self.now+=16;self.quote(100);self.s.tick();self.assertFalse(self.s.detail(self.a['id'])['runs'])

    def test_stale_quote_cannot_trigger(self):
        self.publish();self.arm();self.s.tick();self.quote(100,age=14);self.s.tick()
        self.assertFalse(self.s.detail(self.a['id'])['runs'])

    def test_notional_and_spread_limits_block_without_order(self):
        c=self.config();c['modules']['risk']['maxOrderUSD']='.05';self.save(c)
        d=self.touch();self.assertEqual(d['runs'][0]['decision'],'blocked');self.assertIn('notional',d['runs'][0]['reason']);self.assertFalse(d['orders'])

    def test_risk_plus_fees_cap_is_enforced(self):
        c=self.config();c['modules']['risk']['maxRiskUSD']='.01';c['modules']['entry']['quantity']='1';self.save(c)
        d=self.touch();self.assertIn('Stop risk',d['runs'][0]['reason']);self.assertFalse(d['orders'])

    def test_live_adapters_and_observe_profiles_cannot_arm(self):
        for venue in ('robinhood','hyperliquid','coinbase','binance','ibkr'):
            with self.assertRaises(ValueError):ExecutionAdapter(venue,self.e).require('autonomous')
        c=self.config(mode='observe');self.save(c)
        with self.assertRaisesRegex(ValueError,'simulation'):self.arm()

    def test_execution_contract_is_explicit_and_cannot_imply_product_conversion(self):
        self.assertEqual(validate(self.config())['executionInstrument'],self.i)
        with self.assertRaisesRegex(ValueError,'exact'):
            validate(self.config(executionInstrument='coinbase:BTC-USD'))
        external=self.config(mode='observe',account={'venue':'robinhood','id':'external-account'})
        with self.assertRaises(ValueError):validate(external)
        external['executionInstrument']='BTC-USD'
        self.assertEqual(validate(external)['executionInstrument'],'BTC-USD')
        with self.assertRaises(ValueError):validate({**external,'mode':'simulation'})

    def test_stale_revision_and_live_mode_rejected(self):
        c=self.config();self.save(c)
        with self.assertRaisesRegex(ValueError,'revision'):self.s.save({**c,'id':self.a['id'],'expectedRevision':1})
        with self.assertRaises(ValueError):validate(self.config(mode='live'))

    def test_restart_pauses_armed_agents_and_retains_runs(self):
        self.touch();restored=Agents(self.e);d=restored.detail(self.a['id'])
        self.assertEqual(d['agent']['state'],'paused');self.assertEqual(len(d['runs']),1)

    def test_pause_protects_existing_position_and_max_hold_remains_supervised(self):
        c=self.config();c['modules']['exit']['maxHoldingSeconds']=60;self.save(c);d=self.touch()
        self.s.control({'id':self.a['id'],'revision':self.a['revision'],'action':'pause'})
        self.assertTrue(self.e.state(self.a['account']['id'])['positions'])
        self.now+=61;self.quote(100);self.s.tick()
        d=self.s.detail(self.a['id']);self.assertEqual(d['agent']['metrics']['openPositions'],0);self.assertEqual(d['agent']['metrics']['closedTrades'],1)

    def test_fills_from_other_account_activity_are_not_agent_performance(self):
        self.e.execute('manual-entry','order',{'account_id':self.a['account']['id'],'instrument':self.i,'side':'buy','kind':'market','qty':'.001'})
        self.assertEqual(self.s.detail(self.a['id'])['agent']['metrics']['fills'],0)

    def test_opposite_manual_position_blocks_mixed_attribution(self):
        self.e.execute('manual-entry','order',{'account_id':self.a['account']['id'],'instrument':self.i,'side':'sell','kind':'market','qty':'.001'})
        d=self.touch();self.assertIn('Opposite',d['runs'][0]['reason']);self.assertFalse(d['orders'])

    def test_stop_only_cancels_agent_owned_orders(self):
        c=self.config();c['modules']['entry']['type']='limit-level';self.save(c)
        other=self.e.execute('manual-limit','order',{'account_id':self.a['account']['id'],'instrument':self.i,'side':'buy','kind':'limit','qty':'.001','price':'90'})
        self.touch();self.s.control({'id':self.a['id'],'revision':self.a['revision'],'action':'stop','confirmation':'SIMULATION ONLY'})
        d=self.s.detail(self.a['id']);self.assertEqual(d['orders'][0]['status'],'cancelled')
        self.assertEqual(next(o for o in self.e.state(self.a['account']['id'])['orders'] if o['id']==other['id'])['status'],'working')

    def test_order_exception_rolls_back_engine_side_effects(self):
        original=self.e.create_order
        def bad(db,p):original(db,p);raise ValueError('Injected execution failure')
        self.e.create_order=bad
        d=self.touch();self.assertFalse(d['orders']);self.assertFalse(self.e.state(self.a['account']['id'])['positions']);self.assertEqual(d['runs'][0]['decision'],'blocked')

    def test_resting_agent_limit_cannot_net_new_unrelated_manual_position(self):
        c=self.config();c['modules']['entry']['type']='limit-level';self.save(c);d=self.touch()
        self.assertEqual(d['orders'][0]['status'],'working')
        other=self.e.execute('manual-later','order',{'account_id':self.a['account']['id'],'instrument':self.i,'side':'sell','kind':'market','qty':'.001'})
        self.now+=.1
        self.quote(99.99);d=self.s.detail(self.a['id'])
        self.assertEqual(d['orders'][0]['status'],'rejected');self.assertFalse(d['fills'])
        self.assertTrue(any(p['id']==other['position_id'] for p in self.e.state(self.a['account']['id'])['positions']))

    def test_manual_opposite_order_cannot_net_agent_position(self):
        self.touch()
        with self.assertRaisesRegex(ValueError,'ownership'):
            self.e.execute('manual-net','order',{'account_id':self.a['account']['id'],'instrument':self.i,'side':'sell','kind':'market','qty':'.001'})
        self.assertEqual(self.s.detail(self.a['id'])['agent']['metrics']['openPositions'],1)

    def test_safe_manual_fifo_reduction_preserves_later_agent_position(self):
        account=self.a['account']['id']
        manual=self.e.execute('manual-first','order',{'account_id':account,'instrument':self.i,'side':'buy','kind':'market','qty':'.001'})
        with self.e.lock,self.e.db() as db:db.execute('UPDATE positions SET opened_at=1 WHERE id=?',(manual['position_id'],))
        self.touch();agent_position=self.s.detail(self.a['id'])['positions'][0]['id']
        with self.assertRaisesRegex(ValueError,'ownership'):
            self.e.execute('oversized-reduce','order',{'account_id':account,'instrument':self.i,'side':'sell','kind':'market','qty':'.002'})
        self.assertEqual(len(self.e.state(account)['positions']),2)
        self.e.execute('safe-reduce','order',{'account_id':account,'instrument':self.i,'side':'sell','kind':'market','qty':'.001'})
        self.assertEqual([p['id'] for p in self.e.state(account)['positions']],[agent_position])
        self.assertEqual(self.s.detail(self.a['id'])['agent']['metrics']['closedTrades'],0)

    def test_deleted_account_only_pauses_its_own_agent(self):
        other=self.e.execute('other-account','account',{'name':'Other','capital':'1000'})
        config=self.config(name='Other agent',account={'venue':'simulation','id':other['id']})
        other_agent=self.s.save(config);self.arm();self.s.control({'id':other_agent['id'],'revision':1,'action':'arm'})
        self.e.execute('delete-assigned','account_delete',{'account_id':self.a['account']['id'],'confirm_name':'Agents · Test simulation'})
        self.s.tick();s=self.s.listing()['agents']
        self.assertEqual(next(a for a in s if a['id']==self.a['id'])['state'],'paused')
        self.assertEqual(next(a for a in s if a['id']==other_agent['id'])['state'],'armed')

    def test_save_with_open_execution_is_rejected(self):
        self.touch()
        with self.assertRaisesRegex(ValueError,'owned execution'):self.save(self.config())

    def test_publish_schema_and_duplicate_levels_rejected(self):
        with self.assertRaises(ValueError):self.publish(observedAt=self.now-20)
        l={'id':'same','price':'100','source':'manual-cyan','label':'x'}
        with self.assertRaises(ValueError):self.publish(levels=[l,l])

    def test_closed_trade_performance_comes_from_engine_exit_fills(self):
        self.touch();self.quote(101);d=self.s.detail(self.a['id'])
        self.assertEqual(d['agent']['metrics']['closedTrades'],1);self.assertEqual(d['agent']['metrics']['wins'],1)
        self.assertEqual(d['agent']['metrics']['winRate'],100.)
        self.assertGreater(float(d['agent']['metrics']['fees']),0)


if __name__=='__main__':unittest.main()

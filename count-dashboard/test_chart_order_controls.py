from test_quant_lab_sim import server
import unittest
from unittest.mock import patch
import tempfile
from pathlib import Path


class ChartOrderControlTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=server.connect(Path(self.tmp.name)/'test.sqlite')
        self.account=server.create_chart_sim_account(self.db,{'name':'Chart controls test','starting_balance':10000})

    def tearDown(self):
        self.db.close();self.tmp.cleanup()

    def order(self, **fields):
        return server.queue_quant_lab_sim_limit_order(self.db,dict(account_id=self.account['account_id'],provider='coinbase',symbol='BTC-USD',timeframe='1m',side='long',quantity=.01,entry_price=100,bar_time=1800000000,**fields))

    def bar(self,time,opening=100,high=102,low=98,close=101):
        return {'provider':'coinbase','symbol':'BTC-USD','timeframe':'1m','bars':[dict(time=time,open=opening,high=high,low=low,close=close)]}

    def amend(self,order,**fields):
        return server.chart_order_controls.amend(self.db,dict(order_id=order['order_id'],revision=order['revision'],current_bar_time=1800000060,**fields),server)

    def test_chart_draft_waits_for_valid_brackets_and_transfers_them_to_fill(self):
        o=self.order(chart_bracket_draft=True)
        self.assertEqual(0,o['bracket_ready'])
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060))['filled'])
        o=self.amend(o,stop_price=95)
        self.assertEqual(0,o['bracket_ready'])
        o=self.amend(o,target_price=115)
        self.assertEqual(1,o['bracket_ready'])
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060))['filled'])
        f=server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000120))['filled'][0]
        self.assertEqual(95,f['position']['stop_price']);self.assertEqual(115,f['position']['target_price'])
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000120))['filled'])

    def test_invalid_drag_and_stale_revision_do_not_change_order(self):
        o=self.order(stop_price=95,target_price=115)
        with self.assertRaisesRegex(ValueError,'SL must'):
            self.amend(o,stop_price=105)
        updated=self.amend(o,stop_price=96)
        with self.assertRaisesRegex(ValueError,'changed while editing'):
            self.amend(o,target_price=120)
        self.assertEqual(96,updated['stop_price']);self.assertEqual(115,updated['target_price'])

    def test_amendment_does_not_fill_old_history(self):
        o=self.order(stop_price=95,target_price=115)
        server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060,103,104,102,103))
        o=self.amend(o,entry_price=103)
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060,103,104,102,103))['filled'])
        self.assertEqual(1,len(server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000120,103,104,102,103))['filled']))

    def test_stop_limit_triggers_then_rests_without_same_bar_fill_or_chase(self):
        o=self.order(order_type='stop_limit',trigger_price=100,stop_price=95,target_price=115)
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060,99,101,98,100))['filled'])
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000120,104,105,103,104))['filled'])
        filled=server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000180))['filled']
        self.assertEqual(100,filled[0]['position']['entry_price'])

    def test_gap_beyond_stop_invalidates_entry(self):
        o=self.order(stop_price=95,target_price=115)
        self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060,90,94,89,91))['filled'])
        self.assertEqual('canceled',server.quant_lab_sim_limit_order_rows(self.db)[0]['status'])

    def test_open_position_bracket_drag_retains_existing_risk_validation(self):
        p=server.open_quant_lab_sim_position(self.db,dict(account_id=self.account['account_id'],provider='coinbase',symbol='BTC-USD',timeframe='1m',side='long',quantity=.01,entry_price=100,bar_time=1800000000,stop_price=95,target_price=115))
        updated=server.update_quant_lab_sim_bracket(self.db,dict(position_id=p['position_id'],current_bar_time=1800000060,stop_price=96,target_price=116))
        self.assertEqual(96,updated['stop_price'])
        with self.assertRaisesRegex(ValueError,'wrong side'):
            server.update_quant_lab_sim_bracket(self.db,dict(position_id=p['position_id'],current_bar_time=1800000060,stop_price=105,target_price=116))


    def test_monthly_draft_activation_enforces_risk_and_current_hunt(self):
        o=self.order(chart_bracket_draft=True)
        self.db.execute("INSERT INTO chart_sim_accounts(account_id,name,starting_balance,created_at) VALUES ('crypto-month-chart-test','Test monthly',500,'test')")
        self.db.execute("UPDATE quant_lab_sim_limit_orders SET account_id='crypto-month-chart-test',hunt_session_id='hunt-a' WHERE order_id=?",(o['order_id'],))
        self.db.commit()
        with patch.object(server.crypto_day_desk,'require_clock_in',return_value={'id':'hunt-a'}), patch.object(server.crypto_day_desk,'check_paper_risk',side_effect=ValueError('risk rejected')) as risk:
            with self.assertRaisesRegex(ValueError,'risk rejected'):self.amend(o,stop_price=95,target_price=115)
            risk.assert_called_once()
        saved=server.quant_lab_sim_limit_order_rows(self.db)[0]
        self.assertEqual(0,saved['bracket_ready']);self.assertEqual(o['revision'],saved['revision'])
        with patch.object(server.crypto_day_desk,'require_clock_in',return_value={'id':'hunt-b'}):
            with self.assertRaisesRegex(ValueError,'earlier hunt'):self.amend(o,stop_price=95,target_price=115)

    def test_expired_monthly_hunt_cancels_pending_order(self):
        o=self.order(stop_price=95,target_price=115)
        self.db.execute("UPDATE quant_lab_sim_limit_orders SET hunt_session_id='hunt-a' WHERE order_id=?",(o['order_id'],))
        self.db.commit()
        with patch.object(server.crypto_day_desk,'require_clock_in',side_effect=ValueError('clocked out')):
            self.assertEqual([],server.advance_quant_lab_sim_limit_orders(self.db,self.bar(1800000060))['filled'])
        self.assertEqual('canceled',server.quant_lab_sim_limit_order_rows(self.db)[0]['status'])


if __name__=='__main__':unittest.main()

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name('server.py')
SPEC = importlib.util.spec_from_file_location('quant_lab_test_server', MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


class QuantLabPaperSimulationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = server.connect(Path(self.tmp.name) / 'quant-lab.sqlite3')
        self.account = server.create_chart_sim_account(self.db, {'name': 'Quant Lab test', 'starting_balance': 10000})

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_chart_position_records_provenance_and_target_exit_journal_event(self):
        opened = server.open_quant_lab_sim_position(self.db, {
            'account_id': self.account['account_id'], 'provider': 'binance', 'symbol': 'BTCUSDT',
            'timeframe': '5m', 'side': 'long', 'quantity': '0.01', 'entry_price': '100',
            'bar_time': 1800000000, 'stop_price': '90', 'target_price': '110',
        })
        self.assertEqual('open', opened['status'])
        self.assertEqual('Binance public data', opened['entry_source'])
        result = server.advance_quant_lab_sim_positions(self.db, {
            'provider': 'binance', 'symbol': 'BTCUSDT', 'timeframe': '5m',
            'bars': [{'time': 1800000300, 'open': 100, 'high': 111, 'low': 99, 'close': 110}],
        })
        self.assertEqual(1, result['closed'])
        self.assertEqual('target', result['positions'][0]['close_reason'])
        self.assertAlmostEqual(0.1, result['positions'][0]['gross_pnl'])
        events = [json.loads(row['payload_json']) for row in self.db.execute(
            "SELECT payload_json FROM chart_sim_journal_outbox WHERE event_type='trade_closed'")]
        self.assertEqual('crypto', events[0]['execution']['assetClass'])
        self.assertEqual('Binance public data', events[0]['provenance']['source'])

    def test_limit_order_waits_for_later_bar_and_never_chases(self):
        order = server.queue_quant_lab_sim_limit_order(self.db, {
            'account_id': self.account['account_id'], 'provider': 'binance', 'symbol': 'BTCUSDT',
            'timeframe': '1m', 'side': 'long', 'quantity': '0.01', 'entry_price': '100',
            'bar_time': 1800000000, 'stop_price': '95', 'target_price': '110',
        })
        self.assertEqual('pending', order['status'])
        result = server.advance_quant_lab_sim_limit_orders(self.db, {
            'provider': 'binance', 'symbol': 'BTCUSDT', 'timeframe': '1m',
            'bars': [
                {'time': 1800000000, 'open': 100, 'high': 101, 'low': 99, 'close': 100},
                {'time': 1800000060, 'open': 103, 'high': 104, 'low': 102, 'close': 103},
            ],
        })
        self.assertEqual([], result['filled'])
        result = server.advance_quant_lab_sim_limit_orders(self.db, {
            'provider': 'binance', 'symbol': 'BTCUSDT', 'timeframe': '1m',
            'bars': [{'time': 1800000120, 'open': 101, 'high': 102, 'low': 99, 'close': 100}],
        })
        self.assertEqual(1, len(result['filled']))
        fill = result['filled'][0]
        self.assertEqual('filled', fill['order']['status'])
        self.assertEqual('open', fill['position']['status'])
        self.assertEqual(100, fill['position']['entry_price'])
        self.assertEqual(1800000120, fill['position']['entry_bar_time'])

    def test_cancel_working_limit(self):
        order = server.queue_quant_lab_sim_limit_order(self.db, {
            'account_id': self.account['account_id'], 'provider': 'coinbase', 'symbol': 'BTC-USD',
            'timeframe': '1m', 'side': 'short', 'quantity': '0.01', 'entry_price': '100',
            'bar_time': 1800000000,
        })
        canceled = server.cancel_quant_lab_sim_limit_order(self.db, order['order_id'])
        self.assertEqual('canceled', canceled['status'])
        with self.assertRaisesRegex(ValueError, 'working paper limit'):
            server.cancel_quant_lab_sim_limit_order(self.db, order['order_id'])

    def test_bracket_prices_are_validated_against_entry(self):
        opened = server.open_quant_lab_sim_position(self.db, {
            'account_id': self.account['account_id'], 'provider': 'coinbase', 'symbol': 'BTC-USD',
            'timeframe': '15m', 'side': 'short', 'quantity': '0.1', 'entry_price': '50000',
            'bar_time': 1800000000,
        })
        with self.assertRaisesRegex(ValueError, 'wrong side'):
            server.update_quant_lab_sim_bracket(self.db, {
                'position_id': opened['position_id'], 'stop_price': '49000', 'current_bar_time': 1800000000,
            })
        updated = server.update_quant_lab_sim_bracket(self.db, {
            'position_id': opened['position_id'], 'stop_price': '51000', 'target_price': '49000',
            'current_bar_time': 1800000000,
        })
        self.assertEqual(51000, updated['stop_price'])
        self.assertEqual(49000, updated['target_price'])


if __name__ == '__main__':
    unittest.main()

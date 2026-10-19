import json
from pathlib import Path
import sys
import tempfile
import unittest
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from robinhood_workspace import RobinhoodWorkspace, validate_config
from robinhood_fixture import FakeBroker


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1792340000.0
        self.broker = FakeBroker()
        self.broker.clock = lambda: self.now
        self.service = RobinhoodWorkspace(self.broker, self.temp.name, clock=lambda: self.now)
        self.cookie = self.service.new_profile()
        self.owner = self.service.profile(self.cookie)
        self.broker.connect(self.owner)
        self.accounts = self.service.status(self.owner)['accounts']
        self.aid = next(a['id'] for a in self.accounts if a['tradable'])

    def config(self, **overrides):
        return {'accountId': self.aid, 'name': 'Chart shadow', 'mode': 'shadow', 'strategy': 'chart-ticket-v1', 'symbols': ['BTC-USD'], 'maxOrderUSD': '100.00', 'maxQuoteAgeSeconds': 15, 'maxSpreadBps': 20, **overrides}

    def agent(self):
        a = self.service.save_agent(self.owner, self.config())
        self.service.pause(self.owner, a['id'], False)
        return a

    def request(self, agent=None, **overrides):
        a = agent or self.agent()
        stamp = datetime.fromtimestamp(self.now, timezone.utc).isoformat()
        return {'requestId': 'logical-shadow-request-1', 'agentId': a['id'], 'revision': a['revision'],
                'intent': {'chartInstrument': 'coinbase:BTC-USD', 'timeframe': '1m', 'completedBarCutoff': stamp, 'chartObservedAt': stamp, 'replay': False, 'side': 'buy', 'kind': 'limit', 'quantity': '0.5', 'limitPrice': '100', 'stopPrice': None, 'targetPrice': None, 'paperAccountId': 'paper-source', **overrides}}

    def test_profile_integrity_expiry_and_persistence(self):
        self.assertIsNone(self.service.profile(self.cookie[:-1] + ('a' if self.cookie[-1] != 'a' else 'b')))
        restored = RobinhoodWorkspace(self.broker, self.temp.name, clock=lambda: self.now)
        self.assertEqual(restored.profile(self.cookie), self.owner)
        self.now += 31 * 86400
        self.assertIsNone(restored.profile(self.cookie))

    def test_stable_masked_account_identity_reconnect_and_owner_isolation(self):
        self.assertNotIn('TEST_MCP_55556666', json.dumps(self.accounts))
        self.service.disconnect(self.owner)
        self.broker.connect(self.owner)
        self.assertEqual(self.service.status(self.owner)['accounts'], self.accounts)
        other = self.service.profile(self.service.new_profile())
        self.assertEqual(self.service.agents(other), [])
        self.assertEqual(self.service.snapshot(other, self.aid)['sources'], {})

    def test_pagination_keeps_cursor_server_side_masks_and_deduplicates(self):
        first = self.service.sync(self.owner, self.aid, ['equity_orders'])['sources']['equity_orders']
        self.assertEqual(first['status'], 'partial'); self.assertTrue(first['hasMore'])
        self.assertNotIn('cursor-2', json.dumps(first))
        self.assertNotIn('TEST_MCP_55556666', json.dumps(first))
        second = self.service.sync(self.owner, self.aid, ['equity_orders'], True)['sources']['equity_orders']
        self.assertEqual(second['status'], 'complete'); self.assertEqual(second['pages'], 2)
        self.assertEqual(len(second['data']['orders']), 2)
        refreshed = self.service.sync(self.owner, self.aid, ['equity_orders'])['sources']['equity_orders']
        self.assertEqual(refreshed['pages'], 1); self.assertTrue(refreshed['hasMore'])

    def test_errors_retain_previous_data_without_refreshing_timestamp_or_leaking_errors(self):
        old = self.service.sync(self.owner, self.aid, ['portfolio'])['sources']['portfolio']
        self.broker.fail.add('get_portfolio'); self.now += 100
        new = self.service.sync(self.owner, self.aid, ['portfolio'])['sources']['portfolio']
        self.assertEqual(new['status'], 'error'); self.assertEqual(new['observedAt'], old['observedAt'])
        self.assertEqual(new['data'], old['data']); self.assertEqual(new['ageSeconds'], 100)
        self.assertNotIn('PRIVATE_TOKEN', json.dumps(new))

    def test_malformed_collections_and_missing_buying_power_fail_closed(self):
        self.broker.malformed.update(['get_equity_positions', 'get_portfolio'])
        s = self.service.sync(self.owner, self.aid, ['portfolio', 'equity_positions'])['sources']
        self.assertTrue(all(v['status'] == 'error' and v['data'] is None for v in s.values()))

    def test_account_specific_numeric_routing_and_pnl_window(self):
        self.service.sync(self.owner, self.aid, ['crypto_positions', 'crypto_orders', 'realized_pnl', 'pnl_trades'])
        for _, name, args in self.broker.calls:
            if name.startswith('get_crypto_'): self.assertEqual(args['rhs_account_number'], '55556666')
            if name in ('get_realized_pnl', 'get_pnl_trade_history'): self.assertEqual(args['account_number'], '55556666')
        self.assertIsNone(self.service.snapshot(self.owner, self.aid)['sources']['realized_pnl']['data']['data_points'][0]['realized_gain'])

    def test_unavailable_tool_does_not_become_empty_history(self):
        del self.broker.sessions[self.owner]['tools']['get_option_orders']
        s = self.service.sync(self.owner, self.aid, ['option_orders'])['sources']['option_orders']
        self.assertEqual(s['status'], 'unavailable'); self.assertIsNone(s['data'])

    def test_write_allowlist_and_untrusted_sources_are_rejected(self):
        for tool in ['place_equity_order', 'cancel_crypto_order', 'exercise_option']:
            with self.assertRaises(ValueError): self.service.read(self.owner, tool, {})
        with self.assertRaises(ValueError): self.service.sync(self.owner, self.aid, ['place_equity_order'])
        with self.assertRaises(ValueError): self.service.sync(self.owner, 'foreign-account', ['portfolio'])

    def test_versioned_agent_save_pause_and_optimistic_concurrency(self):
        a = self.agent(); self.assertFalse(self.service.agents(self.owner)[0]['paused'])
        b = self.service.save_agent(self.owner, self.config(id=a['id'], expectedRevision=1, name='Revised'))
        self.assertEqual(b['revision'], 2); self.assertTrue(b['paused'])
        with self.assertRaisesRegex(ValueError, 'changed'): self.service.save_agent(self.owner, self.config(id=a['id'], expectedRevision=1))
        with self.service.db() as db: self.assertEqual(db.execute('SELECT count(*) FROM agent_revisions').fetchone()[0], 2)

    def test_live_modes_readonly_accounts_and_unsafe_configs_rejected(self):
        personal = next(a['id'] for a in self.accounts if not a['tradable'])
        invalid = [{'mode': 'bounded'}, {'accountId': personal}, {'symbols': ['MYM']}, {'maxOrderUSD': 'NaN'}, {'maxQuoteAgeSeconds': True}, {'maxSpreadBps': 0}, {'submitLive': True}]
        for fields in invalid:
            with self.subTest(fields=fields):
                with self.assertRaises(ValueError): self.service.save_agent(self.owner, self.config(**fields))

    def test_shadow_success_is_durable_idempotent_and_never_calls_write_or_preview(self):
        p = self.request(); result = self.service.evaluate(self.owner, p)
        self.assertEqual(result['decision'], 'shadow_eligible'); self.assertIsNone(result['brokerOrderId']); self.assertEqual(result['fills'], [])
        count = len(self.broker.calls)
        self.assertEqual(self.service.evaluate(self.owner, p), result); self.assertEqual(len(self.broker.calls), count)
        self.assertEqual(self.service.runs(self.owner), [result])
        self.assertEqual({n for _, n, _ in self.broker.calls}, {'get_crypto_quotes', 'get_portfolio'})
        changed = json.loads(json.dumps(p)); changed['intent']['quantity'] = '0.6'
        with self.assertRaisesRegex(ValueError, 'different intent'): self.service.evaluate(self.owner, changed)

    def test_pause_observe_replay_wrong_instrument_and_size_block(self):
        for changes in [{'replay': True}, {'chartInstrument': 'hyperliquid:BTC'}, {'chartInstrument': 'ibkr:MYM'}, {'quantity': '2'}]:
            p = self.request(**changes); p['requestId'] += str(len(self.service.runs(self.owner)))
            result = self.service.evaluate(self.owner, p)
            self.assertEqual(result['decision'], 'blocked'); self.assertTrue(result['reasons'])
        a = self.service.save_agent(self.owner, self.config(mode='observe'))
        self.assertEqual(self.service.evaluate(self.owner, self.request(a))['decision'], 'blocked')

    def test_stale_and_future_chart_or_broker_quotes_block(self):
        for target in ['chart', 'broker', 'future']:
            p = self.request(); p['requestId'] += target
            if target == 'chart': p['intent']['chartObservedAt'] = '2000-01-01T00:00:00Z'
            if target == 'broker': self.broker.quote_age = 100
            if target == 'future': self.broker.quote_age = -100
            self.assertEqual(self.service.evaluate(self.owner, p)['decision'], 'blocked')
            self.broker.quote_age = 0

    def test_buying_power_spread_sell_and_disconnected_failures_block(self):
        for target in ['power', 'spread', 'sell', 'disconnected']:
            p = self.request(); p['requestId'] += target
            if target == 'power': self.broker.portfolio['crypto_buying_power']['buying_power'] = '1'
            if target == 'spread': self.broker.ask = '110'
            if target == 'sell': p['intent']['side'] = 'sell'
            if target == 'disconnected': self.service.disconnect(self.owner)
            self.assertEqual(self.service.evaluate(self.owner, p)['decision'], 'blocked')
            self.broker.portfolio['crypto_buying_power']['buying_power'] = '200'; self.broker.ask = '100.10'

    def test_restart_and_disconnect_pause_agents_preserve_journal(self):
        a = self.agent(); p = self.request(a); self.service.evaluate(self.owner, p)
        restarted = RobinhoodWorkspace(self.broker, self.temp.name, clock=lambda: self.now)
        self.assertTrue(restarted.agents(self.owner)[0]['paused']); self.assertEqual(len(restarted.runs(self.owner)), 1)
        self.service.pause(self.owner, a['id'], False); self.service.disconnect(self.owner)
        self.assertTrue(self.service.agents(self.owner)[0]['paused']); self.assertFalse(self.service.status(self.owner)['connected'])


if __name__ == '__main__': unittest.main()

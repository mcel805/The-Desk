"""Synthetic MCP transport boundary for tests. Never imported by production."""
import threading
import time
from datetime import datetime, timezone


class FakeBroker:
    def __init__(self, *args, auto=False, **kwargs):
        self.lock = threading.RLock()
        self.sessions = {}
        self.calls = []
        self.fail = set()
        self.malformed = set()
        self.auto = auto
        self.bid = '100.00'
        self.ask = '100.10'
        self.quote_age = 0
        self.clock = time.time
        self.portfolio = {'total_value': '200.00', 'cash': '200.00', 'currency': 'USD',
                          'buying_power': {'buying_power': '200.00'}, 'crypto_buying_power': {'buying_power': '200.00'}}

    def connect(self, owner):
        from robinhood_workspace import ALLOWED_TOOLS
        self.sessions[owner] = {'tools': {n: {} for n in ALLOWED_TOOLS}, 'accounts': {
            'personal': {'account_number': 'TEST_PERSONAL_11112222', 'rhs_account_number': '11112222', 'rhc_account_number': 'RHC11112222', 'state': 'active', 'agentic_allowed': False, 'is_default': True, 'brokerage_account_type': 'individual', 'type': 'margin', 'option_level': 'option_level_2'},
            'mcp': {'account_number': 'TEST_MCP_55556666', 'rhs_account_number': '55556666', 'rhc_account_number': 'RHC55556666', 'state': 'active', 'agentic_allowed': True, 'is_default': False, 'brokerage_account_type': 'individual', 'type': 'limited_margin', 'nickname': 'SYNTHETIC MCP', 'option_level': ''}}}

    def status(self, owner):
        if owner not in self.sessions:
            if self.auto: self.connect(owner)
            else: return {'connected': False}
        return {'connected': True, 'accounts': [{'id': k, 'account': '••••' + v['account_number'][-4:], 'cryptoAccount': '••••' + v['rhc_account_number'][-4:], 'name': v.get('nickname', 'SYNTHETIC Personal'), 'tradable': v['agentic_allowed'], 'default': v['is_default'], 'type': v['brokerage_account_type'], 'tradingType': v['type']} for k, v in self.sessions[owner]['accounts'].items()]}

    def call(self, owner, name, args):
        self.calls.append((owner, name, args))
        if name in self.fail: raise RuntimeError('PRIVATE_TOKEN TEST_MCP_55556666 provider detail')
        if name in self.malformed: return {'unexpected': None}
        if name == 'get_portfolio': return self.portfolio.copy()
        if name == 'get_crypto_quotes':
            stamp = datetime.fromtimestamp(self.clock()-self.quote_age, timezone.utc).isoformat()
            return {'results': [{'symbol': args['symbols'][0].replace('-', ''), 'bid_price': self.bid, 'ask_price': self.ask, 'updated_at': stamp, 'bid_time': stamp, 'ask_time': stamp, 'routing': 'SYNTHETIC'}]}
        if name == 'get_trade_approval_setting': return {'setting': {'account_number': args['account_number'], 'human_must_approve_trades': True}}
        if name == 'get_trade_approvals': return {'approvals': []}
        if name == 'get_realized_pnl': return {'data_points': [{'realized_gain': None, 'number_of_trades': 0}]}
        if name == 'get_pnl_trade_history': return {'trades': [], 'next_cursor': ''}
        if name == 'get_equity_orders':
            row = {'id': 'synthetic-order-1', 'account_number': args['account_number'], 'symbol': 'TEST', 'quantity': '1', 'state': 'filled'}
            return {'orders': [row] if not args.get('cursor') else [row, {'id': 'synthetic-order-2', 'symbol': 'TEST', 'state': 'cancelled'}], 'next': '' if args.get('cursor') else 'cursor-2'}
        from robinhood_workspace import READS
        field = next(v[1] for v in READS.values() if v[0] == name)
        return {field: []}

    def start(self, owner, host, callback_path='/api/robinhood/callback'):
        raise ValueError('Synthetic fixture: OAuth is not exercised here.')

    def disconnect(self, owner):
        self.sessions.pop(owner, None)

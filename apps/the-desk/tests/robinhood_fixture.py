"""Synthetic MCP transport boundary for tests. Never imported by production."""
import threading
import time
from datetime import datetime, timezone


class FakeBroker:
    def __init__(self, *args, auto=False, **kwargs):
        self.port = args[0] if args else 18886
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
        self.pairs = [{'id':'pair-btc','symbol':'BTC-USD','name':'Bitcoin','asset_currency':{'code':'BTC','name':'Bitcoin'},'display_only':False,'market_orders_only':False,'halted':False,'tradability':'tradable','tradability_by_account_type':{},'min_order_size':'0.00001','max_order_size':'100','min_order_price_increment':'0.01','min_order_quantity_increment':'0.00001','min_order_quote_amount':'1'}]
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
        if name == 'get_currency_pairs': return {'results':self.pairs,'next':''}
        if name == 'search': return {'results':[{'symbol':'AAPL','name':'SYNTHETIC Apple','instrument_id':'instrument-aapl'}]}
        if name == 'get_equity_tradability': return {'results':[{'symbol':s,'tradeable':True,'state':'active','account_type_tradabilities':[{'account_type':'individual','account_type_tradability':'tradable'}]} for s in args['symbols']]}
        if name == 'get_equity_quotes':
            stamp=datetime.fromtimestamp(self.clock()-self.quote_age,timezone.utc).isoformat()
            return {'results':[{'quote':{'symbol':args['symbols'][0],'state':'active','has_traded':True,'bid_price':self.bid,'ask_price':self.ask,'venue_bid_time':stamp,'venue_ask_time':stamp}}]}
        if name == 'get_equity_historicals':
            stamp=datetime.fromtimestamp(self.clock()-3600,timezone.utc).isoformat()
            return {'results':[{'symbol':args['symbols'][0],'bars':[{'begins_at':stamp,'open_price':'100','high_price':'101','low_price':'99','close_price':'100.5','volume':'12'}]}]}
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

    def preview(self,owner,payload):
        self.calls.append((owner,'NATIVE_PREVIEW',payload))
        return {'id':'synthetic-preview','blocked':False,'review':{'symbol':payload['symbol'],'side':payload['side'],'quantity':payload['quantity'],'limit_price':payload['limit_price'],'order_checks':{},'market_data_disclosure':'SYNTHETIC TEST FIXTURE · not live data'}}

    def disconnect(self, owner):
        self.sessions.pop(owner, None)

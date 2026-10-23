"""Account-scoped instrument discovery and chart data; no order placement.

Public exchange charts are references. They never change the Robinhood order
symbol or supply a broker execution quote. No aliases between different assets.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math
import re

MARKET_READS = {'get_currency_pairs', 'search', 'get_equity_tradability',
                'get_equity_quotes', 'get_equity_historicals'}


def symbol(value, crypto=False):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Z0-9.]{1,20}' + ('-USD' if crypto else ''), value):
        raise ValueError('Select an exact Robinhood symbol.')
    return value


def pair_asset(row, account):
    restriction = (row.get('tradability_by_account_type') or {}).get(account.get('brokerage_account_type'), row.get('tradability', 'unknown'))
    blocked = row.get('display_only') is not False or row.get('halted') is not False or restriction not in ('tradable', 'buy_only', 'sell_only')
    return {'kind': 'crypto', 'symbol': row['symbol'], 'id': row['id'],
            'name': (row.get('asset_currency') or {}).get('name') or row.get('name') or row['symbol'],
            'restriction': restriction, 'eligible': not blocked and bool(account.get('rhc_account_number')),
            'halted': row.get('halted'), 'haltedRegions': row.get('halted_regions') or [],
            'displayOnly': row.get('display_only'), 'marketOnly': row.get('market_orders_only'),
            'minQuantity': row.get('min_order_size'), 'maxQuantity': row.get('max_order_size'),
            'quantityStep': row.get('min_order_quantity_increment'), 'priceStep': row.get('min_order_price_increment'),
            'minNotional': row.get('min_order_quote_amount')}


class RobinhoodMarkets:
    def ticket_review(self, owner, payload):
        if not isinstance(payload,dict) or set(payload) != {'accountId','kind','symbol','side','quantity','dollarAmount','orderType','limitPrice','chartInstrument'}:
            raise ValueError('Provide the exact selected account, instrument and ticket sizing.')
        kind, ticker = payload['kind'], payload['symbol']
        symbol(ticker, kind == 'crypto')
        order_type=payload['orderType']
        if kind not in ('crypto','equity') or payload['side'] not in ('buy','sell'): raise ValueError('Select Buy or Sell for a stock or crypto pair.')
        if order_type not in (('market','limit') if kind=='crypto' else ('limit',)): raise ValueError('Robinhood chart tickets support crypto market or limit orders and equity limit orders.')
        def amount(key):
            value=payload[key]
            if not isinstance(value,str) or len(value)>40: raise ValueError('Enter a positive decimal '+key)
            try: n=Decimal(value)
            except InvalidOperation: raise ValueError('Invalid '+key) from None
            if not n.is_finite() or not Decimal('1e-18')<=n<=Decimal('1e12'): raise ValueError('Invalid '+key)
            return n
        if (payload['quantity'] is None)==(payload['dollarAmount'] is None): raise ValueError('Choose exactly one size: units or USD notional.')
        sizing='dollarAmount' if payload['dollarAmount'] is not None else 'quantity'
        size=amount(sizing)
        qty=size if sizing=='quantity' else None
        price=amount('limitPrice') if order_type=='limit' else None
        chart=payload['chartInstrument']
        expected = {'robinhood:'+ticker} if kind=='equity' else {'coinbase:'+ticker,'hyperliquid:'+ticker.removesuffix('-USD'),'robinhood:'+ticker}
        if chart not in expected: raise ValueError('The chart does not match the selected Robinhood asset.')
        with self.lock,self.broker.lock:
            mapped,_=self.raw_accounts(owner)
            if payload['accountId'] not in mapped: raise ValueError('Select a connected Robinhood account.')
            ephemeral,account=mapped[payload['accountId']]
            if account.get('agentic_allowed') is not True or account.get('state')!='active' or account.get('deactivated') or account.get('permanently_deactivated'):
                raise ValueError('This account is read only for this Desk connection.')
            if kind=='crypto':
                asset=next((a for a in self.crypto_catalog(owner,payload['accountId'])['assets'] if a['symbol']==ticker),None)
                if not asset or not asset['eligible'] or (order_type=='limit' and asset['marketOnly']): raise ValueError('Pair is restricted, halted, or unavailable for this order type.')
                if asset['restriction'] in ('buy_only','sell_only') and payload['side']!=asset['restriction'].split('_')[0]: raise ValueError('This side is restricted by Robinhood.')
                if qty is not None:
                    if order_type=='limit':
                        for key,value in [('quantityStep',qty),('priceStep',price)]:
                            try:
                                step=Decimal(asset[key]);aligned=step>0 and value%step==0
                            except (InvalidOperation,TypeError): aligned=False
                            if not aligned: raise ValueError('Ticket does not match Robinhood '+key+'.')
                    else:
                        try: aligned=qty%Decimal(asset['quantityStep'])==0
                        except (InvalidOperation,TypeError): aligned=False
                        if not aligned: raise ValueError('Quantity does not match Robinhood quantity step.')
                    if qty<Decimal(asset['minQuantity']) or qty>Decimal(asset['maxQuantity']): raise ValueError('Quantity is outside Robinhood pair limits.')
                    if order_type=='limit' and asset['minNotional'] is not None and qty*price<Decimal(asset['minNotional']): raise ValueError('Order is below Robinhood minimum notional.')
                elif size<Decimal(asset['minNotional'] or '0'): raise ValueError('Order is below Robinhood minimum notional.')
            else:
                if sizing!='quantity' or order_type!='limit': raise ValueError('Equity chart tickets currently support whole-share limit orders.')
                if qty!=qty.to_integral_value(): raise ValueError('Equity limit orders require whole shares.')
                asset=next((a for a in self.equity_search(owner,payload['accountId'],ticker)['assets'] if a['symbol']==ticker),None)
                if not asset or not asset['eligible'] or asset['halted']: raise ValueError('Stock is unavailable or halted for this account.')
                if asset['restriction']=='position_closing_only' and payload['side']!='sell': raise ValueError('This stock is closing only.')
            quote=self.broker_quote(owner,payload['accountId'],kind,ticker)
            try:
                ages=[self.clock()-datetime.fromisoformat(quote[k].replace('Z','+00:00')).timestamp() for k in ('bidTime','askTime')]
                valid=quote['bid'] and quote['ask'] and Decimal(quote['bid'])<=Decimal(quote['ask']) and all(0<=age<=15 for age in ages)
            except (ValueError,TypeError,AttributeError): valid=False
            if not valid: raise ValueError('A Robinhood bid and ask no older than 15 seconds are required. The reference chart is not an execution quote.')
            if not hasattr(self.broker,'preview'): raise ValueError('Broker preview transport unavailable.')
            preview={'accountId':ephemeral,'asset':kind,'symbol':ticker,'side':payload['side'],'type':order_type,'time_in_force':'gtc'}
            preview['dollar_amount' if sizing=='dollarAmount' else 'quantity']=str(size)
            if price is not None: preview['limit_price']=str(price)
            result=self.broker.preview(owner,preview)
            return {'accountId':payload['accountId'],'intent':payload,'brokerQuote':quote,'preview':result,
                    'liveEnabled':True,'disclosure':'Robinhood-native order preview. No order has been placed yet. Chart prices are reference only; Robinhood supplies execution checks and estimates. Confirm the exact account, asset, side and amount before placing.'}

    def crypto_catalog(self, owner, account_id):
        with self.lock, self.broker.lock:
            account = self.account(owner, account_id)
            rows, cursor, seen = {}, None, set()
            for _ in range(20):
                args = {'limit': 700, **({'cursor': cursor} if cursor else {})}
                data = self.read(owner, 'get_currency_pairs', args)
                if not isinstance(data.get('results'), list): raise ValueError('Crypto catalog unavailable.')
                for row in data['results']:
                    if isinstance(row, dict) and row.get('id') and re.fullmatch(r'[A-Z0-9.]{1,20}-USD', row.get('symbol', '')):
                        rows[row['id']] = pair_asset(row, account)
                cursor = data.get('next')
                if not cursor: break
                if not isinstance(cursor, str) or cursor in seen: raise ValueError('Crypto catalog pagination did not advance.')
                seen.add(cursor)
            else: raise ValueError('Crypto catalog pagination exceeded its bound; complete catalog not verified.')
            return {'accountId': account_id, 'assets': sorted(rows.values(), key=lambda x:x['symbol']),
                    'complete': True, 'scope': 'Robinhood supported USD crypto pairs; restrictions apply',
                    'observedAt': self.clock()}

    def equity_search(self, owner, account_id, query):
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 80: raise ValueError('Enter a ticker or company name.')
        with self.lock, self.broker.lock:
            account = self.account(owner, account_id)
            data = self.read(owner, 'search', {'query': query.strip(), 'asset_type':'instrument', 'limit':20})
            rows = data.get('results')
            if not isinstance(rows, list): raise ValueError('Equity search unavailable.')
            rows = [r for r in rows if isinstance(r, dict) and r.get('symbol') and r.get('instrument_id')]
            checks = {}
            for start in range(0, len(rows), 10):
                page = self.read(owner, 'get_equity_tradability', {'account_number':account['account_number'], 'symbols':[r['symbol'] for r in rows[start:start+10]]})
                for c in page.get('results') or []:
                    if isinstance(c, dict): checks[c.get('symbol')] = c
            assets = []
            for row in rows:
                c = checks.get(row['symbol'], {})
                types = c.get('account_type_tradabilities') or []
                matched = next((v.get('account_type_tradability') for v in types if v.get('account_type') == account.get('brokerage_account_type')), None)
                restriction = matched or ('unknown' if types else 'account type not supplied')
                eligible = c.get('tradeable') is True and c.get('state') == 'active' and (matched in ('tradable','position_closing_only') or not types)
                assets.append({'kind':'equity', 'symbol':row['symbol'], 'id':row['instrument_id'], 'name':row.get('name',row['symbol']),
                               'eligible':eligible, 'restriction':restriction, 'halted':bool(c.get('internal_halt_sessions')),
                               'tradability':c, 'priceStep':'0.01', 'quantityStep':'1'})
            return {'accountId':account_id, 'assets':assets, 'complete':False,
                    'scope':'Stocks and ETFs search results, checked for this account; not an exhaustive equity catalog', 'observedAt':self.clock()}

    def broker_quote(self, owner, account_id, kind, ticker):
        symbol(ticker, kind == 'crypto')
        if kind not in ('crypto','equity'): raise ValueError('Unsupported asset class.')
        with self.lock, self.broker.lock:
            account = self.account(owner, account_id)
            if kind == 'crypto':
                if not account.get('rhc_account_number') or not account.get('rhs_account_number'): raise ValueError('No linked crypto account.')
                data = self.read(owner, 'get_crypto_quotes', {'rhs_account_number':account['rhs_account_number'], 'symbols':[ticker], 'timezone':'America/Los_Angeles'})
                row = next((r for r in data.get('results') or [] if isinstance(r,dict) and r.get('symbol') == ticker.replace('-','')), {})
                stamp, bid_time, ask_time = row.get('updated_at'), row.get('bid_time'), row.get('ask_time')
            else:
                data = self.read(owner, 'get_equity_quotes', {'symbols':[ticker]})
                row = next((r.get('quote') for r in data.get('results') or [] if isinstance(r,dict) and isinstance(r.get('quote'),dict) and r['quote'].get('symbol') == ticker), {})
                if row.get('state')!='active' or row.get('has_traded') is not True:
                    raise ValueError('Equity is inactive, has never traded, or its quote state is unavailable.')
                bid_time, ask_time = row.get('venue_bid_time'), row.get('venue_ask_time')
                stamp = min(bid_time or '', ask_time or '') or None
            def price(k):
                try:
                    n = Decimal(row.get(k, '0'))
                    return str(n) if n.is_finite() and n > 0 else None
                except (InvalidOperation, TypeError): return None
            return {'accountId':account_id, 'kind':kind, 'symbol':ticker, 'bid':price('bid_price'), 'ask':price('ask_price'),
                    'updatedAt':stamp, 'bidTime':bid_time, 'askTime':ask_time, 'observedAt':self.clock(), 'source':'Robinhood MCP',
                    'disclosure':data.get('market_data_disclosure'), 'routing':row.get('routing')}

    def equity_bars(self, owner, account_id, ticker, timeframe, end=None, start=None, limit=600):
        symbol(ticker)
        intervals = {'1':('minute',60,60), '3':('minute',180,60), '5':('5minute',300,300), '15':('5minute',900,300), '30':('30minute',1800,1800), '60':('hour',3600,3600), '240':('4hour',14400,14400), 'D':('day',86400,86400)}
        if timeframe not in intervals: raise ValueError('Unsupported Robinhood chart timeframe.')
        interval, seconds, native_seconds = intervals[timeframe]
        try:
            end = min(float(end) / 1000, self.clock()) if end else self.clock()
            limit = min(1000, max(1,int(limit)))
            # Include prior regular sessions through weekends and holiday closures.
            start = float(start)/1000 if start else end-max(10*86400,seconds*limit*(4 if seconds<86400 else 2))
            if not math.isfinite(start) or not math.isfinite(end) or not 0 < end-start <= max(10*86400,seconds*10000): raise ValueError()
        except (ValueError,TypeError,OverflowError): raise ValueError('Invalid chart range.') from None
        iso = lambda t:datetime.fromtimestamp(t,timezone.utc).isoformat()
        with self.lock, self.broker.lock:
            self.account(owner, account_id)
            data = self.read(owner,'get_equity_historicals',{'symbols':[ticker], 'start_time':iso(start), 'end_time':iso(end), 'interval':interval,'bounds':'regular','adjustment_type':'split'})
            result = next((r for r in data.get('results') or [] if isinstance(r,dict) and r.get('symbol') == ticker), {})
            bars=[]
            for row in result.get('bars') or []:
                if row.get('interpolated'): continue
                try:
                    dt=datetime.fromisoformat(row['begins_at'].replace('Z','+00:00'))
                    if dt.tzinfo is None: continue
                    t=dt.timestamp()
                    values=[float(row[k+'_price']) for k in ('open','high','low','close')]
                    volume=float(row.get('volume') or 0)
                    if not all(math.isfinite(v) and v>0 for v in values) or not math.isfinite(volume) or volume<0 or not start<=t<=end: continue
                    if values[2]>min(values[0],values[3]) or values[1]<max(values[0],values[3]) or values[1]<values[2]: continue
                    bars.append(dict(zip(('time','open','high','low','close','volume'),(t*1000,*values,volume))))
                except (ValueError,KeyError,TypeError): continue
            bars=sorted({b['time']:b for b in bars}.values(),key=lambda b:b['time'])
            if native_seconds!=seconds:
                buckets={}
                for b in bars:
                    key=int(b['time']//(seconds*1000))*(seconds*1000)
                    buckets.setdefault(key,[]).append(b)
                aggregated=[]
                for key,rows in sorted(buckets.items()):
                    expected=seconds//native_seconds
                    if len(rows)!=expected or any(r['time']!=key+i*native_seconds*1000 for i,r in enumerate(rows)):continue
                    aggregated.append({'time':key,'open':rows[0]['open'],'high':max(r['high'] for r in rows),'low':min(r['low'] for r in rows),'close':rows[-1]['close'],'volume':sum(r['volume'] for r in rows)})
                bars=aggregated
            return {'bars':bars[-limit:], 'source':'Robinhood MCP · regular session · split adjusted', 'asOf':self.clock(), 'symbol':ticker}

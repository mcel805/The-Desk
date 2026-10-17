"""Read-only, local IBKR candles/quotes. Demo prices are entirely synthetic.

No account, position, order or execution methods are exposed. The paper engine
never receives these quotes. The official ibapi package is imported only when
Gateway mode has explicitly been enabled and its display-data gates confirmed.
"""
from __future__ import annotations

import math
import os
import re
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

CHICAGO = ZoneInfo('America/Chicago')
# First release deliberately supports intraday TRADES bars only.
INTERVALS = {'1m': (60, '1 min'), '3m': (180, '3 mins'), '5m': (300, '5 mins'),
             '15m': (900, '15 mins'), '30m': (1800, '30 mins'),
             '1h': (3600, '1 hour'), '4h': (14400, '4 hours')}
MODES = {1: 'REALTIME', 2: 'FROZEN', 3: 'DELAYED', 4: 'DELAYED_FROZEN'}
HISTORY_LIMIT = 600


class FeedUnavailable(RuntimeError):
    pass


def identity(month):
    if not re.fullmatch(r'\d{4}(03|06|09|12)', str(month)):
        raise ValueError('Choose an explicit MYM expiry in YYYYMM format (03, 06, 09 or 12).')
    return 'ibkr:MYM-' + month


def normalize_bar(bar):
    stamp = float(bar.date)
    if not math.isfinite(stamp) or stamp < 1_000_000_000 or stamp > 100_000_000_000:
        raise ValueError('IBKR intraday timestamp must be epoch seconds.')
    values = [float(getattr(bar, key)) for key in ('open', 'high', 'low', 'close', 'volume')]
    if not all(math.isfinite(x) for x in values) or min(values[:4]) <= 0 or values[4] < 0:
        raise ValueError('Invalid OHLCV values.')
    o, h, low, c, volume = values
    if low > min(o, c) or h < max(o, c) or h < low:
        raise ValueError('Invalid OHLC range.')
    return dict(zip(('time', 'open', 'high', 'low', 'close', 'volume'),
                    (int(stamp * 1000), o, h, low, c, volume)))


def session_anchor(stamp):
    """Synthetic bars use a 17:00 Chicago boundary; this is not a holiday calendar."""
    local = datetime.fromtimestamp(stamp, CHICAGO)
    day = local.date() - timedelta(days=local.hour < 17)
    return int(datetime(day.year, day.month, day.day, 17, tzinfo=CHICAGO).timestamp())


def demo_bar(stamp, seconds, now):
    # Deliberately invented levels. Never a recorded or inferred MYM price.
    n = stamp // seconds
    opening = 40000 + round(75 * math.sin(n / 13) + 26 * math.cos(n / 5))
    progress = min(seconds, max(1, int(now - stamp) + 1))
    base = n % (2 * math.pi)
    phase = progress / seconds * 3
    points = [base, base + phase] + [math.pi / 2 + k * math.pi for k in range(5)
                                   if base <= math.pi / 2 + k * math.pi <= base + phase]
    changes = [round(10 * (math.sin(x) - math.sin(base))) for x in points]
    close = opening + changes[1]
    return {'time': stamp * 1000, 'open': opening, 'high': opening + max(changes) + 4,
            'low': opening + min(changes) - 4, 'close': close,
            'volume': max(1, round((90 + n % 67) * progress / seconds))}


class IBKRData:
    def __init__(self, mode='off', env=None, clock=time.time, transport_factory=None):
        if mode not in ('off', 'demo', 'gateway'):
            raise ValueError('IBKR mode must be off, demo or gateway.')
        self.mode = mode
        self.env = dict(os.environ if env is None else env)
        self.clock = clock
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.changed = threading.Condition(self.lock)
        self.transport_factory = transport_factory or GatewayTransport
        self.transport = None
        self.history = {}
        self.history_ready = set()
        self.history_errors = {}
        self.history_seen = {}
        self.quote_values = {}
        self.quote_seen = {}
        self.data_type = None
        self.contract = None
        self.connected = False
        self.paused = False
        self.generation = 0
        self.message = 'IBKR is off. Open the IBKR panel for setup or synthetic demo instructions.'
        self.phase = 'off'
        self.instrument = None
        self.thread = None
        self.settings = {}
        if mode == 'demo':
            self.instrument = identity('202612')
            self.contract = {'instrument': self.instrument, 'symbol': 'MYM', 'expiry': '202612',
                             'exchange': 'CBOT', 'currency': 'USD', 'conId': None,
                             'tick': 1.0, 'multiplier': 0.5, 'synthetic': True}
            self.connected = True
            self.phase = 'demo'
            self.message = 'DEMO DATA · invented prices · no IBKR connection · read-only.'
        elif mode == 'gateway':
            self._configure()

    def _configure(self):
        try:
            self.instrument = identity(self.env.get('DESK_IBKR_CONTRACT_MONTH', ''))
            for key in ('DESK_IBKR_MARKET_DATA_CONFIRMED', 'DESK_IBKR_LOCAL_DISPLAY_CONFIRMED'):
                if self.env.get(key) != '1':
                    raise ValueError('Confirm market-data entitlement and local display rights before Gateway access.')
            host = self.env.get('DESK_IBKR_HOST', '127.0.0.1')
            if host not in ('127.0.0.1', 'localhost', '::1'):
                raise ValueError('IBKR Gateway must be on local loopback.')
            port = int(self.env.get('DESK_IBKR_PORT', '4002'))
            client_id = int(self.env.get('DESK_IBKR_CLIENT_ID', '47'))
            if not 1 <= port <= 65535 or not 0 <= client_id <= 2147483647:
                raise ValueError('Invalid IBKR port or client ID.')
            self.settings = {'host': host, 'port': port, 'client_id': client_id,
                             'month': self.env['DESK_IBKR_CONTRACT_MONTH']}
            self.phase = 'disconnected'
            self.message = 'Waiting for the authenticated local IB Gateway.'
        except ValueError as exc:
            self.phase = 'setup_required'
            self.message = str(exc) if str(exc).startswith(('Choose', 'Confirm', 'IBKR', 'Invalid')) else 'Invalid IBKR configuration.'

    def start(self):
        if self.mode == 'gateway' and self.settings and self.thread is None:
            self.thread = threading.Thread(target=self._run, name='desk-ibkr-data', daemon=True)
            self.thread.start()

    def close(self):
        self.stop.set()
        with self.lock:
            transport = self.transport
        if transport:
            transport.close()
        if self.thread:
            self.thread.join(timeout=3)

    def _run(self):
        backoff = 1
        while not self.stop.is_set():
            transport = self.transport_factory(self)
            with self.lock:
                self.transport = transport
                self.phase = 'connecting'
                self.message = 'Connecting to local IB Gateway; no orders are enabled.'
            try:
                transport.connect(self.settings)
                backoff = 1
                while not self.stop.wait(.5):
                    if not self.connected:
                        raise FeedUnavailable('Gateway disconnected.')
            except ImportError:
                self.disconnect('dependency_missing', 'Install the official IBKR TWS API Python package (ibapi).')
                return
            except Exception:
                if self.phase not in ('subscription_required', 'contract_error'):
                    self.disconnect('disconnected', 'IB Gateway unavailable. Check login, socket port and API settings.')
            finally:
                transport.close()
            if self.stop.wait(backoff):
                return
            backoff = min(30, backoff * 2)

    def accept_contract(self, contract):
        with self.lock:
            self.contract = dict(contract)
            self.connected = True
            self.generation += 1
            self.data_type = None
            self.quote_values.clear()
            self.quote_seen.clear()
            # Every connection must repopulate history. Never resume stale subscriptions.
            self.history.clear()
            self.history_ready.clear()
            self.history_errors.clear()
            self.history_seen.clear()
            self.phase = 'connected'
            self.message = 'Gateway connected; waiting for market-data confirmation.'
            self.changed.notify_all()

    def disconnect(self, phase='disconnected', message='IBKR disconnected; displayed history may be stale.'):
        with self.lock:
            self.connected = False
            self.data_type = None
            self.quote_values.clear()
            self.quote_seen.clear()
            self.phase, self.message = phase, message
            self.changed.notify_all()

    def set_data_type(self, value):
        with self.lock:
            self.data_type = MODES.get(value, 'UNKNOWN')

    def receive_quote(self, name, value):
        if name not in ('bid', 'ask', 'last') or not math.isfinite(float(value)) or float(value) <= 0:
            return
        with self.lock:
            self.quote_values[name] = float(value)
            self.quote_seen[name] = self.clock()

    def receive_bar(self, timeframe, bar):
        row = normalize_bar(bar)
        with self.lock:
            series = self.history.setdefault(timeframe, {})
            series[row['time']] = row
            if len(series) > HISTORY_LIMIT:
                for stamp in sorted(series)[:-HISTORY_LIMIT]:
                    del series[stamp]
            self.history_seen[timeframe] = self.clock()

    def history_end(self, timeframe):
        with self.lock:
            self.history_ready.add(timeframe)
            self.changed.notify_all()

    def history_error(self, timeframe, code):
        with self.lock:
            self.history_errors[timeframe] = 'IBKR history request failed (code %s).' % code
            self.changed.notify_all()

    def pause_demo(self, pause):
        if self.mode != 'demo' or type(pause) is not bool:
            raise ValueError('Demo controls are available only in explicit synthetic demo mode.')
        with self.lock:
            self.paused = pause
            self.connected = not pause
            self.phase = 'disconnected' if pause else 'demo'
            self.message = 'DEMO DATA · simulated disconnection.' if pause else 'DEMO DATA · synthetic feed resumed.'
            if not pause:
                self.generation += 1
            return self.status()

    def status(self):
        with self.lock:
            now = self.clock()
            mode = 'DEMO_DATA' if self.mode == 'demo' else self.data_type or 'UNKNOWN'
            values = dict(self.quote_values)
            age = max((max(0, now - self.quote_seen[x]) for x in ('bid', 'ask') if x in self.quote_seen), default=None)
            if self.mode == 'demo' and not self.paused:
                price = demo_bar(int(now // 60 * 60), 60, now)['close']
                values = {'bid': price - 1, 'ask': price + 1, 'last': price}
                age = 0
            valid = (self.connected and all(x in values for x in ('bid', 'ask')) and
                     values['bid'] <= values['ask'] and age is not None and age <= 15)
            quote = {**values, 'age': age, 'stale': not valid} if values else None
            return {'provider': 'IBKR simulator' if self.mode == 'demo' else 'IBKR TWS API',
                    'mode': mode, 'configured_mode': self.mode, 'phase': self.phase,
                    'message': self.message, 'connected': self.connected, 'generation': self.generation,
                    'read_only': True, 'orders_enabled': False, 'depth_available': False,
                    'instrument': self.instrument, 'contract': dict(self.contract) if self.contract else None,
                    'quote': quote, 'timeframes': list(INTERVALS), 'as_of': int(now * 1000),
                    'coverage': 'Recent bounded intraday history, up to 600 bars per interval. No full archive or holiday calendar.'}

    def bars(self, instrument, timeframe, limit=600, start=None, end=None, wait=8):
        if instrument != self.instrument or not self.instrument:
            raise ValueError('Unknown IBKR contract. Use the configured dated instrument.')
        if timeframe not in INTERVALS:
            raise ValueError('IBKR supports intraday intervals: ' + ', '.join(INTERVALS))
        if type(limit) is not int or not 1 <= limit <= HISTORY_LIMIT:
            raise ValueError('IBKR bar limit must be 1–600.')
        for value in (start, end):
            if value is not None and (not math.isfinite(float(value)) or float(value) < 0):
                raise ValueError('Invalid IBKR range timestamp.')
        if start is not None and end is not None and start > end:
            raise ValueError('IBKR range start must precede end.')
        seconds = INTERVALS[timeframe][0]
        with self.lock:
            now = self.clock()
            if self.mode == 'demo':
                if not self.paused:
                    anchor = session_anchor(now)
                    stamp = anchor + int((now - anchor) // seconds) * seconds
                    self.history[timeframe] = {b['time']: b for b in
                        (demo_bar(stamp - i * seconds, seconds, now) for i in range(HISTORY_LIMIT))}
                    self.history_seen[timeframe] = now
                rows = sorted(self.history.get(timeframe, {}).values(), key=lambda b: b['time'])
            else:
                if not self.connected or not self.transport:
                    raise FeedUnavailable(self.message)
                if timeframe not in self.history:
                    self.history[timeframe] = {}
                    try:
                        self.transport.request_history(timeframe)
                    except Exception:
                        self.history.pop(timeframe, None)
                        raise FeedUnavailable('Could not start IBKR history request.')
                deadline = time.monotonic() + wait
                generation = self.generation
                while timeframe not in self.history_ready and timeframe not in self.history_errors:
                    if not self.connected or self.generation != generation:
                        raise FeedUnavailable('IBKR disconnected during history load. Retry after reconnect.')
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise FeedUnavailable('IBKR history is still loading. Retry shortly.')
                    self.changed.wait(remaining)
                if timeframe in self.history_errors:
                    raise FeedUnavailable(self.history_errors[timeframe])
                rows = sorted(self.history[timeframe].values(), key=lambda b: b['time'])
            # Copy canonical rows. Requested ranges are inclusive of the bar open.
            rows = [dict(b) for b in rows if (start is None or b['time'] >= start) and
                    (end is None or b['time'] <= end)][-limit:]
            status = self.status()
            seen = self.history_seen.get(timeframe)
            status.update({'bars': rows, 'timeframe': timeframe,
                           'history_received_at': int(seen * 1000) if seen is not None else None,
                           'history_stale': not self.connected or seen is None or now - seen > 30,
                           'last_completed': next((b['time'] for b in reversed(rows)
                                                   if b['time'] + seconds * 1000 <= now * 1000), None)})
            return status


def api_types():
    from ibapi.client import EClient
    from ibapi.wrapper import EWrapper
    from ibapi.contract import Contract
    return EClient, EWrapper, Contract


class GatewayTransport:
    """Official ibapi callbacks; no orders/account methods in this adapter."""
    def __init__(self, feed):
        self.feed = feed
        self.app = None
        self.contract = None
        self.ready = threading.Event()
        self.resolved = threading.Event()
        self.details = []
        self.requests = {}
        self.api_thread = None
        self.closed = False
        self.failed = False

    def connect(self, settings):
        EClient, EWrapper, Contract = api_types()
        owner = self

        class App(EWrapper, EClient):
            def __init__(self):
                EClient.__init__(self, self)

            def nextValidId(self, orderId):
                if not owner.closed:
                    owner.ready.set()

            def contractDetails(self, reqId, details):
                if reqId == 1 and not owner.closed:
                    owner.details.append(details)

            def contractDetailsEnd(self, reqId):
                if reqId == 1 and not owner.closed:
                    owner.resolved.set()

            def marketDataType(self, reqId, marketDataType):
                if reqId == 2 and not owner.closed:
                    owner.feed.set_data_type(marketDataType)

            def tickPrice(self, reqId, tickType, price, attrib):
                # Delayed tick types must remain visibly delayed.
                if reqId == 2 and not owner.closed:
                    name = {1: 'bid', 2: 'ask', 4: 'last', 66: 'bid', 67: 'ask', 68: 'last'}.get(tickType)
                    if tickType in (66, 67, 68):
                        owner.feed.set_data_type(3)
                    if name:
                        owner.feed.receive_quote(name, price)

            def historicalData(self, reqId, bar):
                owner.bar(reqId, bar)

            def historicalDataUpdate(self, reqId, bar):
                owner.bar(reqId, bar)

            def historicalDataEnd(self, reqId, start, end):
                if reqId in owner.requests and not owner.closed:
                    owner.feed.history_end(owner.requests[reqId])

            def connectionClosed(self):
                if owner.closed:
                    return
                owner.failed = True
                owner.feed.disconnect()
                owner.ready.set()
                owner.resolved.set()

            def error(self, reqId, *args):
                # Supports legacy (code, text, ...) and current (time, code, text, ...) APIs.
                code = args[1] if len(args) >= 3 and isinstance(args[1], int) else args[0] if args else -1
                owner.error(reqId, code)

        self.app = App()
        self.app.connect(settings['host'], settings['port'], settings['client_id'])
        self.api_thread = threading.Thread(target=self.app.run, name='desk-ibapi', daemon=True)
        self.api_thread.start()
        if not self.ready.wait(10) or self.failed or self.closed:
            raise FeedUnavailable('Gateway API handshake failed.')
        requested = Contract()
        requested.symbol = 'MYM'
        requested.secType = 'FUT'
        requested.exchange = 'CBOT'
        requested.currency = 'USD'
        requested.lastTradeDateOrContractMonth = settings['month']
        self.app.reqContractDetails(1, requested)
        if not self.resolved.wait(10) or self.failed or self.closed:
            raise FeedUnavailable('Contract resolution failed.')
        matches = [d for d in self.details if d.contract.symbol == 'MYM' and
                   d.contract.secType == 'FUT' and d.contract.currency == 'USD' and
                   str(d.contract.lastTradeDateOrContractMonth)[:6] == settings['month']]
        if len(matches) != 1:
            self.feed.disconnect('contract_error', 'IBKR must resolve exactly one dated MYM futures contract.')
            raise FeedUnavailable('Ambiguous or missing contract.')
        details = matches[0]
        contract = details.contract
        if (contract.conId <= 0 or not math.isfinite(float(details.minTick)) or
                float(details.minTick) <= 0 or float(contract.multiplier) != .5):
            raise FeedUnavailable('Invalid MYM contract metadata.')
        self.contract = contract
        self.feed.accept_contract({'instrument': self.feed.instrument, 'symbol': 'MYM',
            'expiry': settings['month'], 'exchange': contract.exchange, 'currency': contract.currency,
            'conId': contract.conId, 'tick': float(details.minTick), 'multiplier': float(contract.multiplier),
            'synthetic': False})
        self.app.reqMarketDataType(1)
        self.app.reqMktData(2, contract, '', False, False, [])

    def request_history(self, timeframe):
        req_id = 100 + list(INTERVALS).index(timeframe)
        self.requests[req_id] = timeframe
        seconds, bar_size = INTERVALS[timeframe]
        duration = str(max(1, math.ceil(seconds * HISTORY_LIMIT * 1.6 / 86400))) + ' D'
        self.app.reqHistoricalData(req_id, self.contract, '', duration, bar_size, 'TRADES', 0, 2, True, [])

    def bar(self, req_id, bar):
        if req_id not in self.requests or self.closed:
            return
        try:
            self.feed.receive_bar(self.requests[req_id], bar)
        except (ValueError, TypeError, AttributeError, OverflowError):
            self.feed.history_error(self.requests[req_id], 'invalid_bar')

    def error(self, req_id, code):
        if self.closed:
            return
        if code in (2104, 2106, 2107, 2108, 2158):
            return
        if req_id in self.requests:
            self.feed.history_error(self.requests[req_id], code)
        if code in (354, 10089, 10090, 10091, 10197):
            self.feed.disconnect('subscription_required', 'IBKR data entitlement or competing session requires attention (code %s).' % code)
            self.failed = True
            self.ready.set()
            self.resolved.set()
        elif code in (502, 504, 1100, 1300) or req_id == 1:
            self.failed = True
            self.feed.disconnect()
            self.ready.set()
            self.resolved.set()

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.feed.transport is self:
            self.feed.disconnect(self.feed.phase, self.feed.message)
        self.ready.set()
        self.resolved.set()
        if self.app:
            for req_id in list(self.requests):
                try:
                    self.app.cancelHistoricalData(req_id)
                except Exception:
                    pass
            try:
                self.app.cancelMktData(2)
                self.app.disconnect()
            except Exception:
                pass
        if self.api_thread and self.api_thread is not threading.current_thread():
            self.api_thread.join(timeout=2)

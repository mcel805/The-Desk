"""Local-profile Robinhood reads and durable, deterministic shadow-agent runs.

This service never invokes a broker write or order preview. OAuth credentials
remain in memory. Cached reads/configurations are private local SQLite records.
The signed HttpOnly profile cookie is local app identity, not broker consent.
"""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import uuid

COOKIE = 'desk_robinhood_profile'
PREFIX = '/api/robinhood/workspace'
PROFILE_TTL = 30 * 86400
# name -> tool, list field, routing identifier. None means a singleton response.
READS = {
    'portfolio': ('get_portfolio', None, 'account_number'),
    'equity_positions': ('get_equity_positions', 'positions', 'account_number'),
    'option_positions': ('get_option_positions', 'positions', 'account_number'),
    'crypto_positions': ('get_crypto_positions', 'results', 'rhs_account_number'),
    'equity_orders': ('get_equity_orders', 'orders', 'account_number'),
    'option_orders': ('get_option_orders', 'orders', 'account_number'),
    'crypto_orders': ('get_crypto_orders', 'results', 'rhs_account_number'),
    'advanced_orders': ('get_advanced_orders', 'advanced_orders', 'account_number'),
    'realized_pnl': ('get_realized_pnl', None, 'rhs_account_number'),
    'pnl_trades': ('get_pnl_trade_history', 'trades', 'rhs_account_number'),
    'approvals': ('get_trade_approvals', 'approvals', 'account_number'),
    'approval_setting': ('get_trade_approval_setting', None, 'account_number'),
}
ALLOWED_TOOLS = {v[0] for v in READS.values()} | {'get_accounts', 'get_crypto_quotes'}


def positive(value, label):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError(f'{label} must be a positive decimal string.')
    try:
        n = Decimal(value)
    except InvalidOperation:
        raise ValueError(f'Invalid {label}.') from None
    if not n.is_finite() or n < Decimal('0.000000000000000001') or n > Decimal('1000000000000'):
        raise ValueError(f'Invalid {label}.')
    return n


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Missing source timestamp.')
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('Source timestamp needs a timezone.')
    return dt.timestamp()


def validate_config(payload):
    if not isinstance(payload, dict) or set(payload) - {
        'id', 'expectedRevision', 'accountId', 'name', 'mode', 'strategy',
        'symbols', 'maxOrderUSD', 'maxQuoteAgeSeconds', 'maxSpreadBps', 'notes'
    }:
        raise ValueError('Unsupported agent configuration fields.')
    if payload.get('mode') not in ('observe', 'shadow'):
        raise ValueError('Only observe and shadow modes are available. Live execution is disarmed.')
    if payload.get('strategy') != 'chart-ticket-v1':
        raise ValueError('Select the chart-ticket-v1 shadow strategy.')
    name = payload.get('name', '')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        raise ValueError('Agent name must contain 1–80 characters.')
    symbols = payload.get('symbols')
    if not isinstance(symbols, list) or not 1 <= len(symbols) <= 30:
        raise ValueError('Choose 1–30 explicit crypto pair symbols.')
    if any(not isinstance(s, str) or not re.fullmatch(r'[A-Z0-9]{2,15}-USD', s) for s in symbols):
        raise ValueError('Use explicit USD spot pairs such as BTC-USD.')
    cap = positive(payload.get('maxOrderUSD'), 'maximum order notional')
    age = payload.get('maxQuoteAgeSeconds')
    spread = payload.get('maxSpreadBps')
    if type(age) is not int or not 1 <= age <= 60:
        raise ValueError('Quote-age limit must be an integer from 1 to 60 seconds.')
    if type(spread) is not int or not 1 <= spread <= 500:
        raise ValueError('Spread limit must be an integer from 1 to 500 basis points.')
    notes = payload.get('notes', '')
    if not isinstance(notes, str) or len(notes) > 2000:
        raise ValueError('Strategy notes are limited to 2,000 characters.')
    return {'name': name.strip(), 'accountId': payload.get('accountId'), 'mode': payload['mode'],
            'strategy': 'chart-ticket-v1', 'symbols': sorted(set(symbols)), 'maxOrderUSD': str(cap),
            'maxQuoteAgeSeconds': age, 'maxSpreadBps': spread, 'notes': notes,
            'executionState': 'DISARMED', 'runtime': 'deterministic-shadow-policy', 'liveEnabled': False}


class RobinhoodWorkspace:
    def __init__(self, broker, root, clock=time.time):
        self.broker = broker
        self.cookie_name = f'{COOKIE}_{broker.port}'
        self.clock = clock
        self.lock = threading.RLock()
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        secret_path = self.root / 'robinhood-profile.key'
        try:
            fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, 'wb') as out:
                out.write(secrets.token_bytes(32))
        self.secret = secret_path.read_bytes()
        if len(self.secret) != 32:
            raise ValueError('Invalid private Robinhood profile key.')
        self.path = self.root / 'robinhood-workspace.sqlite3'
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS snapshots (
                    owner TEXT, account TEXT, source TEXT, payload TEXT, cursor TEXT,
                    pages INTEGER, observed REAL, status TEXT, PRIMARY KEY(owner,account,source));
                CREATE TABLE IF NOT EXISTS agents (
                    owner TEXT, id TEXT, revision INTEGER, payload TEXT, paused INTEGER,
                    updated REAL, PRIMARY KEY(owner,id));
                CREATE TABLE IF NOT EXISTS agent_revisions (
                    owner TEXT, id TEXT, revision INTEGER, payload TEXT, updated REAL,
                    PRIMARY KEY(owner,id,revision));
                CREATE TABLE IF NOT EXISTS runs (
                    owner TEXT, request_id TEXT, fingerprint TEXT, payload TEXT, created REAL,
                    PRIMARY KEY(owner,request_id));
            ''')
            db.execute('UPDATE agents SET paused=1')
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        with sqlite3.connect(self.path, timeout=10) as db:
            db.row_factory = sqlite3.Row
            yield db

    def sign(self, value):
        return hmac.new(self.secret, value.encode(), hashlib.sha256).hexdigest()

    def profile(self, cookie):
        if not isinstance(cookie, str) or len(cookie) > 220:
            return None
        parts = cookie.split('.')
        if len(parts) != 3 or not parts[1].isdigit():
            return None
        token, issued, signature = parts
        if not re.fullmatch(r'[a-zA-Z0-9_-]{43}', token):
            return None
        if not hmac.compare_digest(self.sign(token + '.' + issued), signature):
            return None
        age = self.clock() - int(issued)
        if age < 0 or age >= PROFILE_TTL:
            return None
        return 'desk-profile:' + hashlib.sha256(token.encode()).hexdigest()

    def new_profile(self):
        value = secrets.token_urlsafe(32) + '.' + str(int(self.clock()))
        return value + '.' + self.sign(value)

    def raw_accounts(self, owner):
        status = self.broker.status(owner)
        if not status.get('connected'):
            return {}, status
        mapped = {}
        for ephemeral, account in self.broker.sessions[owner]['accounts'].items():
            stable = self.sign('account:' + str(account['account_number']))[:32]
            mapped[stable] = (ephemeral, account)
        return mapped, status

    def status(self, owner):
        with self.lock, self.broker.lock:
            mapped, status = self.raw_accounts(owner)
            public = []
            for stable, (ephemeral, raw) in mapped.items():
                a = next(a for a in status['accounts'] if a['id'] == ephemeral)
                public.append({**a, 'id': stable, 'state': raw.get('state'),
                               'optionsLevel': raw.get('user_option_level', raw.get('option_level')) or 'none',
                               'managementType': raw.get('management_type'),
                               'deactivated': raw.get('deactivated') is True})
            tools = sorted(set(self.broker.sessions.get(owner, {}).get('tools', {})) & ALLOWED_TOOLS)
            return {'connected': bool(mapped), 'accounts': public, 'readTools': tools,
                    'liveEnabled': False, 'mode': 'shadow', 'futures': False,
                    'observedAt': self.clock(), 'credentialPersistence': 'memory-only',
                    'profileLifetimeDays': 30}

    def account(self, owner, account_id):
        mapped, _ = self.raw_accounts(owner)
        if account_id not in mapped:
            raise ValueError('Select an account from this Robinhood connection.')
        return mapped[account_id][1]

    def read(self, owner, tool, args):
        if tool not in ALLOWED_TOOLS:
            raise ValueError('Only allowlisted account reads are available in this workspace.')
        value = self.broker.call(owner, tool, args)
        if not isinstance(value, dict):
            raise ValueError('Robinhood returned an unsupported read response.')
        return value

    def redact(self, owner, value):
        # Include every known account in this grant, not only the selected one.
        identifiers = set()
        for a in self.broker.sessions.get(owner, {}).get('accounts', {}).values():
            for field in ('account_number', 'rhs_account_number', 'rhc_account_number'):
                number = a.get(field)
                if number: identifiers.add(str(number))
        def walk(item, key=''):
            if isinstance(item, dict): return {k: walk(v, k) for k, v in item.items()}
            if isinstance(item, list): return [walk(v, key) for v in item]
            if isinstance(item, str):
                for number in sorted(identifiers, key=len, reverse=True):
                    if item == number or 'account' in key.lower() or '/' in item:
                        item = item.replace(number, '••••' + number[-4:])
            return item
        return walk(value)

    def snapshot(self, owner, account_id):
        with self.db() as db:
            rows = db.execute('SELECT * FROM snapshots WHERE owner=? AND account=?', (owner, account_id)).fetchall()
        return {'accountId': account_id, 'sources': {r['source']: {
            'data': json.loads(r['payload']), 'pages': r['pages'], 'observedAt': r['observed'],
            'status': r['status'], 'hasMore': bool(r['cursor']),
            'ageSeconds': max(0, self.clock() - r['observed'])} for r in rows}, 'liveEnabled': False}

    def sync(self, owner, account_id, sources, more=False):
        if not isinstance(sources, list) or not sources or len(sources) > len(READS) or any(s not in READS for s in sources):
            raise ValueError('Select supported account data sources.')
        if type(more) is not bool:
            raise ValueError('Invalid pagination request.')
        with self.lock, self.broker.lock:
            account = self.account(owner, account_id)
            available = self.broker.sessions[owner]['tools']
            for source in dict.fromkeys(sources):
                tool, list_field, identifier = READS[source]
                with self.db() as db:
                    previous = db.execute('SELECT * FROM snapshots WHERE owner=? AND account=? AND source=?', (owner, account_id, source)).fetchone()
                cursor = previous['cursor'] if more and previous else None
                if more and (not list_field or not previous or not cursor):
                    continue
                payload = json.loads(previous['payload']) if previous else None
                pages = previous['pages'] if more and previous else 0
                observed = previous['observed'] if previous else 0
                status = 'unavailable'
                next_cursor = cursor
                if tool in available and account.get(identifier) and not (source.startswith('crypto_') and not account.get('rhc_account_number')) and not (source in ('approval_setting', 'approvals') and account.get('agentic_allowed') is not True):
                    args = {('account_number' if identifier == 'rhs_account_number' and source in ('realized_pnl', 'pnl_trades') else identifier): account[identifier]}
                    if source == 'option_positions': args['nonzero'] = True
                    if source == 'realized_pnl': args.update(span='month', timezone='America/Los_Angeles')
                    if source == 'pnl_trades': args['span'] = 'month'
                    if cursor: args['cursor'] = cursor
                    try:
                        data = self.read(owner, tool, args)
                        if list_field and (list_field not in data or not isinstance(data[list_field], list)):
                            raise ValueError('Malformed collection response.')
                        if source == 'portfolio' and ('buying_power' not in data or (data['buying_power'] is not None and not isinstance(data['buying_power'], dict))):
                            raise ValueError('Malformed portfolio buying-power field.')
                        if source == 'approval_setting' and type(data.get('setting', {}).get('human_must_approve_trades')) is not bool:
                            raise ValueError('Missing approval setting.')
                        next_cursor = data.get('next_cursor') or data.get('next') or ''
                        if not isinstance(next_cursor, str) or len(next_cursor) > 10000 or (cursor and next_cursor == cursor):
                            raise ValueError('Invalid or repeated pagination cursor.')
                        data = {k: v for k, v in data.items() if k not in ('next', 'next_cursor', 'previous')}
                        data = self.redact(owner, data)
                        if more and list_field and payload:
                            # Deduplicate only stable broker identities. P&L rows have
                            # no ID: identical exposed fields can represent distinct trades.
                            seen = set()
                            combined = []
                            for row in payload[list_field] + data[list_field]:
                                identity = canonical(row['id']) if isinstance(row, dict) and row.get('id') else None
                                if identity is None or identity not in seen:
                                    combined.append(row)
                                    if identity is not None: seen.add(identity)
                            data[list_field] = combined
                        payload = data
                        pages += 1
                        observed = self.clock()
                        status = 'partial' if next_cursor else 'complete'
                        if len(canonical(payload)) > 2_000_000:
                            raise ValueError('Snapshot size limit reached.')
                    except Exception:
                        # Do not leak provider errors, tokens, URLs, or private account identifiers.
                        payload = json.loads(previous['payload']) if previous else None
                        observed = previous['observed'] if previous else 0
                        pages = previous['pages'] if previous else 0
                        next_cursor = previous['cursor'] if previous else ''
                        status = 'error'
                with self.db() as db:
                    db.execute('INSERT OR REPLACE INTO snapshots VALUES(?,?,?,?,?,?,?,?)',
                               (owner, account_id, source, canonical(payload), next_cursor or '', pages, observed, status))
            return self.snapshot(owner, account_id)

    def agents(self, owner):
        with self.db() as db:
            rows = db.execute('SELECT * FROM agents WHERE owner=? ORDER BY updated DESC', (owner,)).fetchall()
        return [{**json.loads(r['payload']), 'id': r['id'], 'revision': r['revision'],
                 'paused': bool(r['paused']), 'updatedAt': r['updated']} for r in rows]

    def save_agent(self, owner, payload):
        config = validate_config(payload)
        with self.lock, self.broker.lock:
            account = self.account(owner, config['accountId'])
            if account.get('agentic_allowed') is not True or account.get('state') != 'active' or account.get('deactivated') or account.get('permanently_deactivated'):
                raise ValueError('Bind the shadow agent to an eligible active MCP account.')
            agent_id = payload.get('id') or str(uuid.uuid4())
            if not isinstance(agent_id, str) or not re.fullmatch(r'[a-f0-9-]{36}', agent_id):
                raise ValueError('Invalid agent identity.')
            expected = payload.get('expectedRevision', 0)
            if type(expected) is not int:
                raise ValueError('Invalid configuration revision.')
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT * FROM agents WHERE owner=? AND id=?', (owner, agent_id)).fetchone()
                if expected != (row['revision'] if row else 0):
                    raise ValueError('Configuration changed. Reload before saving.')
                if not row and db.execute('SELECT count(*) FROM agents WHERE owner=?', (owner,)).fetchone()[0] >= 30:
                    raise ValueError('At most 30 local shadow agents are supported.')
                revision = expected + 1
                now = self.clock()
                db.execute('INSERT OR REPLACE INTO agents VALUES(?,?,?,?,?,?)', (owner, agent_id, revision, canonical(config), 1, now))
                db.execute('INSERT INTO agent_revisions VALUES(?,?,?,?,?)', (owner, agent_id, revision, canonical(config), now))
            return next(a for a in self.agents(owner) if a['id'] == agent_id)

    def pause(self, owner, agent_id, paused):
        if type(paused) is not bool:
            raise ValueError('Choose a shadow-agent pause state.')
        with self.lock, self.db() as db:
            row = db.execute('SELECT * FROM agents WHERE owner=? AND id=?', (owner, agent_id)).fetchone()
            if not row:
                raise ValueError('Unknown shadow agent.')
            # Resuming allows only explicit shadow evaluations, never broker actions.
            db.execute('UPDATE agents SET paused=?,updated=? WHERE owner=? AND id=?', (int(paused), self.clock(), owner, agent_id))
        return {'id': agent_id, 'paused': paused, 'liveEnabled': False}

    def runs(self, owner):
        with self.db() as db:
            rows = db.execute('SELECT payload FROM runs WHERE owner=? ORDER BY created DESC LIMIT 100', (owner,)).fetchall()
        return [json.loads(r['payload']) for r in rows]

    def evaluate(self, owner, payload):
        if not isinstance(payload, dict) or set(payload) != {'requestId', 'agentId', 'revision', 'intent'}:
            raise ValueError('Provide a versioned shadow evaluation request.')
        request_id = payload['requestId']
        if type(payload['revision']) is not int or payload['revision'] < 1:
            raise ValueError('Provide the exact saved configuration revision.')
        if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,80}', request_id):
            raise ValueError('Use a stable logical request ID for this shadow intent.')
        fingerprint = hashlib.sha256(canonical(payload).encode()).hexdigest()
        with self.lock, self.broker.lock:
            with self.db() as db:
                old = db.execute('SELECT * FROM runs WHERE owner=? AND request_id=?', (owner, request_id)).fetchone()
            if old:
                if old['fingerprint'] != fingerprint:
                    raise ValueError('Request ID already belongs to a different intent.')
                return json.loads(old['payload'])
            agent = next((a for a in self.agents(owner) if a['id'] == payload['agentId']), None)
            if not agent or payload['revision'] != agent['revision']:
                raise ValueError('Reload the current agent configuration before evaluation.')
            intent = payload['intent']
            required = {'chartInstrument', 'timeframe', 'completedBarCutoff', 'chartObservedAt', 'replay', 'side', 'kind', 'quantity', 'limitPrice', 'stopPrice', 'targetPrice', 'paperAccountId'}
            if not isinstance(intent, dict) or set(intent) != required:
                raise ValueError('Provide the exact chart ticket and its provenance.')
            if not isinstance(intent['chartInstrument'], str) or len(intent['chartInstrument']) > 80 or not isinstance(intent['timeframe'], str) or len(intent['timeframe']) > 20:
                raise ValueError('Invalid chart identity.')
            if not isinstance(intent['paperAccountId'], str) or len(intent['paperAccountId']) > 80:
                raise ValueError('Invalid source paper account.')
            qty = positive(intent['quantity'], 'quantity')
            price = positive(intent['limitPrice'], 'limit price')
            for field in ('stopPrice', 'targetPrice'):
                if intent[field] is not None: positive(intent[field], field)
            if intent['side'] not in ('buy', 'sell') or intent['kind'] != 'limit' or type(intent['replay']) is not bool:
                raise ValueError('Shadow evaluation currently supports exact buy/sell limit tickets.')
            reasons = []
            if agent['paused']: reasons.append('Agent is paused. Resume shadow evaluation in Agent Studio.')
            if agent['mode'] != 'shadow': reasons.append('Agent is in observe mode.')
            if intent['replay']: reasons.append('Chart replay cannot create a broker shadow intent.')
            # This version handles Coinbase USD spot charts only. Perpetuals/futures are never remapped to spot.
            symbol = intent['chartInstrument'].removeprefix('coinbase:')
            if not intent['chartInstrument'].startswith('coinbase:') or symbol not in agent['symbols']:
                reasons.append('Chart must be an explicitly allowed Coinbase USD spot pair; futures/perpetuals are unsupported.')
            now = self.clock()
            try:
                chart_age = now - timestamp(intent['chartObservedAt'])
                cutoff = timestamp(intent['completedBarCutoff'])
                if not 0 <= chart_age <= agent['maxQuoteAgeSeconds'] or cutoff > now:
                    raise ValueError('Stale or future chart context.')
            except (ValueError, TypeError, OverflowError):
                reasons.append('A fresh chart observation and completed-bar cutoff are required.')
            with localcontext() as context:
                context.prec = 100
                notional = qty * price
            if notional > Decimal(agent['maxOrderUSD']): reasons.append('Order exceeds the configured shadow notional limit.')
            quote = None
            if not reasons:
                try:
                    account = self.account(owner, agent['accountId'])
                    if account.get('agentic_allowed') is not True or account.get('state') != 'active' or account.get('deactivated') or account.get('permanently_deactivated') or not account.get('rhc_account_number'):
                        raise ValueError('Account not eligible.')
                    data = self.read(owner, 'get_crypto_quotes', {'rhs_account_number': account['rhs_account_number'], 'symbols': [symbol], 'timezone': 'America/Los_Angeles'})
                    q = next(q for q in data['results'] if isinstance(q, dict) and q.get('symbol') == symbol.replace('-', ''))
                    bid = positive(q.get('bid_price'), 'broker bid')
                    ask = positive(q.get('ask_price'), 'broker ask')
                    ages = [self.clock() - timestamp(q.get(k)) for k in ('updated_at', 'bid_time', 'ask_time')]
                    if bid > ask or any(age < 0 or age > agent['maxQuoteAgeSeconds'] for age in ages):
                        raise ValueError('Invalid or stale broker quote.')
                    spread = (ask - bid) / ((ask + bid) / 2) * 10000
                    quote = {'symbol': symbol, 'instrumentId': q.get('id'), 'bid': str(bid), 'ask': str(ask), 'updatedAt': q['updated_at'], 'bidTime': q['bid_time'], 'askTime': q['ask_time'], 'routing': q.get('routing'), 'spreadBps': str(spread), 'source': 'Robinhood get_crypto_quotes'}
                    if spread > agent['maxSpreadBps']: reasons.append('Broker spread exceeds the configured limit.')
                    p = self.read(owner, 'get_portfolio', {'account_number': account['account_number']})
                    bp = Decimal(p['crypto_buying_power']['buying_power'])
                    if not bp.is_finite() or bp < 0: raise ValueError('Invalid buying power.')
                    if intent['side'] == 'buy' and notional > bp: reasons.append('Order exceeds broker crypto buying power.')
                    if intent['side'] == 'sell':
                        reasons.append('Sell-side available-quantity reconciliation is not yet verified; observe only.')
                except Exception:
                    reasons.append('Fresh broker quote/account checks unavailable; shadow decision denied.')
            result = {'id': str(uuid.uuid4()), 'requestId': request_id, 'agentId': agent['id'],
                      'agentName': agent['name'], 'revision': agent['revision'], 'strategy': agent['strategy'],
                      'accountId': agent['accountId'], 'createdAt': self.clock(), 'mode': 'shadow',
                      'decision': 'blocked' if reasons else 'shadow_eligible', 'reasons': reasons,
                      'intent': intent, 'notionalUSD': str(notional), 'brokerQuote': quote,
                      'liveEnabled': False, 'brokerOrderId': None, 'fills': [],
                      'disclosure': 'A shadow policy decision, not a broker preview, order, reservation, fill, or trading eligibility guarantee.'}
            with self.db() as db:
                db.execute('INSERT INTO runs VALUES(?,?,?,?,?)', (owner, request_id, fingerprint, canonical(result), self.clock()))
            return result

    def disconnect(self, owner):
        with self.lock:
            self.broker.disconnect(owner)
            with self.db() as db:
                db.execute('UPDATE agents SET paused=1 WHERE owner=?', (owner,))
        return {'connected': False, 'liveEnabled': False}

    def cookie(self, handler):
        try:
            cookies = SimpleCookie(); cookies.load(handler.headers.get('Cookie', ''))
            return cookies[self.cookie_name].value if self.cookie_name in cookies else None
        except CookieError:
            return None

    def owner(self, handler):
        owner = self.profile(self.cookie(handler))
        if not owner:
            raise ValueError('Open the Robinhood workspace to create a local Desk profile.')
        return owner

    def get(self, handler, path, query):
        if not path.startswith(PREFIX): return False
        owner = self.owner(handler)
        if path == PREFIX + '/callback':
            get = lambda key: query.get(key, [''])[0]
            self.broker.callback(owner, get('state'), get('code'), get('iss'))
            # A newly connected/reconnected workspace never silently resumes a shadow agent.
            with self.db() as db: db.execute('UPDATE agents SET paused=1 WHERE owner=?', (owner,))
            handler.send_response(303); handler.send_header('Location', '/?robinhood=connected'); handler.end_headers()
            return True
        if path == PREFIX + '/status': handler.json(self.status(owner)); return True
        if path == PREFIX + '/snapshot': handler.json(self.snapshot(owner, query.get('accountId', [''])[0])); return True
        if path == PREFIX + '/agents': handler.json({'agents': self.agents(owner)}); return True
        if path == PREFIX + '/runs': handler.json({'runs': self.runs(owner)}); return True
        handler.json({'error': 'Unknown Robinhood workspace read.'}, 404); return True

    def post(self, handler, path, payload):
        if not path.startswith(PREFIX): return False
        if handler.headers.get('Origin') != 'http://' + handler.headers.get('Host', ''):
            handler.json({'error': 'Exact same-origin workspace request required.'}, 403); return True
        if not isinstance(payload, dict): raise ValueError('JSON object required.')
        if path == PREFIX + '/session':
            token = self.cookie(handler)
            if not self.profile(token): token = self.new_profile()
            handler.broker_cookie = f'{self.cookie_name}={token}; Path={PREFIX}; HttpOnly; SameSite=Lax; Max-Age={PROFILE_TTL}'
            handler.json({'localProfile': True, 'liveEnabled': False}); return True
        owner = self.owner(handler)
        if path == PREFIX + '/connect':
            handler.json(self.broker.start(owner, handler.headers.get('Host'), PREFIX + '/callback')); return True
        if path == PREFIX + '/disconnect': handler.json(self.disconnect(owner)); return True
        if path == PREFIX + '/sync': handler.json(self.sync(owner, payload.get('accountId'), payload.get('sources'), payload.get('more', False))); return True
        if path == PREFIX + '/agents/save': handler.json(self.save_agent(owner, payload)); return True
        if path == PREFIX + '/agents/pause': handler.json(self.pause(owner, payload.get('id'), payload.get('paused'))); return True
        if path == PREFIX + '/evaluate': handler.json(self.evaluate(owner, payload)); return True
        handler.json({'error': 'Unsupported action. Live order routing is unavailable.'}, 404); return True

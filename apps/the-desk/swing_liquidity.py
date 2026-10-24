"""Causal liquidity campaigns and independent shadow comparisons. No order API.

Automatic HTF levels are explicitly labeled confirmed pivot references, not a
port of Agentic Liquidity or proof of resting orders. Manual references are
timestamped by the service. A reference cannot own a contact before observation.
"""
from copy import deepcopy
import hashlib
import json
import math
from swing_tracker import valid_bar

VERSION = 'liquidity-swing-study.1'
FRAME_MS = {'1d': 86400000, '4h': 14400000, '1h': 3600000}
DEFAULTS = {
    'study_enabled': True, 'study_playbook': 'both', 'manual_bias': 'neutral',
    'allow_long': True, 'allow_short': True, 'study_window': 5,
    'study_touch_ticks': 2, 'study_horizon': 120, 'study_jev_min': .65,
    'study_cost_bps': None, 'study_levels': [], 'study_phase': 'development',
}
VARIANTS = ('touch_only', 'tracker', 'tracker_jev')


def finite(v):
    return type(v) in (int, float) and math.isfinite(v)


def identity(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def validate_settings(config):
    c = {k: deepcopy(config.get(k, v)) for k, v in DEFAULTS.items()}
    for k in ('study_enabled', 'allow_long', 'allow_short'):
        if type(c[k]) is not bool:
            raise ValueError('Invalid ' + k)
    if c['study_playbook'] not in ('both', 'reversal', 'continuation') or c['manual_bias'] not in ('long', 'short', 'neutral'):
        raise ValueError('Choose a study playbook and manual bias')
    if c['study_phase'] not in ('development','forward_validation'):
        raise ValueError('Choose development or forward validation')
    for k, low, high in (('study_window', 3, 30), ('study_touch_ticks', 0, 50), ('study_horizon', 3, 500)):
        if type(c[k]) is not int or not low <= c[k] <= high:
            raise ValueError('Invalid ' + k)
    if not finite(c['study_jev_min']) or not .5 <= c['study_jev_min'] <= 1:
        raise ValueError('Jev contextual-fit threshold must be 0.5–1')
    if c['study_cost_bps'] is not None and (not finite(c['study_cost_bps']) or not 0 <= c['study_cost_bps'] <= 1000):
        raise ValueError('Cost assumption must be unset or 0–1000 round-trip bps')
    if not isinstance(c['study_levels'], list) or len(c['study_levels']) > 30:
        raise ValueError('At most 30 manual HTF references')
    seen = set()
    for p in c['study_levels']:
        if not isinstance(p, dict) or set(p) != {'id', 'price', 'side', 'timeframe', 'label', 'known_at', 'source', 'role'}:
            raise ValueError('Invalid manual HTF reference')
        if not isinstance(p['id'], str) or not 1 <= len(p['id']) <= 80 or p['id'] in seen:
            raise ValueError('Manual reference ID must be unique')
        seen.add(p['id'])
        if not finite(p['price']) or p['price'] <= 0 or p['side'] not in ('high', 'low') or p['timeframe'] not in FRAME_MS:
            raise ValueError('Invalid manual reference price or timeframe')
        if type(p['known_at']) is not int or p['known_at'] <= 0 or p['source'] != 'manual' or p['role'] not in ('both', 'reaction', 'objective'):
            raise ValueError('Invalid manual reference provenance')
        if not isinstance(p['label'], str) or len(p['label']) > 100:
            raise ValueError('Manual reference label must be at most 100 characters')
    return c


def swing_measurements(bars, window=5, tick=1):
    """Closed-bar, prefix-only features. Signed velocities retain direction."""
    rows = bars[-(window * 2 + 1):]
    unavailable = {'status': 'INSUFFICIENT_HISTORY', 'window': window, 'cutoff': rows[-1]['time'] + 60000 if rows else None}
    if len(rows) < window * 2 + 1 or any(b['time'] != rows[0]['time'] + i * 60000 for i, b in enumerate(rows)):
        return unavailable
    closes = [b['close'] for b in rows]
    recent = closes[window:]
    previous = closes[:window + 1]
    speed = (recent[-1] - recent[0]) / window
    prior = (previous[-1] - previous[0]) / window
    travel = sum(abs(b - a) for a, b in zip(recent, recent[1:]))
    tr = [max(b['high'] - b['low'], abs(b['high'] - rows[i - 1]['close']), abs(b['low'] - rows[i - 1]['close'])) for i, b in enumerate(rows) if i]
    atr = sum(tr) / len(tr)
    # A reversal is distinguished from deceleration in the same direction.
    same_direction = speed * prior > 0
    ratio = abs(speed / prior) if abs(prior) >= tick / window else None
    peak = max(recent) if prior >= 0 else min(recent)
    pullback = abs(peak - recent[-1])
    return {
        'status': 'AVAILABLE', 'window': window, 'cutoff': rows[-1]['time'] + 60000,
        'velocity_per_minute': speed, 'prior_velocity_per_minute': prior,
        'speed_ratio': ratio, 'same_direction': same_direction,
        'efficiency': abs(recent[-1] - recent[0]) / travel if travel else 0,
        'atr': atr, 'velocity_atr_per_minute': speed / atr if atr else None,
        'pullback_ticks': pullback / tick, 'elapsed_minutes': window,
        'state': 'direction_changed' if speed * prior < 0 else 'slowing' if same_direction and ratio is not None and ratio < .7 else 'accelerating' if same_direction and ratio is not None and ratio > 1.3 else 'steady' if speed else 'stalled',
        'definition': 'Two adjacent equal windows of completed 1m closes; slowdown thresholds are frozen descriptive research rules, not a reversal forecast.',
    }


def build_htf_context(symbol, feeds, now, manual=()):
    frames, levels = {}, []
    for tf, span in FRAME_MS.items():
        try:
            feed = feeds[tf]
            if feed.get('instrument') != symbol or feed.get('timeframe') != tf:
                raise ValueError('SYMBOL_OR_FRAME_MISMATCH')
            receipt = feed.get('as_of')
            if not finite(receipt) or not -1000 <= now - receipt <= 45000:
                raise ValueError('STALE_SOURCE_RECEIPT')
            cutoff = min(now, receipt)
            rows = [deepcopy(b) for b in feed['bars'] if b['time'] + span <= cutoff]
            for b in rows:
                valid_bar(b)
            if len(rows) < 12 or any(b['time'] % span or i and b['time'] != rows[i - 1]['time'] + span for i, b in enumerate(rows)):
                raise ValueError('INCOMPLETE_HTF_HISTORY')
            if not 0 <= cutoff - (rows[-1]['time'] + span) <= span:
                raise ValueError('STALE_COMPLETED_TAIL')
            pivots = []
            for i in range(2, len(rows) - 2):
                b = rows[i]
                others = rows[i - 2:i] + rows[i + 1:i + 3]
                hi = all(b['high'] > x['high'] for x in others)
                lo = all(b['low'] < x['low'] for x in others)
                if hi == lo:
                    continue
                side = 'high' if hi else 'low'
                price = b[side]
                known = rows[i + 2]['time'] + span
                p = {'id': f'htf:{tf}:{b["time"]}:{side}', 'price': price, 'side': side, 'timeframe': tf,
                     'origin': b['time'], 'known_at': known, 'source': 'confirmed-htf-pivot.1',
                     'label': tf.upper() + ' confirmed pivot reference', 'role': 'both',
                     'consumed': any(x['high'] >= price if hi else x['low'] <= price for x in rows[i + 3:])}
                pivots.append(p)
            highs = [p['price'] for p in pivots if p['side'] == 'high'][-2:]
            lows = [p['price'] for p in pivots if p['side'] == 'low'][-2:]
            trend = 1 if len(highs) == len(lows) == 2 and highs[1] > highs[0] and lows[1] > lows[0] else -1 if len(highs) == len(lows) == 2 and highs[1] < highs[0] and lows[1] < lows[0] else 0
            frames[tf] = {'status': 'AVAILABLE', 'trend': trend, 'cutoff': rows[-1]['time'] + span,
                          'as_of': receipt, 'first': rows[0]['time'], 'bars': len(rows), 'hash': identity(rows), 'evidence': rows[-24:], 'source_bars': rows}
            levels.extend([p for p in pivots if not p['consumed']][-12:])
        except (KeyError, ValueError, TypeError):
            frames[tf] = {'status': 'UNAVAILABLE', 'trend': 0, 'reason': 'Missing, stale, mismatched or incomplete own-frame OHLC'}
    levels.extend(deepcopy(list(manual)))
    available = all(f['status'] == 'AVAILABLE' for f in frames.values())
    daily, h4, h1 = (frames[tf]['trend'] for tf in FRAME_MS)
    parent = daily if available and daily and daily == h4 and h1 in (0, daily) else 0
    return {'version': VERSION, 'symbol': symbol, 'provider': 'Hyperliquid public REST', 'observed_at': now,
            'frames': frames, 'levels': levels, 'parent_direction': parent, 'complete': available,
            'parent_rule': 'Daily/4H structural agreement; 1H must not oppose. Manual bias stays separate.',
            'level_definition': 'Automatic levels are confirmed HTF pivot references; manual levels retain their declared role. Neither proves resting orders or Agentic Liquidity parity.'}


class LiquidityStudy:
    def __init__(self, run, symbol, config, tick, first_cutoff):
        self.run, self.symbol, self.config, self.tick = run, symbol, deepcopy(config), tick
        self.settings = validate_settings(config)
        self.first_cutoff = first_cutoff
        self.levels, self.campaigns, self.plans, self.events = {}, [], [], []
        self.context = {'frames': {}, 'levels': [], 'complete': False, 'parent_direction': 0}
        self.context_fingerprint = None
        self.last_bar = None
        self.metrics = {'status': 'INSUFFICIENT_HISTORY'}
        self.ended = None
        self.local_trend = 0
        self.reserved = {v: 0 for v in VARIANTS}
        self.parent_reserved = {}

    def event(self, kind, at, **data):
        self.events.append({'kind': kind, 'at': at, **deepcopy(data)})

    def set_context(self, context, closed_bars=()):
        self.context = deepcopy(context)
        fingerprint=identity({'frames':{tf:{k:f.get(k) for k in ('status','hash','cutoff')} for tf,f in context.get('frames',{}).items()},'levels':context.get('levels',[])})
        if fingerprint!=self.context_fingerprint:
            self.event('HTF_CONTEXT',context['observed_at'],fingerprint=fingerprint,context=context)
            self.context_fingerprint=fingerprint
        for p in context.get('levels', []):
            if p['id'] not in self.levels:
                self.levels[p['id']] = {**deepcopy(p), 'available_at': max(context['observed_at'], p['known_at']), 'consumed': any((b['high']>=p['price'] if p['side']=='high' else b['low']<=p['price']) for b in closed_bars if p['known_at']<=b['time'] and b['time']+60000<=context['observed_at'])}
        # Absence from a fresh map never erases a frozen campaign or past level.
        present = {p['id'] for p in context.get('levels', [])}
        for key, p in self.levels.items():
            p['in_current_map'] = key in present or bool(not p['consumed'] and context.get('frames',{}).get(p['timeframe'],{}).get('status')=='AVAILABLE')
            p['retained_reference'] = key not in present and p['in_current_map']

    def eligible_levels(self, at):
        return [p for p in self.levels.values() if p.get('in_current_map') and not p['consumed'] and p['available_at'] <= at and p['known_at'] <= at]

    def permission(self, side):
        s = self.settings
        return s['allow_long' if side == 1 else 'allow_short'] and s['manual_bias'] in ('neutral', 'long' if side == 1 else 'short')

    def target(self, side, price, at, exclude=None):
        choices = [p for p in self.eligible_levels(at) if p['id'] != exclude and p['role'] in ('both', 'objective') and p['side'] == ('high' if side == 1 else 'low') and side * (p['price'] - price) > self.tick]
        return deepcopy(min(choices, key=lambda p: abs(p['price'] - price))) if choices else None

    def create_campaign(self, playbook, side, reference, b, observed, parent):
        key = playbook + ':' + reference['id']
        if any(c['key'] == key for c in self.campaigns):
            return
        target = self.target(side, b['close'], b['time'], reference['id'])
        c = {'id': self.run + ':' + str(len(self.campaigns) + 1), 'key': key, 'playbook': playbook, 'side': side,
             'parent': parent, 'reference': deepcopy(reference), 'target': target, 'contact_bar': deepcopy(b),
             'observed_at': observed, 'contact_cutoff': b['time'] + 60000,
             'expires': b['time'] + (self.settings['study_horizon'] + 1) * 60000,
             'metrics_at_contact': deepcopy(self.metrics), 'manual_bias': self.settings['manual_bias'],
             'context_hash': identity(self.context), 'parent_direction_at_contact':self.context.get('parent_direction',0), 'context_cutoffs': {tf: f.get('cutoff') for tf, f in self.context.get('frames', {}).items()},
             'state': 'WATCH', 'reason': 'AWAIT_TRACKER', 'variants': {}, 'model_receipts': [],
             'frozen_stop': (b['low'] if side==1 else b['high'])-side*self.config['stop_ticks']*self.tick}
        if not self.context.get('complete'):
            c.update(state='BLOCKED', reason='HTF_CONTEXT_UNAVAILABLE')
        elif not self.permission(side):
            c.update(state='BLOCKED', reason='SIDE_OR_MANUAL_BIAS_BLOCKED')
        elif not target:
            c.update(state='BLOCKED', reason='NO_OPPOSING_HTF_OBJECTIVE')
        elif (b['high']>=target['price'] if side==1 else b['low']<=target['price']):
            c.update(state='BLOCKED', reason='OBJECTIVE_CONSUMED_AT_CONTACT')
        self.campaigns.append(c)
        self.event('CAMPAIGN', observed, campaign=c)
        if c['state'] == 'WATCH':
            extreme = b['low'] if side == 1 else b['high']
            stop = extreme - side * self.config['stop_ticks'] * self.tick
            self.plan(c, 'touch_only', b['close'], stop, observed, tracker=None)

    def plan(self, c, variant, reference, stop, observed, tracker=None, model=None):
        if variant in c['variants']:
            return
        side = c['side']
        stop=c['frozen_stop']  # Same frozen bracket in every comparison variant.
        risk, room = side * (reference - stop), side * (c['target']['price'] - reference)
        reserve = (risk + self.config['gap_ticks'] * self.tick) * self.config['quantity']
        group = (variant, c['parent'])
        reason = 'NO_ROOM' if risk <= 0 or room / risk < self.config['min_room_r'] else 'ATTEMPT_RISK' if reserve > self.config['attempt_risk'] else 'PARENT_RISK' if self.parent_reserved.get(group, 0) + reserve > self.config['parent_risk'] else 'RUN_RISK' if self.reserved[variant] + reserve > self.config['session_risk'] else None
        if not reason and math.ceil(observed/60000)*60000>=c['expires']:reason='NO_TIME_TO_ENTER'
        if not reason and variant!='touch_only' and side*(reference-c['contact_bar']['close'])>self.config['max_chase_ticks']*self.tick:reason='CHASE'
        count=sum(p['variant']==variant and next((x['parent'] for x in self.campaigns if x['id']==p['campaign']),None)==c['parent'] and p['status']!='BLOCKED' for p in self.plans)
        if not reason and count>=self.config['parent_signals']:reason='PARENT_COUNT'
        p = {'id': c['id'] + ':' + variant, 'campaign': c['id'], 'playbook': c['playbook'], 'variant': variant,
             'side': side, 'reference': reference, 'stop': stop, 'target': c['target']['price'],
             'observed_at': observed, 'eligible_open': math.ceil(observed / 60000) * 60000,
             'status': 'BLOCKED' if reason else 'PENDING', 'reason': reason or 'AWAIT_ELIGIBLE_OPEN',
             'quantity': self.config['quantity'], 'reserved_risk': reserve, 'horizon': self.settings['study_horizon'],
             'tracker_plan': tracker, 'model': deepcopy(model), 'cost_bps': self.settings['study_cost_bps'],
             'confirmation_delay_minutes': (observed - c['observed_at']) / 60000,
             'entry_move_from_touch_ticks': side * (reference - c['contact_bar']['close']) / self.tick}
        if not reason:
            self.reserved[variant] += reserve
            self.parent_reserved[group] = self.parent_reserved.get(group, 0) + reserve
        c['variants'][variant] = p['id']
        self.plans.append(p)
        self.event('PLAN', observed, plan=p)

    def settle(self, p, b, observed, status, exit_price=None, reason=None):
        p.update(status=status, reason=reason or status, resolved_at=observed, exit_at=b['time'] + 60000)
        if exit_price is not None:
            p.update(exit=exit_price, gross_r=p['side'] * (exit_price - p['entry']) / p['initial_risk'])
            p['net_r'] = p['gross_r'] - p['entry'] * p['cost_bps'] / 10000 / p['initial_risk'] if p['cost_bps'] is not None else None
        self.event('OUTCOME', observed, plan=p)

    def observe_plans(self, b, observed):
        for p in self.plans:
            if p['status']=='PENDING' and b['time']<p['eligible_open']:
                hit=(b['low']<=p['stop'] or b['high']>=p['target']) if p['side']==1 else (b['high']>=p['stop'] or b['low']<=p['target'])
                if hit:self.settle(p,b,observed,'MISSED',reason='BARRIER_BEFORE_ENTRY')
            if p['status'] == 'PENDING' and b['time'] >= p['eligible_open']:
                side = p['side']
                risk = side * (b['open'] - p['stop'])
                room = side * (p['target'] - b['open'])
                reason = 'MISSING_ENTRY_BAR' if b['time'] != p['eligible_open'] else 'OPEN_GAP' if abs(b['open'] - p['reference']) > self.config['gap_ticks'] * self.tick else 'OPEN_RISK_OR_ROOM' if risk <= 0 or room / risk < self.config['min_room_r'] or risk * p['quantity'] > p['reserved_risk'] else None
                if reason:
                    self.settle(p, b, observed, 'MISSED', reason=reason)
                    continue
                p.update(status='OPEN', entry=b['open'], entry_at=b['time'], initial_risk=risk, age=0, mfe_r=0, mae_r=0)
                self.event('ENTRY', observed, plan=p)
            if p['status'] != 'OPEN':
                continue
            p['age'] += 1
            side, risk = p['side'], p['initial_risk']
            favorable = (b['high'] - p['entry']) if side == 1 else (p['entry'] - b['low'])
            adverse = (p['entry'] - b['low']) if side == 1 else (b['high'] - p['entry'])
            # Full exit-candle ranges are only upper bounds without intrabar order.
            p['mfe_r'] = max(p['mfe_r'], favorable / risk)
            p['mae_r'] = max(p['mae_r'], adverse / risk)
            p['excursion_scope'] = 'Completed OHLC ranges including exit candle; may include movement after exit.'
            stop = b['low'] <= p['stop'] if side == 1 else b['high'] >= p['stop']
            target = b['high'] >= p['target'] if side == 1 else b['low'] <= p['target']
            if side * (b['open'] - p['stop']) <= 0:
                self.settle(p, b, observed, 'STOP', b['open'], 'ADVERSE_STOP_GAP')
            elif side * (b['open'] - p['target']) >= 0:
                self.settle(p, b, observed, 'TARGET', p['target'], 'TARGET_AT_OPEN')
            elif stop and target:
                self.settle(p, b, observed, 'AMBIGUOUS', reason='BOTH_BARRIERS_IN_1M')
            elif stop or target:
                self.settle(p, b, observed, 'TARGET' if target else 'STOP', p['target'] if target else p['stop'])
            elif p['age'] >= p['horizon']:
                self.settle(p, b, observed, 'TIME_EXIT', b['close'])

    def observe(self, b, observed, snapshot, closed_bars):
        if self.ended or not self.settings['study_enabled']:
            return
        valid_bar(b)
        if b['time'] + 60000 > observed:
            raise ValueError('Study requires completed bars')
        if self.last_bar is not None and b['time'] != self.last_bar['time'] + 60000:
            self.end('DATA_GAP', observed)
            return
        self.local_trend=snapshot.get('trend',0)
        self.metrics = swing_measurements(closed_bars, self.settings['study_window'], self.tick)
        self.observe_plans(b, observed)
        eligible = self.eligible_levels(b['time'])
        tol = self.settings['study_touch_ticks'] * self.tick
        prior = self.last_bar
        if b['time'] >= self.first_cutoff and prior:
            if self.settings['study_playbook'] in ('both', 'reversal'):
                # One campaign per contacted side/bar; coincident aliases do not multiply N.
                for level_side, side in (('high', -1), ('low', 1)):
                    refs = [p for p in eligible if p['role'] in ('both', 'reaction') and p['side'] == level_side and b['low'] <= p['price'] + tol and b['high'] >= p['price'] - tol and side * (prior['close'] - p['price']) > tol]
                    if refs:
                        ref = min(refs, key=lambda p: (abs(prior['close'] - p['price']), -FRAME_MS[p['timeframe']]))
                        self.create_campaign('HTF_REVERSAL', side, ref, b, observed, ref['id'])
            if self.settings['study_playbook'] in ('both', 'continuation'):
                side = self.context.get('parent_direction', 0)
                if side:
                    for p in reversed(snapshot.get('pivots', [])):
                        if p['side'] != -side or p['known'] > b['time'] or p['origin'] < self.first_cutoff - self.config['candidate_bars'] * self.config['swing_minutes'] * 60000:
                            continue
                        # A local pool already cleared before this bar is not fresh.
                        old = [x for x in closed_bars if p['known'] <= x['time'] < b['time']]
                        if any(x['low'] <= p['price'] if side == 1 else x['high'] >= p['price'] for x in old):
                            continue
                        if b['low'] <= p['price'] + tol and b['high'] >= p['price'] - tol and side * (prior['close'] - p['price']) > tol:
                            ref = {'id': 'local:' + str(p['origin']) + ':' + str(p['side']), 'price': p['price'], 'side': 'low' if side == 1 else 'high', 'timeframe': str(self.config['swing_minutes']) + 'm', 'known_at': p['known'], 'source': 'tracker-pivot', 'role': 'reaction'}
                            self.create_campaign('DRAW_CONTINUATION', side, ref, b, observed, 'parent:' + str(snapshot['parent_id']))
                            break
        for c in self.campaigns:
            if c['state'] != 'WATCH':
                continue
            stop = c['contact_bar']['low'] - self.config['stop_ticks'] * self.tick if c['side'] == 1 else c['contact_bar']['high'] + self.config['stop_ticks'] * self.tick
            reason = 'EXPIRED' if b['time'] + 60000 >= c['expires'] else 'OBJECTIVE_CONSUMED_BEFORE_CONFIRMATION' if c['target'] and (b['high'] >= c['target']['price'] if c['side'] == 1 else b['low'] <= c['target']['price']) else 'LOCATION_INVALIDATED' if b['time'] > c['contact_bar']['time'] and (b['low'] <= stop if c['side'] == 1 else b['high'] >= stop) else None
            if reason:
                c.update(state='TERMINAL', reason=reason)
                self.event('CAMPAIGN_END', observed, campaign=c)
                continue
            if 'tracker' not in c['variants']:
                ready = next((p for p in reversed(snapshot.get('plans', [])) if p.get('state') == 'READY' and p.get('study_campaign',c['id'])==c['id'] and p['side'] == c['side'] and p['signal_at'] >= c['contact_cutoff'] and p.get('observed_at', p['signal_at']) >= c['observed_at'] and p['signal_at'] <= b['time'] + 60000), None)
                if ready:
                    c['confirmation'] = {'tracker_plan': ready['id'], 'observed_at': observed, 'reference': b['close'], 'stop': c['frozen_stop'], 'tracker_stop':ready['initial_stop'], 'signal_at': ready['signal_at']}
                    self.plan(c, 'tracker', b['close'], ready['initial_stop'], observed, ready['id'])
                    c['reason'] = 'TRACKER_CONFIRMED_AWAIT_JEV'
        for p in eligible:
            if (b['high'] >= p['price'] if p['side'] == 'high' else b['low'] <= p['price']):
                p.update(consumed=True, consumed_at=observed)
        self.last_bar = deepcopy(b)

    def model(self, receipt, prediction_id, observed, received, campaign_ids=None):
        if receipt.get('status') != 'AVAILABLE' or not self.last_bar or received < observed or received - observed > 3000:
            return
        for c in self.campaigns:
            if c['state'] != 'WATCH' or 'confirmation' not in c or 'tracker_jev' in c['variants']:
                continue
            if campaign_ids is not None and c['id'] not in campaign_ids:
                continue
            # The model must see the confirmation. Older answers cannot bless later structure.
            if observed < c['confirmation']['observed_at'] or received-c['confirmation']['observed_at']>75000 or received >= c['expires']:
                continue
            tracker_plan=next((p for p in self.plans if p['id']==c['variants'].get('tracker')),None)
            if not tracker_plan or tracker_plan['status'] not in ('PENDING','OPEN'):
                continue
            key = ('long' if c['side'] == 1 else 'short') + ('_fit' if c['playbook'] == 'HTF_REVERSAL' else '_continuation_fit')
            answer = receipt.get('answers', {}).get(key, {})
            value = answer.get('noul')
            if not finite(value):
                continue
            label = {'prediction_id': prediction_id, 'observed_at': observed, 'received_at': received, 'question': key, 'value': value, 'threshold': self.settings['study_jev_min'], 'meaning': 'Contextual model fit; not a calibrated trade win probability', 'response':receipt.get('answers',{}).get('liquidity_response',{}).get('choice','unavailable'), 'delivery':receipt.get('answers',{}).get('delivery_state',{}).get('choice','unavailable')}
            c['model_receipts'].append(label)
            c['model_receipts']=c['model_receipts'][-12:]
            if value >= self.settings['study_jev_min']:
                cf = c['confirmation']
                self.plan(c, 'tracker_jev', self.last_bar['close'], cf['stop'], received, cf['tracker_plan'], label)

    def end(self, reason, at):
        if self.ended:
            return
        self.ended = {'reason': reason, 'at': at}
        for p in self.plans:
            if p['status'] in ('OPEN', 'PENDING'):
                p.update(status='UNRESOLVED', reason=reason)
                self.event('OUTCOME', at, plan=p)
        for c in self.campaigns:
            if c['state'] == 'WATCH':
                c.update(state='TERMINAL', reason=reason)
                self.event('CAMPAIGN_END', at, campaign=c)

    def snapshot(self):
        summaries = []
        for playbook in ('HTF_REVERSAL', 'DRAW_CONTINUATION'):
            campaigns = [c for c in self.campaigns if c['playbook'] == playbook]
            for variant in VARIANTS:
                plans = [p for p in self.plans if p['playbook'] == playbook and p['variant'] == variant]
                entered = [p for p in plans if 'entry' in p]
                resolved = [p for p in entered if finite(p.get('gross_r'))]
                equity = peak = drawdown = 0
                for p in sorted(resolved, key=lambda p: (p['resolved_at'], p['id'])):
                    equity += p['net_r'] if p.get('net_r') is not None else p['gross_r']
                    peak = max(peak, equity)
                    drawdown = max(drawdown, peak - equity)
                summaries.append({'playbook': playbook, 'variant': variant, 'eligible_campaigns': len(campaigns),
                                  'entered': len(entered), 'resolved': len(resolved), 'targets': sum(p['status'] == 'TARGET' for p in entered),
                                  'ambiguous': sum(p['status'] == 'AMBIGUOUS' for p in plans),
                                  'pending': sum(p['status'] in ('PENDING', 'OPEN') for p in plans),
                                  'unresolved': sum(p['status'] == 'UNRESOLVED' for p in plans),
                                  'blocked_or_missed': sum(p['status'] in ('BLOCKED', 'MISSED') for p in plans),
                                  'no_entry_campaigns': len(campaigns) - len(entered),
                                  'participation': len(entered) / len(campaigns) if campaigns else None,
                                  'mean_gross_r': sum(p['gross_r'] for p in resolved) / len(resolved) if resolved else None,
                                  'mean_net_r': sum(p['net_r'] for p in resolved) / len(resolved) if resolved and self.settings['study_cost_bps'] is not None else None,
                                  'total_r_per_campaign': equity / len(campaigns) if campaigns and resolved else None,
                                  'realized_sequence_drawdown_r': drawdown if resolved else None,
                                  'mean_confirmation_delay_minutes': sum(p['confirmation_delay_minutes'] for p in entered) / len(entered) if entered else None})
        features={}
        for p in self.plans:
            campaign=next(c for c in self.campaigns if c['id']==p['campaign'])
            state=campaign['metrics_at_contact'].get('state','unavailable')
            key=(p['playbook'],p['variant'],state)
            group=features.setdefault(key,{'playbook':p['playbook'],'variant':p['variant'],'delivery_at_contact':state,'entered':0,'resolved':0,'targets':0,'ambiguous':0,'gross_r':[],'net_r':[]})
            if 'entry' in p:group['entered']+=1
            if p['status']=='AMBIGUOUS':group['ambiguous']+=1
            if finite(p.get('gross_r')):
                group['resolved']+=1;group['targets']+=int(p['status']=='TARGET');group['gross_r'].append(p['gross_r'])
                if p.get('net_r') is not None:group['net_r'].append(p['net_r'])
        for group in features.values():
            gross=group.pop('gross_r');net=group.pop('net_r')
            group['mean_gross_r']=sum(gross)/len(gross) if gross else None
            group['mean_net_r']=sum(net)/len(net) if net else None
        parent=self.context.get('parent_direction',0)
        draw=self.target(parent,self.last_bar['close'],self.last_bar['time']+60000) if parent and self.last_bar else None
        bias={'manual':self.settings['manual_bias'],'parent_direction':parent,'local_structure':self.local_trend,
              'draw_status':'PROVISIONAL' if draw else 'UNRESOLVED','draw':draw,
              'conflict':bool(parent and (self.local_trend and self.local_trend!=parent or self.settings['manual_bias'] not in ('neutral','long' if parent==1 else 'short'))),
              'meaning':'Separate context layers, not an aggregate score or trade win probability'}
        return {'version': VERSION, 'run': self.run, 'symbol': self.symbol, 'first_live_cutoff': self.first_cutoff,
                'last_bar':deepcopy(self.last_bar), 'settings': deepcopy(self.settings), 'metrics': deepcopy(self.metrics), 'context': deepcopy(self.context),
                'levels': deepcopy(list(self.levels.values())), 'campaigns': deepcopy(self.campaigns),
                'plans': deepcopy(self.plans), 'summaries': summaries, 'feature_groups':list(features.values()), 'bias':bias, 'ended': self.ended,
                'scope': 'Current frozen run; distinct contacted references are campaigns, repeated samples are not independent trades. Playbooks separate; variants are alternative shadow ledgers, not a portfolio. Descriptive development evidence, not held-out validation.',
                'cost_scope': 'GROSS_ONLY' if self.settings['study_cost_bps'] is None else 'USER_COST_SCENARIO',
                'execution': 'none'}

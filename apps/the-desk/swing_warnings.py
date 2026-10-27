"""Causal Swing Tracker v1.3 warning engine. Research only; no order handles.

Rules mirror indicators/agentic-swing-tracker-v1.3/warning-engine.mjs.
Closed state, provisional samples and recognition/receipt clocks stay separate.
"""
from copy import deepcopy
import json
import math

REVISION = 'swing-warnings-1.3.0'
FEATURES = ('SLOW', 'CHOP', 'REJECT', 'EXTENDED', 'LEVEL', 'DIVERGENCE', 'EFFORT', 'STRUCTURE')
FAMILY = (0, 0, 1, 2, 3, 0, 4, 5)
DEFAULTS = dict(window=5, atrLength=14, pivotBars=2, slowRatio=.7, efficiency=.45,
                overlap=.55, wick=.45, extension=3, rsiLength=14, rsiDelta=5,
                volumeLength=20, relativeVolume=1.5, effortProgress=.35, holdBars=3,
                volumeEnabled=False, momentumEnabled=True, maxEvents=300,
                maxBars=2000, cadenceMs=15000, gapMs=60000, side=0, tick=1,
                weights=[2, 2, 1, 2, 1, 3])
DESCRIPTIONS = (
    'Directional progress weakens versus the preceding equal window',
    'Low net progress with overlapping candles',
    'Opposing wick and adverse-half close near the recent extreme',
    'Distance from the delivery base exceeds the range threshold',
    'Known reference contacted and rejected; acceptance clears the warning',
    'New extreme with weaker momentum balance than a recognized pivot',
    'High completed-minute relative volume with little body progress',
    'Micro break, protected-pivot break, then failed reclaim or departure')


def finite(n):
    return type(n) in (int, float) and math.isfinite(n)


def mean(a):
    return sum(a)/len(a)


def validate_bar(b):
    if not isinstance(b, dict) or type(b.get('time')) is not int or b['time'] % 60000:
        raise ValueError('Aligned UTC one-minute time required')
    if not all(finite(b.get(k)) and b[k] > 0 for k in ('open', 'high', 'low', 'close')) or b['high'] < max(b['open'], b['close']) or b['low'] > min(b['open'], b['close']):
        raise ValueError('Invalid OHLC')
    if b.get('volume') is not None and (not finite(b['volume']) or b['volume'] < 0):
        raise ValueError('Invalid volume')


def validate_config(config=None):
    if config is not None and (not isinstance(config, dict) or set(config)-set(DEFAULTS)):
        raise ValueError('Unknown warning setting')
    c = {**deepcopy(DEFAULTS), **deepcopy(config or {})}
    for k in ('window', 'atrLength', 'pivotBars', 'rsiLength', 'volumeLength', 'holdBars', 'maxEvents', 'maxBars', 'cadenceMs', 'gapMs'):
        if type(c[k]) is not int or not 1 <= c[k] <= 100000:
            raise ValueError('Invalid '+k)
    if c['window'] < 2 or c['atrLength'] < 2 or c['rsiLength'] < 2 or c['volumeLength'] < 2 or c['cadenceMs'] != 15000 or c['gapMs'] != 60000 or c['maxEvents'] < 8 or c['maxEvents'] > 1000 or c['maxBars'] > 5000 or c['maxBars'] < max(2*c['window']+1, c['volumeLength']+1, c['atrLength']+1, 2*c['pivotBars']+1, c['rsiLength']+1):
        raise ValueError('Invalid sampling/history config')
    for k in ('slowRatio', 'efficiency', 'overlap', 'wick', 'effortProgress'):
        if not finite(c[k]) or not 0 < c[k] < 1:
            raise ValueError('Invalid '+k)
    for k in ('extension', 'rsiDelta', 'relativeVolume', 'tick'):
        if not finite(c[k]) or c[k] <= 0:
            raise ValueError('Invalid '+k)
    if type(c['side']) is not int or c['side'] not in (-1, 0, 1) or any(type(c[k]) is not bool for k in ('volumeEnabled', 'momentumEnabled')):
        raise ValueError('Invalid direction or optional feature')
    if not isinstance(c['weights'], list) or len(c['weights']) != 6 or any(type(x) is not int or not 0 <= x <= 5 for x in c['weights']):
        raise ValueError('Invalid family weights')
    return c


def momentum(rows, n):
    if len(rows) < n+1:
        return None
    tail = rows[-n-1:]
    changes = [b['close']-a['close'] for a, b in zip(tail, tail[1:])]
    up, down = sum(max(0, x) for x in changes), sum(max(0, -x) for x in changes)
    return 100*up/(up+down) if up+down else 50


def measurements(rows, side, anchor, c, pivot=None):
    empty = dict(available=False, severity=[None]*8, values={}, bullish=0)
    if side not in (-1, 1) or len(rows) < max(2*c['window']+1, c['atrLength']+1):
        return empty
    b, w = rows[-1], c['window']
    tr = [max(x['high']-x['low'], abs(x['high']-rows[i-1]['close']), abs(x['low']-rows[i-1]['close'])) for i, x in enumerate(rows) if i >= len(rows)-c['atrLength']]
    atr, span = mean(tr), max(c['tick'], b['high']-b['low'])
    if atr < c['tick']/100:
        return empty
    speed = side*(b['close']-rows[-w-1]['close'])/w
    prior = side*(rows[-w-1]['close']-rows[-2*w-1]['close'])/w
    travel = sum(abs(rows[i]['close']-rows[i-1]['close']) for i in range(len(rows)-w, len(rows)))
    efficiency = abs(b['close']-rows[-w-1]['close'])/travel if travel else 0
    overlaps = [max(0, min(1, (min(rows[i]['high'], rows[i-1]['high'])-max(rows[i]['low'], rows[i-1]['low']))/max(c['tick'], min(rows[i]['high']-rows[i]['low'], rows[i-1]['high']-rows[i-1]['low'])))) for i in range(len(rows)-w, len(rows))]
    overlap = mean(overlaps)
    ratio = max(0, speed)/prior if prior >= c['tick']/w else None
    peak = max(x['high'] for x in rows[-w-1:]) if side == 1 else min(x['low'] for x in rows[-w-1:])
    near = side*(peak-(b['high'] if side == 1 else b['low'])) <= atr*.5
    rejection = (b['high']-max(b['open'], b['close']))/span if side == 1 else (min(b['open'], b['close'])-b['low'])/span
    clv = (b['close']-b['low'])/span if side == 1 else (b['high']-b['close'])/span
    extension = side*((b['high'] if side == 1 else b['low'])-anchor)/atr if anchor is not None else None
    rsi = momentum(rows, c['rsiLength'])
    divergence = (peak > pivot['price']+c['tick'] and rsi < pivot['rsi']-c['rsiDelta'] if side == 1 else peak < pivot['price']-c['tick'] and rsi > pivot['rsi']+c['rsiDelta']) if c['momentumEnabled'] and pivot and finite(pivot.get('rsi')) and finite(rsi) else None
    vols = [x.get('volume') for x in rows[:-1][-c['volumeLength']:]]
    volume_ok = c['volumeEnabled'] and len(vols) == c['volumeLength'] and all(finite(x) and x > 0 for x in vols) and finite(b.get('volume')) and b['volume'] > 0
    relative = b['volume']/mean(vols) if volume_ok else None
    body = abs(b['close']-b['open'])/span
    severity = [None if ratio is None else (2 if speed <= 0 else 1) if ratio < c['slowRatio'] else 0,
                int(efficiency < c['efficiency'] and overlap >= c['overlap']),
                int(near and rejection >= c['wick'] and clv <= .5),
                None if extension is None else int(extension >= c['extension']), None,
                None if divergence is None else int(near and divergence),
                int(near and relative >= c['relativeVolume'] and body < c['effortProgress']) if volume_ok else None, 0]
    values = dict(atr=atr, speed=speed, priorSpeed=prior, speedRatio=ratio, efficiency=efficiency, overlap=overlap,
                  rejection=rejection, closeLocation=clv, extension=extension, rsi=rsi, relativeVolume=relative,
                  bodyFraction=body, peak=peak, close=b['close'])
    return dict(available=True, severity=severity, values=values,
                bullish=int(speed > 0 and efficiency >= .6)+int(clv >= .7 and side*(b['close']-b['open']) > 0))


class WarningEngine:
    def __init__(self, config=None):
        self._config = validate_config(config)
        self.rows, self.events = [], []
        self.active, self.live_episodes = [None]*8, [None]*8
        self.sequence = self.live_sequence = self.swing = self.stage = 0
        self.side = 0
        self.anchor = self.last_closed = self.last_slot = self.last_observed = None
        self.protected = self.extreme_pivot = self.broken = self.level_contact = self.last_snapshot = None
        self.levels = []

    @property
    def config(self):
        return deepcopy(self._config)

    def set_levels(self, levels, observed_at):
        if type(observed_at) is not int:
            raise ValueError('Level receipt clock required')
        validated = []
        previous = {x['id']: x for x in self.levels}
        for x in levels:
            if x.get('side') not in ('upper', 'lower') or not finite(x.get('price')) or x['price'] <= 0 or type(x.get('knownAt')) is not int or x['knownAt'] > observed_at or not x.get('id'):
                raise ValueError('Invalid level provenance')
            # Preserve first availability across same-reference context refreshes.
            old = previous.get(x['id'])
            available = old['availableAt'] if old and all(old.get(k) == x.get(k) for k in ('price', 'side', 'knownAt')) else observed_at
            validated.append({**deepcopy(x), 'availableAt': available})
        self.levels = validated

    def emit(self, kind, at, **data):
        self.sequence += 1
        event = dict(revision=REVISION, seq=self.sequence, swing=self.swing, kind=kind, at=at, **deepcopy(data))
        self.events.append(event)
        self.events = self.events[-self._config['maxEvents']:]
        return event

    def clear(self, at, reason):
        for i, old in enumerate(self.active):
            if old:
                self.emit('CLEARED', at, feature=FEATURES[i], episode=old['id'], reason=reason)
                self.active[i] = None

    def start(self, side, at):
        self.clear(at, 'SWING_CHANGED')
        self.live_episodes = [None]*8
        self.side, self.swing = side, self.swing+1
        tail = self.rows[-2*self._config['window']-1:]
        self.anchor = min(x['low'] for x in tail) if side == 1 else max(x['high'] for x in tail)
        self.protected = self.extreme_pivot = self.broken = self.level_contact = None
        self.stage = 0
        self.emit('SWING', at, side=side, anchor=self.anchor, originAt=self.rows[-1]['time'], knownAt=at)

    def feed(self, bar, observed_at=None):
        validate_bar(bar)
        at = bar['time']+60000 if observed_at is None else observed_at
        if type(at) is not int or at < bar['time']+60000:
            raise ValueError('Closed bar observed before close')
        if self.last_closed is not None and bar['time'] <= self.last_closed:
            raise ValueError('Duplicate or out-of-order close')
        if self.last_closed is not None and bar['time'] != self.last_closed+60000:
            self.clear(at, 'DATA_GAP'); self.emit('DATA_GAP', at)
            self.rows, self.side, self.stage = [], 0, 0
            self.protected = self.extreme_pivot = self.broken = self.level_contact = None
            self.live_episodes = [None]*8
        self.rows.append(deepcopy(bar)); self.rows = self.rows[-self._config['maxBars']:]
        self.last_closed = bar['time']
        c = self._config
        if self.side and c['side'] == 0 and self.stage >= 3:
            self.start(-self.side, at)
        elif not self.side and len(self.rows) >= max(2*c['window']+1, c['atrLength']+1):
            d = c['side'] or ((bar['close'] > self.rows[-c['window']-1]['close'])-(bar['close'] < self.rows[-c['window']-1]['close']))
            if d:
                self.start(d, at)
        m = self.assess(self.rows, at, True)
        for i, severity in enumerate(m['severity']):
            old = self.active[i]
            if severity is not None and severity > 0:
                if not old:
                    first = self.live_episodes[i]['firstSeen'] if self.live_episodes[i] else at
                    ev = self.emit('START', at, feature=FEATURES[i], severity=severity, side=-self.side,
                                   price=bar['close'], originAt=bar['time'], firstObserved=first, knownAt=at, value=self.feature_value(i, m))
                    self.active[i] = dict(id=ev['seq'], firstSeen=first, firstConfirmed=at, originAt=bar['time'], severity=severity, updates=1)
                else:
                    old['updates'] += 1
                    if old['severity'] != severity:
                        old['severity'] = severity
                        self.emit('UPDATE', at, feature=FEATURES[i], episode=old['id'], severity=severity, side=-self.side, price=bar['close'], originAt=bar['time'], knownAt=at, firstObserved=old['firstSeen'])
            elif old:
                self.emit('CLEARED', at, feature=FEATURES[i], episode=old['id'], reason='UNAVAILABLE' if severity is None else 'REPAIRED')
                self.active[i] = None
        self.recognize(at)
        self.last_snapshot = self.snapshot(m, at, False)
        return deepcopy(self.last_snapshot)

    @staticmethod
    def feature_value(i, m):
        return m['values'].get(('speedRatio', 'efficiency', 'rejection', 'extension', 'level', 'rsi', 'relativeVolume', 'protected')[i])

    def recognize(self, at):
        n = self._config['pivotBars']
        if len(self.rows) < 2*n+1:
            return
        window = self.rows[-2*n-1:]; center = window[n]; others = window[:n]+window[n+1:]
        high, low = all(center['high'] > b['high'] for b in others), all(center['low'] < b['low'] for b in others)
        if high == low:
            return
        side, price = (1, center['high']) if high else (-1, center['low'])
        if side == self.side:
            self.extreme_pivot = dict(price=price, rsi=momentum(self.rows[:-n], self._config['rsiLength']), origin=center['time'], known=at)
        elif self.protected is None or self.side*(price-self.protected['price']) > 0:
            self.protected = dict(price=price, origin=center['time'], known=at)

    def assess(self, rows, at, commit=False):
        c = self._config
        m = measurements(rows, self.side, self.anchor, c, self.extreme_pivot)
        if not m['available']:
            return m
        b, prior = rows[-1], rows[:-1]
        minor = min(x['low'] for x in prior[-3:]) if self.side == 1 else max(x['high'] for x in prior[-3:])
        relevant = [x for x in self.levels if x['side'] == ('upper' if self.side == 1 else 'lower') and x['knownAt'] <= b['time'] and x['availableAt'] <= at]
        contact = self.level_contact
        for level in relevant:
            if self.side*((b['high'] if self.side == 1 else b['low'])-level['price']) >= 0:
                contact = dict(level, bar=b['time'])
        m['values'].update(level=contact['price'] if contact else None, levelKnownAt=contact['knownAt'] if contact else None, levelAvailableAt=contact['availableAt'] if contact else None)
        m['severity'][4] = None if not relevant else 2 if contact and b['time']-contact['bar'] < c['holdBars']*60000 and self.side*(b['close']-contact['price']) <= 0 else 0
        if commit:
            self.level_contact = contact
        stage, broken = self.stage, deepcopy(self.broken)
        micro = self.side*(b['close']-minor) < -c['tick']/2
        major = self.protected and self.protected['known'] <= b['time'] and self.side*(b['close']-self.protected['price']) < -c['tick']/2
        if broken and self.side*(b['close']-broken['level']) > c['tick']:
            stage, broken = 0, None
        if major:
            stage = max(stage, 2)
            if not broken or broken['kind'] != 'protected':
                broken = dict(level=self.protected['price'], at=at, kind='protected')
        elif micro and stage == 0:
            stage, broken = 1, dict(level=minor, at=at, kind='micro')
        if broken and at > broken['at'] and self.side*((b['high'] if self.side == 1 else b['low'])-broken['level']) >= 0 and self.side*(b['close']-broken['level']) < 0:
            stage = 3 if broken['kind'] == 'protected' else max(stage, 1)
        if broken and broken['kind'] == 'protected' and stage >= 2 and b['time']+60000-broken['at'] >= c['pivotBars']*60000 and self.side*(b['close']-broken['level']) < 0 and m['values']['speed'] < 0:
            stage = 3
        if commit:
            self.stage, self.broken = stage, broken
        m['severity'][7] = stage
        m['values'].update(protected=self.protected['price'] if self.protected else None, minor=minor, breakLevel=broken['level'] if broken else None)
        m['bullish'] += int(self.protected is not None and self.side*((b['low'] if self.side == 1 else b['high'])-self.protected['price']) >= 0)+int(self.broken is not None and self.side*(b['close']-self.broken['level']) > c['tick'])
        return m

    def observe(self, forming, at, source_at=None):
        validate_bar(forming)
        source_at = at if source_at is None else source_at
        if type(at) is not int or not forming['time'] <= at < forming['time']+60000 or type(source_at) is not int or source_at > at+1000 or at-source_at > 20000:
            raise ValueError('Invalid or stale intrabar clock')
        if self.last_observed is not None and at < self.last_observed:
            raise ValueError('Observation clock moved backward')
        if self.last_closed is None or forming['time'] != self.last_closed+60000:
            raise ValueError('Missing adjacent completed bar')
        slot = at//self._config['cadenceMs']
        if self.last_slot == slot:
            return None
        self.last_slot, self.last_observed = slot, at
        m = self.assess(self.rows+[deepcopy(forming)], at)
        m['severity'][6], m['values']['relativeVolume'] = None, None
        for i, severity in enumerate(m['severity']):
            if severity is not None and severity > 0:
                if self.live_episodes[i] is None:
                    self.live_sequence += 1
                    self.live_episodes[i] = dict(id=self.live_sequence, firstSeen=at)
                self.live_episodes[i]['severity'] = severity
            else:
                self.live_episodes[i] = None
        return dict(self.snapshot(m, at, True), liveEpisodes=deepcopy(self.live_episodes))

    def snapshot(self, m, at, provisional):
        groups, available = [None]*6, [False]*6
        for i, value in enumerate(m['severity']):
            if value is not None:
                f = FAMILY[i]; groups[f] = max(groups[f] or 0, min(2, value)); available[f] = True
        maximum = sum(2*self._config['weights'][i] for i, ok in enumerate(available) if ok)
        weighted = sum((x or 0)*self._config['weights'][i] for i, x in enumerate(groups))
        stage = m['severity'][7] or 0
        state = 'UNAVAILABLE' if not m['available'] else 'CONFIRMED_LOCAL_TURN' if stage >= 3 else 'PROTECTED_LEVEL_BROKEN' if stage >= 2 else 'LOCAL_TURN' if stage == 1 else 'CAUTION' if any((x or 0) > 0 for x in m['severity']) else 'TRACKING'
        return dict(schema='agentic.swing.warnings.v1', revision=REVISION, symbol=None,
                    featureConfig=json.dumps(self._config, separators=(',', ':')), observedAt=at,
                    closedCutoff=None if self.last_closed is None else self.last_closed+60000,
                    provisional=provisional, swing=self.swing, side=self.side, anchor=self.anchor,
                    severity=deepcopy(m['severity']), values=deepcopy(m['values']), deliverySupport=m['bullish'],
                    pressure=100*weighted/maximum if m['available'] and maximum else None,
                    coverage=''.join('1' if x else '0' for x in available), activeFamilies=sum((x or 0) > 0 for x in groups),
                    availableFamilies=sum(available), stage=stage, state=state, probability=None,
                    probabilityStatus='UNCALIBRATED', episodes=deepcopy(self.active), sequence=self.sequence)

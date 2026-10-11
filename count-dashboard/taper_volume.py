"""Authoritative completed-OHLCV measurements for Taper. Independent reconstruction."""
import hashlib
import json
import math

METHOD = 'taper.volume.v1'
PACK = 'taper.geometry-volume.questions.v2'
DAY = 86400000


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def number(x):
    return type(x) in (int, float) and math.isfinite(x)


def evidence(raw, source, tape):
    """Recompute, never trust browser metrics; bind history to submitted tape."""
    if raw is None:
        return {'method': METHOD, 'status': 'unavailable', 'reason': 'No volume history supplied', 'rows': []}
    if not isinstance(raw, dict) or raw.get('method') != METHOD:
        raise ValueError('Invalid Taper volume method')
    src = raw.get('source', {})
    if any(src.get(k) != source[k] for k in ('provider', 'symbol', 'completedCutoff')):
        raise ValueError('Volume source/cutoff does not match tape')
    rows = raw.get('bars')
    if not isinstance(rows, list) or not len(tape) <= len(rows) <= 5000:
        raise ValueError('Volume requires matching bounded history, maximum 5000 bars')
    clean = []
    prior = -1
    for row in rows:
        if not isinstance(row, dict) or not all(number(row.get(k)) for k in ('time', 'open', 'high', 'low', 'close')):
            raise ValueError('Volume history has invalid numeric OHLC')
        b = {k: row[k] for k in ('time', 'open', 'high', 'low', 'close')}
        if b['time'] % 60000 or b['time'] <= prior or b['time'] > source['completedCutoff']:
            raise ValueError('Volume history has unordered, forming or misaligned bars')
        if b['low'] <= 0 or b['high'] < max(b['open'], b['close'], b['low']) or b['low'] > min(b['open'], b['close']):
            raise ValueError('Volume history has invalid OHLC geometry')
        if row.get('volume') is not None and (not number(row['volume']) or row['volume'] < 0):
            raise ValueError('Volume must be nonnegative and finite; missing remains missing')
        b['volume'] = row.get('volume')
        clean.append(b)
        prior = b['time']
    if prior != source['completedCutoff']:
        raise ValueError('Volume history ends at another cutoff')
    for a, b in zip(clean[-len(tape):], tape):
        if any(a[k] != b[k] for k in ('time', 'open', 'high', 'low', 'close')) or a.get('volume') != b.get('volume'):
            raise ValueError('Volume history does not match completed tape OHLCV')
    result = calculate(clean)
    result['source'] = {k: source[k] for k in ('provider', 'symbol', 'completedCutoff')}
    result['historyCount'] = len(clean)
    result['historyHash'] = hashlib.sha256(json.dumps(clean, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    # Price OHLC already exists in completed tape; keep only nonduplicated recent
    # volume features. Full source history is hashed and never sent to the model.
    fields = ('time', 'volume', 'density', 'rvol', 'referenceCount', 'kind', 'spike', 'effortResult', 'sequence')
    result['rows'] = [{k: row[k] for k in fields} for row in result['rows'][-8:]]
    result['latest'] = {k: result['latest'][k] for k in ('time', 'volume', 'range', 'density', 'rvol', 'relativeDensity', 'relativeRange', 'referenceCount', 'baseline', 'kind', 'spike', 'spikeSide', 'sma', 'closeLocation', 'bodyFraction', 'effortResult', 'sequence')} if result['latest'] else None
    result['followThrough'] = [{k: row[k] for k in ('anchorTime', 'direction', 'knownAt', 'state')} for row in result['followThrough'][-4:]]
    result['divergences'] = [{k: v for k, v in row.items() if k != 'measurement'} for row in result['divergences'][-3:]]
    result['coverage'] = 'Last 8 volume rows, 4 follow-through events, 3 confirmed divergences; raw completed tape contains their OHLC. Full history is hashed.'
    result['divergenceRule'] = 'Five-bar confirmed price pivot; higher high or lower low with at least 20% lower raw pivot volume, at most 60 bars apart. Known after two right closes.'
    return result


def calculate(bars):
    rows, slots, follow, divergences = [], {}, [], []
    strong_c_at = strong_h_at = -100
    high_line = low_line = None
    day_key = None
    actual = expected = seen = known = 0
    for i, b in enumerate(bars):
        r = b['high'] - b['low']
        v = b.get('volume')
        density = v / r if v is not None and r > 0 else None
        history = slots.get(b['time'] % DAY, [])
        refs = history[-15:]
        base = mean([x['volume'] for x in refs])
        base_d = mean([x['density'] for x in refs if x['density'] is not None])
        base_r = mean([x['range'] for x in refs])
        rv = v / base * 100 if len(refs) >= 3 and base and v is not None else None
        rd = density / base_d * 100 if len(refs) >= 3 and base_d and density is not None else None
        rr = r / base_r * 100 if len(refs) >= 3 and base_r else None
        c = v * r if v is not None else None
        h = density
        candidates, recent = rows[-15:], rows[-6:]
        full = len(candidates) == 15 and all(x['value'] is not None for x in candidates)
        mx = lambda xs, key: max((x[key] for x in xs if x[key] is not None), default=-math.inf)
        sc = full and c is not None and c > 0 and c >= mx(candidates, 'climax')
        sh = full and h is not None and h > 0 and h >= mx(candidates, 'churn')
        wc = full and not sc and i - strong_c_at < 16 and c is not None and c > 0 and c >= mx(recent, 'climax')
        wh = full and not sh and i - strong_h_at < 16 and h is not None and h > 0 and h >= mx(recent, 'churn')
        if sc: strong_c_at = i
        if sh: strong_h_at = i
        window = [x['value'] for x in rows[-19:]] + [v]
        sma = mean(window) if len(window) == 20 and all(x is not None for x in window) else None
        sigma = math.sqrt(mean([(x - sma) ** 2 for x in window])) if sma is not None else None
        bands = [sma + n * sigma for n in (1, 2, 3)] if sma is not None else None
        prev = rows[-1] if rows else None
        prev2 = rows[-2] if len(rows) >= 2 else None
        low = v is not None and sma is not None and prev2 is not None and prev['value'] is not None and prev2['value'] is not None and v <= prev['value'] and v <= prev2['value'] and v < sma * .8
        kind = ('unavailable' if v is None else 'strongClimaxChurn' if sc and sh else 'strongClimax' if sc else 'strongChurn' if sh else 'weakClimaxChurn' if wc and wh else 'weakClimax' if wc else 'weakChurn' if wh else 'low' if low else 'higher' if prev and prev['value'] is not None and v > prev['value'] else 'lower' if prev and prev['value'] is not None and v < prev['value'] else 'equal')
        above2 = v is not None and prev2 is not None and prev['value'] is not None and prev2['value'] is not None and v > prev['value'] and v > prev2['value']
        high16 = full and v is not None and v >= mx(candidates, 'value')
        extreme = bands and high16 and v > bands[2]
        major = not extreme and bands and ((high16 and v > bands[0]) or (above2 and v > bands[1]))
        minor = not extreme and not major and bands and above2 and v > bands[0]
        spike = 'extreme' if extreme else 'major' if major else 'minor' if minor else None
        side = ('high' if b['close'] >= (b['high'] + b['low']) / 2 else 'low') if spike else None
        if extreme:
            line = {'time': b['time'], 'price': b[side]}
            if side == 'high': high_line = line
            else: low_line = line
        fraction = abs(b['close'] - b['open']) / r if r > 0 else 0
        rows.append({**b, 'range': r, 'density': density, 'value': v, 'rvol': rv, 'relativeDensity': rd, 'relativeRange': rr, 'referenceCount': len(refs), 'baseline': base, 'climax': c, 'churn': h, 'climaxSignal': sc or wc, 'churnSignal': sh or wh, 'kind': kind, 'spike': spike, 'spikeSide': side, 'sma': sma, 'sigma': sigma, 'bands': bands, 'closeLocation': (b['close'] - b['low']) / r if r > 0 else .5, 'bodyFraction': fraction, 'deltaProxy': None if v is None else v * (1 if b['close'] > b['open'] else -1 if b['close'] < b['open'] else 0), 'effortResult': 'HIGH_EFFORT_SMALL_BODY' if v is not None and sma is not None and v > sma * 1.5 and fraction < .3 else 'NONE', 'sequence': 'CLIMAX_THEN_CHURN' if prev and prev['climaxSignal'] and (sh or wh) else None, 'ready': full and sma is not None})
        day = b['time'] // DAY
        if day != day_key:
            day_key = day
            actual = expected = seen = known = 0
        seen += 1
        if rv is not None:
            known += 1
            actual += v
            expected += base
        if v is not None:
            slots[b['time'] % DAY] = (history + [{'volume': v, 'range': r, 'density': density}])[-15:]
    pivots = {'high': None, 'low': None}
    for i in range(2, len(rows) - 2):
        b = rows[i]
        for side in ('high', 'low'):
            group = rows[i - 2:i + 3]
            if any(y['time'] - x['time'] != 60000 for x, y in zip(group, group[1:])) or not all((b[side] > x[side] if side == 'high' else b[side] < x[side]) for j, x in enumerate(group) if j != 2) or b['volume'] is None:
                continue
            p = pivots[side]
            if p and b['time']-p['time'] <= 3600000 and (b[side] > p[side] if side == 'high' else b[side] < p[side]) and b['volume'] < p['volume'] * .8:
                divergences.append({'direction': 'BEARISH' if side == 'high' else 'BULLISH', 'anchorTime': b['time'], 'confirmedAt': rows[i + 2]['time'] + 60000, 'price': b[side], 'volume': b['volume'], 'priorVolume': p['volume'], 'measurement': 'confirmed price pivot with at least 20% lower raw volume'})
            pivots[side] = b
    for i in range(max(0, len(rows) - 12), len(rows)):
        b = rows[i]
        if not b['climaxSignal'] and not b['spike']: continue
        after, up = rows[i + 1:i + 3], b['closeLocation'] >= .5
        follow.append({'anchorTime': b['time'], 'high': b['high'], 'low': b['low'], 'direction': 'UP' if up else 'DOWN', 'knownAt': after[-1]['time'] + 60000 if len(after) == 2 else None, 'state': 'PENDING' if len(after) < 2 else 'CONTINUATION' if any(x['close'] > b['high'] if up else x['close'] < b['low'] for x in after) else 'OPPOSITE_BREAK' if any(x['close'] < b['low'] if up else x['close'] > b['high'] for x in after) else 'UNRESOLVED'})
    latest = rows[-1] if rows else None
    gaps = sum(b['time'] - a['time'] != 60000 for a, b in zip(bars[-20:], bars[-19:])) if len(bars) >= 20 else sum(b['time'] - a['time'] != 60000 for a, b in zip(bars, bars[1:]))
    return {'method': METHOD, 'mode': 'Volume', 'timeframe': '1m', 'cutoff': latest['time'] if latest else None, 'status': 'unavailable' if not latest or latest['volume'] is None else 'gapped' if gaps else 'warming_up' if not latest['ready'] else 'available', 'rows': rows, 'latest': latest, 'divergences': divergences[-6:], 'followThrough': follow, 'extremeLines': {'high': high_line, 'low': low_line}, 'sessionRvol': actual / expected * 100 if seen and seen == known and expected > 0 else None, 'sessionCoverage': {'observedBars': seen, 'matchedBars': known, 'fullSessionStartCovered': any(b['time'] == day_key * DAY for b in bars)}, 'semantics': 'Raw volume is reported venue volume in provider units. UTC same-time ratios need 3–15 prior observed days. Session totals cover supplied matched bars only. Candle-sign delta is a proxy, not bid/ask delta. Absorption, supply/demand and exhaustion are hypotheses. No order-book depth, institution identity, execution or calibrated trading edge.'}


def questions():
    common = 'Use `volumeEvidence` and completed context; apply its semantics. Use server-computed `marketGeometry.frames[].channels[].volumeContext` to locate volume at baseline, autoline or derived median. Raw rolling volume/density ratios are not same-time RVOL/RelativeDensity. Independent question. '
    result = {}
    def add(name, instruction, criteria):
        result[name] = {'type': 'choice', 'instructions': common + instruction, 'criteria': {**criteria, 'UNAVAILABLE': 'Required evidence missing or invalid.'}}
    add('volume_participation', 'How does recent reported volume compare with its SMA and, when adequately sampled, same-time historical RVOL? Name the available baseline; raw rolling average does not remove seasonality.', {'EXPANDING': 'Increasing participation against available baseline.', 'CONTRACTING': 'Decreasing participation against available baseline.', 'ORDINARY': 'Near baseline without clear change.', 'MIXED': 'Raw and same-time or recent comparisons disagree.'})
    add('volume_effort_result', 'Does high measured volume produce directional price progress, or little net progress with rejection? Small candle body alone is not absorption proof. Require measured volume/range, observed line contact, a completed close away and later confirmation; missing relative history remains unknown.', {'PROGRESS_UP': 'Effort accompanies completed upward progress.', 'PROGRESS_DOWN': 'Effort accompanies completed downward progress.', 'POSSIBLE_ABSORPTION': 'High effort, limited progress and observed rejection at a relevant level.', 'ORDINARY': 'No qualified effort/result anomaly.', 'MIXED': 'Effort and result conflict without a resolved interpretation.'})
    add('volume_location', 'Where are recent climax/churn/spikes relative to selected liquidity and active channel/Fib context? Require actual contact and completed close, not merely a large colored bar.', {'UPPER_REJECTION': 'Upper hunted level contact and close away below.', 'LOWER_REJECTION': 'Lower hunted level contact and close away above.', 'BREAKOUT_ACCEPTANCE': 'Observed consecutive closes accepting through a selected level.', 'NO_OVERLAP': 'Available signal evidence is away from selected levels.', 'CONFLICTED': 'Both sides or channels give incompatible contacts.'})
    add('volume_sequence', 'Assess the observed climax then churn sequence and candle close location; do not assume every sequence causes a turn.', {'UPPER_STALL': 'Sequence with completed upper level rejection.', 'LOWER_STALL': 'Sequence with completed lower level rejection.', 'CONTINUATION': 'Sequence followed by completed acceptance in original direction.', 'NONE': 'No qualified sequence in supplied recent evidence.', 'UNRESOLVED': 'Sequence exists but subsequent evidence is inconclusive.'})
    add('volume_follow_through', 'What do timestamped followThrough states show for the most relevant recent signal? Never classify missing continuation as reversal. Use knownAt and no future bar.', {'CONTINUATION': 'Two subsequent bars include a close beyond directional extreme.', 'OPPOSITE_BREAK': 'Observed close beyond opposite extreme.', 'PENDING': 'Two subsequent completed bars are not yet available.', 'UNRESOLVED': 'No decisive close beyond either extreme, or incompatible events.', 'NONE': 'No recent signal to assess.'})
    add('volume_pullback', 'Within available parent trend and a selected level, is the corrective leg losing participation and then resuming price progress? Avoid counting presumed pullbacks or calling a third pullback unsafe without evidence.', {'UP_RESUMPTION': 'Rising parent context, lighter pullback and completed upward resumption.', 'DOWN_RESUMPTION': 'Falling parent context, lighter pullback and completed downward resumption.', 'CORRECTION_ONLY': 'Lighter corrective leg but no completed resumption.', 'CONFLICTED': 'Volume or parent trend contradicts resumption.', 'NONE': 'No coherent corrective leg and resumption evidence.'})
    add('volume_divergence', 'Assess confirmed raw-volume/price pivot divergences with recorded anchorTime and confirmedAt. Candle-sign delta cannot establish bid/ask divergence.', {'BEARISH': 'Confirmed higher high with at least 20% lower raw pivot volume.', 'BULLISH': 'Confirmed lower low with at least 20% lower raw pivot volume.', 'BOTH': 'Recent confirmed divergences in both directions.', 'NONE': 'No confirmed divergence; unconfirmed pivots do not qualify.'})
    add('volume_geometry_agreement', 'Does observed volume and price reaction agree with active higher-frame geometry? Broken rails are references; missing parents cannot establish agreement.', {'UP_ALIGNED': 'Available parent trend and reaction support upward scenario.', 'DOWN_ALIGNED': 'Available parent trend and reaction support downward scenario.', 'COUNTERTREND': 'Reaction opposes a coherent parent trend.', 'CONFLICTED': 'Parents and reaction disagree without coherent context.'})
    add('volume_invalidation', 'What observed evidence would invalidate the volume-supported reaction at the selected level? Assess actual closes and known signal extremes; invent no stop/target.', {'ACCEPTED_THROUGH': 'Completed consecutive closes have accepted through the reaction level.', 'OPPOSITE_PROGRESS': 'Observed strong directional progress contradicts the reaction.', 'STILL_CONDITIONAL': 'Potential reaction has not been invalidated but remains conditional.', 'NO_VALID_REACTION': 'No observed volume-supported reaction to invalidate.'})
    add('volume_supplement', 'How should volume supplement the selected-level liquidity watch? Use observed price confirmation and frozen risk gates directly, without seeing other question answers. Volume cannot create a level, move brackets, authorize a ticket or estimate profit.', {'SUPPORTS_LONG_WATCH': 'Qualified lower reaction with compatible volume and price confirmation.', 'SUPPORTS_SHORT_WATCH': 'Qualified upper reaction with compatible volume and price confirmation.', 'WAIT_CONFIRMATION': 'Interesting volume but missing qualified completed confirmation.', 'CONTRADICTS': 'Observed acceptance/progress opposes the proposed reaction.', 'NEUTRAL': 'Available volume adds no meaningful directional evidence.'})
    add('volume_evidence_quality', 'Assess volume evidence quality, supplied history coverage, source freshness, missing bars, units and same-time reference counts. Need not have RVOL for a valid raw-volume read; report relative limitations explicitly.', {'RAW_ONLY': 'Valid completed raw OHLCV; same-time sample unavailable.', 'RELATIVE_LIMITED': 'Raw valid; same-time ratio has 3–14 observed historical samples.', 'RELATIVE_FULL': 'Raw valid; same-time ratio has 15 prior observed samples.', 'CONFLICTED': 'Volume source or measurements conflict.'})
    return result

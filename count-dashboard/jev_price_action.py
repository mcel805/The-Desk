"""Causal price-action paper overlay. Uses saved Jev forecasts; no network calls."""
import math

VERSION = 'jev.sar-pullback-cost-aware.paper.v6'
BAND_VERSION = 'jev.sar-directed-channel-resting-limit-swing.paper.v5'


def plan(row, previous, config, band_plan, sar_direction):
    p = band_plan(row, previous, {**config, 'version': BAND_VERSION})
    p['version'] = config.get('version',VERSION)
    bars = row.get('completedInput', [])
    last = previous[-1].get('paperTrade', {}) if previous else {}
    valid = bool(row.get('status') == 'predicted' and row.get('comparisonEligible') and row.get('jev'))
    tick = row['tick']
    exploration = config.get('entryPreset') == 'exploration'
    margin = config.get('costMargin',2) if exploration else 2
    minimum_rr = config.get('minNetRewardRisk',1.25) if exploration else 1.25
    execution_atr = None
    stop_buffer = tick
    if exploration and config.get('stopBufferAtr',0)>0:
        context = bars[-15:]
        if len(context)<15: raise ValueError('Need 15 completed 1m bars for the stop volatility buffer')
        true_ranges = [max(b['high']-b['low'], abs(b['high']-context[i-1]['close']), abs(b['low']-context[i-1]['close'])) for i,b in enumerate(context) if i]
        execution_atr = sum(true_ranges)/14
        stop_buffer = max(tick, config['stopBufferAtr']*execution_atr)
        p.update(executionAtr=execution_atr,stopBuffer=stop_buffer,stopRule=config['stopModel'])

    def structural_stop(long, include_mark=False):
        # The calibrated edge already includes prior completed forecast misses.
        candidates = [p['channelLow']-stop_buffer, min(x['low'] for x in bars[-3:])-stop_buffer] if long else [p['channelHigh']+stop_buffer, max(x['high'] for x in bars[-3:])+stop_buffer]
        if include_mark: candidates.append(bars[-1]['close']-tick if long else bars[-1]['close']+tick)
        level = min(candidates) if long else max(candidates)
        return math.floor(level/tick)*tick if long else math.ceil(level/tick)*tick

    def skip(reason):
        p.update(status='cancelled' if last.get('status') == 'working' else 'skipped', reason=reason, orderAction='CANCELLED')
        return p

    if last.get('status') == 'open':
        long = last['side'] == 'LONG'
        sar, _ = sar_direction(bars)
        unavailable = 0
        seen = set()
        for old in reversed(previous):
            identity = old.get('forecastId',old['targetTime'])
            if 'forecastId' in row and identity==row['forecastId']: continue
            if identity in seen: continue
            seen.add(identity)
            if old.get('status') == 'predicted' and old.get('comparisonEligible') and old.get('jev'): break
            unavailable += 1
        age = (row['targetTime'] - last['openedAt']) / 60000
        reason = ('SAR_FLIP' if sar and (sar == 'UP') != long else
                  'TIME_EXIT' if age >= config.get('maxHoldMinutes',5) else
                  'FORECAST_UNAVAILABLE' if not valid and unavailable >= 1 else None)
        # A new range cannot tighten a stop through the last observed price.
        # Tighten only after a favorable close, retain the old stop otherwise.
        favorable = len(bars) >= 2 and ((bars[-1]['close'] > bars[-2]['close']) if long else (bars[-1]['close'] < bars[-2]['close']))
        if favorable and valid:
            candidate = min(p['stop'], p['channelLow']-.75*row['atr'], min(x['low'] for x in bars[-3:])-tick, bars[-1]['close']-tick) if long else max(p['stop'], p['channelHigh']+.75*row['atr'], max(x['high'] for x in bars[-3:])+tick, bars[-1]['close']+tick)
            if exploration: candidate = structural_stop(long,include_mark=True)
            candidate = math.floor(candidate/tick)*tick if long else math.ceil(candidate/tick)*tick
            p['stop'] = max(last['stop'], candidate) if long else min(last['stop'], candidate)
        else: p['stop'] = last['stop']
        p['sarDirection'] = sar
        p['holdMinutes'] = age
        if reason: p.update(exitAtOpen=reason, reason='Exit at next open: '+reason)
        return p

    if not valid: return skip('Fresh Jev forecast unavailable; no stale limit exposure')
    if p['balanceBefore'] <= config['capital'] * .98: return skip('Session realized-loss limit reached (2%)')
    if p.get('status') != 'working': return p
    sar, _ = sar_direction(bars)
    long = sar == 'UP'
    if last.get('status') == 'working':
        if last['side'] != ('LONG' if long else 'SHORT'): return skip('SAR flipped; cancel the old limit before another setup')
        age = (row['targetTime'] - last['orderPlacedAt']) / 60000
        if age >= config.get('limitTtlMinutes',2): return skip('Unfilled limit expired; wait for a new setup')
        # Keep the original level. A later forecast may cancel it, never chase it.
        target_supported = p['channelHigh'] >= last['entry'] + .5*(last['target']-last['entry']) if long else p['channelLow'] <= last['entry'] - .5*(last['entry']-last['target'])
        if not target_supported: return skip('Fresh Jev band no longer supports the frozen swing')
        for key in ('side','entry','limitPrice','target','stop','initialStop','quantity','riskBudget','plannedRisk','entryEdge','orderPlacedAt','channelLow','channelHigh','plannedNetReward','netRewardRisk','roundTripCostPerUnit','setup','stopRule','executionAtr','stopBuffer'):
            if key in last: p[key] = last[key]
        p.update(orderAge=age, orderAction='UNCHANGED', reason='Keep qualified passive limit fixed; no repricing toward market')
        return p

    entry, target = p['entry'], p['target']
    slip, fee = config['slippageBps']/10000, config['feeBps']/10000
    direction = 1 if long else -1
    gross_reward = direction * (target-entry)
    target_fill = target if exploration else target * (1-direction*slip)
    costs = (entry+target_fill)*fee + (0 if exploration else target*slip)
    p.update(grossRewardPerUnit=gross_reward, roundTripCostPerUnit=costs,
             netRewardPerUnit=gross_reward-costs, requiredGrossRewardPerUnit=margin*costs, costMargin=margin, minimumNetRewardRisk=minimum_rr, stopRule=config.get('stopModel','band-width-structure-atr'))
    if gross_reward <= 0 or gross_reward < margin*costs:
        return skip(f'Swing too small after costs: {gross_reward:.2f} price room; need {margin*costs:.2f}')
    if len(bars) < 4: return skip('Need completed price-action structure')
    prior_sar, _ = sar_direction(bars[:-1])
    if prior_sar != sar: return skip('Wait for two completed bars agreeing with SAR')
    b, prev = bars[-1], bars[-2]
    span = max(tick, b['high']-b['low'])
    favorable = b['close'] > prev['close'] if long else b['close'] < prev['close']
    rejection = ((b['close']-b['low'])/span >= .55 and (b['low'] <= prev['low'] or b['close'] > b['open'])) if long else ((b['high']-b['close'])/span >= .55 and (b['high'] >= prev['high'] or b['close'] < b['open']))
    passive = entry < b['close'] if long else entry > b['close']
    if not (passive and (exploration or (favorable and rejection))): return skip('Waiting for a passive band limit below/above the completed price' if exploration else 'Waiting for favorable completed pullback/rejection and a passive band limit')
    atr = row['atr']
    stop = min(p['stop'], p['channelLow']-.75*atr, min(x['low'] for x in bars[-3:])-tick) if long else max(p['stop'], p['channelHigh']+.75*atr, max(x['high'] for x in bars[-3:])+tick)
    if exploration: stop = structural_stop(long)
    stop = math.floor(stop/tick)*tick if long else math.ceil(stop/tick)*tick
    if stop <= 0: return skip('Invalid protective stop')
    stop_fill = stop*(1-direction*slip)
    risk = abs(entry-stop) + stop*slip + entry*fee + stop_fill*config.get('takerFeeBps',config['feeBps'])/10000
    net_reward = gross_reward-costs
    p['netRewardRisk'] = net_reward/risk
    if net_reward < minimum_rr*risk: return skip(f'Net reward/risk {net_reward/risk:.2f}; need at least {minimum_rr:g}')
    budget = min(p['balanceBefore']*config['riskPct']/100, config['maxRiskUsd'])
    qty = math.floor(min(budget/risk, min(config['maxNotional'],p['balanceBefore'])/(entry*(1+fee))) * 1e8)/1e8
    if qty <= 0: return skip('Position rounds to zero')
    p.update(stop=stop, initialStop=stop, quantity=qty, riskBudget=budget,
             plannedRisk=risk*qty, plannedNetReward=net_reward*qty,
             setup='Immediate SAR-directed passive band limit' if exploration else 'SAR pullback / rejection', orderAge=0, orderAction='PLACED',
             orderPlacedAt=row['targetTime'], reason='Qualified exploration swing; immediate passive Jev-band limit' if exploration else 'Qualified price-action swing; cost-covered passive Jev-band limit')
    return p


def settle(p, actual, config, band_settle):
    """Use the existing conservative limit model with explicit structural exits."""
    long = p.get('side') == 'LONG'
    if p.get('status') == 'holding' and p.get('exitAtOpen'):
        stop_gap = actual['open'] <= p['stop'] if long else actual['open'] >= p['stop']
        level = actual['open']
        target_gap = actual['open'] >= p['target'] if long else actual['open'] <= p['target']
        reason = 'STOP_GAP' if stop_gap else 'JEV_BAND_TARGET' if target_gap else p['exitAtOpen']
        if target_gap and not stop_gap: level = p['target']
        direction = 1 if long else -1
        fill = level*(1-direction*config['slippageBps']/10000)
        qty = p['quantity']
        gross = direction*(level-p['entryFill'])*qty
        slip = abs(fill-level)*qty
        fees = (p['entryFill']+fill)*qty*config['feeBps']/10000
        net = gross-slip-fees
        return {**p, 'status':'closed', 'reason':reason, 'entryFill':p['entryFill'],
                'exit':level, 'exitFill':fill, 'grossPnl':round(gross,8),
                'slippage':round(slip,8), 'fees':round(fees,8), 'netPnl':round(net,8),
                'balanceAfter':round(p['balanceBefore']+net,8), 'ambiguous':False,
                'timing':'Next one-minute open; exact tick fills unavailable'}
    adjusted = dict(p)
    if p.get('status') == 'holding':
        # Stops cannot fill at a better price than an adverse opening gap.
        adjusted['stop'] = min(p['stop'],actual['open']) if long else max(p['stop'],actual['open'])
    outcome = band_settle(adjusted, actual, {**config,'version':BAND_VERSION})
    outcome['version'] = VERSION
    if outcome.get('status') == 'closed' and adjusted.get('stop') != p.get('stop'):
        outcome.update(reason='STOP_GAP', stop=p['stop'])
    for key in ('plannedNetReward','netRewardRisk','roundTripCostPerUnit','setup','stopBuffer','executionAtr'):
        if key in p: outcome[key] = p[key]
    return outcome

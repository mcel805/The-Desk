"""Causal liquidity playbooks. No model calls, chart changes or order routing."""
import math

PLAYBOOKS = ('rejection_retest', 'break_retest')


def detect(bars, level, policy, enabled=PLAYBOOKS, after=0):
    """Distinct completed bars for reaction, departure, retest and confirmation.

    Two consecutive closes beyond a zone establish acceptance. A retest must
    occur after departure; a later close through its extreme confirms timing.
    Every attempt has an identity anchored to its first reaction bar.
    """
    if len(bars) < 20:
        return []
    tail = bars[-20:]
    atr = sum(max(b['high']-b['low'], abs(b['high']-(tail[i-1]['close'] if i else b['open'])), abs(b['low']-(tail[i-1]['close'] if i else b['open']))) for i,b in enumerate(tail))/len(tail)
    tol = max(atr * policy['touchAtr'], level['price'] * .000001)
    price = level['price']; expiry = int(policy['expiryBars']); out = []
    for direction in (1, -1):
        for kind in enabled:
            for i in range(max(1, len(bars)-expiry-4), len(bars)):
                b = bars[i]
                if b['time'] < after or b['time'] < level.get('born', 0):
                    continue
                if kind == 'rejection_retest':
                    if level['side'] != -direction:
                        continue
                    reaction = (b['low'] <= price+tol and b['close'] > price+tol) if direction == 1 else (b['high'] >= price-tol and b['close'] < price-tol)
                    j = i
                else:
                    prev = bars[i-1]
                    reaction = direction*(prev['close']-price) <= tol and direction*(b['close']-price) > tol
                    j = i+1
                    if j >= len(bars) or direction*(bars[j]['close']-price) <= tol:
                        continue
                if not reaction:
                    continue
                span = bars[i:]
                if any(y['time']-x['time'] != 60000 for x,y in zip(span,span[1:])) or len(bars)-1-j > expiry:
                    continue
                departure = next((k for k in range(j+1,len(bars)) if direction*((bars[k]['low'] if direction==1 else bars[k]['high'])-price)>tol), None)
                stage = 'REACTION'; retest = None; trigger = None
                if departure is not None and any(direction*(bars[k]['close']-price)<-tol for k in range(j+1,departure+1)):
                    continue
                if departure is not None:
                    stage = 'DEPARTED'
                    for k in range(departure+1,len(bars)):
                        r=bars[k]
                        if direction*(r['close']-price) < -tol:
                            stage='INVALIDATED'; break
                        if r['low'] <= price+tol and r['high'] >= price-tol and direction*(r['close']-price)>0:
                            retest=k;stage='RETEST_HELD'
                            for n in range(k+1,len(bars)):
                                if direction*(bars[n]['close']-price)<-tol:
                                    stage='INVALIDATED';break
                                extreme=r['high'] if direction==1 else r['low']
                                if direction*(bars[n]['close']-extreme)>0:
                                    stage='READY';trigger=n;break
                            break
                # A trigger from a previous bar is retained for audit, not replayed.
                fresh = trigger == len(bars)-1
                stop_rows=bars[i:(retest+1 if retest is not None else j+1)]
                extreme=min(x['low'] for x in stop_rows) if direction==1 else max(x['high'] for x in stop_rows)
                stop=extreme-direction*atr*policy['stopAtr']
                out.append({'attemptId':f"{level['id']}:{kind}:{direction}:{b['time']}", 'level':level,
                            'playbook':kind,'direction':direction,'stage':stage,'fresh':fresh,
                            'barTime':bars[-1]['time'],'reactionTime':b['time'],
                            'departureTime':bars[departure]['time'] if departure is not None else None,
                            'retestTime':bars[retest]['time'] if retest is not None else None,
                            'triggerTime':bars[trigger]['time'] if trigger is not None else None,
                            'entry':bars[-1]['close'],'stop':stop,'atr':atr,'tolerance':tol,
                            'reason':kind.replace('_',' ')+' · '+stage.replace('_',' ').lower()})
    return out


def questions(candidates):
    """One independent readiness judgment for each mechanically ready attempt."""
    return {'rider_entry_'+str(i):{'type':'choice','instructions':
        f"Evaluate only `riderCandidates[{i}]` against completed tape, volumeEvidence, marketGeometry and parent frames. "
        "This is a paper entry timing judgment. The code has measured the exact rejection/departure/retest/confirmation or "
        "two-close acceptance/departure/retest/confirmation sequence. Validate indicator support and contradictions. "
        "A manual level is human supplied, not indicator-confirmed liquidity. Do not infer institutional activity. "
        "Choose ENTER only for a fresh READY sequence with qualified risk, usable evidence and no material contrary evidence. "
        "Do not invent levels, stops, targets or missing parent evidence. Missing or ambiguous context means WAIT. "
        "Do not use other question answers; evaluate directly from supplied state.",
        'criteria':{'ENTER':'The supplied permitted paper setup is ready and indicator evidence supports its direction.',
                    'WAIT':'Confirmation, evidence quality or indicator agreement is insufficient or ambiguous.',
                    'INVALIDATED':'Observed evidence contradicts the setup or the retest has failed.'}}
        for i,_ in enumerate(candidates)}

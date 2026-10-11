"""Five-minute Jev horizons with causal one-minute paper execution. No broker API."""
import copy
import hashlib
import json
import math
import os
import re
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import jev_nextbar_review as review
import jev_paper_sim as paper
import jev_price_action as action

MINUTE = 60000
HORIZON = 5*MINUTE
METHOD = 'jev.5m-choice-grid.1m-execution.v2'


def aggregate(bars):
    groups = {}
    for b in bars: groups.setdefault(b['time']//HORIZON*HORIZON, []).append(b)
    out = []
    for start, group in sorted(groups.items()):
        if len(group)!=5 or any(b['time']!=start+i*MINUTE for i,b in enumerate(group)): continue
        out.append({'time':start,'open':group[0]['open'],'high':max(b['high'] for b in group),
                    'low':min(b['low'] for b in group),'close':group[-1]['close'],
                    'volume':sum(b['volume'] for b in group)})
    return out


def predict(payload):
    run=str(payload.get('run',''))
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',run): raise ValueError('Invalid review run ID')
    source=payload.get('source',{})
    if any(source.get(k)!=v for k,v in {'kind':'replay','provider':'hyperliquid','symbol':'BTC'}.items()):
        raise ValueError('Five-minute strategy requires public Hyperliquid BTC historical replay')
    if payload.get('jev') is not True or not review.configured(): raise ValueError('Five-minute strategy requires configured Jev')
    raw=payload.get('bars')
    if not isinstance(raw,list) or not 300<=len(raw)<=360: raise ValueError('Supply 300–360 preceding completed one-minute bars')
    # Reuse the existing strict one-minute validator without changing legacy limits.
    bars=[]
    for b in raw:
        bar=review.clean_bars([b],1)[0]
        if bars and bar['time']!=bars[-1]['time']+MINUTE: raise ValueError('One-minute context must be contiguous')
        bars.append(bar)
    cutoff=bars[-1]['time'];target=cutoff+MINUTE;start=target//HORIZON*HORIZON
    if source.get('completedCutoff')!=cutoff: raise ValueError('Cutoff must equal the final completed one-minute bar')
    forecast_bars=aggregate(bars)[-60:]
    if len(forecast_bars)!=60 or forecast_bars[-1]['time']+HORIZON!=start:
        raise ValueError('Need 60 completed five-minute context bars; forming buckets are excluded')
    config=paper.validate_config(payload.get('paperSim'))
    tick=review.finite(payload.get('tick'),'Analysis tick unit');mult=review.finite(payload.get('atrMult'),'ATR multiplier')
    if not 1e-8<=tick<=100000 or not .1<=mult<=10: raise ValueError('Tick or ATR multiplier outside bounds')
    fingerprint=hashlib.sha256(review.enc({'bars':bars,'source':source,'paperSim':config,'tick':tick,'atrMult':mult,'method':METHOD}).encode()).hexdigest()
    with review.connection() as db:
        if db.execute('SELECT 1 FROM paper_session_ends WHERE run=?',(run,)).fetchone(): raise ValueError('Paper session finalized; reset for new requests')
        previous=[json.loads(r[0]) for r in db.execute('SELECT body FROM receipts WHERE run=? ORDER BY target',(run,))]
        old=next((r for r in previous if r['targetTime']==target),None)
        if old:
            if old['stateHash']!=fingerprint: raise ValueError('Forecast already frozen; reset for new settings')
            return old
        if previous:
            last=previous[-1]
            if last['method']!=METHOD or last['paperSim']!=config or last['tick']!=tick or last['atrMult']!=mult or last['source']!={'kind':'replay','provider':'hyperliquid','symbol':'BTC','timeframe':'1m','forecastTimeframe':'5m'}:
                raise ValueError('Reset the run before changing settings')
            if not last.get('actual') or target!=last['targetTime']+MINUTE: raise ValueError('Resolve each consecutive one-minute paper candle first')
            # Completed input is immutable across overlapping requests.
            known={b['time']:b for b in last['completedInput']+[last['actual']]}
            if any(b['time'] in known and b!=known[b['time']] for b in bars): raise ValueError('Completed tape changed during the replay')
        elif target!=start: raise ValueError('Start a five-minute strategy on a five-minute boundary')
        if len(previous)>=config['sessionMinutes']: raise ValueError('Paper session length reached')
        cached=next((r for r in previous if r.get('forecastId')==start),None)
        if not cached and sum(not r.get('forecastReused') for r in previous)>=review.MAX_JEV_READS: raise ValueError('Jev read limit reached')
        a=review.atr(forecast_bars)
        if a<=0: raise ValueError('Five-minute ATR is zero')
        close=forecast_bars[-1]['close'];created=review.now()
        row={'run':run,'targetTime':target,'cutoff':cutoff,'source':{'kind':'replay','provider':'hyperliquid','symbol':'BTC','timeframe':'1m','forecastTimeframe':'5m'},
             'method':METHOD,'createdAt':created,'tick':tick,'atrMult':mult,'atr':a,
             'baseline':review.band(close+mult*a,close-mult*a,tick),'jevEnabled':True,
             'stateHash':fingerprint,'status':'pending','actual':None,'completedInput':bars,
             'directionInput':forecast_bars,'forecastMinutes':5,'forecastId':start,
             'forecastStart':start,'forecastEnd':start+HORIZON,'forecastReused':bool(cached),
             'paperSim':config,'usage':None,'estimatedUsd':None,'latencyMs':None,'jev':None}
        db.execute('INSERT INTO receipts VALUES(?,?,?,?)',(run,target,fingerprint,review.enc(row)))
    if cached:
        if cached['status']=='pending': raise ValueError('Five-minute forecast still pending')
        for key in ('status','jev','baseline','confidence','closeDirection','comparisonEligible','slow','late','error','model'):
            if key in cached: row[key]=copy.deepcopy(cached[key])
        for key in ('jev','baseline'):
            if row.get(key): row[key].pop('result',None)
        if row.get('closeDirection'):
            for key in ('actual','matched'):row['closeDirection'].pop(key,None)
        row.update(estimatedUsd=0.0,returnedAt=review.now(),forecastReturnedAt=cached.get('returnedAt'))
    else:
        criteria={f'b{i}':{'price':round(close+offset*a,10),'offsetATR':offset,'meaning':'Candidate price nearest to the predicted extreme'} for i,offset in enumerate(review.OFFSETS) if close+offset*a>0}
        criteria['UNAVAILABLE']='Outside the candidate grid or insufficient evidence for a prediction'
        questions={side:{'type':'choice','instructions':f'Using ONLY the completed OHLCV in state, forecast the {side} of the immediately next five-minute candle. Select the candidate price nearest to that extreme. This is an experimental numerical forecast; no next candle has been supplied. Choose UNAVAILABLE if the grid cannot express the forecast. Do not classify trading actions. The forecast covers [state.forecastStart,state.forecastEnd).','criteria':criteria} for side in ('high','low')}
        questions['close_up']={'type':'noul','instructions':'Will the immediately next five-minute candle close strictly higher than state.lastClose? Use only the completed five-minute bars. Judge price direction only, not profitability.','criteria':{'true':'Next five-minute close greater than lastClose','false':'Next five-minute close equal to or below lastClose'}}
        state={'source':{'provider':'hyperliquid','symbol':'BTC','timeframe':'5m','completedCutoff':forecast_bars[-1]['time']},'completedBars':forecast_bars,'lastClose':close,'atr14SMA':a,'forecastStart':start,'forecastEnd':start+HORIZON,'targetTime':start,'features':{'closeChange5ATR':(close-forecast_bars[-6]['close'])/a,'closeChange20ATR':(close-forecast_bars[-21]['close'])/a,'latestVolumeToPrior20':forecast_bars[-1]['volume']/(sum(b['volume'] for b in forecast_bars[-21:-1])/20) if sum(b['volume'] for b in forecast_bars[-21:-1]) else None},'scope':'Historical causal replay; target and future candles withheld'}
        wire={'model':review.MODEL,'state':state,'questions':questions};row['questions']=questions;row['requestBytes']=len(review.enc(wire).encode())
        begin=time.perf_counter()
        try:
            request=Request(review.API_URL,data=review.enc(wire).encode(),headers={'Authorization':'Bearer '+os.environ['TYPESAFE_API_KEY'].strip(),'Content-Type':'application/json'})
            with urlopen(request,timeout=35) as response: result=json.load(response)
            row['rawAnswers']=result.get('answers');row['model']=result.get('model')
            row['usage']=review.validated_usage(result.get('usage'));row['estimatedUsd']=round(row['usage']['input_tokens']*review.INPUT_USD_PER_MILLION/1e6,8)
            if result.get('model')!=review.MODEL: raise ValueError('Unexpected Jev model version')
            answers=review.validate_answers(result.get('answers'),questions)
            for answer in answers:
                if answer['type']=='choice' and answer['probabilities'][answer['choice']]+1e-9<max(answer['probabilities'].values()): raise ValueError('Jev choice does not match its largest probability')
            by={x['name']:x for x in answers};prob=by['close_up']['noul']
            row['closeDirection']={'probabilityCloseUp':prob,'judgment':'UP' if prob>=.5 else 'NOT_UP','referenceClose':close,'timeframe':'5m'}
            if any(by[k]['choice']=='UNAVAILABLE' for k in ('high','low')): row['status']='abstained'
            else:
                row['jev']=review.band(criteria[by['high']['choice']]['price'],criteria[by['low']['choice']]['price'],tick)
                row['confidence']={k:by[k]['confidence'] for k in ('high','low')};row['status']='predicted'
        except HTTPError as exc:
            row.update(status='failed',error='TypeSafe HTTP '+str(exc.code))
        except Exception as exc: row.update(status='failed',error=str(exc)[:300])
        row.update(returnedAt=review.now(),apiLatencyMs=round((time.perf_counter()-begin)*1000))
        row['latencyMs']=row['returnedAt']-created;row['slow']=row['latencyMs']>=30000;row['late']=False
        row['comparisonEligible']=row['status']=='predicted' and not row['slow']
    row['paperPlan']=paper.plan(row,previous,config)
    review.store(row)
    return row


def resolve(row,payload):
    if row['status']=='pending': raise ValueError('Forecast still pending')
    actual=review.clean_bars([payload.get('actual',{})],1)[0]
    if actual['time']!=row['targetTime']: raise ValueError('Resolve only the next one-minute candle')
    if row.get('actual'):
        if row['actual']!=actual: raise ValueError('Outcome already frozen')
        return row
    row.update(actual=actual,resolvedAt=review.now())
    if actual['time']+MINUTE==row['forecastEnd']:
        prior=review.run_receipts(row['run'])['receipts']
        parts=[r['actual'] for r in prior if r.get('forecastId')==row['forecastId'] and r.get('actual')]+[actual]
        combined=aggregate(parts)
        if len(combined)!=1: raise ValueError('Five-minute forecast needs all five resolved one-minute bars')
        row['forecastActual']=combined[0];observed=combined[0]
        for method in ('baseline','jev'):
            prediction=row.get(method)
            if prediction:
                prediction['result']={'highOK':observed['high']<=prediction['high'],'lowOK':observed['low']>=prediction['low'],'contained':observed['high']<=prediction['high'] and observed['low']>=prediction['low'],'highErrorTicks':abs(prediction['high']-observed['high'])/row['tick'],'lowErrorTicks':abs(prediction['low']-observed['low'])/row['tick']}
        if row.get('closeDirection'):
            up=observed['close']>row['closeDirection']['referenceClose']
            row['closeDirection'].update(actual='UP' if up else 'NOT_UP',matched=(row['closeDirection']['judgment']=='UP')==up)
    row['paperTrade']=paper.settle(row['paperPlan'],actual,row['paperSim'])
    review.store(row)
    return row


def plan(row,previous,config):
    def calibrated_band(current,prior,band_config):
        scored=[]
        for r in prior:
            adjusted=dict(r)
            adjusted['comparisonEligible']=bool(r.get('forecastActual') and r.get('comparisonEligible'))
            if r.get('forecastActual'): adjusted['actual']=r['forecastActual']
            scored.append(adjusted)
        return paper._plan_band(current,scored,band_config)
    def direction(one_minute_bars):
        five=row['directionInput']
        # The v6 stable-direction check passes the one-minute prefix without its last bar.
        return paper._sar_direction(five[:-1] if len(one_minute_bars)==len(row['completedInput'])-1 else five)
    p=action.plan(row,previous,config,calibrated_band,direction)
    p.update(version=config['version'],forecastTimeframe='5m',executionTimeframe='1m',forecastId=row['forecastId'],forecastEnd=row['forecastEnd'])
    return p


def settle(p,actual,config):
    outcome=action.settle(p,actual,config,paper.settle)
    outcome['version']=config['version']
    if outcome.get('status')=='closed':
        target=outcome['reason']=='JEV_BAND_TARGET'
        direction=1 if outcome['side']=='LONG' else -1
        level=outcome['exit'];entry=outcome['entryFill'];qty=outcome['quantity']
        fill=level if target else level*(1-direction*config['slippageBps']/10000)
        exit_fee=config['feeBps'] if target else config['takerFeeBps']
        gross=direction*(level-entry)*qty;slip=abs(fill-level)*qty
        fees=(entry*config['feeBps']+fill*exit_fee)*qty/10000
        net=gross-slip-fees
        outcome.update(exitFill=fill,grossPnl=round(gross,8),slippage=round(slip,8),fees=round(fees,8),netPnl=round(net,8),balanceAfter=round(p['balanceBefore']+net,8),entryFeeBps=config['feeBps'],exitFeeBps=exit_fee,exitLiquidity='maker-assumed' if target else 'taker-assumed')
    return outcome

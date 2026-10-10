"""Isolated next-candle experiment. No desk/account/strategy/order dependencies."""
import hashlib
import json
import math
import os
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

DB_PATH = Path(__file__).resolve().parent / 'data' / 'jev-nextbar-review.sqlite3'
_CALL_LOCK = threading.Lock()
OFFSETS = (-4,-3,-2,-1.5,-1,-.75,-.5,-.25,0,.25,.5,.75,1,1.5,2,3,4)
METHOD = 'jev.nextbar.choice-grid.v1'
MODEL = 'jev-1.13.0'
API_URL = 'https://api.typesafe.ai/v1/systemone'
INPUT_USD_PER_MILLION = .042  # Official model docs checked 2026-10-10.
def configured(): return bool(os.environ.get('TYPESAFE_API_KEY','').strip())

def validated_usage(value):
    if not isinstance(value,dict) or any(isinstance(value.get(k),bool) or not isinstance(value.get(k),int) or value[k]<0 for k in ('input_tokens','output_tokens')):
        raise ValueError('Jev omitted valid measurable token usage')
    return {**value,'total_tokens':value['input_tokens']+value['output_tokens']}

def validate_answers(raw,questions):
    if not isinstance(raw,dict) or set(raw)!=set(questions): raise ValueError('Missing or unexpected answer IDs')
    out=[]
    for name,q in questions.items():
        a=raw[name]
        if not isinstance(a,dict) or a.get('type')!='choice' or a.get('choice') not in q['criteria']: raise ValueError('Invalid typed choice for '+name)
        confidence=finite(a.get('confidence'),'confidence')
        if not 0<=confidence<=1: raise ValueError('Confidence outside 0–1')
        probs=a.get('probabilities')
        if not isinstance(probs,dict) or set(probs)!=set(q['criteria']): raise ValueError('Incomplete probability distribution')
        values=[finite(v,'probability') for v in probs.values()]
        if any(v<0 or v>1 for v in values) or abs(sum(values)-1)>.005: raise ValueError('Invalid probability distribution for '+name+': sum='+format(sum(values),'.6f'))
        out.append({**a,'name':name})
    return out

def now(): return int(time.time()*1000)
def enc(x): return json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False)
def finite(v,label):
    if isinstance(v,bool): raise ValueError(label+' must be a finite number')
    try: v=float(v)
    except (TypeError,ValueError): raise ValueError(label+' must be numeric') from None
    if not math.isfinite(v): raise ValueError(label+' must be finite')
    return v

def clean_bars(rows,minimum=20):
    if not isinstance(rows,list) or not minimum<=len(rows)<=60: raise ValueError('Supply '+str(minimum)+'–60 one-minute bars')
    out=[]
    for row in rows:
        b={k:finite(row.get(k),k) for k in ('time','open','high','low','close','volume')}
        if b['time']%60000 or (out and b['time']!=out[-1]['time']+60000): raise ValueError('Bars must be aligned, contiguous and ordered')
        if b['low']<=0 or b['volume']<0 or b['high']<max(b['open'],b['close'],b['low']) or b['low']>min(b['open'],b['close']): raise ValueError('Invalid OHLCV')
        b['time']=int(b['time']);out.append(b)
    return out

def atr(bars):
    values=[max(b['high']-b['low'],abs(b['high']-bars[i-1]['close']),abs(b['low']-bars[i-1]['close'])) for i,b in enumerate(bars) if i]
    return sum(values[-14:])/14

def band(high,low,tick):
    high=math.ceil(high/tick-1e-9)*tick;low=math.floor(low/tick+1e-9)*tick
    if low<=0 or high<low: raise ValueError('Predicted prices are crossed or nonpositive')
    return {'high':high,'low':low,'widthTicks':(high-low)/tick}

def public_source(minutes=122):
    minutes=finite(minutes,'Replay history minutes')
    if not minutes.is_integer() or not 61<=minutes<=1440: raise ValueError('Replay history must be 61–1440 minutes')
    stamp=now()
    data={'type':'candleSnapshot','req':{'coin':'BTC','interval':'1m','startTime':stamp-int(minutes)*60000,'endTime':stamp}}
    with urlopen(Request('https://api.hyperliquid.xyz/info',data=enc(data).encode(),headers={'Content-Type':'application/json'}),timeout=12) as r: raw=json.load(r)
    if not isinstance(raw,list): raise RuntimeError('Public candle source unavailable')
    bars=[{'time':int(x['t']),'open':float(x['o']),'high':float(x['h']),'low':float(x['l']),'close':float(x['c']),'volume':float(x['v'])} for x in raw if int(x['t'])+60000<=stamp]
    bars.sort(key=lambda b:b['time']);clean_bars(bars[-60:])
    if stamp-bars[-1]['time']-60000>90000: raise RuntimeError('Public completed candle source is stale')
    return {'source':{'provider':'hyperliquid','symbol':'BTC','timeframe':'1m','snapshotAsOf':stamp,'completedCutoff':bars[-1]['time']},'bars':bars}

@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(DB_PATH,timeout=5)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS receipts(run TEXT,target INTEGER,hash TEXT,body TEXT,PRIMARY KEY(run,target))')
    try: yield db;db.commit()
    finally: db.close()

def store(row):
    with connection() as db: db.execute('UPDATE receipts SET body=? WHERE run=? AND target=?',(enc(row),row['run'],row['targetTime']))

def status():
    return {'configured':configured(),'model':MODEL,'method':METHOD,'destination':API_URL,'inputUsdPerMillion':INPUT_USD_PER_MILLION,'mode':'Chart experiment only','maxJevReadsPerRun':30}

def predict(payload):
    if not _CALL_LOCK.acquire(blocking=False): raise ValueError('A chart review is still processing; wait for its receipt')
    try: return _predict(payload)
    finally: _CALL_LOCK.release()

def _predict(payload):
    run=str(payload.get('run',''))
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',run): raise ValueError('Invalid review run ID')
    source=payload.get('source',{})
    kind=source.get('kind')
    if kind not in ('demo','csv','replay','live'): raise ValueError('Choose demo, CSV, replay or live')
    provider=source.get('provider');symbol=str(source.get('symbol',''))
    if provider not in ('synthetic','csv','hyperliquid') or not re.fullmatch(r'[A-Za-z0-9._/-]{1,30}',symbol): raise ValueError('Invalid source identity')
    if (kind=='demo' and provider!='synthetic') or (kind=='csv' and provider!='csv') or (kind in ('live','replay') and (provider!='hyperliquid' or symbol!='BTC')): raise ValueError('Source identity does not match review mode')
    bars=clean_bars(payload.get('bars'));cutoff=bars[-1]['time'];started=now();target=cutoff+60000
    if int(source.get('completedCutoff',-1))!=cutoff: raise ValueError('Cutoff must equal the final supplied bar')
    if kind=='live':
        fresh=public_source();canonical=fresh['bars'][-len(bars):]
        if canonical!=bars: raise ValueError('Completed public tape changed. Refresh before predicting')
        if started<target or now()-target>15000: raise ValueError('Wait for the next minute close: live forecasts start within 15 seconds of bar open')
    tick=finite(payload.get('tick'),'Analysis tick unit');mult=finite(payload.get('atrMult'),'ATR multiplier')
    if not 1e-8<=tick<=100000 or not .1<=mult<=10: raise ValueError('Tick or ATR multiplier outside bounds')
    a=atr(bars)
    if a<=0: raise ValueError('ATR is zero; no usable range scale')
    close=bars[-1]['close'];use_jev=payload.get('jev') is True
    if use_jev and not configured(): raise ValueError('Configure the server-side TypeSafe key before enabling Jev')
    fingerprint=hashlib.sha256(enc({'bars':bars,'source':{'kind':kind,'provider':provider,'symbol':symbol},'tick':tick,'atrMult':mult,'jev':use_jev}).encode()).hexdigest()
    baseline=band(close+mult*a,close-mult*a,tick)
    row={'run':run,'targetTime':target,'cutoff':cutoff,'source':{'kind':kind,'provider':provider,'symbol':symbol,'timeframe':'1m'},'method':METHOD,'createdAt':started,'tick':tick,'atrMult':mult,'atr':a,'baseline':baseline,'jevEnabled':use_jev,'stateHash':fingerprint,'status':'pending' if use_jev else 'baseline_only','actual':None,'completedInput':bars,'usage':None,'estimatedUsd':None,'latencyMs':None,'jev':None}
    with connection() as db:
        old=db.execute('SELECT hash,body FROM receipts WHERE run=? AND target=?',(run,target)).fetchone()
        if old:
            if old[0]!=fingerprint: raise ValueError('Prediction already frozen for this candle; reset for new settings')
            return json.loads(old[1])
        recent=db.execute('SELECT body FROM receipts WHERE run=? ORDER BY target DESC LIMIT 1',(run,)).fetchone()
        if recent:
            prev=json.loads(recent[0])
            if prev['source']!=row['source'] or prev['tick']!=tick or prev['atrMult']!=mult or prev['jevEnabled']!=use_jev: raise ValueError('Reset the run before changing settings')
            if prev['targetTime']>=target: raise ValueError('Advance the completed tape; historical receipts stay frozen')
        if use_jev and db.execute('SELECT count(*) FROM receipts WHERE run=?',(run,)).fetchone()[0]>=30: raise ValueError('30-read limit reached; export and reset')
        db.execute('INSERT INTO receipts VALUES(?,?,?,?)',(run,target,fingerprint,enc(row)))
    if not use_jev: return row
    criteria={f'b{i}':{'price':round(close+offset*a,10),'offsetATR':offset,'meaning':'Candidate price nearest to the predicted extreme'} for i,offset in enumerate(OFFSETS) if close+offset*a>0}
    criteria['UNAVAILABLE']='Outside the candidate grid or insufficient evidence for a prediction'
    questions={side:{'type':'choice','instructions':f'Using ONLY the completed OHLCV in state, forecast the {side} of the immediately next one-minute candle. Select the candidate price nearest to that extreme. This is an experimental numerical forecast; no next candle has been supplied. Choose UNAVAILABLE if the grid cannot express the forecast. Do not classify trading actions.','criteria':criteria} for side in ('high','low')}
    state={'source':{'provider':provider,'symbol':symbol,'timeframe':'1m','completedCutoff':cutoff},'completedBars':bars,'lastClose':close,'atr14SMA':a,'targetTime':target,'features':{'closeChange5ATR':(close-bars[-6]['close'])/a,'closeChange20ATR':(close-bars[-21]['close'])/a if len(bars)>20 else None,'latestVolumeToPrior20':bars[-1]['volume']/(sum(b['volume'] for b in bars[-21:-1])/len(bars[-21:-1])) if sum(b['volume'] for b in bars[-21:-1]) else None},'scope':'Historical or synthetic causal replay' if kind!='live' else 'Forward public completed-bar experiment'}
    wire={'model':MODEL,'state':state,'questions':questions};row['requestBytes']=len(enc(wire).encode());row['questions']=questions
    begin=time.perf_counter()
    try:
        req=Request(API_URL,data=enc(wire).encode(),headers={'Authorization':'Bearer '+os.environ['TYPESAFE_API_KEY'].strip(),'Content-Type':'application/json'})
        with urlopen(req,timeout=35) as response: result=json.load(response)
        row['rawAnswers']=result.get('answers');row['model']=result.get('model')
        row['usage']=validated_usage(result.get('usage'));row['estimatedUsd']=round(row['usage']['input_tokens']*INPUT_USD_PER_MILLION/1e6,8)
        if result.get('model')!=MODEL: raise ValueError('Unexpected Jev model version')
        answers=validate_answers(result.get('answers'),questions)
        for answer in answers:
            if answer['probabilities'][answer['choice']]+1e-9<max(answer['probabilities'].values()): raise ValueError('Jev choice does not match its largest probability')
        if any(x['choice']=='UNAVAILABLE' for x in answers): row['status']='abstained'
        else:
            choices={x['name']:x['choice'] for x in answers};row['jev']=band(criteria[choices['high']]['price'],criteria[choices['low']]['price'],tick);row['confidence']={x['name']:x['confidence'] for x in answers};row['status']='predicted'
    except HTTPError as exc:
        row['status']='failed';row['error']='TypeSafe HTTP '+str(exc.code)+': '+exc.read().decode('utf-8',errors='replace')[:250]
    except Exception as exc:
        row['status']='failed';row['error']=str(exc)[:300]
    row['apiLatencyMs']=round((time.perf_counter()-begin)*1000);row['returnedAt']=now();row['latencyMs']=row['returnedAt']-started;row['slow']=row['latencyMs']>=30000;row['late']=kind=='live' and row['returnedAt']>=target+60000;row['leadSeconds']=(target+60000-row['returnedAt'])/1000 if kind=='live' else None
    row['comparisonEligible']=row['status']=='predicted' and not row['slow'] and not row['late'];store(row);return row

def resolve(payload):
    run=str(payload.get('run',''));target=int(finite(payload.get('targetTime'),'targetTime'))
    with connection() as db:
        saved=db.execute('SELECT body FROM receipts WHERE run=? AND target=?',(run,target)).fetchone()
    if not saved: raise ValueError('Freeze a prediction before revealing the next candle')
    row=json.loads(saved[0])
    if row['status']=='pending': raise ValueError('Prediction is still pending')
    if row['source']['kind']=='live':
        fresh=public_source();actual=next((b for b in fresh['bars'] if b['time']==target),None)
        if actual is None: return {**row,'waiting':True}
    else: actual=clean_bars([payload.get('actual',{})],1)[0]
    if actual['time']!=target: raise ValueError('Only the immediately next contiguous candle can resolve this forecast')
    if row.get('actual'):
        if row['actual']!=actual: raise ValueError('Outcome already frozen; source revisions cannot rewrite the score')
        return row
    row['actual']=actual;row['resolvedAt']=now()
    for method in ('baseline','jev'):
        prediction=row.get(method)
        if prediction:
            prediction['result']={'highOK':actual['high']<=prediction['high'],'lowOK':actual['low']>=prediction['low'],'contained':actual['high']<=prediction['high'] and actual['low']>=prediction['low'],'highErrorTicks':abs(prediction['high']-actual['high'])/row['tick'],'lowErrorTicks':abs(prediction['low']-actual['low'])/row['tick']}
    store(row);return row

def run_receipts(run):
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',run): raise ValueError('Invalid run ID')
    with connection() as db: return {'run':run,'receipts':[json.loads(r[0]) for r in db.execute('SELECT body FROM receipts WHERE run=? ORDER BY target',(run,))]}

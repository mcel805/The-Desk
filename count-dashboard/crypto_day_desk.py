"""Crypto Day Desk: durable completed-bar observations, policy and review ledger.

Every forecast is frozen before its future outcome. This service does not route
orders or self-modify code. Research policy adoption is an explicit human action.
"""
from __future__ import annotations
from contextlib import contextmanager
from pathlib import Path
import hashlib
import json
import math
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from paper_journal_bridge import queue_account
import rider_auto
from rider_playbooks import questions as rider_questions
import taper_decisions
import crypto_hunt_sessions as hunts
import crypto_risk
import taper_session_review as session_review

DB_PATH = Path(__file__).resolve().parent / 'data' / 'crypto-day-desk.sqlite3'
LOCK = threading.RLock()
_LEARNING_CACHE = {}
MARKETS = {'coinbase': {'BTC-USD', 'ETH-USD', 'SOL-USD'}, 'binance': {'BTCUSDT', 'ETHUSDT', 'SOLUSDT'}, 'hyperliquid': {'BTC', 'ETH', 'SOL'}}
DEFAULT_POLICY = {'name':'Wave Court · sweep and confirmation','touchAtr':.12,'confirmBars':2,'horizon':5,'expiryBars':8,'minQuality':45,'minRR':3.0,'preferredRR':5.0,'maxStopTicks':30,'useExchangeTicks':False,'riskTickBTC':0.0,'riskTickETH':0.0,'riskTickSOL':0.0,'riskPct':.5,'stopAtr':.15,'dailyLossPct':2,'feeBps':5,'slippageBps':2,'apiEnabled':False}

def cycle_account(trading_db):
    """An immutable $500 starting allocation per Pacific calendar month.

    Rollover creates another account, never resets an existing balance or ledger.
    Open positions remain owned by the account in which they were opened.
    """
    zone = ZoneInfo('America/Los_Angeles')
    local = datetime.now(zone)
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + (start.month == 12), month=start.month % 12 + 1)
    month = start.strftime('%Y-%m')
    account_id = 'crypto-month-' + month
    existing=trading_db.execute('SELECT 1 FROM chart_sim_accounts WHERE account_id=?',(account_id,)).fetchone()
    inserted=0 if existing else trading_db.execute(
        'INSERT OR IGNORE INTO chart_sim_accounts VALUES(?,?,?,?,?)',
        (account_id, 'Wave Court · month ' + month, 500.0, 'USD', datetime.now(timezone.utc).isoformat())
    ).rowcount
    account = dict(trading_db.execute('SELECT * FROM chart_sim_accounts WHERE account_id=?', (account_id,)).fetchone())
    if account['starting_balance'] != 500.0:
        raise ValueError('Monthly account has an unexpected starting balance; preserve ledger and review configuration')
    if inserted:
        queue_account(trading_db, account)
    return {'account': account, 'month': month, 'duration': 'calendar_month', 'timezone': str(zone),
            'startsAt': int(start.timestamp()*1000), 'endsAt': int(end.timestamp()*1000),
            'startingBalance': 500.0, 'targetReturnPct': 10.0, 'targetPnl': 50.0,
            'targetBalance': 550.0, 'targetBasis': 'realized_gross'}

def now(): return int(time.time()*1000)
def encode(v): return json.dumps(v, sort_keys=True, separators=(',', ':'), allow_nan=False)
def digest(v): return hashlib.sha256(encode(v).encode()).hexdigest()
@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db=sqlite3.connect(DB_PATH, timeout=30);db.row_factory=sqlite3.Row
    db.executescript('''
    CREATE TABLE IF NOT EXISTS policy(id TEXT PRIMARY KEY,created INTEGER,body TEXT,active INTEGER);
    CREATE TABLE IF NOT EXISTS bars(provider TEXT,symbol TEXT,time INTEGER,body TEXT,hash TEXT,PRIMARY KEY(provider,symbol,time));
    CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,provider TEXT,symbol TEXT,time INTEGER,policy TEXT,body TEXT,outcome TEXT,created INTEGER,UNIQUE(provider,symbol,time,policy));
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,decision TEXT,role TEXT,action TEXT,note TEXT,created INTEGER);
    CREATE TABLE IF NOT EXISTS rider_auto_signals(id TEXT PRIMARY KEY,body TEXT);
    CREATE TABLE IF NOT EXISTS trade_links(position TEXT PRIMARY KEY,decision TEXT,created INTEGER);
    CREATE TABLE IF NOT EXISTS api_attempts(key TEXT PRIMARY KEY,state TEXT,created INTEGER,body TEXT);
    CREATE TABLE IF NOT EXISTS api_trade_allocations(key TEXT PRIMARY KEY,position TEXT);
    CREATE TABLE IF NOT EXISTS source_context(provider TEXT,symbol TEXT,timeframe TEXT,time INTEGER,body TEXT,PRIMARY KEY(provider,symbol,timeframe,time));
    CREATE TABLE IF NOT EXISTS indicator_settings(id TEXT PRIMARY KEY,body TEXT);
    ''')
    hunts.schema(db)
    session_review.schema(db)
    if not db.execute('SELECT 1 FROM policy LIMIT 1').fetchone():
        db.execute('INSERT INTO policy VALUES(?,?,?,1)',('policy-1',now(),encode(DEFAULT_POLICY)));db.commit()
    active=db.execute('SELECT * FROM policy WHERE active=1 ORDER BY created DESC LIMIT 1').fetchone()
    saved=json.loads(active['body'])
    if 'maxStopTicks' not in saved:
        revised={**DEFAULT_POLICY,**saved,'minRR':max(3,saved.get('minRR',3)),'preferredRR':max(5,saved.get('minRR',3)),'maxStopTicks':30}
        db.execute('UPDATE policy SET active=0')
        db.execute('INSERT INTO policy VALUES(?,?,?,1)',('policy-'+uuid.uuid4().hex[:12],now(),encode(revised)))
        db.commit()
    try:
        with db: yield db
    finally: db.close()

def policy(db):
    r=db.execute('SELECT * FROM policy WHERE active=1 ORDER BY created DESC LIMIT 1').fetchone()
    return {'id':r['id'],**{k:v for k,v in json.loads(r['body']).items() if k not in ('maxApiReads','maxApiUsd')}}

def validate_source(source):
    provider,symbol=source.get('provider'),source.get('symbol')
    if symbol not in MARKETS.get(provider,set()) or source.get('timeframe')!='1m': raise ValueError('Desk requires a supported BTC, ETH or SOL one-minute source')
    return provider,symbol

def finite(v,name):
    if isinstance(v,bool): raise ValueError(name+' must be numeric')
    try: v=float(v)
    except (ValueError,TypeError): raise ValueError(name+' must be numeric') from None
    if not math.isfinite(v): raise ValueError(name+' must be finite')
    return v

def validate_bars(payload):
    source=payload.get('source',{});provider,symbol=validate_source(source)
    asof=int(finite(source.get('snapshotAsOf'),'snapshotAsOf'))
    if abs(now()-asof)>300_000: raise ValueError('Refresh the public data snapshot before recording')
    rows=payload.get('bars',[])
    if not isinstance(rows,list) or not 20<=len(rows)<=1200: raise ValueError('Supply 20–1200 completed bars')
    bars=[];prior=0
    for row in rows:
        b={k:finite(row.get(k),k) for k in ('time','open','high','low','close')}
        b['time']=int(b['time']);b['volume']=max(0,finite(row.get('volume',0) or 0,'volume'))
        if b['time']%60000 or b['time']<=prior or b['time']+60000>asof or b['low']<=0 or b['high']<max(b['open'],b['close'],b['low']) or b['low']>min(b['open'],b['close']): raise ValueError('Bars must be ordered, aligned, completed and valid OHLC')
        bars.append(b);prior=b['time']
    if int(source.get('completedCutoff',0))!=prior or now()-prior-60000>300000: raise ValueError('Declared cutoff must match a fresh completed bar')
    return provider,symbol,bars,source

def normalize_levels(payload,cutoff):
    rows=payload.get('raw',[])
    if not isinstance(rows,list) or len(rows)>224: raise ValueError('Liquidity ledger too large')
    out=[]
    for p in rows:
        price=finite(p.get('price'),'liquidity price');born=int(finite(p.get('born'),'pool born'));side=p.get('side');tf=p.get('tf')
        if side not in (-1,1) or tf not in range(7) or price<=0 or born>cutoff+60000: continue
        out.append({'id':str(p.get('id',''))[:100],'price':price,'side':side,'tf':tf,'born':born,'takenAt':int(p.get('takenAt') or 0),'weight':max(0,finite(p.get('weight',0),'weight'))})
    return out

def tape_rule(bars,index,levels,p,frames,hunt_ids=None,provider=None,symbol=None):
    """Causal ledger reconstruction. Use only bars/levels available at this close."""
    b=bars[index];past=bars[max(0,index-19):index+1];tr=[max(x['high']-x['low'],abs(x['high']-(past[i-1]['close'] if i else x['close'])),abs(x['low']-(past[i-1]['close'] if i else x['close']))) for i,x in enumerate(past)];atr=sum(tr)/len(tr);tol=max(atr*p['touchAtr'],b['close']*.000001)
    active=[x for x in levels if x['born']<=b['time']+60000 and (not x['takenAt'] or x['takenAt']>b['time']+60000)]
    available=[x for x in levels if x['born']<=b['time'] and (not x['takenAt'] or x['takenAt']>=past[0]['time'])]
    interaction_active=active if hunt_ids is None else [x for x in active if x['id'] in hunt_ids]
    available=available if hunt_ids is None else [x for x in available if x['id'] in hunt_ids]
    nearest=min(interaction_active,key=lambda x:abs(x['price']-b['close']),default=None)
    touch=[x for x in available if b['low']-tol<=x['price']<=b['high']+tol]
    touch.sort(key=lambda x:(-x['weight'],abs(x['price']-b['close'])))
    stage='WAIT';direction=0;reason='No qualified level interaction';level=touch[0] if touch else nearest;confirmation=None
    if nearest and abs(nearest['price']-b['close'])<=atr: stage='APPROACH';reason='Price is within one ATR of a retained active pool'
    if touch:
        stage='TOUCH';reason='Completed candle overlaps a confirmed liquidity wick level'
        t=touch[0]
        if t['side']==-1 and b['low']<=t['price'] and b['close']>t['price']: stage='RECLAIM';direction=1;reason='Lower liquidity swept and close reclaimed'
        if t['side']==1 and b['high']>=t['price'] and b['close']<t['price']: stage='REJECTION';direction=-1;reason='Upper liquidity swept and close rejected'
    # A new bar confirms a previous sweep; this evaluates actual intervening closes.
    for sweep_index in range(max(0,index-p['expiryBars']),index):
        sweep=bars[sweep_index]
        for t in available:
            if t['born']>sweep['time'] or t['takenAt'] and t['takenAt']<sweep['time']: continue
            d=1 if t['side']==-1 and sweep['low']<=t['price']<sweep['close'] else -1 if t['side']==1 and sweep['high']>=t['price']>sweep['close'] else 0
            span=bars[sweep_index+1:index+1]
            if d and len(span)>=p['confirmBars'] and len(span)<=p['expiryBars'] and all(x['time']==sweep['time']+(j+1)*60000 for j,x in enumerate(span)) and all(d*(x['close']-t['price'])>0 for x in span) and d*(b['close']-(sweep['high'] if d==1 else sweep['low']))>0:
                stage='CONFIRMED';direction=d;level=t;confirmation={'sweepTime':sweep['time'],'confirmationTime':b['time'],'bars':len(span)};reason='Sweep defended by consecutive completed closes and its extreme broken'
    interaction={'stage':stage,'direction':direction,'reason':reason,'touched':bool(touch)}
    entry=b['close'] if direction else None;stop=None;target=None;rr=None;risk=None
    if direction:
        extreme=min(x['low'] for x in past[-p['expiryBars']:]) if direction==1 else max(x['high'] for x in past[-p['expiryBars']:])
        stop=extreme-direction*atr*p['stopAtr']
        targets=[x for x in active if x['side']==direction and direction*(x['price']-entry)>0 and (not level or x['id']!=level['id'])]
        target=min(targets,key=lambda x:abs(x['price']-entry),default=None)
        target=target['price'] if target else None
        if target is not None and abs(entry-stop)>0: rr=abs(target-entry)/abs(entry-stop)
        if provider and symbol:
            risk=crypto_risk.evaluate(p,provider,symbol,'long' if direction==1 else 'short',entry,stop,target)
        if stage=='CONFIRMED':
            if risk is not None and not risk['qualified']:stage='WAIT';direction=0;reason=risk['reason']
            elif target is None or rr<max(3,p['minRR']):stage='WAIT';direction=0;reason='Confirmed sweep lacks an opposite liquidity target at the required reward/risk'
    # Current HTF snapshots are context for current observation only, never retroactive labels.
    context=[]
    if index==len(bars)-1:
        for f in frames:
            if f.get('cutoff') is not None:context.append({'timeframe':f.get('timeframe'),'cutoff':f.get('cutoff'),'status':f.get('status'),'degrees':f.get('degrees',[])})
        quality=[d.get('candidate',{}).get('quality',0) for f in context for d in f.get('degrees',[]) if isinstance(d.get('candidate'),dict)]
        if stage=='CONFIRMED' and (not quality or max(quality)<p['minQuality']):stage='WAIT';direction=0;reason='Tape confirms; available Wave Court quality is below the configured gate'
    return {'barTime':b['time'],'interaction':interaction,'stage':stage,'direction':direction,'bias':'LONG' if direction==1 else 'SHORT' if direction==-1 else 'WAIT','reason':reason,'level':level,'entry':entry,'stop':stop,'target':target,'rr':rr,'risk':risk,'atr':atr,'confirmation':confirmation,'context':context,'horizonBars':p['horizon'],'forecastPrice':b['close'],'kind':'rule_reconstruction' if index<len(bars)-1 else 'forward_rule','sourceQuality':'completed public OHLC snapshot','model':None,'gap':index>0 and b['time']-bars[index-1]['time']!=60000}

def observe(payload):
    provider,symbol,bars,source=validate_bars(payload);levels=normalize_levels(payload,bars[-1]['time']);frames=payload.get('frames',[])
    if not isinstance(frames,list) or len(frames)>7: raise ValueError('Maximum seven source frames')
    with LOCK,connection() as db:
        p=policy(db);made=[];revisions=0
        for index,b in enumerate(bars):
            old=db.execute('SELECT hash,body FROM bars WHERE provider=? AND symbol=? AND time=?',(provider,symbol,b['time'])).fetchone()
            if old and old[0]!=digest(b):
                # Use the first observed completed candle in subsequent decisions, too.
                canonical=json.loads(old['body']);revisions+=int(any(canonical[k]!=b[k] for k in ('open','high','low','close')));bars[index]=canonical;continue
            db.execute('INSERT OR IGNORE INTO bars VALUES(?,?,?,?,?)',(provider,symbol,b['time'],encode(b),digest(b)))
        for i in range(len(bars)):
            if db.execute('SELECT 1 FROM decisions WHERE provider=? AND symbol=? AND time=? AND policy=?',(provider,symbol,bars[i]['time'],p['id'])).fetchone():continue
            d=tape_rule(bars,i,levels,p,frames,provider=provider,symbol=symbol);
            if i<19:d.update(stage='WAIT',direction=0,bias='WAIT',reason='Warmup: fewer than 20 completed minutes in this supplied window')
            d.update(indicatorSettings=payload.get('indicatorSettings',{}),indicatorMethod=str(payload.get('method',''))[:100],id='bar-'+uuid.uuid4().hex,provider=provider,symbol=symbol,policy=p['id'],observedAt=now(),source=source,evidenceHash=digest({'bars':bars[max(0,i-19):i+1],'levels':levels,'policy':p['id'],'indicatorSettings':payload.get('indicatorSettings',{})}))
            db.execute('INSERT INTO decisions VALUES(?,?,?,?,?,?,NULL,?)',(d['id'],provider,symbol,d['barTime'],p['id'],encode(d),now()));made.append(d)
        hunts.observe(db,provider,symbol,bars,levels,frames,payload.get('indicatorSettings',{}),__import__(__name__))
        settle(db,provider,symbol)
        latest=db.execute('SELECT body FROM decisions WHERE provider=? AND symbol=? AND time=? AND policy=?',(provider,symbol,bars[-1]['time'],p['id'])).fetchone()
        result=json.loads(latest[0]);result['newCount']=len(made);result['sourceRevisions']=revisions
        return result

def settle(db,provider,symbol):
    rows=db.execute('SELECT * FROM decisions WHERE provider=? AND symbol=? AND outcome IS NULL',(provider,symbol)).fetchall()
    for r in rows:
        d=json.loads(r['body']);h=d['horizonBars'];end=r['time']+h*60000
        future=db.execute('SELECT time,body FROM bars WHERE provider=? AND symbol=? AND time>? AND time<=? ORDER BY time',(provider,symbol,r['time'],end)).fetchall()
        if not future or future[-1]['time']<end: continue
        contiguous=len(future)==h and all(x['time']==r['time']+(i+1)*60000 for i,x in enumerate(future));price=json.loads(future[-1]['body'])['close'];move=price-d['forecastPrice'];direction=d['direction']
        outcome={'endTime':end,'close':price,'move':move,'directionCorrect':(direction*move>0) if direction and contiguous else None,'eligible':d['kind']=='forward_rule' and bool(direction) and contiguous and d['observedAt']<end+60000,'gap':not contiguous,'resolvedAt':now(),'measurement':'fixed-horizon directional move; not a trade fill'}
        model=d.get('modelForecast',{});md=model.get('direction',0);outcome['modelDirectionCorrect']=md*move>0 if md and contiguous and model.get('createdAt',now())<end+60000 else None;outcome['modelEligible']=outcome['modelDirectionCorrect'] is not None and d['kind']=='forward_rule';db.execute('UPDATE decisions SET outcome=? WHERE id=?',(encode(outcome),r['id']))

def update_policy(payload):
    base={**DEFAULT_POLICY,**payload.get('policy',{})};validated={}
    for k,default in DEFAULT_POLICY.items():
        if k=='name':validated[k]=str(base[k])[:100]
        elif isinstance(default,bool):validated[k]=base[k] is True
        else: validated[k]=finite(base[k],k)
    for k,lo,hi in [('touchAtr',.001,2),('confirmBars',1,10),('horizon',1,60),('expiryBars',2,60),('minQuality',0,95),('minRR',3,20),('preferredRR',5,50),('maxStopTicks',1,30),('riskTickBTC',0,100000),('riskTickETH',0,100000),('riskTickSOL',0,100000),('riskPct',.01,5),('dailyLossPct',.1,20),('feeBps',0,100),('slippageBps',0,100),('stopAtr',0,3)]:
        if not lo<=validated[k]<=hi:raise ValueError(k+' is outside its allowed range')
    if validated['preferredRR']<validated['minRR']:raise ValueError('Preferred RR must be at least minimum RR')
    for k in ('confirmBars','horizon','expiryBars','maxStopTicks'):validated[k]=int(validated[k])
    with LOCK,connection() as db:
        key='policy-'+uuid.uuid4().hex[:12];db.execute('UPDATE policy SET active=0');db.execute('INSERT INTO policy VALUES(?,?,?,1)',(key,now(),encode(validated)))
        return {'id':key,**validated}

def require_clock_in(account,provider,symbol):
    with connection() as db:
        row=db.execute('SELECT * FROM hunt_sessions WHERE ended IS NULL AND account=? AND provider=? AND symbol=?',(account,provider,symbol)).fetchone()
        if not row:raise ValueError('Clock in to this account and market before placing a paper entry')
        return hunts.unpack(row)

def clock_out(payload,trading_db):
    with LOCK:
        session=hunts.end(payload,__import__(__name__))
        if session.get('auto'):
            session['auto']=rider_auto.control({'session':session['id'],'action':'pause'},trading_db,__import__(__name__))
        result=state(session['provider'],session['symbol'],session['account'],trading_db,refresh_reviews=True)
        review=next((r for r in result['clockOutReviews'] if r['session']==session['id']),None)
        journal=hunts.sync_journal({'session':session['id']},__import__(__name__))
        return {'session':session,'review':review,'journal':journal,'dailyReview':result['dailySessionReviews'][0] if result['dailySessionReviews'] else None}

def check_paper_risk(provider,symbol,side,entry,stop,target):
    with connection() as db:p=policy(db)
    result=crypto_risk.evaluate(p,provider,symbol,side,entry,stop,target)
    if not result['qualified']:raise ValueError(result['reason'])
    return result

def volume_preview(payload):
    """Read-only contract preview; no paid inference, order or ledger mutation."""
    raw=dict(payload.get('evidence',payload))
    # Preview the exact frozen hunt context used by model_read, without reserving
    # an attempt or running inference. Caller supplies the actual 20–60-bar tape.
    provider,symbol,bars,source=validate_bars(raw)
    with connection() as db:
        hunt=hunts.state(db,provider,symbol)['session']
        if hunt and not hunt['ended']:
            candidates=[c for c in hunts.state(db,provider,symbol)['sessionCandidates']
                        if c['barTime']==bars[-1]['time'] and c.get('levelRevision',1)==hunt.get('levelRevision',1)]
            raw['hunt']={'levels':hunt['levels'],'candidates':candidates,'policy':hunt['policy'],'learning':session_review.decision_context(db,bars[-1]['time'])}
    evidence=taper_decisions._evidence(raw)
    questions=taper_decisions.decision_questions(evidence.get('marketGeometry') is not None,True)
    body=encode({'model':taper_decisions.MODEL,'state':evidence,'questions':questions})
    return {'volumeEvidence':evidence['volumeEvidence'],'questionCount':len(questions),'questionPack':taper_decisions.taper_volume.PACK,'requestBytes':len(body.encode()),'requestWithinBound':None,'internalRequestCap':False,'providerContextValidation':'Provider enforces its context limit; preview does not tokenize','inferenceRun':False}

def api_budget_status(db, p):
    day=now()//86400000*86400000
    rows=db.execute('SELECT state,body FROM api_attempts WHERE created>=?',(day,)).fetchall()
    reserved=sum(float(json.loads(r['body'] or '{}').get('estimatedUsd',0)) for r in rows)
    # Usage is informational. Legacy frozen policies never impose API caps.
    return {'blocked':False,'reason':'','internalCaps':False,'attempts':len(rows),
            'maxAttempts':None,'failedAttempts':sum(r['state']=='failed' for r in rows),
            'reservedUsd':reserved,'maxUsd':None,'resetsAt':day+86400000}



def model_read(payload,playbook_bars=None):
    evidence=payload.get('evidence',{});provider,symbol,bars,source=validate_bars(evidence)
    if playbook_bars is None:playbook_bars=bars
    else:
        _,_,playbook_bars,_=validate_bars({'source':source,'bars':playbook_bars})
        if playbook_bars[-len(bars):]!=bars:raise ValueError('Playbook history must match the submitted completed tape')
    key=f"{provider}:{symbol}:{bars[-1]['time']}"
    with LOCK,connection() as db:
        p=policy(db)
        hunt=hunts.state(db,provider,symbol)['session']
        if not hunt or hunt['ended'] or hunt['provider']!=provider or hunt['symbol']!=symbol:raise ValueError('Clock in before requesting a Jev read')
        if not hunt['levels']:raise ValueError('All hunt levels are deselected; select a level to resume Jev reads')
        if bars[-1]['time']+60000<=hunt.get('levelsChangedAt',0):raise ValueError('Waiting for a completed minute after the hunt selection changed')
        session_enabled=bool(hunt and not hunt['ended'] and hunt['provider']==provider and hunt['symbol']==symbol and (hunt['apiRequested'] or hunt['policy'].get('apiEnabled') is True))
        if not session_enabled:raise ValueError('Opt in to Jev at session start before requesting API reads')
        p=hunt['policy']
        if session_enabled:
            if bars[-1]['time']<=hunt['startCutoff']:raise ValueError('Waiting for the first completed minute after session start')
        if not taper_decisions.status()['configured']:raise ValueError('Configure TYPESAFE_API_KEY in count-dashboard/.env and restart Count Desk')
        previous=db.execute('SELECT * FROM api_attempts WHERE key=?',(key,)).fetchone()
        if previous:
            body=json.loads(previous['body']) if previous['body'] else {}
            if previous['state']=='completed':return body
            raise ValueError('This bar already has an API attempt: '+previous['state']+'. Check its receipt before retrying')
        db.execute('INSERT INTO api_attempts VALUES(?,?,?,?)',(key,'pending',now(),encode({'provider':'typesafe','estimatedUsd':taper_decisions.MAX_REQUEST_USD,'costReserved':True})))
        rider_candidates=rider_auto.candidates(playbook_bars,hunt,__import__(__name__))
        questions=taper_decisions.decision_questions(evidence.get('marketGeometry') is not None, True)
        if rider_candidates:questions={k:v for k,v in questions.items() if k in ('tape_state','structure_clarity')}
        questions.update(rider_questions(rider_candidates))
        hunts.event(db,hunt['id'],'taper','api_request',{
            'text':'Preparing Jev read for the completed 1m candle. '+str(len(questions))+' independent questions cover tape, channels, breaks, volume and context.',
            'barTime':bars[-1]['time'],'source':source,'questions':questions,
            'model':taper_decisions.MODEL,'levelRevision':hunt.get('levelRevision',1),
            'levels':[{'price':x['price'],'tf':x['tf']} for x in hunt['levels']],
            'riskGate':'Armed PAPER: frozen playbooks, risk checks and Jev entry judgment' if (hunt.get('auto') or {}).get('armed') else 'Human paper-ticket confirmation required.'},
            hunt['id']+':api-request:'+key)
    try:
        with connection() as db:
            candidates=[c for c in hunts.state(db,provider,symbol)['sessionCandidates']
                        if c['barTime']==bars[-1]['time'] and c.get('levelRevision',1)==hunt.get('levelRevision',1)]
            learning=session_review.decision_context(db,bars[-1]['time'])
        evidence={**evidence,'riderCandidates':rider_candidates,'hunt':{'levels':hunt['levels'],'candidates':candidates,'policy':hunt['policy'],'learning':learning}}
        record=taper_decisions.decide(evidence,DB_PATH.parent/'taper-decisions.jsonl')
        record['huntSessionId']=hunt['id']
        record['levelRevision']=hunt.get('levelRevision',1)
        with LOCK,connection() as db:
            db.execute('UPDATE api_attempts SET state=?,body=? WHERE key=?',('completed',encode(record),key))
            hunts.attach_model(db,record,__import__(__name__))
            for i,c in enumerate(record.get('riderCandidates',[])):
                signal_id=record['decisionId']+':entry:'+str(i)
                saved={**c,'id':signal_id,'policy':hunt['policy']['id'],'provider':provider,'symbol':symbol,'bias':'LONG' if c['direction']==1 else 'SHORT','confirmation':{'sweepTime':c['reactionTime']},'kind':'forward_rule'}
                db.execute('INSERT OR IGNORE INTO rider_auto_signals VALUES(?,?)',(signal_id,encode(saved)))
            row=db.execute('SELECT id,body FROM decisions WHERE provider=? AND symbol=? AND time=? ORDER BY created DESC LIMIT 1',(provider,symbol,bars[-1]['time'])).fetchone()
            if row:
                d=json.loads(row['body']);d['model']=record;answer=next((a for a in record.get('answers',[]) if a.get('name')=='research_bias'),{});choice=answer.get('choice');d['modelForecast']={'direction':1 if choice=='WATCH_LONG' else -1 if choice=='WATCH_SHORT' else 0,'createdAt':record.get('createdAt',now())};db.execute('UPDATE decisions SET body=? WHERE id=?',(encode(d),row['id']))
        return record
    except Exception as exc:
        fallback={'provider':'typesafe','costUnknown':not isinstance(exc,ValueError),'estimatedUsd':0 if isinstance(exc,ValueError) else taper_decisions.MAX_REQUEST_USD}
        with LOCK,connection() as db:
            failure={'error':type(exc).__name__,'message':str(exc)[:350],**getattr(exc,'receipt',fallback)}
            db.execute('UPDATE api_attempts SET state=?,body=? WHERE key=?',('failed',encode(failure),key))
            hunts.event(db,hunt['id'],'taper','api_failed',{'text':'Jev read failed: '+str(exc)[:350],
                        'barTime':bars[-1]['time'],'failure':failure,'model':taper_decisions.MODEL},hunt['id']+':api-failed:'+key)
        raise

def review(payload):
    role=payload.get('role');action=payload.get('action');did=str(payload.get('decision',''))
    if role not in ('human','rider','cleo','taper') or action not in ('note','approve','reject','handoff','completed','failed'):raise ValueError('Invalid review role or action')
    if action in ('approve','reject') and role!='human':raise ValueError('Human review is required for paper approval')
    with LOCK,connection() as db:
        if not hunts.find_decision(db,did):raise ValueError('Unknown decision')
        found=hunts.find_decision(db,did);context=json.loads(found['body'])
        if action=='approve' and context.get('session'):
            session=hunts.unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(context['session'],)).fetchone())
            if not session or session['ended'] or context.get('level',{}).get('id') not in {x['id'] for x in session['levels']} or context.get('levelRevision',1)!=session.get('levelRevision',1):raise ValueError('Hunt selection changed; wait for a new completed-minute proposal before approving')
        if context.get('session'):hunts.event(db,context['session'],role,'note',{'text':action.upper()+': '+str(payload.get('note',''))[:8000]})
        r={'id':'review-'+uuid.uuid4().hex,'decision':did,'role':role,'action':action,'note':str(payload.get('note',''))[:8000],'created':now()};db.execute('INSERT INTO reviews VALUES(?,?,?,?,?,?)',tuple(r.values()));return r

def link_trade(payload,trading_db):
    pid=str(payload.get('position',''));did=str(payload.get('decision',''))
    trade=trading_db.execute('SELECT * FROM quant_lab_sim_positions WHERE position_id=?',(pid,)).fetchone()
    with LOCK,connection() as db:
        found=hunts.find_decision(db,did)
        decision=json.loads(found['body']) if found else None
        if not trade or not decision or trade['provider']!=decision['provider'] or trade['symbol']!=decision['symbol'] or abs(trade['entry_bar_time']*1000-decision['barTime'])>120000:raise ValueError('Trade and decision must share source and entry cutoff')
        db.execute('INSERT OR IGNORE INTO trade_links VALUES(?,?,?)',(pid,did,now()));return {'position':pid,'decision':did,'linked':True}

def learning(db,day=None):
    # Learning totals are historical context, never the entry/freshness gate.
    # Share a one-minute snapshot across polling clients; explicit reviews refresh it.
    cache_key=(db.execute('PRAGMA database_list').fetchone()[2],now()//60000,day)
    if cache_key in _LEARNING_CACHE:return _LEARNING_CACHE[cache_key]
    for key in list(_LEARNING_CACHE):
        if key[:2]!=cache_key[:2]:_LEARNING_CACHE.pop(key)
    # Summaries need attribution and outcomes, not full frozen indicator/model evidence.
    rows=db.execute("SELECT json_object('barTime',json_extract(body,'$.barTime'),'symbol',json_extract(body,'$.symbol'),'stage',json_extract(body,'$.stage'),'bias',json_extract(body,'$.bias'),'policy',json_extract(body,'$.policy'),'direction',json_extract(body,'$.direction')),outcome FROM decisions WHERE outcome IS NOT NULL").fetchall();samples=[]
    for r in rows:
        d=json.loads(r[0]);out=json.loads(r[1]);
        if out.get('eligible') and (day is None or day<=d['barTime']<day+86400000):samples.append((d,out))
    correct=sum(bool(x[1]['directionCorrect']) for x in samples)
    grouped={}
    for d,out in samples:
        key=f"{d['symbol']} · {d['stage']} · {d['bias']} · {d['policy']}";g=grouped.setdefault(key,{'samples':0,'correct':0,'move':0});g['samples']+=1;g['correct']+=bool(out['directionCorrect']);g['move']+=d['direction']*out['move']
    for g in grouped.values():g['accuracy']=g['correct']/g['samples'];g['meanSignedMove']=g.pop('move')/g['samples']
    model_samples=[json.loads(r[1]) for r in rows if json.loads(r[1]).get('modelEligible') and (day is None or day<=json.loads(r[0])['barTime']<day+86400000)];model_correct=sum(bool(r['modelDirectionCorrect']) for r in model_samples)
    result={'modelSamples':len(model_samples),'modelAccuracy':model_correct/len(model_samples) if model_samples else None,'samples':len(samples),'correct':correct,'accuracy':correct/len(samples) if samples else None,'groups':grouped,'candidateReady':len(samples)>=30,'minimumSamples':30,'proposal':'Review weak pattern groups and test one threshold on a later holdout session; do not adopt automatically.','loop':['Archive completed bars','Freeze decision and policy','Resolve fixed future horizon','Score gap-free forward predictions','Group by pattern, asset and policy','Human/Rider/Cleo review','Save a new policy version','Measure the next untouched session'],'mode':'empirical review; model weights are not being trained'}

    result['computedAt']=now();result['refreshIntervalMs']=60000
    _LEARNING_CACHE[cache_key]=result
    return result

def state(provider=None,symbol=None,account='',trading_db=None,export=False,refresh_reviews=False):
    if export or refresh_reviews:_LEARNING_CACHE.clear()
    cycle = cycle_account(trading_db) if trading_db is not None else None
    if not account and cycle:account=cycle['account']['account_id']
    with connection() as db:
        where='';args=[]
        if provider and symbol:where=' WHERE provider=? AND symbol=?';args=[provider,symbol]
        limit=1000000 if export else 1200
        current_policy=policy(db);decision_where=where if export else where+(' AND ' if where else ' WHERE ')+'policy=?';decision_args=args if export else [*args,current_policy['id']]
        # The live UI never consumes repeated chart context or indicator settings.
        # Keep full evidence in SQLite and export; avoid retransmitting it every poll.
        body_expr='body' if export else "json_remove(body, '$.context', '$.indicatorSettings', '$.model.questions', '$.model.rawAnswers', '$.model.marketGeometry', '$.model.volumeEvidence')"
        rows=db.execute('SELECT '+body_expr+' AS body,outcome FROM decisions'+decision_where+' ORDER BY time DESC,created DESC LIMIT ?',(*decision_args,limit)).fetchall()
        decisions=[{**json.loads(r['body']),'outcome':json.loads(r['outcome']) if r['outcome'] else None} for r in rows]
        reviews=[dict(r) for r in db.execute('SELECT * FROM reviews ORDER BY created DESC LIMIT 80')]
        attempts=[dict(r) for r in db.execute('SELECT * FROM api_attempts WHERE created>=?',(now()//86400000*86400000,))]
        receipts=[json.loads(r['body']) for r in attempts if r['state']=='completed']
        measured=[json.loads(r['body'] or '{}') for r in attempts if json.loads(r['body'] or '{}').get('usage',{}).get('input_tokens',0)>0]
        tokens=sum(int(r.get('usage',{}).get('input_tokens',0)) for r in measured);usd=sum(float(r.get('estimatedUsd',0)) for r in measured)
        positions=[];accounts=[];links=[dict(r) for r in db.execute('SELECT * FROM trade_links')]
        if trading_db is not None:
            accounts=[dict(r) for r in trading_db.execute('SELECT * FROM chart_sim_accounts')]
            positions=[dict(r) for r in trading_db.execute('SELECT * FROM quant_lab_sim_positions'+(' WHERE account_id=?' if account else ''),(account,) if account else ())]
            positions=[r for r in positions if r['symbol'] in MARKETS.get(r['provider'],set())]
        by_id={d['id']:d for d in decisions}
        # Attribute each completed API receipt once, from setup sweep through exit.
        all_receipts=db.execute("SELECT key,body FROM api_attempts WHERE state='completed' ORDER BY created").fetchall()
        if trading_db is not None:
            for link in sorted(links,key=lambda x:x['created']):
                pos=trading_db.execute('SELECT * FROM quant_lab_sim_positions WHERE position_id=?',(link['position'],)).fetchone()
                decision=hunts.find_decision(db,link['decision'])
                if not pos or not decision:continue
                decision=json.loads(decision[0]);start=(decision.get('confirmation') or {}).get('sweepTime',decision['barTime']);end=(pos['exit_bar_time']*1000+60000) if pos['status']=='closed' else now()
                for receipt in all_receipts:
                    provider_key,symbol_key,bar_key=receipt['key'].split(':')
                    if pos['provider']==provider_key and pos['symbol']==symbol_key and start<=int(bar_key)<end:
                        db.execute('INSERT OR IGNORE INTO api_trade_allocations VALUES(?,?)',(receipt['key'],pos['position_id']))
        allocated={r['key']:r['position'] for r in db.execute('SELECT * FROM api_trade_allocations')}
        for position in positions:
            link=next((l for l in links if l['position']==position['position_id']),None);position['decisionId']=link['decision'] if link else None
            linked=by_id.get(position['decisionId']);stored=hunts.find_decision(db,position['decisionId']) if linked is None and position['decisionId'] else None;linked=linked or (json.loads(stored[0]) if stored else None);receipts_for_trade=[json.loads(r['body']) for r in all_receipts if allocated.get(r['key'])==position['position_id']]
            position['decisionApiUsd']=sum(float(r.get('estimatedUsd',0)) for r in receipts_for_trade) if linked else None
            position['decisionApiReads']=len(receipts_for_trade);position['decisionApiTokens']=sum(int(r.get('usage',{}).get('input_tokens',0)) for r in receipts_for_trade)
            frozen=db.execute('SELECT body FROM policy WHERE id=?',(linked['policy'],)).fetchone() if linked else None;cost_policy=json.loads(frozen[0]) if frozen else policy(db)
            position['estimatedTradingCosts']=(position['entry_price']+(position['exit_price'] or position['entry_price']))*position['quantity']*(cost_policy['feeBps']+cost_policy['slippageBps'])/10000
            auto_trade=trading_db.execute('SELECT body FROM rider_auto_trades WHERE position=?',(position['position_id'],)).fetchone() if trading_db is not None and trading_db.execute("SELECT 1 FROM sqlite_master WHERE name='rider_auto_trades'").fetchone() else None
            if auto_trade:
                ap=json.loads(auto_trade[0])['auto']['policy']
                position['estimatedTradingCosts']=(position['entry_price']+(position['exit_price'] or position['entry_price']))*position['quantity']*ap['feeBps']/10000
            position['estimatedNetPnl']=position['gross_pnl']-position['estimatedTradingCosts']-(position['decisionApiUsd'] or 0) if position['status']=='closed' else None
        hunt_export={'huntSessions':[hunts.unpack(r) for r in db.execute('SELECT * FROM hunt_sessions')],'huntEvents':[{**dict(r),'body':json.loads(r['body'])} for r in db.execute('SELECT * FROM hunt_events ORDER BY created')],'huntCandidates':[json.loads(r[0]) for r in db.execute('SELECT body FROM hunt_candidates ORDER BY time')]} if export else {}
        exported={'bars':[json.loads(r[0]) for r in db.execute('SELECT body FROM bars'+where+' ORDER BY time',args)],'sourceContext':[{'provider':r['provider'],'symbol':r['symbol'],'timeframe':r['timeframe'],'bar':json.loads(r['body'])} for r in db.execute('SELECT * FROM source_context'+where+' ORDER BY timeframe,time',args)],'apiAttempts':[dict(r) for r in db.execute('SELECT * FROM api_attempts ORDER BY created')]} if export else {}
        hunts.trace_trades(db,positions)
        session_metrics=(session_review.refresh if export or refresh_reviews else session_review.snapshot)(db,positions,__import__(__name__),account) if account else {}
        if export:session_metrics.update(clockReviewVersions=[{**dict(r),'body':json.loads(r['body'])} for r in db.execute('SELECT * FROM taper_review_versions ORDER BY created')],allDailySessionReviews=[json.loads(r['body']) for r in db.execute('SELECT * FROM taper_daily_reviews ORDER BY day')],allLearningProposals=[json.loads(r['body']) for r in db.execute('SELECT * FROM taper_learning_proposals ORDER BY created')])
        hunt_state=hunts.state(db,provider,symbol,compact=not export)
        if not export:
            for candidate in hunt_state.get('sessionCandidates',[]):
                candidate.pop('context',None);candidate.pop('indicatorSettings',None)
            for event in hunt_state.get('sessionEvents',[]):
                for candidate in event['body'].get('candidates',[]):
                    candidate.pop('context',None);candidate.pop('indicatorSettings',None)
        hunt_session=hunt_state['session']
        auto_state=rider_auto.state(trading_db,hunt_session) if trading_db is not None else {'worker':dict(rider_auto.STATUS)}
        budget=api_budget_status(db,hunt_session['policy'] if hunt_session and not hunt_session['ended'] else current_policy)
        api_status=taper_decisions.status()
        latest=db.execute('SELECT key,created,state,body FROM api_attempts WHERE key LIKE ? ORDER BY created DESC LIMIT 1',
                          (str(provider)+':'+str(symbol)+':%',)).fetchone() if provider and symbol else None
        if latest:
            body=json.loads(latest['body'] or '{}')
            api_status['lastAttempt']={'key':latest['key'],'created':latest['created'],'state':latest['state'],
                'barTime':int(latest['key'].rsplit(':',1)[-1]),'message':body.get('message'),
                'httpStatus':body.get('httpStatus'),'retryable':body.get('retryable'),
                'model':body.get('model'),'apiRequests':body.get('apiRequests')}

        return {'jevBudget':budget,'riderAuto':auto_state,'cycle':cycle,**session_metrics,**exported,**hunt_export,**hunt_state,'retainedDecisionCount':db.execute('SELECT COUNT(*) FROM decisions'+where,args).fetchone()[0],'policy':current_policy,'decisions':decisions,'reviews':[dict(r) for r in db.execute('SELECT * FROM reviews ORDER BY created')] if export else reviews,'learning':learning(db),'roundLearning':learning(db,now()//86400000*86400000),'cost':{'reads':len(receipts),'attempts':len(attempts),'inputTokens':tokens,'outputTokens':sum(int(r.get('usage',{}).get('output_tokens',0)) for r in measured),'estimatedUsd':usd,'label':'estimated, not billed','unresolvedCosts':sum(bool(json.loads(r['body'] or '{}').get('costUnknown')) for r in attempts)},'api':api_status,'positions':positions,'accounts':accounts,'policies':[{'id':r['id'],'created':r['created'],'active':bool(r['active']),**json.loads(r['body'])} for r in db.execute('SELECT * FROM policy ORDER BY created DESC')],'settings':json.loads(db.execute('SELECT body FROM indicator_settings WHERE id=?',('default',)).fetchone()[0]) if db.execute('SELECT 1 FROM indicator_settings WHERE id=?',('default',)).fetchone() else {},'mode':'paper','storage':'local SQLite','barCount':db.execute('SELECT COUNT(*) FROM bars').fetchone()[0]}

def save_settings(payload):
    data=payload.get('settings',{})
    if not isinstance(data,dict) or len(encode(data))>10000:raise ValueError('Invalid settings')
    with LOCK,connection() as db:db.execute('INSERT OR REPLACE INTO indicator_settings VALUES(?,?)',('default',encode(data)))
    return {'saved':True,'settings':data}


def save_context(payload):
    provider,symbol=validate_source(payload.get('source',{}))
    frames=payload.get('series',[])
    durations={'1d':86400000,'4h':14400000,'1h':3600000,'30m':1800000,'15m':900000,'5m':300000,'1m':60000}
    if not isinstance(frames,list) or len(frames)>7:raise ValueError('Invalid source frames')
    saved=0
    with LOCK,connection() as db:
        for frame in frames:
            tf=frame.get('timeframe');rows=frame.get('bars',[])
            if tf not in durations or not isinstance(rows,list) or len(rows)>1200:raise ValueError('Invalid source frame')
            prior=0
            for b in rows:
                values={k:finite(b.get(k),k) for k in ('time','open','high','low','close')}
                stamp=int(values['time']);values['volume']=max(0,finite(b.get('volume',0) or 0,'volume'))
                if stamp<=prior or stamp%durations[tf] or stamp+durations[tf]>now() or values['low']<=0 or values['high']<max(values['open'],values['close'],values['low']) or values['low']>min(values['open'],values['close']):raise ValueError('Context bars must be completed, ordered and valid')
                prior=stamp;db.execute('INSERT OR IGNORE INTO source_context VALUES(?,?,?,?,?)',(provider,symbol,tf,stamp,encode(values)));saved+=1
    return {'storedRows':saved,'frames':len(frames),'provider':provider,'symbol':symbol}

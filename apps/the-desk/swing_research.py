"""Independent ETH/BTC observation service and immutable local research ledger.

Intentionally receives ONLY a public market gateway. No broker/order-engine handle.
Restart, pause, config changes and gaps end the observation run. Start is explicit.
"""
from copy import deepcopy
from contextlib import contextmanager
from dataclasses import asdict
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import threading
import time
import uuid
from swing_tracker import Config, SwingTracker, REVISION, valid_bar
from jev_swing import Jev, MODEL, PROMPT_VERSION, QUESTIONS

SYMBOLS=('hyperliquid:BTC','hyperliquid:ETH')
CODE_HASH=hashlib.sha256(b''.join(Path(__file__).with_name(name).read_bytes() for name in ('swing_tracker.py','swing_research.py','jev_swing.py'))).hexdigest()
def encode(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(v):return hashlib.sha256(encode(v).encode()).hexdigest()

class SwingResearch:
    def __init__(self,gateway,directory,judge=None):
        self.gateway=gateway;self.judge=judge or Jev();self.lock=threading.RLock();self.stop=threading.Event()
        self.path=Path(directory)/'swing-research.sqlite3';self.path.parent.mkdir(parents=True,exist_ok=True)
        self.active={};self.last={};self.next_due={};self.configs={}
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS settings (symbol TEXT PRIMARY KEY, value TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, started INTEGER NOT NULL, config TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, symbol TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS ledger_run ON ledger(run,id);
              CREATE TABLE IF NOT EXISTS predictions (id TEXT PRIMARY KEY, run TEXT NOT NULL, symbol TEXT NOT NULL, at INTEGER NOT NULL, prediction_bar INTEGER NOT NULL, primary_sample INTEGER NOT NULL, state TEXT NOT NULL, response TEXT, outcome TEXT);
              CREATE INDEX IF NOT EXISTS predictions_run ON predictions(run,prediction_bar);
            ''')
            saved={r['symbol']:json.loads(r['value']) for r in db.execute('SELECT * FROM settings')}
        for symbol in SYMBOLS:
            default={**asdict(Config(quantity=.001 if symbol.endswith('BTC') else .01)),'cadence_seconds':15,'jev_enabled':False}
            self.configs[symbol]=saved.get(symbol,default)
            self.last[symbol]={'status':'PAUSED','detail':'Start a new observation run. Restart never resumes automatically.'}
            with self.db() as db:
                previous=db.execute('SELECT id FROM runs WHERE symbol=? ORDER BY started DESC LIMIT 1',(symbol,)).fetchone()
                ended=previous and db.execute("SELECT 1 FROM ledger WHERE run=? AND kind='RUN_END' LIMIT 1",(previous['id'],)).fetchone()
            if previous:
                self.last[symbol]['run']=previous['id']
                if not ended:self.append(previous['id'],symbol,'RUN_END',int(time.time()*1000),{'reason':'SERVER_RESTART','open_plans':'unresolved'})

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    def append(self,run,symbol,kind,at,payload):
        with self.db() as db:db.execute('INSERT INTO ledger(run,symbol,kind,at,payload) VALUES(?,?,?,?,?)',(run,symbol,kind,at,encode(payload)))

    def start(self):
        for symbol in SYMBOLS:threading.Thread(target=self.loop,args=(symbol,),daemon=True,name='swing-research-'+symbol.split(':')[1]).start()
    def close(self):
        self.stop.set()
        with self.lock:
            for symbol in list(self.active):self.pause(symbol,'SERVICE_STOPPED')

    def configure_key(self,p):
        if not isinstance(p,dict) or set(p)!={'api_key'} or not isinstance(p['api_key'],str):
            raise ValueError('Expected a TypeSafe API key')
        key=p['api_key'].strip()
        if key and (len(key)>4096 or not key.isascii() or any(c.isspace() or ord(c)<33 or ord(c)>126 for c in key)):
            raise ValueError('Enter the API key as a single token')
        with self.lock:
            # In-flight responses lose their run ownership when credentials change.
            for symbol in list(self.active):self.pause(symbol,'JEV_KEY_CHANGED')
            self.judge.set_session_key(key)
            return {'configured':self.judge.configured,'key_source':self.judge.key_source,
                    'verified':False,'detail':'Key set for this server session. First successful Jev response verifies access.' if key else 'Jev disabled for this server session.'}

    def command(self,p):
        if not isinstance(p,dict) or set(p)-{'action','symbol','config'}:raise ValueError('Invalid research command')
        symbol=p.get('symbol');action=p.get('action')
        if symbol not in SYMBOLS:raise ValueError('Swing research supports Hyperliquid BTC and ETH only')
        with self.lock:
            if action=='configure':
                cfg=p.get('config')
                if not isinstance(cfg,dict) or set(cfg)-set(self.configs[symbol]):raise ValueError('Invalid research configuration')
                cfg={**self.configs[symbol],**cfg}
                if type(cfg['cadence_seconds']) is not int or cfg['cadence_seconds'] not in (10,15,30,60):raise ValueError('Cadence must be 10, 15, 30 or 60 seconds')
                if type(cfg['jev_enabled']) is not bool:raise ValueError('Invalid Jev setting')
                Config(**{k:v for k,v in cfg.items() if k not in ('cadence_seconds','jev_enabled')})
                if cfg['jev_enabled'] and not self.judge.configured:raise ValueError('Add your TypeSafe API key in Jev connection before enabling Jev')
                self.pause(symbol,'CONFIG_CHANGED');self.configs[symbol]=cfg
                with self.db() as db:db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET value=excluded.value',(symbol,encode(cfg)))
            elif action=='start':
                if symbol in self.active:return self.status()
                if self.configs[symbol]['jev_enabled'] and not self.judge.configured:raise ValueError('Add your TypeSafe API key in Jev connection before enabling Jev')
                run=uuid.uuid4().hex;now=int(time.time()*1000);cfg=deepcopy(self.configs[symbol])
                with self.db() as db:db.execute('INSERT INTO runs VALUES(?,?,?,?)',(run,symbol,now,encode(cfg)))
                self.active[symbol]={'run':run,'config':cfg,'tracker':None,'persisted_seq':0,'last_bucket':None,'sample_slot':None,'seen':{},'started':now}
                self.next_due[symbol]=0;self.last[symbol]={'status':'WARMING','run':run,'detail':'Loading completed 1m candles; historical events are warmup only.'}
                self.append(run,symbol,'RUN_START',now,{'config':cfg,'revision':REVISION,'code_hash':CODE_HASH,'model':MODEL,'prompt':PROMPT_VERSION})
            elif action=='pause':self.pause(symbol,'USER_PAUSED')
            else:raise ValueError('Unknown research action')
            return self.status()

    def pause(self,symbol,reason):
        a=self.active.pop(symbol,None)
        self.last[symbol]={**self.last[symbol],'status':'PAUSED','detail':reason,'run':a['run'] if a else self.last[symbol].get('run')}
        if a and a['tracker']:
            a['tracker'].terminate(reason,int(time.time()*1000))
            self.last[symbol]['snapshot']=a['tracker'].snapshot()
        if a:self.append(a['run'],symbol,'RUN_END',int(time.time()*1000),{'reason':reason,'snapshot':self.last[symbol].get('snapshot'),'open_plans':'unresolved; no observation after run end'})

    def loop(self,symbol):
        while not self.stop.is_set():
            with self.lock:
                a=self.active.get(symbol);due=self.next_due.get(symbol,0)
                ready=bool(a and time.monotonic()>=due)
                if ready:
                    if int(time.time()*1000)-a['started']>=86400000:
                        self.pause(symbol,'24H_RUN_COMPLETE');ready=False
                    else:
                        cadence=a['config']['cadence_seconds']
                        self.next_due[symbol]=time.monotonic()+max(.5,cadence-time.time()%cadence)
            if ready:
                try:self.sample(symbol,a)
                except Exception as e:
                    with self.lock:
                        if self.active.get(symbol) is a:
                            # No exception text: credentials or provider body could be included.
                            self.last[symbol]={'status':'UNAVAILABLE','run':a['run'],'detail':type(e).__name__+': observation withheld; retry pending'}
                            self.append(a['run'],symbol,'SAMPLE_UNAVAILABLE',int(time.time()*1000),{'class':type(e).__name__})
            self.stop.wait(.5)

    def sample(self,symbol,a):
        feed=self.gateway.bars(symbol,'1m',1000);bid,ask,meta=self.gateway.quote(symbol);now=int(time.time()*1000)
        source=meta.get('source_time');tick=float(meta.get('tick',0));qty=float(meta.get('qty_step',0))
        if not meta.get('metadata_verified') or not source or not -1000<=now-source<=15000 or not math.isfinite(tick) or not math.isfinite(qty) or tick<=0 or qty<=0:raise ValueError('Stale or incomplete market metadata')
        if not math.isfinite(float(bid)) or not math.isfinite(float(ask)) or not 0<float(bid)<=float(ask):raise ValueError('Invalid quote')
        quantity=a['config']['quantity']
        if abs(quantity/qty-round(quantity/qty))>1e-6:raise ValueError('Research quantity does not match venue step')
        bars=feed['bars']
        if not bars:raise ValueError('No bars')
        for b in bars:valid_bar(b)
        if any(bars[i]['time']>=bars[i+1]['time'] for i in range(len(bars)-1)):raise ValueError('Unsorted or duplicate provider bars')
        as_of=feed.get('as_of',0)
        if type(as_of) not in (int,float) or not math.isfinite(as_of) or not -1000<=now-as_of<=20000:raise ValueError('Stale candles')
        available_at=min(now,as_of)
        closed=[b for b in bars if b['time']+60000<=available_at]
        forming=next((b for b in reversed(bars) if b['time']<=available_at<b['time']+60000),None)
        if not closed or now-(closed[-1]['time']+60000)>75000:raise ValueError('Stale candles')
        with self.lock:
            if self.active.get(symbol) is not a:return
            if a['tracker'] and a['tracker'].tick!=tick:
                self.pause(symbol,'TICK_CHANGED_RESTART_REQUIRED');return
            for b in closed:
                if b['time'] in a['seen'] and a['seen'][b['time']]!=digest(b):
                    self.pause(symbol,'CLOSED_BAR_REVISED_RESTART_REQUIRED');return
            if a['tracker'] and now-(a['tracker'].last_time+60000)>120000:
                self.pause(symbol,'OBSERVATION_INTERRUPTED_RESTART_REQUIRED');return
            slot=now//(a['config']['cadence_seconds']*1000)
            if a['sample_slot']==slot:return
            a['sample_slot']=slot
            warming=a['tracker'] is None
            if warming:a['tracker']=SwingTracker(Config(**{k:v for k,v in a['config'].items() if k not in ('cadence_seconds','jev_enabled')}),tick)
            tracker=a['tracker']
            for b in closed:
                if tracker.last_time is None or b['time']>tracker.last_time:
                    tracker.feed(b,observed_at=None if warming else now);a['seen'][b['time']]=digest(b)
                    if not warming:self.append(a['run'],symbol,'BAR_CLOSED',now,{'bar':b,'observed_at':now})
            a['seen']={t:v for t,v in a['seen'].items() if t>=closed[-1]['time']-1000*60000}
            if warming:
                # Warmup reconstructs structure, but cannot own a forward shadow slot or budget.
                for plan in tracker.plans:
                    if plan['status'] in ('PENDING','OPEN'):plan.update(status='UNRESOLVED',reason='WARMUP_END')
                tracker.reserved_session=0;tracker.reserved_parent=0;tracker.parent_count=0
                self.append(a['run'],symbol,'WARMUP',now,{'first':closed[0]['time'],'last':closed[-1]['time'],'bars':len(closed),'snapshot':tracker.snapshot()})
                a['persisted_seq']=tracker.seq
            for ev in tracker.events:
                if ev['seq']>a['persisted_seq']:self.append(a['run'],symbol,'TRACKER_EVENT',now,ev)
            a['persisted_seq']=tracker.seq
            self.resolve(a,closed,now,available_at)
            snap=tracker.snapshot();prediction_bar=(now//60000+1)*60000
            primary=a['last_bucket']!=now//60000;a['last_bucket']=now//60000
            # Independent evaluations are grouped by source minute. Secondary intrabar samples are diagnostic.
            state={'symbol':symbol,'provider':'Hyperliquid public REST','observed_at':now,'quote_at':source,'candles_as_of':as_of,'bid':float(bid),'ask':float(ask),'tick':tick,'closed_cutoff':snap['cutoff'],'forming':forming,'forming_is_confirmed':False,'prediction_bar':prediction_bar,'definition':'next full 1m close vs its open; >= one tick','evaluation_bar':now//60000*60000,'evaluation_slot':now%60000//(a['config']['cadence_seconds']*1000)+1,'cadence_seconds':a['config']['cadence_seconds'],'revision':REVISION,'code_hash':CODE_HASH,'parent_id':snap['parent_id'],'trend':snap['trend'],'pivots':snap['pivots'][-10:],'candidates':snap['candidates'][-4:],'closed_bars':closed[-24:]}
            pid=uuid.uuid4().hex
            with self.db() as db:db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?,?,?,?)',(pid,a['run'],symbol,now,prediction_bar,int(primary),encode(state),None,None))
            current={'status':'OBSERVING','run':a['run'],'started':a['started'],'observed_at':now,'quote_at':source,'snapshot':snap,'forming':forming,'primary_sample':primary,'prediction_id':pid,'prediction_bar':prediction_bar,'jev':{'status':'DISABLED'},'detail':'Completed bars confirm setups. Intrabar snapshots only update research judgments.'}
            self.last[symbol]=current
        if a['config']['jev_enabled']:
            started=time.monotonic()
            try:
                result=self.judge.judge(state)
                elapsed=(time.monotonic()-started)*1000
                # A response must still belong to the same run and minute and return within its freshness budget.
                finished=int(time.time()*1000)
                stale=elapsed>3000 or finished//60000!=now//60000
                with self.lock:
                    if self.active.get(symbol) is not a:stale=True
                jev={'status':'STALE' if stale else 'AVAILABLE','latency_ms':round(elapsed),'received_at':finished,'prompt':PROMPT_VERSION,**result}
            except Exception as e:jev={'status':'UNAVAILABLE','error_class':type(e).__name__,'prompt':PROMPT_VERSION}
            with self.db() as db:db.execute('UPDATE predictions SET response=? WHERE id=? AND response IS NULL',(encode(jev),pid))
            with self.lock:
                if self.active.get(symbol) is a and self.last[symbol].get('prediction_id')==pid:self.last[symbol]['jev']=jev

    def resolve(self,a,bars,now,available_at=None):
        bytime={b['time']:b for b in bars}
        with self.db() as db:
            rows=db.execute('SELECT * FROM predictions WHERE run=? AND outcome IS NULL AND prediction_bar+60000<=?',(a['run'],min(now,available_at if available_at is not None else now))).fetchall()
            for r in rows:
                b=bytime.get(r['prediction_bar']);state=json.loads(r['state'])
                if b:
                    delta=b['close']-b['open'];label='up' if delta>=state['tick']-1e-9 else 'down' if delta<=-state['tick']+1e-9 else 'flat'
                    outcome={'label':label,'bar':b,'resolved_at':now}
                else:outcome={'label':'unknown','reason':'MISSING_FUTURE_BAR','resolved_at':now}
                db.execute('UPDATE predictions SET outcome=? WHERE id=? AND outcome IS NULL',(encode(outcome),r['id']))

    def status(self):
        with self.lock:
            now=int(time.time()*1000);result={}
            for symbol in SYMBOLS:
                s=deepcopy(self.last[symbol]);s['running']=symbol in self.active;s['config']=deepcopy(self.configs[symbol])
                if s['running'] and s.get('observed_at') and now-s['observed_at']>max(75000,s['config']['cadence_seconds']*2000):s['status']='STALE'
                s['dots']=self.dots(s.get('run'),s.get('snapshot',{}),s.get('forming'))
                s['coverage']='Hyperliquid public REST snapshots · 1m OHLC · not a full tick feed'
                result[symbol]=s
            return {'revision':REVISION,'code_hash':CODE_HASH,'mode':'shadow research · no orders','jev_configured':self.judge.configured,'jev_key_source':getattr(self.judge,'key_source',None),'model':MODEL,'prompt_version':PROMPT_VERSION,'symbols':result,'as_of':now}

    def dots(self,run,snapshot,forming):
        if not run:return []
        with self.db() as db:rows=db.execute('SELECT id,at,state,response FROM predictions WHERE run=? ORDER BY at DESC LIMIT 360',(run,)).fetchall()
        bars=snapshot.get('display_bars',[])
        lookup={b['time']:b for b in bars}
        if forming:lookup[forming['time']]=forming
        dots=[]
        for row in reversed(rows):
            state=json.loads(row['state']);response=json.loads(row['response']) if row['response'] else None
            # Model outputs alone color dots. A service failure is hollow, never a neutral vote.
            available=bool(response and response.get('status')=='AVAILABLE')
            vote={'long':'up','short':'down','neutral':'flat'}[response['answers']['directional_lean']['choice']] if available else 'unavailable'
            t=state['evaluation_bar'];partial=state.get('forming')
            b=lookup.get(t) or (partial if partial and partial['time']==t else None) or {'high':state['ask'],'low':state['bid']}
            dots.append({'id':row['id'],'bar':t,'slot':state['evaluation_slot'],'cadence_seconds':state['cadence_seconds'],
                         'observed_at':row['at'],'vote':vote,'service':response['status'] if response else 'DISABLED',
                         'high':b['high'],'low':b['low'],'prediction_bar':state['prediction_bar'],
                         'probabilities':response['answers']['directional_lean']['probabilities'] if available else None})
        return dots

    def history(self,symbol):
        if symbol not in SYMBOLS:raise ValueError('Unsupported symbol')
        with self.lock:run=self.last[symbol].get('run')
        with self.db() as db:
            rows=db.execute('SELECT * FROM predictions WHERE symbol=? AND run=? ORDER BY at DESC LIMIT 300',(symbol,run)).fetchall()
            events=db.execute('SELECT * FROM ledger WHERE symbol=? ORDER BY id DESC LIMIT 100',(symbol,)).fetchall()
        predictions=[{**dict(r),'state':json.loads(r['state']),'response':json.loads(r['response']) if r['response'] else None,'outcome':json.loads(r['outcome']) if r['outcome'] else None} for r in rows]
        scored=[r for r in predictions if r['primary_sample'] and r['response'] and r['response'].get('status')=='AVAILABLE' and r['outcome'] and r['outcome']['label']!='unknown']
        n=len(scored);correct=sum(r['response']['answers']['next_bar']['choice']==r['outcome']['label'] for r in scored)
        brier=sum(sum((p-int(k==r['outcome']['label']))**2 for k,p in r['response']['answers']['next_bar']['probabilities'].items()) for r in scored)/n if n else None
        # Compare on the same evaluated rows to a causal last-closed-candle baseline.
        baseline=sum(('up' if r['state']['closed_bars'][-1]['close']-r['state']['closed_bars'][-1]['open']>=r['state']['tick']-1e-9 else 'down' if r['state']['closed_bars'][-1]['close']-r['state']['closed_bars'][-1]['open']<=-r['state']['tick']+1e-9 else 'flat')==r['outcome']['label'] for r in scored)
        return {'predictions':predictions,'events':[{**dict(r),'payload':json.loads(r['payload'])} for r in events],'metrics':{'n':n,'accuracy':correct/n if n else None,'brier':brier,'baseline_accuracy':baseline/n if n else None,'scope':'Current run, latest 300 observations; first sample per minute only. Serial dependence remains; not independent trades, not a calibrated win rate.'}}

    def export(self,symbol):
        if symbol not in SYMBOLS:raise ValueError('Unsupported symbol')
        with self.db() as db:
            # Bound each export; no trading account or credentials are stored here.
            runs=[dict(r) for r in db.execute('SELECT * FROM runs WHERE symbol=? ORDER BY started DESC LIMIT 100',(symbol,))]
            ledger=[dict(r) for r in db.execute('SELECT * FROM ledger WHERE symbol=? ORDER BY id DESC LIMIT 20000',(symbol,))]
            predictions=[dict(r) for r in db.execute('SELECT * FROM predictions WHERE symbol=? ORDER BY at DESC LIMIT 20000',(symbol,))]
        return {'revision':REVISION,'current_code_hash':CODE_HASH,'model':MODEL,'prompt_version':PROMPT_VERSION,'questions':QUESTIONS,'runs':runs,'ledger':ledger,'predictions':predictions,'limits':{'runs':100,'ledger':20000,'predictions':20000},'execution':'none','coverage':'REST snapshots and closed 1m OHLC; not tick replay'}

"""Versioned, causal shadow experiments. No model calls or execution handles."""
from contextlib import closing
from copy import deepcopy
from dataclasses import asdict
import hashlib
import json
import math
from pathlib import Path
import random
import sqlite3
import threading
import time
from swing_tracker import Config, SwingTracker
from swing_liquidity import LiquidityStudy, DEFAULTS
from storage import connect, connect_readonly

VERSION='swing-learning.1'
ENGINE=hashlib.sha256(b''.join((Path(__file__).parent/n).read_bytes() for n in ('swing_tracker.py','swing_liquidity.py','swing_lab.py'))).hexdigest()
def dump(x):return json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False)
def ident(x):return hashlib.sha256(dump(x).encode()).hexdigest()
def complete(symbol,cfg):return {**asdict(Config(quantity=.001 if symbol.endswith('BTC') else .01)),**DEFAULTS,'cadence_seconds':15,'jev_enabled':False,**cfg}
def challenger(cfg,index=0):
    """One predeclared factor; never change permissions, risk, costs or levels."""
    field=('micro_bars','swing_minutes','parent_bars')[index%3]
    choices={'micro_bars':(1,2),'swing_minutes':(3,5),'parent_bars':(3,4)}[field]
    value=next(v for v in choices if v!=cfg[field])
    return {**deepcopy(cfg),field:value},field

def replay(run,rows,contexts,cfg,tick,ended):
    """Only recorded inputs, actual receipt times and contexts known by that receipt.

    Historic trials are retrospective. Only run assignments frozen before RUN_START
    qualify for prospective learning. Missing bars/contexts remain missing.
    """
    warm=[r for r in rows if r['warmup']];live=[r for r in rows if not r['warmup']]
    if not warm:return {'status':'NO_WARMUP','campaigns':[],'forward_bars':len(live)}
    tracker=SwingTracker(Config(**{k:cfg[k] for k in Config.__dataclass_fields__}),tick)
    for r in warm:tracker.feed(json.loads(r['payload']))
    for p in tracker.plans:
        if p['status'] in ('OPEN','PENDING'):p.update(status='UNRESOLVED',reason='WARMUP_END')
    tracker.reserved_session=tracker.reserved_parent=tracker.parent_count=0
    study=LiquidityStudy(run['id'],run['symbol'],cfg,tick,warm[-1]['time']+60000)
    study.last_bar=json.loads(warm[-1]['payload']);study.local_trend=tracker.trend
    cursor=0;known=None;gap=False
    for r in live:
        observed=r['observed_at'];b=json.loads(r['payload'])
        while cursor<len(contexts) and contexts[cursor]['observed_at']<=observed:
            known=contexts[cursor];cursor+=1
            study.set_context(known,tracker.bars+[b])
        tracker.set_study_campaigns(study.campaigns)
        if tracker.last_time+60000!=b['time']:gap=True;break
        tracker.feed(b,observed_at=observed)
        study.observe(b,observed,tracker.snapshot(),tracker.bars)
        tracker.events.clear();study.events.clear()
    if ended or gap:study.end('ARCHIVE_RUN_END' if not gap else 'DATA_GAP',run.get('ended_at') or (live[-1]['observed_at'] if live else run['started']))
    output=[]
    for c in study.campaigns:
        if c['playbook']!='HTF_REVERSAL':continue  # shared contact inventory
        plans=[p for p in study.plans if p['campaign']==c['id'] and p['variant']=='tracker']
        p=plans[0] if plans else None
        unresolved=(not p and c['state']=='WATCH') or p and (p['status'] in ('PENDING','OPEN','UNRESOLVED','AMBIGUOUS') or ('entry' in p and p.get('net_r') is None))
        ref=c['reference'];key=ident([run['symbol'],ref['timeframe'],ref['price'],ref['side'],c['contact_bar']['time']])
        output.append({'key':key,'at':c['observed_at'],'value':None if unresolved else (p.get('net_r') if p and 'entry' in p else 0),
                       'entered':bool(p and 'entry' in p),'resolved':bool(p and p.get('net_r') is not None),
                       'status':p['status'] if p else c['state']})
    return {'status':'GAP' if gap else 'COMPLETE' if ended else 'COLLECTING','campaigns':output,'forward_bars':len(live),
            'scope':'Deterministic tracker at shared HTF reversal contacts; no new Jev calls. Continuations and model-filtered entries remain separate.'}

def compare(results):
    pairs={};unresolved=0
    for result in results:
        a={c['key']:c for c in result['baseline']['campaigns']};b={c['key']:c for c in result['challenger']['campaigns']}
        for key in a.keys()|b.keys():
            left=a.get(key);right=b.get(key)
            # A missing contact is not a zero-result opportunity.
            if not left or not right or left['value'] is None or right['value'] is None:unresolved+=1;continue
            pairs[key]=(left,right)
    days={};entries=0
    for a,b in sorted(pairs.values(),key=lambda x:x[0]['at']):
        day=str(a['at']//86400000);v=days.setdefault(day,[0.,0.]);v[0]+=a['value'];v[1]+=b['value'];entries+=bool(a['resolved'] or b['resolved'])
    delta=[b-a for a,b in days.values()];lower=None
    if len(delta)>=3:
        rng=random.Random(7026);boot=sorted(sum(rng.choices(delta,k=len(delta)))/len(delta) for _ in range(2000));lower=boot[49]
    def dd(index):
        equity=peak=worst=0.
        for values in days.values():equity+=values[index];peak=max(peak,equity);worst=max(worst,peak-equity)
        return worst
    return {'paired_contacts':len(pairs),'resolved_contacts':entries,'days':len(days),'unresolved_or_unmatched':unresolved,
            'baseline_net_r':sum(x[0] for x in days.values()),'challenger_net_r':sum(x[1] for x in days.values()),
            'mean_delta_r_per_day':sum(delta)/len(delta) if delta else None,'lower_95_daily_bootstrap':lower,
            'baseline_daily_drawdown_r':dd(0),'challenger_daily_drawdown_r':dd(1),
            'uncertainty':'UTC-day clustered bootstrap; dependent markets and small samples do not establish a future edge.'}

def verdict(summary,stage):
    required,days=(20,3) if stage=='EXPLORATION' else (60,10)
    if summary['resolved_contacts']<required or summary['days']<days:return 'COLLECTING'
    if summary['unresolved_or_unmatched']>summary['paired_contacts']*.1:return 'INCOMPLETE'
    if (summary['lower_95_daily_bootstrap'] or 0)>0 and summary['challenger_daily_drawdown_r']<=summary['baseline_daily_drawdown_r']:
        return 'VALIDATE' if stage=='EXPLORATION' else 'PROMOTE'
    return 'REJECT'

class LearningLab:
    def __init__(self,path):
        self.path=Path(path);self.lock=threading.RLock();self.stop=threading.Event();self.worker=None;self.cache={'state':'REVIEW_PENDING','message':'Reviewing every retained run in the background.'};self.error=None
        with closing(connect(self.path)) as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS lab_policies(symbol TEXT PRIMARY KEY,payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lab_assignments(run TEXT PRIMARY KEY,payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lab_results(run TEXT NOT NULL,contract TEXT NOT NULL,input_hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run,contract));
            CREATE TABLE IF NOT EXISTS lab_reviews(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS lab_intent(id INTEGER PRIMARY KEY CHECK(id=1),symbol TEXT NOT NULL,enabled INTEGER NOT NULL);''')
        self.refresh_cache()
    def read(self,sql,args=()):
        with closing(connect_readonly(self.path)) as db:return [dict(r) for r in db.execute(sql,args)]
    def write(self,sql,args=()):
        db=connect(self.path)
        try:
            with db:db.execute(sql,args)
        finally:db.close()
    def intent(self,symbol=None,enabled=None):
        if symbol is not None:self.write('INSERT OR REPLACE INTO lab_intent VALUES(1,?,?)',(symbol,int(enabled)))
        rows=self.read('SELECT * FROM lab_intent');return rows[0] if rows else None
    def policy(self,symbol,cfg):
        cfg=json.loads(dump(cfg))
        rows=self.read('SELECT payload FROM lab_policies WHERE symbol=?',(symbol,));p=json.loads(rows[0]['payload']) if rows else None
        # Manual edits or engine changes create a new reference; never pool cohorts.
        if not p or p['engine']!=ENGINE or p['baseline']!=cfg:
            trial,factor=challenger(cfg);p={'symbol':symbol,'engine':ENGINE,'baseline':deepcopy(cfg),'challenger':trial,'factor':factor,'stage':'EXPLORATION','frozen_at':int(time.time()*1000),'index':0,'revision':0}
            self.write('INSERT OR REPLACE INTO lab_policies VALUES(?,?)',(symbol,dump(p)))
        return p
    def assign(self,run,symbol,cfg,started):
        p=self.policy(symbol,cfg);contract=ident(p)
        self.write('INSERT OR IGNORE INTO lab_assignments VALUES(?,?)',(run,dump({**p,'contract':contract,'run':run,'selected_at':started})))
        return {'contract':contract,'stage':p['stage'],'factor':p['factor'],'baseline':p['baseline'],'challenger':p['challenger']}
    def selected_config(self,symbol,cfg):
        rows=self.read('SELECT payload FROM lab_policies WHERE symbol=?',(symbol,))
        if rows:
            p=json.loads(rows[0]['payload'])
            if p['engine']==ENGINE and p.get('promoted_from')==ident(cfg):return deepcopy(p['baseline'])
        return cfg
    def refresh_cache(self):
        policies=[json.loads(r['payload']) for r in self.read('SELECT payload FROM lab_policies')]
        reviews=self.read('SELECT at,payload FROM lab_reviews ORDER BY id DESC LIMIT 1')
        report=json.loads(reviews[0]['payload']) if reviews else {'state':'REVIEW_PENDING','message':'Background review pending; baseline settings are ready immediately.'}
        with self.lock:self.cache={**report,'policies':policies,'version':VERSION,'engine':ENGINE,'intent':self.intent(),'error':self.error}
    def status(self):
        with self.lock:return deepcopy(self.cache)
    def review(self):
        runs=self.read('SELECT * FROM runs ORDER BY started');assignments={r['run']:json.loads(r['payload']) for r in self.read('SELECT * FROM lab_assignments')}
        total_bars=total_campaigns=total_resolved=0;trials=[];prospective={};latest={}
        for run in runs:
            if self.stop.is_set():return
            rows=self.read('SELECT * FROM run_bars WHERE run=? ORDER BY time',(run['id'],));total_bars+=sum(not r['warmup'] for r in rows)
            recorded=self.read('SELECT state FROM study_state WHERE run=?',(run['id'],))
            if recorded:
                s=json.loads(recorded[0]['state']);total_campaigns+=len(s['campaigns']);total_resolved+=sum(p.get('gross_r') is not None for p in s['plans'])
            if not rows:continue
            configs=complete(run['symbol'],json.loads(run['config']));assignment=assignments.get(run['id']);trial,factor=challenger(configs)
            if assignment and assignment['engine']==ENGINE:configs=assignment['baseline'];trial=assignment['challenger'];factor=assignment['factor']
            else:assignment=None
            if not configs['study_enabled']:continue
            events=self.read("SELECT at,payload FROM ledger WHERE run=? AND kind IN ('STUDY_EVENT','RUN_END') ORDER BY at,id",(run['id'],))
            contexts=[];ended=False
            for event in events:
                e=json.loads(event['payload'])
                if e.get('kind')=='HTF_CONTEXT':contexts.append(e['context'])
                if 'open_plans' in e:ended=True;run['ended_at']=event['at']
            tickrow=self.read('SELECT snapshot FROM collection_checkpoints WHERE run=?',(run['id'],))
            if not tickrow:continue
            tick=json.loads(tickrow[0]['snapshot'])['tick'];contract=assignment['contract'] if assignment else ident([ENGINE,configs,trial,'retrospective'])
            signature=ident([rows,contexts,ended,tick]);cached=self.read('SELECT input_hash,payload FROM lab_results WHERE run=? AND contract=?',(run['id'],contract))
            if cached and cached[0]['input_hash']==signature:result=json.loads(cached[0]['payload'])
            else:
                result={'run':run['id'],'symbol':run['symbol'],'factor':factor,'contract':contract,'evidence':'PROSPECTIVE_FROZEN' if assignment else 'RETROSPECTIVE_CURRENT_ENGINE',
                        'baseline':replay(run,rows,contexts,configs,tick,ended),'challenger':replay(run,rows,contexts,trial,tick,ended),'cost_bps':configs['study_cost_bps']}
                self.write('INSERT OR REPLACE INTO lab_results VALUES(?,?,?,?)',(run['id'],contract,signature,dump(result)))
            trials.append({'run':run['id'],'symbol':run['symbol'],'factor':factor,'evidence':result['evidence'],'forward_bars':result['baseline']['forward_bars'],'paired':compare([result])})
            if assignment:
                prospective.setdefault(contract,[]).append(result);latest[contract]=assignment
        decisions=[]
        for contract,results in prospective.items():
            assignment=latest[contract];rows=self.read('SELECT payload FROM lab_policies WHERE symbol=?',(assignment['symbol'],))
            if not rows:continue
            p=json.loads(rows[0]['payload'])
            if ident(p)!=contract:continue
            summary=compare(results);decision=verdict(summary,p['stage']) if all(r['cost_bps'] is not None for r in results) else 'COSTS_UNSET'
            decisions.append({'symbol':p['symbol'],'stage':p['stage'],'factor':p['factor'],'decision':decision,'summary':summary})
            if decision in ('VALIDATE','PROMOTE','REJECT'):
                previous=deepcopy(p);p['revision']+=1;p['frozen_at']=int(time.time()*1000)
                if decision=='VALIDATE':p['stage']='VALIDATION'
                else:
                    if decision=='PROMOTE':p['promoted_from']=ident(p['baseline']);p['baseline']=p['challenger']
                    p['index']+=1;p['challenger'],p['factor']=challenger(p['baseline'],p['index']);p['stage']='EXPLORATION'
                self.write('INSERT OR REPLACE INTO lab_policies VALUES(?,?)',(p['symbol'],dump(p)))
                self.write('INSERT INTO lab_reviews(at,payload) VALUES(?,?)',(int(time.time()*1000),dump({'transition':decision,'before':previous,'after':p,'evidence':summary})))
        report={'state':'REVIEWED','at':int(time.time()*1000),'runs_reviewed':len(runs),'snapshots':self.read('SELECT COUNT(*) n FROM predictions')[0]['n'],
                'forward_bars':total_bars,'recorded_campaigns':total_campaigns,'recorded_resolved_plans':total_resolved,'trials':trials,'decisions':decisions,
                'message':'No efficient setting established yet.' if not total_resolved else 'Comparisons are evidence-qualified; baseline remains until a later validation block passes.',
                'protocol':{'development_resolved_contacts':20,'development_days':3,'validation_resolved_contacts':60,'validation_days':10,'max_unresolved_fraction':.1,'promotion':'Positive lower 95% UTC-day bootstrap and no worse daily drawdown; costs required. New settings apply only to a new run.',
                            'scope':'One-factor deterministic HTF reversal shadow trials. No model training, extra inference, broker actions, or claims of Jev/continuation improvement.'}}
        self.write('INSERT INTO lab_reviews(at,payload) VALUES(?,?)',(report['at'],dump(report)));self.refresh_cache()
    def start(self):
        if self.worker and self.worker.is_alive():return
        def work():
            while not self.stop.is_set():
                try:self.review();self.error=None
                except Exception as e:self.error=type(e).__name__;self.refresh_cache()
                self.stop.wait(60)
        self.worker=threading.Thread(target=work,daemon=True,name='swing-learning-review');self.worker.start()
    def close(self):
        self.stop.set()
        if self.worker:self.worker.join(timeout=2)

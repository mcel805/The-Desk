"""Independent ETH/BTC observation service and immutable local research ledger.

Intentionally receives ONLY a public market gateway. No broker/order-engine handle.
Restart, pause, config changes and gaps end the observation run. Start is explicit.
"""
from copy import deepcopy
from contextlib import contextmanager, nullcontext
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
from jev_swing import Jev, MODEL, PROMPT_VERSION, QUESTIONS, JevRequestError, JevResponseError
from swing_volume import SwingVolume, VERSION as VOLUME_VERSION
from swing_warnings import WarningEngine, REVISION as WARNING_VERSION, DEFAULTS as WARNING_DEFAULTS, validate_config as validate_warning_config
from jev_costs import JevCostMeter, RATES
from swing_liquidity import DEFAULTS as STUDY_DEFAULTS, VERSION as STUDY_VERSION, LiquidityStudy, build_htf_context, validate_settings, FRAME_MS
from swing_metrics import forecast_metrics
from storage import clear_swing_pause, connect, connect_readonly, persist_swing_pause, read_swing_pause, StorageFault, atomic_json

SYMBOLS=('hyperliquid:BTC','hyperliquid:ETH')
WARNING_CADENCE_SECONDS=15
CODE_HASH=hashlib.sha256(b''.join((Path(__file__).parent/name).read_bytes() for name in ('swing_tracker.py','swing_research.py','swing_warnings.py','swing_volume.py','jev_swing.py','jev_costs.py','swing_liquidity.py','storage.py','web/pine-examples/market-cipher-a.pine','web/pine-examples/market-cipher-b.pine'))).hexdigest()
def encode(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(v):return hashlib.sha256(encode(v).encode()).hexdigest()

def request_reliability(rows):
    """All retained evaluations in this run; disabled and pending are not successes."""
    def summarize(items):
        available=failed=pending=disabled=recovered=0;errors={}
        for r in items:
            n=r['n'];status=r['status']
            if status=='DISABLED':disabled+=n
            elif status=='PENDING':pending+=n
            elif status=='AVAILABLE':
                available+=n
                if r['attempts']>1:recovered+=n
            else:
                failed+=n
                code=r['error_code'] or status
                label=(str(r['http_status'])+' / ' if r['http_status'] else '')+code
                errors[label]=errors.get(label,0)+n
        completed=available+failed;rate=failed/completed if completed else None
        return {'completed':completed,'available':available,'failed':failed,'pending':pending,'disabled':disabled,
                'recovered':recovered,'failure_rate':rate,'target_failure_rate':.01,
                'below_target':rate<.01 if rate is not None else None,'errors':errors,
                'zero_failure_upper_95':1-.05**(1/completed) if completed and not failed else None}
    rows=[dict(r) for r in rows]
    return {**summarize(rows),'by_prompt':{p:summarize([r for r in rows if r['prompt']==p]) for p in sorted({r['prompt'] for r in rows})},
            'current_prompt':PROMPT_VERSION,'scope':'Current run, all retained evaluations; stale, unavailable and unresolved count as failures. Neutral is a valid answer. Small samples do not establish a long-run failure rate.'}

class SwingResearch:
    def __init__(self,gateway,directory,judge=None):
        self.gateway=gateway;self.judge=judge or Jev();self.lock=threading.RLock();self.stop=threading.Event()
        self.data_dir=Path(directory);self.path=self.data_dir/'swing-research.sqlite3';self.path.parent.mkdir(parents=True,exist_ok=True)
        self.active={};self.last={};self.next_due={};self.configs={};self.context_cache={};self.worker=None;self.storage_guard=None
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS study_state (run TEXT PRIMARY KEY, symbol TEXT NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS settings (symbol TEXT PRIMARY KEY, value TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, started INTEGER NOT NULL, config TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, symbol TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS ledger_run ON ledger(run,id);
              CREATE TABLE IF NOT EXISTS predictions (id TEXT PRIMARY KEY, run TEXT NOT NULL, symbol TEXT NOT NULL, at INTEGER NOT NULL, prediction_bar INTEGER NOT NULL, primary_sample INTEGER NOT NULL, state TEXT NOT NULL, response TEXT, outcome TEXT);
              CREATE INDEX IF NOT EXISTS predictions_run ON predictions(run,prediction_bar);
              CREATE UNIQUE INDEX IF NOT EXISTS prediction_primary_minute ON predictions(run,prediction_bar) WHERE primary_sample=1;
              CREATE UNIQUE INDEX IF NOT EXISTS prediction_sampling_slot ON predictions(run,json_extract(state,'$.evaluation_bar'),json_extract(state,'$.evaluation_slot'));
              CREATE TABLE IF NOT EXISTS run_bars(run TEXT NOT NULL,symbol TEXT NOT NULL,time INTEGER NOT NULL,observed_at INTEGER NOT NULL,warmup INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),digest TEXT NOT NULL,PRIMARY KEY(run,time));
              CREATE TABLE IF NOT EXISTS collection_checkpoints(run TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,closed_cutoff INTEGER NOT NULL,prediction_id TEXT NOT NULL,seq INTEGER NOT NULL,snapshot TEXT NOT NULL CHECK(json_valid(snapshot)));
              CREATE TABLE IF NOT EXISTS collection_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);

            ''')
            saved={r['symbol']:json.loads(r['value']) for r in db.execute('SELECT * FROM settings')}
        self.backfill_bars()
        self.cost_meter=JevCostMeter(self.path)
        for symbol in SYMBOLS:
            default={**asdict(Config(quantity=.001 if symbol.endswith('BTC') else .01)),'cadence_seconds':WARNING_CADENCE_SECONDS,'jev_enabled':False,'warning_settings':deepcopy(WARNING_DEFAULTS),**deepcopy(STUDY_DEFAULTS)}
            saved_config={**saved.get(symbol,{})}
            saved_config['cadence_seconds']=WARNING_CADENCE_SECONDS
            self.configs[symbol]={**default,**saved_config}
            self.last[symbol]={'status':'PAUSED','detail':'Start a new observation run. Restart never resumes automatically.'}
            with self.db() as db:
                previous=db.execute('SELECT id FROM runs WHERE symbol=? ORDER BY started DESC LIMIT 1',(symbol,)).fetchone()
                ended=previous and db.execute("SELECT 1 FROM ledger WHERE run=? AND kind='RUN_END' LIMIT 1",(previous['id'],)).fetchone()
            if previous:
                self.last[symbol]['run']=previous['id']
                with self.db() as db:checkpoint=db.execute('SELECT * FROM collection_checkpoints WHERE run=?',(previous['id'],)).fetchone()
                if checkpoint:
                    self.last[symbol].update(snapshot=json.loads(checkpoint['snapshot']),observed_at=checkpoint['observed_at'],archived=True)
                if not ended:
                    self.append(previous['id'],symbol,'RUN_END',int(time.time()*1000),{'reason':'SERVER_RESTART','open_plans':'unresolved'})
                    self.end_saved_study(previous['id'], 'SERVER_RESTART')

        from swing_lab import LearningLab
        self.lab=LearningLab(self.path)
        self.recover_after=0

    @contextmanager
    def db(self):
        db=connect(self.path);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    @contextmanager
    def read_db(self):
        db=connect_readonly(self.path)
        try:yield db
        finally:db.close()

    def settings_state(self):
        # No history, cost query or capacity scan can delay form hydration.
        with self.lock:
            return {'symbols':{symbol:{'config':deepcopy(self.configs[symbol]),
                    'revision':digest(self.configs[symbol]),'running':symbol in self.active,
                    'run':self.last[symbol].get('run')} for symbol in SYMBOLS},
                    'jev_configured':self.judge.configured,'as_of':int(time.time()*1000)}

    def effective_lab_intent(self):
        marker=read_swing_pause(data_dir=self.data_dir)
        try:intent=self.lab.intent()
        except (OSError,sqlite3.Error,StorageFault):
            if marker:return {'symbol':marker['symbol'],'enabled':False,'paused_by_marker':True}
            raise
        if marker and (not intent or intent['symbol']==marker['symbol']):return {'symbol':marker['symbol'],'enabled':False,'paused_by_marker':True}
        if intent:
            marker=read_swing_pause(data_dir=self.data_dir,symbol=intent['symbol'])
            if marker:return {**intent,'enabled':False,'paused_by_marker':True}
        return intent

    def lab_status(self):
        marker=read_swing_pause(data_dir=self.data_dir)
        try:result=self.lab.status()
        except (OSError,sqlite3.Error,StorageFault):
            if not marker:raise
            return {'intent':{'symbol':marker['symbol'],'enabled':False,'paused_by_marker':True},'swing_pause':marker}
        result['intent']=self.effective_lab_intent();result['swing_pause']=read_swing_pause(data_dir=self.data_dir,symbol=result['intent']['symbol'] if result['intent'] else None)
        return result

    def paused_compact(self,symbol,detail,audit_pending=False):
        result=self.settings_state();entry=result['symbols'][symbol]
        entry.update({'status':'PAUSED','running':False,'detail':detail,'audit_pending':audit_pending})
        result.update({'audit_pending':audit_pending,'lab_intent':{'symbol':symbol,'enabled':False,'paused_by_marker':True},'swing_pause':read_swing_pause(data_dir=self.data_dir,symbol=symbol)})
        return result

    def pause_target(self,symbol):
        if self.active:
            if symbol not in self.active:raise ValueError('Pause the active Swing symbol before pausing '+symbol+'.')
            return True
        return False

    def pause_result(self,symbol,compact=False,audit_error=None):
        if audit_error:
            detail='USER_PAUSED · audit pending: '+type(audit_error).__name__
            self.last[symbol]={**self.last[symbol],'detail':detail,'audit_pending':True,'storage_error':type(audit_error).__name__}
            return self.paused_compact(symbol,detail,True)
        try:
            return self.settings_state() if compact else self.status()
        except (OSError,sqlite3.Error,StorageFault) as error:
            detail='USER_PAUSED · status pending: '+type(error).__name__
            self.last[symbol]={**self.last[symbol],'detail':detail,'storage_error':type(error).__name__}
            return self.paused_compact(symbol,detail)

    def append(self,run,symbol,kind,at,payload,db=None):
        with (nullcontext(db) if db is not None else self.db()) as db:db.execute('INSERT INTO ledger(run,symbol,kind,at,payload) VALUES(?,?,?,?,?)',(run,symbol,kind,at,encode(payload)))

    def backfill_bars(self):
        # Legacy records are copied as retained evidence, never fresh forward observations.
        with self.db() as db:
            if db.execute("SELECT 1 FROM collection_meta WHERE key='legacy_bars_v1'").fetchone():return
            for row in db.execute("SELECT run,symbol,at,payload FROM ledger WHERE kind IN ('BAR_CLOSED','WARMUP')"):
                value=json.loads(row['payload'])
                bars=[value['bar']] if 'bar' in value else value.get('snapshot',{}).get('display_bars',[])
                for b in bars:
                    b={k:b[k] for k in ('time','open','high','low','close','volume')}
                    db.execute('INSERT OR IGNORE INTO run_bars VALUES(?,?,?,?,?,?,?)',(row['run'],row['symbol'],b['time'],row['at'],int('bar' not in value),encode(b),digest(b)))
            for row in db.execute('SELECT run,symbol,at,state FROM predictions'):
                state=json.loads(row['state'])
                for b in state.get('closed_bars',[]):
                    db.execute('INSERT OR IGNORE INTO run_bars VALUES(?,?,?,?,?,?,?)',(row['run'],row['symbol'],b['time'],row['at'],1,encode(b),digest(b)))
            db.execute("INSERT INTO collection_meta VALUES('legacy_bars_v1','Retained archive only; missing warmup history cannot be recreated')")

    def storage_failure(self,symbol,a,error):
        with self.lock:
            if self.active.get(symbol) is a:self.active.pop(symbol,None)
            self.last[symbol]={**self.last.get(symbol,{}),'status':'STORAGE_ERROR','run':a['run'],
                'detail':'Durable write failed. Collection paused; no further model requests. Open Data & Backups.',
                'storage_error':type(error).__name__}
        try:atomic_json(self.path.with_name('collection-fault.json'),{'symbol':symbol,'run':a['run'],'at':int(time.time()*1000),'error_class':type(error).__name__})
        except OSError:pass

    def start(self):
        with self.lock:
            if self.worker and self.worker.is_alive():return
            self.worker=threading.Thread(target=self.loop,daemon=True,name='swing-research-single')
            self.worker.start();self.lab.start()
    def close(self):
        self.stop.set();self.lab.close()
        with self.lock:
            for symbol in list(self.active):self.pause(symbol,'SERVICE_STOPPED')
        if self.worker and self.worker is not threading.current_thread():self.worker.join(timeout=15)

    def configure_key(self,p):
        if not isinstance(p,dict):raise ValueError('Expected a TypeSafe key command')
        action=p.get('action','session')
        fields={'api_key'} if action=='session' else {'action','api_key'} if action=='save' else {'action'}
        if action not in ('session','save','forget','remember','load') or set(p)!=fields or (action in ('session','save') and not isinstance(p.get('api_key'),str)):
            raise ValueError('Expected a TypeSafe API key')
        key=p.get('api_key','').strip()
        if key and (len(key)>4096 or not key.isascii() or any(c.isspace() or ord(c)<33 or ord(c)>126 for c in key)):
            raise ValueError('Enter the API key as a single token')
        if action=='save' and not key:raise ValueError('Enter an API key to save')
        with self.lock:
            # Persist successfully before changing the active run or cached credential.
            if action=='save':self.judge.save_key(key)
            elif action=='remember':
                current=self.judge._key()
                if not current:raise ValueError('No active key to remember. Paste a key once to save it.')
                self.judge.save_key(current)
                return {'configured':True,'key_source':self.judge.key_source,'verified':False,
                        'detail':'Active key saved in macOS Keychain. Collection continues unchanged.'}
            elif action=='forget':self.judge.forget_key()
            elif action=='load':self.judge.load_saved_key()
            # In-flight responses lose their run ownership when credentials change.
            for symbol in list(self.active):self.pause(symbol,'JEV_KEY_CHANGED')
            if action=='session':self.judge.set_session_key(key)
            return {'configured':self.judge.configured,'key_source':self.judge.key_source,
                    'verified':False,'detail':('Key saved in macOS Keychain; loaded automatically on future starts.' if action=='save' else
                    'Saved key removed. Jev disabled for this server session.' if action=='forget' else
                    'Saved key loaded from macOS Keychain.' if action=='load' else
                    'Key set for this server session.' if key else 'Jev disabled for this server session.')+' First successful Jev response verifies access.'}

    def _start_run(self,symbol,compact=False):
        if symbol in self.active:return self.settings_state() if compact else self.status()
        if self.active:
            current=next(iter(self.active))
            raise ValueError('One observation run at a time. Pause '+current+' before starting '+symbol+'.')
        if self.configs[symbol]['jev_enabled'] and not self.judge.configured:raise ValueError('Add your TypeSafe API key in Jev connection before enabling Jev')
        if self.configs[symbol].get('cadence_seconds')!=WARNING_CADENCE_SECONDS:raise ValueError('Swing warning collection requires a 15-second cadence')
        cfg=deepcopy(self.configs[symbol]);reference=self.validation_reference(symbol,cfg)
        run=uuid.uuid4().hex;now=int(time.time()*1000)
        if self.storage_guard:self.storage_guard()
        with self.db() as db:
            db.execute('INSERT INTO runs VALUES(?,?,?,?)',(run,symbol,now,encode(cfg)))
            self.append(run,symbol,'RUN_START',now,{'config':cfg,'revision':REVISION,'code_hash':CODE_HASH,'model':MODEL,'prompt':PROMPT_VERSION,'study_version':STUDY_VERSION,'validation_reference':reference},db=db)
        self.active[symbol]={'run':run,'config':cfg,'tracker':None,'persisted_seq':0,'last_bucket':None,'sample_slot':None,'seen':{},'started':now,'study':None,'validation_reference':reference}
        if hasattr(self,'lab'):
            contract=self.lab.assign(run,symbol,cfg,now)
            self.append(run,symbol,'LAB_ASSIGNMENT',now,contract)
        self.context_cache.pop(symbol,None)
        self.next_due[symbol]=0;self.last[symbol]={'status':'WARMING','run':run,'detail':'Loading completed 1m candles; historical events are warmup only.'}
        return self.settings_state() if compact else self.status()

    def command(self,p,*,clear_pause=True):
        if not isinstance(p,dict) or set(p)-{'action','symbol','config','level','level_id','expected_revision','compact'}:raise ValueError('Invalid research command')
        symbol=p.get('symbol');action=p.get('action')
        if symbol not in SYMBOLS:raise ValueError('Swing research supports Hyperliquid BTC and ETH only')
        with self.lock:
            if action in ('start','start_auto'):
                if symbol in self.active:return self.settings_state() if p.get('compact') else self.status()
                if self.active:raise ValueError('One observation run at a time. Pause '+next(iter(self.active))+' before starting '+symbol+'.')
                if p.get('expected_revision') and p['expected_revision']!=digest(self.configs[symbol]):
                    raise ValueError('Settings changed in another tab. Reload settings and start again.')
                patch=p.get('config',{})
                if not isinstance(patch,dict):raise ValueError('Invalid research configuration')
                if 'study_levels' in patch and patch['study_levels']!=self.configs[symbol]['study_levels']:
                    raise ValueError('Use timestamped level commands for manual references')
                previous=self.last[symbol].get('run')
                if previous and self.last[symbol].get('status')=='STORAGE_ERROR':
                    with self.read_db() as db:ended=db.execute("SELECT 1 FROM ledger WHERE run=? AND kind='RUN_END'",(previous,)).fetchone()
                    if not ended:
                        self.append(previous,symbol,'RUN_END',int(time.time()*1000),{'reason':'STORAGE_INTERRUPTED','open_plans':'unresolved'})
                        self.end_saved_study(previous,'STORAGE_INTERRUPTED')
                cfg={**deepcopy(self.configs[symbol]),**patch}
                # Learning Lab selection compares the full frozen configuration.
                # A partial warning update must retain the existing nested rules.
                if isinstance(patch.get('warning_settings'),dict):
                    cfg['warning_settings']={**deepcopy(self.configs[symbol].get('warning_settings',{})),**patch['warning_settings']}
                cfg=self.lab.selected_config(symbol,cfg)
                # Configure and start share this lock; no blank form or other tab can intervene.
                self.command({'action':'configure','symbol':symbol,'config':{k:v for k,v in cfg.items() if k!='study_levels'},'compact':True})
                result=self._start_run(symbol,compact=bool(p.get('compact')))
                self.lab.intent(symbol,action=='start_auto')
                if clear_pause:clear_swing_pause(data_dir=self.data_dir,symbol=symbol)
                return result
            if action in ('level_add','level_remove'):
                cfg=deepcopy(self.configs[symbol])
                if action=='level_add':
                    level=p.get('level')
                    if not isinstance(level,dict) or set(level)!={'price','side','timeframe','label','role'}:raise ValueError('Exact manual HTF reference fields required')
                    cfg['study_levels'].append({**level,'id':'manual:'+uuid.uuid4().hex,'known_at':int(time.time()*1000),'source':'manual'})
                else:
                    if not isinstance(p.get('level_id'),str) or not any(x['id']==p['level_id'] for x in cfg['study_levels']):raise ValueError('Unknown manual reference')
                    cfg['study_levels']=[x for x in cfg['study_levels'] if x['id']!=p['level_id']]
                validate_settings(cfg)
                self.lab.disable_intent(symbol)
                self.pause(symbol,'HTF_MAP_CHANGED');self.configs[symbol]=cfg;self.context_cache.pop(symbol,None)
                with self.db() as db:db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET value=excluded.value',(symbol,encode(cfg)))
            elif action=='configure':
                cfg=p.get('config')
                if not isinstance(cfg,dict) or set(cfg)-set(self.configs[symbol]):raise ValueError('Invalid research configuration')
                if 'study_levels' in cfg:raise ValueError('Use timestamped level_add or level_remove for manual references')
                cfg={**self.configs[symbol],**cfg}
                if isinstance(cfg.get('warning_settings'),dict):
                    cfg['warning_settings']={**deepcopy(self.configs[symbol].get('warning_settings',{})),**cfg['warning_settings']}
                validate_settings(cfg)
                cfg['warning_settings']=validate_warning_config(cfg.get('warning_settings'))
                if type(cfg['cadence_seconds']) is not int or cfg['cadence_seconds']!=WARNING_CADENCE_SECONDS:raise ValueError('Swing warning collection requires a 15-second cadence')
                if type(cfg['jev_enabled']) is not bool:raise ValueError('Invalid Jev setting')
                Config(**{k:v for k,v in cfg.items() if k not in ('cadence_seconds','jev_enabled','warning_settings') and k not in STUDY_DEFAULTS})
                if cfg['jev_enabled'] and not self.judge.configured:raise ValueError('Add your TypeSafe API key in Jev connection before enabling Jev')
                if not p.get('compact'):self.lab.disable_intent(symbol)
                self.pause(symbol,'CONFIG_CHANGED');self.context_cache.pop(symbol,None)
                with self.db() as db:db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(symbol) DO UPDATE SET value=excluded.value',(symbol,encode(cfg)))
                self.configs[symbol]=cfg
            elif action=='pause':
                intent_target=self.pause_target(symbol)
                persist_swing_pause(symbol=symbol,reason='USER_PAUSED',data_dir=self.data_dir)
                audit_error=None
                try:self.pause(symbol,'USER_PAUSED')
                except (OSError,sqlite3.Error,StorageFault) as error:audit_error=error
                if not intent_target:
                    try:
                        intent=self.lab.intent()
                        intent_target=bool(intent and intent['enabled'] and intent['symbol']==symbol)
                    except (OSError,sqlite3.Error,StorageFault) as error:audit_error=error
                if intent_target:
                    try:self.lab.disable_intent(symbol)
                    except (OSError,sqlite3.Error,StorageFault) as error:audit_error=audit_error or error
                return self.pause_result(symbol,bool(p.get('compact')),audit_error)
            else:raise ValueError('Unknown research action')
            return self.settings_state() if p.get('compact') else self.status()

    def pause(self,symbol,reason):
        a=self.active.pop(symbol,None)
        self.last[symbol]={**self.last[symbol],'status':'PAUSED','detail':reason,'run':a['run'] if a else self.last[symbol].get('run')}
        if a and a['tracker']:
            a['tracker'].terminate(reason,int(time.time()*1000))
            previous_warnings=self.last[symbol].get('snapshot',{}).get('warnings')
            self.last[symbol]['snapshot']=a['tracker'].snapshot()
            if previous_warnings:self.last[symbol]['snapshot']['warnings']=previous_warnings
            if a.get('volume_engine'):self.last[symbol]['snapshot']['market_synth']=a['volume_engine'].snapshot(a['tracker'].candidates)
        if a and a.get('study'):
            a['study'].end(reason,int(time.time()*1000));self.persist_study(symbol,a,int(time.time()*1000))
            self.last[symbol]['study']=self.study_brief(a['study'].snapshot())
        if a:self.append(a['run'],symbol,'RUN_END',int(time.time()*1000),{'reason':reason,'snapshot':self.last[symbol].get('snapshot'),'open_plans':'unresolved; no observation after run end'})

    def recover_auto(self):
        with self.lock:
            intent=self.lab.intent()
            if intent and intent['enabled'] and not read_swing_pause(data_dir=self.data_dir,symbol=intent['symbol']):
                self.command({'action':'start_auto','symbol':intent['symbol']},clear_pause=False)
                return True
            return False

    def loop(self):
        while not self.stop.is_set():
            if not self.active and time.monotonic()>=self.recover_after:
                self.recover_after=time.monotonic()+30
                try:
                    self.recover_auto()
                except Exception:pass  # Key/storage/settings errors remain paused; retry with backoff.
            with self.lock:
                symbol=next(iter(self.active),None)
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
                            try:self.append(a['run'],symbol,'SAMPLE_UNAVAILABLE',int(time.time()*1000),{'class':type(e).__name__})
                            except sqlite3.Error as fault:self.storage_failure(symbol,a,fault)
            self.stop.wait(.5)

    def sample(self,symbol,a):
        try:
            if self.storage_guard:self.storage_guard()
            return self._sample(symbol,a)
        except (sqlite3.Error,StorageFault) as error:
            self.storage_failure(symbol,a,error);raise

    def _sample(self,symbol,a):
        context=self.context_for(symbol,a) if a['config'].get('study_enabled') else None
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
            pending_events=[];new_bars=[]
            warming=a['tracker'] is None
            if warming:
                a['tracker']=SwingTracker(Config(**{k:v for k,v in a['config'].items() if k not in ('cadence_seconds','jev_enabled','warning_settings') and k not in STUDY_DEFAULTS}),tick)
                a['volume_engine']=SwingVolume(symbol,tick)
                a['warnings']=WarningEngine({**a['config'].get('warning_settings',{}),'tick':tick})
                a['warning_persisted_seq']=0
                a['warning_warmup_seq']=0
                a['warning_live']=None
            tracker=a['tracker']
            if not warming and a.get('study'):
                if context:a['study'].set_context(context,closed)
                tracker.set_study_campaigns(a['study'].campaigns)
            for b in closed:
                if tracker.last_time is None or b['time']>tracker.last_time:
                    tracker.feed(b,observed_at=None if warming else now);a['seen'][b['time']]=digest(b)
                    a['volume_engine'].feed(b)
                    a['warnings'].feed(b, None if warming else now)
                    new_bars.append(b)
                    if not warming:
                        pending_events.append(('BAR_CLOSED',{'bar':b,'observed_at':now}))
                        if a.get('study'):
                            a['study'].observe(b,now,tracker.snapshot(),tracker.bars)
                            tracker.set_study_campaigns(a['study'].campaigns)
            a['seen']={t:v for t,v in a['seen'].items() if t>=closed[-1]['time']-1000*60000}
            if warming:
                # Warmup reconstructs structure, but cannot own a forward shadow slot or budget.
                for plan in tracker.plans:
                    if plan['status'] in ('PENDING','OPEN'):plan.update(status='UNRESOLVED',reason='WARMUP_END')
                tracker.reserved_session=0;tracker.reserved_parent=0;tracker.parent_count=0
                pending_events.append(('WARMUP',{'first':closed[0]['time'],'last':closed[-1]['time'],'bars':len(closed),'snapshot':tracker.snapshot()}))
                a['persisted_seq']=tracker.seq
                if a['config'].get('study_enabled'):
                    a['study']=LiquidityStudy(a['run'],symbol,a['config'],tick,closed[-1]['time']+60000)
                    if context:a['study'].set_context(context,closed)
                    a['study'].last_bar=deepcopy(closed[-1]);a['study'].local_trend=tracker.trend
                    from swing_liquidity import swing_measurements
                    a['study'].metrics=swing_measurements(tracker.bars,a['config']['study_window'],tick)
                    tracker.set_study_campaigns([])
            for ev in tracker.events:
                if not warming and ev['seq']>a['persisted_seq']:pending_events.append(('TRACKER_EVENT',ev))
            warnings=a['warnings']
            if warming:
                a['warning_warmup_seq']=warnings.sequence
                a['warning_persisted_seq']=warnings.sequence
            # First receipt is a separate availability barrier. New references
            # cannot claim contact in a candle that began before discovery.
            known_levels=[]
            for level in (a['study'].levels.values() if a.get('study') else []):
                if not level.get('in_current_map'):continue
                known=max(level['known_at'],level.get('available_at',now))
                if known<=now:
                    known_levels.append({'id':level['id'],'price':level['price'],'side':'upper' if level['side']=='high' else 'lower',
                                         'knownAt':known,'producerKnownAt':level['known_at'],'source':level.get('source'),'timeframe':level.get('timeframe')})
            warnings.set_levels(known_levels,now)
            if forming and forming['time']==warnings.last_closed+60000 and forming['time']<=now<forming['time']+60000:
                live=warnings.observe(forming,now,source_at=int(as_of))
                if live is not None:a['warning_live']=live
            if not forming or (a.get('warning_live') and a['warning_live']['closedCutoff']!=warnings.last_closed+60000):a['warning_live']=None
            warning_state={'version':WARNING_VERSION,'closed':deepcopy(warnings.last_snapshot),'provisional':deepcopy(a['warning_live']),
                           'events':[{**deepcopy(ev),'scope':'WARMUP' if ev['seq']<=a['warning_warmup_seq'] else 'FORWARD'} for ev in warnings.events[-80:]],
                           'scope':'Deterministic warning pressure; not calibrated reversal probability. Forming evidence cannot confirm entries.'}
            for value in (warning_state['closed'],warning_state['provisional']):
                if value:
                    value['symbol']=symbol
                    value['featureConfig']=encode({'engine':WARNING_VERSION,'implementation':'desk-python','code_hash':CODE_HASH,'settings':json.loads(value['featureConfig'])})
            for ev in warnings.events:
                if not warming and ev['seq']>a['warning_persisted_seq']:pending_events.append(('WARNING_EVENT',ev))
            snap=tracker.snapshot();snap['warnings']=warning_state;prediction_bar=(now//60000+1)*60000
            snap['market_synth']=a['volume_engine'].snapshot(snap['candidates'])
            primary=a['last_bucket']!=now//60000
            # Independent evaluations are grouped by source minute. Secondary intrabar samples are diagnostic.
            state={'symbol':symbol,'provider':'Hyperliquid public REST','observed_at':now,'quote_at':source,'candles_as_of':as_of,'bid':float(bid),'ask':float(ask),'tick':tick,'closed_cutoff':snap['cutoff'],'forming':forming,'forming_is_confirmed':False,'prediction_bar':prediction_bar,'definition':'next full 1m close vs its open; >= one tick','evaluation_bar':now//60000*60000,'evaluation_slot':now%60000//(a['config']['cadence_seconds']*1000)+1,'cadence_seconds':a['config']['cadence_seconds'],'revision':REVISION,'code_hash':CODE_HASH,'parent_id':snap['parent_id'],'trend':snap['trend'],'pivots':snap['pivots'][-10:],'candidates':snap['candidates'][-4:],'closed_bars':closed[-max(24,a['config'].get('study_window',5)*2+1):]}
            if a.get('study'):state['liquidity_study']=self.study_brief(a['study'].snapshot(),include_evidence=True)
            state['swing_warnings']=deepcopy(warning_state)
            state['market_synth']={**snap['market_synth'],'recent':snap['market_synth']['recent'][-12:]}
            pid=uuid.uuid5(uuid.NAMESPACE_URL,a['run']+':'+str(slot)).hex
            pricing=deepcopy(RATES.get(MODEL))
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                for b in new_bars:
                    db.execute('INSERT INTO run_bars VALUES(?,?,?,?,?,?,?)',(a['run'],symbol,b['time'],now,int(warming),encode(b),digest(b)))
                for kind,payload in pending_events:self.append(a['run'],symbol,kind,now,payload,db=db)
                self.resolve(a,closed,now,available_at,db=db)
                db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?,?,?,?)',(pid,a['run'],symbol,now,prediction_bar,int(primary),encode(state),None,None))
                self.cost_meter.record(pid,a['run'],symbol,now,snap['parent_id'],
                                       'PENDING' if a['config']['jev_enabled'] else 'DISABLED',MODEL,pricing=pricing,db=db)
                db.execute('INSERT INTO collection_checkpoints VALUES(?,?,?,?,?,?) ON CONFLICT(run) DO UPDATE SET observed_at=excluded.observed_at,closed_cutoff=excluded.closed_cutoff,prediction_id=excluded.prediction_id,seq=excluded.seq,snapshot=excluded.snapshot',
                           (a['run'],now,snap['cutoff'],pid,tracker.seq,encode(snap)))
            if a.get('study'):self.persist_study(symbol,a,now)
            a['warning_persisted_seq']=warnings.sequence
            a['sample_slot']=slot;a['persisted_seq']=tracker.seq;a['last_bucket']=now//60000
            current={'status':'OBSERVING','run':a['run'],'started':a['started'],'observed_at':now,'quote_at':source,'snapshot':snap,'forming':forming,'primary_sample':primary,'prediction_id':pid,'prediction_bar':prediction_bar,'jev':{'status':'DISABLED'},'detail':'Completed bars confirm setups. Intrabar snapshots only update research judgments.'}
            if a.get('study'):current['study']=self.study_brief(a['study'].snapshot())
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
            except Exception as e:
                jev={'status':'UNAVAILABLE','error_class':type(e).__name__,'prompt':PROMPT_VERSION}
                if isinstance(e,(JevRequestError,JevResponseError)):
                    # The adapter vets codes and excludes provider bodies. Keep
                    # only its defined diagnostic contract at this boundary.
                    diagnostics=e.diagnostics
                    for field in ('http_status','error_code','attempt_count','request_bytes','largest_question_bytes'):
                        if field in diagnostics:jev[field]=deepcopy(diagnostics[field])
                    attempts=[{k:deepcopy(value) for k,value in attempt.items() if k in ('http_status','error_code')}
                              for attempt in diagnostics.get('attempt_errors',[])[:3]]
                    count=diagnostics.get('attempt_count',1)
                    unknown=sum(attempt.get('http_status') not in (429,529) for attempt in attempts)
                    # A malformed received response can still be billable.
                    if isinstance(e,JevResponseError) and not e.safe_usage:unknown+=1
                    if count and not attempts and isinstance(e,JevRequestError):unknown=count
                    jev['transport']={'attempt_count':count,'attempt_errors':attempts,
                                      'request_bytes':diagnostics.get('request_bytes'),
                                      'unpriced_attempts':unknown,'projection':PROMPT_VERSION}
                if getattr(e,'safe_usage',None):jev.update(usage=e.safe_usage,model=getattr(e,'response_model',MODEL))
            jev['pricing_snapshot']=pricing
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                self.cost_meter.record(pid,a['run'],symbol,now,snap['parent_id'],jev['status'],
                                       jev.get('model',MODEL),jev.get('usage'),pricing,db=db)
                db.execute('UPDATE predictions SET response=? WHERE id=? AND response IS NULL',(encode(jev),pid))
            with self.lock:
                if self.active.get(symbol) is a and self.last[symbol].get('prediction_id')==pid:
                    self.last[symbol]['jev']=jev
                    if a.get('study'):
                        a['study'].model(jev,pid,now,jev.get('received_at',now),{c['id'] for c in state.get('liquidity_study',{}).get('campaigns',[])});self.persist_study(symbol,a,int(time.time()*1000))
                        self.last[symbol]['study']=self.study_brief(a['study'].snapshot())


    @staticmethod
    def recipe_id(symbol,config):
        return digest({'symbol':symbol,'config':{k:v for k,v in config.items() if k!='study_phase'},'code_hash':CODE_HASH,'model':MODEL,'prompt':PROMPT_VERSION,'study':STUDY_VERSION})

    def validation_reference(self,symbol,config):
        if not config.get('study_enabled') or config.get('study_phase')!='forward_validation':return None
        wanted=self.recipe_id(symbol,config)
        with self.read_db() as db:rows=db.execute('SELECT run,state FROM study_state WHERE symbol=? ORDER BY at DESC',(symbol,)).fetchall()
        for row in rows:
            report=json.loads(row['state'])
            if report.get('ended') and report.get('settings',{}).get('study_phase')=='development' and report.get('recipe_id')==wanted:
                return {'run':row['run'],'recipe_id':wanted,'ended_at':report['ended']['at'],'rule':'Exact frozen configuration/code/model/prompt match; validation contacts must occur in the new forward run.'}
        raise ValueError('Forward validation requires a completed development run with exactly these settings, source code, model and prompts. Collect development evidence first or restore its exact settings.')

    def study_archive(self,symbol):
        if symbol not in SYMBOLS:raise ValueError('Unsupported study symbol')
        with self.read_db() as db:
            rows=db.execute('SELECT state FROM study_state WHERE symbol=? ORDER BY at DESC LIMIT 200',(symbol,)).fetchall()
            total=db.execute('SELECT COUNT(*) FROM study_state WHERE symbol=?',(symbol,)).fetchone()[0]
        reports=[json.loads(r['state']) for r in rows]
        return {'version':STUDY_VERSION,'symbol':symbol,'reports':reports,'limit':200,'truncated':total>len(reports),'total_runs':total,'grouping':'Keep recipe_id and study_phase separate. Development and forward-validation outcomes are not pooled. No automated parameter promotion.','execution':'none'}

    def context_for(self,symbol,a):
        now=int(time.time()*1000);cached=self.context_cache.get(symbol)
        if cached and 0<=now-cached['observed_at']<30000:return deepcopy(cached)
        feeds={}
        # These are own-frame inputs; a missing frame stays unavailable.
        for tf in FRAME_MS:
            try:feeds[tf]=self.gateway.bars(symbol,tf,160)
            except Exception:pass
        context=build_htf_context(symbol,feeds,int(time.time()*1000),a['config'].get('study_levels',[]))
        self.context_cache[symbol]=deepcopy(context)
        return context

    @staticmethod
    def study_brief(report,include_evidence=False):
        result={k:deepcopy(report.get(k)) for k in ('version','run','symbol','settings','metrics','summaries','ended','scope','cost_scope','bias','last_bar')}
        result['context']=deepcopy(report['context'])
        # Full source candles remain in the local study/events, not every Jev call.
        for frame in result['context'].get('frames',{}).values():frame.pop('source_bars',None)
        if not include_evidence:
            for frame in result['context'].get('frames',{}).values():frame.pop('evidence',None)
        result['levels']=deepcopy(report.get('levels',[]))
        result['campaigns']=deepcopy([c for c in report['campaigns'] if c['state']=='WATCH'][-8:])
        result['plans']=deepcopy(report['plans'][-12:])
        result['counts']={'campaigns':len(report['campaigns']),'plans':len(report['plans'])}
        return result

    def persist_study(self,symbol,a,now):
        study=a['study'];report=study.snapshot()
        report['validation_reference']=a.get('validation_reference')
        report['recipe_id']=self.recipe_id(symbol,a['config'])
        report['cohort']={'config':deepcopy(a['config']),'code_hash':CODE_HASH,'model':MODEL,'prompt':PROMPT_VERSION,'version':STUDY_VERSION,'symbol':symbol}
        with self.db() as db:
            for event in study.events:db.execute('INSERT INTO ledger(run,symbol,kind,at,payload) VALUES(?,?,?,?,?)',(a['run'],symbol,'STUDY_EVENT',event['at'],encode(event)))
            db.execute('INSERT INTO study_state VALUES(?,?,?,?) ON CONFLICT(run) DO UPDATE SET at=excluded.at,state=excluded.state',(a['run'],symbol,now,encode(report)))
        study.events.clear()

    def study_report(self,symbol,run=None):
        if symbol not in SYMBOLS:raise ValueError('Unsupported study symbol')
        if run is None:
            with self.lock:run=self.last[symbol].get('run')
        with self.read_db() as db:row=db.execute('SELECT state FROM study_state WHERE run=? AND symbol=?',(run,symbol)).fetchone()
        return json.loads(row['state']) if row else None

    def end_saved_study(self,run,reason):
        with self.db() as db:
            row=db.execute('SELECT state,symbol FROM study_state WHERE run=?',(run,)).fetchone()
            if not row:return
            report=json.loads(row['state']);now=int(time.time()*1000)
            if report.get('ended'):return
            report['ended']={'at':now,'reason':reason}
            for p in report['plans']:
                if p['status'] in ('OPEN','PENDING'):p.update(status='UNRESOLVED',reason=reason)
            for c in report['campaigns']:
                if c['state']=='WATCH':c.update(state='TERMINAL',reason=reason)
            # Saved summaries cannot keep reporting now-ended plans as pending.
            for summary in report['summaries']:
                rows=[p for p in report['plans'] if p['playbook']==summary['playbook'] and p['variant']==summary['variant']]
                summary['pending']=0;summary['unresolved']=sum(p['status']=='UNRESOLVED' for p in rows)
            db.execute('UPDATE study_state SET state=?,at=? WHERE run=?',(encode(report),now,run))
            db.execute('INSERT INTO ledger(run,symbol,kind,at,payload) VALUES(?,?,?,?,?)',(run,row['symbol'],'STUDY_ENDED',now,encode({'reason':reason})))

    def resolve(self,a,bars,now,available_at=None,db=None):
        bytime={b['time']:b for b in bars}
        with (nullcontext(db) if db is not None else self.db()) as db:
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
            now=int(time.time()*1000);result={};lab_intent=self.effective_lab_intent();pause_marker=read_swing_pause(data_dir=self.data_dir,symbol=lab_intent.get('symbol') if lab_intent else None)
            for symbol in SYMBOLS:
                s=deepcopy(self.last[symbol]);s['running']=symbol in self.active;s['config']=deepcopy(self.configs[symbol])
                with self.read_db() as db:
                    saved=db.execute('SELECT COUNT(*) n,MIN(time) first,MAX(time) last,COALESCE(SUM(warmup=0),0) live FROM run_bars WHERE run=?',(s.get('run'),)).fetchone()
                    checkpoint=db.execute('SELECT observed_at,closed_cutoff,prediction_id FROM collection_checkpoints WHERE run=?',(s.get('run'),)).fetchone()
                    gaps=db.execute('SELECT COUNT(*) FROM (SELECT time,LAG(time) OVER(ORDER BY time) prev FROM run_bars WHERE run=?) WHERE prev IS NOT NULL AND time-prev!=60000',(s.get('run'),)).fetchone()[0]
                s['collection']={'saved_candles':saved['n'],'live_candles':saved['live'],'first_candle':saved['first'],'last_candle':saved['last'],
                                 'source_bar_gaps':gaps,'checkpoint':dict(checkpoint) if checkpoint else None,
                                 'legacy_coverage':bool(s.get('run') and not checkpoint),'durability':'WAL / FULL sync; candle, event, prediction, usage reservation and checkpoint commit together'}
                if s['running'] and s.get('observed_at') and now-s['observed_at']>max(75000,s['config']['cadence_seconds']*2000):s['status']='STALE'
                s['dots']=self.dots(s.get('run'),s.get('snapshot',{}),s.get('forming'))
                if not s.get('study') and s.get('run'):
                    report=self.study_report(symbol,s['run'])
                    if report:s['study']=self.study_brief(report)
                s['coverage']='Hyperliquid public REST snapshots · 1m OHLC · not a full tick feed'
                result[symbol]=s
            contexts={k:{'run':v.get('run'),'parent_id':(v.get('snapshot') or {}).get('parent_id'),
                'running':v['running'],'jev_enabled':v['config']['jev_enabled'],
                'cadence_seconds':v['config']['cadence_seconds'],'key_configured':self.judge.configured} for k,v in result.items()}
            costs=self.cost_meter.summary(contexts,MODEL)
            for k,v in result.items():v['costs']=costs['symbols'][k]
            return {'observation':{'max_active':1,'timeframe':'1m','active_symbol':next(iter(self.active),None),'scope':'One shared collector per Desk server; chart displays never start model requests'},'warning_version':WARNING_VERSION,'volume_version':VOLUME_VERSION,'revision':REVISION,'code_hash':CODE_HASH,'mode':'shadow research · no orders','jev_configured':self.judge.configured,'jev_key_source':getattr(self.judge,'key_source',None),'jev_key_storage':getattr(self.judge,'key_storage',None),'model':MODEL,'prompt_version':PROMPT_VERSION,'lab_intent':lab_intent,'swing_pause':pause_marker,'symbols':result,'costs':costs,'as_of':now}

    def dots(self,run,snapshot,forming):
        if not run:return []
        with self.read_db() as db:rows=db.execute('SELECT p.id,p.at,p.state,p.response,u.status usage_status FROM predictions p LEFT JOIN jev_usage u ON u.prediction_id=p.id WHERE p.run=? ORDER BY p.at DESC LIMIT 360',(run,)).fetchall()
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
                         'observed_at':row['at'],'vote':vote,'service':response['status'] if response else row['usage_status'] or 'UNRESOLVED',
                         'high':b['high'],'low':b['low'],'prediction_bar':state['prediction_bar'],
                         'probabilities':response['answers']['directional_lean']['probabilities'] if available else None})
        return dots

    def history(self,symbol):
        if symbol not in SYMBOLS:raise ValueError('Unsupported symbol')
        with self.lock:run=self.last[symbol].get('run')
        with self.read_db() as db:
            rows=db.execute('SELECT p.*,u.status usage_status FROM predictions p LEFT JOIN jev_usage u ON u.prediction_id=p.id WHERE p.symbol=? AND p.run=? ORDER BY p.at DESC LIMIT 300',(symbol,run)).fetchall()
            events=db.execute('SELECT * FROM ledger WHERE symbol=? ORDER BY id DESC LIMIT 100',(symbol,)).fetchall()
            ended=bool(db.execute("SELECT 1 FROM ledger WHERE run=? AND kind='RUN_END' LIMIT 1",(run,)).fetchone())
            total=db.execute('SELECT COUNT(*) FROM predictions WHERE symbol=? AND run=?',(symbol,run)).fetchone()[0]
            primary=db.execute('''SELECT at,prediction_bar,
              json_extract(response,'$.status') service,json_extract(response,'$.received_at') received_at,
              json_extract(response,'$.answers.next_bar') forecast,json_extract(outcome,'$.label') label,
              json_extract(state,'$.closed_bars[#-1]') last_bar,json_extract(state,'$.tick') tick
              FROM predictions WHERE symbol=? AND run=? AND primary_sample=1 ORDER BY at''',(symbol,run)).fetchall()
            reliability_rows=db.execute('''SELECT
              COALESCE(json_extract(p.response,'$.status'),u.status,'UNRESOLVED') status,
              COALESCE(json_extract(p.response,'$.prompt'),'legacy/unknown') prompt,
              json_extract(p.response,'$.http_status') http_status,
              json_extract(p.response,'$.error_code') error_code,
              COALESCE(json_extract(p.response,'$.transport.attempt_count'),1) attempts,COUNT(*) n
              FROM predictions p LEFT JOIN jev_usage u ON u.prediction_id=p.id
              WHERE p.symbol=? AND p.run=? GROUP BY 1,2,3,4,5''',(symbol,run)).fetchall()
        predictions=[{**dict(r),'state':json.loads(r['state']),'response':json.loads(r['response']) if r['response'] else None,'outcome':json.loads(r['outcome']) if r['outcome'] else None} for r in rows]
        return {'run':run,'run_ended':ended,'predictions':predictions,
                'events':[{**dict(r),'payload':json.loads(r['payload'])} for r in events],
                'metrics':forecast_metrics(primary,total,ended),
                'reliability':request_reliability(reliability_rows)}

    def export(self,symbol):
        if symbol not in SYMBOLS:raise ValueError('Unsupported symbol')
        with self.read_db() as db:
            # Bound each export; no trading account or credentials are stored here.
            runs=[dict(r) for r in db.execute('SELECT * FROM runs WHERE symbol=? ORDER BY started DESC LIMIT 100',(symbol,))]
            ledger=[dict(r) for r in db.execute('SELECT * FROM ledger WHERE symbol=? ORDER BY id DESC LIMIT 20000',(symbol,))]
            predictions=[dict(r) for r in db.execute('SELECT * FROM predictions WHERE symbol=? ORDER BY at DESC LIMIT 20000',(symbol,))]
        with self.cost_meter.db() as db:
            usage=[dict(r) for r in db.execute('SELECT * FROM jev_usage WHERE symbol=? ORDER BY at DESC LIMIT 20000',(symbol,))]
            costs=self.cost_meter.aggregate(db,'WHERE symbol=?',(symbol,))
        with self.read_db() as db:
            bars=[dict(r) for r in db.execute('SELECT * FROM run_bars WHERE symbol=? ORDER BY time DESC LIMIT 100000',(symbol,))]
            checkpoints=[dict(r) for r in db.execute('SELECT c.* FROM collection_checkpoints c JOIN runs r ON r.id=c.run WHERE r.symbol=?',(symbol,))]
        return {'run_bars':bars,'checkpoints':checkpoints,'revision':REVISION,'warning_version':WARNING_VERSION,'current_code_hash':CODE_HASH,'model':MODEL,'prompt_version':PROMPT_VERSION,'questions':QUESTIONS,'runs':runs,'ledger':ledger,'predictions':predictions,'jev_usage':usage,'jev_costs':costs,'limits':{'runs':100,'ledger':20000,'predictions':20000,'jev_usage':20000,'run_bars':100000},'study':self.study_report(symbol),'study_version':STUDY_VERSION,'execution':'none','coverage':'REST snapshots and closed 1m OHLC; not tick replay'}

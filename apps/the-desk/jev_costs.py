"""Local token-usage ledger. Published-price estimates, never account invoices.

No credentials, network, model calls, trading handles or budget enforcement.
Completed usage rows and their pricing snapshot are immutable. Legacy responses
are estimated at today's verified list price and explicitly marked as such.
"""
from contextlib import contextmanager
from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import sqlite3
import threading
import time

PRICE_VERSION='typesafe-list-2026-10-24.1'
PRICE_SOURCE='https://docs.typesafe.ai/models'
NANO=1_000_000_000
RATES={model:{'version':PRICE_VERSION,'model':model,'currency':'USD',
    'input_usd_per_million':'0.042','output_usd_per_million':'0',
    'verified_date':'2026-10-24','source':PRICE_SOURCE,'basis':'published list-price estimate'}
    for model in ('jev-1.14.0','jev-1.13.0')}


def safe_usage(value):
    if not isinstance(value,dict):return None
    if any(type(value.get(k)) is not int or not 0<=value[k]<=10**12 for k in ('input_tokens','output_tokens')):return None
    return {k:value[k] for k in ('input_tokens','output_tokens')}


def estimated_nano(usage,pricing):
    usage=safe_usage(usage)
    if not usage or not pricing:return None
    cost=sum(Decimal(usage[k])*Decimal(pricing[rate])/Decimal(1_000_000)
             for k,rate in (('input_tokens','input_usd_per_million'),('output_tokens','output_usd_per_million')))
    return int(cost*NANO)


def _json(v):return json.dumps(v,sort_keys=True,separators=(',',':'))


class JevCostMeter:
    def __init__(self,path):
        self.path=Path(path);self.lock=threading.RLock();self.cache=None;self.cached_at=0
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS jev_usage (
                prediction_id TEXT PRIMARY KEY, run TEXT NOT NULL, symbol TEXT NOT NULL,
                at INTEGER NOT NULL, parent_id INTEGER, status TEXT NOT NULL, model TEXT,
                input_tokens INTEGER, output_tokens INTEGER, cost_nano_usd INTEGER,
                pricing TEXT, provenance TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS jev_usage_run ON jev_usage(run,at);
              CREATE INDEX IF NOT EXISTS jev_usage_symbol ON jev_usage(symbol,at);
            ''')
            db.execute("UPDATE jev_usage SET status='UNRESOLVED' WHERE status='PENDING'")
        self.backfill()

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    def backfill(self):
        with self.db() as db:
            rows=db.execute('''SELECT p.id,p.run,p.symbol,p.at,p.state,p.response,r.config
                FROM predictions p JOIN runs r ON r.id=p.run
                LEFT JOIN jev_usage u ON u.prediction_id=p.id WHERE u.prediction_id IS NULL
                OR (u.status IN ('PENDING','UNRESOLVED') AND p.response IS NOT NULL)''').fetchall()
        for row in rows:
            state=json.loads(row['state']);response=json.loads(row['response']) if row['response'] else None
            enabled=json.loads(row['config']).get('jev_enabled') is True
            # Missing response on an enabled historic run is unknown, never free.
            status=response.get('status','UNRESOLVED') if response else 'UNRESOLVED' if enabled else 'DISABLED'
            self.record(row['id'],row['run'],row['symbol'],row['at'],state.get('parent_id'),
                        status,response.get('model') if response else None,
                        response.get('usage') if response else None,
                        response.get('pricing_snapshot') if response else None,
                        'request_snapshot' if response and response.get('pricing_snapshot') else 'legacy_repriced')

    def record(self,prediction_id,run,symbol,at,parent_id,status,model=None,usage=None,pricing=None,provenance='request_snapshot'):
        if type(parent_id) is not int:parent_id=None
        usage=safe_usage(usage)
        pricing=deepcopy(pricing or RATES.get(model))
        if pricing and pricing.get('model')!=model:pricing=deepcopy(RATES.get(model))
        if status=='DISABLED':usage=None
        cost=0 if status=='DISABLED' else estimated_nano(usage,pricing)
        with self.lock,self.db() as db:
            db.execute('''INSERT INTO jev_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(prediction_id) DO UPDATE SET status=excluded.status,model=excluded.model,
                input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,
                cost_nano_usd=excluded.cost_nano_usd,pricing=excluded.pricing,provenance=excluded.provenance
              WHERE jev_usage.status IN ('PENDING','UNRESOLVED') ''',
              (prediction_id,run,symbol,at,parent_id,status,model,usage['input_tokens'] if usage else None,
               usage['output_tokens'] if usage else None,cost,_json(pricing) if pricing else None,provenance))
            self.cache=None

    @staticmethod
    def aggregate(db,where='',args=()):
        row=db.execute('''SELECT COUNT(*) observations,
          COALESCE(SUM(status!='DISABLED'),0) requests,
          COALESCE(SUM(status!='DISABLED' AND cost_nano_usd IS NOT NULL),0) priced_requests,
          COALESCE(SUM(status='PENDING'),0) pending_requests,
          COALESCE(SUM(status NOT IN ('DISABLED','PENDING') AND cost_nano_usd IS NULL),0) unknown_cost_requests,
          COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,
          COALESCE(SUM(cost_nano_usd),0) cost_nano_usd,
          COALESCE(SUM(status!='DISABLED' AND provenance='legacy_repriced'),0) legacy_repriced_requests,
          COALESCE(SUM(status!='DISABLED' AND NOT EXISTS
            (SELECT 1 FROM predictions p WHERE p.id=jev_usage.prediction_id)),0) orphaned_prediction_requests,
          MIN(at) first_at,MAX(at) last_at FROM jev_usage '''+where,args).fetchone()
        result=dict(row);result['estimated_usd']=result.pop('cost_nano_usd')/NANO
        result['complete']=result['unknown_cost_requests']==0 and result['pending_requests']==0
        return result

    def data(self):
        with self.lock:
            if self.cache is not None and time.monotonic()-self.cached_at<2:return deepcopy(self.cache)
            with self.db() as db:
                total=self.aggregate(db)
                sessions=[]
                for r in db.execute('SELECT id,symbol,started FROM runs ORDER BY started DESC LIMIT 100'):
                    sessions.append({**dict(r),**self.aggregate(db,'WHERE run=?',(r['id'],))})
                parents=[]
                for r in db.execute('''SELECT run,symbol,parent_id,MAX(at) last FROM jev_usage
                      WHERE status!='DISABLED' AND parent_id IS NOT NULL
                      GROUP BY run,symbol,parent_id ORDER BY last DESC LIMIT 100'''):
                    parents.append({'run':r['run'],'symbol':r['symbol'],'parent_id':r['parent_id'],
                        **self.aggregate(db,'WHERE run=? AND parent_id=?',(r['run'],r['parent_id']))})
                symbols={}
                for symbol in ('hyperliquid:BTC','hyperliquid:ETH'):
                    recent=[dict(r) for r in db.execute('''SELECT input_tokens,output_tokens,model FROM jev_usage
                      WHERE symbol=? AND input_tokens IS NOT NULL AND status!='DISABLED'
                      ORDER BY at DESC LIMIT 20''',(symbol,))]
                    symbols[symbol]={'total':self.aggregate(db,'WHERE symbol=?',(symbol,)),'recent':recent}
            self.cache={'total':total,'sessions':sessions,'parent_swings':parents,'symbols':symbols}
            self.cached_at=time.monotonic();return deepcopy(self.cache)

    def summary(self,contexts,model):
        data=self.data();pricing=deepcopy(RATES.get(model));symbols={}
        for symbol,context in contexts.items():
            source=data['symbols'][symbol];run=context.get('run')
            session=next((r for r in data['sessions'] if r['id']==run),None)
            if session is None:
                with self.db() as db:session={'id':run,**self.aggregate(db,'WHERE run=?',(run,))}
            parent=context.get('parent_id')
            candidates=[p for p in data['parent_swings'] if p['run']==run]
            if parent is None:parent=candidates[0]['parent_id'] if candidates else None
            current=next((p for p in candidates if p['parent_id']==parent),None)
            if current is None:
                with self.db() as db:current={'run':run,'parent_id':parent,**self.aggregate(db,'WHERE run=? AND parent_id=?',(run,parent))}
            recent=[r for r in source['recent'] if r['model']==model]
            rate=None
            if recent and pricing:
                mean_input=sum(r['input_tokens'] for r in recent)/len(recent)
                mean_output=sum(r['output_tokens'] for r in recent)/len(recent)
                rate=(mean_input*float(pricing['input_usd_per_million'])+mean_output*float(pricing['output_usd_per_million']))/1_000_000
            cadence=context.get('cadence_seconds',15);projected=rate*3600/cadence if rate is not None else None
            active=context.get('running') is True and context.get('jev_enabled') is True and context.get('key_configured') is True
            with self.db() as db:
                parent_summary=db.execute('''SELECT COUNT(DISTINCT parent_id) n,COALESCE(SUM(cost_nano_usd),0) cost
                    FROM jev_usage WHERE run=? AND parent_id IS NOT NULL AND status!='DISABLED' ''',(run,)).fetchone()
            symbols[symbol]={'session':session,'current_parent_swing':current,'total':source['total'],
                'observed_parent_groups_in_session':parent_summary['n'],
                'mean_usd_per_observed_parent':parent_summary['cost']/NANO/parent_summary['n'] if parent_summary['n'] else None,
                'projection':{'basis':'last up to 20 usage-bearing requests for the same market and model',
                    'sample_requests':len(recent),'requests_per_hour':3600/cadence,'estimated_usd_per_request':rate,
                    'estimated_usd_per_hour_if_enabled':projected,'estimated_usd_8h_if_enabled':projected*8 if projected is not None else None,
                    'active':active,'current_usd_per_hour':projected if active else 0}}
        active=[v['projection'] for v in symbols.values() if v['projection']['active']]
        restoration=None;path=self.path.with_name('swing-restore-manifest.json')
        if path.exists():
            try:restoration=json.loads(path.read_text()).get('last_observation_utc')
            except (ValueError,OSError):pass
        return {'currency':'USD','basis':'Recorded tracker usage × published list-price snapshot; not a provider invoice.',
            'pricing':pricing,'total':data['total'],'sessions':data['sessions'],'parent_swings':data['parent_swings'],
            'symbols':symbols,'active_estimated_usd_per_hour':sum(p['current_usd_per_hour'] or 0 for p in active),
            'active_projection_complete':all(p['current_usd_per_hour'] is not None for p in active),
            'restored_archive_cutoff_utc':restoration,'as_of':int(time.time()*1000),
            'scope':'All retained tracker records, across BTC/ETH and all runs; no export row cap on totals. Missing usage is unknown. Parent groups can be unfinished and are not completed research swings.'}

"""Versioned local Agents, deterministic line-touch runtime, paper attribution.

Agent runs and paper orders commit in one engine transaction. Live adapters
fail closed; credentials and broker grants are never inferred from chart data.
"""
from datetime import datetime,timezone
from decimal import Decimal,ROUND_FLOOR,ROUND_CEILING
import hashlib
import json
import math
import threading
import time
import uuid
from engine import dec,stamp
from agent_adapters import VENUES,ExecutionAdapter

PREFIX='/api/agents'
MODULES=[{'id':'line-touch','slot':'signal','name':'Observed line touch','description':'Manual cyan hlines or explicit live Liquidity study levels; fresh chart heartbeat required.'},
 {'id':'market-touch','slot':'entry','name':'Market on touch','description':'Paper executable bid/ask after a fresh observed touch.'},
 {'id':'limit-level','slot':'entry','name':'Limit at level','description':'Paper working limit at the exact line price, with expiry.'},
 {'id':'bracket','slot':'exit','name':'Protective bracket + time exit','description':'Fixed-bps stop, reward/risk target and maximum holding time.'},
 {'id':'risk-v1','slot':'risk','name':'Independent risk gate','description':'Size, notional, stop risk, exposure, daily loss, count, spread and freshness.'}]

def dumps(value): return json.dumps(value,sort_keys=True,allow_nan=False,separators=(',',':'))
def uid():return uuid.uuid4().hex
def number(v,name,lo,hi,integer=False):
    if isinstance(v,bool):raise ValueError('Invalid '+name)
    try:n=dec(v)
    except ValueError:raise ValueError('Invalid '+name) from None
    if not lo<=n<=hi or integer and n!=int(n):raise ValueError(name+' outside supported bounds.')
    return int(n) if integer else str(n)

def defaults(account_id):
    return {'name':'Test Agent','avatar':'bot','color':'#22d3ee','description':'Liquidity and cyan-line touch demonstration. Simulated trades only.',
      'mode':'simulation','account':{'venue':'simulation','id':account_id},'instrument':'hyperliquid:BTC','executionInstrument':'hyperliquid:BTC',
      'modules':{'signal':{'type':'line-touch','sources':['manual-cyan','liquidity'],'side':'approach','toleranceBps':'2'},
        'entry':{'type':'market-touch','quantity':'0.001','expirySeconds':60},
        'exit':{'type':'bracket','stopBps':'20','rewardRisk':'2','maxHoldingSeconds':1800},
        'risk':{'type':'risk-v1','maxOrderUSD':'150','maxRiskUSD':'2','maxExposureUSD':'300','maxDailyLossUSD':'25','maxTradesPerDay':10,'maxConcurrent':1,'cooldownSeconds':60,'maxQuoteAgeSeconds':10,'maxSpreadBps':'20'}}}

def validate(payload):
    if not isinstance(payload,dict) or set(payload)-{'id','expectedRevision','name','avatar','color','description','mode','account','instrument','executionInstrument','modules'}:raise ValueError('Unsupported agent fields.')
    name=payload.get('name');description=payload.get('description','')
    if not isinstance(name,str) or not 1<=len(name.strip())<=80 or not isinstance(description,str) or len(description)>2000:raise ValueError('Provide an agent name and description up to 2,000 characters.')
    if payload.get('avatar') not in ('bot','radar','bolt','compass'):raise ValueError('Choose an agent avatar.')
    if payload.get('color') not in ('#22d3ee','#818cf8','#34d399','#fbbf24','#fb7185'):raise ValueError('Choose a profile color.')
    if payload.get('mode') not in ('simulation','observe'):raise ValueError('Live autonomous execution is unavailable. Choose simulation or observe.')
    account=payload.get('account')
    if not isinstance(account,dict) or set(account)!={'venue','id'} or account['venue'] not in VENUES or not isinstance(account['id'],str) or not account['id'] or len(account['id'])>100:raise ValueError('Choose an explicit account and execution venue.')
    instrument=payload.get('instrument')
    if not isinstance(instrument,str) or not 3<=len(instrument)<=80 or ':' not in instrument:raise ValueError('Provide an exact data-provider instrument.')
    execution=payload.get('executionInstrument') or (instrument if account['venue']=='simulation' else None)
    if not isinstance(execution,str) or not 1<=len(execution)<=100:raise ValueError('Provide an explicit venue execution symbol or contract.')
    if account['venue']=='simulation' and execution!=instrument:raise ValueError('Simulation execution must match the exact supported chart instrument.')
    if account['venue']!='simulation' and payload['mode']!='observe':raise ValueError('External venue profiles must remain in observe mode until their execution adapter is verified.')
    modules=payload.get('modules')
    if not isinstance(modules,dict) or set(modules)!={'signal','entry','exit','risk'}:raise ValueError('Signal, entry, exit and risk modules are required.')
    expected={'signal':{'type','sources','side','toleranceBps'},'entry':{'type','quantity','expirySeconds'},'exit':{'type','stopBps','rewardRisk','maxHoldingSeconds'},'risk':{'type','maxOrderUSD','maxRiskUSD','maxExposureUSD','maxDailyLossUSD','maxTradesPerDay','maxConcurrent','cooldownSeconds','maxQuoteAgeSeconds','maxSpreadBps'}}
    m=json.loads(dumps(modules))
    for key in expected:
        if not isinstance(m[key],dict) or set(m[key])!=expected[key]:raise ValueError('Invalid '+key+' module fields.')
    s,e,x,r=(m[k] for k in ('signal','entry','exit','risk'))
    if s['type']!='line-touch' or not isinstance(s['sources'],list) or not s['sources'] or any(v not in ('manual-cyan','liquidity') for v in s['sources']) or s['side'] not in ('approach','buy','sell'):raise ValueError('Choose a line-touch source and side.')
    if e['type'] not in ('market-touch','limit-level') or x['type']!='bracket' or r['type']!='risk-v1':raise ValueError('Unsupported strategy module.')
    s['toleranceBps']=number(s['toleranceBps'],'touch tolerance',Decimal('0'),Decimal('50'))
    e['quantity']=number(e['quantity'],'quantity',Decimal('0.00000001'),Decimal('1000000'))
    if e['expirySeconds'] not in (60,3600,86400):raise ValueError('Choose a supported order expiry.')
    x['stopBps']=number(x['stopBps'],'stop distance',Decimal('1'),Decimal('1000'))
    x['rewardRisk']=number(x['rewardRisk'],'reward/risk',Decimal('.1'),Decimal('20'))
    x['maxHoldingSeconds']=number(x['maxHoldingSeconds'],'holding time',60,604800,True)
    for key in ('maxOrderUSD','maxRiskUSD','maxExposureUSD','maxDailyLossUSD'):r[key]=number(r[key],key,Decimal('.01'),Decimal('100000000'))
    for key,lo,hi in [('maxTradesPerDay',1,1000),('maxConcurrent',1,20),('cooldownSeconds',1,86400),('maxQuoteAgeSeconds',1,15)]:r[key]=number(r[key],key,lo,hi,True)
    r['maxSpreadBps']=number(r['maxSpreadBps'],'spread',Decimal('.01'),Decimal('500'))
    return {k:payload[k] for k in ('avatar','color','mode','account','instrument')}|{'name':name.strip(),'description':description,'modules':m,'executionInstrument':execution}


class Agents:
    def __init__(self,engine,clock=time.time):
        self.engine,self.clock=engine,clock
        self.lock=engine.lock;self.stop=threading.Event();self.previous={};self.last_status={};self.chart=None
        with self.lock,self.engine.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS desk_agents(id TEXT PRIMARY KEY,revision INTEGER,config TEXT,state TEXT,session TEXT,created REAL,updated REAL);
              CREATE TABLE IF NOT EXISTS desk_agent_revisions(agent TEXT,revision INTEGER,config TEXT,created REAL,PRIMARY KEY(agent,revision));
              CREATE TABLE IF NOT EXISTS desk_agent_runs(id TEXT PRIMARY KEY,agent TEXT,revision INTEGER,session TEXT,signal_key TEXT UNIQUE,decision TEXT,reason TEXT,payload TEXT,order_id TEXT,created REAL);
              CREATE TABLE IF NOT EXISTS desk_agent_events(id INTEGER PRIMARY KEY AUTOINCREMENT,agent TEXT,kind TEXT,message TEXT,created REAL);
              CREATE TABLE IF NOT EXISTS desk_agent_meta(key TEXT PRIMARY KEY,value TEXT);
              CREATE INDEX IF NOT EXISTS desk_agent_runs_history ON desk_agent_runs(agent,created DESC);
              CREATE INDEX IF NOT EXISTS desk_agent_run_order ON desk_agent_runs(order_id);
              CREATE INDEX IF NOT EXISTS desk_agent_events_history ON desk_agent_events(agent,id DESC);
            ''')
            db.execute("UPDATE desk_agents SET state='paused' WHERE state='armed'")
            if not db.execute("SELECT 1 FROM desk_agent_meta WHERE key='seed-v1'").fetchone():
                a=self.engine.create_account(db,{'name':'Agents · Test simulation','capital':'10000','fee_bps':'5','leverage':'1'})
                config=defaults(a['id']);agent_id=uid();now=self.clock()
                db.execute('INSERT INTO desk_agents VALUES(?,?,?,?,?,?,?)',(agent_id,1,dumps(config),'paused','',now,now))
                db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',(agent_id,1,dumps(config),now))
                db.execute("INSERT INTO desk_agent_meta VALUES('seed-v1',?)",(agent_id,))
                self.event(db,agent_id,'created','Test Agent created paused. Dedicated simulated capital; no seeded trades.')
        self.engine.agent_fill_guard=self.guard_fill
    def guard_fill(self,db,order):
        incoming=db.execute('SELECT agent FROM desk_agent_runs WHERE order_id=?',(order['id'],)).fetchone()
        incoming=incoming['agent'] if incoming else None
        remaining=dec(order['qty'])
        for position in db.execute("SELECT id,qty FROM positions WHERE account_id=? AND instrument=? AND side<>? AND status='open' ORDER BY opened_at,id",(order['account_id'],order['instrument'],order['side'])):
            if not remaining:break
            owner=db.execute('SELECT r.agent FROM desk_agent_runs r JOIN orders o ON o.id=r.order_id WHERE o.position_id=? LIMIT 1',(position['id'],)).fetchone()
            owner=owner['agent'] if owner else None
            if incoming!=owner and (incoming or owner):raise ValueError('Execution ownership changed before fill; unrelated positions cannot be netted by this order.')
            remaining-=min(remaining,dec(position['qty']))
    def event(self,db,agent,kind,message):
        db.execute('INSERT INTO desk_agent_events(agent,kind,message,created) VALUES(?,?,?,?)',(agent,kind,message,self.clock()))
    def start(self):
        def loop():
            while not self.stop.wait(1):
                try:self.tick()
                except Exception:
                    with self.lock,self.engine.db() as db:
                        db.execute("UPDATE desk_agents SET state='paused' WHERE state='armed'")
                        self.event(db,None,'runtime-error','Runtime paused all agents after an unexpected error; inspect execution ledger before resuming.')
        threading.Thread(target=loop,daemon=True,name='desk-agents').start()
    def row(self,db,agent_id):
        r=db.execute('SELECT * FROM desk_agents WHERE id=?',(agent_id,)).fetchone()
        if not r:raise ValueError('Agent not found.')
        return r
    def owned(self,db,agent_id):
        rows=db.execute('SELECT order_id FROM desk_agent_runs WHERE agent=? AND order_id IS NOT NULL',(agent_id,)).fetchall()
        ids=[r['order_id'] for r in rows]
        orders=[dict(r) for r in db.execute('SELECT * FROM orders WHERE id IN (SELECT order_id FROM desk_agent_runs WHERE agent=?)',(agent_id,))]
        positions=[dict(r) for r in db.execute('SELECT * FROM positions WHERE id IN (SELECT position_id FROM orders WHERE id IN (SELECT order_id FROM desk_agent_runs WHERE agent=?))',(agent_id,))]
        fills=[dict(r) for r in db.execute('SELECT * FROM fills WHERE order_id IN (SELECT order_id FROM desk_agent_runs WHERE agent=?) OR position_id IN (SELECT position_id FROM orders WHERE id IN (SELECT order_id FROM desk_agent_runs WHERE agent=?)) ORDER BY executed_at',(agent_id,agent_id))]
        return orders,positions,fills
    def metrics(self,db,agent_id):
        orders,positions,fills=self.owned(db,agent_id)
        fees=sum((dec(f['fee']) for f in fills),Decimal(0));gross=sum((dec(f['realized']) for f in fills),Decimal(0));unrealized=Decimal(0);fresh=True
        for p in positions:
            if p['status']!='open':continue
            q=self.engine.quotes.get(p['instrument'])
            if not q or not 0<=self.clock()-q['received_at']<=15:fresh=False;continue
            unrealized+=(dec(q['bid'] if p['side']=='buy' else q['ask'])-dec(p['entry']))*dec(p['qty'])*(1 if p['side']=='buy' else -1)
        results=[]
        for p in positions:
            if p['status']=='open':continue
            pf=[f for f in fills if f['position_id']==p['id']]
            results.append(sum((dec(f['realized'])-dec(f['fee']) for f in pf),Decimal(0)))
        wins=sum(v>0 for v in results);losses=sum(v<0 for v in results)
        daily=sum((dec(f['realized'])-dec(f['fee']) for f in fills if f['executed_at'][:10]==stamp(self.clock())[:10]),Decimal(0))
        return {'realizedNet':str(gross-fees),'realizedGross':str(gross),'fees':str(fees),'unrealized':str(unrealized) if fresh else None,'dailyNet':str(daily),'closedTrades':len(results),'wins':wins,'losses':losses,'winRate':round(wins/len(results)*100,1) if results else None,'openPositions':sum(p['status']=='open' for p in positions),'workingOrders':sum(o['status'] in ('working','triggered') for o in orders),'fills':len(fills),'basis':'Attributed simulated engine fills; configured fees, observed spread; no funding/slippage model.'}
    def listing(self):
        with self.lock,self.engine.db() as db:
            agents=[]
            for r in db.execute('SELECT * FROM desk_agents ORDER BY created'):
                latest=db.execute('SELECT * FROM desk_agent_runs WHERE agent=? ORDER BY created DESC LIMIT 1',(r['id'],)).fetchone()
                agents.append({**{k:r[k] for k in ('id','revision','state','created','updated')},**json.loads(r['config']),'metrics':self.metrics(db,r['id']),'runtime':self.last_status.get(r['id'],'Paused; arm explicitly to monitor fresh levels.'),'runCount':db.execute('SELECT COUNT(*) FROM desk_agent_runs WHERE agent=?',(r['id'],)).fetchone()[0],'lastRun':{'id':latest['id'],'decision':latest['decision'],'reason':latest['reason'],'created':latest['created']} if latest else None})
            accounts=[{**a,'venue':'simulation','execution':'simulated'} for a in self.engine.state()['accounts']]
            return {'agents':agents,'accounts':accounts,'adapters':[{'id':k,**v} for k,v in VENUES.items()],'modules':MODULES,'chart':self.chart,'serverTime':self.clock(),'runtime':'deterministic line-touch worker','liveEnabled':False}
    def detail(self,agent_id,full=False):
        with self.lock,self.engine.db() as db:
            self.row(db,agent_id);orders,positions,fills=self.owned(db,agent_id)
            limit='' if full else ' LIMIT 200'
            runs=[{**dict(r),'payload':json.loads(r['payload'])} for r in db.execute('SELECT * FROM desk_agent_runs WHERE agent=? ORDER BY created DESC'+limit,(agent_id,))]
            events=[dict(r) for r in db.execute('SELECT * FROM desk_agent_events WHERE agent=? OR agent IS NULL ORDER BY id DESC'+limit,(agent_id,))]
            revisions=[{**dict(r),'config':json.loads(r['config'])} for r in db.execute('SELECT * FROM desk_agent_revisions WHERE agent=? ORDER BY revision DESC',(agent_id,))]
            return {'agent':next(a for a in self.listing()['agents'] if a['id']==agent_id),'runs':runs,'events':events,'orders':orders,'positions':positions,'fills':fills,'revisions':revisions,'coverage':'All durable records.' if full else 'Latest 200 runs and events. Fill/performance calculation covers all attributed engine records.'}
    def save(self,payload):
        config=validate(payload)
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE');now=self.clock();agent_id=payload.get('id') or uid();revision=1
            if config['account']['venue']=='simulation':self.engine.account(db,config['account']['id']);self.engine.instrument(config['instrument'])
            if payload.get('id'):
                r=self.row(db,agent_id)
                if r['revision']!=payload.get('expectedRevision'):raise ValueError('Agent revision changed. Reload before saving.')
                orders,positions,_=self.owned(db,agent_id)
                if any(o['status'] in ('working','triggered') for o in orders) or any(p['status']=='open' for p in positions):raise ValueError('Cancel or close owned execution before changing the configuration.')
                revision=r['revision']+1
                db.execute("UPDATE desk_agents SET config=?,revision=?,state='paused',session='',updated=? WHERE id=?",(dumps(config),revision,now,agent_id))
            else:
                if db.execute('SELECT COUNT(*) FROM desk_agents').fetchone()[0]>=100:raise ValueError('Maximum 100 local agents.')
                db.execute('INSERT INTO desk_agents VALUES(?,?,?,?,?,?,?)',(agent_id,revision,dumps(config),'paused','',now,now))
            db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',(agent_id,revision,dumps(config),now))
            self.event(db,agent_id,'saved','Configuration v'+str(revision)+' saved paused.');self.previous.pop(agent_id,None)
            return {'id':agent_id,'revision':revision,'state':'paused'}
    def control(self,payload):
        action=payload.get('action');agent_id=payload.get('id')
        if action not in ('arm','pause','archive','stop','flatten','pause-all'):raise ValueError('Unsupported agent control.')
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if action=='pause-all':
                db.execute("UPDATE desk_agents SET state='paused' WHERE state='armed'");self.event(db,None,'pause-all','All agents paused; existing protections and working orders remain.');return {'paused':True}
            row=self.row(db,agent_id);c=json.loads(row['config']);orders,positions,_=self.owned(db,agent_id)
            if payload.get('revision')!=row['revision']:raise ValueError('Reload current agent revision.')
            if action=='arm':
                if row['state']=='archived':raise ValueError('Archived agent cannot arm. Clone it first.')
                if c['mode']!='simulation' or c['account']['venue']!='simulation':raise ValueError('Only verified simulation adapters can arm. Observe/live profiles stay paused.')
                if row['state']=='armed':return {'id':agent_id,'state':'armed'}
                self.engine.account(db,c['account']['id']);q=self.engine.quote(self.engine.instrument(c['instrument']))
                db.execute("UPDATE desk_agents SET state='armed',session=?,updated=? WHERE id=?",(uid(),self.clock(),agent_id))
                self.previous[agent_id]={'mid':(dec(q['bid'])+dec(q['ask']))/2,'levels':{}};self.last_status[agent_id]='Waiting for a new observed touch after level baseline.'
            else:
                adapter=ExecutionAdapter(c['account']['venue'],self.engine)
                if action in ('stop','flatten'):
                    if payload.get('confirmation')!='SIMULATION ONLY':raise ValueError('Confirm SIMULATION ONLY to cancel or flatten agent-owned execution.')
                    for o in orders:
                        if o['status'] in ('working','triggered'):adapter.cancel(db,o)
                    if action=='flatten':
                        for p in positions:
                            if p['status']=='open':adapter.close(db,p)
                if action=='archive' and (any(o['status'] in ('working','triggered') for o in orders) or any(p['status']=='open' for p in positions)):raise ValueError('Stop/close owned activity before archiving.')
                db.execute('UPDATE desk_agents SET state=?,updated=? WHERE id=?',('archived' if action=='archive' else 'paused',self.clock(),agent_id))
                self.previous.pop(agent_id,None);self.last_status[agent_id]='Paused. Existing engine protections remain active.'
            self.event(db,agent_id,action,'Agent '+action+' requested; simulation execution only.')
            return {'id':agent_id,'state':'armed' if action=='arm' else 'archived' if action=='archive' else 'paused'}
    def publish(self,p):
        if not isinstance(p,dict) or set(p)!={'instrument','timeframe','observedAt','replay','levels'}:raise ValueError('Exact chart context required.')
        if not isinstance(p['instrument'],str) or len(p['instrument'])>80 or not isinstance(p['timeframe'],str) or len(p['timeframe'])>15 or type(p['replay']) is not bool:raise ValueError('Invalid chart identity.')
        if not isinstance(p['observedAt'],(int,float)) or not math.isfinite(p['observedAt']) or not -2<=self.clock()-p['observedAt']<=15:raise ValueError('Fresh chart context required.')
        if not isinstance(p['levels'],list) or len(p['levels'])>200:raise ValueError('Publish at most 200 explicit levels.')
        levels=[];seen=set()
        for l in p['levels']:
            if not isinstance(l,dict) or set(l)!={'id','price','source','label'} or not isinstance(l['id'],str) or not 1<=len(l['id'])<=160 or l['id'] in seen or l['source'] not in ('manual-cyan','liquidity') or not isinstance(l['label'],str) or len(l['label'])>160:raise ValueError('Invalid or duplicate chart level.')
            seen.add(l['id']);levels.append({**l,'price':number(l['price'],'level price',Decimal('.00000001'),Decimal('1e12'))})
        with self.lock:
            if self.chart and p['observedAt']<self.chart['observedAt']:return {'accepted':0,'ignored':'Older chart context.'}
            self.chart={**p,'levels':levels,'receivedAt':self.clock()}
        return {'accepted':len(levels),'replay':p['replay']}
    def risk(self,db,row,c,quote,intent,entry):
        r=c['modules']['risk'];qty=dec(intent['qty']);notional=qty*entry;stoprisk=abs(entry-dec(intent['stop']))*qty
        a=self.engine.account(db,c['account']['id']);fee=notional*dec(a['fee_bps'])/10000
        if notional>dec(r['maxOrderUSD']):return 'Per-order notional limit exceeded.'
        if stoprisk+fee*2>dec(r['maxRiskUSD']):return 'Stop risk plus estimated round-trip fees exceeds risk limit.'
        spread=(dec(quote['ask'])-dec(quote['bid']))/((dec(quote['ask'])+dec(quote['bid']))/2)*10000
        if spread>dec(r['maxSpreadBps']):return 'Bid/ask spread exceeds limit.'
        stats=self.metrics(db,row['id'])
        if stats['unrealized'] is None:return 'Position marks are stale.'
        if dec(stats['dailyNet'])+min(Decimal(0),dec(stats['unrealized']))<=-dec(r['maxDailyLossUSD']):return 'Daily loss limit reached.'
        day=datetime.fromtimestamp(self.clock(),timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0).timestamp()
        count=db.execute("SELECT COUNT(*) FROM desk_agent_runs WHERE agent=? AND order_id IS NOT NULL AND created>=?",(row['id'],day)).fetchone()[0]
        if count>=r['maxTradesPerDay']:return 'Daily trade count reached (UTC day).'
        if stats['openPositions']+stats['workingOrders']>=r['maxConcurrent']:return 'Concurrent trade limit reached.'
        last=db.execute('SELECT MAX(created) FROM desk_agent_runs WHERE agent=? AND order_id IS NOT NULL',(row['id'],)).fetchone()[0]
        if last and self.clock()-last<r['cooldownSeconds']:return 'Entry cooldown is active.'
        exposure=sum((dec(p['qty'])*dec(p['entry']) for p in db.execute("SELECT * FROM positions WHERE account_id=? AND status='open'",(a['id'],))),Decimal(0))
        exposure+=sum((dec(o['qty'])*dec(o['price'] or o['trigger'] or entry) for o in db.execute("SELECT * FROM orders WHERE account_id=? AND status IN ('working','triggered')",(a['id'],))),Decimal(0))
        if exposure+notional>dec(r['maxExposureUSD']):return 'Account exposure limit exceeded.'
        if db.execute("SELECT 1 FROM positions WHERE account_id=? AND instrument=? AND status='open' AND side<>?",(a['id'],c['instrument'],intent['side'])).fetchone():return 'Opposite account position would mix agent attribution; entry blocked.'
        if db.execute("SELECT 1 FROM orders WHERE account_id=? AND instrument=? AND status IN ('working','triggered') AND side<>?",(a['id'],c['instrument'],intent['side'])).fetchone():return 'Opposite working order would mix agent attribution; entry blocked.'
        if c['instrument'].startswith('coinbase:') and intent['side']=='sell':return 'Spot short entries are unavailable; exits manage owned positions.'
        return None
    def tick(self):
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE');now=self.clock()
            for row in db.execute("SELECT * FROM desk_agents WHERE state<>'archived'").fetchall():
                c=json.loads(row['config']);agent_id=row['id']
                if c['account']['venue']!='simulation' or c['mode']!='simulation':continue
                if not db.execute('SELECT 1 FROM accounts WHERE id=?',(c['account']['id'],)).fetchone():
                    if row['state']=='armed':
                        db.execute("UPDATE desk_agents SET state='paused' WHERE id=?",(agent_id,));self.event(db,agent_id,'account-unavailable','Assigned account no longer exists. Only this agent was paused.')
                    self.previous.pop(agent_id,None);self.last_status[agent_id]='Assigned simulation account no longer exists.';continue
                _,positions,_=self.owned(db,agent_id)
                for p in positions:
                    opened=datetime.fromisoformat(p['opened_at'].replace('Z','+00:00')).timestamp()
                    if p['status']=='open' and now-opened>=c['modules']['exit']['maxHoldingSeconds']:
                        try:ExecutionAdapter('simulation',self.engine).close(db,p);self.event(db,agent_id,'time-exit','Maximum holding time reached; owned paper position closed.')
                        except ValueError:self.last_status[agent_id]='Time exit waiting for fresh executable quote.'
                if row['state']!='armed':continue
                chart=self.chart;q=self.engine.quotes.get(c['instrument']);r=c['modules']['risk'];s=c['modules']['signal']
                if not chart or chart['instrument']!=c['instrument'] or chart['replay'] or not 0<=now-chart['receivedAt']<=10 or not 0<=now-chart['observedAt']<=15:
                    self.previous.pop(agent_id,None);self.last_status[agent_id]='Waiting for fresh matching chart heartbeat; replay/closed tabs cannot trigger entries.';continue
                if not q or not 0<=now-q['received_at']<=r['maxQuoteAgeSeconds']:
                    self.previous.pop(agent_id,None);self.last_status[agent_id]='Waiting for fresh server bid/ask.';continue
                mid=(dec(q['bid'])+dec(q['ask']))/2;previous=self.previous.get(agent_id);prior=previous['levels'] if previous else {};current={}
                candidates=[l for l in chart['levels'] if l['source'] in s['sources']]
                self.last_status[agent_id]='Monitoring '+str(len(candidates))+' levels · fresh chart and quote.'
                for level in candidates:
                    price=dec(level['price']);key=level['id']+':'+str(price);current[key]=mid
                    if key not in prior:continue
                    tolerance=price*dec(s['toleranceBps'])/10000
                    if abs(mid-price)>tolerance or abs(prior[key]-price)<=tolerance:continue
                    signal_key=hashlib.sha256(dumps([agent_id,row['revision'],row['session'],level['id']]).encode()).hexdigest()
                    if db.execute('SELECT 1 FROM desk_agent_runs WHERE signal_key=?',(signal_key,)).fetchone():continue
                    side=s['side'] if s['side']!='approach' else 'buy' if prior[key]>price else 'sell'
                    entry=dec(q['ask'] if side=='buy' else q['bid']) if c['modules']['entry']['type']=='market-touch' else price
                    tick=dec(q.get('tick','.01'),True);direction=1 if side=='buy' else -1
                    distance=entry*dec(c['modules']['exit']['stopBps'])/10000
                    roundprice=lambda v:(v/tick).to_integral_value(rounding=ROUND_FLOOR if side=='buy' else ROUND_CEILING)*tick
                    stop=roundprice(entry-direction*distance);target=roundprice(entry+direction*distance*dec(c['modules']['exit']['rewardRisk']))
                    intent={'account_id':c['account']['id'],'instrument':c['instrument'],'side':side,'kind':'market' if c['modules']['entry']['type']=='market-touch' else 'limit','qty':c['modules']['entry']['quantity'],'price':str(price) if c['modules']['entry']['type']=='limit-level' else None,'stop':str(stop),'target':str(target),'ttl_seconds':c['modules']['entry']['expirySeconds']}
                    reason=self.risk(db,row,c,q,intent,entry);order=None;preview=None
                    if not reason:
                        try:
                            db.execute('SAVEPOINT agent_order');adapter=ExecutionAdapter('simulation',self.engine);preview=adapter.preview(db,intent);order=adapter.submit(db,intent);db.execute('RELEASE agent_order')
                        except ValueError as e:db.execute('ROLLBACK TO agent_order');db.execute('RELEASE agent_order');reason=str(e)
                    runid=uid();payload={'config':c,'level':level,'chart':{k:chart[k] for k in ('instrument','timeframe','observedAt','replay')},'quote':{k:q.get(k) for k in ('bid','ask','received_at','transport','source_time')},'intent':intent,'preview':preview,'simulation':True}
                    db.execute('INSERT INTO desk_agent_runs VALUES(?,?,?,?,?,?,?,?,?,?)',(runid,agent_id,row['revision'],row['session'],signal_key,'blocked' if reason else 'submitted',reason or 'Paper order accepted; execution ledger is authoritative.',dumps(payload),order['id'] if order else None,now))
                    self.event(db,agent_id,'blocked' if reason else 'order',reason or 'Observed line touch submitted to simulation account.')
                    self.last_status[agent_id]=reason or 'Paper order accepted; monitoring protections.'
                self.previous[agent_id]={'mid':mid,'levels':current}
    def get(self,handler,path,query):
        if not path.startswith(PREFIX):return False
        if path==PREFIX+'/state':handler.json(self.listing());return True
        if path in (PREFIX+'/detail',PREFIX+'/export'):handler.json(self.detail(query.get('id',[''])[0],path.endswith('/export')));return True
        handler.json({'error':'Unknown Agents read.'},404);return True
    def post(self,handler,path,payload):
        if not path.startswith(PREFIX):return False
        if handler.headers.get('Origin')!='http://'+handler.headers.get('Host',''):handler.json({'error':'Exact same-origin Agents request required.'},403);return True
        if not isinstance(payload,dict):raise ValueError('JSON object required.')
        if path==PREFIX+'/save':handler.json(self.save(payload));return True
        if path==PREFIX+'/control':handler.json(self.control(payload));return True
        if path==PREFIX+'/chart':handler.json(self.publish(payload));return True
        handler.json({'error':'Unknown Agents action.'},404);return True

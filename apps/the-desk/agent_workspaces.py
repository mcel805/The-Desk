"""Owned agent charts, draft publication, account provisioning and journal links.

All mutations share the execution database transaction. A chart view never owns
runtime authority. External journal delivery remains a durable queued bridge.
"""
import copy
import hashlib
import json
import re
from decimal import Decimal
from pathlib import Path
from engine import dec

ROOT=Path(__file__).resolve().parent
TIMEFRAMES={'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','1d':'D'}
LIQUIDITY_SOURCE=ROOT/'web/pine-examples/agentic-liquidity.pine'
SOURCE_HASH=hashlib.sha256(LIQUIDITY_SOURCE.read_bytes()).hexdigest()

def chart_defaults():
    return {'timeframe':'1h','historyBars':600,'levels':[],
            'liquidity':{'enabled':False,'sourceHash':SOURCE_HASH,'pivotStrength':3,'sourceBars':400,'masterBars':1200}}

def validate_chart(value):
    if not isinstance(value,dict) or set(value)!={'timeframe','historyBars','levels','liquidity'}:raise ValueError('Exact agent chart configuration required.')
    c=copy.deepcopy(value)
    if c['timeframe'] not in TIMEFRAMES or type(c['historyBars']) is not int or not 200<=c['historyBars']<=1000:raise ValueError('Choose a supported agent timeframe and 200–1000 history bars.')
    if not isinstance(c['levels'],list) or len(c['levels'])>100:raise ValueError('At most 100 published manual levels.')
    seen=set()
    for l in c['levels']:
        if not isinstance(l,dict) or set(l)!={'id','price','label'} or not isinstance(l['id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',l['id']) or l['id'] in seen:raise ValueError('Manual levels require unique stable IDs.')
        if not isinstance(l['label'],str) or len(l['label'])>100 or not Decimal('.00000001')<=dec(l['price'])<=Decimal('1e12'):raise ValueError('Invalid manual level price or label.')
        l['price']=str(dec(l['price']));seen.add(l['id'])
    q=c['liquidity']
    if not isinstance(q,dict) or set(q)!={'enabled','sourceHash','pivotStrength','sourceBars','masterBars'} or type(q['enabled']) is not bool:raise ValueError('Exact Liquidity module settings required.')
    if not isinstance(q['sourceHash'],str) or not re.fullmatch('[0-9a-f]{64}',q['sourceHash']):raise ValueError('Pinned Liquidity source hash required.')
    for k,lo,hi in [('pivotStrength',1,30),('sourceBars',200,1200),('masterBars',500,6000)]:
        if type(q[k]) is not int or not lo<=q[k]<=hi:raise ValueError('Invalid Liquidity '+k)
    return c

class AgentWorkspaces:
    def init_workspaces(self):
        self.signal_service=None;self.journal_context=None
        with self.lock,self.engine.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS desk_agent_workspaces(agent TEXT PRIMARY KEY,chart_id TEXT UNIQUE NOT NULL,account_id TEXT NOT NULL,journal_id TEXT UNIQUE NOT NULL,exclusive INTEGER NOT NULL,created REAL);
              CREATE UNIQUE INDEX IF NOT EXISTS desk_agent_exclusive_account ON desk_agent_workspaces(account_id) WHERE exclusive=1;
              CREATE TABLE IF NOT EXISTS desk_agent_drafts(agent TEXT PRIMARY KEY,base_revision INTEGER,revision INTEGER,config TEXT,updated REAL);
              CREATE TABLE IF NOT EXISTS desk_agent_provisions(key TEXT PRIMARY KEY,hash TEXT,agent TEXT);
            ''')
            rows=db.execute('SELECT * FROM desk_agents ORDER BY created').fetchall()
            for row in rows:
                existing=db.execute('SELECT 1 FROM desk_agent_workspaces WHERE agent=?',(row['id'],)).fetchone()
                c=json.loads(row['config']);account=c['account']['id']
                shared=sum(json.loads(r['config'])['account']['id']==account for r in rows)>1
                manual=db.execute('SELECT 1 FROM orders WHERE account_id=? AND id NOT IN (SELECT order_id FROM desk_agent_runs WHERE order_id IS NOT NULL)',(account,)).fetchone()
                seed=db.execute("SELECT value FROM desk_agent_meta WHERE key='seed-v1'").fetchone()
                provisioned=db.execute('SELECT 1 FROM desk_agent_provisions WHERE agent=?',(row['id'],)).fetchone()
                exclusive=int(c['account']['venue']=='simulation' and not shared and not manual and bool(provisioned or seed and seed[0]==row['id']))
                if existing:
                    if not exclusive:db.execute('UPDATE desk_agent_workspaces SET exclusive=0 WHERE agent=?',(row['id'],))
                    continue
                db.execute('INSERT INTO desk_agent_workspaces VALUES(?,?,?,?,?,?)',(row['id'],'chart-'+row['id'],account,'journal-'+row['id'],exclusive,self.clock()))
                if 'chart' not in c:
                    c['chart']=chart_defaults();revision=row['revision']+1
                    db.execute("UPDATE desk_agents SET config=?,revision=?,state='paused',session='' WHERE id=?",(self._dump(c),revision,row['id']))
                    db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',(row['id'],revision,self._dump(c),self.clock()))
                    self.event(db,row['id'],'workspace-migrated','Independent chart and journal assigned. Prior versions and execution retained; review levels before arming.')
        with self.lock,self.engine.db() as db:
            if not db.execute('SELECT 1 FROM accounts WHERE id NOT IN (SELECT account_id FROM desk_agent_workspaces WHERE exclusive=1)').fetchone():
                self.engine.create_account(db,{'name':'The Desk Paper','capital':'100000','fee_bps':'5','leverage':'1'})
        self.engine.agent_journal_enricher=self.enrich_journal
        self.engine.agent_command_guard=self.manual_guard

    def _dump(self,value):return json.dumps(value,sort_keys=True,allow_nan=False,separators=(',',':'))
    def manual_guard(self,db,action,payload):
        if not self.workspace_runtime:return
        account=payload.get('account_id')
        if action=='account_delete' and not db.execute('SELECT 1 FROM accounts WHERE id<>? AND id NOT IN (SELECT account_id FROM desk_agent_workspaces WHERE exclusive=1)',(account,)).fetchone():
            raise ValueError('Keep at least one manual trading account. Agent accounts are reserved for their agents.')
        if action!='account' and account and db.execute('SELECT 1 FROM desk_agent_workspaces WHERE account_id=? AND exclusive=1',(account,)).fetchone():
            raise ValueError('This account belongs to an agent. Use Agents controls; manual trading and account resets are disabled.')

    def enrich_journal(self,db,payload):
        if payload.get('eventType')!='execution':return payload
        context=self.journal_context
        if not context:
            fill=payload.get('execution',{}).get('id')
            r=db.execute('SELECT r.agent,r.revision,r.id FROM fills f JOIN desk_agent_runs r ON r.order_id=f.order_id WHERE f.id=? LIMIT 1',(fill,)).fetchone()
            if not r:r=db.execute('''SELECT r.agent,r.revision,r.id FROM fills f JOIN orders o ON o.position_id=f.position_id
                JOIN desk_agent_runs r ON r.order_id=o.id WHERE f.id=? LIMIT 1''',(fill,)).fetchone()
            if r:context={'id':r['agent'],'version':r['revision'],'runId':r['id'],'chartId':'chart-'+r['agent'],'journalId':'journal-'+r['agent']}
        if context:payload={**payload,'provenance':{**payload.get('provenance',{}),'agent':context}}
        return payload

    def workspace_info(self,db,row,c):
        w=db.execute('SELECT * FROM desk_agent_workspaces WHERE agent=?',(row['id'],)).fetchone()
        if not w:return None
        w=dict(w);draft=db.execute('SELECT * FROM desk_agent_drafts WHERE agent=?',(row['id'],)).fetchone()
        pending=db.execute("SELECT COUNT(*) FROM outbox WHERE json_extract(payload,'$.account.id')=? AND status='pending'",(w['account_id'],)).fetchone()[0]
        delivered=db.execute("SELECT COUNT(*) FROM outbox WHERE json_extract(payload,'$.account.id')=? AND status='delivered'",(w['account_id'],)).fetchone()[0]
        remote=db.execute("SELECT journal_account FROM outbox WHERE json_extract(payload,'$.account.id')=? AND journal_account IS NOT NULL ORDER BY sequence DESC LIMIT 1",(w['account_id'],)).fetchone()
        failure=db.execute("SELECT error FROM outbox WHERE json_extract(payload,'$.account.id')=? AND status='pending' AND error<>'' LIMIT 1",(w['account_id'],)).fetchone()
        context=self.context_for(row,c);quote=self.engine.quotes.get(c['instrument'])
        healthy=bool(context and quote and 0<=self.clock()-quote['received_at']<=c['modules']['risk']['maxQuoteAgeSeconds'])
        state='archived' if row['state']=='archived' else 'paused' if row['state']!='armed' else 'watching' if healthy else 'stale-data'
        if not w['exclusive']:state='setup-required'
        return {**w,'independent':True,'health':state,'dataFresh':healthy,'draft':{'baseRevision':draft['base_revision'],'revision':draft['revision'],'updated':draft['updated']} if draft else None,
                'journal':{'id':w['journal_id'],'local':'ready','externalAccountId':remote[0] if remote else None,'pending':pending,'delivered':delivered,'status':'retrying' if failure else 'pending' if pending else 'synced' if remote else 'unlinked','error':failure[0] if failure else None}}

    def provision(self,payload):
        from agents import validate,uid
        p=copy.deepcopy(payload);key=p.pop('creationKey',None);setup=p.pop('setup',None)
        if not isinstance(key,str) or not re.fullmatch('[a-zA-Z0-9_-]{12,100}',key):raise ValueError('A stable agent creation key is required.')
        if not isinstance(setup,dict) or set(setup)!={'capital','fee_bps','leverage'}:raise ValueError('Choose explicit virtual capital, fees and leverage.')
        if p.get('id'):raise ValueError('Provision creates a new agent identity.')
        digest=hashlib.sha256(self._dump(payload).encode()).hexdigest()
        p.setdefault('chart',chart_defaults());config=validate(p)
        if config['account']['venue']!='simulation':raise ValueError('Automatic account provisioning supports simulation. External venues require a verified dedicated account integration.')
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE');old=db.execute('SELECT * FROM desk_agent_provisions WHERE key=?',(key,)).fetchone()
            if old:
                if old['hash']!=digest:raise ValueError('Creation key already used with different settings.')
                return {'id':old['agent'],'state':'paused','duplicate':True}
            if db.execute('SELECT COUNT(*) FROM desk_agents').fetchone()[0]>=100:raise ValueError('Maximum 100 local agents.')
            self.engine.instrument(config['instrument']);account=self.engine.create_account(db,{'name':('Agent · '+config['name'])[:80],**setup})
            config['account']['id']=account['id'];agent_id=uid();now=self.clock()
            db.execute('INSERT INTO desk_agents VALUES(?,?,?,?,?,?,?)',(agent_id,1,self._dump(config),'paused','',now,now))
            db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',(agent_id,1,self._dump(config),now))
            db.execute('INSERT INTO desk_agent_workspaces VALUES(?,?,?,?,?,?)',(agent_id,'chart-'+agent_id,account['id'],'journal-'+agent_id,1,now))
            db.execute('INSERT INTO desk_agent_provisions VALUES(?,?,?)',(key,digest,agent_id))
            self.event(db,agent_id,'provisioned','Chart, dedicated simulation account and local journal created atomically. External journal account link queued. Version 1 saved paused.')
            return {'id':agent_id,'revision':1,'state':'paused','chartId':'chart-'+agent_id,'accountId':account['id'],'journalId':'journal-'+agent_id}

    def save_draft(self,payload):
        from agents import validate
        p=copy.deepcopy(payload);draft_revision=p.pop('draftRevision',None);config=validate(p);agent_id=p.get('id')
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE');row=self.row(db,agent_id);current=json.loads(row['config'])
            if row['state']=='archived':raise ValueError('Clone an archived agent before editing.')
            if p.get('expectedRevision')!=row['revision']:raise ValueError('Published version changed. Reload before editing.')
            old=db.execute('SELECT * FROM desk_agent_drafts WHERE agent=?',(agent_id,)).fetchone()
            if draft_revision!=(old['revision'] if old else None):raise ValueError('Draft revision changed. Reload before editing.')
            if config['account']!=current['account']:raise ValueError('An agent keeps its account. Clone to provision another account.')
            config.setdefault('chart',current.get('chart',chart_defaults()))
            if config['account']['venue']=='simulation':self.engine.instrument(config['instrument'])
            revision=(old['revision'] if old else 0)+1
            db.execute('INSERT INTO desk_agent_drafts VALUES(?,?,?,?,?) ON CONFLICT(agent) DO UPDATE SET revision=excluded.revision,config=excluded.config,updated=excluded.updated',(agent_id,row['revision'],revision,self._dump(config),self.clock()))
            self.event(db,agent_id,'draft-saved','Draft saved. Published v'+str(row['revision'])+' and its execution are unchanged.')
            return {'id':agent_id,'draftRevision':revision,'baseRevision':row['revision'],'draft':True}

    def publish_draft(self,p):
        with self.lock,self.engine.db() as db:
            db.execute('BEGIN IMMEDIATE');row=self.row(db,p.get('id'));draft=db.execute('SELECT * FROM desk_agent_drafts WHERE agent=?',(row['id'],)).fetchone()
            if row['state']=='archived':raise ValueError('Archived agents cannot publish. Clone first.')
            if not draft or p.get('draftRevision')!=draft['revision'] or p.get('expectedRevision')!=row['revision'] or draft['base_revision']!=row['revision']:raise ValueError('Draft or published version changed. Reload before publication.')
            orders,positions,_=self.owned(db,row['id'])
            if any(o['status'] in ('working','triggered') for o in orders) or any(x['status']=='open' for x in positions):raise ValueError('Publish only when flat with no working entry orders. Existing execution keeps its original version.')
            c=json.loads(draft['config']);self.validate_setup(db,row,c,require_levels=False);revision=row['revision']+1
            db.execute("UPDATE desk_agents SET config=?,revision=?,state='paused',session='',updated=? WHERE id=?",(draft['config'],revision,self.clock(),row['id']))
            db.execute('INSERT INTO desk_agent_revisions VALUES(?,?,?,?)',(row['id'],revision,draft['config'],self.clock()))
            db.execute('DELETE FROM desk_agent_drafts WHERE agent=?',(row['id'],));self.previous.pop(row['id'],None)
            self.event(db,row['id'],'published','Version '+str(revision)+' published paused; account and journal history retained.')
            return {'id':row['id'],'revision':revision,'state':'paused'}

    def validate_setup(self,db,row,c,require_levels=True):
        w=db.execute('SELECT * FROM desk_agent_workspaces WHERE agent=?',(row['id'],)).fetchone()
        if not w or not w['exclusive'] or w['account_id']!=c['account']['id']:raise ValueError('Dedicated account setup required. Clone into a new agent account; prior shared activity is retained.')
        self.engine.account(db,w['account_id']);chart=validate_chart(c['chart'])
        if chart['liquidity']['enabled'] and chart['liquidity']['sourceHash']!=SOURCE_HASH:raise ValueError('Liquidity source changed. Review and publish a version with the current source hash.')
        if require_levels and not (chart['levels'] and 'manual-cyan' in c['modules']['signal']['sources'] or chart['liquidity']['enabled'] and 'liquidity' in c['modules']['signal']['sources']):raise ValueError('Publish a manual cyan level or enable the Liquidity source before arming.')

    def context_for(self,row,c):
        if not self.workspace_runtime:return self.chart
        chart=c.get('chart')
        if not chart:return None
        levels=[{'id':'manual:'+l['id'],'price':l['price'],'label':l['label'],'source':'manual-cyan'} for l in chart['levels']]
        asof=self.clock();record=None
        if chart['liquidity']['enabled']:
            if chart['liquidity']['sourceHash']!=SOURCE_HASH:return None
            record=self.signal_service.snapshot(row['id'],row['revision']) if self.signal_service else None
            if not record or record.get('revision')!=row['revision'] or not record.get('liquidityReady') or not 0<=self.clock()-record['observedAt']<=45:return None
            quote=self.engine.quotes.get(c['instrument'],{})
            if not quote.get('metadata_verified') or not 0<=self.clock()-quote.get('metadata_observed_at',0)<=300 or record.get('instrumentMetadata',{}).get('tick')!=quote.get('tick'):return None
            levels+=record['levels'];asof=record['observedAt']
        return {'instrument':c['instrument'],'timeframe':chart['timeframe'],'observedAt':self.clock(),'receivedAt':self.clock(),'replay':False,'levels':levels,'authority':'independent-agent-runtime','inputObservedAt':asof,'chartId':'chart-'+row['id'],'version':row['revision'],'sourceHash':chart['liquidity']['sourceHash'] if record else None,'sourceInputs':{k:record.get(k) for k in ('coverage','requests','instrumentMetadata','calculatedAt')} if record else None}

    def chart_data(self,agent_id):
        with self.lock,self.engine.db() as db:
            row=self.row(db,agent_id);c=json.loads(row['config']);context=self.context_for(row,c)
            snapshot=self.signal_service.snapshot(agent_id,row['revision']) if self.signal_service else None
            q=self.engine.quotes.get(c['instrument']);age=self.clock()-q['received_at'] if q else None
            return {'agentId':agent_id,'revision':row['revision'],'chartId':'chart-'+agent_id,'instrument':c['instrument'],'config':c.get('chart',chart_defaults()),'context':context,'quote':{**q,'age':age} if q else None,
                    'bars':snapshot.get('bars',[]) if snapshot else [],'observedAt':snapshot.get('observedAt') if snapshot else None,'coverage':snapshot.get('coverage') if snapshot else None,'error':self.signal_service.errors.get(agent_id) if self.signal_service else 'Agent data service is not running.'}

    def decorate_state(self,state):
        with self.lock,self.engine.db() as db:
            owners={r['account_id']:r['agent'] for r in db.execute('SELECT account_id,agent FROM desk_agent_workspaces WHERE exclusive=1')}
        return {**state,'accounts':[{**a,'agent_owner':owners.get(a['id'])} for a in state['accounts']]}

    def fleet_limits(self,db):
        row=db.execute("SELECT value FROM desk_agent_meta WHERE key='fleet-risk-v1'").fetchone()
        return json.loads(row[0]) if row else {'maxArmed':10,'maxExposureUSD':'10000','maxDailyLossUSD':'100'}

    def save_fleet_limits(self,p):
        if set(p)!={'maxArmed','maxExposureUSD','maxDailyLossUSD'} or type(p['maxArmed']) is not int or not 1<=p['maxArmed']<=100:raise ValueError('Choose 1–100 maximum armed agents and explicit fleet limits.')
        values={'maxArmed':p['maxArmed']}
        for k in ('maxExposureUSD','maxDailyLossUSD'):
            if not Decimal('.01')<=dec(p[k])<=Decimal('100000000'):raise ValueError('Fleet USD limits outside bounds.')
            values[k]=str(dec(p[k]))
        with self.lock,self.engine.db() as db:
            db.execute("INSERT INTO desk_agent_meta VALUES('fleet-risk-v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(self._dump(values),))
            self.event(db,None,'fleet-limits','Fleet risk limits updated. New entries obey the new ceilings; existing protections retained.')
        return values

    def fleet_gate(self,db,notional):
        limits=self.fleet_limits(db);accounts=[r[0] for r in db.execute('SELECT account_id FROM desk_agent_workspaces WHERE exclusive=1')];exposure=Decimal(0);day_net=Decimal(0)
        for account in accounts:
            for p in db.execute("SELECT * FROM positions WHERE account_id=? AND status='open'",(account,)):
                q=self.engine.quotes.get(p['instrument'])
                if not q or not 0<=self.clock()-q['received_at']<=15:return 'Fleet marks are stale.'
                mark=dec(q['bid'] if p['side']=='buy' else q['ask']);exposure+=dec(p['qty'])*mark
                day_net+=min(Decimal(0),(mark-dec(p['entry']))*dec(p['qty'])*(1 if p['side']=='buy' else -1))
            for o in db.execute("SELECT * FROM orders WHERE account_id=? AND status IN ('working','triggered')",(account,)):
                q=self.engine.quotes.get(o['instrument']);price=o['price'] or o['trigger'] or (q or {}).get('ask')
                if not price:return 'Fleet order exposure unavailable.'
                exposure+=dec(o['qty'])*dec(price)
        for r in db.execute('SELECT id FROM desk_agents'):
            day_net+=dec(self.metrics(db,r['id'])['dailyNet'])
        if exposure+notional>dec(limits['maxExposureUSD']):return 'Fleet exposure limit exceeded.'
        if day_net<=-dec(limits['maxDailyLossUSD']):return 'Fleet daily loss limit reached.'
        return None

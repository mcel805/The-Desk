"""Paper hunt sessions layered over unchanged Wave Court chart calculations."""
import json
import os
import time
import uuid
from urllib.request import Request, urlopen
from datetime import datetime, timezone

import rider_auto

FRAMES = ('1d','4h','1h','30m','15m','5m','1m')

def schema(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS hunt_snapshots(provider TEXT,symbol TEXT,time INTEGER,body TEXT,PRIMARY KEY(provider,symbol));
    CREATE TABLE IF NOT EXISTS hunt_sessions(id TEXT PRIMARY KEY,provider TEXT,symbol TEXT,account TEXT,started INTEGER,ended INTEGER,body TEXT,journal_hash TEXT,journal_error TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_hunt ON hunt_sessions((1)) WHERE ended IS NULL;
    CREATE TABLE IF NOT EXISTS hunt_events(id TEXT PRIMARY KEY,session TEXT,created INTEGER,role TEXT,kind TEXT,body TEXT,UNIQUE(session,kind,id));
    CREATE TABLE IF NOT EXISTS hunt_candidates(id TEXT PRIMARY KEY,session TEXT,time INTEGER,level TEXT,body TEXT,UNIQUE(session,time,level));
    ''')

def unpack(row):
    if not row:return None
    return {**json.loads(row['body']), 'id':row['id'],'started':row['started'],'ended':row['ended'],'provider':row['provider'],'symbol':row['symbol'],'account':row['account'],'journalError':row['journal_error'],'journalSynced':bool(row['journal_hash']) and not row['journal_error']}

def event(db,sid,role,kind,body,eid=None):
    eid=eid or 'hunt-event-'+uuid.uuid4().hex
    if db.execute('SELECT 1 FROM hunt_events WHERE id=?',(eid,)).fetchone():return
    changed=db.execute('INSERT OR IGNORE INTO hunt_events VALUES(?,?,?,?,?,?)',(eid,sid,int(time.time()*1000),role,kind,json.dumps(body))).rowcount
    if changed:db.execute('UPDATE hunt_sessions SET journal_hash=NULL WHERE id=?',(sid,))

def manual_levels(payload,provider,symbol,desk):
    rows=payload.get('manualLevels',[])
    if not isinstance(rows,list) or len(rows)>30:raise ValueError('At most 30 manual horizontal lines')
    out=[]
    for x in rows:
        if not isinstance(x,dict) or x.get('provider')!=provider or x.get('symbol')!=symbol or x.get('type')!='hline':raise ValueError('Manual level must be a horizontal drawing on this source market')
        ident=str(x.get('id',''))
        if not ident.startswith('manual:') or len(ident)>100:raise ValueError('Invalid manual drawing ID')
        price=desk.finite(x.get('price'),'Manual price')
        if price<=0 or price>1e9 or x.get('side') not in (-1,1):raise ValueError('Invalid manual horizontal price or side')
        out.append({'id':ident,'price':price,'side':x['side'],'tf':6,'weight':0,'born':desk.now(),'takenAt':0,
                    'origin':'manual','drawingId':str(x.get('drawingId',''))[:100],'label':str(x.get('label','Manual horizontal'))[:80],
                    'provider':provider,'symbol':symbol,'provenance':'Human drawn test level; not indicator-confirmed liquidity'})
    if len({x['id'] for x in out})!=len(out):raise ValueError('Duplicate manual drawing ID')
    return out


def start(payload,trading_db,desk):
    provider,symbol=desk.validate_source(payload.get('source',{}))
    account=str(payload.get('account',''))
    cycle=desk.cycle_account(trading_db)
    if account != cycle['account']['account_id']:raise ValueError('New hunts use the current $500 monthly paper account; refresh the desk')
    acct=trading_db.execute('SELECT * FROM chart_sim_accounts WHERE account_id=?',(account,)).fetchone()
    if not acct:raise ValueError('Choose an existing paper account')
    ids=payload.get('levels',[])
    if not isinstance(ids,list) or not 1<=len(ids)<=30 or any(not isinstance(x,str) for x in ids) or len(set(ids))!=len(ids):raise ValueError('Select 1 to 30 distinct active liquidity levels')
    with desk.LOCK,desk.connection() as db:
        if db.execute('SELECT 1 FROM hunt_sessions WHERE ended IS NULL').fetchone():raise ValueError('End the current hunt before starting another session')
        snapshot=db.execute('SELECT * FROM hunt_snapshots WHERE provider=? AND symbol=?',(provider,symbol)).fetchone()
        if not snapshot or desk.now()-snapshot['time']-60000>120000:raise ValueError('Refresh the completed 1m liquidity snapshot before starting')
        data=json.loads(snapshot['body']);levels={x['id']:x for x in data['levels'] if not x['takenAt']}
        for x in manual_levels(payload, provider, symbol, desk):levels[x['id']]=x
        if any(x not in levels for x in ids):raise ValueError('A selected level is no longer active; refresh the selection')
        sid='hunt-'+uuid.uuid4().hex;stamp=desk.now();p=desk.policy(db)
        body={'levels':[levels[x] for x in ids],'policy':p,'indicatorSettings':data['settings'],'startCutoff':snapshot['time'],
              'accountName':acct['name'],'initialBalance':acct['starting_balance'],'openingRealizedBalance':acct['starting_balance']+sum(float(r[0] or 0) for r in trading_db.execute("SELECT gross_pnl FROM quant_lab_sim_positions WHERE account_id=? AND status='closed'",(account,))),'accountCycle':cycle['month'],'accountTimezone':cycle['timezone'],'mode':'paper','name':str(payload.get('name') or symbol+' liquidity hunt')[:100],
              'apiRequested':payload.get('apiEnabled') is True,'monitoring':'Selected market while desk is visible; completed 1m bars only'}
        body['auto']=rider_auto.config(payload.get('autoConfig',{}),{**body,'id':sid,'started':stamp,'provider':provider,'symbol':symbol,'account':account},data,desk)
        if body['auto']:body['monitoring']='Server-owned completed-minute paper worker; machine must remain awake'
        db.execute('INSERT INTO hunt_sessions VALUES(?,?,?,?,?,NULL,?,NULL,NULL)',(sid,provider,symbol,account,stamp,desk.encode(body)))
        event(db,sid,'taper','start',{'text':'Clocked in. Hunting '+str(len(ids))+' selected liquidity levels. Confirmation and risk gates are frozen; chart calculations stay unchanged.'})
        return unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(sid,)).fetchone())

def end(payload,desk):
    with desk.LOCK,desk.connection() as db:
        row=db.execute('SELECT * FROM hunt_sessions WHERE id=?',(str(payload.get('session','')),)).fetchone()
        if not row:raise ValueError('Unknown hunt session')
        if row['ended'] is None:
            db.execute('UPDATE hunt_sessions SET ended=? WHERE id=?',(desk.now(),row['id']))
            event(db,row['id'],'taper','end',{'text':'Clocked out. Session results frozen for daily review and the recursive evidence loop. Open paper positions remain pending and retain their simulator brackets.'})
        return unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(row['id'],)).fetchone())

def update_levels(payload, desk):
    """Revisioned forward-only changes; existing decisions and positions remain intact."""
    sid=str(payload.get('session','')); additions=payload.get('add',[]); removals=payload.get('remove',[])
    if not all(isinstance(ids,list) and len(ids)<=30 and all(isinstance(x,str) for x in ids) and len(set(ids))==len(ids) for ids in (additions,removals)):
        raise ValueError('Provide distinct level IDs, at most 30 per change')
    if set(additions)&set(removals):raise ValueError('A level cannot be added and removed together')
    with desk.LOCK, desk.connection() as db:
        row=db.execute('SELECT * FROM hunt_sessions WHERE id=? AND ended IS NULL',(sid,)).fetchone()
        if not row:raise ValueError('This hunt session is no longer active')
        session=unpack(row)
        if (session.get('auto') or {}).get('armed'):raise ValueError('Pause Rider entries before changing hunt levels; re-arm to approve new objectives')
        provider,symbol=desk.validate_source(payload.get('source',{}))
        if provider!=session['provider'] or symbol!=session['symbol']:raise ValueError('Return to the session market before changing hunt levels')
        revision=session.get('levelRevision',1)
        if payload.get('revision')!=revision:raise ValueError('Hunt selection changed; refresh before selecting again')
        current={x['id']:x for x in session['levels']}
        if any(x not in current for x in removals):raise ValueError('A removed level is no longer selected')
        new_ids=[x for x in additions if x not in current]
        if new_ids:
            snapshot=db.execute('SELECT * FROM hunt_snapshots WHERE provider=? AND symbol=?',(provider,symbol)).fetchone()
            if not snapshot or desk.now()-snapshot['time']-60000>120000:raise ValueError('Refresh the completed liquidity snapshot before adding a level')
            available={x['id']:x for x in json.loads(snapshot['body'])['levels'] if not x['takenAt']}
            for x in manual_levels(payload,provider,symbol,desk):available[x['id']]=x
            if any(x not in available for x in new_ids):raise ValueError('Selected level is no longer active; refresh the chart')
            for ident in new_ids:current[ident]=available[ident]
        for ident in removals:current.pop(ident)
        if len(current)>30:raise ValueError('A hunt can monitor at most 30 levels')
        body=json.loads(row['body']);versions=body.get('levelVersions') or [{'revision':1,'effectiveAt':row['started'],'levels':body['levels']}]
        stamp=desk.now();revision+=1
        versions.append({'revision':revision,'effectiveAt':stamp,'levels':list(current.values())})
        body.update(levels=list(current.values()),levelVersions=versions,levelRevision=revision,levelsChangedAt=stamp)
        db.execute('UPDATE hunt_sessions SET body=? WHERE id=?',(desk.encode(body),sid))
        event(db,sid,'human','selection',{'text':f"Hunt selection v{revision}: added {len(new_ids)}, removed {len(removals)}, watching {len(current)} levels. Future completed minutes use this selection. Existing positions and brackets are unchanged.",'revision':revision,'effectiveAt':stamp,'added':new_ids,'removed':removals,'levels':list(current.values())})
        return unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(sid,)).fetchone())


def observe(db,provider,symbol,bars,levels,frames,settings,desk):
    db.execute('INSERT OR REPLACE INTO hunt_snapshots VALUES(?,?,?,?)',(provider,symbol,bars[-1]['time'],desk.encode({'levels':levels,'settings':settings,'lastPrice':bars[-1]['close']})))
    row=db.execute('SELECT * FROM hunt_sessions WHERE ended IS NULL AND provider=? AND symbol=?',(provider,symbol)).fetchone()
    if not row:return
    session=unpack(row);p=session['policy'];live={x['id']:x for x in levels}
    for i,b in enumerate(bars):
        # Starting a session never relabels the minute that already closed.
        if b['time']<=session['startCutoff'] or b['time']+60000<=session['started']:continue
        eid=session['id']+':bar:'+str(b['time'])
        if db.execute('SELECT 1 FROM hunt_events WHERE id=?',(eid,)).fetchone():continue
        versions=session.get('levelVersions') or [{'effectiveAt':session['started'],'levels':session['levels']}]
        applicable=[v for v in versions if v['effectiveAt']<b['time']+60000]
        selected_levels=applicable[-1]['levels'] if applicable else []
        selection_revision=applicable[-1].get('revision',1) if applicable else 1
        candidates=[]
        for frozen in selected_levels:
            pool=frozen if frozen.get('origin')=='manual' else live.get(frozen['id'])
            if pool is None:
                c={'barTime':b['time'],'stage':'WAIT','bias':'WAIT','direction':0,'reason':'Selected level is outside retained source history; no replacement inferred','level':frozen,'entry':None,'stop':None,'target':None,'rr':None,'kind':'forward_rule','confirmation':None,'horizonBars':p['horizon'],'forecastPrice':b['close']}
            else:
                c=desk.tape_rule(bars,i,levels+([frozen] if frozen.get('origin')=='manual' else []),p,frames,{frozen['id']},provider=provider,symbol=symbol)
                c['level']=pool
                if pool['takenAt'] and b['time']>pool['takenAt']+p['expiryBars']*60000:
                    c.update(stage='RETIRED',direction=0,bias='WAIT',reason='Selected liquidity consumed; confirmation window expired',entry=None,stop=None,target=None,rr=None)
            if c['stage']=='CONFIRMED' and c['direction']<0 and provider!='hyperliquid':
                c.update(stage='CONTEXT',reason='Short context only: this spot simulator has no borrow or margin model')
            c.update(id='hunt-plan-'+uuid.uuid4().hex,session=session['id'],levelRevision=selection_revision,provider=provider,symbol=symbol,policy=p['id'],indicatorSettings=session['indicatorSettings'],observedAt=desk.now(),evidenceHash=desk.digest({'bars':bars[max(0,i-19):i+1],'level':pool or frozen,'policy':p}),model=None)
            # Late reconstructions remain visible but cannot become fresh entry proposals.
            if desk.now()-b['time']-60000>120000:c.update(kind='rule_reconstruction')
            candidates.append(c)
            db.execute('INSERT OR IGNORE INTO hunt_candidates VALUES(?,?,?,?,?)',(c['id'],session['id'],b['time'],frozen['id'],desk.encode(c)))
        candidates.sort(key=lambda c:(c['stage']=='CONFIRMED',(c.get('risk') or {}).get('preference')=='PREFERRED',c['rr'] or 0,(c.get('level') or {}).get('weight',0)),reverse=True)
        best=next((c for c in candidates if c['stage']=='CONFIRMED' and c['kind']=='forward_rule'),None)
        interactions=[c for c in candidates if (c.get('interaction') or {}).get('stage',c['stage']) not in ('WAIT','APPROACH','RETIRED')]
        summary='; '.join(f"{c['level']['price']:,.2f}: {(c.get('interaction') or {}).get('stage',c['stage'])}. {c['reason']}" for c in interactions)
        event(db,session['id'],'taper','bar',{'barTime':b['time'],'levelRevision':selection_revision,'candidates':candidates,'best':best['id'] if best else None,
              'text':f"{len(candidates)} hunted levels checked · "+(f"Best qualified proposal: {best['bias']} at {best['entry']}" if best else (summary+' · no qualified entry' if summary else 'Watching selected levels · no new interaction'))},eid)

def find_decision(db,did):
    row=db.execute('SELECT body FROM decisions WHERE id=?',(did,)).fetchone()
    return row or db.execute('SELECT body FROM hunt_candidates WHERE id=?',(did,)).fetchone() or db.execute('SELECT body FROM rider_auto_signals WHERE id=?',(did,)).fetchone()

def state(db,provider=None,symbol=None,compact=False):
    row=db.execute('SELECT * FROM hunt_sessions WHERE ended IS NULL ORDER BY started DESC LIMIT 1').fetchone()
    if row is None:
        row=db.execute('SELECT * FROM hunt_sessions WHERE provider=? AND symbol=? ORDER BY started DESC LIMIT 1',(provider,symbol)).fetchone()
    s=unpack(row)
    if not s:return {'session':None,'sessionEvents':[],'sessionCandidates':[]}
    # Strip repeated candidate chart context in SQLite before Python parses the
    # live response. The stored source evidence and export contract remain full.
    body_expr="CASE WHEN json_type(body,'$.candidates')='array' THEN json_set(body,'$.candidates',json((SELECT json_group_array(json(json_remove(value,'$.context','$.indicatorSettings'))) FROM json_each(hunt_events.body,'$.candidates')))) ELSE body END" if compact else 'body'
    events=[{**dict(row),'body':json.loads(row['body'])} for row in db.execute('SELECT id,session,created,role,kind,'+body_expr+' AS body FROM hunt_events WHERE session=? ORDER BY created,id',(s['id'],))]
    latest=db.execute('SELECT MAX(time) FROM hunt_candidates WHERE session=?',(s['id'],)).fetchone()[0]
    selected_ids={x['id'] for x in s['levels']}
    candidate_expr="json_remove(body,'$.context','$.indicatorSettings')" if compact else 'body'
    rows=db.execute('SELECT '+candidate_expr+' FROM hunt_candidates WHERE session=? AND time=?',(s['id'],latest))
    candidates=[]
    for row in rows:
        candidate=json.loads(row[0])
        if candidate['level']['id'] in selected_ids:candidates.append(candidate)
    return {'session':s,'sessionEvents':events,'sessionCandidates':candidates,'sessionHistory':[unpack(r) for r in db.execute('SELECT * FROM hunt_sessions ORDER BY started DESC')]}

def chat(payload,desk):
    sid=str(payload.get('session',''));role=payload.get('role','human');kind=payload.get('kind','note');text=str(payload.get('text','')).strip()
    if role not in ('human','rider','taper') or kind not in ('note','request','completed','failed') or not text or len(text)>60000:raise ValueError('Invalid session message')
    with desk.LOCK,desk.connection() as db:
        if not db.execute('SELECT 1 FROM hunt_sessions WHERE id=?',(sid,)).fetchone():raise ValueError('Start a hunt session to record messages')
        event(db,sid,role,kind,{'text':text});return {'saved':True}

def attach_model(db,record,desk):
    source=record['source'];row=db.execute('SELECT id FROM hunt_sessions WHERE id=? AND provider=? AND symbol=?',(record.get('huntSessionId',''),source['provider'],source['symbol'])).fetchone()
    if row:event(db,row['id'],'taper','api',{'text':'Jev answered '+str(len(record['answers']))+' questions for this completed minute. Watch bias: '+str(next((a.get('choice') for a in record['answers'] if a['name']=='research_bias'),'unavailable'))+'. Rule gates remain in force; only an explicitly armed Rider paper hunt can execute automatically.','barTime':source['completedCutoff'],'record':record},row['id']+':api:'+record['decisionId'])

def sync_journal(payload,desk):
    sid=str(payload.get('session',''))
    with desk.LOCK,desk.connection() as db:
        row=db.execute('SELECT * FROM hunt_sessions WHERE id=?',(sid,)).fetchone()
        if not row:raise ValueError('Unknown session')
        s=unpack(row);events=[dict(r) for r in db.execute('SELECT * FROM hunt_events WHERE session=? ORDER BY created,id',(sid,))]
        lines=[s['name'],f"PAPER · {s['provider']} {s['symbol']} · account {s['accountName']}",f"Started {datetime.fromtimestamp(s['started']/1000,timezone.utc).isoformat()} · "+('active' if not s['ended'] else 'ended'),f"Session {sid} · frozen policy {s['policy']['id']}",'Selected liquidity: '+', '.join(f"{FRAMES[x['tf']]} {x['price']} weight {x['weight']}" for x in s['levels']),'Source: completed public OHLC. Conditional proposals; fills are imported separately by the paper journal bridge.','']
        for e in events:
            body=json.loads(e['body']);lines.append(f"{datetime.fromtimestamp(e['created']/1000,timezone.utc).isoformat()} {e['role'].upper()} · {body.get('text','')}")
            for c in body.get('candidates',[]):lines.append(f"  {FRAMES[c['level']['tf']]} {c['level']['price']} · {c['stage']} {c['bias']} · E {c.get('entry')} S {c.get('stop')} T {c.get('target')} RR {c.get('rr')} · {c['reason']}")
            if body.get('record'):lines.append('  API receipt '+desk.encode(body['record']))
            if body.get('review'):lines.append('  Clock-out review receipt '+desk.encode(body['review']))
        content='\n'.join(lines);version=desk.digest({'content':content})
        if version==row['journal_hash']:return {'synced':True,'session':sid,'unchanged':True}
        token=os.environ.get('COUNT_DESK_JOURNAL_BRIDGE_TOKEN','').strip()
        base=os.environ.get('LUX_JOURNAL_URL','http://127.0.0.1:3000').rstrip('/')
        if base not in ('http://127.0.0.1:3000','http://localhost:3000'):raise ValueError('Session journal requires the local journal service')
        body={'eventId':sid+':'+version,'eventType':'session','account':{'id':s['account'],'name':s['accountName'],'currency':'USD','initialBalance':s['initialBalance']},'session':{'id':sid,'title':s['name'],'content':content,'startedAt':datetime.fromtimestamp(s['started']/1000,timezone.utc).isoformat()}}
        try:
            if not token:raise RuntimeError('Journal bridge credential is not configured')
            req=Request(base+'/api/integrations/count-desk',data=desk.encode(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token},method='POST')
            with urlopen(req,timeout=2) as response:result=json.load(response)
            if not result.get('accepted'):raise RuntimeError('Journal did not acknowledge session')
            db.execute('UPDATE hunt_sessions SET journal_hash=?,journal_error=NULL WHERE id=?',(version,sid));return {'synced':True,'session':sid}
        except (OSError,ValueError,RuntimeError) as exc:
            # No credentials or response bodies reach the chart.
            message='Journal pending · '+type(exc).__name__;db.execute('UPDATE hunt_sessions SET journal_error=? WHERE id=?',(message,sid));return {'synced':False,'session':sid,'error':message}


def trace_trades(db,positions):
    for row in db.execute('SELECT * FROM hunt_sessions'):
        s=unpack(row)
        for p in positions:
            if p['provider']!=s['provider'] or p['symbol']!=s['symbol'] or p['account_id']!=s['account']:continue
            # Actual record creation time binds the trade to the session, not an approximate chart coordinate.
            stamp=p.get('entry_recorded_at')
            try:opened=int(datetime.fromisoformat(stamp.replace('Z','+00:00')).timestamp()*1000)
            except (ValueError,TypeError,AttributeError):continue
            if opened<s['started'] or s['ended'] and opened>s['ended']:continue
            event(db,s['id'],'taper','trade',{'text':f"Paper position {p['position_id']} {p['side']} {p['status']} · entry {p['entry_price']} · stop {p.get('stop_price')} · target {p.get('target_price')} · gross P&L {p.get('gross_pnl')}",'position':p['position_id']},s['id']+':trade:'+p['position_id']+':'+p['status']+':'+str(p.get('stop_price'))+':'+str(p.get('target_price')))

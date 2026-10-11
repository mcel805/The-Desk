"""Armed, unattended PAPER execution. There is deliberately no broker adapter.

Persistent controls are in the desk store; orders and fills are atomically saved
in the simulator store. Restart disarms entries; bracket management continues.
"""
import json
import math
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import crypto_risk
from rider_playbooks import PLAYBOOKS, detect

STATUS={'state':'starting','heartbeat':None,'lastCutoff':None,'error':None}
_thread=None


def schema(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS rider_auto_orders(
      id TEXT PRIMARY KEY,session TEXT,account TEXT,provider TEXT,symbol TEXT,
      level TEXT,created INTEGER,eligible INTEGER,status TEXT,body TEXT,
      UNIQUE(session,level));
    CREATE TABLE IF NOT EXISTS rider_auto_trades(
      position TEXT PRIMARY KEY,session TEXT,order_id TEXT UNIQUE,body TEXT);
    ''')


def number(value,name,low,high):
    if isinstance(value,bool):raise ValueError(name+' must be numeric')
    try:v=float(value)
    except (ValueError,TypeError):raise ValueError(name+' must be numeric') from None
    if not math.isfinite(v) or not low<=v<=high:raise ValueError(name+' is outside its allowed range')
    return v


def config(request,session,snapshot,desk):
    if not request.get('enabled'):return None
    if request.get('enabled') is not True:raise ValueError('Arm automatic paper trading explicitly')
    if not session.get('apiRequested'):raise ValueError('Automatic paper entries require Jev reads')
    if not desk.taper_decisions.status()['configured']:raise ValueError('Configure Jev before arming')
    p=session['policy']
    crypto_risk.tick(p,session['provider'],session['symbol'],snapshot['lastPrice'])
    enabled=request.get('playbooks',list(PLAYBOOKS))
    if not isinstance(enabled,list) or not enabled or len(set(enabled))!=len(enabled) or any(x not in PLAYBOOKS for x in enabled):raise ValueError('Choose rejection/retest, break/retest, or both')
    direction=request.get('direction','both' if session['provider']=='hyperliquid' else 'long')
    if direction not in ('both','long','short'):raise ValueError('Choose permitted direction')
    if direction in ('both','short') and session['provider']!='hyperliquid':raise ValueError('Long and short paper entries require Hyperliquid perpetual data. Switch to Hyperliquid or explicitly choose Long only.')
    targets={}
    explicit=request.get('targetPrice')
    if explicit not in (None,''):explicit=number(explicit,'Target price',.000001,1e9)
    for level in session['levels']:
        for d in (1,-1):
            if direction!= 'both' and direction!=('long' if d==1 else 'short'):continue
            if d<0 and session['provider']!='hyperliquid':continue
            values=[x['price'] for x in snapshot['levels'] if x['id']!=level['id'] and not x.get('takenAt') and x['side']==d and d*(x['price']-level['price'])>0]
            target=explicit if explicit is not None else min(values,key=lambda x:abs(x-level['price']),default=None)
            if target and d*(target-level['price'])>0:targets[level['id']+':'+str(d)]=target
    if not targets:raise ValueError('No permitted objective: supply a target price or choose levels with opposite liquidity')
    minutes=number(request.get('durationMinutes',240),'Session duration',5,720)
    result={'armed':True,'approvedAt':desk.now(),'expiresAt':desk.now()+int(minutes*60000),
      'playbooks':enabled,'direction':direction,'targets':targets,'targetMode':'explicit' if explicit else 'opposite liquidity frozen at arm',
      'maxTrades':int(number(request.get('maxTrades',4),'Maximum daily entries',1,4)),
      'minConfidence':number(request.get('minConfidence',.8),'Minimum classification confidence',.5,1),
      'maxEntryATR':number(request.get('maxEntryATR',.25),'Maximum entry drift / ATR',.01,1),
      'maxHoldBars':int(number(request.get('maxHoldBars',60),'Maximum holding minutes',1,240)),
      'policy':p,'state':'armed','reason':'Session-approved automatic paper entries',
      'fillModel':'First eligible future completed minute limit touch; fill at limit or better, no chase, fixed bracket',
      'approvedConfig':{k:v for k,v in request.items() if k!='enabled'},
      'reentry':'One entry attempt per selected level per session; cancelled attempts remain consumed'}
    return result


def save_auto(db,sid,auto,desk):
    row=db.execute('SELECT body FROM hunt_sessions WHERE id=?',(sid,)).fetchone()
    body=json.loads(row['body']);body['auto']=auto
    db.execute('UPDATE hunt_sessions SET body=?,journal_hash=NULL WHERE id=?',(desk.encode(body),sid))


def control(payload,trading_db,desk):
    sid=str(payload.get('session',''));action=payload.get('action')
    with desk.LOCK,desk.connection() as db:
        schema(trading_db)
        row=db.execute('SELECT * FROM hunt_sessions WHERE id=?',(sid,)).fetchone()
        if not row:raise ValueError('Unknown hunt session')
        session=desk.hunts.unpack(row);old=session.get('auto')
        if action=='arm':
            if session['ended']:raise ValueError('Start a new session before arming')
            snap=db.execute('SELECT * FROM hunt_snapshots WHERE provider=? AND symbol=?',(session['provider'],session['symbol'])).fetchone()
            if not snap or desk.now()-snap['time']-60000>90000:raise ValueError('Refresh the completed snapshot before arming')
            auto=config({**payload.get('config',{}),'enabled':True},session,json.loads(snap['body']),desk)
            auto['after']=desk.now()//60000*60000+60000
        elif action in ('pause','cancel'):
            if not old:raise ValueError('This session has no automatic paper configuration')
            auto={**old,'armed':False,'state':'paused','reason':'Paused by human; existing brackets continue'}
        else:raise ValueError('Choose arm, pause or cancel')
        trading_db.execute("UPDATE rider_auto_orders SET status='cancelled' WHERE session=? AND status='pending'",(sid,));trading_db.commit()
        save_auto(db,sid,auto,desk)
        desk.hunts.event(db,sid,'human','auto_control',{'text':'Rider PAPER · '+auto['reason'],'auto':auto})
        return auto


def candidates(bars,session,desk):
    auto=session.get('auto')
    if not auto or not auto['armed']:return []
    out=[];p=auto['policy']
    after=max(auto.get('after',session['started']//60000*60000+60000),session.get('levelsChangedAt',0))
    for level in session['levels']:
        for c in detect(bars,level,p,auto['playbooks'],after):
            if not c['fresh'] or c['stage']!='READY':continue
            if auto['direction']!='both' and auto['direction']!=('long' if c['direction']==1 else 'short'):continue
            if c['direction']<0 and session['provider']!='hyperliquid':continue
            c['target']=auto['targets'].get(level['id']+':'+str(c['direction']))
            c['risk']=crypto_risk.evaluate(p,session['provider'],session['symbol'],'long' if c['direction']==1 else 'short',c['entry'],c['stop'],c['target'])
            out.append(c)
    return sorted(out,key=lambda x:(-(x['risk'].get('rr') or 0),x['attemptId']))[:4]


def net_stats(db,account,policy):
    rows=db.execute('SELECT * FROM quant_lab_sim_positions WHERE account_id=?',(account,)).fetchall()
    fee=float(policy['feeBps'])/10000
    frozen={r['position']:json.loads(r['body'])['auto']['policy']['feeBps']/10000 for r in db.execute('SELECT * FROM rider_auto_trades')}
    realized=sum(float(x['gross_pnl'] or 0)-frozen.get(x['position_id'],fee)*(x['entry_price']+x['exit_price'])*x['quantity'] for x in rows if x['status']=='closed')
    day=datetime.now(ZoneInfo('America/Los_Angeles')).replace(hour=0,minute=0,second=0,microsecond=0).astimezone(timezone.utc).isoformat()
    today=[x for x in rows if (x['entry_recorded_at'] or '')>=day]
    day_net=sum(float(x['gross_pnl'] or 0)-frozen.get(x['position_id'],fee)*(x['entry_price']+x['exit_price'])*x['quantity'] for x in rows if x['status']=='closed' and (x['exit_recorded_at'] or '')>=day)
    return rows,realized,today,day_net


def entry_gate(db,session,auto,c,entry):
    p=auto['policy'];side='long' if c['direction']==1 else 'short'
    risk=crypto_risk.evaluate(p,session['provider'],session['symbol'],side,entry,c['stop'],c['target'])
    if not risk['qualified']:raise ValueError(risk['reason'])
    rows,realized,today,day_net=net_stats(db,session['account'],p)
    account=db.execute('SELECT * FROM chart_sim_accounts WHERE account_id=?',(session['account'],)).fetchone()
    if not account:raise ValueError('Paper account unavailable')
    equity=account['starting_balance']+realized
    if equity<=0:raise ValueError('Paper equity exhausted')
    if any(x['status']=='open' for x in rows):raise ValueError('Existing account position blocks a new entry')
    if len(today)>=auto['maxTrades']:raise ValueError('Daily entry limit reached')
    if day_net<=-account['starting_balance']*p['dailyLossPct']/100:raise ValueError('Daily net loss limit reached')
    fee=p['feeBps']/10000;slip=p['slippageBps']/10000
    exit_stop=c['stop']*(1-c['direction']*slip);exit_target=c['target']*(1-c['direction']*slip)
    per_risk=abs(entry-exit_stop)+fee*(entry+exit_stop)
    per_reward=c['direction']*(exit_target-entry)-fee*(entry+exit_target)
    if per_reward/per_risk < p['minRR']:raise ValueError('Reward/risk after estimated fees and slippage is below minimum')
    qty=min(equity*p['riskPct']/100/per_risk,equity/(entry*(1+fee)))
    if not math.isfinite(qty) or qty<=0:raise ValueError('Invalid paper size')
    return qty


def queue_signal(record,session,trading_db,desk):
    """Consumes only a validated, same-session, same-revision Jev entry answer."""
    schema(trading_db);auto=session.get('auto')
    if not auto or not auto['armed'] or session['ended']:return
    cutoff=record['source']['completedCutoff']
    if record.get('huntSessionId')!=session['id'] or record.get('levelRevision',1)!=session.get('levelRevision',1):return
    if record['source']['provider']!=session['provider'] or record['source']['symbol']!=session['symbol']:return
    if desk.now()>=auto['expiresAt'] or not 0<=desk.now()-cutoff-60000<=45000:return
    if trading_db.execute("SELECT 1 FROM rider_auto_orders WHERE account=? AND status='pending'",(session['account'],)).fetchone():return
    byname={a['name']:a for a in record['answers']}
    for i,c in enumerate(record.get('riderCandidates',[])):
        a=byname.get('rider_entry_'+str(i),{})
        if a.get('choice')!='ENTER' or a.get('confidence',0)<auto['minConfidence']:continue
        probs=a.get('probabilities') or {}
        if set(probs)!= {'ENTER','WAIT','INVALIDATED'} or probs.get('ENTER',0)<max(probs.values()) or probs.get('ENTER',0)<(1+2*auto['minConfidence'])/3-.01:continue
        if c.get('stage')!='READY' or not c.get('fresh') or c['barTime']!=cutoff or not c.get('risk',{}).get('qualified'):continue
        if not any(x['id']==c['level']['id'] for x in session['levels']):continue
        if trading_db.execute('SELECT 1 FROM rider_auto_orders WHERE session=? AND level=?',(session['id'],c['level']['id'])).fetchone():continue
        entry_gate(trading_db,session,auto,c,c['entry'])
        created=desk.now();eligible=(created//60000+1)*60000
        ident='rider-'+desk.digest({'session':session['id'],'attempt':c['attemptId']})[:24]
        body={'candidate':c,'auto':auto,'receipt':record['decisionId'],'decision':record['decisionId']+':entry:'+str(i),'confidence':a['confidence'],'levelRevision':session.get('levelRevision',1),'lastManaged':None}
        trading_db.execute('INSERT INTO rider_auto_orders VALUES(?,?,?,?,?,?,?,?,?,?)',(ident,session['id'],session['account'],session['provider'],session['symbol'],c['level']['id'],created,eligible,'pending',desk.encode(body)))
        trading_db.commit()
        with desk.connection() as ledger:desk.hunts.event(ledger,session['id'],'rider','auto_pending',{'text':f"PAPER limit queued · {c['playbook']} · {c['entry']} · first eligible minute only; limit or better, otherwise cancel without chasing",'order':ident,'candidate':c},ident+':pending')
        return


def advance(session,bars,trading_db,desk,server):
    """Atomic fill + order transition. Same-bar OHLC brackets resolve stop first."""
    schema(trading_db)
    for row in trading_db.execute("SELECT * FROM rider_auto_orders WHERE session=? AND status='pending'",(session['id'],)).fetchall():
        body=json.loads(row['body']);c=body['candidate'];auto=session.get('auto') or {}
        target=next((b for b in bars if b['time']>=row['eligible']),None)
        if not target:continue
        try:
            if session['ended'] or not auto.get('armed') or desk.now()>=auto['expiresAt']:raise ValueError('Session disarmed or expired')
            if body['levelRevision']!=session.get('levelRevision',1):raise ValueError('Hunt selection changed')
            if target['time']!=row['eligible'] or desk.now()-target['time']-60000>90000:raise ValueError('Missing or stale first eligible fill bar')
            if abs(target['open']-c['entry'])>c['atr']*auto['maxEntryATR']:raise ValueError('Entry drift exceeds approved range')
            limit=float(c['entry'])
            touched=target['low']<=limit if c['direction']==1 else target['high']>=limit
            if not touched:raise ValueError('Limit was not touched on the first eligible bar; canceled without chasing')
            # A resting limit may improve at an opening price through the level; it never pays beyond its limit.
            entry=min(limit,float(target['open'])) if c['direction']==1 else max(limit,float(target['open']))
            qty=entry_gate(trading_db,session,auto,c,entry)
            pos=server.open_quant_lab_sim_position(trading_db,{'account_id':session['account'],'provider':session['provider'],'symbol':session['symbol'],'timeframe':'1m',
              'side':'long' if c['direction']==1 else 'short','quantity':qty,'entry_price':entry,'bar_time':target['time']//1000,
              'stop_price':c['stop'],'target_price':c['target'],'rider_id':row['id']},rider_fill=True)
            trading_db.execute('INSERT INTO rider_auto_trades VALUES(?,?,?,?)',(pos['position_id'],session['id'],row['id'],desk.encode(body)))
            trading_db.execute("UPDATE rider_auto_orders SET status='filled' WHERE id=?",(row['id'],))
            trading_db.commit()
            with desk.connection() as ledger:
                desk.hunts.event(ledger,session['id'],'rider','auto_fill',{'text':f"PAPER filled · {pos['side']} {qty:.8f} at {entry} · fixed stop {c['stop']} / target {c['target']}",'position':pos['position_id'],'order':row['id']},row['id']+':filled')
                ledger.execute('INSERT OR IGNORE INTO trade_links VALUES(?,?,?)',(pos['position_id'],body['decision'],desk.now()))
        except ValueError as exc:
            trading_db.rollback();trading_db.execute("UPDATE rider_auto_orders SET status='cancelled' WHERE id=?",(row['id'],));trading_db.commit()
            with desk.connection() as ledger:desk.hunts.event(ledger,session['id'],'rider','auto_cancel',{'text':'PAPER entry cancelled · '+str(exc),'order':row['id']},row['id']+':cancelled')
    manage(session,bars,trading_db,desk,server)


def manage(session,bars,trading_db,desk,server):
    for row in trading_db.execute("SELECT p.*,t.body AS auto_body FROM quant_lab_sim_positions p JOIN rider_auto_trades t ON t.position=p.position_id WHERE t.session=? AND p.status='open'",(session['id'],)).fetchall():
        body=json.loads(row['auto_body']);auto=body['auto'];p=auto['policy'];d=1 if row['side']=='long' else -1
        for b in bars:
            t=b['time']//1000
            if t<row['entry_bar_time'] or t<row['checked_through_bar_time'] or t==row['checked_through_bar_time'] and t!=row['entry_bar_time']:continue
            stop=row['stop_price'];target=row['target_price'];reason=None;price=None
            stop_gap=d*(b['open']-stop)<=0;target_gap=d*(b['open']-target)>=0
            stop_hit=(b['low']<=stop if d==1 else b['high']>=stop)
            target_hit=(b['high']>=target if d==1 else b['low']<=target)
            if stop_gap:reason,price='rider_stop_gap',b['open']
            elif target_gap:reason,price='rider_target_gap',b['open']
            elif stop_hit:reason,price=('rider_stop_first_ambiguous' if target_hit else 'rider_stop'),stop
            elif target_hit:reason,price='rider_target',target
            elif t-row['entry_bar_time']>=auto['maxHoldBars']*60:reason,price='rider_time_exit',b['close']
            elif b['time']+60000>=auto['expiresAt']:reason,price='rider_session_exit',b['close']
            if reason:
                price*=1-d*p['slippageBps']/10000
                pos=server.close_quant_lab_sim_position(trading_db,{'position_id':row['position_id'],'exit_price':price,'bar_time':t},allow_same_bar=True)
                trading_db.execute('UPDATE quant_lab_sim_positions SET close_reason=?,exit_source=? WHERE position_id=?',(reason,'Rider · forward OHLC PAPER · adverse slippage',row['position_id']))
                fees=(row['entry_price']+price)*row['quantity']*p['feeBps']/10000
                body.update(estimatedFees=fees,netPnl=pos['gross_pnl']-fees,exitReason=reason)
                trading_db.execute('UPDATE rider_auto_trades SET body=? WHERE position=?',(desk.encode(body),row['position_id']));trading_db.commit()
                with desk.connection() as ledger:desk.hunts.event(ledger,session['id'],'rider','auto_exit',{'text':f"PAPER exit · {reason} · net {pos['gross_pnl']-fees:.4f} after estimated fees",'position':row['position_id'],'netPnl':pos['gross_pnl']-fees},row['position_id']+':exit')
                break
            trading_db.execute('UPDATE quant_lab_sim_positions SET checked_through_bar_time=? WHERE position_id=?',(t,row['position_id']));trading_db.commit()


def snapshot(session):
    node=os.environ.get('RIDER_NODE') or shutil.which('node') or next((str(p) for p in (Path.home()/'.local/bin/node',Path('/opt/homebrew/bin/node'),Path('/usr/local/bin/node')) if p.is_file()),None)
    if not node:raise RuntimeError('Node runtime unavailable for background chart calculations')
    result=subprocess.run([node,str(Path(__file__).with_name('rider_snapshot.mjs'))],input=json.dumps({'provider':session['provider'],'symbol':session['symbol'],'settings':session['indicatorSettings']}),text=True,capture_output=True,timeout=55)
    if result.returncode:raise RuntimeError('Background public source/indicator read failed: '+result.stderr[-250:])
    return json.loads(result.stdout)


def state(db,session):
    schema(db)
    if not session:return {'worker':dict(STATUS),'orders':[],'trades':[]}
    orders=[{**dict(r),'body':json.loads(r['body'])} for r in db.execute('SELECT * FROM rider_auto_orders WHERE session=? ORDER BY created',(session['id'],))]
    trades=[{**dict(r),'body':json.loads(r['body'])} for r in db.execute('SELECT * FROM rider_auto_trades WHERE session=?',(session['id'],))]
    for t in trades:
        pos=db.execute('SELECT * FROM quant_lab_sim_positions WHERE position_id=?',(t['position'],)).fetchone()
        if pos and pos['status']=='closed':
            fees=(pos['entry_price']+pos['exit_price'])*pos['quantity']*t['body']['auto']['policy']['feeBps']/10000
            t['body'].update(estimatedFees=fees,netPnl=pos['gross_pnl']-fees)
    return {'worker':dict(STATUS),'config':session.get('auto'),'orders':orders,'trades':trades,'netPnl':sum(t['body'].get('netPnl',0) for t in trades)}


def start_worker(server,desk,db_path):
    global _thread
    if _thread and _thread.is_alive():return
    with desk.LOCK,desk.connection() as db,server.connect(db_path) as trading_db:
        schema(trading_db)
        trading_db.execute("UPDATE rider_auto_orders SET status='cancelled' WHERE status='pending'")
        for row in db.execute('SELECT * FROM hunt_sessions'):
            s=desk.hunts.unpack(row);auto=s.get('auto')
            if auto and auto.get('armed'):
                save_auto(db,s['id'],{**auto,'armed':False,'state':'paused','reason':'Server restarted; review and re-arm to allow new entries'},desk)
                desk.hunts.event(db,s['id'],'rider','auto_restart',{'text':'Rider PAPER restarted · entries disarmed; existing brackets continue'})
    def run():
        previous=time.monotonic()
        while True:
            try:
                STATUS.update(heartbeat=desk.now(),state='idle',error=None)
                with desk.connection() as db,server.connect(db_path) as trading_db:
                    schema(trading_db)
                    owned={r[0] for r in trading_db.execute("SELECT DISTINCT t.session FROM rider_auto_trades t JOIN quant_lab_sim_positions p ON p.position_id=t.position WHERE p.status='open'")}
                    sessions=[desk.hunts.unpack(r) for r in db.execute('SELECT * FROM hunt_sessions') if r['id'] in owned or not r['ended'] and json.loads(r['body']).get('auto')]
                gap=time.monotonic()-previous;previous=time.monotonic()
                for s in sessions:
                    auto=s.get('auto') or {};expired=desk.now()>=auto.get('expiresAt',0)
                    if auto.get('armed') and (gap>90 or expired):
                        with desk.LOCK,desk.connection() as db,server.connect(db_path) as trading_db:
                            schema(trading_db);auto={**auto,'armed':False,'state':'paused','reason':'Session expired' if expired else 'Monitoring interruption; re-arm required'}
                            save_auto(db,s['id'],auto,desk);trading_db.execute("UPDATE rider_auto_orders SET status='cancelled' WHERE session=? AND status='pending'",(s['id'],))
                            desk.hunts.event(db,s['id'],'rider','auto_pause',{'text':'Rider PAPER · '+auto['reason']})
                        s['auto']=auto
                    if not auto.get('armed') and s['id'] not in owned:continue
                    data=snapshot(s);desk.validate_bars(data)
                    cutoff=data['source']['completedCutoff'];STATUS.update(state='monitoring',lastCutoff=cutoff)
                    with desk.LOCK,desk.connection() as db,server.connect(db_path) as trading_db:
                        current=desk.hunts.unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(s['id'],)).fetchone())
                        advance(current,data['bars'],trading_db,desk,server)
                    if not current['ended'] and (current.get('auto') or {}).get('armed'):
                        desk.save_context({'source':data['source'],'series':data['series']});desk.observe(data)
                        key=f"{s['provider']}:{s['symbol']}:{cutoff}"
                        with desk.connection() as db:prior=db.execute('SELECT state FROM api_attempts WHERE key=?',(key,)).fetchone()
                        if not prior and cutoff>current['startCutoff'] and cutoff+60000>max(current['started'],current.get('levelsChangedAt',0)):
                            desk.model_read({'evidence':data['evidence'],'worker':True},playbook_bars=data['bars'])
                        with desk.LOCK,desk.connection() as db,server.connect(db_path) as trading_db:
                            current=desk.hunts.unpack(db.execute('SELECT * FROM hunt_sessions WHERE id=?',(s['id'],)).fetchone())
                            receipt=db.execute("SELECT body FROM api_attempts WHERE key=? AND state='completed'",(key,)).fetchone()
                            if receipt:
                                queue_signal(json.loads(receipt['body']),current,trading_db,desk)
                                if current['auto'].get('state')=='waiting_jev':
                                    recovered={**current['auto'],'state':'armed','reason':'Fresh Jev read validated; paper hunt resumed'}
                                    save_auto(db,current['id'],recovered,desk)
                                    desk.hunts.event(db,current['id'],'rider','auto_recovered',{'text':'Rider PAPER · fresh Jev read validated; hunt resumed'})
                    desk.hunts.sync_journal({'session':s['id']},desk)
            except Exception as exc:
                STATUS.update(state='blocked',error=str(exc)[:300])
                if 's' in locals() and (s.get('auto') or {}).get('armed'):
                    with desk.LOCK,desk.connection() as db,server.connect(db_path) as trading_db:
                        recoverable=bool(getattr(exc,'retryable',False))
                        auto={**s['auto'],'armed':recoverable,'state':'waiting_jev' if recoverable else 'paused',
                              'reason':'Jev unavailable for this minute; waiting for a fresh completed read' if recoverable else 'Worker or Jev failure; review and re-arm'}
                        save_auto(db,s['id'],auto,desk);schema(trading_db)
                        trading_db.execute("UPDATE rider_auto_orders SET status='cancelled' WHERE session=? AND status='pending'",(s['id'],))
                        desk.hunts.event(db,s['id'],'rider','auto_error',{'text':('Rider PAPER waiting for fresh Jev evidence · ' if recoverable else 'Rider PAPER paused · ')+str(exc)[:250],'retryable':recoverable})
            time.sleep(10)
    _thread=threading.Thread(target=run,name='rider-auto-paper',daemon=True);_thread.start()

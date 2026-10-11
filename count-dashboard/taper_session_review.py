"""Clock-out scorecards, cumulative daily learning and future shadow proposals.

No parameter is silently adopted. Only predictions recorded before their future
outcome enter measurement. Profit, directional accuracy and shadow subsets are
separate measurements, with pending/gapped evidence retained.
"""
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ZONE=ZoneInfo('America/Los_Angeles')

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS taper_session_reviews(session TEXT PRIMARY KEY,created INTEGER,updated INTEGER,revision INTEGER,hash TEXT,body TEXT);
    CREATE TABLE IF NOT EXISTS taper_review_versions(id TEXT PRIMARY KEY,session TEXT,revision INTEGER,created INTEGER,body TEXT);
    CREATE TABLE IF NOT EXISTS taper_daily_reviews(id TEXT PRIMARY KEY,account TEXT,day TEXT,revision INTEGER,hash TEXT,body TEXT);
    CREATE TABLE IF NOT EXISTS taper_learning_proposals(id TEXT PRIMARY KEY,account TEXT,day TEXT,created INTEGER,status TEXT,body TEXT,UNIQUE(account,day));
    """)

def stamp(value):
    try:return int(datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
    except (ValueError,TypeError,AttributeError):return None

def scores(session,positions,now):
    owned=[p for p in positions if p['account_id']==session['account'] and p['provider']==session['provider'] and p['symbol']==session['symbol'] and stamp(p.get('entry_recorded_at')) is not None and session['started']<=stamp(p['entry_recorded_at']) and (session['ended'] is None or stamp(p['entry_recorded_at'])<=session['ended'])]
    closed=[p for p in owned if p['status']=='closed'];opened=[p for p in owned if p['status']=='open']
    gross=sum(float(p.get('gross_pnl') or 0) for p in closed);wins=sum((p.get('gross_pnl') or 0)>0 for p in closed);losses=sum((p.get('gross_pnl') or 0)<0 for p in closed)
    profit=sum(max(0,p.get('gross_pnl') or 0) for p in closed);loss=-sum(min(0,p.get('gross_pnl') or 0) for p in closed)
    capital=session.get('openingRealizedBalance',session['initialBalance'])
    return {'id':session['id'],'name':session['name'],'account':session['account'],'month':session.get('accountCycle'),'provider':session['provider'],'symbol':session['symbol'],'clockIn':session['started'],'clockOut':session['ended'],'durationMs':max(0,(session['ended'] or now)-session['started']),'status':'clocked_out' if session['ended'] else 'clocked_in','openingRealizedBalance':capital,'grossPnl':gross,'returnPct':gross/capital*100 if capital>0 else None,'closedTrades':len(closed),'openTrades':len(opened),'wins':wins,'losses':losses,'winRate':wins/len(closed) if closed else None,'profitFactor':profit/loss if loss else None,'positionIds':[p['position_id'] for p in owned],'apiUsd':sum(p.get('decisionApiUsd') or 0 for p in owned),'estimatedNetPnl':sum(p.get('estimatedNetPnl') or 0 for p in closed),'basis':'Realized gross; open positions stay pending; net and API costs are estimates'}

def outcome(db,c,now):
    horizon=int(c['horizonBars']);end=c['barTime']+horizon*60000
    if c.get('kind')!='forward_rule' or not c.get('direction') or c.get('observedAt',now)>=end+60000:return {'eligible':False,'state':'excluded'}
    if now<end+60000:return {'eligible':False,'state':'pending'}
    rows=db.execute('SELECT time,body FROM bars WHERE provider=? AND symbol=? AND time>? AND time<=? ORDER BY time',(c['provider'],c['symbol'],c['barTime'],end)).fetchall()
    if len(rows)!=horizon or any(r['time']!=c['barTime']+(i+1)*60000 for i,r in enumerate(rows)):return {'eligible':False,'state':'missing_bars'}
    move=json.loads(rows[-1]['body'])['close']-c['forecastPrice']
    return {'eligible':True,'state':'resolved','correct':c['direction']*move>0,'signedMove':c['direction']*move,'endTime':end}

def predictions(db,sid,now):
    chosen=[];checks=0;blocked=0
    for r in db.execute("SELECT body FROM hunt_events WHERE session=? AND kind='bar' ORDER BY created",(sid,)):
        event=json.loads(r[0]);candidates=event.get('candidates',[]);checks+=len(candidates);blocked+=sum(bool(c.get('risk') and not c['risk']['qualified']) for c in candidates)
        c=next((c for c in candidates if c['id']==event.get('best')),None)
        if c:chosen.append({**c,'measurement':outcome(db,c,now)})
    # Only one chosen prediction per bar; related horizons can still overlap.
    eligible=[c for c in chosen if c['measurement']['eligible']];groups={}
    for c in eligible:
        key=c['symbol']+' · '+c['bias']+' · '+(c.get('risk') or {}).get('preference','unrated');g=groups.setdefault(key,{'samples':0,'correct':0});g['samples']+=1;g['correct']+=bool(c['measurement']['correct'])
    for g in groups.values():g['accuracy']=g['correct']/g['samples']
    correct=sum(bool(c['measurement']['correct']) for c in eligible)
    return {'checks':checks,'riskBlockedChecks':blocked,'forecastCount':len(chosen),'samples':len(eligible),'correct':correct,'accuracy':correct/len(eligible) if eligible else None,'pending':sum(c['measurement']['state']=='pending' for c in chosen),'missing':sum(c['measurement']['state']=='missing_bars' for c in chosen),'groups':groups,'chosen':chosen,'measurement':'Chosen forward fixed-horizon direction, not trade profitability; overlapping horizons are not independent samples'}

def api_summary(db,sid):
    """Session-owned receipts only; failed unknown billing stays separate."""
    # Ended-session API totals are immutable until another accounting/bar event.
    # Reuse the saved score only when its timestamp covers every relevant event.
    cached=db.execute('SELECT updated,body FROM taper_session_reviews WHERE session=?',(sid,)).fetchone()
    latest=db.execute("SELECT MAX(created) FROM hunt_events WHERE session=? AND kind IN ('api','api_request','api_failed','bar')",(sid,)).fetchone()[0]
    if cached and cached['updated']>=(latest or 0):
        score=json.loads(cached['body'])['score']
        fields=[key for key in score if key.startswith('api') or key in ('completedBars','levelChecks','lastReadClose')]
        if 'completedBars' in fields and 'apiFailures' in fields:return {key:score[key] for key in fields}
    # Read only receipt accounting fields; full tape evidence stays in the ledger.
    events=[{**dict(r),'body':json.loads(r['body'])} for r in db.execute("SELECT kind,json_object('record',json_object('source',json_extract(body,'$.record.source'),'usage',json_extract(body,'$.record.usage'),'apiRequests',json_extract(body,'$.record.apiRequests'),'estimatedUsd',json_extract(body,'$.record.estimatedUsd')),'source',json_extract(body,'$.source'),'barTime',json_extract(body,'$.barTime'),'failure',json_extract(body,'$.failure')) AS body FROM hunt_events WHERE session=? AND kind IN ('api','api_request','api_failed')",(sid,))]
    receipts=[e['body'].get('record',{}) for e in events if e['kind']=='api']
    requests=[e for e in events if e['kind']=='api_request']
    failed=[e for e in events if e['kind']=='api_failed']
    settled={r.get('source',{}).get('completedCutoff') for r in receipts}|{e['body'].get('barTime') for e in failed}
    pending=[e for e in requests if e['body'].get('barTime') not in settled]
    failures=[e['body'].get('failure',{}) for e in failed]
    known=receipts+[r for r in failures if not r.get('costUnknown') or r.get('apiRequests') is not None]
    input_tokens=sum(int(r.get('usage',{}).get('input_tokens',0)) for r in known)
    output_tokens=sum(int(r.get('usage',{}).get('output_tokens',0)) for r in known)
    reserved=0.0
    for e in pending:
        source=e['body'].get('source',{});key=f"{source.get('provider')}:{source.get('symbol')}:{e['body'].get('barTime')}"
        attempt=db.execute('SELECT body FROM api_attempts WHERE key=?',(key,)).fetchone()
        if attempt:reserved+=float(json.loads(attempt[0]).get('estimatedUsd',0))
    reserved+=sum(float(r.get('costReservedUsd',r.get('estimatedUsd',0))) for r in failures if r.get('costUnknown'))
    bar_count,level_checks=db.execute("SELECT COUNT(*),COALESCE(SUM(json_array_length(body,'$.candidates')),0) FROM hunt_events WHERE session=? AND kind='bar'",(sid,)).fetchone()
    return {'apiReads':len(receipts),'apiAttempts':max(len(requests),len(receipts)+len(failed)),
            'apiProviderRequests':sum(int(r.get('apiRequests') or 1) for r in receipts+failures),
            'apiPending':len(pending),'apiFailures':len(failed),'apiCostUnknown':sum(bool(r.get('costUnknown')) for r in failures),
            'apiInputTokens':input_tokens,'apiOutputTokens':output_tokens,'apiTotalTokens':input_tokens+output_tokens,
            'apiTokens':input_tokens,'apiUsd':sum(float(r.get('estimatedUsd',0)) for r in known),'apiReservedUsd':reserved,
            'completedBars':bar_count,'levelChecks':level_checks,
            'lastReadClose':max((r.get('source',{}).get('completedCutoff',0)+60000 for r in receipts),default=None)}


def refresh(db,positions,desk,account):
    schema(db);now=desk.now();sessions=[desk.hunts.unpack(r) for r in db.execute('SELECT * FROM hunt_sessions WHERE account=? ORDER BY started',(account,))]
    cards=[];reports=[];by_day={}
    for s in sessions:
        score=scores(s,positions,now);score.update(api_summary(db,s['id']));cards.append(score)
        if not s['ended']:continue
        cached=db.execute('SELECT body FROM taper_session_reviews WHERE session=?',(s['id'],)).fetchone();cached=json.loads(cached[0]) if cached else None
        if cached and not cached['predictions']['pending'] and not cached['predictions']['missing']:evidence=cached['predictions']
        else:
            evidence=predictions(db,s['id'],now);evidence.pop('chosen')
        day=datetime.fromtimestamp(s['ended']/1000,ZONE).date().isoformat()
        body={'session':s['id'],'day':day,'score':score,'predictions':evidence,'policy':s['policy'],'clockOut':s['ended'],'status':'pending_outcomes' if evidence['pending'] or score['openTrades'] else 'incomplete_evidence' if evidence['missing'] else 'reviewed','steps':['Freeze clock-out session receipt','Score recorded trades separately from predictions','Resolve gap-free forward outcomes','Add pattern groups to cumulative daily evidence','Create a constrained candidate when enough outcomes exist','Measure that candidate on later sessions before adoption']}
        hashed=desk.digest(body);old=db.execute('SELECT * FROM taper_session_reviews WHERE session=?',(s['id'],)).fetchone()
        revision=old['revision']+(old['hash']!=hashed) if old else 1
        if not old or old['hash']!=hashed:
            db.execute('INSERT OR REPLACE INTO taper_session_reviews VALUES(?,?,?,?,?,?)',(s['id'],old['created'] if old else now,now,revision,hashed,desk.encode(body)))
            db.execute('INSERT OR IGNORE INTO taper_review_versions VALUES(?,?,?,?,?)',(s['id']+':'+str(revision),s['id'],revision,now,desk.encode(body)))
            desk.hunts.event(db,s['id'],'taper','learning',{'text':f"Clock-out review v{revision}: {score['closedTrades']} closed / {score['openTrades']} open trades, gross P&L {score['grossPnl']:.2f}; {evidence['samples']} resolved forward predictions, {evidence['pending']} pending. Daily learning ledger refreshed.",'review':body},s['id']+':review:'+str(revision))
        report={**body,'revision':revision,'updatedAt':now if not old or old['hash']!=hashed else old['updated']};reports.append(report);by_day.setdefault(day,[]).append(report)
    memory=[json.loads(r[0]) for r in db.execute('SELECT body FROM taper_session_reviews') if json.loads(r[0])['score']['account']!=account]
    cumulative=0;correct=0
    for day,items in sorted(by_day.items()):
        samples=sum(r['predictions']['samples'] for r in items);daily_correct=sum(r['predictions']['correct'] for r in items);cumulative+=samples;correct+=daily_correct
        historical=[r for r in memory if r['day']<=day];past_samples=sum(r['predictions']['samples'] for r in historical);past_correct=sum(r['predictions']['correct'] for r in historical)
        prior=db.execute('SELECT id FROM taper_daily_reviews WHERE day<? ORDER BY day DESC LIMIT 1',(day,)).fetchone();ident='daily:'+account+':'+day
        body={'id':ident,'day':day,'timezone':str(ZONE),'sessions':[r['session'] for r in items],'sessionCount':len(items),'grossPnl':sum(r['score']['grossPnl'] for r in items),'closedTrades':sum(r['score']['closedTrades'] for r in items),'samples':samples,'correct':daily_correct,'accuracy':daily_correct/samples if samples else None,'cumulativeSamples':cumulative+past_samples,'cumulativeAccuracy':(correct+past_correct)/(cumulative+past_samples) if cumulative+past_samples else None,'historicalCycleSamples':past_samples,'previousReview':prior['id'] if prior else None,'minimumSamples':30,'candidateReady':cumulative+past_samples>=30,'status':'candidate_review' if cumulative+past_samples>=30 else 'collecting_evidence','learningMode':'Recursive evidence accumulation and future shadow evaluation; no model weight training or automatic policy adoption'}
        hashed=desk.digest(body);old=db.execute('SELECT revision,hash FROM taper_daily_reviews WHERE id=?',(ident,)).fetchone();revision=old['revision']+(old['hash']!=hashed) if old else 1
        if not old or old['hash']!=hashed:db.execute('INSERT OR REPLACE INTO taper_daily_reviews VALUES(?,?,?,?,?,?)',(ident,account,day,revision,hashed,desk.encode(body)))
        if cumulative+past_samples>=30 and not db.execute('SELECT 1 FROM taper_learning_proposals WHERE account=? AND day=?',(account,day)).fetchone():
            baseline=items[-1]['policy'];candidate={**baseline};candidate['confirmBars']=min(10,baseline['confirmBars']+1)
            groups={}
            for report in [*historical,*reports]:
                if report['day']>day:continue
                for key,g in report['predictions']['groups'].items():
                    bucket=groups.setdefault(key,{'samples':0,'correct':0});bucket['samples']+=g['samples'];bucket['correct']+=g['correct']
            qualified={key:g for key,g in groups.items() if g['samples']>=10};weak=min(qualified,key=lambda key:qualified[key]['correct']/qualified[key]['samples'],default=None)
            proposal={'id':'shadow:'+account+':'+day,'baselinePolicy':baseline['id'],'candidatePolicy':candidate,'sourceReview':ident,'createdAt':now,'rule':'Require one additional confirmation close','reason':('Review '+weak+' confirmation sensitivity' if weak else 'Review overall confirmation sensitivity')+'; this is a research proposal, not measured improvement','weakPattern':weak,'trainingGroups':groups,'holdout':'Only later forward predictions, after this proposal was frozen; shadow subset versus baseline, not an independent policy replay','canAdopt':False}
            if candidate['confirmBars']!=baseline['confirmBars']:db.execute('INSERT INTO taper_learning_proposals VALUES(?,?,?,?,?,?)',(proposal['id'],account,day,now,'shadow',desk.encode(proposal)))
    proposals=[]
    for row in db.execute('SELECT * FROM taper_learning_proposals WHERE account=? ORDER BY created DESC',(account,)):
        p=json.loads(row['body']);future=[]
        for s in sessions:
            if s['started']<=row['created'] or s['policy']['id']!=p['baselinePolicy']:continue
            future.extend(c for c in predictions(db,s['id'],now)['chosen'] if c['measurement']['eligible'] and c['observedAt']>row['created'])
        selected=[c for c in future if (c.get('confirmation') or {}).get('bars',0)>=p['candidatePolicy']['confirmBars']]
        p['shadow']={'baselineSamples':len(future),'baselineAccuracy':sum(c['measurement']['correct'] for c in future)/len(future) if future else None,'candidateSamples':len(selected),'candidateAccuracy':sum(c['measurement']['correct'] for c in selected)/len(selected) if selected else None,'rejectedByCandidate':len(future)-len(selected),'status':'ready_for_human_review' if len(selected)>=30 else 'collecting_future_holdout','measurement':'Observational forward subset; direction accuracy is not P&L or proof of improvement'};p['status']=row['status'];proposals.append(p)
        db.execute('UPDATE taper_learning_proposals SET body=? WHERE id=?',(desk.encode(p),row['id']))
    daily=[{**json.loads(r['body']),'revision':r['revision']} for r in db.execute('SELECT * FROM taper_daily_reviews WHERE account=? ORDER BY day DESC',(account,))]
    return {'sessionScores':cards[::-1],'clockOutReviews':reports[::-1],'dailySessionReviews':daily,'learningProposals':proposals,'clockRequired':True}



def snapshot(db,positions,desk,account):
    """Fast polling view; historical outcome reviews are explicitly saved snapshots."""
    sessions=[desk.hunts.unpack(row) for row in db.execute('SELECT * FROM hunt_sessions WHERE account=? ORDER BY started',(account,))]
    saved={row['session']:{**json.loads(row['body']),'revision':row['revision'],'updatedAt':row['updated']} for row in db.execute('SELECT * FROM taper_session_reviews')}
    cards=[];reports=[]
    for session in sessions:
        report=saved.get(session['id']);score=scores(session,positions,desk.now())
        if session['ended'] and report:
            prior=report['score']
            score.update({key:value for key,value in prior.items() if key.startswith('api') or key in ('completedBars','levelChecks','lastReadClose')})
            score['reviewUpdatedAt']=report['updatedAt']
            reports.append({**report,'score':score,'reviewFreshness':'saved'})
        else:
            score.update(api_summary(db,session['id']))
        cards.append(score)
    daily=[{**json.loads(row['body']),'revision':row['revision']} for row in db.execute('SELECT * FROM taper_daily_reviews WHERE account=? ORDER BY day DESC',(account,))]
    proposals=[]
    for row in db.execute('SELECT * FROM taper_learning_proposals WHERE account=? ORDER BY created DESC',(account,)):
        proposal=json.loads(row['body']);proposal['status']=row['status']
        proposal.setdefault('shadow',{'baselineSamples':'unavailable','baselineAccuracy':None,'candidateSamples':'unavailable','candidateAccuracy':None,'status':'Refresh reviews to measure current holdout'})
        proposals.append(proposal)
    return {'sessionScores':cards[::-1],'clockOutReviews':reports[::-1],'dailySessionReviews':daily,
            'learningProposals':proposals,'clockRequired':True,'reviewFreshness':'saved; refresh reviews for new historical outcomes'}

def decision_context(db, completed_cutoff):
    """Only review versions published before this completed minute are eligible."""
    boundary = completed_cutoff + 60000
    rows = db.execute('SELECT session,revision,created,body FROM taper_review_versions WHERE created<=? ORDER BY created DESC LIMIT 30', (boundary,)).fetchall()
    seen = set(); reports = []
    for row in rows:
        if row['session'] in seen: continue
        seen.add(row['session']); body = json.loads(row['body']); stats = body['predictions']
        reports.append({'session':row['session'], 'revision':row['revision'], 'publishedAt':row['created'],
                        'samples':stats['samples'], 'correct':stats['correct'], 'accuracy':stats['accuracy'],
                        'pending':stats['pending'], 'missing':stats['missing'],
                        'measurement':stats['measurement']})
        if len(reports) == 3: break
    return {'reviews':reports, 'minimumSamples':30,
            'authority':'Historical observational context only. Current completed tape and hard risk gates govern; no automatic policy adoption.'}

// Reproducible, local-only audit of the immutable research archive. No model calls.
export const EVIDENCE_VERSION='swing-outcomes.2';
export const OUTCOME_RULES=Object.freeze({
  version:EVIDENCE_VERSION,
  swing:'A→B is fixed only after a later opposite pivot C is recognized. The latest leg is unfinished.',
  forward:'The entire A→B leg must originate after the first live snapshot cutoff. Warmup and boundary legs do not advance milestones.',
  setup:'Use the tracker READY plan as recorded, with its original target and initial stop. No new entries are inferred.',
  entry:'Next eligible full 1m open after actual observation; apply the frozen gap, risk and room checks.',
  exit:'Fixed bracket, no break-even amendments. Stop gaps use the adverse open; target gaps receive only the target. Both touched in one bar is ambiguous unless the open settles which barrier came first.',
  horizon:'Frozen plan_bars completed candles; otherwise exit at the final candle close. Gaps, revisions and ended runs with no exit remain unresolved.',
  comparison:'First entered plan per A/B opportunity in chronological order. Other attempts remain visible but do not multiply the sample count.',
  costs:'Optional user-specified round-trip basis points on entry notional. Scenario only; not verified venue costs.',
});
const json=v=>typeof v==='string'?JSON.parse(v):v;
const copy=v=>JSON.parse(JSON.stringify(v));
export function canonical(v){return JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);}
// Display checksum, not a security hash. Full descriptors are retained and compared.
function checksum(s){let h=14695981039346656037n;for(const c of s)h=BigInt.asUintN(64,(h^BigInt(c.charCodeAt(0)))*1099511628211n);return h.toString(16).padStart(16,'0');}
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const minute=60000;
const terminal=new Set(['TARGET_FIRST','STOP_FIRST','TIME_EXIT']);
const priceBar=b=>b&&Number.isInteger(b.time)&&b.time%minute===0&&['open','high','low','close'].every(k=>finite(b[k])&&b[k]>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close);

function modelAtEntry(predictions,entryAt,born){
  const rows=predictions.filter(r=>r.at>=born&&r.at<entryAt&&r.response?.status==='AVAILABLE'&&
    finite(r.response.received_at)&&r.response.received_at<=entryAt&&entryAt-r.at<=75000&&r.response.answers?.directional_lean);
  rows.sort((a,b)=>b.at-a.at);
  const r=rows[0];return r?{prediction_id:r.id,observed_at:r.at,received_at:r.response.received_at,
    model:r.response.model,prompt:r.response.prompt,lean:r.response.answers.directional_lean.choice,
    probabilities:copy(r.response.answers.directional_lean.probabilities),pattern:r.response.answers.pattern?.choice||'no_match'}:null;
}

export function resolveFrozenPlan(plan,bars,config,{endedAt=null,costBps=null,predictions=[]}={}){
  const p=copy(plan),known=Math.max(p.signal_at||0,p.observed_at||0),eligible=p.eligible_open;
  const result={status:'WAITING_ENTRY',entry:null,entry_at:null,exit:null,exit_at:null,gross_r:null,net_r:null,model_at_entry:null};
  if(![1,-1].includes(p.side)||!finite(known)||!Number.isInteger(eligible)||eligible%minute||eligible<Math.ceil(known/minute)*minute||
     ![p.reference,p.initial_stop,p.target,p.quantity,p.reserved_risk].every(finite)||p.quantity<=0||!finite(config.tick)||config.tick<=0){
    return {...result,status:'UNRESOLVED',reason:'INVALID_FROZEN_PLAN'};
  }
  if([p.reference,p.initial_stop,p.target].some(v=>v<=0)||[p.a?.known,p.b?.known,p.target_known,p.reference_known].some(t=>t!=null&&(!finite(t)||t>known))){
    return {...result,status:'UNRESOLVED',reason:'REFERENCE_NOT_KNOWN_AT_SIGNAL'};
  }
  const available=bars.filter(b=>b.observed_at>=known&&(!endedAt||b.observed_at<=endedAt)&&b.time>=eligible).sort((a,b)=>a.time-b.time);
  const first=available[0];
  if(!first)return {...result,...(endedAt?{status:'UNRESOLVED',reason:'RUN_ENDED_BEFORE_ENTRY'}:{reason:'AWAIT_ELIGIBLE_BAR'})};
  if(first.time!==eligible||first.conflict)return {...result,status:'UNRESOLVED',reason:first.conflict?'CLOSED_BAR_CONFLICT':'MISSING_ENTRY_BAR'};
  if(Math.abs(first.open-p.reference)>(config.gap_ticks??3)*config.tick+1e-9)return {...result,status:'MISSED',reason:'OPEN_GAP'};
  const risk=p.side*(first.open-p.initial_stop),room=p.side*(p.target-first.open);
  if(risk<=0||room/risk<(config.min_room_r??1)||risk*p.quantity>p.reserved_risk+1e-9)return {...result,status:'MISSED',reason:'OPEN_RISK_OR_ROOM'};
  Object.assign(result,{status:'OPEN',entry:first.open,entry_at:eligible,initial_risk:risk,model_at_entry:modelAtEntry(predictions,eligible,p.born||known)});
  const end=(status,b,price,reason)=>({...result,status,reason,exit:price,exit_at:b.time+minute,resolved_at:b.observed_at,
    gross_r:price==null?null:p.side*(price-first.open)/risk,
    net_r:price==null||costBps==null?null:(p.side*(price-first.open)-first.open*costBps/10000)/risk});
  const horizon=config.plan_bars??120;
  for(let i=0;i<available.length&&i<horizon;i++){
    const b=available[i];
    if(b.time!==eligible+i*minute||b.conflict)return {...result,status:'UNRESOLVED',reason:b.conflict?'CLOSED_BAR_CONFLICT':'MISSING_OUTCOME_BAR'};
    const stop=p.side===1?b.low<=p.initial_stop:b.high>=p.initial_stop;
    const target=p.side===1?b.high>=p.target:b.low<=p.target;
    // At the bar open, order is known even when its later range crosses both.
    if(p.side*(b.open-p.initial_stop)<=0)return end('STOP_FIRST',b,b.open,'STOP_GAP');
    if(p.side*(b.open-p.target)>=0)return end('TARGET_FIRST',b,p.target,'TARGET_AT_OPEN');
    if(stop&&target)return end('AMBIGUOUS',b,null,'BOTH_BARRIERS_IN_1M');
    if(stop)return end('STOP_FIRST',b,p.initial_stop,'FIXED_STOP');
    if(target)return end('TARGET_FIRST',b,p.target,'FIXED_TARGET');
    if(i+1===horizon)return end('TIME_EXIT',b,b.close,'FROZEN_HORIZON');
  }
  return endedAt?{...result,status:'UNRESOLVED',reason:'RUN_ENDED_WITHOUT_EXIT'}:{...result,reason:'AWAIT_OUTCOME'};
}

export function buildSwingEvidence(archive,{activeRun,costBps=null}={}){
  if(costBps!==null&&(!finite(costBps)||costBps<0||costBps>1000))throw Error('Round-trip cost must be 0–1000 bps or unset');
  const issues=[],runs=(archive.runs||[]).map(r=>({...r,config:json(r.config)}));
  const events=(archive.ledger||[]).map(e=>({...e,payload:json(e.payload)})).sort((a,b)=>a.at-b.at||a.id-b.id);
  const predictions=(archive.predictions||[]).map(r=>({...r,state:json(r.state),response:r.response?json(r.response):null})).sort((a,b)=>a.at-b.at);
  const starts=new Map(events.filter(e=>e.kind==='RUN_START').map(e=>[e.run,e.payload]));
  const descriptor=r=>({symbol:r.symbol,config:r.config,code_hash:starts.get(r.id)?.code_hash||'unknown:'+r.id,model:starts.get(r.id)?.model||'unknown',prompt:starts.get(r.id)?.prompt||'unknown'});
  const selected=runs.find(r=>r.id===activeRun)||runs.slice().sort((a,b)=>b.started-a.started)[0];
  const cohort=selected?descriptor(selected):null,key=canonical(cohort),cohortId=checksum(key);
  const selectedRuns=runs.filter(r=>canonical(descriptor(r))===key).sort((a,b)=>a.started-b.started);
  if(activeRun&&!runs.some(r=>r.id===activeRun))issues.push('Requested run is absent from this export; displaying the latest available cohort.');
  if(selected&&!starts.has(selected.id))issues.push('Run-start provenance is missing; this run is isolated from other cohorts.');
  const swings=new Map(),developing=new Map(),attempts=[],plans=[],windows=[];
  for(const run of selectedRuns){
    const rows=predictions.filter(r=>r.run===run.id),ledger=events.filter(e=>e.run===run.id);
    const ended=ledger.find(e=>e.kind==='RUN_END'),end=ended?.at||null;
    const first=rows[0],warm=ledger.find(e=>e.kind==='WARMUP');
    if(!first&&!warm)continue;
    const initialAt=warm?.at??first.at;
    const coverage=warm?.payload.snapshot?.cutoff??first?.state.closed_cutoff;
    if(!Number.isInteger(coverage)){issues.push('Missing initial cutoff: '+run.id);continue;}
    const liveRows=rows.filter(r=>!end||r.at<=end);
    const lastAt=Math.max(initialAt,...liveRows.map(r=>r.at),...ledger.filter(e=>['BAR_CLOSED','TRACKER_EVENT'].includes(e.kind)&&(!end||e.at<=end)).map(e=>e.at));
    windows.push({run:run.id,first_observation:initialAt,last_observation:lastAt,initial_cutoff:coverage,ended_at:end,end_reason:ended?.payload.reason||null});
    const bars=new Map(),candidates=new Map(),frozen=new Map();
    function addBar(b,observedAt,cutoff){
      if(!priceBar(b)||b.time+minute>Math.min(observedAt,cutoff))return;
      const old=bars.get(b.time),next={...b,observed_at:observedAt};
      if(old){if(['open','high','low','close'].some(k=>old[k]!==b[k]))old.conflict=true;}
      else bars.set(b.time,next);
    }
    function candidate(c,at,source,context=false){
      if(!c?.a||!c?.b||!c.id)return;
      const old=candidates.get(c.id),scope=old?.scope||(context||at===initialAt?'WARMUP':c.born<coverage?'BOUNDARY':'FORWARD');
      if(old&&at<old.last_seen){old.first_seen=Math.min(old.first_seen,at);return;}
      candidates.set(c.id,{...old,id:run.id+':'+c.id,run:run.id,candidate_id:c.id,opportunity:canonical([key,c.a.origin,c.b.origin]),
        profile:c.profile,parent:c.parent,scope,first_seen:old?Math.min(old.first_seen,at):at,born:c.born,
        a:copy(c.a),b:copy(c.b),c:c.c,state:c.state,reason:c.reason,last_seen:at,source});
    }
    function recordSwings(state,at,source,context=false){
      const cutoff=Math.min(at,state.closed_cutoff??state.cutoff,state.candles_as_of??at);
      const path=(state.pivots||[]).filter(p=>finite(p.price)&&Number.isInteger(p.origin)&&Number.isInteger(p.known)&&p.origin<p.known&&p.known<=cutoff);
      for(let i=0;i+2<path.length;i++){
        const [a,b,c]=path.slice(i,i+3);
        if(a.side===b.side||b.side===c.side||a.origin>=b.origin||b.origin>=c.origin||a.known>b.known||b.known>c.known)continue;
        const identity=canonical([key,a.origin,b.origin]),old=swings.get(identity);
        if(old){if(old.start.price!==a.price||old.end.price!==b.price){issues.push('Conflicting finalized swing: '+old.id);old.scope='CONFLICT';}continue;}
        const scope=context||at===initialAt?'WARMUP':a.origin<coverage?'BOUNDARY':'FORWARD';
        swings.set(identity,{id:checksum(identity),cohort_id:cohortId,symbol:run.symbol,run:run.id,timeframe:run.config.swing_minutes,
          scope,start:copy(a),end:copy(b),confirmation:copy(c),finalized_at:at,end_known_at:b.known,
          direction:b.price>a.price?'LONG':'SHORT',points:Math.abs(b.price-a.price),ticks:Math.abs(b.price-a.price)/state.tick,
          duration_minutes:(b.origin-a.origin)/minute,parent_at_finalization:state.parent_id,trend_at_finalization:state.trend,
          source_prediction:source.prediction||null,source_event:source.event||null,source_cutoff:state.closed_cutoff??state.cutoff});
      }
      if(path.length>=2){
        const [a,b]=path.slice(-2),identity=canonical([key,a.origin,b.origin]);
        if(a.side!==b.side&&a.origin<b.origin)developing.set(run.id,{id:checksum(identity),run:run.id,scope:a.origin<coverage?'BOUNDARY':'FORWARD',start:copy(a),end:copy(b),last_seen:at});
      }
    }
    // Warmup retains a longer pivot path than each compact prediction snapshot.
    // Keep that saved history visible without counting it as forward evidence.
    if(warm?.payload.snapshot){
      recordSwings(warm.payload.snapshot,warm.at,{event:warm.id},true);
      for(const c of warm.payload.snapshot.candidates||[])candidate(c,warm.at,'warmup',true);
    }
    for(const r of liveRows){
      const state=r.state,cutoff=Math.min(r.at,state.closed_cutoff,state.candles_as_of??r.at);
      for(const b of state.closed_bars||[])addBar(b,r.at,cutoff);
      for(const c of state.candidates||[])candidate(c,r.at,'prediction:'+r.id);
      recordSwings(state,r.at,{prediction:r.id});
    }
    for(const e of ledger){
      if(e.kind==='BAR_CLOSED')addBar(e.payload.bar,e.at,e.at);
      if(e.kind==='TRACKER_EVENT'){
        const v=e.payload;
        if(v.kind==='CANDIDATE'&&v.frozen_candidate)candidate(v.frozen_candidate,e.at,'event:'+e.id);
        if(v.kind==='READY'&&v.frozen_plan){
          const p=v.frozen_plan;
          // An immutable READY map must have been known before its eligible open.
          if(!frozen.has(p.id))frozen.set(p.id,{plan:copy(p),candidateId:v.candidate,known:Math.max(e.at,p.observed_at||0),source:e.id});
          const c=candidates.get(v.candidate);if(c)Object.assign(c,{state:'READY',reason:'CLOSED_BAR_CONFIRMED',last_seen:e.at});
        }
        if(v.candidate&&candidates.has(v.candidate)&&!['CANDIDATE','READY'].includes(v.kind)){
          const c=candidates.get(v.candidate);if(e.at>=c.last_seen)Object.assign(c,{state:v.kind==='BLOCKED'?'BLOCKED':'TERMINAL',reason:v.reason||v.kind,last_seen:e.at});
        }
      }
      if(e.kind==='RUN_END')for(const c of candidates.values())if(c.state==='WATCH')Object.assign(c,{state:'UNRESOLVED',reason:e.payload.reason,last_seen:e.at});
    }
    for(const c of candidates.values())attempts.push(c);
    for(const {plan:p,candidateId,known,source} of frozen.values()){
      const c=candidates.get(candidateId);
      const scope=p.signal_at<coverage||known===initialAt?'WARMUP':'FORWARD';
      const invalid=known>p.eligible_open;
      const result=invalid?{status:'UNRESOLVED',reason:'PLAN_RECORDED_AFTER_ELIGIBLE_OPEN',gross_r:null,net_r:null}:
        resolveFrozenPlan(p,[...bars.values()],{...run.config,tick:first?.state.tick??warm?.payload.snapshot?.tick},{endedAt:end,costBps,predictions:rows});
      plans.push({id:run.id+':'+p.id,run:run.id,source_event:source,cohort_id:cohortId,scope,profile:p.profile,
        opportunity:canonical([key,p.a.origin,p.b.origin]),candidate_id:c?.candidate_id??null,
        side:p.side,signal_at:p.signal_at,observed_at:known,frozen:copy(p),outcome:result});
    }
  }
  const completed=[...swings.values()].sort((a,b)=>a.finalized_at-b.finalized_at);
  const unfinished=[...new Map([...developing.values()].filter(s=>!completed.some(c=>c.id===s.id)).map(s=>[s.id,s])).values()];
  const forward=completed.filter(s=>s.scope==='FORWARD');
  // One chronological entered plan per source opportunity; child attempts stay inspectable.
  const counted=new Set();
  for(const p of plans.sort((a,b)=>a.observed_at-b.observed_at||a.id.localeCompare(b.id))){
    p.primary=p.scope==='FORWARD'&&p.outcome.entry!=null&&!counted.has(p.opportunity);
    if(p.primary)counted.add(p.opportunity);
  }
  const groups=new Map();
  for(const p of plans.filter(p=>p.primary)){
    const model=p.outcome.model_at_entry,group=[p.profile,model?.pattern||'NO_MODEL',model?model.lean===(p.side===1?'long':'short')?'AGREES':model.lean==='neutral'?'NEUTRAL':'OPPOSES':'UNAVAILABLE'];
    const k=group.join('|');if(!groups.has(k))groups.set(k,{profile:group[0],pattern:group[1],model_relation:group[2],entered:0,resolved:0,targets:0,stops:0,time_exits:0,ambiguous:0,unresolved:0,gross_r_sum:0,net_r_sum:costBps==null?null:0});
    const g=groups.get(k),o=p.outcome;g.entered++;
    if(terminal.has(o.status)){g.resolved++;g.gross_r_sum+=o.gross_r;if(costBps!=null)g.net_r_sum+=o.net_r;}
    if(o.status==='TARGET_FIRST')g.targets++;else if(o.status==='STOP_FIRST')g.stops++;else if(o.status==='TIME_EXIT')g.time_exits++;else if(o.status==='AMBIGUOUS')g.ambiguous++;else g.unresolved++;
  }
  const caps=archive.limits||{},truncated=['runs','ledger','predictions'].filter(k=>caps[k]&&(archive[k]?.length||0)>=caps[k]);
  if(truncated.length)issues.push('Archive export limit reached: '+truncated.join(', ')+'. Counts describe available coverage only.');
  return {version:EVIDENCE_VERSION,rules:OUTCOME_RULES,cohort,cohort_id:cohortId,active_run:selected?.id||null,
    run_ids:selectedRuns.map(r=>r.id),cost_assumption:{round_trip_bps:costBps,basis:'entry notional',verified:false,label:costBps==null?'GROSS_ONLY':'USER_COST_SCENARIO'},
    coverage:{first_observation:windows.length?Math.min(...windows.map(w=>w.first_observation)):null,
      last_observation:windows.length?Math.max(...windows.map(w=>w.last_observation)):null,
      observed_minutes:windows.reduce((n,w)=>n+(w.last_observation-w.first_observation)/minute,0),windows,
      observations:predictions.filter(p=>selectedRuns.some(r=>r.id===p.run)).length,
      truncated:!!truncated.length,issues:[...new Set(issues)]},
    counts:{saved_completed_swings:completed.filter(s=>s.scope!=='CONFLICT').length,developing_swings:unfinished.length,
      forward_swings:forward.length,warmup_swings:completed.filter(s=>s.scope==='WARMUP').length,boundary_swings:completed.filter(s=>s.scope==='BOUNDARY').length,
      forward_attempts:attempts.filter(c=>c.scope==='FORWARD').length,qualified_plans:plans.filter(p=>p.scope==='FORWARD').length,
      entered_opportunities:plans.filter(p=>p.primary).length,resolved_opportunities:plans.filter(p=>p.primary&&terminal.has(p.outcome.status)).length},
    milestones:[50,200].map(n=>({swings:n,observed:forward.length,remaining:Math.max(0,n-forward.length),reached:forward.length>=n&&!issues.length,label:n===50?'Data-quality audit':'Exploratory pattern review'})),
    swings:completed,developing:unfinished,attempts,plans,patterns:[...groups.values()].map(g=>({...g,mean_gross_r:g.resolved?g.gross_r_sum/g.resolved:null,mean_net_r:g.resolved&&costBps!=null?g.net_r_sum/g.resolved:null})),
    note:'Retrospective deterministic audit of saved live evidence. Not model training, broker fills, independent samples or an established edge. No automatic rule changes.'};
}

// Incremental browser cache; durable authority remains the server SQLite archive.
export class EvidenceArchive {
  constructor(archive){this.runs=archive.runs||[];this.limits=archive.limits;this.ledger=new Map((archive.ledger||[]).map(e=>[e.id,e]));this.predictions=new Map((archive.predictions||[]).map(p=>[p.id,p]));}
  ingest(history){for(const p of history.predictions||[])this.predictions.set(p.id,p);for(const e of history.events||[])this.ledger.set(e.id,e);}
  export(){return {runs:this.runs,limits:this.limits,ledger:[...this.ledger.values()],predictions:[...this.predictions.values()]};}
}

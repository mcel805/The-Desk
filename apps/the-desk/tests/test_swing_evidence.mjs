import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildSwingEvidence,resolveFrozenPlan,EvidenceArchive,canonical} from '../web/swing-evidence.mjs';

const T=Date.UTC(2026,9,23),M=60000;
const config={swing_minutes:5,gap_ticks:3,min_room_r:1,plan_bars:3};
const bar=(i,open=100,high=104,low=98,close=101)=>({time:T+i*M,open,high,low,close,volume:1,observed_at:T+(i+1)*M+100});
const pivot=(i,side,price)=>({origin:T+i*M,known:T+(i+1)*M,index:i,side,price,consumed:false});
const A=pivot(1,-1,90),B=pivot(3,1,110),C=pivot(5,-1,95),D=pivot(7,1,115);
const plan=(side=1)=>({id:1,born:T+M,side,profile:side===1?'LONG_REVERSAL':'SHORT_REVERSAL',
  signal_at:T+2*M,observed_at:T+2*M+100,eligible_open:T+3*M,reference:100,initial_stop:side===1?95:105,
  target:side===1?110:90,quantity:1,reserved_risk:10,a:{...A,origin:T,known:T+M},b:{...B,origin:T+M,known:T+2*M}});
const run=(id='r',cfg=config)=>({id,symbol:'hyperliquid:BTC',started:T,config:JSON.stringify(cfg)});
const event=(id,kind,at,payload,runId='r')=>({id,run:runId,symbol:'hyperliquid:BTC',kind,at,payload:JSON.stringify(payload)});
const start=(id=1,runId='r',code='code1')=>event(id,'RUN_START',T,{code_hash:code,model:'jev-test',prompt:'prompt1'},runId);
const prediction=(id,i,pivots=[],more={},runId='r')=>({id,run:runId,symbol:'hyperliquid:BTC',at:T+i*M+100,
  state:JSON.stringify({closed_cutoff:T+i*M,candles_as_of:T+i*M+100,tick:1,parent_id:2,trend:1,pivots,candidates:[],closed_bars:[],...more}),response:null});
const archive=(predictions=[],ledger=[start()],runs=[run()])=>({runs,ledger,predictions});
const model=(id,i,lean='long',delay=100)=>({...prediction(id,i),response:{status:'AVAILABLE',received_at:T+i*M+100+delay,
  model:'jev-test',prompt:'prompt1',answers:{directional_lean:{choice:lean,probabilities:{long:.7,short:.2,neutral:.1}},pattern:{choice:'reversal'}}}});

test('latest leg is provisional; confirmation finalizes it once despite four samples per candle',()=>{
  const initial=prediction('baseline',1);
  assert.equal(buildSwingEvidence(archive([initial,prediction('a',5,[A,B])])).counts.forward_swings,0);
  const rows=[initial,...[1,2,3,4].map(slot=>({...prediction('p'+slot,6,[A,B,C]),at:T+6*M+slot*1000}))];
  const report=buildSwingEvidence(archive(rows));
  assert.equal(report.counts.forward_swings,1);
  assert.equal(report.swings[0].source_prediction,'p1');
  assert.equal(report.swings[0].duration_minutes,2);
  assert.equal(report.swings[0].ticks,20);
});

test('warmup and boundary legs cannot inflate the 50-swing audit counter',()=>{
  const rows=[prediction('initial',7,[A,B,C]),prediction('later',9,[A,B,C,D])];
  const report=buildSwingEvidence(archive(rows));
  assert.deepEqual([report.counts.forward_swings,report.counts.warmup_swings,report.counts.boundary_swings],[0,1,1]);
  assert.equal(report.milestones[0].remaining,50);
});

test('saved warmup path is counted in full rather than just the compact prediction tail',()=>{
  const E=pivot(8,-1,92),F=pivot(9,1,118),G=pivot(11,-1,96),path=[A,B,C,D,E,F];
  const warm=event(2,'WARMUP',T+10*M+100,{snapshot:{cutoff:T+10*M,tick:1,pivots:path,candidates:[]}});
  const rows=[prediction('first',10,path.slice(-3)),prediction('later',12,[...path.slice(-3),G])];
  const r=buildSwingEvidence(archive(rows,[start(),warm,event(3,'RUN_END',T+100*M,{reason:'SERVER_RESTART'})]));
  assert.equal(r.counts.saved_completed_swings,5);
  assert.equal(r.counts.warmup_swings,4);assert.equal(r.counts.boundary_swings,1);
  assert.equal(r.counts.forward_swings,0);assert.equal(r.counts.developing_swings,1);
  assert.equal(r.coverage.observed_minutes,2);assert.equal(r.coverage.last_observation,rows[1].at);
  assert.equal(r.swings[0].source_event,2);assert.equal(r.swings[0].source_prediction,null);
  assert.equal(r.milestones[0].remaining,50);
});

test('warmup provenance preserves the live boundary when the first prediction is missing',()=>{
  const warm=event(2,'WARMUP',T+M+100,{snapshot:{cutoff:T+M,tick:1,pivots:[],candidates:[]}});
  const r=buildSwingEvidence(archive([prediction('retained',6,[A,B,C])],[start(),warm]));
  assert.equal(r.counts.forward_swings,1);assert.equal(r.coverage.first_observation,warm.at);
  const onlyWarm=event(2,'WARMUP',T+7*M+100,{snapshot:{cutoff:T+7*M,tick:1,pivots:[A,B,C],candidates:[]}});
  const saved=buildSwingEvidence(archive([],[start(),onlyWarm]));
  assert.equal(saved.counts.saved_completed_swings,1);assert.equal(saved.counts.forward_swings,0);
});

test('an extending endpoint is not frozen until its opposite pivot confirms',()=>{
  const extended={...B,price:120};
  const report=buildSwingEvidence(archive([prediction('base',1),prediction('developing',4,[A,B]),prediction('confirmed',6,[A,extended,C])]));
  assert.equal(report.swings[0].end.price,120);
});

test('future pivots are withheld, conflicting finalized prices are excluded',()=>{
  const a=archive([prediction('base',1),prediction('too-early',4,[A,B,C])]);
  assert.equal(buildSwingEvidence(a).swings.length,0);
  a.predictions.push(prediction('good',6,[A,B,C]),prediction('revision',7,[A,{...B,price:112},C]));
  const report=buildSwingEvidence(a);
  assert.equal(report.counts.forward_swings,0);assert.equal(report.swings[0].scope,'CONFLICT');
  assert.match(report.coverage.issues[0],/Conflicting finalized swing/);
});

test('matching restarts deduplicate swings; changed settings and code stay in separate cohorts',()=>{
  const a=archive([prediction('base',1),prediction('fwd',6,[A,B,C]),prediction('restart',8,[A,B,C],{},'r2')],
    [start(),start(2,'r2')],[run(),run('r2')]);
  const report=buildSwingEvidence(a,{activeRun:'r2'});
  assert.equal(report.run_ids.length,2);assert.equal(report.counts.forward_swings,1);
  a.runs[1]=run('r2',{...config,swing_minutes:3});
  assert.equal(buildSwingEvidence(a,{activeRun:'r2'}).counts.forward_swings,0);
  assert.equal(buildSwingEvidence(a,{activeRun:'r2'}).run_ids.length,1);
  a.runs[1]=run('r2');a.ledger[1]=start(2,'r2','changed');
  assert.equal(buildSwingEvidence(a,{activeRun:'r2'}).run_ids.length,1);
});

test('fixed long and short barriers produce mirrored gross R outcomes',()=>{
  const long=resolveFrozenPlan(plan(),[bar(3,100,111,99,110)],{...config,tick:1});
  const short=resolveFrozenPlan(plan(-1),[bar(3,100,101,89,90)],{...config,tick:1});
  assert.equal(long.status,'TARGET_FIRST');assert.equal(short.status,'TARGET_FIRST');
  assert.equal(long.gross_r,2);assert.equal(short.gross_r,2);assert.equal(long.net_r,null);
  assert.equal(resolveFrozenPlan(plan(),[bar(3,100,102,94,96)],{...config,tick:1}).gross_r,-1);
});

test('both barriers touched inside a candle stays ambiguous; open gaps have known ordering',()=>{
  const both=resolveFrozenPlan(plan(),[bar(3,100,112,94,101)],{...config,tick:1});
  assert.equal(both.status,'AMBIGUOUS');assert.equal(both.gross_r,null);
  const stopGap=resolveFrozenPlan(plan(),[bar(3),bar(4,90,112,89,100)],{...config,tick:1});
  assert.equal(stopGap.status,'STOP_FIRST');assert.equal(stopGap.gross_r,-2);
  const targetGap=resolveFrozenPlan(plan(),[bar(3),bar(4,112,114,94,100)],{...config,tick:1});
  assert.equal(targetGap.status,'TARGET_FIRST');assert.equal(targetGap.gross_r,2);
});

test('entry gaps and late-recorded signals never inherit an earlier fill',()=>{
  const gap=resolveFrozenPlan(plan(),[bar(3,104,108,100,105)],{...config,tick:1});
  assert.equal(gap.status,'MISSED');assert.equal(gap.entry,null);
  const late={...plan(),observed_at:T+3*M+1};
  assert.equal(resolveFrozenPlan(late,[bar(3)],{...config,tick:1}).status,'UNRESOLVED');
  const futureReference={...plan(),target_known:T+3*M};
  assert.equal(resolveFrozenPlan(futureReference,[bar(3)],{...config,tick:1}).reason,'REFERENCE_NOT_KNOWN_AT_SIGNAL');
});

test('missing candles and closed-bar conflicts never become favorable outcomes',()=>{
  assert.equal(resolveFrozenPlan(plan(),[bar(3),bar(5,100,112,99,110)],{...config,tick:1}).reason,'MISSING_OUTCOME_BAR');
  assert.equal(resolveFrozenPlan(plan(),[bar(4)],{...config,tick:1}).reason,'MISSING_ENTRY_BAR');
  assert.equal(resolveFrozenPlan(plan(),[{...bar(3),conflict:true}],{...config,tick:1}).reason,'CLOSED_BAR_CONFLICT');
});

test('ended runs do not borrow future bars from after the run boundary',()=>{
  const end=T+4*M+500;
  const o=resolveFrozenPlan(plan(),[bar(3),bar(4,100,112,99,110)],{...config,tick:1},{endedAt:end});
  assert.equal(o.status,'UNRESOLVED');assert.equal(o.gross_r,null);
});

test('time horizon and user cost scenario are explicit, zero is distinct from unknown',()=>{
  const bars=[bar(3),bar(4),bar(5,100,104,98,103)];
  const gross=resolveFrozenPlan(plan(),bars,{...config,tick:1});
  const cost=resolveFrozenPlan(plan(),bars,{...config,tick:1},{costBps:50});
  assert.equal(gross.status,'TIME_EXIT');assert.equal(gross.gross_r,.6);assert.equal(gross.net_r,null);
  assert.equal(cost.net_r,.5);
  assert.equal(resolveFrozenPlan(plan(),bars,{...config,tick:1},{costBps:0}).net_r,.6);
});

test('Jev attribution uses only fresh valid judgments received before entry',()=>{
  const before=model('before',2,'long'),future=model('future',3,'short');
  const late={...model('late',2,'short'),at:T+2*M+200,response:{...model('late',2,'short').response,received_at:T+3*M+1}};
  const o=resolveFrozenPlan(plan(),[bar(3,100,111,99,110)],{...config,tick:1},{predictions:[before,future,late]});
  assert.equal(o.model_at_entry.prediction_id,'before');assert.equal(o.model_at_entry.lean,'long');
  before.response.status='STALE';
  assert.equal(resolveFrozenPlan(plan(),[bar(3)],{...config,tick:1},{predictions:[before]}).model_at_entry,null);
});

test('all forward attempts remain visible, including blocked and untriggered cases',()=>{
  const c={id:11,parent:2,born:T+2*M,profile:'LONG_REVERSAL',state:'WATCH',reason:'WAIT_SWEEP',a:A,b:B,c:100};
  const raw=archive([prediction('base',1),prediction('watch',3,[],{candidates:[c]})],[start(),
    event(2,'TRACKER_EVENT',T+2*M+100,{kind:'CANDIDATE',frozen_candidate:{...c,reason:'DEVELOPING_C'}})]);
  const report=buildSwingEvidence(raw);
  assert.equal(report.counts.forward_attempts,1);assert.equal(report.attempts[0].reason,'WAIT_SWEEP');
  assert.equal(report.attempts[0].first_seen,T+2*M+100);
  raw.ledger.push(event(3,'TRACKER_EVENT',T+4*M,{kind:'BLOCKED',candidate:11,reason:'ROOM'}));
  assert.equal(buildSwingEvidence(raw).attempts[0].state,'BLOCKED');
});

test('READY outcomes link candidate IDs correctly and count one entry per A/B opportunity',()=>{
  const p=plan(),candidate={...p,id:11,parent:2,state:'WATCH',reason:'DEVELOPING_C'};
  const rows=[prediction('baseline',1),model('jev',2),prediction('closed',5,[],{closed_bars:[bar(3,100,111,99,110)]})];
  const ledger=[start(),event(2,'TRACKER_EVENT',T+2*M+100,{kind:'CANDIDATE',frozen_candidate:candidate}),
    event(3,'TRACKER_EVENT',T+2*M+100,{kind:'READY',candidate:11,frozen_plan:p}),
    event(4,'TRACKER_EVENT',T+2*M+101,{kind:'READY',candidate:11,frozen_plan:{...p,id:2}})];
  const raw=archive(rows,ledger),frozen=canonical(raw),r=buildSwingEvidence(raw,{costBps:10});
  assert.equal(r.counts.qualified_plans,2);assert.equal(r.counts.entered_opportunities,1);
  assert.equal(r.plans[0].candidate_id,11);assert.equal(r.counts.resolved_opportunities,1);
  assert.equal(r.patterns[0].model_relation,'AGREES');assert.equal(r.patterns[0].targets,1);
  assert.equal(r.patterns[0].mean_net_r,1.98);assert.equal(canonical(raw),frozen);
});

test('future closed bars in a premature snapshot cannot settle a plan',()=>{
  const raw=archive([prediction('base',1),prediction('premature',3,[],{closed_bars:[bar(3,100,111,99,110)]})],
    [start(),event(2,'TRACKER_EVENT',T+2*M+100,{kind:'READY',candidate:11,frozen_plan:plan()})]);
  assert.equal(buildSwingEvidence(raw).plans[0].outcome.status,'WAITING_ENTRY');
});

test('truncated archives cannot mark an audit milestone reached',()=>{
  const raw=archive([prediction('base',1)]);raw.limits={predictions:1};
  const r=buildSwingEvidence(raw);assert.equal(r.coverage.truncated,true);assert.equal(r.milestones[0].reached,false);
  assert.throws(()=>buildSwingEvidence(raw,{costBps:-1}));
});

test('incremental history reconstructs the same audit as a full archive reload',()=>{
  const base=archive([prediction('base',1)]),tail={predictions:[prediction('later',6,[A,B,C])],events:[]};
  const cache=new EvidenceArchive(base);cache.ingest(tail);cache.ingest(tail);
  assert.deepEqual(buildSwingEvidence(cache.export()),buildSwingEvidence(archive([...base.predictions,...tail.predictions])));
});

test('audit consumes actual Python tracker events and snapshots without a parallel ABC implementation',()=>{
  const script=`
import math,json
from dataclasses import asdict
from swing_tracker import Config,SwingTracker
q=Config(swing_minutes=1,parent_bars=2,micro_bars=1,min_leg_ticks=1,min_leg_atr=0,min_retrace=.1,max_retrace=3,geometry=False,max_chase_ticks=1000,target_mode='measured',min_room_r=.1,quantity=.01,attempt_risk=100,parent_risk=1000,session_risk=10000,parent_signals=10,rejection_fraction=.8,directional_body=False)
t=SwingTracker(q,tick=1);start=1792713600000;events=[];predictions=[];seq=0
def event(kind,at,payload):
 events.append(dict(id=len(events)+1,run='synthetic',symbol='hyperliquid:BTC',kind=kind,at=at,payload=payload))
event('RUN_START',start,dict(code_hash='synthetic-core-fixture',model='none',prompt='none'))
for i in range(260):
 c=100+15*math.sin(i/5);at=start+(i+1)*60000+1
 b=dict(time=start+i*60000,open=c-.5,close=c,high=c+2,low=c-2,volume=100)
 t.feed(b,observed_at=at);event('BAR_CLOSED',at,dict(bar=b))
 for e in t.events:
  if e['seq']>seq:event('TRACKER_EVENT',at,e)
 seq=t.seq
 snap=t.snapshot()
 predictions.append(dict(id=str(i),run='synthetic',at=at,state=dict(closed_cutoff=snap['cutoff'],candles_as_of=at,tick=1,parent_id=snap['parent_id'],trend=snap['trend'],pivots=snap['pivots'],candidates=snap['candidates'],closed_bars=[b]),response=None))
print(json.dumps(dict(runs=[dict(id='synthetic',symbol='hyperliquid:BTC',started=start,config=asdict(q))],ledger=events,predictions=predictions)))
`;
  const raw=JSON.parse(execFileSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:8*1024*1024}));
  const report=buildSwingEvidence(raw);
  assert.ok(report.counts.forward_swings>=10);
  assert.equal(report.plans.length,3);
  assert.ok(report.counts.resolved_opportunities>=1);
  assert.ok(report.plans.every(p=>p.candidate_id!==null));
  assert.ok(report.patterns.every(g=>g.model_relation==='UNAVAILABLE'));
  assert.deepEqual(report.coverage.issues,[]);
  // Additional future evidence must not rewrite a previously finalized leg.
  const prefix={...raw,predictions:raw.predictions.slice(0,150),ledger:raw.ledger.filter(e=>e.at<=raw.predictions[149].at)};
  const before=buildSwingEvidence(prefix).swings;
  assert.deepEqual(report.swings.slice(0,before.length),before);
});

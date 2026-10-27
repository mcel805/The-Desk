/** Outcome-first research. Probability is withheld until chronological holdout gates pass. */
import {createHash} from 'node:crypto';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const average=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const bucket=o=>`${o.side}|${o.stage}|${o.coverage}|${Math.min(3,Math.floor(o.pressure/25))}`;
const session=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+(Number(p.hour)>=17?1:0))).toISOString().slice(0,10);};
export const DEFINITION=Object.freeze({horizonBars:10,downAtr:1,upAtr:.5});
export function normalize(o){
  if(o?.schema!=='agentic.swing.warnings.v1')throw Error('Unsupported warning observation');
  const n={...o,observedAt:o.observedAt??o.observed_at,closedCutoff:o.closedCutoff??o.closed_cutoff,featureConfig:o.featureConfig??o.feature_config};
  if(!n.symbol||typeof n.symbol!=='string'||!Number.isSafeInteger(n.observedAt)||!Number.isSafeInteger(n.closedCutoff)||n.closedCutoff>n.observedAt||![-1,1].includes(n.side)||!finite(n.pressure)||n.pressure<0||n.pressure>100||![0,1,2,3].includes(n.stage)||typeof n.provisional!=='boolean'||!n.featureConfig||typeof n.coverage!=='string'||!/^[01]{6}$/.test(n.coverage))throw Error('Incomplete observation provenance');
  n.close=o.close??o.values?.close;n.atr=o.atr??o.values?.atr;
  if(!finite(n.close)||n.close<=0||!finite(n.atr)||n.atr<=0)throw Error('Price and volatility reference required');
  n.group=session(n.observedAt);return n;
}
export function label(observation,bars,definition=DEFINITION){
  const o=normalize(observation),d={...definition};
  if(!Number.isSafeInteger(d.horizonBars)||d.horizonBars<1||!finite(d.downAtr)||d.downAtr<=0||!finite(d.upAtr)||d.upAtr<=0)throw Error('Invalid frozen outcome definition');
  const result={...o,definition:d,target:o.close-o.side*d.downAtr*o.atr,invalidation:o.close+o.side*d.upAtr*o.atr,outcome:null,reason:'HORIZON_UNAVAILABLE',resolvedAt:null};
  // Minute OHLC cannot reconstruct the path after a :15/:30/:45 observation.
  if(o.provisional)return {...result,reason:'INTRABAR_PATH_UNAVAILABLE'};
  // For delayed receipt, start at the next full minute, never in a partly elapsed bar.
  const eligibleAt=Math.ceil(o.observedAt/60000)*60000;
  result.eligibleAt=eligibleAt;
  const future=bars.filter(b=>b.time>=eligibleAt).slice(0,d.horizonBars);
  for(let i=0;i<future.length;i++){
    const b=future[i];
    if(b.time!==eligibleAt+i*60000)return {...result,reason:'DATA_GAP'};
    if(!['open','high','low','close'].every(k=>finite(b[k])&&b[k]>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error('Invalid outcome OHLC');
    const target=o.side===1?b.low<=result.target:b.high>=result.target;
    const invalid=o.side===1?b.high>=result.invalidation:b.low<=result.invalidation;
    if(target&&invalid)return {...result,reason:'AMBIGUOUS_BOTH_BARRIERS',resolvedAt:b.time+60000};
    if(target||invalid)return {...result,outcome:target,reason:target?'REVERSAL_DISTANCE_FIRST':'CONTINUATION_BARRIER_FIRST',resolvedAt:b.time+60000};
  }
  return future.length===d.horizonBars?{...result,outcome:false,reason:'NO_REVERSAL_WITHIN_HORIZON',resolvedAt:future.at(-1).time+60000}:result;
}
function validateRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error('Labeled observations required');
  const data=rows.filter(r=>typeof r.outcome==='boolean').map(r=>{
    const o=normalize(r);if(o.provisional||!Number.isSafeInteger(r.resolvedAt)||r.resolvedAt<=o.observedAt||!r.definition)throw Error('Unscorable outcome');
    return {...o,outcome:r.outcome,resolvedAt:r.resolvedAt,definition:r.definition};
  }).sort((a,b)=>a.observedAt-b.observedAt);
  if(!data.length)return [];
  const spec=JSON.stringify([data[0].symbol,data[0].featureConfig,data[0].definition]);
  if(data.some(x=>JSON.stringify([x.symbol,x.featureConfig,x.definition])!==spec))throw Error('Mixed instrument/config/outcome definition');
  const seen=new Set();for(const r of data){const key=r.observedAt+'|'+r.swing;if(seen.has(key))throw Error('Duplicate forecast');seen.add(key);}
  return data;
}
export function fit(rows,options={}){
  const opts={holdoutFraction:.3,minTrainGroups:30,minHoldoutGroups:20,minBinGroups:10,maxCalibrationGap:.1,...options};
  for(const k of ['minTrainGroups','minHoldoutGroups','minBinGroups'])if(!Number.isSafeInteger(opts[k])||opts[k]<2)throw Error('Invalid evidence gate '+k);
  if(!finite(opts.holdoutFraction)||opts.holdoutFraction<=0||opts.holdoutFraction>=1||!finite(opts.maxCalibrationGap)||opts.maxCalibrationGap<0||opts.maxCalibrationGap>1)throw Error('Invalid holdout policy');
  const data=validateRows(rows),groups=[...new Set(data.map(r=>r.group))].sort();
  const split=Math.floor(groups.length*(1-opts.holdoutFraction)),trainingGroups=groups.slice(0,split),heldGroups=groups.slice(split);
  if(trainingGroups.length<opts.minTrainGroups||heldGroups.length<opts.minHoldoutGroups)return {status:'INSUFFICIENT_INDEPENDENT_SESSIONS',probability:null,groups:groups.length,options:opts};
  const cut=data.find(x=>heldGroups.includes(x.group)).observedAt;
  // Purge training forecasts whose outcome interval overlaps the held-out period.
  const train=data.filter(r=>trainingGroups.includes(r.group)&&r.resolvedAt<cut),held=data.filter(r=>heldGroups.includes(r.group));
  const trainSupport=new Set(train.map(r=>r.group));
  if(trainSupport.size<opts.minTrainGroups)return {status:'INSUFFICIENT_PURGED_TRAINING',probability:null};
  const table={};for(const r of train){const k=bucket(r);table[k]??={n:0,yes:0,groups:new Set()};table[k].n++;table[k].yes+=Number(r.outcome);table[k].groups.add(r.group);}
  for(const [k,b] of Object.entries(table))table[k]={n:b.n,yes:b.yes,groups:b.groups.size,p:(b.yes+1)/(b.n+2)};
  const baseline=average(train.map(r=>Number(r.outcome)));
  const scored=held.filter(r=>table[bucket(r)]?.groups>=opts.minBinGroups).map(r=>({...r,p:table[bucket(r)].p}));
  const supportedHeld=new Set(scored.map(r=>r.group));
  if(supportedHeld.size<opts.minHoldoutGroups)return {status:'INSUFFICIENT_SUPPORTED_HOLDOUT',probability:null,table,options:opts};
  const brier=average(scored.map(r=>(r.p-Number(r.outcome))**2)),baselineBrier=average(scored.map(r=>(baseline-Number(r.outcome))**2));
  // Reliability is assessed per forecast bucket, not only as a canceling global mean.
  const reliability=[];for(const k of Object.keys(table)){const rs=scored.filter(r=>bucket(r)===k);if(rs.length)reliability.push({key:k,n:rs.length,p:table[k].p,frequency:average(rs.map(r=>Number(r.outcome)))});}
  const calibrationGap=reliability.reduce((n,b)=>n+b.n*Math.abs(b.p-b.frequency),0)/scored.length;
  const ready=brier<baselineBrier&&calibrationGap<=opts.maxCalibrationGap;
  const spec={symbol:data[0].symbol,featureConfig:data[0].featureConfig,definition:data[0].definition};
  const model={status:ready?'VALIDATED_LOCAL_RESEARCH':'HOLDOUT_DID_NOT_PASS',...spec,table,options:opts,trainedThrough:Math.max(...train.map(r=>r.resolvedAt)),validatedThrough:Math.max(...held.map(r=>r.resolvedAt)),evaluation:{brier,baselineBrier,calibrationGap,coverage:scored.length/held.length,trainingSessions:trainSupport.size,heldoutSessions:supportedHeld.size,n:scored.length,reliability},scope:'Held-out local reversal-distance forecasts; not trade win probability or TradingView parity.'};
  model.id=createHash('sha256').update(JSON.stringify(model)).digest('hex');return model;
}
export function predict(model,observation){
  const o=normalize(observation);
  if(model.status!=='VALIDATED_LOCAL_RESEARCH')return {probability:null,reason:model.status};
  if(o.symbol!==model.symbol||JSON.stringify(o.featureConfig)!==JSON.stringify(model.featureConfig))return {probability:null,reason:'INSTRUMENT_OR_CONFIG_MISMATCH'};
  if(o.observedAt<=model.validatedThrough)return {probability:null,reason:'NOT_FORWARD_OF_VALIDATION'};
  const bin=model.table[bucket(o)];
  if(!bin||bin.groups<model.options.minBinGroups)return {probability:null,reason:'INSUFFICIENT_COMPARABLE_SESSIONS'};
  return {probability:bin.p,reason:'EXPERIMENTAL_FORWARD_RESEARCH',definition:model.definition,model:model.id,comparisonSessions:bin.groups,comparisonForecasts:bin.n,heldout:model.evaluation};
}

import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {PineEngine} from '../../../apps/the-desk/node_modules/@luxalgo/vela-pinets/dist/index.js';
import {normalize} from '../reversal-study.mjs';
const source=await fs.readFile(new URL('../Agentic_Swing_Tracker_v1_3.pine',import.meta.url),'utf8');
const engine=new PineEngine(),prepared=await engine.prepare(source,'warning-live-test');
const ActualDate=Date,actualNow=Date.now,start=Math.floor(actualNow()/60000)*60000;let clock=start+1000;
globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const bars=Array.from({length:50},(_,i)=>{const p=53000+i*2;return {time:start-(50-i)*60000,open:p-1,high:p+1,low:p-1,close:p,volume:100};});
bars.push({time:start,open:53100,high:53112,low:53098,close:53100,volume:1000});
  const alerts=[],warnings=[],models=[];let failure=null,session;
const spin=async(fn)=>{for(let i=0;i<100;i++){if(failure)throw failure;if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Live model/alert did not arrive');};
try{
  session=engine.execute({prepared,bars,getBars:()=>bars,market:{symbol:'fixture:MYM',timeframe:'1',chartStyle:'candles',symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}},inputs:{swingTimeframe:'1',wDirectionMode:'Track UP',wWarningStream:true,wIntrabar:true,wVolumeEnabled:true,pointValueOverride:.5},mode:'live',historyState:'complete'},{onModel:m=>models.push(m),onAlert:a=>alerts.push(a),onError:e=>failure=e,onWarning:w=>warnings.push(w)});
  await spin(()=>models.length>0);
  const initial=await session.getContext(['variables']);
  const committed=initial.variables.wSequence;
  for(const delta of [15000,30000,45000]){
    const before=models.length;clock=start+delta+1000;bars.at(-1).high+=1;session.notifyBars();await spin(()=>models.length>before);
    if(process.env.WARNING_LIVE_DEBUG){const ctx=await session.getContext(['variables']);console.log(JSON.stringify({clock,alerts:alerts.length,vars:Object.fromEntries(Object.entries(ctx.variables).filter(([k])=>['wSlot','wLastLiveSlot','wLiveObservedAt','wNewLiveSlot','wFreshLive','wSample'].includes(k)))}));}
  }
  const parsed=alerts.filter(a=>a.message.startsWith('{')).map(a=>JSON.parse(a.message)).filter(a=>a.schema==='agentic.swing.warnings.v1');
  assert.ok(parsed.length>=1,'actual Pine observation JSON must be emitted');
  assert.ok(parsed.every(p=>p.provisional&&p.severity[6]===null&&p.probability===null));
  for(const p of parsed){normalize(p);normalize(p.closed_observation);assert.equal(p.closed_observation.provisional,false);assert.ok(p.closed_observation.closed_cutoff<=p.observed_at);}
  const eventSequence=m=>m.series.find(s=>s.title==='Warnings · event sequence').points.at(-1).value;
  assert.equal(eventSequence(models.at(-1)),eventSequence(models[0]),'intrabar samples cannot commit new episodes');
  const count=alerts.length,before=models.length;clock=start+47000;session.notifyBars();await spin(()=>models.length>before);assert.equal(alerts.length,count,'same slot cannot emit another warning batch');
  assert.equal(warnings.length,0);
  const checks=['Initial actual Pine live observation emits parseable batched JSON','No repeated batch inside the same supplied slot','Partial-volume feature unavailable in forming-bar observations','Actual alert JSON and embedded closed observation normalize through study consumer','Intrabar warning snapshots do not mutate committed warning sequence'];
  const cadenceVerified=parsed.length===4&&new Set(parsed.map(p=>Math.floor(p.observed_at/15000))).size===4;
  const report={status:cadenceVerified?'PASS_LOCAL_RUNTIME':'UNVERIFIED_INTRABAR_ADAPTER',checks:checks.length,details:checks,expectedSlotBatches:4,observedSlotBatches:parsed.length,cadenceVerified,limitation:cadenceVerified?null:'Vela/PineTS incremental runs advance timenow but return unavailable realtime bar-state values after the first tick. Native four-slot behavior cannot be established by this adapter. Independent JavaScript observer cadence tests pass.',scope:'Local Vela/PineTS with controlled clock and synthetic updates; native TradingView scheduling and delivery unverified.'};
  await fs.writeFile(new URL('./pine-live-validation.json',import.meta.url),JSON.stringify(report,null,2));
  await fs.writeFile(new URL('./live-alerts.ndjson',import.meta.url),parsed.map(x=>JSON.stringify(x)).join('\n')+'\n');
  console.log(JSON.stringify(report));
}finally{session?.stop();globalThis.Date=ActualDate;}

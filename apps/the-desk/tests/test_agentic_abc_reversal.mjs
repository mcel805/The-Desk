import test from 'node:test';
import {abcLiveDrawing} from '../web/abc-live-drawing.mjs';
import {ABCSharedDisplay} from '../web/abc-shared-display.mjs';
import {abcPlayDrawing} from '../web/abc-play-history.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {installABCExternalSources} from '../web/pine-compat/external-sources.mjs';
import {selectABCFeed,abcTransportInputs,ABCReversalWorker,mergeABCModels} from '../web/abc-reversal-bridge.mjs';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
installNestedSecurity();installABCExternalSources();
const source=await fs.readFile(new URL('../web/pine-examples/agentic-abc-reversal.pine',import.meta.url),'utf8'),original=await fs.readFile(new URL('../web/pine-examples/agentic-abc-reversal-original.pine',import.meta.url),'utf8');
const audit='\nplot(phase,"ABC audit · phase",display=display.data_window)\nplot(touched?1:0,"ABC audit · contact",display=display.data_window)\nplot(shift?1:0,"ABC audit · shift",display=display.data_window)\nplot(readyH or readyG?1:0,"ABC audit · retest passed",display=display.data_window)\nplot(a,"ABC audit · A",display=display.data_window)\nplot(b,"ABC audit · B",display=display.data_window)\nplot(c,"ABC audit · C",display=display.data_window)\n';
const reference=original.replace('"Wave Court · ABC Entries 3.3 Lifecycle", shorttitle="WC ABC 3.3"','"Agentic - ABC Reversal", shorttitle="Agentic - ABC Reversal"')+audit;
const baseInputs={pivotBars:1,parentPivotBars:1,zoneHalfTicks:0,breakBufferTicks:0,minAlegAtr:0,requireHLcounter:false,requireParentAligned:false,geometryPlay:false,abcSummary:false};
export function fixture(short=false){const values=[...Array.from({length:30},(_,i)=>120+Math.sin(i/2)),110,112,115,112,109,106,102,99,101,103,105,103,100,97,99,101,103,106,105.8,107.5,108,109];return values.map((p,i)=>{const b={time:Date.UTC(2026,0,1)+i*60000,open:p,close:p,high:p+.5,low:p-.5,volume:100};if(i===37)b.high=100.5;if(i===48){b.high=106.2;b.low=105;}return short?{...b,open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high}:b;});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,chartStyle:'candles',symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
export function feedModel(bars,{level=100,event={},resistance=100}={}){const make=(title,value)=>({title,points:bars.map((b,i)=>({time:b.time,value:typeof value==='function'?value(i):value}))});return {series:[make('Rider HTF support',level),make('Rider HTF resistance',resistance),make('Reached support · this chart bar',i=>event[i]??NaN),make('Reached resistance · this chart bar',i=>event[i]??NaN),make('C support 2',NaN),make('C support 3',NaN),make('C resistance 2',NaN),make('C resistance 3',NaN)]};}
function producer(bars,model=feedModel(bars),tf='1'){return {source:'indicator("Agentic - Liquidity", "Agentic - Liquidity")',bars,market:market(tf),model};}
async function run({src=source,bars=fixture(),tf='1',inputs={},feed={connected:true,model:feedModel(bars)}}={}){const e=new PineEngine(),prepared=await e.prepare(src,'abc-test');let session,model;const warnings=[],used=abcTransportInputs({...baseInputs,...inputs},feed,inputs.reversalSide||'Long from support',Date.now(),tf);try{await new Promise((resolve,reject)=>session=e.execute({prepared,bars,market:market(tf),inputs:used,mode:'static',historyState:'complete',fetchSeries:async()=>Array.from({length:60},(_,i)=>({time:Date.UTC(2025,11,1)+i*86400000,open:120,close:120,high:121,low:119,volume:100}))},{onModel:m=>model=m,onDone:resolve,onError:reject,onWarning:w=>warnings.push(w)}));return {model:abcLiveDrawing(model,bars,{timeframe:tf}),prepared,warnings};}finally{session?.stop();}}
const rows=(m,title)=>m.series.find(s=>s.title===title)?.points.map(p=>p.value),last=(m,title)=>rows(m,title)?.at(-1);
test('archived attachment hash is stable',()=>{assert.equal(createHash('sha256').update(original).digest('hex'),'263c04e862ba346caa6d7973179f260ea26174b3bd686c9e514966e35f35ac1b');});
for(const short of [false,true])test(`${short?'short':'long'} contact → A → B → C forecast → C → shift → later retest`,async()=>{
 const bars=fixture(short),inputs={reversalSide:short?'Short from resistance':'Long from support'},r=await run({bars,inputs}),old=await run({src:reference,bars,inputs});
 for(const title of ['ABC audit · phase','ABC audit · contact','ABC audit · shift','ABC audit · retest passed','ABC audit · A','ABC audit · B','ABC audit · C','Provisional C level','Reference risk ticks','Lifecycle · handoff this bar','Lifecycle · ABC detected'])assert.deepEqual(rows(r.model,title),rows(old.model,title),title);
 const phases=rows(r.model,'ABC audit · phase');assert.equal(phases[36],0);assert.equal(phases[37],1);assert.equal(phases[41],2);assert.equal(phases[44],3);assert.equal(phases[47],4);assert.equal(phases[48],4);assert.equal(phases[49],5);assert.equal(rows(r.model,'ABC audit · retest passed')[48],0);assert.equal(rows(r.model,'ABC audit · retest passed')[49],1);assert.deepEqual(r.warnings,[]);
});
test('projection is visible after A/B without a confirmed C or a passed retest',async()=>{const r=await run({bars:fixture().slice(0,42),inputs:{abcSummary:true}});assert.equal(last(r.model,'ABC audit · phase'),2);assert.ok(Number.isFinite(last(r.model,'Provisional C level')));assert.equal(last(r.model,'ABC audit · retest passed'),0);assert.ok(r.model.labels.some(l=>l.text.startsWith('C?')));assert.ok(JSON.stringify(r.model.tables).includes('PROVISIONAL'));});
test('missing producer and arbitrary OHLC source cannot arm',async()=>{const bars=fixture();for(const feed of [{connected:false,reason:'missing'},{connected:true,model:{series:feedModel(bars).series.map(s=>({...s,points:bars.map(b=>({time:b.time,value:b.close}))}))}}]){const r=await run({bars,feed});assert.ok(rows(r.model,'ABC audit · phase').every(p=>p===0));assert.equal(r.model.boxes.length,0);}});
for(const tf of ['2','3','15','60'])test(`${tf}m cannot arm`,async()=>{const r=await run({tf});assert.ok(rows(r.model,'ABC audit · phase').every(p=>p===0));assert.equal(r.model.lines.length,0);assert.equal(r.model.boxes.length,0);});
test('5m uses its own completed pivots and matches the original lifecycle',async()=>{const bars=fixture().map((b,i)=>({...b,time:Date.UTC(2026,0,1)+i*300000})),r=await run({tf:'5',bars}),old=await run({src:reference,tf:'5',bars});assert.deepEqual(rows(r.model,'ABC audit · phase'),rows(old.model,'ABC audit · phase'));assert.equal(last(r.model,'ABC audit · phase'),5);});
test('same-bar farther contact wins before ABC; does not supersede an already detected ABC',async()=>{
 for(const [at,expected]of [[44,1],[45,0]]){const bars=fixture().slice(0,at+1),r=await run({bars,feed:{connected:true,model:feedModel(bars,{event:{[at]:95}})}});assert.equal(last(r.model,'Lifecycle · handoff this bar'),expected);if(expected){assert.equal(last(r.model,'ABC audit · phase'),1);assert.ok(!Number.isFinite(last(r.model,'ABC audit · A')));}}
});
test('a new C extreme resets confirmation; retest risk gate can block the final pass',async()=>{const bars=fixture();bars[45]={...bars[45],low:95,close:96,open:96,high:97};const r=await run({bars:bars.slice(0,46)});assert.equal(last(r.model,'ABC audit · phase'),2);const blocked=await run({inputs:{maxRiskTicks:1}});assert.ok(rows(blocked.model,'ABC audit · retest passed').every(p=>p===0));});
test('C-to-HL geometry needs a later touch and separate follow-through candle',async()=>{const bars=fixture();bars[50]={...bars[50],open:109.2,close:109.2,high:109.8,low:108.2};bars[51]={...bars[51],open:111,close:111,high:112,low:110};const inputs={horizontalPlay:false,geometryPlay:true},r=await run({bars,inputs}),old=await run({src:reference,bars,inputs});assert.deepEqual(rows(r.model,'ABC audit · retest passed'),rows(old.model,'ABC audit · retest passed'));assert.equal(rows(r.model,'ABC audit · retest passed')[50],0);assert.equal(rows(r.model,'ABC audit · retest passed')[51],1);});
test('an unconfirmed campaign expires without recycling a touch into a signal',async()=>{let bars=fixture().slice(0,42);for(let i=42;i<65;i++)bars.push({time:bars[0].time+i*60000,open:102,close:102,high:102.5,low:101.5,volume:100});const r=await run({bars,inputs:{campaignBars:20,cooldownBars:15}});assert.equal(last(r.model,'ABC audit · phase'),5);assert.ok(rows(r.model,'ABC audit · retest passed').every(p=>p===0));assert.equal(r.model.boxes.length,0);});
test('counter-day requires the additional confirmed structure; volume and obstacle gates remain effective',async()=>{
 const bars=fixture().slice(0,50);bars[48]={...bars[48],open:106,close:106,high:107.5,low:105};bars[49]={...bars[49],open:108.5,close:108.5,high:109,low:108};const permissive=await run({bars});assert.equal(last(permissive.model,'ABC audit · retest passed'),1);
 for(const inputs of [{requireHLcounter:true},{entryVolume:true,volumeThreshold:2},{useObstacle:true,obstaclePrice:108.6,minRoomR:2}]){const gated=await run({bars,inputs});assert.equal(last(gated.model,'ABC audit · retest passed'),0);}
});
test('losing confirmed C after SHIFT restarts the same liquidity campaign with old C as A',async()=>{const bars=fixture().slice(0,49);bars[48]={...bars[48],low:95,high:97,open:96,close:96};const r=await run({bars});assert.ok([1,2].includes(last(r.model,'ABC audit · phase')));assert.equal(last(r.model,'ABC audit · A'),96.5);assert.ok(!Number.isFinite(last(r.model,'ABC audit · C')));assert.equal(last(r.model,'ABC audit · retest passed'),0);});
// Place the synthetic forming candle safely ahead of wall-clock rollover.
test('forming wick cannot advance or destroy the completed lifecycle',async()=>{const now=Math.floor(Date.now()/60000)*60000,bars=fixture().slice(0,48).map((b,i)=>({...b,time:now-(48-i)*60000})),before=await run({bars}),forming={time:now+10*60000,open:106,close:50,high:1000,low:1,volume:100};const after=await run({bars:[...bars,forming],feed:{connected:true,model:feedModel([...bars,forming])}});assert.equal(rows(after.model,'ABC audit · phase').at(-2),last(before.model,'ABC audit · phase'));assert.equal(last(after.model,'ABC audit · phase'),last(before.model,'ABC audit · phase'));});
test('broker requires exactly one same-chart producer and matching completed OHLC',()=>{const bars=fixture(),req={market:market('1'),bars};assert.equal(selectABCFeed(new Map(),req).connected,false);const records=new Map([['liq',producer(bars)]]);assert.equal(selectABCFeed(records,req).connected,true);records.set('liq2',producer(bars));assert.equal(selectABCFeed(records,req).connected,false);records.delete('liq2');assert.equal(selectABCFeed(records,{...req,market:{...req.market,symbol:'other:MYM'}}).connected,false);assert.equal(selectABCFeed(records,{...req,bars:bars.map((b,i)=>i===5?{...b,high:b.high+1}:b)}).connected,false);assert.equal(selectABCFeed(new Map([['pine-test-liq',producer(bars)]]),req).connected,false);});
test('timestamp feeds never shift samples or fill missing/future samples with close',()=>{const bars=fixture(),feed={connected:true,model:feedModel(bars)},inputs=abcTransportInputs({},feed,'Long from support',bars[10].time+60000,'1');assert.equal(inputs.externalLevel.values[bars[10].time],100);assert.equal(inputs.externalLevel.values[bars[11].time],undefined);assert.equal(inputs.reachedFeed.values[bars[2].time],null);});
test('both-side wrapper merges distinct drawings and removes connection transport from saved inputs',async()=>{
 const bars=fixture().slice(0,42),e=new PineEngine(),records=new Map([['liq',producer(bars)]]);let notify;const worker={prepare:(...a)=>e.prepare(...a),execute:(...a)=>e.execute(...a),terminate(){}};
 const bridge=new ABCReversalWorker({records,worker,subscribe:f=>{notify=f;return()=>{notify=null;};}}),prepared=await bridge.prepare(source,'abc-wrapper');let session,model;try{await new Promise((resolve,reject)=>session=bridge.execute({prepared,bars,market:market('1'),inputs:{...baseInputs,abcSummary:true},historyState:'complete'},{onModel:m=>model=m,onDone:resolve,onError:reject}));assert.equal(model.tables.length,1);assert.equal(model.abcBridge.connected,true);assert.ok(model.series.some(s=>s.title==='Long · ABC audit · phase'));assert.ok(model.series.some(s=>s.title==='Short · ABC audit · phase'));assert.equal(model.inputValues.externalLevel,undefined);assert.ok(!prepared.inputs.some(s=>s.key==='externalLevel'));assert.equal(new Set(model.lines.map(l=>l.id)).size,model.lines.length);
  const saved=pineState({indicators:()=>[{id:'abc',title:'Agentic - ABC Reversal',source,visible:true,inputValues:()=>model.inputValues,propValues:()=>({})}]}),restored=[];restorePineState(saved,{chart:{indicators:()=>[]},addIndicator:e=>restored.push(e)});assert.deepEqual(restored[0].inputs,model.inputValues);
 }finally{session?.stop();bridge.terminate();assert.equal(notify,null);}
});
test('producer arrival, removal, settings, direction and disposal refresh the wrapper without stale campaigns',async()=>{
 const bars=fixture().slice(0,42),records=new Map(),engine=new PineEngine(),worker={prepare:(...a)=>engine.prepare(...a),execute:(...a)=>engine.execute(...a),terminate(){}};let notify,resolveDone,rejectDone,model;const bridge=new ABCReversalWorker({records,worker,subscribe:fn=>{notify=fn;return()=>{notify=null;};}}),prepared=await bridge.prepare(source,'lifecycle'),wait=()=>new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});let session;
 try{let done=wait();session=bridge.execute({prepared,bars,market:market('1'),inputs:{...baseInputs,abcSummary:true}},{onModel:m=>model=m,onDone:()=>resolveDone(),onError:e=>rejectDone(e)});await done;assert.equal(model.abcBridge.connected,false);assert.equal(model.lines.length,0);
  records.set('liq',producer(bars));records.set('duplicate',producer(bars));done=wait();notify();await done;assert.equal(model.abcBridge.connected,false);assert.match(model.abcBridge.reason,/Multiple/);
  records.delete('duplicate');done=wait();notify();await done;assert.equal(model.abcBridge.connected,true);assert.ok(model.lines.length);assert.ok(model.series.find(s=>s.title==='Long · ABC audit · phase').points.some(p=>p.value===2));
  done=wait();session.update({reversalSide:'Short from resistance'});await done;assert.equal(model.tables.length,1);assert.ok(model.series.every(s=>s.title.startsWith('Short · ')));
  records.clear();done=wait();notify();await done;assert.equal(model.lines.length,0);assert.equal(model.boxes.length,0);assert.equal(model.abcBridge.connected,false);
 }finally{session?.stop();bridge.terminate();assert.equal(notify,null);}
});

test('streaming wick redraw does not re-execute Pine or change completed audit state',async()=>{
 const now=Date.now(),completedBars=fixture().slice(0,42).map((b,i)=>({...b,time:now-(42-i)*60000}));
 let bars=[...completedBars,{...completedBars.at(-1),time:now}],executions=0;
 const records=new Map([['liq',producer(bars)]]),engine=new PineEngine();
 const worker={prepare:(...args)=>engine.prepare(...args),execute:(...args)=>{executions++;return engine.execute(...args);},terminate(){}};
 const bridge=new ABCReversalWorker({records,worker,subscribe:()=>()=>{}}),prepared=await bridge.prepare(source,'tick-wrapper');
 let session,model,resolveDone,rejectDone;const wait=()=>new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
 try{
  let done=wait();session=bridge.execute({prepared,bars,getBars:()=>bars,market:market('1'),inputs:{...baseInputs,reversalSide:'Long from support'}},{onModel:m=>model=m,onDone:()=>resolveDone(),onError:e=>rejectDone(e)});await done;
  const before=structuredClone(model),runs=executions;assert.ok(before.lines.some(l=>l.id.endsWith('developing-C')));
  bars=[...completedBars,{...bars.at(-1),low:80,close:82}];done=wait();session.notifyBars('tick');await done;
  assert.equal(executions,runs);assert.equal(model.lines.find(l=>l.id.endsWith('developing-C')).y2,80);assert.deepEqual(model.series,before.series);
  assert.equal(model.lines.length,before.lines.length);assert.equal(new Set(model.lines.map(l=>l.id)).size,model.lines.length);
 }finally{session?.stop();bridge.terminate();}
});

test('upgraded visual defaults persist in the host input object and later edits remain possible',async()=>{
 const inputs={showProjection:false,longColor:'#FFFFFFE0',shortColor:'#FFFFFFE0',pivotBars:3};let transported;
 const worker={execute:(req,h)=>{transported=req.inputs;queueMicrotask(()=>{h.onModel({inputValues:req.inputs,series:[],lines:[],labels:[]});h.onDone();});return {stop(){}};},terminate(){}};
 const bridge=new ABCReversalWorker({records:new Map(),worker,subscribe:()=>()=>{}});
 const prepared={abcVisualUpgrade:true,token:{instanceId:'upgrade'},inputs:['showProjection','longColor','shortColor','pivotBars'].map(key=>({key,defval:null}))};
 let session,resolveDone;const wait=()=>new Promise(resolve=>{resolveDone=resolve;});
 try{let done=wait();session=bridge.execute({prepared,bars:[],market:market('1'),inputs},{onModel(){},onDone:()=>resolveDone()});await done;
  assert.equal(inputs.showProjection,true);assert.equal(inputs.longColor,'#00B8A9FF');assert.equal(inputs.shortColor,'#F23645FF');assert.equal(transported.pivotBars,3);
  done=wait();session.update({...inputs,showProjection:false,longColor:'#FFFFFFE0'});await done;assert.equal(transported.showProjection,false);assert.equal(transported.longColor,'#FFFFFFE0');
 }finally{session?.stop();bridge.terminate();}
});

test('real Pine qualification keeps the liquidity play highlighted until another line is actually touched',async()=>{
 const bars=fixture(),lastBar=bars.at(-1);bars.push({...lastBar,time:lastBar.time+60000,open:109,close:111,high:112,low:108});
 const feed={connected:true,model:feedModel(bars,{resistance:110})},r=await run({bars,feed});
 const activeBars=bars.slice(0,-1),liveFeed={connected:true,model:feedModel(activeBars,{resistance:110})},live=await run({bars:activeBars,feed:liveFeed});
 const tracking=abcPlayDrawing(live.model,activeBars,{feed:liveFeed});assert.equal(tracking.abcPlays.at(-1).status,'in-play');assert.ok(tracking.abcPlays.at(-1).qualifiedAt);assert.ok(tracking.boxes.some(b=>b.id.endsWith(':highlight')));assert.ok(tracking.lines.some(l=>l.id.endsWith(':in-play')&&l.width===2));
 const done=abcPlayDrawing(r.model,bars,{feed});assert.equal(done.abcPlays.at(-1).end.reason,'Next liquidity level');assert.equal(done.abcPlays.at(-1).end.price,110);assert.ok(done.lines.some(l=>l.id.endsWith(':end-tick')));assert.ok(done.lines.some(l=>l.id.endsWith(':A')&&l.style==='dashed'));assert.deepEqual(done.series,r.model.series);
});
test('real Pine outputs retain entry decisions while a later confirmed HL close records the play endpoint',async()=>{
 const bars=fixture();for(const price of [111,108,112,106])bars.push({time:bars.at(-1).time+60000,open:price,close:price,high:price+.5,low:price-.5,volume:100});
 const feed={connected:true,model:feedModel(bars,{resistance:150})},r=await run({bars,feed}),done=abcPlayDrawing(r.model,bars,{feed});
 assert.equal(rows(done,'ABC audit · retest passed')[49],1);assert.equal(done.abcPlays.at(-1).end.reason,'Confirmed structure break');assert.equal(done.abcPlays.at(-1).end.time,bars.at(-1).time);assert.deepEqual(done.series,r.model.series);
});
test('exact v2 saved sources upgrade the play presentation; edited scripts stay intact',async t=>{
 const {inflateSync}=await import('node:zlib');const old=inflateSync(Buffer.from((await fs.readFile(new URL('./fixtures/agentic-abc-v2.deflate.txt',import.meta.url),'utf8')).trim(),'base64')).toString();
 t.mock.method(globalThis,'fetch',async()=>new Response(source));
 const worker={prepare:async(text,id)=>({token:{source:text,instanceId:id},inputs:[]}),terminate(){}};
 const bridge=new ABCReversalWorker({records:new Map(),worker,subscribe:()=>()=>{}});
 const upgraded=await bridge.prepare(old,'v2');assert.equal(upgraded.token.source,source);assert.equal(upgraded.abcPlayUpgrade,true);assert.equal(upgraded.abcVisualUpgrade,false);
 const custom=old+'\n// user customization',preserved=await bridge.prepare(custom,'custom');assert.equal(preserved.token.source,custom);assert.equal(preserved.abcPlayUpgrade,false);bridge.terminate();
});
test('history default migrates once and a later user toggle remains respected',async()=>{
 const inputs={keepHistory:false,longColor:'#123456'},prepared={abcPlayUpgrade:true,token:{instanceId:'play-upgrade'},inputs:[{key:'keepHistory',defval:true},{key:'longColor',defval:'#00B8A9'}]};let resolveDone;
 const worker={execute:(req,h)=>{queueMicrotask(()=>{h.onModel({inputValues:req.inputs,series:[],lines:[],labels:[]});h.onDone();});return {stop(){}};},terminate(){}};
 const bridge=new ABCReversalWorker({records:new Map(),worker,subscribe:()=>()=>{}}),wait=()=>new Promise(resolve=>resolveDone=resolve);let session;
 try{let done=wait();session=bridge.execute({prepared,bars:[],market:market('1'),inputs},{onModel(){},onDone:()=>resolveDone()});await done;assert.equal(inputs.keepHistory,true);assert.equal(inputs.longColor,'#123456');done=wait();session.update({keepHistory:false});await done;assert.equal(prepared.abcPlayUpgrade,false);}finally{session?.stop();bridge.terminate();}
});


test('30m receives 1m touched-line markers on source arrival and clears them on disposal without gaining ABC signals',async()=>{
 const sharedDisplay=new ABCSharedDisplay(),bars=fixture().slice(0,42),thirty=[{...bars[0],time:bars[0].time},{...bars.at(-1),time:bars[0].time+30*60000}];
 const make=records=>{const engine=new PineEngine();return new ABCReversalWorker({records,sharedDisplay,subscribe:()=>()=>{},worker:{prepare:(...a)=>engine.prepare(...a),execute:(...a)=>engine.execute(...a),terminate(){}}});};
 const one=make(new Map([['liq',producer(bars)]])),htf=make(new Map());let sourceSession,targetSession,targetModel;const alerts=[];
 const start=async(bridge,id,tf,data,onModel)=>{const prepared=await bridge.prepare(source,id);let session;await new Promise((resolve,reject)=>{session=bridge.execute({prepared,bars:data,market:market(tf),inputs:{...baseInputs,reversalSide:'Long from support'},historyState:'complete'},{onModel,onDone:resolve,onError:reject,onAlert:a=>alerts.push(a)});});return session;};
 try{
  targetSession=await start(htf,'shared-target','30',thirty,m=>targetModel=m);assert.equal(targetModel.lines.length,0);
  let sourceModel;sourceSession=await start(one,'shared-source','1',bars,m=>sourceModel=m);
  assert.equal(targetModel.abcShared.sourceTimeframe,'1');assert.deepEqual(targetModel.abcPlays,sourceModel.abcPlays);
  assert.equal(targetModel.labels.length,0);const tick=targetModel.lines.find(l=>l.id.endsWith(':start-tick'));assert.ok(tick);assert.equal(tick.x1,sourceModel.abcPlays[0].start.time);
  assert.equal(targetModel.lines.find(l=>l.id.endsWith(':in-play')).y1,sourceModel.abcPlays[0].level);
  assert.ok(targetModel.series.find(s=>s.title==='Long · ABC audit · contact').points.every(p=>p.value===0));assert.equal(targetModel.abcBridge.connected,false);assert.equal(alerts.length,0);
  sourceSession.stop();assert.equal(targetModel.lines.length,0);assert.equal(targetModel.labels.length,0);assert.equal(targetModel.abcShared,null);
 }finally{sourceSession?.stop();targetSession?.stop();one.terminate();htf.terminate();assert.equal(sharedDisplay.sources.size,0);assert.equal(sharedDisplay.listeners.size,0);}
});

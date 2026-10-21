import test from 'node:test';
import {marketGeometryDrawing} from '../web/abc-live-drawing.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {DeskPineEngine,pineWorkerOptions} from '../web/pine-runtime.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
import {defaults,geometryReference} from './helpers/geometry-reference.mjs';
installNestedSecurity();
const original=await fs.readFile(new URL('../web/pine-examples/agentic-market-geometry-original.pine',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../web/pine-examples/agentic-market-geometry.pine',import.meta.url),'utf8');
const manifest=JSON.parse(await fs.readFile(new URL('../source-manifest.json',import.meta.url),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
export function fixture(tf='1',n=600,gaps=false){return Array.from({length:n},(_,i)=>{const p=52000+150*Math.sin(i/20)+50*Math.sin(i/4)+i*.2;return {time:Date.UTC(2026,0,1)+(i+(gaps?Math.floor(i/100)*180:0))*Number(tf)*60000,open:p,high:p+10,low:p-10,close:p+2,volume:100};});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
async function run(src=source,{tf='1',bars=fixture(tf),inputs={}}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'geometry-test');let session,model;const warnings=[];
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:market(tf),inputs,historyState:'complete',mode:'static',fetchSeries:()=>{throw Error('Chart-local indicator must not request secondary candles');}},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:resolve,onError:reject});});return {model,prepared,warnings};}finally{session?.stop();}
}
const clean=v=>JSON.parse(JSON.stringify(v,(k,v)=>k==='id'?undefined:v));
function compareLines(actual,expected){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)for(const key of Object.keys(expected[i])){if(typeof expected[i][key]==='number')assert.ok(Math.abs(actual[i][key]-expected[i][key])<1e-7,`${i}.${key}: ${actual[i][key]} != ${expected[i][key]}`);else assert.equal(actual[i][key],expected[i][key]);}}
test('original byte contract and name-only port fingerprints',()=>{
 assert.equal(source,original.replace('"Wave Court · Market Geometry 1.0", "WC Geometry 1.0"','"Agentic - Market Geometry", "Agentic - Market Geometry"'));
 assert.equal(hash(original),manifest.agentic_market_geometry.original_sha256);assert.equal(hash(source),manifest.agentic_market_geometry.source_sha256);
 assert.match(pineWorkerOptions(source).workerUrl,/pine-compatible-worker\.js$/);assert.deepEqual(pineWorkerOptions(source.replaceAll('Agentic - Market Geometry','Unrelated')),{});
});
for(const [label,tf,inputs,gaps,n] of [
 ['1-minute defaults','1',{},false,600],['1-hour defaults','60',{},false,600],['session gaps','1',{},true,600],
 ['long history and labels','60',{geometryHistory:1200,geometryShowLabels:true},true,1400],
 ['short history and stricter pivots','1',{geometryHistory:100,geometryPivot:15,geometryMinSpan:40},false,800],
 ['touch filter and tolerance','1',{geometryMinTouches:3,geometryTouchTolerance:10,geometryPivot:2},false,600],
 ['active-only channels','60',{geometryShowBroken:false},false,570],
 ['display quotas','1',{geometryShown:3,geometryActiveShown:1,geometryShowLabels:true},false,570],
 ['maximum quotas','1',{geometryShown:24,geometryActiveShown:24,geometryPivot:2},false,800],
 ['channels hidden','60',{showChannels:false,geometryShowLabels:true},false,600]
])test(`${label}: original and port match independent timestamp-based ledger`,async()=>{
 const bars=fixture(tf,n,gaps),expected=geometryReference(bars,inputs),r=await run(source,{tf,bars,inputs}),old=await run(original,{tf,bars,inputs});
 assert.equal(r.prepared.meta.title,'Agentic - Market Geometry');assert.equal(r.prepared.inputs.length,12);
 assert.deepEqual(clean(r.model.lines),clean(old.model.lines));assert.deepEqual(clean(r.model.labels),clean(old.model.labels));
 compareLines(r.model.lines,expected.lines);assert.deepEqual(r.warnings,[]);
 assert.equal(r.model.labels.length,inputs.geometryShowLabels?Math.min(3,expected.selected.length):0);
 for(let i=0;i<r.model.labels.length;i++){const g=expected.selected[i];assert.equal(r.model.labels[i].text,`${tf} channel · ${g.broken?'ended at wick break':'active'} · ${g.touches} extra contacts`);}
});
test('wick rails never cut any retained interval and stop before a completed breach',async()=>{
 const bars=fixture('1',570),oracle=geometryReference(bars),{model}=await run(source,{bars});compareLines(model.lines,oracle.lines);
 assert.ok(oracle.selected.some(g=>g.broken));assert.ok(oracle.selected.some(g=>!g.broken));
 for(const g of oracle.selected){const rail=t=>g.p0+(g.p1-g.p0)*(t-g.t0)/(g.t1-g.t0),inside=b=>g.side<0?b.low>=rail(b.time)-.0001&&b.high<=rail(b.time)+g.offset+.0001:b.high<=rail(b.time)+.0001&&b.low>=rail(b.time)-g.offset-.0001;
  assert.ok(bars.filter(b=>b.time>=g.t0&&b.time<=g.endAt).every(inside));if(g.broken)assert.equal(inside(bars.find(b=>b.time>g.endAt)),false);
 }
});
test('rightmost equal wick pivots and tick touch tolerance follow the ledger',async()=>{
 const bars=fixture('1',600).map(b=>({...b,high:Math.round(b.high),low:Math.round(b.low)}));
 const {model}=await run(source,{bars,inputs:{geometryPivot:2}});compareLines(model.lines,geometryReference(bars,{geometryPivot:2}).lines);
});
test('forming candle cannot break completed rails, and completed successor does',async()=>{
 const completed=fixture('1',570),now=Math.floor(Date.now()/60000)*60000;
 const bars=completed.map((b,i)=>({...b,time:now-(completed.length-i)*60000}));
 const forming={time:now,open:52000,close:52000,high:1e8,low:1,volume:100};
 const frozen=await run(source,{bars}),during=await run(source,{bars:[...bars,forming]});assert.deepEqual(clean(during.model.lines),clean(frozen.model.lines));
 const closed=[...bars,forming].map(b=>({...b,time:b.time-120000}));const after=await run(source,{bars:closed});assert.notDeepEqual(clean(after.model.lines),clean(during.model.lines));compareLines(after.model.lines,geometryReference(closed).lines);
});
test('input updates hide and re-enable channels; colors and labels use original settings',async()=>{
 const engine=new PineEngine(),prepared=await engine.prepare(source,'geometry-update'),models=[];let session,done,fail;
 const wait=()=>new Promise((r,j)=>{done=r;fail=j;});let next=wait();
 try{session=engine.execute({prepared,bars:fixture('1',570),market:market('1'),inputs:{geometryShowLabels:true},historyState:'complete',mode:'static'},{onModel:m=>models.push(m),onDone:()=>done(),onError:e=>fail(e)});await next;
  assert.ok(models.at(-1).lines.length);assert.ok(models.at(-1).labels.length);
  next=wait();session.update({showChannels:false});await next;assert.equal(models.at(-1).lines.length,0);assert.equal(models.at(-1).labels.length,0);
  next=wait();session.update({showChannels:true,geometryActiveInk:'#FF0000FF',geometryBrokenInk:'#00FF00FF'});await next;
  assert.ok(models.at(-1).lines.some(l=>l.style==='solid'&&l.color==='#FF0000FF'));assert.ok(models.at(-1).lines.some(l=>l.style==='dashed'&&l.color==='#00FF00FF'));
 }finally{session?.stop();}
});
test('saved hidden study restores all twelve inputs and identical drawings',async()=>{
 const inputs={...defaults,geometryPivot:3,geometryShown:5,geometryShowLabels:true};const before=await run(source,{inputs}),saved=pineState({indicators:()=>[{id:'geometry',title:'Agentic - Market Geometry',source,visible:false,inputValues:()=>inputs,propValues:()=>({})}]});const restored=[];
 restorePineState(saved,{chart:{indicators:()=>[]},addIndicator:e=>restored.push(e)});assert.equal(restored[0].hidden,true);assert.deepEqual(restored[0].inputs,inputs);
 const after=await run(restored[0].script,{inputs:restored[0].inputs});assert.deepEqual(clean(after.model.lines),clean(before.model.lines));assert.deepEqual(clean(after.model.labels),clean(before.model.labels));
});
test('sub-minute chart is rejected by the original runtime guard',async()=>{await assert.rejects(run(source,{tf:'30S',bars:fixture('1',20)}),/standard time-based candles of at least one minute/);});
test('Desk adapter preserves drawings while excluding rails from candle autoscale',async()=>{
 let handlers;const worker={prepare:async(s,id)=>({token:{source:s,instanceId:id}}),terminate(){},execute:(_,h)=>{handlers=h;return {stop(){},update(){}};}};
 const engine=new DeskPineEngine({factory:()=>worker}),prepared=await engine.prepare(source,'geometry'),models=[];const session=engine.execute({prepared,bars:fixture(),market:market('1')},{onModel:m=>models.push(m)});
 const model=(await run()).model;handlers.onModel(model);session.update({geometryShowLabels:true});handlers.onModel(model);
 assert.equal(models.length,2);assert.ok(models.every(m=>m.drawingAutoscale===false));assert.deepEqual(models[0].lines,marketGeometryDrawing(model,'1').lines);session.stop();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {pineWorkerOptions} from '../web/pine-runtime.mjs';
import {drawingCounts,plotRows} from '../web/pine-validation.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
installNestedSecurity();
const minute=60000,end=Date.UTC(2026,9,9,20);
const duration=tf=>({'D':1440,'1D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'1':1}[tf])*minute;
function fixture(tf,n=600){const width=duration(tf);return Array.from({length:n},(_,i)=>{const time=end-(n-i)*width,p=51000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+10*Math.sin(i),volume:1000+i%40};});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
async function run(source,{tf='60',inputs={},bars=fixture(tf),fetchSeries=async(_,f,r)=>fixture(f,r.limit||600)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(source,'cleo-test');let session,model;const warnings=[],started=performance.now();
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Execution exceeded 120 seconds')),120000);session=engine.execute({prepared,bars,market:market(tf),inputs,visibleRange:{left:bars.at(-200)?.time||bars[0].time,right:end+duration(tf)*50},historyState:'complete',mode:'static',fetchSeries},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:()=>{clearTimeout(timer);resolve();},onError:e=>{clearTimeout(timer);reject(e);}});});return {prepared,model,bars,warnings,milliseconds:performance.now()-started};}finally{session?.stop();}
}
const original=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity-original.pine',import.meta.url),'utf8');
const named=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');
const normalize=value=>JSON.parse(JSON.stringify(value,(key,v)=>['id','title','shorttitle'].includes(key)?undefined:v));
let namedResult;
test('Cleo export preserves its input schema and renders readable display defaults',async()=>{
 const originalPrepared=await new PineEngine().prepare(original,'cleo-original');namedResult=await run(named);
 assert.equal(namedResult.prepared.meta.title,"Cleo's Liquidity");assert.equal(namedResult.prepared.inputs.length,199);
 const inputSchema=inputs=>inputs.map(({key,title,type,group})=>({key,title,type,group}));assert.deepEqual(inputSchema(namedResult.prepared.inputs),inputSchema(originalPrepared.inputs));
 assert.equal(namedResult.prepared.inputs.find(i=>i.key==='rawScope')?.defval,'Chart and higher');assert.equal(namedResult.prepared.inputs.find(i=>i.key==='rawDisplayMode')?.defval,'Nearest N');
 assert.match(pineWorkerOptions(named).workerUrl,/pine-compatible-worker\.js$/,'Cleo must keep using the nested-security worker after its display-source update');
 assert.equal(pineWorkerOptions(named.replace('input.string("Nearest N", "Core line display"','input.string("All retained", "Core line display"')).workerUrl,pineWorkerOptions(named).workerUrl,'saved input changes must retain Cleo runtime routing');
 const counts=drawingCounts(namedResult.model);assert.ok(counts.lines>20);assert.ok(counts.labels>10);assert.equal(counts.tables,1);assert.ok(namedResult.warnings.every(w=>!/out.of.bounds|unsupported|error/i.test(w.message)));
});
test('nested requests independently resolve completed higher timeframe OHLC and lower timeframe master bars with shared input overrides',async()=>{
 const src=`//@version=6\nindicator("Nested fixture")\nscale=input.int(2,"Scale")\nf_parent() =>\n    [v,t] = request.security(syminfo.tickerid,"D",[high[1]*scale,time_close[1]],lookahead=barmerge.lookahead_on,calc_bars_count=20)\n    [v,t]\nf_master() =>\n    [p,t] = f_parent()\n    [p,t,close]\n[a,t,m] = request.security(syminfo.tickerid,"1",f_master(),lookahead=barmerge.lookahead_off,calc_bars_count=200)\nplot(a,"Parent")\nplot(t,"Cutoff")\nplot(m,"Master")`;
 const hours=Array.from({length:48},(_,i)=>({time:end-(48-i)*60*minute,open:i,high:i+1,low:i-1,close:i+.5,volume:1}));
 const dailyStart=Math.floor(end/duration('D'))*duration('D');
 const daily=Array.from({length:5},(_,i)=>({time:dailyStart-(4-i)*1440*minute,open:100+i,high:200+i,low:50,close:150+i,volume:1}));
 const lower=Array.from({length:2880},(_,i)=>({time:hours[0].time+i*minute,open:i,high:i+1,low:i-1,close:i+.5,volume:1}));
 const calls=[];const {model}=await run(src,{bars:hours,inputs:{scale:3},fetchSeries:async(s,f,r)=>{calls.push([f,r.limit]);return f==='1'?lower:daily;}});
 const rows=plotRows(model,hours,end);assert.ok(calls.some(([f])=>f==='1'));assert.ok(calls.some(([f,n])=>f==='D'&&n===20));
 for(let i=0;i<rows.length;i++){const start=Math.floor(rows[i].time/duration('D'))*duration('D'),previous=daily.find(d=>d.time===start-duration('D'));assert.equal(rows[i].Parent,previous.high*3);assert.equal(rows[i].Cutoff,previous.time+duration('D'));assert.equal(rows[i].Master,lower[(i+1)*60-1].close);}
});
test('a UDT function parameter shadowing second preserves its field values',async()=>{
 const src=`//@version=6\nindicator("Parameter shadow")\ntype Point\n    float p\nf_delta(Point first, Point second) =>\n    second.p-first.p\nplot(f_delta(Point.new(open),Point.new(close)),"Delta")`;
 const bars=fixture('60',10),{model}=await run(src,{bars});const rows=plotRows(model,bars,end);rows.forEach((r,i)=>assert.ok(Math.abs(r.Delta-(bars[i].close-bars[i].open))<1e-8));
});
test('all display toggles and manual anchors execute, preserve analytical plots, and hide optional layers',async()=>{
 const inputs={showWaves:false,showChannels:false,showStructure:false,showRaw:false,showConfluence:false,showFib:false,showProjection:false,panelMode:'Off'};
 const hidden=await run(named,{inputs});assert.equal(hidden.model.lines.length,0);assert.equal(hidden.model.labels.length,0);
 namedResult??=await run(named);const baseline=plotRows(namedResult.model,namedResult.bars,end),rows=plotRows(hidden.model,hidden.bars,end);const analytical=rows=>rows.map(({['Micro tags drawable']:displayOnly,...row})=>row);assert.deepEqual(analytical(rows),analytical(baseline),'visibility settings retain analytical outputs');assert.equal(rows.at(-1)['Micro tags drawable'],0);
});
test('manual anchors create original candidate and Fibonacci geometry',async()=>{
 const manualInputs={manualEnabled:true,showFib:true,showProjection:true,panelMode:'Expanded'};for(let i=0;i<6;i++){manualInputs['manT'+i]=end-(18-i*2)*duration('60');manualInputs['manP'+i]=[51000,51200,51100,51500,51300,51600][i];}
 const manual=await run(named,{inputs:manualInputs});assert.ok(manual.model.lines.length>0);assert.equal(manual.model.labels.filter(l=>String(l.text).startsWith('Fib ')).length,7);assert.ok(manual.model.labels.filter(l=>String(l.text).startsWith('Fib ')).every(l=>Number.isFinite(l.x)));assert.ok(manual.model.lines.every(l=>Number.isFinite(l.x1)&&Number.isFinite(l.x2)));assert.equal(manual.model.tables.length,1);assert.equal(manual.model.inputValues.manualEnabled,true);
});
test('Cleo persistence restores all inputs, visibility, anchors, and runtime geometry',async()=>{
 const seed=namedResult??await run(named),inputs=Object.fromEntries(seed.prepared.inputs.map(input=>[input.key,input.defval]));assert.equal(Object.keys(inputs).length,199);
 Object.assign(inputs,{manualEnabled:true,showFib:true,showProjection:true,panelMode:'Expanded'});for(let i=0;i<6;i++){inputs['manT'+i]=end-(18-i*2)*duration('60');inputs['manP'+i]=[51000,51200,51100,51500,51300,51600][i];}
 const before=await run(named,{inputs}),handle={id:'desk-pine-cleo',title:"Cleo's Liquidity",source:named,visible:false,inputValues:()=>structuredClone(inputs),propValues:()=>({}),remove(){}};const payload=pineState({indicators:()=>[handle]});assert.equal(payload.length,1);assert.equal(Object.keys(payload[0].inputs).length,199);assert.equal(payload[0].hidden,true);assert.equal(payload[0].inputs.manualEnabled,true);assert.deepEqual(payload[0].inputs.manT0,inputs.manT0);assert.deepEqual(payload[0].inputs.manP5,inputs.manP5);
 const restored=[];restorePineState(payload,{chart:{indicators:()=>[handle]},addIndicator:entry=>restored.push(entry)});assert.equal(restored.length,1);assert.deepEqual(restored[0].inputs,payload[0].inputs);assert.equal(restored[0].hidden,true);
 const after=await run(restored[0].script,{inputs:restored[0].inputs,bars:before.bars});assert.deepEqual(after.model.inputValues,before.model.inputValues);for(const key of ['series','lines','boxes','labels','polylines','linefills','tables'])assert.deepEqual(normalize(after.model[key]),normalize(before.model[key]),key);
});
test('1M chart executes the canonical master directly and retains source timeframe colors and tiny merged tags',async()=>{
 const result=await run(named,{tf:'1'});assert.ok(result.model.lines.length>0);assert.ok(result.model.labels.length>0);assert.equal(result.prepared.inputs.find(i=>i.key==='rawScope')?.defval,'Chart and higher');assert.equal(result.prepared.inputs.find(i=>i.key==='rawDisplayMode')?.defval,'Nearest N');const labels=result.model.labels.filter(l=>/^(D|1440|240|60|30|15|5|1)(\/(D|1440|240|60|30|15|5|1))*$/.test(String(l.text)));assert.ok(labels.length>0,'liquidity timeframe tags must render');
});
test('4H renders timeframe-and-higher liquidity promptly and broken levels carry no timeframe tag',async()=>{
 const inputs={rawScope:'Chart and higher',showWaves:false,showChannels:false,showProjection:false,showWaveInvalidation:false,showFib:false,showSwingPath:false,showConfluence:false,panelMode:'Off'};
 const result=await run(named,{tf:'240',inputs});
 assert.equal(result.prepared.inputs.find(i=>i.key==='rawScope')?.defval,'Chart and higher');
 assert.equal(result.prepared.inputs.find(i=>i.key==='rawDisplayMode')?.defval,'Nearest N');
 assert.ok(result.model.lines.length>0,'4H and daily liquidity drawings must render');
 const frameTags=result.model.labels.filter(l=>/^(1440|240|60|30|15|5|1)(\/(1440|240|60|30|15|5|1))*$/.test(String(l.text)));
 assert.ok(frameTags.length>0,'active 4H and daily liquidity lines keep their source tags');
 assert.ok(frameTags.every(l=>l.x>result.bars.at(-1).time),'broken historical levels must not show source-timeframe tags');
 assert.ok(result.milliseconds<120000,`4H execution took ${Math.round(result.milliseconds)} ms`);
});

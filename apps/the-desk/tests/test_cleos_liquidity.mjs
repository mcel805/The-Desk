import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {drawingCounts,plotRows,compareReference,rowsToCsv} from '../web/pine-validation.mjs';
installNestedSecurity();
const minute=60000,end=Date.UTC(2026,9,9,20);
const duration=tf=>({'D':1440,'1D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'1':1}[tf])*minute;
function fixture(tf,n=600){const width=duration(tf);return Array.from({length:n},(_,i)=>{const time=end-(n-i)*width,p=51000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+10*Math.sin(i),volume:1000+i%40};});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
async function run(source,{tf='60',inputs={},bars=fixture(tf),fetchSeries=async(_,f,r)=>fixture(f,r.limit||600)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(source,'cleo-test');let session,model;const started=performance.now();
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Execution exceeded 30 seconds')),30000);session=engine.execute({prepared,bars,market:market(tf),inputs,visibleRange:{left:bars.at(-200)?.time||bars[0].time,right:end+duration(tf)*50},historyState:'complete',mode:'static',fetchSeries},{onModel:m=>model=m,onDone:()=>{clearTimeout(timer);resolve();},onError:e=>{clearTimeout(timer);reject(e);}});});return {prepared,model,bars,context:await session.getContext(['variables','warnings']),milliseconds:performance.now()-started};}finally{session?.stop();}
}
const original=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity-original.pine',import.meta.url),'utf8');
const named=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');
const normalize=value=>JSON.parse(JSON.stringify(value,(key,v)=>['id','title','shorttitle'].includes(key)?undefined:v));
let namedResult;
test('named export changes only the indicator title/shorttitle; all settings and output geometry match original',async()=>{
 const baseline=await run(original);namedResult=await run(named);
 assert.equal(namedResult.prepared.meta.title,"Cleo's Liquidity");assert.equal(namedResult.prepared.inputs.length,199);assert.deepEqual(namedResult.prepared.inputs,baseline.prepared.inputs);
 for(const key of ['series','lines','boxes','labels','polylines','linefills','tables'])assert.deepEqual(normalize(namedResult.model[key]),normalize(baseline.model[key]),key);
 const counts=drawingCounts(namedResult.model);assert.ok(counts.lines>20);assert.ok(counts.labels>10);assert.equal(counts.tables,1);assert.ok(namedResult.context.warnings.every(w=>!/out.of.bounds|unsupported|error/i.test(w.message)));
 assert.ok(namedResult.milliseconds<30000);assert.equal(compareReference(plotRows(baseline.model,baseline.bars,end),rowsToCsv(plotRows(namedResult.model,namedResult.bars,end))).matched,true);
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
test('1M chart executes the canonical master directly and retains source timeframe colors and tiny merged tags',async()=>{
 const result=await run(named,{tf:'1'});assert.ok(result.model.lines.length>0);assert.ok(result.model.labels.length>0);const labels=result.model.labels.filter(l=>/^(D|240|60|30|15|5|1)(\/(D|240|60|30|15|5|1))*$/.test(String(l.text)));assert.ok(labels.length>0,'liquidity timeframe tags must render');
 await fs.writeFile(new URL('../qa-cleos-liquidity-model.json',import.meta.url),JSON.stringify({counts:drawingCounts(result.model),milliseconds:result.milliseconds,model:result.model,context:result.context},null,2));
});

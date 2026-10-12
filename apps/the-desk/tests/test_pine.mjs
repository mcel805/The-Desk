import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {pineState,restorePineState} from '../web/pine-state.mjs';
import {DeskPineEngine,pineWorkerOptions} from '../web/pine-runtime.mjs';
import {checkPineSource,validationSource,plotRows,rowsToCsv,parseCsv,compareReference,sourceHash,drawingCounts,timeframeDuration} from '../web/pine-validation.mjs';
const hour=3600000,day=24*hour,week=7*day;
const bars=Array.from({length:1000},(_,i)=>{const base=100+Math.sin(i*.15)*8+i*.01;return {time:Date.UTC(2026,7,3)+i*hour,open:base,high:base+2,low:base-2,close:base+Math.sin(i),volume:1000+i%40};});
const market={symbol:'hyperliquid:BTC',timeframe:'60',symbolInfo:{ticker:'BTC',tickerid:'hyperliquid:BTC',timezone:'UTC',minmov:1,pricescale:1,mintick:1,type:'crypto',currency:'USD'}};
test('completed-bar duration accepts canonical intraday timeframe labels',()=>{
 assert.equal(timeframeDuration('60'),hour);
 assert.equal(timeframeDuration('1h'),hour);
 assert.equal(timeframeDuration('4h'),4*hour);
 assert.equal(timeframeDuration('1D'),day);
 assert.equal(timeframeDuration('W'),week);
});
function aggregate(timeframe){const width=timeframe==='W'||timeframe==='1W'?week:day,anchor=width===week?4*day:0;const map=new Map();for(const b of bars){const time=Math.floor((b.time-anchor)/width)*width+anchor;const a=map.get(time);if(!a)map.set(time,{...b,time});else{a.high=Math.max(a.high,b.high);a.low=Math.min(a.low,b.low);a.close=b.close;a.volume+=b.volume;}}return [...map.values()];}
async function run(source,{inputs={},data=bars,fetchSeries=async(_,tf)=>aggregate(tf)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(source,'fixture');let model,session;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test execution timeout')),30000);session=engine.execute({prepared,bars:data,market,inputs,historyState:'complete',mode:'static',fetchSeries},{onModel:m=>{model=m;},onError:e=>{clearTimeout(timer);reject(e);},onDone:()=>{clearTimeout(timer);resolve();}});});
 const context=await session.getContext(['warnings','variables','plots']);session.stop();return {prepared,model,context};
}
const simple='//@version=6\nindicator("Moving averages",overlay=true)\nlength=input.int(3,"Length")\nplot(ta.sma(close,length),title="SMA")\nplot(ta.ema(close,length),title="EMA")';
test('native source compiles and SMA/EMA match independent calculations; input overrides change results',async()=>{
 const data=bars.slice(0,30),one=await run(simple,{data}),two=await run(simple,{data,inputs:{length:5}});assert.equal(one.prepared.inputs.length,1);
 const rows=plotRows(one.model,data,data.at(-1).time),other=plotRows(two.model,data,data.at(-1).time);assert.equal(rows.length,30);assert.ok(rows.some(r=>Number.isFinite(r.SMA)),'runtime plots must be exported');
 let ema=data.slice(0,3).reduce((n,b)=>n+b.close,0)/3;for(let i=0;i<data.length;i++){if(i<2){assert.equal(rows[i].EMA,null);continue;}if(i>2)ema=.5*data[i].close+.5*ema;assert.ok(Math.abs(rows[i].EMA-ema)<1e-7);assert.ok(Math.abs(rows[i].SMA-data.slice(i-2,i+1).reduce((n,b)=>n+b.close,0)/3)<1e-7);}
 assert.notEqual(rows.at(-1).SMA,other.at(-1).SMA);
});
test('previous-day and previous-week security values use completed higher timeframe bars',async()=>{
 const calls=[];const src='//@version=6\nindicator("Previous levels")\nplot(request.security(syminfo.tickerid,"D",high[1],lookahead=barmerge.lookahead_on),title="Day")\nplot(request.security(syminfo.tickerid,"W",high[1],lookahead=barmerge.lookahead_on),title="Week")';
 const {model}=await run(src,{fetchSeries:async(s,tf)=>{calls.push([s,tf]);return aggregate(tf);}}),rows=plotRows(model,bars,bars.at(-1).time);
 assert.ok(calls.some(c=>['D','1D'].includes(c[1])));assert.ok(calls.some(c=>['W','1W'].includes(c[1])));
 for(const [name,tf,width,anchor] of [['Day','D',day,0],['Week','W',week,4*day]]){const higher=aggregate(tf);for(const row of rows.filter(r=>r.time>=bars[0].time+week)){const start=Math.floor((row.time-anchor)/width)*width+anchor;const previous=higher.find(b=>b.time===start-width);assert.ok(Math.abs(row[name]-previous.high)<1e-7,name+' '+row.time);}}
});
let gravitySource;
test('full Market Gravity original runs with 56 inputs, daily/weekly requests and drawing outputs',async()=>{
 gravitySource=await fs.readFile(new URL('../web/pine-examples/market-gravity.pine',import.meta.url),'utf8');checkPineSource(gravitySource);const calls=[];
 const {prepared,model}=await run(gravitySource,{fetchSeries:async(s,tf)=>{calls.push(tf);return aggregate(tf);}});
 assert.equal(prepared.inputs.length,56);assert.equal(prepared.meta.title,'Market Gravity [YinYangAlgorithms]');assert.ok(calls.some(t=>['D','1D'].includes(t)));assert.ok(calls.some(t=>['W','1W'].includes(t)));
 const counts=drawingCounts(model);assert.ok(counts.lines>0);assert.ok(counts.labels>0);assert.equal(counts.tables,1);assert.ok(counts.polylines>0);
 const diagnostics=validationSource(gravitySource);assert.equal(diagnostics.probes.length,13);const numeric=await run(diagnostics.source);const rows=plotRows(numeric.model,bars,bars.at(-1).time);assert.ok(rows.some(r=>Number.isFinite(r['Desk: netGravity'])));assert.equal(compareReference(rows,rowsToCsv(rows)).matched,true);
 assert.deepEqual(numeric.model.lines.map(({id,...geometry})=>geometry),model.lines.map(({id,...geometry})=>geometry),'diagnostic plots preserve original line geometry and styling');
});
test('source guards reject malformed scope and preserve quoted URL strings',()=>{
 for(const source of ['', '//@version=4\nindicator("Old")','//@version=6\nstrategy("Strategy")','//@version=6\nindicator("Import")\nimport user/lib/1 as lib','//@version=6\nindicator("Big")\n'+ ' '.repeat(250000)])assert.throws(()=>checkPineSource(source));
 const source='//@version=6\nindicator("https://example.com")\nplot(close)';assert.equal(checkPineSource(source),source);
});
test('plot names cannot overwrite provider OHLCV fields',()=>{
 const rows=plotRows({series:[{title:'open',points:bars.map(b=>({time:b.time,value:999}))}]},bars,bars[2].time);
 assert.equal(rows[0].open,bars[0].open);assert.equal(rows[0]['Plot: open'],999);
});
test('runtime rejects invalid Pine rather than accepting a conversion',async()=>{await assert.rejects(run('//@version=6\nindicator("Invalid")\nplot(does_not_exist(close))'));});
test('nested compatibility routing requires the named Cleo functions',async()=>{
 const cleo=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');
 const textareaSource=cleo.replace(/\r\n?/g,'\n');
 assert.match(pineWorkerOptions(textareaSource).workerUrl,/pine-compatible-worker\.js$/);
 const renamed=textareaSource.replace('indicator("Cleo\'s Liquidity", "Cleo\'s Liquidity"','indicator("Unrelated study", "Unrelated study"');
 assert.deepEqual(pineWorkerOptions(renamed),{});
 const similar='//@version=6\nindicator("Unrelated study")\nf_confirmedMaster() => close\nf_marketSource(int tfId, bool confirmed) => close';
 assert.deepEqual(pineWorkerOptions(similar),{});
});
const rows=bars.slice(0,4).map((b,i)=>({...b,Result:i?i*1.5:null}));
test('CSV compares shared completed outputs and fails changed OHLC, missing columns and no overlap',()=>{
 assert.equal(compareReference(rows,rowsToCsv(rows)).matched,true);assert.equal(parseCsv(rowsToCsv([{time:1,label:'a,"b"\nc'}]))[0].label,'a,"b"\nc');
 const changed=structuredClone(rows);changed[2].Result+=1;const mismatch=compareReference(rows,rowsToCsv(changed));assert.equal(mismatch.mismatchCount,1);assert.equal(mismatch.matched,false);
 changed[2].high+=1;assert.throws(()=>compareReference(rows,rowsToCsv(changed)),/OHLC differs/);
 assert.throws(()=>compareReference(rows,rowsToCsv(rows.map(({Result,...r})=>r))),/missing outputs/);
 assert.throws(()=>compareReference(rows,rowsToCsv(rows.map(r=>({...r,time:r.time+week})))),/shared completed/);
 assert.throws(()=>compareReference(rows,rowsToCsv([rows[0],...rows])),/duplicate timestamps/);
 assert.equal(compareReference(rows,rowsToCsv(rows.map(r=>({...r,Result:null})))).matched,false);
});
test('source fingerprints bind the untouched source and export excludes bars after the cutoff',async()=>{assert.equal((await sourceHash(simple)).length,64);assert.notEqual(await sourceHash(simple),await sourceHash(simple+'\n'));assert.equal(plotRows({series:[]},bars,bars[9].time).length,10);});
function fakeFactory(){const workers=[];const factory=()=>{const worker={terminate(){this.terminated=true;},async prepare(source,id){return {token:{instanceId:id,source}};},execute(req,h){this.handlers=h;return {stop(){},update(){},setVisibleRange(){},notifyBars(){},getContext:async()=>({})};}};workers.push(worker);return worker;};return {factory,workers};}
test('cancelling a test leaves an installed study running and resolves the test error',async()=>{
 const {factory,workers}=fakeFactory(),engine=new DeskPineEngine({factory,executionTimeout:1000});const real=await engine.prepare(simple,'installed'),temp=await engine.prepare(simple,'pine-test-1');let error;
 engine.execute({prepared:real,bars,market,historyState:'backfill'},{onModel(){}});engine.execute({prepared:temp,bars,market},{onModel(){},onError:e=>error=e});engine.cancelTests();assert.match(error.message,/cancelled/);assert.equal(workers[0].terminated,undefined);assert.equal(workers[1].terminated,true);engine.terminate();
});
test('execution watchdog terminates only the timed-out worker',async()=>{const {factory,workers}=fakeFactory(),engine=new DeskPineEngine({factory,executionTimeout:10});const prepared=await engine.prepare(simple,'pine-test-timeout');const error=await new Promise(resolve=>engine.execute({prepared,bars,market},{onModel(){},onError:resolve}));assert.match(error.message,/execution exceeded/);assert.equal(workers[0].terminated,true);assert.equal(engine.active.size,0);});

test('saved Cleo sources keep all drawings while excluding them from candle autoscale on every model update',async()=>{
 const source=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');
 const {factory,workers}=fakeFactory(),engine=new DeskPineEngine({factory});
 for(const [id,text,expected] of [['saved',source.replace('"Nearest N"','"All retained"'),false],['ordinary',simple,undefined]]){
  const prepared=await engine.prepare(text,id);prepared.token.source=text;
  const outputs=[];const session=engine.execute({prepared,bars,market},{onModel:m=>outputs.push(m)});
  const worker=workers.at(-1),model={series:[],lines:[{id:'daily',y1:58000,y2:58000}],labels:[{id:'daily-tag',text:'D'}],boxes:[{id:'zone',top:88000,bottom:87900}]};
  worker.handlers.onModel(model);session.update({close:82763});worker.handlers.onModel({...model});
  assert.equal(outputs.length,2);
  for(const output of outputs){assert.equal(output.drawingAutoscale,expected);for(const key of ['lines','labels','boxes'])assert.deepEqual(output[key],model[key]);}
  assert.equal(engine.records.get(id).model.drawingAutoscale,expected);
  session.stop();
 }
 engine.terminate();
});
test('named Cleo source gets a longer watchdog without widening ordinary studies',async()=>{
 const cleo=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');let timer;
 const factory=()=>({terminate(){clearTimeout(timer);},async prepare(source,id){return {token:{instanceId:id,source}};},execute(req,h){timer=setTimeout(()=>h.onModel({}),25);return {stop(){clearTimeout(timer);},update(){},setVisibleRange(){},notifyBars(){},getContext:async()=>({})};}});
 const engine=new DeskPineEngine({factory,executionTimeout:10}),prepared=await engine.prepare(cleo,'pine-test-cleo');await new Promise((resolve,reject)=>engine.execute({prepared,bars,market},{onModel:resolve,onError:reject}));engine.terminate();
});

test('show/reload can execute a previously prepared source after its session was stopped',async()=>{const {factory,workers}=fakeFactory(),engine=new DeskPineEngine({factory});const prepared=await engine.prepare(simple,'installed');const request={prepared,bars,market,historyState:'backfill'};engine.execute(request,{onModel(){}}).stop();assert.equal(engine.workers.size,0);engine.execute(request,{onModel(){}});assert.equal(workers.length,2);assert.equal(engine.active.size,1);engine.terminate();});
test('compile watchdog rejects a hung preparation and releases its worker',async()=>{let terminated=false;const engine=new DeskPineEngine({compileTimeout:10,factory:()=>({prepare:()=>new Promise(()=>{}),terminate:()=>terminated=true})});await assert.rejects(engine.prepare(simple,'pine-test-hung'),/compilation exceeded/);assert.equal(terminated,true);assert.equal(engine.workers.size,0);});
test('cancel during compilation rejects the pending preparation',async()=>{let terminated=false;const engine=new DeskPineEngine({factory:()=>({prepare:()=>new Promise(()=>{}),terminate:()=>terminated=true})});const pending=engine.prepare(simple,'pine-test-compiling');engine.cancelTests();await assert.rejects(pending,/cancelled/);assert.equal(terminated,true);});

test('cancellation exposes an idle context before notifying Vela of the error',async()=>{const {factory}=fakeFactory(),engine=new DeskPineEngine({factory});const prepared=await engine.prepare(simple,'pine-test-context');let session,pending;session=engine.execute({prepared,bars,market},{onModel(){},onError:()=>{pending=session.getContext();}});engine.cancelTests();assert.equal(await pending,null);assert.equal(engine.active.size,0);});

test('workspace persistence excludes temporary tests and restores original source, all inputs and hidden state',()=>{const handle=(id)=>({id,title:'Original',source:simple,visible:false,inputValues:()=>({length:5}),propValues:()=>({precision:4}),remove(){}});const chart={indicators:()=>[handle('desk-pine-1'),handle('pine-test-original'),handle('pine-test-diagnostic'),{id:'native',title:'Volume'}]};const state=pineState(chart);assert.equal(state.length,1);assert.equal(state[0].script,simple);assert.equal(state[0].hidden,true);assert.deepEqual(state[0].inputs,{length:5});const restored=[];restorePineState([...state,{...state[0],id:'pine-test-old'}],{chart,addIndicator:s=>restored.push(s)});assert.deepEqual(restored,state);});
test('native Pine v5 uses the same indicator execution path',async()=>{const {model}=await run(simple.replace('//@version=6','//@version=5'),{data:bars.slice(0,8)});const row=plotRows(model,bars.slice(0,8),bars[7].time).at(-1);assert.ok(Math.abs(row.SMA-bars.slice(5,8).reduce((n,b)=>n+b.close,0)/3)<1e-7);});

test('replacing source preparation survives stopping its previous running session',async()=>{const {factory,workers}=fakeFactory(),engine=new DeskPineEngine({factory});const first=await engine.prepare(simple,'installed');const previous=engine.execute({prepared:first,bars,market,historyState:'backfill'},{onModel(){}});const replacement=await engine.prepare(simple+'\n','installed');previous.stop();engine.execute({prepared:replacement,bars,market,historyState:'backfill'},{onModel(){}});assert.equal(workers.length,2);assert.equal(workers[1].terminated,undefined);engine.terminate();});

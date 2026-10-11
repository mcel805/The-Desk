import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {drawingCounts} from '../web/pine-validation.mjs';
installNestedSecurity();
const time=Date.now()-600000,bars=Array.from({length:5},(_,i)=>({time:time+i*60000,open:i,high:i+2,low:i-1,close:i+1,volume:10}));
const cleoSource=await fs.readFile(new URL('../web/pine-examples/cleos-liquidity.pine',import.meta.url),'utf8');
const minute=60000;
const duration=tf=>({'D':1440,'1D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'1':1}[tf])*minute;
const cleosBars=(tf,count,end)=>Array.from({length:count},(_,i)=>{const t=end-(count-i)*duration(tf),base=51000+250*Math.sin(t/14400000)+50*Math.sin(t/900000);return {time:t,open:base,high:base+15,low:base-15,close:base+10*Math.sin(i),volume:1000+i%40};});
const cleoMarket={symbol:'fixture:MYM',timeframe:'1',symbolInfo:{ticker:'MYM',tickerid:'MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}};
const withoutIds=value=>JSON.stringify(value,(key,current)=>key==='id'?undefined:current);
const modelSignature=model=>({outputs:withoutIds(model.series),geometry:withoutIds({lines:model.lines,boxes:model.boxes,labels:model.labels,polylines:model.polylines,linefills:model.linefills,tables:model.tables})});
const lineEnds=model=>model.lines.map(line=>line.x2);
const assertGeometry=model=>{const counts=drawingCounts(model);assert.ok(counts.lines>0);assert.ok(counts.labels>0);for(const line of model.lines)assert.ok([line.x1,line.y1,line.x2,line.y2].every(Number.isFinite));};
const source=`//@version=6\nindicator("Same frame tuple live")\nscale=input.int(2,"Scale")\nf_pair() =>\n    [high*scale,close]\n[a,b]=request.security(syminfo.tickerid,"1",f_pair())\nplot(a,"High")\nplot(b,"Close")`;
test('same timeframe function tuples, streaming ticks/new bars, input restart and viewport updates',async()=>{
 const engine=new PineEngine(),prepared=await engine.prepare(source,'live');let model,error,session;
 const wait=async predicate=>{const until=Date.now()+8000;while(!predicate()){if(error)throw error;if(Date.now()>until)throw Error('No expected live model');await new Promise(r=>setTimeout(r,50));}};
 const last=title=>model.series.find(s=>s.title===title).points.at(-1).value;
 try{session=engine.execute({prepared,bars,getBars:()=>bars,market:{symbol:'fixture:MYM',timeframe:'1'},historyState:'complete',mode:'live',inputs:{scale:3}},{onModel:m=>model=m,onError:e=>error=e});
 await wait(()=>model);assert.equal(last('High'),18);assert.equal(last('Close'),5);
 bars[bars.length-1]={...bars.at(-1),high:10,close:8};session.notifyBars('tick');await wait(()=>last('High')===30);assert.equal(last('Close'),8);
 bars.push({time:time+5*60000,open:8,high:12,low:7,close:11,volume:20});session.notifyBars('tick');await wait(()=>last('Close')===11);assert.equal(last('High'),36);
 session.update({scale:4});await wait(()=>last('High')===48);assert.equal(model.inputValues.scale,4);session.setVisibleRange({left:time,right:time+8*60000});await wait(()=>last('High')===48);
 }finally{session?.stop();}
});
test('dual-use time helpers in function tuple return branches snapshot each completed timestamp',async()=>{
 const source=`//@version=6\nindicator("Time tuple")\nf_stamp(bool previous) =>\n    if previous\n        [time[1],time_close[1]]\n    else\n        [time,time_close]\n[a,b]=request.security(syminfo.tickerid,"1",f_stamp(false))\nplot(a,"Open time")\nplot(b-a,"Duration")`;
 const engine=new PineEngine(),prepared=await engine.prepare(source,'tuple-time');let session,model;
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:{symbol:'fixture:MYM',timeframe:'1'},historyState:'complete',mode:'static'},{onModel:m=>model=m,onDone:resolve,onError:reject});});assert.deepEqual(model.series.find(s=>s.title==='Open time').points.map(p=>p.value),bars.map(b=>b.time));assert.deepEqual(model.series.find(s=>s.title==='Duration').points.map(p=>p.value),bars.map(()=>60000));}finally{session?.stop();}
});
test('Cleo Liquidity live mode updates on an intrabar tick and completed 1-minute bar',async()=>{
 const nativeNow=Date.now,currentReference=nativeNow(),currentOpen=Math.floor(currentReference/minute)*minute;let controlledNow=currentOpen+minute/2,secondaryEnd=currentOpen+minute;const nestedFiveLevel=53000,chartBars=cleosBars('1',600,secondaryEnd),calls=[],fetched=[];const engine=new PineEngine(),prepared=await engine.prepare(cleoSource,'cleo-live');let model,error,updates=0;const warnings=[];
 const wait=async predicate=>{const until=performance.now()+30000;while(!predicate()){if(error)throw error;if(performance.now()>until)throw Error('No expected Cleo live model');await new Promise(resolve=>setTimeout(resolve,50));}};
 const fetchSeries=async(symbol,tf,range)=>{calls.push([tf,range?.limit]);const result=cleosBars(tf,Math.max(range?.limit||600,600),secondaryEnd);if(tf==='5'){const pivotIndex=result.length-5;result[pivotIndex]={...result[pivotIndex],open:nestedFiveLevel-20,high:nestedFiveLevel,low:nestedFiveLevel-40,close:nestedFiveLevel-10};}fetched.push({tf,bars:result});return result;};
 let session;
 try{Date.now=()=>controlledNow;session=engine.execute({prepared,getBars:()=>chartBars,market:cleoMarket,inputs:{sourceBars:200,masterBars:500,liqLowerHistory:400,rawScope:'All seven'},historyState:'complete',mode:'live',fetchSeries},{onModel:next=>{model=next;updates+=1;},onWarning:warning=>warnings.push(warning),onError:next=>{error=next;}});
 await wait(()=>model&&updates>0);const initial=modelSignature(model),initialRight=currentOpen+12*duration('60');assertGeometry(model);assert.equal(error,undefined);assert.ok(currentOpen<=Date.now()&&currentOpen+minute>Date.now());assert.ok(lineEnds(model).includes(initialRight));assert.ok(calls.some(([tf])=>tf==='D'));assert.ok(calls.some(([tf])=>tf==='240'));assert.ok(calls.some(([tf])=>tf==='60'));assert.ok(calls.some(([tf])=>tf==='30'));assert.ok(calls.some(([tf])=>tf==='15'));assert.ok(calls.some(([tf])=>tf==='5'));
 const current=chartBars.at(-1);chartBars[chartBars.length-1]={...current,high:current.high+150,low:current.low-120,close:current.close+140};session.notifyBars('tick');const tickUpdates=updates;await wait(()=>updates>tickUpdates);const tick=modelSignature(model);assert.notDeepEqual(tick.outputs,initial.outputs);assert.notDeepEqual(tick.geometry,initial.geometry);assertGeometry(model);assert.equal(error,undefined);assert.ok(lineEnds(model).includes(initialRight));
 const nextTime=current.time+minute;controlledNow=nextTime+minute+1;secondaryEnd=nextTime+minute;chartBars.push({time:nextTime,open:current.close+140,high:current.high+180,low:current.low-150,close:current.close+170,volume:1200});session.notifyBars('complete');const completedUpdates=updates;await wait(()=>updates>completedUpdates);const completed=modelSignature(model),completedRight=nextTime+12*duration('60'),completedFive=fetched.find(({tf,bars})=>tf==='5'&&bars.at(-1).time+duration(tf)===nextTime+minute);assert.notDeepEqual(completed.outputs,tick.outputs);assert.notDeepEqual(completed.geometry,tick.geometry);assertGeometry(model);assert.ok(lineEnds(model).includes(completedRight));assert.ok(completedFive);assert.ok(completedFive.bars.at(-1).time<nextTime&&nextTime<completedFive.bars.at(-1).time+duration('5'));const nestedFivePivot=completedFive.bars.at(-5);assert.equal(nestedFivePivot.high,nestedFiveLevel);assert.ok(model.lines.some(line=>line.x1===nestedFivePivot.time&&Math.abs(line.y1-nestedFiveLevel)<1e-7&&line.x2===completedRight));assert.ok(model.series.some(series=>series.points.at(-1)?.time===nextTime));assert.equal(error,undefined);assert.ok(warnings.every(w=>!/out.of.bounds|unsupported|error/i.test(w.message)));
 }finally{session?.stop();Date.now=nativeNow;}
});

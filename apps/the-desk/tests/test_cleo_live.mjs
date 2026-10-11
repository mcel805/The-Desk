import test from 'node:test';
import assert from 'node:assert/strict';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const time=Date.now()-600000,bars=Array.from({length:5},(_,i)=>({time:time+i*60000,open:i,high:i+2,low:i-1,close:i+1,volume:10}));
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

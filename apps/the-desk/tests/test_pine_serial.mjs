import test from 'node:test';
import assert from 'node:assert/strict';
import {executeSerial} from '../web/pine-compat/serial-execution.mjs';
function fixture(req={}){
 let active=0,max=0,handler,done=0;const commands=[],models=[];
 const run=(kind,args)=>{active++;max=Math.max(max,active);commands.push([kind,args]);};
 const engine={execute(r,h){handler=h;if(r.historyState!=='backfill')run('execute',[]);return {stop(){},update:(...a)=>run('update',a),setVisibleRange:(...a)=>run('range',a),notifyBars:(...a)=>run('bars',a),getContext:()=>({})};}};
 const session=executeSerial(engine,req,{onDone:()=>done++,onModel:m=>models.push(m)});
 return {session,commands,models,finish(){active--;handler.onModel({n:models.length});handler.onDone();},get done(){return done;},get max(){return max;}};
}
test('startup and burst viewport updates execute sequentially and acknowledge every transport message',()=>{
 const f=fixture();f.session.setVisibleRange({left:1});f.session.setVisibleRange({left:2});f.session.notifyBars('complete');
 assert.equal(f.commands.length,1);f.finish();assert.deepEqual(f.commands[1],['range',[{left:2}]]);f.finish();f.finish();
 assert.equal(f.max,1);assert.equal(f.done,4);assert.equal(f.models.length,3);
});
test('deferred startup acknowledges immediately and complete-history runs rather than deadlocking',()=>{
 const f=fixture({historyState:'backfill'});assert.equal(f.done,1);assert.equal(f.commands.length,0);
 f.session.notifyBars('complete');assert.equal(f.commands.length,1);f.finish();assert.equal(f.done,2);assert.equal(f.max,1);
});
test('coalesced inputs merge all edits and stop discards queued work',()=>{
 const f=fixture();f.session.update({a:1},{overlay:true});f.session.update({b:2},{precision:3});f.finish();
 assert.deepEqual(f.commands[1],['update',[{a:1,b:2},{overlay:true,precision:3}]]);
 f.session.setVisibleRange({left:3});f.session.stop();f.finish();assert.equal(f.commands.length,2);
});


test('viewport and input commands during backfill acknowledge without blocking complete history',()=>{
 let handlers,started=false,done=0;const stored=[];
 const engine={execute(req,h){handlers=h;return {stop(){},setVisibleRange:range=>stored.push(['range',range]),update:inputs=>stored.push(['inputs',inputs]),notifyBars:()=>{started=true;},getContext:()=>null};}};
 const session=executeSerial(engine,{historyState:'backfill'},{onModel(){},onDone:()=>done++});
 assert.equal(done,1);session.setVisibleRange({left:1,right:10});session.update({length:5});
 assert.equal(done,3,'stored commands each need a transport acknowledgment');
 session.notifyBars('complete');assert.equal(started,true,'complete-history run must not be queued behind a non-running viewport');
 handlers.onDone();assert.equal(done,4);assert.deepEqual(stored,[['range',{left:1,right:10}],['inputs',{length:5}]]);session.stop();
});

test('real PineEngine releases deferred viewport/input edits and renders after history completion',async()=>{
 const {PineEngine}=await import('@luxalgo/vela-pinets');
 const engine=new PineEngine(),prepared=await engine.prepare('//@version=6\nindicator("Deferred viewport")\nlength=input.int(2)\nplot(ta.sma(close,length))','deferred');
 const bars=Array.from({length:10},(_,i)=>({time:1700000000000+i*60000,open:i,high:i+1,low:i-1,close:i,volume:1}));
 let session,done=0,model,timer;
 try{await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('History completion blocked by deferred commands')),2000);
  session=executeSerial(engine,{prepared,bars,market:{symbol:'fixture:ETH',timeframe:'1'},historyState:'backfill',mode:'static'},{onModel:m=>{model=m;},onDone:()=>{done++;if(model)resolve();},onError:reject});
  session.setVisibleRange({left:bars[0].time,right:bars.at(-1).time});session.update({length:3});session.notifyBars('complete');
 });assert.equal(done,4);assert.ok(model.series[0].points.length>0);}finally{clearTimeout(timer);session?.stop();}
});

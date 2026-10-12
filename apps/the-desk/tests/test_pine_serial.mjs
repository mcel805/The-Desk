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

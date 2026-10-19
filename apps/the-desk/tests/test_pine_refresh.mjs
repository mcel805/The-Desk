import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
import {elliotRefreshGate} from '../web/pine-refresh.mjs';
const source=await fs.readFile(new URL('../web/pine-examples/agentic-elliot-waves.pine',import.meta.url),'utf8');
const bars=[{time:60000,open:2,high:3,low:1,close:2,volume:10}];
function fixture(text=source){
 let now=120001,updates=0,handler;const events=[];
 const worker={async prepare(source,id){return {token:{source,instanceId:id}};},terminate(){},execute(req,h){handler=h;return {stop(){},update(){},setVisibleRange(){},notifyBars(){updates++;},getContext:async()=>null};}};
 const engine=new DeskPineEngine({factory:()=>worker,now:()=>now,onStatus:e=>events.push(e)});
 return {engine,events,text,get updates(){return updates;},get handler(){return handler;},nextMinute(){now+=60000;}};
}
test('Elliott ignores quote bursts, recalculates at minute rollover and preserves complete-history commands',async()=>{
 const f=fixture(),prepared=await f.engine.prepare(source,'elliot'),data=structuredClone(bars),session=f.engine.execute({prepared,bars:data,mode:'static',historyState:'complete'},{onModel(){}});
 for(let i=0;i<200;i++){data.at(-1).close+=.001;session.notifyBars();}
 assert.equal(f.updates,0,'same-minute quotes must not launch full-history runs');
 f.nextMinute();session.notifyBars('tick');assert.equal(f.updates,1);
 for(let i=0;i<200;i++)session.notifyBars();assert.equal(f.updates,1);
 session.notifyBars('complete');assert.equal(f.updates,2);
 session.notifyBars('backfill');assert.equal(f.updates,2);session.stop();
});
test('a new chart bar and backward replay step refresh even within the same wall-clock minute',()=>{
 let now=120001;const gate=elliotRefreshGate(()=>now),data=structuredClone(bars);gate.mark(data);
 assert.equal(gate.accepts('tick',data),false);data.push({...data[0],time:120000});assert.equal(gate.accepts('tick',data),true);
 data.pop();assert.equal(gate.accepts('tick',data),true);assert.equal(gate.accepts('complete',data),true);
});
test('ordinary scripts retain per-tick updates',async()=>{
 const source='//@version=6\nindicator("Other")\nplot(close)',f=fixture(source),prepared=await f.engine.prepare(source,'other'),session=f.engine.execute({prepared,bars,mode:'live',historyState:'complete'},{onModel(){}});
 for(let i=0;i<5;i++)session.notifyBars('tick');assert.equal(f.updates,5);session.stop();
});
test('script failure is retained after cleanup, and a later successful model clears it',async()=>{
 const f=fixture(),prepared=await f.engine.prepare(source,'elliot'),error=Error('Required secondary data unavailable: ETH 30');let received;
 f.engine.execute({prepared,bars,mode:'static',historyState:'complete'},{onModel(){},onError:e=>received=e});f.handler.onError(error);
 assert.equal(received,error);assert.equal(f.events.at(-1).error,error,'cleanup must not erase the error');
 f.engine.execute({prepared,bars,mode:'static',historyState:'complete'},{onModel(){}});f.handler.onModel({series:[],lines:[],labels:[],tables:[]});assert.equal(f.events.at(-1).error,null);f.engine.terminate();
});
test('a suppressed quote does not arm a false execution timeout after a completed run',async()=>{
 const f=fixture(),prepared=await f.engine.prepare(source,'elliot'),session=f.engine.execute({prepared,bars,mode:'static',historyState:'complete'},{onModel(){}});
 f.handler.onModel({series:[],lines:[],labels:[],tables:[]});session.notifyBars('tick');assert.equal(f.updates,0);assert.equal(f.engine.active.size,1);session.stop();
});


test('missing primary chart history fails promptly instead of starting a broken live stream',async()=>{
 const f=fixture(),prepared=await f.engine.prepare(source,'missing-chart');const error=await new Promise(resolve=>f.engine.execute({prepared,bars:[],mode:'live',historyState:'complete'},{onModel(){},onError:resolve}));assert.match(error.message,/Chart candle history unavailable/);assert.equal(f.engine.active.size,0);
});

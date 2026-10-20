import test from 'node:test';
import assert from 'node:assert/strict';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
import {liquidityLevels} from '../web/agents-model.mjs';
const source='//@version=6\nindicator("Agentic - Liquidity", "Agentic - Liquidity", overlay=true)\nf_masterPools() => 1\nf_smallCount() => 1\nplot(close)';
test('installed Liquidity output publishes exact live model and removal invalidates it',async t=>{
 const oldDispatch=globalThis.dispatchEvent,oldEvent=globalThis.CustomEvent,events=[];
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 globalThis.dispatchEvent=e=>{events.push(e);return true;};
 t.after(()=>{if(oldDispatch===undefined)delete globalThis.dispatchEvent;else globalThis.dispatchEvent=oldDispatch;if(oldEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=oldEvent;});
 let handler;const engine=new DeskPineEngine({factory:()=>({prepare:async(s,id)=>({token:{source:s,instanceId:id}}),terminate(){},execute(req,h){handler=h;return {stop(){}};}})});
 const prepared=await engine.prepare(source,'live-pools'),session=engine.execute({prepared,bars:[{time:1000,open:100,high:101,low:99,close:100}],market:{symbol:'HYPERLIQUID:BTC',timeframe:'1'}},{onModel(){}});
 handler.onModel({lines:[{id:'pool',xloc:'bar_time',x1:100,x2:3000,y1:100,y2:100,style:'solid',width:2,extend:'none'}],labels:[],series:[],boxes:[]});
 const e=events.find(e=>e.type==='desk:agents-liquidity-model');assert.equal(e.detail.instrument,'hyperliquid:BTC');assert.equal(e.detail.lastBarTime,1000);
 assert.equal(liquidityLevels([['live-pools',e.detail]],'hyperliquid:BTC','1')[0].price,'100');
 assert.equal((await session.getContext({deskAgentLevels:true})).lines[0].y1,100);
 session.stop();assert.equal(await session.getContext({deskAgentLevels:true}),null);assert.deepEqual(events.at(-1).detail,{id:'live-pools',model:null});
});

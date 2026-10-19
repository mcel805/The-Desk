import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredSecondaryHistory} from '../web/pine-history.mjs';
import {DeskPineEngine} from '../web/pine-runtime.mjs';

test('an empty ETH hourly response recovers without changing its range or venue',async()=>{
 const range={to:1792378140000,limit:3000},bars=[{time:1792375200000,close:2420}],calls=[],waits=[];
 const result=await requiredSecondaryHistory(async(...args)=>{calls.push(args);return calls.length<3?[]:bars;},'hyperliquid:ETH','60',range,{delay:async ms=>waits.push(ms)});
 assert.equal(result,bars);assert.deepEqual(waits,[300,900]);assert.equal(calls.length,3);
 for(const [symbol,tf,bounds] of calls){assert.equal(symbol,'hyperliquid:ETH');assert.equal(tf,'60');assert.equal(bounds,range);}
});
test('a healthy secondary read adds no delay or duplicate fetch',async()=>{
 let calls=0;const result=await requiredSecondaryHistory(async()=>{calls++;return [{time:1}];},'hyperliquid:ETH','60',{}, {delay:()=>assert.fail('unexpected retry')});assert.equal(calls,1);assert.equal(result.length,1);
});
test('persistent empty data fails after a bounded retry with an actionable error',async()=>{
 let calls=0;await assert.rejects(requiredSecondaryHistory(async()=>{calls++;return [];},'hyperliquid:ETH','60',{}, {delay:async()=>{}}),/hyperliquid:ETH 60.*3 attempts.*Reload chart/);assert.equal(calls,3);
});
test('transport errors are preserved without duplicating the provider retry policy',async()=>{
 const error=Error('Hyperliquid history HTTP 429');let calls=0;
 await assert.rejects(requiredSecondaryHistory(async()=>{calls++;throw error;},'hyperliquid:ETH','60',{}, {delay:()=>assert.fail('unexpected retry')}),e=>e===error);assert.equal(calls,1);
});
test('stopping a study prevents another history request after the retry wait',async()=>{
 let stopped=false,calls=0;await assert.rejects(requiredSecondaryHistory(async()=>{calls++;return [];},'hyperliquid:ETH','60',{}, {delay:async()=>{stopped=true;},stopped:()=>stopped}),/cancelled/);assert.equal(calls,1);
});
test('the installed runtime shares the retry sequence across identical worker requests',async()=>{
 let workerRequest,calls=0;
 const worker={prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req){workerRequest=req;return {stop(){},notifyBars(){}};}};
 const engine=new DeskPineEngine({factory:()=>worker}),prepared=await engine.prepare('//@version=6\nindicator("History test")\nplot(close)','retry');
 const session=engine.execute({prepared,bars:[{time:1}],historyState:'complete',fetchSeries:async()=>{calls++;return calls===1?[]:[{time:1}];}},{onModel(){}});
 try{const [a,b]=await Promise.all([workerRequest.fetchSeries('hyperliquid:ETH','60',{limit:3000}),workerRequest.fetchSeries('hyperliquid:ETH','60',{limit:3000})]);assert.equal(calls,2);assert.deepEqual(a,b);assert.equal(a.length,1);}finally{session.stop();}
});

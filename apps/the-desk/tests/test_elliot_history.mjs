import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {elliotHistoryFrames,elliotHistoryEnd} from '../web/elliot-history.mjs';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
test('prefetch covers exactly the selected Elliott sources without fetching the chart series twice',()=>{assert.deepEqual(elliotHistoryFrames({},'60'),['240','30','1D','15','5','1']);assert.deepEqual(elliotHistoryFrames({agenticSummary:false},'60'),['240','30']);assert.deepEqual(elliotHistoryFrames({agenticSummary:false,ladder:'Manual timeframes',parentInput:'D',coreInput:'60',childInput:'15',bridgeTF:'240'},'60'),['1D','15','240']);assert.ok(elliotHistoryFrames({},'D').includes('1W'));assert.equal(elliotHistoryEnd([{time:1000}],'60'),3601000);});
test('selected timeframe reads start concurrently and the worker reuses those same promises',async()=>{
 const source=await fs.readFile(new URL('../web/pine-examples/agentic-elliot-waves.pine',import.meta.url),'utf8'),calls=[],resolvers=[];let workerRequest;
 const worker={prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req){workerRequest=req;return {stop(){},update(){},setVisibleRange(){},notifyBars(){},getContext:async()=>null};}};
 const engine=new DeskPineEngine({factory:()=>worker}),prepared=await engine.prepare(source,'warm');const bars=[{time:1000,open:1,high:2,low:0,close:1}];
 const session=engine.execute({prepared,bars,historyState:'complete',market:{symbol:'hyperliquid:BTC',timeframe:'60'},inputs:{sourceBars:3000},fetchSeries:(symbol,tf,range)=>{calls.push({symbol,tf,range});return new Promise(resolve=>resolvers.push(resolve));}},{onModel(){}});
 await Promise.resolve();assert.equal(calls.length,6,'all sources begin before any source resolves');assert.ok(calls.every(c=>c.range.limit===3000&&c.symbol==='hyperliquid:BTC'));
 const reused=workerRequest.fetchSeries('hyperliquid:BTC','240',{from:undefined,to:3601000,limit:3000});await Promise.resolve();assert.equal(calls.length,6,'field order does not cause another network fetch');for(const resolve of resolvers)resolve([{time:1000}]);assert.equal((await reused).length,1);session.stop();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {IBKRProvider,normalizeIBKRBars,ibkrLabel,isIBKR} from '../web/ibkr-provider.mjs';
const t=1792256400000;
const bar=(time=t,close=40001)=>({time,open:40000,high:40010,low:39990,close,volume:10});
const status={mode:'DEMO_DATA',configured_mode:'demo',read_only:true,orders_enabled:false,connected:true,history_stale:false,instrument:'ibkr:MYM-202612',timeframe:'1m',contract:{tick:1,multiplier:.5,currency:'USD',exchange:'CBOT',expiry:'202612',synthetic:true},bars:[bar()],quote:{stale:false}};
const response=data=>({ok:true,json:async()=>data});
test('Vela provider loads dated symbols, metadata, normalized ranged bars and labels',async()=>{
 const requests=[];const p=new IBKRProvider({fetcher:async path=>{requests.push(path);return response({...status,bars:[bar(t+60000),bar(),bar(t,40002)]});}});
 const symbols=await p.listSymbols();assert.equal(symbols[0].ticker,'MYM-202612');assert.match(symbols[0].description,/DEMO DATA/);
 const info=await p.getSymbolInfo('MYM-202612');assert.equal(info.pointvalue,.5);assert.equal(info.mintick,1);
 const bars=await p.getBars('MYM-202612','1',{from:t,to:t+60000,limit:20});assert.equal(bars.length,2);assert.equal(bars[0].close,40002);
 assert.ok(requests.at(-1).includes('from='+t));assert.ok(requests.at(-1).includes('timeframe=1m'));assert.match(ibkrLabel(status),/DEMO DATA.*READ ONLY/);
 assert.equal(isIBKR('ibkr:MYM-202612'),true);assert.equal(isIBKR('hyperliquid:BTC'),false);
 await assert.rejects(p.getBars('MYM-202612','D'),/intraday/);
});
test('rejects mixed contract identity, bad units and invalid data',async()=>{
 const p=new IBKRProvider({fetcher:async()=>response({...status,instrument:'ibkr:MYM-202603'})});
 await assert.rejects(p.getBars('MYM-202612','1m'),/mismatch/);
 for(const row of [bar(t/1000),{...bar(),close:NaN},{...bar(),low:40005}])assert.throws(()=>normalizeIBKRBars([row]),/Invalid/);
 const bad=new IBKRProvider({fetcher:async()=>response({...status,orders_enabled:true})});await assert.rejects(bad.listSymbols(),/read-only/);
});
test('subscription skips disconnected data and recovers missed completed bars; unsubscribe cancels polls',async()=>{
 let tick,stopped=false,pass=0;const emitted=[],statuses=[];
 const responses=[status,{...status,connected:false,bars:[bar(t+60000)]},{...status,bars:[bar(t,40002),bar(t+60000),bar(t+120000)]}];
 const p=new IBKRProvider({fetcher:async()=>response(responses[pass++]),onStatus:s=>statuses.push(s),schedule:fn=>{tick=fn;return 42;},cancel:id=>{assert.equal(id,42);stopped=true;}});
 const unsubscribe=p.subscribe('MYM-202612','1m',b=>emitted.push(b));
 await new Promise(r=>setImmediate(r));assert.equal(emitted.length,1);
 await tick();assert.equal(emitted.length,1);assert.match(ibkrLabel(statuses.at(-1)),/DEMO DATA/);
 await tick();assert.deepEqual(emitted.map(b=>b.time),[t,t,t+60000,t+120000]);
 unsubscribe();assert.equal(stopped,true);
});
test('network failures surface unavailable state and schedule a retry',async()=>{
 let retry,seen;const p=new IBKRProvider({fetcher:async()=>{throw Error('Unavailable')},onStatus:s=>seen=s,schedule:fn=>{retry=fn;return 1;},cancel:()=>{}});
 const stop=p.subscribe('MYM-202612','1m',()=>assert.fail('no bar'));await new Promise(r=>setImmediate(r));
 assert.equal(seen.connected,false);assert.equal(typeof retry,'function');stop();
});

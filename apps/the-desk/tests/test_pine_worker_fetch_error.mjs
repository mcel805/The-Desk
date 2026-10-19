import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise the compatible worker's actual transport with an in-process self port.
const listeners=[],messages=[];let receive;
globalThis.self={addEventListener(type,callback){if(type==='message')receive=callback;},postMessage(message){messages.push(message);for(const l of [...listeners])l(message);}};
await import('../web/pine-compatible-worker.mjs');
function wait(kind){const existing=messages.find(m=>m.kind===kind);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No '+kind+' message')),2000);const listener=m=>{if(m.kind===kind){clearTimeout(timer);listeners.splice(listeners.indexOf(listener),1);resolve(m);}};listeners.push(listener);});}
test('a failed secondary fetch reports the owning session immediately instead of waiting for the watchdog',async()=>{
 const source='//@version=6\nindicator("Fetch failure")\nf_source() => close[1]\nx=request.security(syminfo.tickerid,"240",f_source())\nplot(x)';
 receive({data:{kind:'prepare',reqId:1,source,instanceId:'failure'}});const {prepared}=await wait('prepared');
 const bars=Array.from({length:3},(_,i)=>({time:1700000000000+i*3600000,open:1,high:2,low:0,close:1,volume:1}));
 receive({data:{kind:'execute',sessionId:17,prepared,bars,market:{symbol:'hyperliquid:ETH',timeframe:'60'},historyState:'complete',mode:'static',inputs:{}}});const request=await wait('fetchSeries');
 const start=performance.now();receive({data:{kind:'fetchSeriesResult',reqId:request.reqId,error:'Hyperliquid history HTTP 429'}});const error=await wait('error');assert.equal(error.sessionId,17);assert.match(error.message,/429/);assert.ok(performance.now()-start<1000);
 receive({data:{kind:'stop',sessionId:17}});
});

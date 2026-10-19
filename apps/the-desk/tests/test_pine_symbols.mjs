import test from 'node:test';
import assert from 'node:assert/strict';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const time=Date.UTC(2026,9,1),bar=(time,close)=>({time,open:close,high:close+1,low:close-1,close,volume:1});
const bars=Array.from({length:12},(_,i)=>bar(time+i*3600000,10+i));
async function run(symbol,tf){
 const engine=new PineEngine(),source=`//@version=6\nindicator("Venue binding")\nf_source() =>\n    var float value=close\n    value:=close\n    value[1]\nfloat value=request.security(${symbol},"${tf}",f_source(),lookahead=barmerge.lookahead_on)\nplot(value,"Secondary")`,prepared=await engine.prepare(source,'venue');
 const calls=[];let session,model;
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,mode:'static',historyState:'complete',market:{symbol:'hyperliquid:ETH',timeframe:'60',symbolInfo:{tickerid:'HYPERLIQUID:ETH',mintick:.1}},fetchSeries:async(sym,frame)=>{calls.push([sym,frame]);assert.ok(sym.includes(':'),'secondary must be explicitly qualified even if provider enumeration is unavailable');return Array.from({length:12},(_,i)=>bar(time+i*(frame==='240'?14400000:3600000),100+i));}},{onModel:m=>model=m,onDone:resolve,onError:reject});});return {calls,model};}finally{session?.stop();}
}
test('same-market requests keep the qualified venue across timeframe changes',async()=>{
 const r=await run('syminfo.tickerid','240');assert.ok(r.calls.length>0);assert.ok(r.calls.every(([sym])=>sym==='hyperliquid:ETH'));
});
test('bare requests inherit the current chart venue',async()=>{
 const r=await run('"ETH"','240');assert.ok(r.calls.every(([sym])=>sym==='hyperliquid:ETH'));assert.ok(r.calls.length>0);
});
test('an explicit different venue with the same ticker and timeframe is fetched separately',async()=>{
 const r=await run('"coinbase:ETH"','60');assert.ok(r.calls.some(([sym])=>sym==='coinbase:ETH'));assert.equal(r.model.series[0].points.at(-1).value,110);
});

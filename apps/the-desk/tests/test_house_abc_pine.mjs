import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const knots=[[0,53000],[20,53010],[40,53000],[60,53200],[83,53120],[87,53130],[130,53000],[155,53100],[195,52900],[220,52980],[250,52940]];
const bars=Array.from({length:251},(_,i)=>{const k=knots.findIndex(([x])=>x>=i),[x2,y2]=knots[Math.max(0,k)],[x1,y1]=knots[Math.max(0,k-1)];const p=x2===x1?y2:y1+(y2-y1)*(i-x1)/(x2-x1);return {time:Date.UTC(2026,9,22,14)+i*60000,open:p+(i>=60&&i<130||i>=155&&i<195?1:-1),high:p+3,low:p-3,close:p,volume:100}});
function run(input){const p=spawnSync(process.execPath,['swing_abc_runner.mjs'],{cwd:new URL('../',import.meta.url),input:JSON.stringify(input),encoding:'utf8',timeout:30000,maxBuffer:4e6});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout)}
test('actual 1.7 Pine adapter emits causal ABC, distinct root coverage and bounded score',()=>{
 const out=run({bars,symbol:'hyperliquid:BTC',tick:1,swing_minutes:5});
 assert.equal(out.cutoff,bars.at(-1).time+60000);assert.equal(out.abc.stage,2);
 assert.equal(out.abc.points.o.origin,bars[195].time);assert.equal(out.abc.points.o.known,bars[219].time+60000);
 assert.equal(out.abc.points.a.origin,bars[220].time);assert.ok(out.abc.points.a.known>out.abc.points.a.origin);
 assert.equal(out.abc.points.b.known,null);assert.notEqual(out.abc.root_id,out.exhaustion.root_id);
 assert.equal(out.exhaustion.available,10);assert.equal(out.exhaustion.contributions[5],null);assert.equal(out.exhaustion.contributions[7],null);
 assert.equal(out.exhaustion.contributions.reduce((a,b)=>a+(b||0),0),out.exhaustion.score);
 assert.ok(out.events.length>0);assert.ok(out.events.every(e=>e.scope==='RECONSTRUCTED'&&e.known===e.bar+60000&&e.bar<out.cutoff));
});
test('adapter refuses a gapped source history',()=>{const x=bars.slice(0,30).filter((_,i)=>i!==15);const p=spawnSync(process.execPath,['swing_abc_runner.mjs'],{cwd:new URL('../',import.meta.url),input:JSON.stringify({bars:x,symbol:'hyperliquid:BTC',tick:1,swing_minutes:5}),encoding:'utf8',timeout:10000});assert.notEqual(p.status,0);});

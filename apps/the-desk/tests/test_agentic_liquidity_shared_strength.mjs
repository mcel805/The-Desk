import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const source=(await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const end=Date.UTC(2026,9,17,18),count=6000;
const price=i=>81000+300*Math.exp(-i/8000)*Math.sin(i/43)+7*Math.sin(i/3.7);
const minute=Array.from({length:count+1},(_,i)=>{const open=price(i),close=price(i+1);return {time:end-(count-i)*60000,open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2,volume:100};});
const minutes=tf=>tf==='1D'||tf==='D'?1440:Number(tf);
function bars(tf,n=1200,rows=minute){const step=minutes(tf),result=[];for(let i=0;i<rows.length;i+=step){const block=rows.slice(i,i+step);result.push({time:block[0].time,open:block[0].open,close:block.at(-1).close,high:Math.max(...block.map(b=>b.high)),low:Math.min(...block.map(b=>b.low)),volume:block.length*100});}return result.slice(-n);}
async function run(tf,{rows=minute,chartBars=1200,inputs={}}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(source,'shared-strength');let session,model;
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars:bars(tf,chartBars,rows),market:{symbol:'fixture:BTC',timeframe:tf,symbolInfo:{tickerid:'fixture:BTC',mintick:1,type:'crypto'}},inputs:{showReference5:false,showStructureAlerts:false,...inputs},mode:'static',historyState:'complete',fetchSeries:async(_,tf,r)=>bars(tf,r.limit||1200,rows)},{onModel:m=>model=m,onDone:resolve,onError:reject});});return {model,variables:(await session.getContext(['variables'])).variables};}finally{session?.stop();}
}
const badges=result=>result.model.labels.filter(l=>/Shared sources:/.test(l.tooltip)).map(l=>({price:l.y,text:l.text,tooltip:l.tooltip})).sort((a,b)=>a.price-b.price||a.text.localeCompare(b.text));
let baseline;
for(const tf of ['1','5','15','30','60'])test(`identical shared source prices, scores and score components on ${tf}m`,async()=>{
 const result=await run(tf),current=badges(result);
 assert.ok(current.length>=4,'compare several actual levels on both sides');
 assert.equal(result.variables.sharedStrengthAsOf,end);
 assert.ok(result.variables.sharedStrengthPacket.length>0,'nonempty confirmed-minute evidence');
 assert.ok(current.some(l=>/[1-9]\d* assigned unswept confirmed 1M swings/.test(l.tooltip)),'exercise buildup, not just empty scores');
 if(!baseline)baseline={badges:current,packet:result.variables.sharedStrengthPacket};
 else{assert.deepEqual(current,baseline.badges);assert.equal(result.variables.sharedStrengthPacket,baseline.packet);}
});
test('default 600-bar viewing history retains the same shared scores on 1m and 30m',async()=>{
 const a=await run('1',{chartBars:600}),b=await run('30',{chartBars:600});assert.deepEqual(badges(a),badges(b));
});
test('a forming-minute wick cannot change shared evidence; its completed close removes swept evidence',async()=>{
 const before=await run('5'),changed=minute.map(b=>({...b}));
 changed.at(-1).high=Math.max(...minute.map(b=>b.high))+100;
 changed.at(-1).low=Math.min(...minute.map(b=>b.low))-100;
 const forming=await run('5',{rows:changed});
 assert.equal(forming.variables.sharedStrengthPacket,before.variables.sharedStrengthPacket);
 const last=changed.at(-1);changed.push({...last,time:last.time+60000,high:last.close+1,low:last.close-1});
 const completed=await run('5',{rows:changed});
 assert.equal(completed.variables.sharedStrengthAsOf,end+60000);
 assert.equal(completed.variables.sharedStrengthPacket,'','completed outside wick consumes all prior small-pool evidence');
});

test('a source pivot beyond 600 viewing bars retains every contributing source frame',async()=>{
 const total=18000,rows=Array.from({length:total+1},(_,i)=>{const open=82000-i/10,close=open-0.1;return {time:end-(total-i)*60000,open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2,volume:100};});
 rows[8000].high=90000;rows.at(-1).close=89900;rows.at(-1).high=89901;
 const a=await run('1',{rows,chartBars:600}),b=await run('15',{rows,chartBars:600});
 const pivot=r=>badges(r).find(l=>l.price===90000);
 assert.ok(pivot(a),'older external pivot is retained in source history');
 assert.match(pivot(a).tooltip,/Source frames: 60\+30\+15/);
 assert.deepEqual(pivot(b),pivot(a),'matching viewing interval must not truncate its own source ledger');
});

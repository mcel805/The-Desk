import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {liquidityDisplayModel} from '../web/pine-compat/liquidity-display.mjs';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const source=(await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const end=Date.UTC(2026,9,17,18),count=6000;
const price=i=>81000+300*Math.exp(-i/8000)*Math.sin(i/43)+7*Math.sin(i/3.7);
const minute=Array.from({length:count},(_,i)=>{const open=price(i),close=price(i+1);return {time:end-(count-i)*60000,open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2,volume:100};});
const tfMinutes=tf=>tf==='1D'||tf==='D'?1440:Number(tf);
function bars(tf,n=400){const step=tfMinutes(tf),rows=[];for(let i=0;i+step<=minute.length;i+=step){const block=minute.slice(i,i+step);rows.push({time:block[0].time,open:block[0].open,close:block.at(-1).close,high:Math.max(...block.map(b=>b.high)),low:Math.min(...block.map(b=>b.low)),volume:block.length*100});}return rows.slice(-n);}
async function run(src,tf,inputs={},minuteOverride=null){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'reference-five'),calls=[];let session,model;
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars:bars(tf,300),market:{symbol:'fixture:BTC',timeframe:tf,symbolInfo:{tickerid:'fixture:BTC',mintick:1,type:'crypto'}},inputs,mode:'static',historyState:'complete',fetchSeries:async(_,tf,r)=>{calls.push(tf);return minuteOverride&&tf==='1'?minuteOverride.slice(-(r.limit||400)):bars(tf,r.limit||400)}},{onModel:m=>model=m,onDone:resolve,onError:reject});});return {model,calls,context:await session.getContext(['variables'])};}finally{session?.stop();}
}

function records(packet){return packet?packet.split(';').map(row=>row.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[3]-b[3]):[];}
function expected(){
 const five=bars('5',400),active=[];
 for(let i=0;i<five.length-1;i++){
  const bar=five[i];for(let j=active.length-1;j>=0;j--)if(active[j][3]===1?bar.high>=active[j][2]:bar.low<=active[j][2])active.splice(j,1);
  const p=i-4;if(p>=4){const window=five.slice(p-4,p+5),pivot=five[p];
   if(window.every((b,j)=>j===4||(j<4?pivot.high>=b.high:pivot.high>b.high)))active.push([pivot.time,bar.time+300000,pivot.high,1]);
   if(window.every((b,j)=>j===4||(j<4?pivot.low<=b.low:pivot.low<b.low)))active.push([pivot.time,bar.time+300000,pivot.low,-1]);
  }
  while(active.length>120)active.shift();
 }
 for(const bar of minute.filter(b=>b.time>=end-300000))for(let j=active.length-1;j>=0;j--)if(bar.time>=active[j][1]&&(active[j][3]===1?bar.high>=active[j][2]:bar.low<=active[j][2]))active.splice(j,1);
 return active.sort((a,b)=>a[0]-b[0]||a[3]-b[3]);
}
let baseline;
for(const tf of ['1','2','3','4','5'])test(`fixed 5M pivots and canonical-minute sweeps match independent OHLC on ${tf}m`,async()=>{
 const result=await run(source,tf),actual=records(result.context.variables.reference5Packet),want=expected();
 assert.ok(actual.length>2);assert.equal(actual.length,want.length,JSON.stringify({actual,want}));assert.ok(result.calls.includes('5'));
 for(let i=0;i<want.length;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(actual[i][j]-want[i][j])<1e-6,`${i}/${j}: ${actual[i]} != ${want[i]}`);
 if(!baseline)baseline=actual;else assert.deepEqual(actual,baseline,'entry chart timeframe cannot redefine the 5M source pools');
});
const norm=model=>JSON.parse(JSON.stringify(model,(key,value)=>['id','title','shorttitle'].includes(key)?undefined:value));
for(const tf of ['1','5'])test(`yellow pocket rendering on ${tf}m is compact, confirmed, bounded, and score-independent`,async()=>{
 const a=await run(source,tf),b=await run(source,tf,{showReference5:false});
 const yellow=a.model.boxes.filter(box=>box.borderColor?.toUpperCase().startsWith('#F6C445'));
 assert.ok(yellow.length>0&&yellow.length<=16);assert.equal(liquidityDisplayModel(a.model).boxes.filter(box=>box.borderColor?.toUpperCase().startsWith('#F6C445')).length,yellow.length,'yellow reference pockets survive the line-only main-display adapter');assert.equal(b.model.boxes.filter(box=>box.borderColor?.toUpperCase().startsWith('#F6C445')).length,0);
 const packet=records(a.context.variables.reference5Packet);
 for(const box of yellow){const p=packet.find(p=>p[0]===box.left&&Math.abs(p[2]-(p[3]===1?box.bottom:box.top))<1e-6);assert.ok(p);assert.equal(box.right-box.left,1200000);assert.ok(box.right<=p[1]);assert.equal(box.borderWidth,1);assert.equal(box.borderStyle,'solid');}
 assert.deepEqual(norm(a.model.series),norm(b.model.series),'reference data cannot change any analytical bridge or alert feed');
 assert.deepEqual(norm(a.model.labels),norm(b.model.labels),'reference data cannot change strength badges');
 assert.deepEqual(norm(a.model.lines),norm(b.model.lines),'reference data cannot change main/structure levels');
 assert.equal(a.model.inputValues.use5,false,'reference does not enable main 5M liquidity sources');
});
for(const tf of ['15','60'])test(`yellow references are absent and make no extra 5M request above 5M (${tf})`,async()=>{
 const a=await run(source,tf);assert.equal(a.context.variables.reference5Packet,'');assert.ok(!a.calls.includes('5'));assert.ok(a.model.boxes.every(box=>!box.borderColor?.toUpperCase().startsWith('#F6C445')));
});

test('a new minute wick removes references before the 5M source packet changes',async()=>{
 const changed=minute.map(bar=>({...bar})),last=changed.at(-1);
 last.high=Math.max(...minute.map(bar=>bar.high))+100;
 last.low=Math.min(...minute.map(bar=>bar.low))-100;
 const before=await run(source,'5'),after=await run(source,'5',{},changed);
 assert.ok(records(before.context.variables.reference5Packet).length>2);
 assert.equal(after.context.variables.reference5Packet,'','minute sweeps must exclude all touched reference pools despite an unchanged 5M packet');
 assert.equal(after.model.boxes.filter(box=>box.borderColor?.toUpperCase().startsWith('#F6C445')).length,0);
});

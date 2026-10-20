import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
const sources=Object.fromEntries(await Promise.all(['a','b'].map(async k=>[k,await fs.readFile(new URL('../web/pine-examples/market-cipher-'+k+'.pine',import.meta.url),'utf8')])));
const bars=Array.from({length:600},(_,i)=>{const p=100+Math.sin(i*.085)*16+Math.sin(i*.34)*2;return {time:Date.UTC(2026,9,1)+i*3600000,open:p-Math.sin(i*.2),high:p+2,low:p-2,close:p+Math.sin(i*.2),volume:1000+i%30};});
async function run(k,{data=bars,inputs={}}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(sources[k],'cipher-'+k);let session,timer;
 try{const model=await new Promise((resolve,reject)=>{let m;timer=setTimeout(()=>reject(Error('Pine timeout')),20000);session=engine.execute({prepared,bars:data,market:{symbol:'coinbase:BTC-USD',timeframe:'60',symbolInfo:{ticker:'BTC-USD',tickerid:'coinbase:BTC-USD',mintick:.01,pricescale:100,timezone:'UTC',type:'crypto'}},inputs,mode:'static',historyState:'complete'},{onModel:x=>m=x,onError:reject,onDone:()=>resolve(m)});});return {model,prepared};}finally{clearTimeout(timer);session?.stop();}
}
function series(m,title){const s=m.series.find(s=>s.title===title);assert.ok(s,title);return s.points;}
function ema(values,n){let seed=0,last;return values.map((v,i)=>{if(i<n){seed+=v;if(i<n-1)return NaN;return last=seed/n;}return last=v*2/(n+1)+last*(1-2/(n+1));});}
function almost(a,b,msg){assert.ok(Math.abs(a-b)<1e-7,`${msg}: ${a} != ${b}`);}
test('A uses price pane, eight independent EMAs, ribbon fill and symbols',async()=>{
 const {model:m,prepared}=await run('a');assert.equal(m.overlay,true);assert.equal(prepared.inputs.length,26);assert.equal(m.series.length,8);assert.equal(m.fills.length,1);assert.ok(m.labels.length>0);
 for(const [i,n] of [5,11,15,18,21,24,28,34].entries()){
  const expected=ema(bars.map(b=>b.close),n),actual=new Map(series(m,'EMA '+(i+1)).map(p=>[p.time,p.value]));
  for(let j=n-1;j<bars.length;j++)almost(actual.get(bars[j].time),expected[j],'EMA '+n);
 }
 const {model:changed}=await run('a',{inputs:{length1:13,showSignals:false,showRibbon:false}});assert.equal(changed.labels.length,0);assert.ok(changed.series.every(s=>s.points.every(p=>!Number.isFinite(p.value))));
 const {model:longer}=await run('a',{inputs:{length1:13}});assert.notEqual(series(m,'EMA 1').at(-1).value,series(longer,'EMA 1').at(-1).value);
});
test('B pane and money-flow / fast-wave numbers match independent arithmetic',async()=>{
 const {model:m,prepared}=await run('b');assert.equal(m.overlay,false);assert.equal(prepared.inputs.length,30);assert.equal(m.fills.length,4);const zero=m.series.find(s=>s.title==='Zero fill anchor');assert.ok(m.fills.every(f=>f.toSeriesId===zero.id),'Every oscillator fill must anchor at zero');assert.ok(!m.series.some(s=>s.kind==='area'),'Avoid native pane-bottom area fill');
 const main=new Map(series(m,'Blue momentum').map(p=>[p.time,p.value]));const signal=new Map(series(m,'Light blue momentum').map(p=>[p.time,p.value]));
 for(const p of series(m,'Yellow fast wave').filter(p=>Number.isFinite(p.value)))almost(p.value,main.get(p.time)-signal.get(p.time),'fast wave');
 const flow=new Map(series(m,'Money flow').map(p=>[p.time,p.value]));for(let i=59;i<bars.length;i++){const expected=bars.slice(i-59,i+1).reduce((sum,b)=>sum+(b.close-b.open)/(b.high-b.low)*150,0)/60-2.5;almost(flow.get(bars[i].time),expected,'money flow');}
 for(const title of ['Green crossover dot','Red crossover dot','Oversold reversal dot','Overbought reversal dot','Confirmed bearish divergence'])assert.ok(series(m,title).some(p=>Number.isFinite(p.value)),title);
 const {model:off}=await run('b',{inputs:{showWaves:false,showFast:false,showFlow:false,showRSI:false,showStoch:false,showDots:false,showExtremes:false,showStrip:false,showDiv:false}});assert.ok(off.series.filter(s=>s.title!=='Zero fill anchor').every(s=>s.points.every(p=>!Number.isFinite(p.value))));
 const {model:changed}=await run('b',{inputs:{channelLength:14,flowLength:20}});assert.notEqual(series(m,'Blue momentum').at(-1).value,series(changed,'Blue momentum').at(-1).value);assert.notEqual(series(m,'Money flow').at(-1).value,series(changed,'Money flow').at(-1).value);
});
test('appending future bars preserves past numeric outputs and signal times',async()=>{
 for(const k of ['a','b']){const {model:short}=await run(k,{data:bars.slice(0,420)}),{model:full}=await run(k);for(const s of short.series){const long=new Map(series(full,s.title).map(p=>[p.time,p.value]));for(const p of s.points){if(Number.isFinite(p.value))almost(p.value,long.get(p.time),k+' '+s.title);else assert.ok(!Number.isFinite(long.get(p.time)));}}assert.deepEqual(short.labels.map(l=>({time:l.x,text:l.text,y:l.y,style:l.style,color:l.color})),full.labels.filter(l=>l.x<=bars[419].time).map(l=>({time:l.x,text:l.text,y:l.y,style:l.style,color:l.color})));}
});
test('flat zero-range / zero-volume bars never produce infinite values or oscillator signals',async()=>{
 const data=bars.map(b=>({...b,open:100,high:100,low:100,close:100,volume:0}));const {model:m}=await run('b',{data});assert.ok(m.series.every(s=>s.points.every(p=>p.value!==Infinity&&p.value!==-Infinity)));for(const s of m.series.filter(s=>/dot|divergence/.test(s.title)))assert.ok(s.points.every(p=>!Number.isFinite(p.value)));
});

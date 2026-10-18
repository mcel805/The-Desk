import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PineEngine} from '@luxalgo/vela-pinets';
import {PineTS,Indicator} from 'pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
installNestedSecurity();
const duration=tf=>({'1':1,'30':30,'60':60,'240':240,'1D':1440}[tf])*60000;
const anchor=Math.floor(Date.now()/3600000)*3600000;
function fixture(tf,n=180){const ms=duration(tf),end=anchor+ms;return Array.from({length:n},(_,i)=>{const time=end-(n-i)*ms,p=51000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+5,volume:1000};});}
const market={symbol:'fixture:MYM',timeframe:'60',symbolInfo:{tickerid:'fixture:MYM',mintick:1,type:'futures'}};
async function live(source,{inputs={},steps=3,verify,advance=false,minuteAdvance=false,explicitClose=false}={}){
 const bars=fixture('60');if(explicitClose)for(const b of bars)b.closeTime=b.time+duration('60')-1000;
 let shift=0,minuteShift=0,session,index=0;const engine=new PineEngine(),prepared=await engine.prepare(source,'live-regression');
 const models=[];let timer;
 try{await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Live regression timed out')),60000);
  session=engine.execute({prepared,bars,getBars:()=>bars,market,inputs,mode:'live',historyState:'complete',fetchSeries:async(_,tf,r)=>fixture(tf,r.limit||180).map(b=>({...b,time:b.time+shift+(tf==='1'?minuteShift:0)}))},{onModel:model=>{try{
   models.push(model);verify?.(model,index);index++;
   if(index===steps){resolve();return;}
   if(advance&&index===2){shift+=duration('60');const last=bars.at(-1);bars.push({...last,time:last.time+duration('60'),close:last.close+1});}
   else {bars.at(-1).close+=.01;bars.at(-1).volume+=1;}
   if(minuteAdvance&&index===2)minuteShift+=60000;
   session.notifyBars('tick');
  }catch(e){reject(e);}},onError:reject});
 });return models;}finally{clearTimeout(timer);session?.stop();}
}
const last=(model,title)=>model.series.find(s=>s.title===title)?.points.at(-1)?.value;
test('chart close times survive repeated live ticks and a new candle',async()=>{
 const source='//@version=6\nindicator("Live clock")\nplot(time_close,"Chart close")';
 const models=await live(source,{steps:4,advance:true,verify:(m,i)=>{assert.equal(last(m,'Chart close'),anchor+duration('60')+(i>=2?duration('60'):0),`chart tick ${i}`);}});
 assert.equal(models.length,4);
});
test('Agentic main levels and bands remain present after each live candle update',async()=>{
 const source=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8');
 let mainPrices;
 await live(source,{steps:4,minuteAdvance:true,verify:(m,i)=>{const prices=m.lines.filter(l=>l.x2-l.x1>4*duration('60')).map(l=>l.y1).sort();mainPrices??=prices;assert.deepEqual(prices,mainPrices,`main levels retained through minute rollover ${i}`);assert.ok(m.linefills.length>0,`small strips tick ${i}`);assert.ok(m.boxes.length>0,`main bands tick ${i}`);assert.ok(m.lines.some(l=>l.x2-l.x1>4*duration('60')),`main levels tick ${i}`);assert.ok(m.lines.every(l=>[l.x1,l.x2,l.y1,l.y2].every(Number.isFinite)),`finite tick ${i}`);}});
});

test('tail updates infer absent close times while preserving provider session boundaries',async()=>{
 for(const supplied of [false,true]){
  const start=Date.UTC(2026,9,17,8),close=start+45*60000;
  const bars=[{openTime:start,open:1,high:2,low:0,close:1,volume:1,...(supplied?{closeTime:close}:{})}];
  const pine=new PineTS({getMarketData:async()=>bars.map(b=>({...b})),getSymbolInfo:async()=>({mintick:1,timezone:'UTC'})},'fixture:MYM','60',1);
  const ctx=await pine.run('//@version=6\nindicator("Session close")\nplot(time_close,"Clock")');
  bars[0]={...bars[0],close:1.1};await pine.updateTail(ctx);
  assert.equal(ctx.plots.Clock.data.at(-1).value,supplied?close:start+3600000);
  bars.push({...bars[0],openTime:start+3600000,...(supplied?{closeTime:close+3600000}:{})});await pine.updateTail(ctx);
  assert.equal(ctx.plots.Clock.data.at(-1).value,supplied?close+3600000:start+7200000);
  assert.equal(Object.hasOwn(bars[0],'closeTime'),supplied,'do not mutate provider-owned candles');
 }
});

test('secondary contexts retain aligned candle history through repeated tail updates',async()=>{
 const bars=fixture('1',40).map(b=>({...b,openTime:b.time}));
 const pine=new PineTS({getMarketData:async()=>bars.map(b=>({...b})),getSymbolInfo:async()=>({mintick:1,timezone:'UTC'})},'fixture:MYM','1',40);
 const fn=Indicator.from('//@version=6\nindicator("Secondary clock")\nplot(time_close,"Clock")').prepare().fn;
 const ctx=await pine.runPretranspiled(fn);
 for(let tick=0;tick<10;tick++){
  bars.at(-1).close+=.01;await pine.updateTail(ctx);
  assert.equal(ctx.data.openTime.data.length,40,`minute history remains aligned at tick ${tick}`);
  assert.equal(ctx.data.closeTime.data.length,40);
  assert.equal(ctx.plots.Clock.data.at(-1).value,bars.at(-1).openTime+60000);
 }
});

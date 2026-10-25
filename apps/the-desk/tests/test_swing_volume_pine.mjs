import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PineEngine} from '@luxalgo/vela-pinets';
const root=new URL('../',import.meta.url);
const bars=Array.from({length:600},(_,i)=>{const p=100+Math.sin(i*.085)*16+Math.sin(i*.34)*2;return {time:Date.UTC(2026,9,1)+i*60000,open:p-Math.sin(i*.2),high:p+2,low:p-2,close:p+Math.sin(i*.2),volume:1000+i%30};});
const rows=JSON.parse(execFileSync('python3',['-c',`import json,sys
from swing_volume import SwingVolume
e=SwingVolume('hyperliquid:BTC',.01)
print(json.dumps([e.feed(b) for b in json.load(sys.stdin)],allow_nan=False))`],{cwd:root,input:JSON.stringify(bars),maxBuffer:5e6}));
async function pine(k){
 const engine=new PineEngine(),source=await fs.readFile(new URL(`../web/pine-examples/market-cipher-${k}.pine`,import.meta.url),'utf8');
 const prepared=await engine.prepare(source,'volume-parity-'+k);let session,timer;
 try{return await new Promise((resolve,reject)=>{let model;timer=setTimeout(()=>reject(Error('Pine timeout')),20000);session=engine.execute({prepared,bars,market:{symbol:'hyperliquid:BTC',timeframe:'1',symbolInfo:{ticker:'BTC',tickerid:'hyperliquid:BTC',mintick:.01,pricescale:100,timezone:'UTC',type:'crypto'}},mode:'static',historyState:'complete'},{onModel:m=>model=m,onError:reject,onDone:()=>resolve(model)});});}
 finally{clearTimeout(timer);session?.stop();}
}
test('server study matches actual Desk Pine A/B default numeric outputs and confirmed B signals',async()=>{
 for(const k of ['a','b']){
  const m=await pine(k);
  const pairs=k==='a'?[5,11,15,18,21,24,28,34].map((_,i)=>['EMA '+(i+1),r=>r.a.ema[i]]):[
   ['Blue momentum',r=>r.b.main],['Light blue momentum',r=>r.b.signal],['Yellow fast wave',r=>r.b.fast],
   ['Money flow',r=>r.b.flow_proxy],['RSI',r=>r.b.rsi],['Stochastic RSI K',r=>r.b.stoch_k],['Stochastic RSI D',r=>r.b.stoch_d]];
  for(const [title,value]of pairs){const actual=new Map(m.series.find(s=>s.title===title).points.map(p=>[p.time,p.value]));
   for(const r of rows){const expected=value(r),v=actual.get(r.time);if(expected===null)continue;assert.ok(Number.isFinite(v)&&Math.abs(v-expected)<1e-7,`${title} at ${r.time}: Pine ${v}, server ${expected}`);}}
  if(k==='b')for(const [title,signal]of [['Green crossover dot','bull_cross'],['Red crossover dot','bear_cross'],['Oversold reversal dot','oversold_cross'],['Overbought reversal dot','overbought_cross'],['Confirmed bullish divergence','bull_divergence'],['Confirmed bearish divergence','bear_divergence']]){
   const actual=m.series.find(s=>s.title===title).points.filter(p=>Number.isFinite(p.value)).map(p=>p.time);
   assert.deepEqual(rows.filter(r=>r.b.signals.includes(signal)).map(r=>r.time),actual,title);
  }
 }
});

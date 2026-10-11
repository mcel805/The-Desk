import test from 'node:test';
import assert from 'node:assert/strict';
import {FRAMES,FRAME_MS,COLORS,DEFAULTS,liquidityTimeframes,liquidityVisible,displayedLiquidity,render} from './web/wave-court-port.mjs';
const now=Date.UTC(2026,9,9,20),pool=(tf,price,taken=false)=>({tf,id:`${tf}:${price}`,time:now-FRAME_MS[tf]*20,born:now-600000,price,side:1,weight:DEFAULTS.weights[tf],taken,...(taken?{takenAt:now-60000,breakStatus:1}:{})});
const pools=FRAMES.flatMap((_,tf)=>[pool(tf,100+tf*10),pool(tf,200+tf*10,true)]);
const read=(tf,raw=pools,extra={})=>({chartTimeframe:tf,cutoff:now-60000,chart:{atr:1,barData:[{time:now-60000,open:90,high:91,low:89,close:90}]},frames:FRAMES.map((timeframe,id)=>({id,timeframe,cutoff:now-FRAME_MS[id],atr:1,degrees:Array.from({length:3},()=>({candidate:null,alternate:null}))})),raw,zones:[],retired:[],channels:[],structure:[],settings:{...DEFAULTS,waves:false,channels:false,structure:false,convergence:false,pockets:true,rawScope:'1H + 30M + 15M',...extra}});
test('each chart shows exactly its own timeframe and higher, independent of old fixed scope',()=>{
 for(const [id,tf] of FRAMES.entries()){
  assert.deepEqual(liquidityTimeframes(tf),FRAMES.slice(0,id+1));
  const r=read(tf),drawings=[];render(r,(type,config)=>drawings.push({type,config}));
  const boxes=drawings.filter(d=>d.type==='box');assert.deepEqual(boxes.map(d=>d.config.anchors[0].price),pools.filter(p=>p.tf<=id).map(p=>p.price));
  const tags=drawings.filter(d=>d.type==='text').map(d=>d.config.text.value);assert.deepEqual(tags,[1440,240,60,30,15,5,1].slice(0,id+1).map(String));
 }
 assert.equal(liquidityVisible({tf:-1},'1h'),false);assert.equal(liquidityVisible({tf:3},'unknown'),false);
});
test('hidden lower frames cannot create displayed convergence; source pools stay intact',()=>{
 const raw=[pool(2,100),pool(5,100)],before=structuredClone(raw);
 assert.equal(displayedLiquidity(raw,'1h',DEFAULTS,1).zones.length,0);
 assert.equal(displayedLiquidity(raw,'5m',DEFAULTS,1).zones.length,1);
 assert.deepEqual(raw,before);
 for(const [tf,expected] of [['1h',false],['5m',true]]){
  const r=read(tf,raw,{convergence:true}),drawings=[];render(r,(type,config)=>drawings.push({type,config}));
  assert.equal(drawings.some(d=>d.config.style?.lineColor==='#963ce6'),expected);
 }
});
test('ended history and liquidity visibility obey the same timeframe boundary',()=>{
 const r=read('1h',pools,{broken:false}),drawings=[];render(r,(type,config)=>drawings.push({type,config}));
 assert.deepEqual(drawings.filter(d=>d.type==='box').map(d=>d.config.anchors[0].price),[100,110,120]);
});

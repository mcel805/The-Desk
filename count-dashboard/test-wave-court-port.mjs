import assert from 'node:assert/strict';
import {candidate,DEFAULTS,cluster,channels,pools,cleanBars,structure,analyze,render,FRAMES} from './web/wave-court-port.mjs';
const settings={...DEFAULTS,tick:1,diagonals:false,triangles:false};
const points=prices=>prices.map((price,i)=>({time:i*60000,price,side:i%2?1:-1,index:i,born:(i+1)*60000}));
assert.equal(candidate(points([100,120,110,145,130,155]),[],0,6,settings).kind,'Impulse');
assert.equal(candidate(points([100,120,95,145,130,155]),[],0,6,settings),null,'W2 must hold origin');
assert.equal(candidate(points([100,130,110,135,131,165]),[],0,6,settings),null,'W3 cannot be shortest');
assert.equal(candidate(points([100,120,110,145,118,155]),[],0,6,settings),null,'W4 overlap is not an impulse');
assert.equal(candidate(points([100,120,110,145]),[],0,4,settings).kind,'Zigzag ABC');
assert.equal(candidate(points([100,120,99,145]),[],0,4,settings).kind,'Regular flat ABC');
assert.equal(candidate(points([100,120,97,145]),[],0,4,settings).kind,'Expanded flat ABC');
assert.equal(candidate(points([100,120,97,115]),[],0,4,settings).kind,'Running flat ABC');
const raw=[{price:100,side:1,tf:2,weight:4,born:1},{price:103,side:1,tf:2,weight:4,born:1},{price:105,side:1,tf:3,weight:2,born:1},{price:110,side:1,tf:4,weight:1,born:1}];
const zones=cluster(raw,{...settings,clusterTicks:6,minStrength:0});assert.equal(zones[0].weight,6,'same timeframe votes once');assert(zones.every(z=>z.hi-z.lo<=6),'cluster total span, not chained gap');
let seed=13;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};let close=100;const bars=Array.from({length:350},(_,i)=>{const open=close;close+=Math.round((rand()-.5)*8);return {time:i*60000,open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2};});
for(const g of channels(bars,{...DEFAULTS,tick:.01})){for(const anchor of g.anchors){assert.equal(anchor.price,bars.find(b=>b.time===anchor.time)[anchor.side===1?'high':'low'],'channel anchors must be observed swing wicks');assert(anchor.confirmedAt>anchor.time,'a swing needs completed right-side confirmation');}assert.equal(g.broken,g.confirmedBreakAt!=null,'wick overthrow alone cannot retire a channel');}
const ledger=pools(bars,2,{...DEFAULTS,tick:1});assert(ledger.length<=24);assert(ledger.every(p=>!p.taken||p.takenAt>p.born),'cannot consume pool before causal confirmation');
const clipped=cleanBars(bars,60000,bars.at(-1).time+59000);assert.equal(clipped.at(-1).time,bars.at(-2).time,'forming bar excluded');
console.log('Wave Court: impulse and correction rules, no duplicate votes, bounded clusters, confirmed swing channels, pool causality and completed bar checks passed');

for(const detector of ['Micro structure map','Batty equal lows','Batty internal range','Reaction pivots']){const tags=structure(bars,{...DEFAULTS,structureDetector:detector});assert(tags.length>0,detector+' must produce tags in the supplied fixture');assert(tags.every(t=>t.confirmedIndex>=t.index&&t.confirmedIndex<bars.length&&Number.isFinite(t.score)&&t.score<=100));}
const nativeRead=analyze(FRAMES.map(timeframe=>({timeframe,bars:timeframe==='1m'?bars:[]})),'1m'),nativeDrawings=[];render(nativeRead,(type,config)=>nativeDrawings.push({type,config}));assert(nativeDrawings.length>0);assert(nativeDrawings.every(d=>d.config.anchors.every(a=>Number.isFinite(a.time)&&Number.isFinite(a.price))),'all native render anchors are finite');
console.log('All four structure detectors and native render payloads passed');

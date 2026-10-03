import assert from 'node:assert/strict';
import {completedBars,confirmedLiquidityLevels,createSmartFibOverlay,renderLiquidityOverlay} from './quant-premium-overlays.mjs';

const hour=3_600_000;
const bars=Array.from({length:90},(_,index)=>{
  const base=100+Math.sin(index*.7)*8;
  return {time:index*hour,open:base,high:base+2,low:base-2,close:base+.5};
});
assert.equal(completedBars(bars,'1h',89*hour).length,89);
const levels=confirmedLiquidityLevels(bars,'1h');
assert(levels.length>0);
assert(levels.every(level=>level.confirmedTime>level.time));
const drawings=[];
const result=renderLiquidityOverlay([{timeframe:'1h',bars}], '1h', bars, (type,config)=>drawings.push({type,config}));
assert(result.count>0);
assert(drawings.some(item=>item.type==='trendline'));
assert(drawings.every(item=>item.config.anchors.every(anchor=>anchor.time<=bars.at(-1).time)));

let hover,removed=0,off=false;
const chart={renderer:{onCrosshairMove(callback){hover=callback;return ()=>{off=true;};}}};
const drawn=[];
const fib=createSmartFibOverlay(chart,bars,{add(type,config){drawn.push({type,config});},clear(){removed++;drawn.length=0;}});
assert(fib.swingCount>0);
let previewed=false;
for(const bar of bars){hover({time:bar.time,paneKind:'price'});if(fib.swing){previewed=true;break;}}
assert(previewed);
assert(drawn.some(item=>item.type==='trendline'));
assert.equal(fib.lock(),true);
assert.equal(fib.locked,true);
fib.unlock();
assert.equal(fib.locked,false);
fib.destroy();
assert(off&&removed>0);

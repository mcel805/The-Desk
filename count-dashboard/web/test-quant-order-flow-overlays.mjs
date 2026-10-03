import assert from 'node:assert/strict';
import {completedBars,quantPremiumItems} from './quant-premium-overlays.mjs';
import {renderQuantOrderFlow} from './quant-order-flow-overlays.mjs';

const start=Date.UTC(2026,9,1),minute=60_000;
const bars=Array.from({length:48},(_,index)=>({
  time:start+index*30*minute,open:100+index*.1,high:101+index*.1,
  low:99+index*.1,close:100.5+index*.1,volume:100+index,
}));
const snapshotAsOf=bars.at(-1).time+15*minute;
assert.equal(completedBars(bars,'30m',snapshotAsOf).at(-1).time,bars.at(-2).time,
  'a forming candle must stay excluded after the page remains open');
for(const id of ['volume-profile','tpo','vwap']){
  const drawings=[];
  const result=renderQuantOrderFlow(id,bars,'30m',(type,config)=>drawings.push({type,config}));
  assert(quantPremiumItems[id]);
  assert(result.count>0,`${id} should draw a nonempty study`);
  assert(drawings.length>0);
  assert(drawings.every(item=>item.config.anchors.every(anchor=>anchor.time<=bars.at(-1).time)),`${id} must not draw in future bars`);
  assert(result.cutoff<=bars.at(-1).time);
}
assert(quantPremiumItems.footprint.requiresExecutionFeed);
assert(quantPremiumItems['volume-bubbles'].requiresExecutionFeed);
assert.throws(()=>renderQuantOrderFlow('footprint',bars,'30m',()=>{}),/approved side aware execution feed/);
assert.throws(()=>renderQuantOrderFlow('tpo',bars,'1d',()=>{}),/intraday/);
assert.throws(()=>renderQuantOrderFlow('vwap',bars.map(bar=>({...bar,volume:null})),'30m',()=>{}),/positive reported candle volume/);

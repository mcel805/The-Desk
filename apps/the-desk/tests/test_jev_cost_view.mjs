import test from 'node:test';
import assert from 'node:assert/strict';
import {usd,meteredCost,projectSession,costSummaryHtml} from '../web/jev-cost-view.mjs';
test('small per-call amounts remain visible and unknown costs never display as zero',()=>{
  assert.equal(usd(.000252),'$0.000252');assert.equal(usd(null),'—');
  assert.equal(meteredCost({estimated_usd:.017510556,complete:false}),'≥$0.01751');
  assert.equal(meteredCost({estimated_usd:0,complete:true}),'$0.000000');
});
test('session planning multiplies only a known forecast by valid hours',()=>{
  const p={estimated_usd_per_hour_if_enabled:.06048};assert.equal(projectSession(p,8),.48384);
  for(const h of [0,-1,Infinity,169])assert.equal(projectSession(p,h),null);
  assert.equal(projectSession({},8),null);
});
test('paused chart still exposes recorded session parent total and forecast cost',()=>{
  const m={estimated_usd:.01,complete:true};const data={total:{...m,unknown_cost_requests:2},symbols:{'hyperliquid:BTC':{session:m,current_parent_swing:m,projection:{active:false,estimated_usd_per_hour_if_enabled:.06}}}};
  const html=costSummaryHtml(data,'hyperliquid:BTC');
  assert.match(html,/session \$0.01000/);assert.match(html,/parent \$0.01000/);assert.match(html,/Stored total/);
  assert.match(html,/Paused \/ off/);assert.match(html,/2 requests with unknown cost/);
});
test('stale observer figures cannot claim currently collecting',()=>{
  const m={estimated_usd:.01,complete:true};const data={stale:true,total:m,symbols:{'hyperliquid:BTC':{session:m,current_parent_swing:m,projection:{active:true,estimated_usd_per_hour_if_enabled:.06}}}};
  assert.match(costSummaryHtml(data,'hyperliquid:BTC'),/STALE/);
  assert.doesNotMatch(costSummaryHtml(data,'hyperliquid:BTC'),/>Collecting|<br>Collecting/);
});
test('cost loader prefers native accounting and marks a stopped observer stale',async()=>{
  const {withJevCosts}=await import('../web/jev-cost-loader.mjs');
  const native={costs:{total:{estimated_usd:1}}};assert.equal(await withJevCosts(native),native);
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>{calls++;assert.equal(url,'/data/jev-costs.json');return {ok:true,json:async()=>({as_of:Date.now()-20000,total:{estimated_usd:1}})};};
  try{const result=await withJevCosts({symbols:{}});assert.equal(result.costs.stale,true);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

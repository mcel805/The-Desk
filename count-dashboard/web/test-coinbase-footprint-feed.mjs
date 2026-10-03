import assert from 'node:assert/strict';
import {buildCoinbaseFootprint,fetchCoinbaseFootprint} from './coinbase-footprint-feed.mjs';
import {renderQuantExecutedOrderFlow} from './quant-order-flow-overlays.mjs';

const start=Date.UTC(2026,8,1,12),bar={time:start,timeframe:'1m',volume:3};
const trade=(trade_id,offset,price,size,side)=>({trade_id,time:new Date(start+offset).toISOString(),price:String(price),size:String(size),side});
const newest=trade(102,40_000,100,1,'sell');
const middle=trade(101,20_000,100.01,2,'buy');
const earlier=trade(100,-1_000,99.99,5,'sell');
const responses=[
  {id:'BTC-USD',status:'online',base_currency:'BTC',quote_increment:'0.01'},
  [newest],
  [middle,earlier],
];
let calls=0;
const fetchImpl=async url=>{
  const data=responses[calls++];
  if(calls===3)assert(url.includes('after=102'));
  return {ok:true,headers:{get:()=>null},json:async()=>data};
};
const payload=await fetchCoinbaseFootprint('BTC-USD',bar,{fetchImpl,maxPages:2,pauseMs:0});
assert.equal(calls,3);
assert.equal(payload.coverage.pages,2);
assert.equal(payload.coverage.trades,2);
assert.equal(payload.coverage.executedVolume,3);
assert.equal(payload.footprints[0].totalVolume,3);
assert.equal(payload.footprints[0].delta,-1);
assert.equal(payload.footprints[0].levels[0].askVolume,1);
assert.equal(payload.footprints[0].levels[1].bidVolume,2);
for(const id of ['footprint','volume-bubbles']){
  const drawings=[];
  const result=renderQuantExecutedOrderFlow(id,payload,(type,config)=>drawings.push({type,config}));
  assert(result.count>0);
  assert(drawings.length>0);
  assert(drawings.every(item=>item.config.anchors.every(anchor=>anchor.time>=start&&anchor.time<=start+60_000)));
}
assert.throws(()=>buildCoinbaseFootprint([newest,middle],{bar,tickSize:.01,product:'BTC-USD',baseCurrency:'BTC',pages:1,coveredBeforeStart:false}),/did not cover/);
assert.throws(()=>buildCoinbaseFootprint([newest,middle],{bar:{...bar,volume:4},tickSize:.01,product:'BTC-USD',baseCurrency:'BTC',pages:1,coveredBeforeStart:true}),/does not reconcile/);
assert.throws(()=>buildCoinbaseFootprint([newest,{...middle,side:'unknown'}],{bar,tickSize:.01,product:'BTC-USD',baseCurrency:'BTC',pages:1,coveredBeforeStart:true}),/maker side is invalid/);
assert.throws(()=>buildCoinbaseFootprint([newest,newest],{bar,tickSize:.01,product:'BTC-USD',baseCurrency:'BTC',pages:1,coveredBeforeStart:true}),/repeated an execution/);

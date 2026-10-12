import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {ExchangeClient} from '@nktkas/hyperliquid';
import {limitOrder,orderResult} from '../web/hyperliquid-wallet.mjs';
const meta={universe:[{name:'BTC',szDecimals:5},{name:'ETH',szDecimals:4}]},cloid='0x'+'1'.repeat(32);
test('limit ticket resolves asset IDs and validates venue precision',()=>{
 const p={coin:'ETH',side:'sell',price:'2000.1',quantity:'0.01',reduceOnly:true,cloid};
 assert.deepEqual(limitOrder(p,meta),{a:1,b:false,p:'2000.1',s:'0.01',r:true,t:{limit:{tif:'Gtc'}},c:cloid});
 for(const change of [{coin:'INVALID'},{quantity:'0.00001'},{price:'2000.123'},{price:'NaN'},{quantity:'-1'},{side:'other'}])assert.throws(()=>limitOrder({...p,...change},meta));
});
test('SDK signs testnet order with an isolated synthetic key and mock transport',async()=>{
 const sent=[];const wallet=privateKeyToAccount('0x'+'1'.repeat(64));
 const transport={isTestnet:true,async request(...args){sent.push(args);return {status:'ok',response:{type:'order',data:{statuses:[{resting:{oid:123}}]}}};}};
 const exchange=new ExchangeClient({wallet,transport});
 const result=await exchange.order({orders:[limitOrder({coin:'BTC',side:'buy',price:'50000',quantity:'0.001',cloid},meta)],grouping:'na'});
 assert.equal(orderResult(result).state,'resting');assert.equal(sent.length,1);assert.equal(sent[0][0],'exchange');assert.equal(sent[0][1].action.type,'order');assert.match(sent[0][1].signature.r,/^0x[0-9a-f]{64}$/);assert.equal(sent[0][1].action.orders[0].c,cloid);
});
test('exchange rejection and unknown responses never count as fills',()=>{
  assert.throws(()=>orderResult({status:'err',response:'not funded'}),/not funded/);
  assert.throws(()=>orderResult({status:'ok',response:{data:{statuses:[{error:'invalid size'}]}}}),/invalid size/);
  assert.throws(()=>orderResult({status:'ok',response:{}}),/Unknown/);
  for(const response of [
    {resting:{oid:undefined}},
    {filled:{oid:{value:3},totalSz:'1',avgPx:'2'}},
  ]) assert.throws(()=>orderResult({status:'ok',response:{data:{statuses:[response]}}}),/Unknown/);
  assert.deepEqual(orderResult({status:'ok',response:{data:{statuses:[{filled:{oid:3,totalSz:'1',avgPx:'2'}}]}}}),{state:'filled',oid:3,size:'1',price:'2'});
});

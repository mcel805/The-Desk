import test from 'node:test';
import assert from 'node:assert/strict';
import {createTradingActions,acknowledgeCancellation,acknowledgeTradingResult} from '../web/trading-actions.mjs';
const payload={account_id:'a',id:'o',revision:1};
test('double clicks share one request; conflicting actions wait, other orders remain responsive',async()=>{
 let resolve;const calls=[];
 const actions=createTradingActions({accountId:()=> 'a',replay:()=>false,send:(...args)=>{calls.push(args);return new Promise(r=>resolve=r);}});
 const first=actions.run('cancel',payload),second=actions.run('cancel',payload);
 assert.equal(first,second);await Promise.resolve();assert.equal(calls.length,1);assert.equal(actions.pending('a','o'),true);
 await assert.rejects(actions.run('amend',payload),/pending/);
 resolve({cancelled:'o'});assert.deepEqual(await first,{cancelled:'o'});assert.equal(actions.pending('a','o'),false);
});
test('uncertain responses retain idempotency identity; validation failures permit a corrected attempt',async()=>{
 let next=0;const keys=[];let mode='network';
 const actions=createTradingActions({accountId:()=> 'a',replay:()=>false,key:()=>String(++next),send:async(a,p,k)=>{keys.push(k);if(mode==='network')throw Error('Lost acknowledgement');if(mode==='invalid')throw Object.assign(Error('Invalid'),{status:400});return {cancelled:'o'};}});
 await assert.rejects(actions.run('cancel',payload),/Lost/);mode='ok';await actions.run('cancel',payload);assert.deepEqual(keys,['1','1']);
 mode='invalid';await assert.rejects(actions.run('cancel',payload),/Invalid/);mode='ok';await actions.run('cancel',payload);assert.deepEqual(keys,['1','1','2','3']);
});
test('replay and account switches block commands before transport',async()=>{
 let sends=0,account='b',replay=false;const actions=createTradingActions({accountId:()=>account,replay:()=>replay,send:()=>sends++});
 for(const action of ['order','amend','cancel','bracket','close','flatten','cancel_orders','reverse'])await assert.rejects(actions.run(action,payload),/Account changed/);
 account='a';replay=true;await assert.rejects(actions.run('cancel',payload),/replay/);assert.equal(sends,0);
});
test('only acknowledged orders are removed from working state',()=>{
 const state={orders:[{id:'a',status:'working',revision:1},{id:'b',status:'working',revision:3}]};
 acknowledgeCancellation(state,{});assert.equal(state.orders[0].status,'working');
 acknowledgeCancellation(state,{cancelled:'a'});assert.equal(state.orders[0].status,'cancelled');assert.equal(state.orders[0].revision,2);assert.equal(state.orders[1].status,'working');
 acknowledgeCancellation(state,{cancelled:['b']});assert.equal(state.orders[1].status,'cancelled');
});

test('acknowledged placement, amendment, protection and partial close update visible state before polling',()=>{
 const state={active_account:'a',orders:[],positions:[{id:'p',instrument:'hyperliquid:BTC',qty:'.002',stop:'90',target:'110',revision:1}]};
 const order={id:'o',account_id:'a',price:'95',status:'working',revision:1};
 acknowledgeTradingResult(state,'order',{account_id:'a'},order);assert.deepEqual(state.orders,[order]);
 const position={id:'opened',account_id:'a',instrument:'hyperliquid:BTC',side:'buy',qty:'.001',entry:'101',status:'open',revision:1};
 const original=state.positions[0];
 acknowledgeTradingResult(state,'order',{account_id:'a',instrument:'hyperliquid:BTC'},{id:'filled',account_id:'a',instrument:'hyperliquid:BTC',status:'filled',position_id:'opened',positions:[position,original]});assert.deepEqual(state.positions,[position,original]);
 acknowledgeTradingResult(state,'amend',{account_id:'a'},{...order,price:'96',revision:2});assert.equal(state.orders.find(o=>o.id==='o').price,'96');assert.equal(state.orders.length,2);
 acknowledgeTradingResult(state,'bracket',{account_id:'a',stop:'',target:'110'},{updated:'p'});const tracked=()=>state.positions.find(p=>p.id==='p');assert.equal(tracked().stop,null);assert.equal(tracked().target,'110');assert.equal(tracked().revision,2);
 acknowledgeTradingResult(state,'close',{account_id:'a'},{position_id:'p',closed_quantity:'.001'});assert.equal(tracked().qty,'0.001');assert.equal(tracked().revision,3);
 acknowledgeTradingResult(state,'close',{account_id:'a'},{position_id:'p',closed_quantity:'.001'});assert.deepEqual(state.positions,[position]);
});

test('netting acknowledgement removes closed exposure for the affected instrument',()=>{
 const state={active_account:'a',orders:[],positions:[{id:'old',instrument:'hyperliquid:BTC'},{id:'eth',instrument:'hyperliquid:ETH'}]};
 acknowledgeTradingResult(state,'order',{account_id:'a',instrument:'hyperliquid:BTC'},{id:'filled',instrument:'hyperliquid:BTC',status:'filled',positions:[]});
 assert.deepEqual(state.positions,[{id:'eth',instrument:'hyperliquid:ETH'}]);
});
test('an acknowledgement for the previous account does not affect the newly selected ledger',()=>{
 const state={active_account:'b',orders:[{id:'o',status:'working',revision:1}],positions:[]};
 acknowledgeTradingResult(state,'cancel',{account_id:'a'},{cancelled:'o'});assert.equal(state.orders[0].status,'working');
});

test('flatten and reversal acknowledgements replace old exposure without a state poll',()=>{
 const state={active_account:'a',orders:[{id:'o',status:'working',revision:1}],positions:[{id:'old',instrument:'hyperliquid:BTC',side:'buy',qty:'2'},{id:'eth',instrument:'hyperliquid:ETH',side:'buy',qty:'1'}]};
 const reversed={id:'new',instrument:'hyperliquid:BTC',side:'sell',qty:'2',entry:'100',revision:1};
 acknowledgeTradingResult(state,'reverse',{account_id:'a',instrument:'hyperliquid:BTC'},{id:'r',status:'filled',cancelled:['o'],positions:[reversed]});
 assert.deepEqual(state.positions,[{id:'eth',instrument:'hyperliquid:ETH',side:'buy',qty:'1'},reversed]);assert.equal(state.orders[0].status,'filled');assert.equal(state.orders[1].status,'cancelled');
 acknowledgeTradingResult(state,'flatten',{account_id:'a'},{closed:['new'],cancelled:[]});assert.deepEqual(state.positions,[{id:'eth',instrument:'hyperliquid:ETH',side:'buy',qty:'1'}]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {money,sourceLabel,collection,configPayload,evaluationMatches} from '../web/robinhood-model.mjs';
test('missing money is unavailable and measured zero stays zero',()=>{for(const v of [null,undefined,'','invalid'])assert.equal(money(v),'Unavailable');assert.equal(money('0'),'$0.00');assert.equal(money('100.0000'),'$100.00');});
test('coverage distinguishes missing, partial, retained stale, and disconnected data',()=>{assert.equal(sourceLabel(null),'Not loaded');assert.match(sourceLabel({status:'partial'}),/More pages/);assert.match(sourceLabel({status:'error'}),/stale/);assert.match(sourceLabel({status:'complete'},false),/disconnected/);});
test('collection returns null for unavailable data and preserves empty broker lists',()=>{assert.equal(collection({data:{positions:null}},['positions']),null);assert.deepEqual(collection({data:{positions:[]}},['positions']),[]);});
test('configuration handoff retains decimal string and revision without live authority',()=>{const p=configPayload(new Map([['name','Test'],['mode','shadow'],['symbols',' btc-usd, ETH-USD '],['maxOrderUSD','12.345'],['maxQuoteAgeSeconds','10'],['maxSpreadBps','20']]),{id:'agent',revision:2},'account');assert.equal(p.expectedRevision,2);assert.equal(p.maxOrderUSD,'12.345');assert.deepEqual(p.symbols,['BTC-USD','ETH-USD']);assert.equal(p.maxQuoteAgeSeconds,10);assert.equal(p.accountId,'account');});
test('evaluation responses must match the submitted account, agent, revision and exact ticket',()=>{
 const submitted={requestId:'request-1',agentId:'agent-A',revision:2,intent:{quantity:'0.5',limitPrice:'100',side:'buy'}};
 const result={...submitted,accountId:'account-A',intent:{side:'buy',limitPrice:'100',quantity:'0.5'}};
 assert.equal(evaluationMatches(result,submitted,'account-A'),true);
 for(const change of [{agentId:'agent-B'},{requestId:'other'},{revision:3},{accountId:'account-B'},{intent:{...submitted.intent,limitPrice:'101'}}])assert.equal(evaluationMatches({...result,...change},submitted,'account-A'),false);
 assert.equal(evaluationMatches(null,submitted,'account-A'),false);
});

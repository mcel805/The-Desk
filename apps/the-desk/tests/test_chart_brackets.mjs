import test from 'node:test';
import assert from 'node:assert/strict';
import {starterBracket,moveDraftBracket,draftTradingLevels,tradeColors,bracketLabel} from '../web/chart-bracket-model.mjs';
import {tradingLevels,tradingConfig} from '../web/trading-model.mjs';

test('chart limit staging supplies a valid long or short bracket and preserves valid user prices',()=>{
 assert.deepEqual(starterBracket({entry:100,side:'buy',tick:.5,distance:5}),{stop:95,target:110});
 assert.deepEqual(starterBracket({entry:100,side:'sell',tick:.5,distance:5}),{stop:105,target:90});
 assert.deepEqual(starterBracket({entry:100,side:'sell',tick:.5,stop:107,target:85}),{stop:107,target:85});
 assert.deepEqual(starterBracket({entry:100,side:'buy'}),{});
 const small=starterBracket({entry:.03,side:'sell',tick:.01});
 assert.ok(small.stop>.03&&small.target>0&&small.target<.03);
});
test('moving the entry preserves custom bracket distances and avoids nonpositive prices',()=>{
 const item={entry:100,side:'buy',stop:94.5,target:112};
 assert.deepEqual(moveDraftBracket(item,'entry',102.3,.5),{entry:102.5,stop:97,target:114.5});
 assert.deepEqual(moveDraftBracket(item,'entry',1,.5),{entry:6,stop:.5,target:18});
 assert.deepEqual(moveDraftBracket({entry:100,side:'sell',stop:107,target:81},'entry',104,.5),{entry:104,stop:111,target:85});
});
test('protection dragging cannot cross the entry and snaps to the instrument tick',()=>{
 for(const side of ['buy','sell']){
  const item={entry:100,side};
  assert.deepEqual(moveDraftBracket(item,'stop',side==='buy'?102:98,.5),{stop:side==='buy'?99.5:100.5});
  assert.deepEqual(moveDraftBracket(item,'target',side==='buy'?98:102,.5),{target:side==='buy'?100.5:99.5});
 }
 assert.deepEqual(moveDraftBracket({entry:100,side:'buy'},'stop',95.24,.5),{stop:95});
 assert.deepEqual(moveDraftBracket({entry:100,side:'buy'},'target',NaN,.5),{});
});
test('draft and working orders use compact labels, cyan entries, red stops and lifecycle filtering',()=>{
 const item={id:'o',instrument:'hyperliquid:BTC',status:'working',kind:'limit',entry:100,price:100,qty:2,side:'sell',stop:105,target:90};
 const q={tick:.5},levels=draftTradingLevels(item,q,()=>{},()=>{});
 assert.equal(levels.length,3);assert.equal(levels[0].color,tradeColors.entry);
 assert.equal(levels[0].label,'DRAFT · not placed');assert.equal(levels[1].label,'DRAFT · Stop Loss · −10 ticks');assert.equal(levels[2].label,'DRAFT · Take Profit · +20 ticks');assert.equal(levels[1].color,'#f23645');assert.equal(levels[2].color,'#089981');
 const state={orders:[item,{...item,id:'done',status:'filled'},{...item,id:'other',instrument:'coinbase:BTC-USD'}],positions:[],quotes:{[item.instrument]:q}};
 assert.equal(tradingLevels(state,item.instrument,tradingConfig()).length,3);
 assert.equal(tradingLevels(state,item.instrument,tradingConfig())[0].color,tradeColors.entry);
 assert.equal(tradingLevels(state,item.instrument,tradingConfig())[0].label,'SELL LIMIT · 2 @ 100 · WORKING');
 assert.equal(tradingLevels(state,item.instrument,tradingConfig({brackets:false})).length,1);
 assert.equal(draftTradingLevels({...item,side:'buy'},q,()=>{},()=>{})[0].color,tradeColors.entry);
 assert.equal(bracketLabel({...item,entry:undefined,price:null,trigger:100,kind:'stop'},'trigger',q),'Entry');
});

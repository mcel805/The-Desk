import {test} from 'node:test';import assert from 'node:assert/strict';
import {tradingConfig,positionMetrics,summarizePositions,tradingLevels,tradeLevelPlacement,ladderPrices,marketIdentity} from '../web/trading-model.mjs';
test('provider aliases resolve to their executable instrument',()=>{assert.equal(marketIdentity({market:{symbol:'BTC'},data:{resolve:()=>({provider:{name:'Coinbase'},ticker:'BTC-USD'})}}),'coinbase:BTC-USD');});
test('position metrics use executable bid for long and ask for short',()=>{let q={bid:110,ask:111,tick:.5};assert.equal(positionMetrics({entry:100,qty:2,side:'buy'},q).value,20);assert.equal(positionMetrics({entry:100,qty:2,side:'sell'},q,'ticks').value,-22);assert.equal(summarizePositions([{entry:100,qty:2,side:'buy'}],q,'percent').value,10);});
test('chart levels obey market, lifecycle and configured visibility',()=>{let p={id:'p',instrument:'hyperliquid:BTC',side:'buy',entry:100,qty:2,stop:95,target:110};let s={positions:[p,{...p,id:'foreign',instrument:'coinbase:BTC-USD'}],quotes:{},orders:[{id:'o',instrument:p.instrument,status:'working',kind:'stop_limit',side:'sell',qty:1,price:99,trigger:98},{id:'done',instrument:p.instrument,status:'filled',price:100}]};assert.equal(tradingLevels(s,p.instrument,tradingConfig()).length,5);assert.equal(tradingLevels(s,p.instrument,tradingConfig({brackets:false,orders:false})).length,1);assert.equal(tradingLevels(s,p.instrument,tradingConfig({positions:false,orders:false})).length,0);});
test('ladder has stable descending prices and exact decimal steps',()=>{assert.deepEqual(ladderPrices(100,.5,10,5),[110,105,100,95,90]);assert.deepEqual(ladderPrices(.02,.01,1,5),[.04,.03,.02,.01]);assert.equal(tradingConfig({instant:'true',pnlUnit:'invalid'}).instant,false);});
test('working BTC sell survives hourly to minute scale changes and becomes a position after filling',()=>{
 const item={id:'sell',instrument:'hyperliquid:BTC',side:'sell',qty:'.001',kind:'limit',status:'working',price:'84000'};
 const state={orders:[item],positions:[],quotes:{}},config=tradingConfig(),bounds={top:0,height:500};
 for(const timeframe of ['60','1','5','240']){
  const market=marketIdentity({market:{symbol:item.instrument,timeframe}}),levels=tradingLevels(state,market,config);
  assert.equal(levels.length,1);assert.equal(levels[0].item.id,'sell');
  const placement=tradeLevelPlacement(timeframe==='60'?100:-1000,bounds);
  assert.ok(placement.y>bounds.top&&placement.y<bounds.top+bounds.height);
  assert.equal(placement.edge,timeframe==='60'?null:'top');
 }
 item.status='filled';state.positions=[{...item,id:'position',entry:'84002'}];
 assert.deepEqual(tradingLevels(state,item.instrument,config).map(l=>l.kind),['position']);
 assert.equal(tradingLevels(state,'coinbase:BTC-USD',config).length,0);
});
test('off-scale controls handle both edges, inverted scales and invalid geometry',()=>{
 const bounds={top:20,height:300};
 assert.deepEqual(tradeLevelPlacement(-30,bounds),{y:66,edge:'top'});
 assert.deepEqual(tradeLevelPlacement(450,bounds),{y:307,edge:'bottom'});
 assert.deepEqual(tradeLevelPlacement(100,bounds),{y:100,edge:null});
 assert.equal(tradeLevelPlacement(20,bounds).edge,'top');assert.equal(tradeLevelPlacement(320,bounds).edge,'bottom');
 assert.equal(tradeLevelPlacement(NaN,bounds),null);assert.equal(tradeLevelPlacement(Infinity,bounds),null);
 assert.equal(tradeLevelPlacement(10,{top:0,height:0}),null);
});

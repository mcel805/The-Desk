import {test} from 'node:test';import assert from 'node:assert/strict';
import {formatMoney,formatPnl,positionPnlIncrement,tradingConfig,paperExecutionMarkers,positionMetrics,summarizePositions,tradingLevels,tradeLevelPlacement,ladderPrices,marketIdentity} from '../web/trading-model.mjs';
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

test('paper execution history requires a new explicit opt-in and survives settings restoration',()=>{
 const legacy=tradingConfig({executions:true,labels:true,positions:false,pnlUnit:'ticks'});
 assert.equal(legacy.executionHistory,false);assert.equal(legacy.positions,false);assert.equal(legacy.pnlUnit,'ticks');
 const restored=tradingConfig(JSON.parse(JSON.stringify(tradingConfig({executionHistory:true}))));
 assert.equal(restored.executionHistory,true);
 const s={active_account:'a',fills:[{id:'own',account_id:'a',instrument:'hyperliquid:BTC'},{id:'other-market',account_id:'a',instrument:'hyperliquid:ETH'},{id:'other-account',account_id:'b',instrument:'hyperliquid:BTC'}]};
 assert.deepEqual(paperExecutionMarkers(s,'hyperliquid:BTC',legacy),[]);
 assert.deepEqual(paperExecutionMarkers(s,'hyperliquid:BTC',restored).map(f=>f.id),['own']);
 assert.deepEqual(paperExecutionMarkers(s,'hyperliquid:BTC',restored,true),[]);
 assert.equal(s.fills.length,3);
});


test('small ETH short P&L stays visible and consistent across row, account, chart and DOM units',()=>{
 const p={instrument:'hyperliquid:ETH',side:'sell',entry:'2401.2',qty:'.001'};
 for(const [ask,money,ticks] of [['2401.5','$-0.0003','−3.00 ticks'],['2402.0','$-0.0008','−8.00 ticks'],['2402.5','$-0.0013','−13.00 ticks'],['2411.5','$-0.0103','−103.00 ticks']]){
  const q={bid:Number(ask)-.1,ask,tick:'.1'},metrics=positionMetrics(p,q),step=positionPnlIncrement([p],{[p.instrument]:q});
  assert.equal(formatMoney(metrics.pnl,metrics.increment),money);
  assert.equal(formatMoney(metrics.pnl,step),money);
  assert.equal(formatPnl(metrics),'−'+money.replace('$-','$'));
  assert.equal(formatPnl(summarizePositions([p],q)),formatPnl(metrics));
  assert.equal(formatPnl(positionMetrics(p,q,'ticks')),ticks);
 }
 assert.equal(formatMoney(positionMetrics(p,{bid:2401,ask:2401.1,tick:.1}).pnl,.0001),'$0.0001');
 assert.equal(formatMoney(positionMetrics({...p,side:'buy'},{bid:2401.5,ask:2401.6,tick:.1}).pnl,.0001),'$0.0003');
 assert.equal(formatMoney(0,.0001),'$0.00');assert.equal(formatMoney(12.345), '$12.35');
 for(const v of [null,undefined,'',NaN,Infinity])assert.equal(formatMoney(v),'—');
 assert.equal(positionPnlIncrement([],{}),.01);
 assert.equal(formatMoney(.00000003),'$0.00000003');
});
test('dated IBKR futures retain their provider identity instead of becoming Hyperliquid symbols',()=>{
 for(const chart of [{market:{symbol:'ibkr:MYM-202612'}},{market:{symbol:'MYM-202612',provider:'ibkr'},data:{resolve:()=>({provider:{name:'IBKR'},ticker:'MYM-202612'})}}])assert.equal(marketIdentity(chart),'ibkr:MYM-202612');
});

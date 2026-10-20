import test from 'node:test';
import assert from 'node:assert/strict';
import {manualLevels,liquidityLevels,editPayload,money,cyan,drawingScope} from '../web/agents-model.mjs';
test('only visible manual cyan horizontal lines become signals',()=>{
 const line={id:'a',type:'hline',anchors:[{price:100,time:1}],style:{lineColor:'#00ffff'}};
 assert.deepEqual(manualLevels([line,{...line,id:'b',type:'trendline'},{...line,id:'c',visible:false},{...line,id:'d',style:{lineColor:'#ff0000'}}]),[{id:'drawing:single:a',price:'100',source:'manual-cyan',label:'Cyan horizontal · a'}]);
 assert.equal(cyan('#22d3ee'),true);assert.equal(cyan('#00ffff00'),false);
});
test('liquidity signal preserves instance, symbol, timeframe, active endpoints and freshness',()=>{
 const line={id:'pool1',y1:100,y2:100,xloc:'bar_time',x1:10,x2:300,extend:'none',style:'solid',width:2};
 const record={liquidity:true,instrument:'hyperliquid:BTC',timeframe:'1',observedAt:Date.now(),lastBarTime:200,lines:[line,{...line,id:'retired',style:'dotted'},{...line,id:'past',x2:100},{...line,id:'diagonal',y2:101}]};
 assert.equal(liquidityLevels([['study1',record]],'hyperliquid:BTC','1').length,1);
 assert.equal(liquidityLevels([['study1',record]],'hyperliquid:ETH','1').length,0);
 assert.equal(liquidityLevels([['study1',{...record,observedAt:Date.now()-16000}]],'hyperliquid:BTC','1').length,0);
});
test('recreated Pine drawing ids retain the same pool signal identity',()=>{
 const line={id:'old',x1:100,x2:1000,xloc:'bar_time',y1:50,y2:50,width:2,style:'solid',extend:'none'};
 const r={liquidity:true,instrument:'hyperliquid:BTC',timeframe:'1',observedAt:Date.now(),lastBarTime:500,lines:[line]};
 const first=liquidityLevels([['study',r]],r.instrument,r.timeframe);
 const next=liquidityLevels([['study',{...r,lines:[{...line,id:'new'}]}]],r.instrument,r.timeframe);
 assert.equal(first[0].id,next[0].id);
});
test('drawing symbol provenance survives switching and reload',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},scope=drawingScope(storage),drawing={id:'cyan-1'};
 assert.equal(scope.filter('cell','hyperliquid:BTC',[drawing]).length,0,'legacy drawings need explicit adoption');
 scope.bind('cell',drawing.id,'hyperliquid:BTC');assert.equal(scope.filter('cell','hyperliquid:BTC',[drawing]).length,1);
 assert.equal(scope.filter('cell','hyperliquid:ETH',[drawing]).length,0);
 assert.equal(drawingScope(storage).filter('cell','hyperliquid:ETH',[drawing]).length,0);
 assert.equal(scope.filter('cell','hyperliquid:BTC',[drawing]).length,1);
});
test('modular editor keeps quantities and risk as decimal strings and revision explicit',()=>{
 const fd=new FormData();for(const [k,v] of Object.entries({name:'Test',avatar:'bot',color:'#22d3ee',mode:'simulation',venue:'simulation',accountId:'a',instrument:'hyperliquid:BTC',side:'buy',toleranceBps:'2',entryType:'limit-level',quantity:'.001',expirySeconds:'60',stopBps:'20',rewardRisk:'2',maxHoldingSeconds:'1800',maxOrderUSD:'100',maxRiskUSD:'2',maxExposureUSD:'200',maxDailyLossUSD:'20',maxTradesPerDay:'10',maxConcurrent:'1',cooldownSeconds:'60',maxQuoteAgeSeconds:'10',maxSpreadBps:'20','manual-cyan':'on'}))fd.set(k,v);
 const p=editPayload(fd,{id:'agent',revision:4});assert.equal(p.expectedRevision,4);assert.equal(p.modules.entry.quantity,'.001');assert.equal(p.modules.risk.maxOrderUSD,'100');assert.deepEqual(p.modules.signal.sources,['manual-cyan']);assert.equal(p.modules.risk.maxConcurrent,1);
});
test('empty performance stays unavailable while actual zero remains zero',()=>{assert.equal(money(null),'Unavailable');assert.equal(money('0'),'$0.00');});

import test from 'node:test';import assert from 'node:assert/strict';
import {annotationsFor,drawingSpec,SPIDER_FRAMES,sourceURL,canonicalFrame} from '../web/spider-model.mjs';
import {SpiderIntervalProvider} from '../web/spider-provider.mjs';
test('nine frames include all requested intervals without conflating 2m and 3m',()=>{assert.deepEqual(SPIDER_FRAMES.map(f=>f[0]),['1d','4h','1h','30m','15m','5m','3m','2m','1m']);});
test('drawings never leak onto another symbol, timeframe or unfinished report',()=>{
 const a={id:'pool',kind:'level',role:'liquidity',state:'observed',time:100,price:200,endTime:300,endPrice:200,label:'candidate'};
 const r={id:'run',instrument:'hyperliquid:BTC',status:'complete',analysis:{frames:[{timeframe:'2m',annotations:[a]}]},snapshots:{'2m':{status:'available'}}};
 assert.equal(annotationsFor(r,'hyperliquid:ETH','2').length,0);assert.equal(annotationsFor(r,r.instrument,'3').length,0);assert.equal(annotationsFor({...r,status:'analysing'},r.instrument,'2').length,0);
 const levels=annotationsFor(r,r.instrument,'2');assert.equal(levels.length,1);assert.equal(drawingSpec(levels[0]).type,'hline');assert.equal(drawingSpec({...levels[0],kind:'path',state:'conditional'}).options.style.lineStyle,'dashed');
 assert.equal(drawingSpec({...levels[0],kind:'zone'}).type,'box');
});
test('two-minute wrapper delegates normal streams and uses exact server symbol for aggregation',async()=>{
 const calls=[],delegate={info:()=>({supportedTimeframes:['1','3']}),getBars:async(...args)=>{calls.push(args);return ['native'];},subscribe:()=> 'subscription'};
 const p=new SpiderIntervalProvider(delegate,'hyperliquid');assert(p.info().supportedTimeframes.includes('2'));assert.deepEqual(await p.getBars('BTC','3'),['native']);assert.equal(p.subscribe('BTC','3',()=>{}),'subscription');
 const old=globalThis.fetch;globalThis.fetch=async url=>{assert.match(url,/instrument=hyperliquid%3ABTC/);assert.match(url,/timeframe=2m/);return {ok:true,json:async()=>({bars:[{time:100},{time:200},{time:300}]})};};
 try{assert.deepEqual(await p.getBars('BTC','2',{from:150,to:250}),[{time:200}]);}finally{globalThis.fetch=old;}
});
test('report links reject executable and local URLs',()=>{for(const u of ['javascript:alert(1)','http://example.com','https://127.0.0.1/a','https://x:y@example.com'])assert.equal(sourceURL(u),null);assert.equal(sourceURL('https://www.cmegroup.com/markets.html'),'https://www.cmegroup.com/markets.html');});
import {stripSpiderDrawings} from '../web/spider-model.mjs';
test('Spider overlays stay in reports and cannot leak through reusable layout persistence',()=>{
 const state={charts:[{drawings:{version:1,drawings:[{id:'manual',text:{value:'My level'}},{id:'spider',text:{value:'Spider · objective'}}]}}]};
 const clean=stripSpiderDrawings(state);assert.deepEqual(clean.charts[0].drawings.drawings.map(d=>d.id),['manual']);assert.equal(state.charts[0].drawings.drawings.length,2);
});
import {feedChoices,assetMatchesChart} from '../web/account-context.mjs';
test('three crypto chart sources keep Robinhood spot execution identity explicit',()=>{
 const asset={kind:'crypto',symbol:'BTC-USD'};
 const feeds=feedChoices(asset,new Set(['BTC']),new Set(['BTC-USD']),new Set(['BTCUSDT']));
 assert.deepEqual(feeds.map(f=>f.instrument),['hyperliquid:BTC','coinbase:BTC-USD','binance:BTCUSDT']);
 assert.equal(assetMatchesChart(asset,'binance:BTCUSDT'),true);assert.equal(assetMatchesChart(asset,'binance:ETHUSDT'),false);
 assert.equal(assetMatchesChart({kind:'crypto',symbol:'kPEPE-USD'},'binance:PEPEUSDT'),false);
 assert.match(feeds[2].label,/USDT.*USD/);assert.equal(asset.symbol,'BTC-USD');
});

test('daily security aliases and older indicator history retain the same provider',async()=>{
 assert.equal(canonicalFrame('1D'),'1d');
 const calls=[],delegate={getBars:async(...args)=>{calls.push(args);return [{time:100}];}};
 const p=new SpiderIntervalProvider(delegate,'hyperliquid');p.serverHistory=true;
 const old=globalThis.fetch;globalThis.fetch=async url=>{assert.match(url,/timeframe=1d/);return {ok:true,json:async()=>({bars:[{time:300}]})};};
 try{assert.deepEqual(await p.getBars('BTC','1D',{to:200}),[{time:100}]);assert.deepEqual(calls,[['BTC','D',{to:200}]]);}finally{globalThis.fetch=old;}
});

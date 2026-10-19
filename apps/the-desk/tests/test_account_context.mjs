import test from 'node:test';
import assert from 'node:assert/strict';
import {accountOptions,portfolioMetrics,brokerMoney,isVerified,feedChoices,assetMatchesChart,RobinhoodProvider} from '../web/account-context.mjs';
import {marketIdentity} from '../web/trading-model.mjs';
test('connection freshness expires and read-only access remains explicit',()=>{
 assert.equal(isVerified({connected:true,observedAt:100},159),true);assert.equal(isVerified({connected:true,observedAt:100},160),false);
 const html=accountOptions([{id:'p',name:'Test'}],'p',{connected:true,observedAt:Date.now()/1000,accounts:[{id:'r',name:'MCP',account:'••••1234',tradable:false}]});
 assert.match(html,/connected · read only/);assert.match(html,/Interactive Brokers · coming soon/);assert.match(html,/Binance · account not configured/);
});
test('broker money preserves missing values and crypto spendable power',()=>{
 const result=portfolioMetrics({data:{cash:'5',total_value:'10',buying_power:{buying_power:'20'},crypto_buying_power:{buying_power:'3'}}});
 assert.equal(result.cryptoBuyingPower,'3');assert.equal(result.buyingPower,'20');assert.equal(brokerMoney(null),'Unavailable');assert.equal(brokerMoney('0'),'$0.00');assert.equal(result.unrealized,null);
});
test('reference feeds require exact underlying availability and preserve execution symbol',()=>{
 const a={kind:'crypto',symbol:'BTC-USD'},hl=new Set(['BTC']),cb=new Set(['BTC-USD']);
 assert.equal(feedChoices(a,hl,cb)[0].instrument,'hyperliquid:BTC');assert.equal(a.symbol,'BTC-USD');
 assert.equal(assetMatchesChart(a,'hyperliquid:ETH'),false);assert.equal(assetMatchesChart(a,'hyperliquid:BTC'),true);
 assert.equal(feedChoices({kind:'crypto',symbol:'PEPE-USD'},new Set(['kPEPE']),new Set())[0].instrument,'robinhood:PEPE-USD');
});
test('equities retain Robinhood identity rather than becoming Hyperliquid instruments',()=>{
 assert.equal(marketIdentity({market:{symbol:'robinhood:AAPL'}}),'robinhood:AAPL');
 assert.equal(feedChoices({kind:'equity',symbol:'AAPL'},new Set(['BTC']),new Set())[0].instrument,'robinhood:AAPL');
});
test('crypto without historical provider returns no invented candles',async()=>{
 const p=new RobinhoodProvider(()=>null);assert.deepEqual(await p.getBars('PEPE-USD','60',{}),[]);assert.equal((await p.getSymbolInfo('AAPL')).type,'stock');
});

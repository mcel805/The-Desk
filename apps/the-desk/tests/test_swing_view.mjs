import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleSwingCharts,selectSwingChart} from '../web/swing-view-model.mjs';
const charts=[{id:'daily',market:'hyperliquid:BTC',timeframe:'D'},{id:'five',market:'hyperliquid:BTC',timeframe:'5'},{id:'one',market:'hyperliquid:BTC',timeframe:'1'},{id:'duplicate',market:'hyperliquid:BTC',timeframe:'1'},{id:'eth',market:'hyperliquid:ETH',timeframe:'1'},{id:'spot',market:'coinbase:BTC-USD',timeframe:'1'}];
test('only supported one-minute charts are eligible',()=>assert.deepEqual(eligibleSwingCharts(charts).map(c=>c.id),['one','duplicate','eth']));
test('auto owns exactly one chart and retains it while other charts become active',()=>{
 assert.equal(selectSwingChart(charts,{active:'five'}).id,'one');
 assert.equal(selectSwingChart(charts,{previous:'one',active:'duplicate'}).id,'one');
 assert.equal(selectSwingChart(charts,{active:'duplicate'}).id,'duplicate');
});
test('running market filters auto and manual display without starting or switching observations',()=>{
 assert.equal(selectSwingChart(charts,{previous:'one',runningMarket:'hyperliquid:ETH'}).id,'eth');
 assert.equal(selectSwingChart(charts,{selected:'one',runningMarket:'hyperliquid:ETH'}),null);
 assert.equal(selectSwingChart(charts,{selected:'duplicate',runningMarket:'hyperliquid:BTC'}).id,'duplicate');
});
test('missing, changed and unsupported selected charts do not silently move the pinned display',()=>{
 for(const selected of ['missing','five','daily','spot'])assert.equal(selectSwingChart(charts,{selected}),null);
 assert.equal(selectSwingChart(charts.map(c=>({...c,timeframe:'5'}))),null);
 assert.equal(selectSwingChart(charts.filter(c=>c.market!=='hyperliquid:ETH'),{runningMarket:'hyperliquid:ETH'}),null);
});

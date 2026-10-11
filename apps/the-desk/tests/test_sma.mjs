import test from 'node:test';
import assert from 'node:assert/strict';
import {runSmaBacktest} from '../web/sma-backtest.mjs';
const closes=[10,10,10,9,8,12,13,14,7,6,5,15,16];
const bars=closes.map((close,i)=>({time:i*60000,open:100+i,high:120,low:1,close}));
test('signals use next open, exact fees, and retain open exposure',()=>{
  const r=runSmaBacktest(bars,{fast:2,slow:3,feeBps:10});
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].entryTime,360000);assert.equal(r.trades[0].entry,106);
  assert.equal(r.trades[0].exitTime,540000);assert.equal(r.trades[0].exit,109);
  assert.equal(r.trades[0].fee,.215);assert.equal(r.equity,2.785);assert.equal(r.wins,1);
  assert.equal(r.openPosition.entry,112);assert.equal(r.openPosition.lastClose,16);
});
test('last-bar crossover cannot invent a following fill',()=>{
  const r=runSmaBacktest(bars.slice(0,12),{fast:2,slow:3});assert.equal(r.trades.length,1);assert.equal(r.openPosition,null);
});
test('realized drawdown includes fees and losing exit',()=>{
  const changed=bars.map(b=>({...b}));changed[9].open=90;
  const r=runSmaBacktest(changed,{fast:2,slow:3,feeBps:10});assert.equal(r.equity,-16.196);assert.equal(r.maxDrawdown,16.196);assert.equal(r.losses,1);
});
test('flat prices do not create trades',()=>{
  const r=runSmaBacktest(bars.map(b=>({...b,close:10})),{fast:2,slow:3});assert.equal(r.trades.length,0);assert.equal(r.equity,0);
});
test('invalid parameters fail explicitly',()=>{
  for(const inputs of [{fast:1,slow:3},{fast:3,slow:3},{fast:2.5,slow:4},{fast:2,slow:301},{feeBps:-1},{feeBps:Infinity}])assert.throws(()=>runSmaBacktest(bars,inputs));
});
test('insufficient valid bars fail explicitly',()=>{
  assert.throws(()=>runSmaBacktest(bars.slice(0,5),{fast:2,slow:3}),/valid bars/);
  assert.throws(()=>runSmaBacktest(bars.map(b=>({...b,close:NaN})),{fast:2,slow:3}),/valid bars/);
});

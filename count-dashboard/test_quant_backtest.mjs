import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runSmaBacktest} from './web/quant-backtest.mjs';

const closes = [10, 10, 10, 8, 9, 12, 11, 9, 8, 8];
const bars = closes.map((close, index) => ({
  time: index * 60_000, open: close + 1, high: close + 2, low: close - 2, close,
}));

test('confirmed SMA signals fill at the following bar open and charge both fee sides', () => {
  const result = runSmaBacktest(bars, {fast:2,slow:3,feeBps:100});
  assert.equal(result.trades.length, 1);
  assert.deepEqual(result.trades[0], {
    entryTime:360_000,exitTime:480_000,entry:12,exit:9,gross:-3,fee:0.21,pnl:-3.21,
  });
  assert.equal(result.maxDrawdown, 3.21);
});

test('unclosed positions are excluded from closed trade statistics', () => {
  const result = runSmaBacktest(bars.slice(0, 8), {fast:2,slow:3});
  assert.equal(result.trades.length, 0);
  assert.equal(result.equity, 0);
  assert.equal(result.openPosition?.entry, 12);
});

test('invalid windows and fees fail before reporting performance', () => {
  assert.throws(() => runSmaBacktest(bars,{fast:3,slow:3}), /averages/);
  assert.throws(() => runSmaBacktest(bars,{fast:2,slow:3,feeBps:-1}), /Fee/);
});

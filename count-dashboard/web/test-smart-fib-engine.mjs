import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSmartFibSwing,confirmedAlternatingSwings,smartFibSwingAtTime} from './smart-fib-engine.mjs';

const rising = {
  from:{time:10,price:100,side:'LOW'},
  to:{time:20,price:120,side:'HIGH'},
  confirmedEndTime:20,
};

test('rising locked swing advances its endpoint to a new bar high', () => {
  assert.deepEqual(advanceSmartFibSwing(rising,{time:30,high:125,low:118}),{
    ...rising,to:{...rising.to,time:30,price:125},
  });
});

test('falling locked swing tracks a new low without retracing its endpoint', () => {
  const falling={from:{time:10,price:130,side:'HIGH'},to:{time:20,price:100,side:'LOW'},confirmedEndTime:20};
  assert.deepEqual(advanceSmartFibSwing(falling,{time:30,high:105,low:96}),{
    ...falling,to:{...falling.to,time:30,price:96},
  });
  assert.equal(advanceSmartFibSwing(falling,{time:30,high:106,low:102}).to.price,100);
});

test('older and malformed bars cannot move the locked endpoint', () => {
  assert.equal(advanceSmartFibSwing(rising,{time:19,high:140,low:90}),rising);
  assert.equal(advanceSmartFibSwing(rising,{time:30,high:NaN,low:90}),rising);
});

test('same-price ticks advance the endpoint time once a new bar opens', () => {
  assert.deepEqual(advanceSmartFibSwing(rising,{time:30,high:119,low:118}),{
    ...rising,to:{...rising.to,time:30,price:120},
  });
});

test('swing timeframe bars produce alternating confirmed high and low pivots', () => {
  const highs=[5,9,6,5,7,12,8,7,9,14,11,10,8];
  const lows =[4,7,5,2,4,8,6,3,5,10,8,6,5];
  const bars=highs.map((high,index)=>({time:index*60*60_000,high,low:lows[index]}));
  assert.deepEqual(confirmedAlternatingSwings(bars,1).map(({time,side})=>({time,side})),[
    {time:60*60_000,side:'HIGH'},
    {time:3*60*60_000,side:'LOW'},
    {time:5*60*60_000,side:'HIGH'},
    {time:7*60*60_000,side:'LOW'},
    {time:9*60*60_000,side:'HIGH'},
  ]);
});

test('hover resolves the selected HTF swing by chart timestamp and rejects time outside it', () => {
  const swings=[
    {index:1,time:10,price:130,side:'HIGH'},
    {index:3,time:30,price:100,side:'LOW'},
    {index:5,time:50,price:125,side:'HIGH'},
  ];
  assert.equal(smartFibSwingAtTime(swings,40).from.time,30);
  assert.equal(smartFibSwingAtTime(swings,40).to.time,50);
  assert.equal(smartFibSwingAtTime(swings,9),null);
  assert.equal(smartFibSwingAtTime(swings,51),null);
});

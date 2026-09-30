import test from 'node:test';
import assert from 'node:assert/strict';
import {liquidityConvergenceGroups} from './web/liquidity-convergence.js';

const level = (timeframe,side,price,time,more={}) => ({
  timeframe,side,price,time,confirmedTime:time+10,atr:100,kind:'EXT',breakIndex:-1,...more,
});
const groups = (levels,settings={}) => liquidityConvergenceGroups(levels,'1H',{convergenceAtr:0.1,...settings},1000);

test('two same-side levels merge across timeframes after both confirm',()=>{
  const result=groups([level('1H','HIGH',100,10),level('30M','HIGH',104,20)]);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].timeframes,['1H','30M']);
  assert.equal(result[0].joinTime,30);
});

test('distinct same-timeframe pivots can converge, duplicate EXT/INT pivot does not count twice',()=>{
  const a=level('1H','LOW',100,10);
  const duplicate=level('1H','LOW',100,10,{kind:'INT'});
  assert.equal(groups([a,duplicate]).length,0);
  assert.equal(groups([a,level('1H','LOW',103,30)]).length,1);
  assert.equal(groups([a,level('1H','LOW',103,30)],{showLocalConvergences:false}).length,0);
});

test('opposite sides stay separate and mark a same-side group contested',()=>{
  const result=groups([level('1H','HIGH',100,10),level('30M','HIGH',103,20),level('5M','LOW',102,30)]);
  assert.equal(result.length,1);
  assert.equal(result[0].contested,true);
  assert.equal(result[0].members.length,2);
});

test('broken, unconfirmed, distant and chain-linked levels do not create false convergence',()=>{
  assert.equal(groups([level('1H','HIGH',100,10),level('30M','HIGH',103,20,{breakIndex:2})]).length,0);
  assert.equal(groups([level('1H','HIGH',100,10),level('30M','HIGH',103,999)]).length,0);
  assert.equal(groups([level('1H','HIGH',100,10),level('30M','HIGH',115,20)]).length,0);
  const chained=groups([level('1H','HIGH',100,10),level('30M','HIGH',108,20),level('5M','HIGH',116,30)]);
  assert.equal(chained.length,1);
  assert.equal(chained[0].members.length,2);
  assert.ok(chained[0].high-chained[0].low<=chained[0].tolerance);
});

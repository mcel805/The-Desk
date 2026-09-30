import test from 'node:test';
import assert from 'node:assert/strict';
import {moveAttachedLevels, planMetrics} from './paper-chart-planner.js';

test('long and short projections use contract point value and direction', () => {
  const long = planMetrics({side:'long',quantity:2,entry:100,stop:98,target:106,reference:103,multiplier:5});
  assert.deepEqual({risk:long.risk,reward:long.reward,ratio:long.ratio,scenarioPnL:long.scenarioPnL},
    {risk:20,reward:60,ratio:3,scenarioPnL:30});
  const short = planMetrics({side:'short',quantity:3,entry:100,stop:102,target:94,reference:97,multiplier:2});
  assert.deepEqual({risk:short.risk,reward:short.reward,ratio:short.ratio,scenarioPnL:short.scenarioPnL},
    {risk:12,reward:36,ratio:3,scenarioPnL:18});
});

test('invalid bracket direction cannot produce a ready plan', () => {
  assert.equal(planMetrics({side:'long',quantity:1,entry:100,stop:101,target:110,reference:100,multiplier:.5}).valid,false);
  assert.equal(planMetrics({side:'short',quantity:1,entry:100,stop:101,target:105,reference:100,multiplier:.5}).valid,false);
});

test('hypothetical P&L changes with the chart scenario price', () => {
  const plan = {side:'long',quantity:2,entry:100,stop:98,target:104,multiplier:5};
  assert.equal(planMetrics({...plan,reference:101}).scenarioPnL,10);
  assert.equal(planMetrics({...plan,reference:99}).scenarioPnL,-10);
});

test('follow-entry preserves stop and target distance for both directions', () => {
  assert.deepEqual(moveAttachedLevels(100,102,98,106),{stop:100,target:108});
  assert.deepEqual(moveAttachedLevels(100,97,102,94),{stop:99,target:91});
  assert.deepEqual(moveAttachedLevels(100,101,'',104),{stop:'',target:105});
  assert.deepEqual(moveAttachedLevels(null,101,98,104),{stop:98,target:104});
});

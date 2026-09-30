import test from 'node:test';
import assert from 'node:assert/strict';
import {planMetrics} from './paper-chart-planner.js';

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

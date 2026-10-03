import assert from 'node:assert/strict';
import {normalizeBarsForChart} from './chart-contract.js';
import {selectProfileWindow,candleVolumeProfile,candleTPO,candleVWAP,executedFootprint,executedBubbles} from './order-flow-premium.mjs';

const day=Date.UTC(2026,9,1),minute=60_000;
const bar=(time,open,high,low,close,volume)=>({time,open,high,low,close,volume});
const source=[
  bar(day,100,104,100,103,80),
  bar(day+5*minute,104,104,104,104,20),
  bar(day+10*minute,100,200,100,150,null),
];
assert.equal(normalizeBarsForChart([{time:day/1000,open:1,high:2,low:1,close:2,volume:null}])[0].reportedVolume,null);
const profile=candleVolumeProfile(source,{rows:8});
assert.equal(profile.status,'partial');
assert.equal(profile.totalVolume,100);
assert(Math.abs(profile.allocatedVolume-100)<1e-9);
assert.equal(profile.rows.at(-1).high,104);
assert.equal(profile.rows.at(-1).volume,30);
assert.equal(profile.missingVolumeBars,1);
assert.equal(selectProfileWindow([...source,bar(day+24*60*minute,1,2,1,2,1)],{window:'session'}).length,1);
assert.throws(()=>candleVolumeProfile([bar(day,1,2,1,2,-1)]),/nonnegative/);
const gapProfile=candleVolumeProfile([
  bar(day,100,101,100,101,25),bar(day+minute,110,111,110,111,75),
],{rows:11});
assert.equal(gapProfile.totalVolume,100);
assert(Math.abs(gapProfile.allocatedVolume-100)<1e-9);
assert(gapProfile.rows.slice(2,9).every(row=>row.volume===0));

const vwap=candleVWAP([
  bar(day,10,10,10,10,1),
  bar(day+minute,20,20,20,20,3),
  bar(day+2*minute,25,25,25,25,null),
  bar(day+24*60*minute,30,30,30,30,2),
],{anchor:'day',source:'close',multipliers:[1]});
assert.equal(vwap.status,'partial');
assert.equal(vwap.points[1].vwap,17.5);
assert(Math.abs(vwap.points[1].sigma-Math.sqrt(18.75))<1e-10);
assert.equal(vwap.points[2].vwap,null);
assert.equal(vwap.points[3].vwap,30);
assert.equal(vwap.points[3].anchorStart,day+24*60*minute);
assert.equal(candleVWAP([bar(day,10,10,10,10,1),bar(day+minute,20,20,20,20,3)],{source:'close'}).points[0].vwap,10);

const tpo=candleTPO([
  bar(day,100,101,99,100,10),bar(day+5*minute,100,102,100,101,10),
  bar(day+30*minute,101,103,101,102,10),bar(day+35*minute,102,104,102,103,10),
],{blockMinutes:30,rows:8});
assert.equal(tpo.status,'ready');
assert.deepEqual(tpo.blocks.map(block=>block.letter),['A','B']);
assert.equal(tpo.rows.reduce((sum,row)=>sum+row.volume,0),tpo.rows.reduce((sum,row)=>sum+row.letters.length,0));
assert(tpo.poc>=tpo.val&&tpo.poc<=tpo.vah);
assert.equal(candleTPO([
  bar(day,100,101,99,100,10),bar(day+60*minute,100,102,100,101,10),
],{blockMinutes:30}).status,'unavailable');

const footprints=executedFootprint([{time:day,levels:[
  {price:100,bidVolume:4,askVolume:6},{price:100,bidVolume:1,askVolume:2},
  {price:100.25,bidVolume:9,askVolume:1},
]}],{tickSize:.25});
assert.equal(footprints[0].totalVolume,23);
assert.equal(footprints[0].delta,-5);
assert.deepEqual(footprints[0].levels[0],{price:100,bidVolume:5,askVolume:8,volume:13,delta:3});
assert.deepEqual(executedBubbles(footprints,{hideBelowFraction:.8}).map(row=>row.volume),[13]);
assert.throws(()=>executedFootprint([{time:day,levels:[{price:100,bidVolume:4}]}],{tickSize:.25}),/observed bid and ask/);

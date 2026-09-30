import assert from 'node:assert/strict';
import {renderBiasOverlay,renderStructureZonesOverlay} from './premium-overlays.js';

const drawings = [];
const add = (type, config, owner) => drawings.push({type,config,owner});

const bias = {
  status:'ready',confirmedCutoff:30,timeframe:'5M',overallBias:'BULLISH',
  points:[{close:100,bias:'BULLISH',lastSwingHigh:{side:'HIGH',price:104,confirmedTime:20},
    lastSwingLow:{side:'LOW',price:96,confirmedTime:20}}],
  swings:[{side:'HIGH',price:104,confirmedTime:20},{side:'LOW',price:96,confirmedTime:40}],
  events:[{kind:'BOS',direction:'BULLISH',price:104,time:25},{kind:'BOS',direction:'BEARISH',price:96,time:40}],
};
renderBiasOverlay(bias,{showSwingLabels:true,showBreaks:true,priorPeriod:true},add,30);
assert(drawings.some(item => item.type === 'trendline'));
assert(drawings.some(item => item.config.text?.value === 'BOS ↑'));
assert(!drawings.some(item => item.config.text?.value === 'BOS ↓'));
assert(drawings.every(item => item.config.anchors.every(anchor => anchor.time <= 30_000)));

drawings.length = 0;
const zones = {
  status:'ready',confirmedCutoff:30,
  zones:[{side:'DEMAND',state:'INVALIDATED',top:101,bottom:99,originTime:5,createdTime:15,stateTime:25}],
  pools:[{side:'HIGH',state:'OPEN',price:105,createdTime:18}],
  events:[{kind:'BREAK',direction:'BULLISH',price:102,time:20}],
};
renderStructureZonesOverlay(zones,{showBreaks:true},add,30);
const box = drawings.find(item => item.type === 'box');
assert.deepEqual(box.config.anchors.map(anchor => anchor.time),[15_000,25_000]);
assert(drawings.some(item => item.type === 'trendline'));
assert(drawings.some(item => item.config.text?.value === 'BREAK ↑'));

drawings.length = 0;
renderStructureZonesOverlay({...zones,status:'insufficient_history'},{showBreaks:true},add,30);
assert.equal(drawings.length,0);

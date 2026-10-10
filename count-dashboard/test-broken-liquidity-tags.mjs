import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,render,FRAMES,DEFAULTS} from './web/wave-court-port.mjs';

function output(raw, overrides={}) {
  const bars=[{time:0,open:100,high:102,low:98,close:101},{time:60000,open:101,high:103,low:99,close:102}];
  const read=analyze(FRAMES.map(timeframe=>({timeframe,bars:timeframe==='1m'?bars:[]})),'1m',
    {...DEFAULTS,waves:false,channels:false,structure:false,convergence:false,fibs:false,broken:true,...overrides});
  read.raw=raw;
  const drawings=[];render(read,(type,config)=>drawings.push({type,...config}));return drawings;
}
const level=(tf,taken,price=100)=>({id:String(tf),tf,time:0,price,taken,takenAt:60000,side:1,breakStatus:1});
test('broken and touched liquidity lines retain their endpoints but have no timeframe tags',()=>{
  const drawings=output([level(4,true),{...level(3,true,110),breakStatus:0}]);
  assert.equal(drawings.filter(d=>d.type==='text').length,0);
  const lines=drawings.filter(d=>d.type==='trendline');assert.equal(lines.length,2);
  assert.deepEqual(lines.map(d=>d.anchors.at(-1).time),[60000,60000]);
  assert.deepEqual(lines.map(d=>d.style.lineStyle),['dashed','dotted']);
});
test('active timeframe tags remain and grouped tags exclude broken members',()=>{
  const drawings=output([level(2,false),level(3,false),level(4,true)]);
  assert.deepEqual(drawings.filter(d=>d.type==='text').map(d=>d.text.value),['60/30']);
});
test('an active tag disappears as soon as that same level becomes taken',()=>{
  const p=level(4,false);
  assert.deepEqual(output([p]).filter(d=>d.type==='text').map(d=>d.text.value),['15']);
  p.taken=true;
  assert.equal(output([p]).filter(d=>d.type==='text').length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEvaluationDots} from '../web/swing-dot-model.mjs';
const bar=1770000000000,base={bar,high:110,low:90,observed_at:bar+1000,prediction_bar:bar+60000,cadence_seconds:15,service:'AVAILABLE',probabilities:{up:.2,down:.7,flat:.1}};
const projection={timeToX:()=>50,priceToY:p=>200-p,width:100,top:0,height:300,timeframe:'1',now:bar+60000};
test('four intrabar judgments retain color and ordinal stack on their own candle',()=>{
 const dots=['up','down','flat','up'].map((vote,i)=>({...base,id:String(i),vote,slot:i+1}));
 const frozen=structuredClone(dots),drawn=projectEvaluationDots(dots,projection);
 assert.equal(drawn.length,4);assert.deepEqual(drawn.map(d=>d.cy),[122,68,58,152]);
 assert.deepEqual(drawn.map(d=>d.cx),[50,50,50,50]);assert.deepEqual(dots,frozen);
 assert.match(drawn[2].label,/NEUTRAL/);assert.match(drawn[3].label,/4\/4/);
});
test('service absence is hollow rather than a fabricated neutral result',()=>{
 const d=projectEvaluationDots([{...base,vote:'unavailable',slot:1,service:'STALE',probabilities:null}],projection)[0];
 assert.equal(d.hollow,true);assert.match(d.label,/NO VALID EVALUATION/);assert.match(d.label,/STALE/);
});
test('future, offscreen, invalid and higher timeframe markers are withheld',()=>{
 const d={...base,vote:'down',slot:1};
 assert.deepEqual(projectEvaluationDots([d],{...projection,timeframe:'5'}),[]);
 assert.deepEqual(projectEvaluationDots([{...d,observed_at:bar+120000}],projection),[]);
 assert.deepEqual(projectEvaluationDots([{...d,slot:7}],projection),[]);
 assert.deepEqual(projectEvaluationDots([d],{...projection,timeToX:()=>-1}),[]);
});

test('inverted price scales keep long stacks visually below and short stacks above the candle',()=>{
 const dots=projectEvaluationDots([{...base,vote:'up',slot:1},{...base,vote:'down',slot:1}],{...projection,priceToY:p=>p});
 assert.equal(dots[0].cy,122);assert.equal(dots[1].cy,78);
});

test('zoomed-out candle spacing shrinks dots to prevent adjacent stacks merging',()=>{
 const d=projectEvaluationDots([{...base,vote:'up',slot:1}],{...projection,barWidth:6})[0];
 assert.ok(d.radius*2<6);assert.ok(d.radius>=1.8);
});

import assert from 'node:assert/strict';
import {manualHuntLevels,restoreManualHuntLevels} from './web/manual-hunt-lines.mjs';
const drawings=[];
let serial=0;
const slot={source:{id:'coinbase',market:'BTC-USD'},bars:[{time:60000,close:100}],chart:{drawings:{
 all:()=>drawings,
 // Vela can drop unrecognized props; restored identity must survive that.
 add:(type,{paneId,anchors,style})=>{const drawing={id:'dw-'+ ++serial,type,paneId,anchors,style};drawings.push(drawing);return drawing;}
}}};
const frozen=[{id:'manual:old-1',price:90,side:-1,label:'lower'},{id:'manual:old-2',price:110,side:1,label:'upper'}];
for(let i=0;i<500;i++){
 const lines=restoreManualHuntLevels(slot,frozen);
 assert.deepEqual(lines.map(l=>l.id),frozen.map(l=>l.id));
 assert.equal(drawings.length,2);
 assert.equal(lines[0].side,-1);
}
assert.equal(serial,2,'Repeated animation frames must not add drawings');
drawings.pop();
assert.equal(restoreManualHuntLevels(slot,frozen).length,2);
assert.equal(serial,3,'A removed retained hunt drawing is restored exactly once');
slot.chart.drawings.add('hline',{paneId:'price',anchors:[{time:60000,price:95}]});
assert.equal(manualHuntLevels(slot).at(-1).id,'manual:dw-4','New human drawings retain independent identity');
drawings.push({id:'indicator',type:'hline',paneId:'price',locked:true,anchors:[{price:105}]});
assert.equal(manualHuntLevels(slot).length,3,'Indicator lines are not manual hunt drawings');
const other={...slot,chart:{drawings:{all:()=>[{id:'dw-1',type:'hline',paneId:'price',anchors:[{price:90}]}]}}};
assert.equal(manualHuntLevels(other)[0].id,'manual:dw-1','Restored identities are isolated per chart');
console.log('Manual line identity and 500-refresh regression passed');

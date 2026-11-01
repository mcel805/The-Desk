import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordingLifecycle} from '../web/trade-recorder-model.mjs';
import {TradeTape} from '../web/footprint.mjs';
import {validateInputs} from '../web/chart-controls.mjs';
test('recorder covers working limits, fills, partial exits and full 120 second post-roll',()=>{
 const r=new RecordingLifecycle();assert.equal(r.observe({orders:[{kind:'limit',status:'working'}]},1000),'start');
 assert.equal(r.observe({positions:[{qty:2}]},2000),null);assert.equal(r.observe({positions:[{qty:1}]},3000),null);
 assert.equal(r.observe({},4000),null);assert.equal(r.observe({},123999),null);assert.equal(r.observe({},124000),'closed');
});
test('new activity during post-roll extends same clip; cancelled limits are distinct',()=>{
 const r=new RecordingLifecycle();r.observe({orders:[{kind:'limit',status:'working'}]},0);r.observe({},100);r.observe({positions:[{}]},100000);assert.equal(r.deadline,null);r.observe({},200000);assert.equal(r.observe({},320000),'closed');
 const c=new RecordingLifecycle();c.observe({orders:[{kind:'limit',status:'working'}]},0);c.observe({},1);assert.equal(c.observe({},120001),'cancelled');
});
test('footprint deduplicates real executions, rejects unsupported data and bounds history',()=>{
 const t=new TradeTape(2);t.clear('hyperliquid:BTC');const add=(id,side,qty)=>t.add({id,time:60000,price:80000,instrument:'hyperliquid:BTC',side,qty});
 add(1,'B',2);add(1,'B',2);add(2,'A',.5);let s=t.snapshot();assert.equal(s.observedTrades,2);assert.equal(s.levels[0].delta,1.5);assert.equal(s.partial,true);
 add(3,'B',1);assert.equal(t.snapshot().observedTrades,2);assert.equal(t.snapshot().levels[0].delta,.5);
 t.add({id:4,time:60000,price:80000,instrument:'coinbase:BTC-USD',side:'B',qty:2});assert.equal(t.snapshot().observedTrades,2);
});
test('indicator inputs reject invalid types, unknown inputs and out-of-range values',()=>{
 const h={inputs:[{key:'length',type:'int',min:1,max:200},{key:'labels',type:'bool'}],inputValues:()=>({length:14,labels:true})};
 assert.deepEqual(validateInputs(h,{length:21}),{length:21});for(const v of [{length:0},{length:1.5},{length:'21'},{missing:1},{labels:1}])assert.throws(()=>validateInputs(h,v));
});

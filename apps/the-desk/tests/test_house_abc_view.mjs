import test from 'node:test';import assert from 'node:assert/strict';
import {projectHouseABC,createHouseABCDisplay} from '../web/house-abc-view.mjs';
const cutoff=300000,opts={timeToX:t=>t/1000,priceToY:p=>p,width:500,top:0,height:500,cutoff};
const value={status:'AVAILABLE',cutoff,abc:{id:3,root_id:7,stage:3,points:{o:{origin:60000,known:120000,price:100},a:{origin:120000,known:180000,price:150},b:{origin:180000,known:240000,price:125},c:{origin:240000,known:240000,price:140}}},exhaustion:{root_id:8,side:-1,score:7,available:10,tier:2,contributions:[2,1,1,0,null,3,0,0]},events:[{root:7,bar:240000,known:300000,price:135,family:0,detail:'volume'},{root:8,bar:240000,known:300000,price:135,family:1,detail:'other'}]};
test('ABC points and warnings retain exact bar association and separate score roots',()=>{const v=projectHouseABC(value,opts);assert.equal(v.matched,false);assert.equal(v.scoreRoot,8);assert.equal(v.lines.length,3);assert.equal(v.lines[2].dashed,true);assert.equal(v.points.b.x,180);assert.equal(v.retracement,50);assert.equal(v.events.length,1);assert.equal(v.events[0].x,240);});
test('future points, future event receipts and wrong cutoff cannot be drawn',()=>{assert.equal(projectHouseABC(value,{...opts,cutoff:360000}),null);const v=structuredClone(value);v.abc.points.b.known=360000;v.events[0].known=360000;const p=projectHouseABC(v,opts);assert.equal(p.points.b,undefined);assert.equal(p.events.length,0);});
const context={market:'hyperliquid:BTC',run:'run-1',codeHash:'build-1',cutoff,status:'OBSERVING'};
test('confirmed geometry persists through evaluation, failure, stale data and missing snapshots with its own cutoff',()=>{
 const display=createHouseABCDisplay(),source=structuredClone(value);source.received_at=cutoff+1000;
 const first=display.resolve({...context,house:source});assert.equal(first.retained,false);
 const initial=projectHouseABC(first.house,opts);
 for(const update of [{house:{status:'UNAVAILABLE',reason:'EVALUATING'},cutoff:360000},{house:{status:'UNAVAILABLE',reason:'EVALUATION_FAILED'},cutoff:360000},{offline:true},{status:'STALE'},{status:'PAUSED'},{cutoff:undefined,house:undefined}]){
  const result=display.resolve({...context,...update});
  assert.equal(result.retained,true);assert.match(result.note,/last confirmed drawing/);
  assert.equal(result.house.cutoff,cutoff);assert.equal(result.house.received_at,cutoff+1000);
  assert.deepEqual(projectHouseABC(result.house,{...opts,cutoff:result.house.cutoff}),initial);
 }
 source.abc.points.a.price=999;assert.equal(display.resolve({...context,offline:true}).house.abc.points.a.price,150);
});
test('a fresh confirmed swing replaces retained geometry and clears the updating label',()=>{
 const display=createHouseABCDisplay();display.resolve({...context,house:value});
 display.resolve({...context,cutoff:360000,house:{status:'UNAVAILABLE'}});
 const next=structuredClone(value);next.cutoff=360000;next.abc.id=4;next.abc.points.c.price=155;
 const result=display.resolve({...context,cutoff:360000,house:next});
 assert.equal(result.retained,false);assert.equal(result.note,'');assert.equal(result.house.abc.id,4);assert.equal(result.house.abc.points.c.price,155);
 // A delayed older reply cannot replace newer evidence.
 assert.equal(display.resolve({...context,cutoff:360000,house:value}).house.abc.id,4);
});
test('retained ABC evidence never crosses runs, markets, builds or a backwards cutoff',()=>{
 for(const change of [{run:'run-2'},{market:'hyperliquid:ETH'},{codeHash:'build-2'},{cutoff:240000}]){
  const display=createHouseABCDisplay();display.resolve({...context,house:value});
  assert.equal(display.resolve({...context,...change,house:{status:'UNAVAILABLE'}}).house,null);
 }
 const display=createHouseABCDisplay();display.resolve({...context,house:value});
 const future=structuredClone(value);future.cutoff=360000;future.abc.id=4;
 assert.equal(display.resolve({...context,house:future}).house.abc.id,3);
 assert.equal(createHouseABCDisplay().resolve({...context,house:{status:'UNAVAILABLE'}}).waiting,'Waiting for first confirmed swing');
});

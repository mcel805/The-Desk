import test from 'node:test';import assert from 'node:assert/strict';
import {levelOverlays,TIMEFRAMES,snapshotUpdates} from '../web/agent-workbench-model.mjs';
test('agent overlays include published levels and owned execution only',()=>{
 const levels=levelOverlays({context:{levels:[{id:'cyan',price:'100',label:'Cyan',source:'manual-cyan'},{id:'pool',price:'90',label:'Pool',source:'liquidity'}]}},{positions:[{id:'owned',status:'open',side:'buy',qty:1,entry:'100',stop:'98',target:'104'},{id:'closed',status:'closed',entry:'110'}],orders:[{id:'working',status:'working',price:'95',side:'buy',qty:1},{id:'filled',status:'filled',price:'99'}]});
 assert.equal(levels.length,6);assert.equal(levels[0].color,'#00ffff');assert.equal(levels.find(l=>l.id==='owned:stop').price,'98');assert.equal(levels.some(l=>l.id==='closed:entry'),false);assert.equal(TIMEFRAMES['1h'],'60');
});

test('reconnecting snapshot forwards every missed candle and the mutable tail',()=>{
 const previous={bars:[{time:1},{time:2}]},next={bars:[{time:1},{time:2,close:3},{time:3},{time:4},{time:5},{time:6}]};
 assert.deepEqual(snapshotUpdates(previous,next).map(b=>b.time),[2,3,4,5,6]);assert.equal(snapshotUpdates(previous,next)[0].close,3);
});

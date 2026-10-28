import test from 'node:test';
import assert from 'node:assert/strict';
import {singleFlight} from '../web/polling.mjs';

test('slow interval requests share one response and do not queue catch-up calls',async()=>{
 let calls=0,release;
 const poll=singleFlight(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const first=poll();
 await Promise.resolve();
 for(let i=0;i<100;i++)assert.equal(poll(),first);
 assert.equal(calls,1);
 release('status');assert.equal(await first,'status');
 await Promise.resolve();assert.equal(calls,1);
 const next=poll();await Promise.resolve();assert.equal(calls,2);
 release('updated');assert.equal(await next,'updated');
});

test('a rejected or synchronously failing request releases the next poll',async()=>{
 let calls=0;
 const poll=singleFlight(()=>{if(++calls===1)throw Error('offline');return 'connected';});
 const first=poll();assert.equal(poll(),first);
 await assert.rejects(first,/offline/);
 assert.equal(await poll(),'connected');assert.equal(calls,2);
});

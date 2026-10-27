import test from 'node:test';
import assert from 'node:assert/strict';
import {DurableSettings} from '../web/durable-settings.mjs';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(extra={}){
 let server={values:{workspace:{layout:'1'}},revisions:{workspace:1}},writes=[];
 const storage=store(),states=[];
 const client=new DurableSettings({writer:'test-tab',storage,onState:s=>states.push(s),read:async()=>structuredClone(server),write:async p=>{
  writes.push(p);for(const k in p.values)assert.equal(p.expected[k],server.revisions[k]||0);
  for(const k in p.values){server.values[k]=p.values[k];server.revisions[k]=(server.revisions[k]||0)+1;}return {saved:true,...structuredClone(server)};
 },...extra});return {client,storage,states,writes,server};
}
test('overlapping saves remain ordered even when workspace preparation is asynchronous',async()=>{
 let release;const gate=new Promise(r=>release=r);let first=true;
 const f=fixture({prepare:async v=>{if(first){first=false;await gate;}return v;}});await f.client.load();
 const a=f.client.save({workspace:{layout:'4'}}),b=f.client.save({workspace:{layout:'9'}});release();await Promise.all([a,b]);
 assert.equal(f.server.values.workspace.layout,'9');assert.deepEqual(f.writes.map(w=>w.expected.workspace),[1,2]);assert.equal(f.states.at(-1).state,'saved');assert.equal(f.storage.getItem(f.client.key),undefined);
});
test('network failure retains a local draft and retries without claiming a server save',async()=>{
 let retry,fail=true;const f=fixture({schedule:fn=>(retry=fn,1),cancel:()=>{}});const write=f.client.write;
 f.client.write=async p=>{if(fail)throw Error('offline');return write(p);};await f.client.load();
 const done=f.client.save({workspace:{layout:'9'}});await settle();assert.ok(f.storage.getItem(f.client.key));assert.equal(f.states.at(-1).state,'retrying');assert.equal(f.server.values.workspace.layout,'1');
 fail=false;retry();await done;assert.equal(f.server.values.workspace.layout,'9');f.client.close();
});
test('cross-tab conflict preserves a local draft until an explicit reviewed save',async()=>{
 const f=fixture();await f.client.load();const write=f.client.write;let stale=true;
 f.client.write=async p=>{if(stale){const e=Error('other tab changed');e.status=409;throw e;}return write(p);};
 await assert.rejects(f.client.save({workspace:{layout:'9'}}),/other tab/);assert.equal(f.client.conflict,true);assert.ok(f.storage.getItem(f.client.key));
 f.server.revisions.workspace=2;stale=false;await f.client.save({workspace:{layout:'9'}},{force:true});assert.equal(f.writes[0].expected.workspace,2);assert.equal(f.client.conflict,false);
});
test('reload restores the retained draft and recognizes a lost acknowledgement',async()=>{
 const f=fixture();f.storage.setItem(f.client.key,JSON.stringify({values:{workspace:{layout:'9'}},expected:{workspace:1}}));
 assert.equal((await f.client.load()).workspace.layout,'9');f.client.resume();await settle();assert.equal(f.server.values.workspace.layout,'9');
 const g=fixture();g.storage.setItem(g.client.key,JSON.stringify({values:{workspace:{layout:'1'}},expected:{workspace:0}}));await g.client.load();assert.deepEqual(g.client.pending,{});assert.equal(g.writes.length,0);
});
test('invalid saves fail once and retain the draft without a retry loop',async()=>{
 let calls=0;const f=fixture({write:async()=>{calls++;const e=Error('invalid');e.status=400;throw e;}});await f.client.load();await assert.rejects(f.client.save({workspace:[]}),/invalid/);await settle();assert.equal(calls,1);assert.ok(f.storage.getItem(f.client.key));
});
test('pending and committed hooks expose durable workspace lifecycle before and after server acknowledgement',async()=>{
 const events=[],f=fixture({onPending:(values,expected)=>events.push(['pending',values.workspace.layout,expected.workspace]),onCommit:(values,result)=>events.push(['commit',values.workspace.layout,result.revisions.workspace])});
 await f.client.load();await f.client.save({workspace:{layout:'4'}});
 assert.deepEqual(events,[['pending','4',1],['commit','4',2]]);assert.deepEqual(f.client.serverValues.workspace,{layout:'1'});
});
test('a retained workspace from the previous build seeds a new empty settings database',async()=>{
 const f=fixture();f.server.values={};f.server.revisions={};f.storage.setItem(f.client.key,JSON.stringify({values:{workspace:{layout:'4'}},expected:{workspace:7}}));
 const loaded=await f.client.load();assert.equal(loaded.workspace.layout,'4');assert.equal(f.client.conflict,false);assert.equal(f.client.expected.workspace,0);
 f.client.resume();await settle();assert.equal(f.server.values.workspace.layout,'4');assert.equal(f.writes[0].expected.workspace,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceMirror} from '../web/workspace-mirror.mjs';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const workspace=(layout,study)=>({version:1,layout,charts:[{id:'c1',ext:{'desk.pine.v1':study?[{id:study,name:study,script:'indicator("'+study+'")'}]:[]}}]});

test('an unacknowledged chart change survives reload and is selected over the unchanged server revision',()=>{
 const local=storage(),mirror=new WorkspaceMirror({storage:local,now:()=>10});
 const old=workspace('1'),changed=workspace('4','Saved study');mirror.acknowledge(old,3);mirror.capture(changed,3);
 const restored=new WorkspaceMirror({storage:local}).reconcile({serverWorkspace:old,serverRevision:3});
 assert.equal(restored.recover,true);assert.deepEqual(restored.workspace,changed);assert.equal(restored.source,'mirror');
});

test('a browser mirror restores the complete workspace when a new build starts with an empty settings database',()=>{
 const local=storage(),mirror=new WorkspaceMirror({storage:local});
 const saved=workspace('9','Agentic - Liquidity');mirror.acknowledge(saved,12);
 const restored=mirror.reconcile({serverWorkspace:undefined,serverRevision:0});
 assert.equal(restored.recover,true);assert.deepEqual(restored.workspace,saved);
});

test('a newer server revision wins over a stale browser draft from another tab',()=>{
 const local=storage(),mirror=new WorkspaceMirror({storage:local});
 mirror.acknowledge(workspace('1'),4);mirror.capture(workspace('2','Local draft'),4);
 const newer=workspace('6','Other tab');const restored=mirror.reconcile({serverWorkspace:newer,serverRevision:5});
 assert.equal(restored.recover,false);assert.deepEqual(restored.workspace,newer);assert.equal(mirror.read().pending,false);
});

test('the current tab pending queue remains authoritative while its server write is in flight',()=>{
 const local=storage(),mirror=new WorkspaceMirror({storage:local});
 const pending=workspace('4','Taper Volume');const restored=mirror.reconcile({serverWorkspace:workspace('1'),serverRevision:2,pendingWorkspace:pending});
 assert.equal(restored.recover,false);assert.deepEqual(restored.workspace,pending);assert.equal(mirror.read().pending,true);
});

test('acknowledgement does not erase a newer captured workspace',()=>{
 const local=storage(),mirror=new WorkspaceMirror({storage:local});
 const first=workspace('2'),second=workspace('4','Newest');mirror.capture(first,1);mirror.capture(second,1);
 assert.equal(mirror.acknowledge(first,2),false);assert.deepEqual(mirror.read().workspace,second);assert.equal(mirror.read().pending,true);
});

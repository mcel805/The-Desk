import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
const source=await fs.readFile(new URL('../web/pine-examples/agentic-abc-reversal.pine',import.meta.url),'utf8');
test('installed ABC moves tables to the floating event while temporary tests retain canvas tables',async()=>{
 const events=[],workers=[],priorDispatch=globalThis.dispatchEvent,priorEvent=globalThis.CustomEvent;
 globalThis.dispatchEvent=e=>{events.push(e);return true;};globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
 const engine=new DeskPineEngine({factory:()=>{const worker={prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req,handlers){this.handlers=handlers;return {stop(){},update(){}};}};workers.push(worker);return worker;}});
 const model={series:[],lines:[{id:'line',x1:1,y1:2,x2:3,y2:4}],labels:[],boxes:[],polylines:[],linefills:[],tables:[{position:'bottom_right',cells:[[{text:'C?'}]]}]};
 try{
  for(const id of ['abc-floating','pine-test-abc']){const prepared=await engine.prepare(source,id),outputs=[];const session=engine.execute({prepared,bars:[],market:{symbol:'fixture:ABC',timeframe:'1'}},{onModel:m=>outputs.push(m)});workers.at(-1).handlers.onModel(model);
   assert.deepEqual(outputs[0].lines,model.lines);assert.equal(outputs[0].tables.length,id.startsWith('pine-test-')?1:0);assert.equal(engine.records.get(id).counts.tables,1);session.stop();
  }
  assert.deepEqual(events.map(e=>e.type),['desk:agentic-abc-model','desk:agentic-abc-model']);
  assert.equal(events[0].detail.id,'abc-floating');assert.deepEqual(events[0].detail.model.tables,model.tables);assert.equal(events[1].detail.model,null);
 }finally{engine.terminate();globalThis.dispatchEvent=priorDispatch;globalThis.CustomEvent=priorEvent;}
});

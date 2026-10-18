import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {DeskPineEngine} from '../web/pine-runtime.mjs';
import {fontPixelsBuild} from '../web/pine-compat/font-pixels-build.mjs';
test('secondary candles are shared across duplicate source requests and viewport reruns',async()=>{
 let workerRequest,calls=0;const data=[{time:1,open:1,high:2,low:1,close:2}];
 const engine=new DeskPineEngine({factory:()=>({prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req){workerRequest=req;return {stop(){},setVisibleRange(){},getContext:async()=>({})};}})});
 const prepared=await engine.prepare('//@version=6\nindicator("Host test")\nplot(close)','host');const session=engine.execute({prepared,fetchSeries:async()=>{calls++;return data;}},{onModel(){}});
 const range={to:10,limit:500};const [a,b]=await Promise.all([workerRequest.fetchSeries('fixture:MYM','60',range),workerRequest.fetchSeries('fixture:MYM','60',range)]);assert.equal(calls,1);assert.deepEqual(a,b);
 session.setVisibleRange({left:1,right:10});await workerRequest.fetchSeries('fixture:MYM','60',range);assert.equal(calls,1);session.stop();
});
test('study and data updates invalidate secondary candles without wall-clock churn',async()=>{
 let workerRequest,calls=0;const data=[{time:1,open:1,high:2,low:1,close:2}];
 const engine=new DeskPineEngine({factory:()=>({prepare:async(source,id)=>({token:{source,instanceId:id}}),terminate(){},execute(req){workerRequest=req;return {stop(){},update(){},setVisibleRange(){},notifyBars(){},getContext:async()=>({})};}})});
 const prepared=await engine.prepare('//@version=6\nindicator("Host revision test")\nplot(close)','host-revision');const session=engine.execute({prepared,fetchSeries:async()=>{calls++;return data;}},{onModel(){}});
 const range={to:10,limit:500};await workerRequest.fetchSeries('fixture:MYM','60',range);session.update({length:2});await workerRequest.fetchSeries('fixture:MYM','60',range);assert.equal(calls,2);
 session.notifyBars('tick');await workerRequest.fetchSeries('fixture:MYM','60',range);assert.equal(calls,3);session.stop();
});
test('bundled Pine adapter preserves exact numeric label size',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'elliot-font-'));try{
  const output=path.join(dir,'engine.mjs');await build({stdin:{contents:"export {PineEngine} from '@luxalgo/vela-pinets';",resolveDir:process.cwd(),loader:'js'},outfile:output,bundle:true,platform:'node',format:'esm',plugins:[fontPixelsBuild()],external:['fs','path','url']});
  const {PineEngine}=await import(pathToFileURL(output).href);const engine=new PineEngine();const prepared=await engine.prepare('//@version=6\nindicator("Numeric size",overlay=true)\nif barstate.islast\n    label.new(time,close,"(iii)",xloc=xloc.bar_time,size=17)','font');let session,model;
  await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars:[{time:1,open:1,high:2,low:1,close:2,volume:1}],market:{symbol:'fixture:MYM',timeframe:'1'},mode:'static',historyState:'complete'},{onModel:m=>model=m,onDone:resolve,onError:reject});});session.stop();assert.equal(model.labels[0].size,17);
 }finally{await rm(dir,{recursive:true,force:true});}
});

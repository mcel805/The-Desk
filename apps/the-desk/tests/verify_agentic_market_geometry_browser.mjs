// Requires chrome-devtools-axi and an isolated Desk server; never submits orders.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),[url,out]=process.argv.slice(2);
assert.ok(url&&out,'Pass isolated Desk URL and evidence folder');assert.notEqual(new URL(url).port,'18880');
await fs.mkdir(out,{recursive:true});
const command=async(...args)=>(await exec('chrome-devtools-axi',args,{timeout:180000,maxBuffer:4e6})).stdout;
async function evaluate(fn){const output=await command('eval',typeof fn==='function'?fn.toString():fn);const line=output.split('\n').find(l=>l.startsWith('result: '));if(!line)throw Error(output);let result=JSON.parse(line.slice(8));try{return JSON.parse(result);}catch{return result;}}
async function until(fn,label){for(let i=0;i<35;i++){const value=await evaluate(fn);if(value)return value;}throw Error(label+' timed out');}
const shot=name=>command('screenshot',path.join(out,name+'.png'));
async function capture(){await evaluate(async()=>{const {registerStatePersistence}=await import('/vendor/vela.js');registerStatePersistence({key:'qa.geometry.capture',scope:'cell',serialize:ctx=>{globalThis.__geometryQA=ctx;return {};},restore:()=>{}});document.querySelector('#saveWorkspace').click();return Boolean(globalThis.__geometryQA);});}
const ready=()=>{const c=globalThis.__geometryQA?.chart,h=c?.indicators().find(h=>h.source?.includes('indicator("Agentic - Market Geometry"'));if(!h)return null;const r=c.orchestrator.registry.get(h.id),m=c.rendererControl.renderer.scene.indicators.get(h.id);if(r?.error)throw Error(String(r.error));return !r?.loading&&m?.lines.length?{market:c.market,lines:m.lines.length,labels:m.labels.length,inputs:m.inputValues,drawingAutoscale:m.drawingAutoscale}:null;};
async function compareOriginal(){return evaluate(async()=>{
 const c=__geometryQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Market Geometry"')),bars=structuredClone(c.rendererControl.renderer.scene.bars),tf=c.market.timeframe;
 const source=await(await fetch('/pine-examples/agentic-market-geometry-original.pine')).text(),{PineWorkerEngine}=await import('/vendor/pine-engine.js');
 const engine=new PineWorkerEngine({workerUrl:new URL('/vendor/pine-compatible-worker.js',location.href).href});let session,model;
 try{const prepared=await engine.prepare(source,'geometry-original-browser');await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:{...c.market,symbolInfo:{ticker:'BTC-USD',tickerid:'coinbase:BTC-USD',timezone:'UTC',mintick:.01,minmov:1,pricescale:100,type:'crypto',currency:'USD'}},inputs:h.inputValues(),historyState:'complete',mode:'static'},{onModel:m=>model=m,onDone:resolve,onError:reject});});
  const {marketGeometryDrawing}=await import('/abc-live-drawing.mjs');model=marketGeometryDrawing(model,tf);
  const port=c.rendererControl.renderer.scene.indicators.get(h.id),clean=a=>JSON.stringify(a,(k,v)=>k==='id'||k==='paneId'?undefined:v);
  if(!model.lines.length||clean(model.lines)!==clean(port.lines)||clean(model.labels)!==clean(port.labels))throw Error('Original-versus-port drawing mismatch');
  return {matched:true,timeframe:tf,bars:bars.length,lines:port.lines.length,labels:port.labels.length,cutoff:bars.filter(b=>b.time+Number(tf)*60000<=Date.now()).at(-1).time};
 }finally{session?.stop();engine.terminate();}
});}
const report={url,date:new Date().toISOString(),checks:[]};
try{
 await command('open',url);await until(()=>Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas')),'app');await capture();
 await evaluate(()=>{for(const h of __geometryQA.chart.indicators().filter(h=>h.source))h.remove();return true;});
 await evaluate(async()=>{await __geometryQA.chart.setMarket({symbol:'coinbase:BTC-USD',timeframe:'60'});await __geometryQA.chart.historyComplete();return true;});
 await evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Indicators').click();return true;});
 await until(()=>Boolean(document.querySelector('#pineMarketGeometry')),'catalog');
 const catalog=await evaluate(()=>{const input=document.querySelector('#pineLibrarySearch');input.value='market geometry';input.dispatchEvent(new Event('input'));const b=document.querySelector('#pineMarketGeometry');return {name:b?.querySelector('.pine-feature-copy')?.childNodes[0].textContent,premium:b?.querySelector('.pine-premium-badge')?.textContent};});
 assert.equal(catalog.name,'Agentic - Market Geometry');assert.equal(catalog.premium,'Premium');report.checks.push({kind:'Premium catalog',...catalog});await shot('premium-catalog');
 await evaluate(()=>{document.querySelector('#pineMarketGeometry').click();return true;});await until(()=>Boolean(document.querySelector('#pineTest')),'editor');
 await evaluate(()=>{document.querySelector('#pineTest').click();return true;});
 const compilation=await until(()=>{const feedback=document.querySelector('#pineFeedback').innerText;if(feedback.includes('failed'))throw Error(feedback);return document.querySelector('#pineAdd')?.disabled?null:document.querySelector('#pineReport').innerText;},'compile');assert.ok(compilation.includes('12 original inputs'));report.checks.push({kind:'UI compile',report:compilation});
 await evaluate(()=>{document.querySelector('#pineAdd').click();document.querySelector('#pineClose').click();return true;});
 const hour=await until(ready,'1h');assert.equal(hour.drawingAutoscale,false);report.checks.push({kind:'1h',...hour,comparison:await compareOriginal()});await shot('Desk-BTC-1h');
 await evaluate(()=>{const c=__geometryQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Market Geometry"'));h.setInputs({geometryPivot:3,geometryShown:5,geometryShowLabels:true});return true;});
 const changed=await until(()=>{const c=__geometryQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Market Geometry"')),r=c.orchestrator.registry.get(h.id),m=c.rendererControl.renderer.scene.indicators.get(h.id);return !r.loading&&m?.inputValues.geometryPivot===3&&m.labels.length?m.inputValues:null;},'settings');
 assert.equal(changed.geometryShown,5);assert.equal(changed.geometryShowLabels,true);report.checks.push({kind:'settings',inputs:changed});
 await evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Indicators').click();return true;});await until(()=>Boolean(document.querySelector('#pineOnChart [data-visibility]')),'on chart');
 const hidden=await evaluate(()=>{const row=[...document.querySelectorAll('#pineOnChart .pine-live')].find(row=>row.textContent.includes('Agentic - Market Geometry'));row.querySelector('[data-visibility]').click();return row.textContent;});assert.ok(hidden.includes('Settings'));
 assert.equal(await evaluate(()=>__geometryQA.chart.indicators().find(h=>h.source?.includes('indicator("Agentic - Market Geometry"')).visible),false);
 await evaluate(()=>{const row=[...document.querySelectorAll('#pineOnChart .pine-live')].find(row=>row.textContent.includes('Agentic - Market Geometry'));row.querySelector('[data-visibility]').click();document.querySelector('#pineClose').click();document.querySelector('#saveWorkspace').click();return true;});await until(ready,'show');report.checks.push({kind:'hide and show',passed:true});
 await command('open',url);await until(()=>Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas')),'reload');await capture();const restored=await until(ready,'saved reload');assert.deepEqual(restored.inputs,changed);report.checks.push({kind:'saved reload',...restored});await shot('saved-reload');
 await evaluate(async()=>{await __geometryQA.chart.setMarket({timeframe:'1'});await __geometryQA.chart.historyComplete();return true;});const minute=await until(ready,'1m');assert.equal(minute.market.timeframe,'1');report.checks.push({kind:'1m',...minute,comparison:await compareOriginal()});await shot('Desk-BTC-1m');
 await evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Indicators').click();return true;});await until(()=>Boolean(document.querySelector('#pineOnChart [data-remove]')),'remove action');
 await evaluate(()=>{const row=[...document.querySelectorAll('#pineOnChart .pine-live')].find(row=>row.textContent.includes('Agentic - Market Geometry'));row.querySelector('[data-remove]').click();document.querySelector('#pineClose').click();return true;});assert.equal(await evaluate(()=>__geometryQA.chart.indicators().some(h=>h.source?.includes('indicator("Agentic - Market Geometry"'))),false);report.checks.push({kind:'remove',passed:true});
 report.passed=true;await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await shot('failure');await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({...report,error:error.stack},null,2));throw error;}

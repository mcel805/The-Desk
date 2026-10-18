// Run against an isolated Desk data directory and a dedicated Chrome debugging port.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const [appUrl,debugUrl,output='/private/tmp/agentic-liquidity-browser-report.json']=process.argv.slice(2);
assert.ok(appUrl&&debugUrl,'Pass isolated Desk URL and dedicated Chrome debug URL.');
assert.notEqual(new URL(appUrl).port,'18880','Use an isolated QA server, not the installed workspace.');
const targets=await (await fetch(debugUrl+'/json/list')).json();
const target=targets.find(t=>t.type==='page');assert.ok(target,'Start a dedicated Chrome with --remote-debugging-port first.');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id)return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function until(expression,label,timeout=125000){const start=Date.now();while(Date.now()-start<timeout){const value=await evaluate(expression);if(value)return value;await pause(500);}throw Error(label+' timed out');}
async function shot(suffix){const result=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(output.replace('.json','-'+suffix+'.png'),Buffer.from(result.data,'base64'));}
async function capture(){await evaluate(`(async()=>{const {registerStatePersistence}=await import('/vendor/vela.js');registerStatePersistence({key:'qa.liquidity.capture',scope:'cell',serialize:ctx=>{globalThis.__liquidityQA=ctx;return {};},restore:()=>{}});document.querySelector('#saveWorkspace').click();})()`);await until('Boolean(globalThis.__liquidityQA)','chart context');}
const modelExpr=`(()=>{const c=__liquidityQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Liquidity"'));const r=h&&c.orchestrator.registry.get(h.id),m=h&&c.rendererControl.renderer.scene.indicators.get(h.id);if(r?.error)throw Error(String(r.error));return m?.lines?.length&&r.loading===false?{market:c.market,lines:m.lines.length,boxes:m.boxes.length,linefills:m.linefills.length,mainLevels:m.lines.filter(l=>l.x2-l.x1>4*3600000).length,labels:m.labels.length,drawingAutoscale:m.drawingAutoscale,inputs:m.inputValues}:null;})()`;
const report={url:appUrl,date:new Date().toISOString(),checks:[]};
try{
 await send('Emulation.setDeviceMetricsOverride',{width:1800,height:1050,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:appUrl});
 await until("Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas'))",'app');await capture();
 await evaluate(`(async()=>{await __liquidityQA.chart.setMarket({symbol:'hyperliquid:BTC',timeframe:'60'});await __liquidityQA.chart.historyComplete();})()`);
 await evaluate(`(async()=>{const source=await(await fetch('/pine-examples/agentic-liquidity.pine')).text();__liquidityQA.addIndicator({id:'desk-pine-liquidity-live-regression',name:'Agentic - Liquidity',script:source,language:'pine'});})()`);
 const one=await until(modelExpr,'1h chart');assert.equal(Object.keys(one.inputs).length,87);assert.equal(one.drawingAutoscale,false);assert.equal(one.linefills,0);assert.ok(one.lines>0);report.checks.push({kind:'1h',...one});const phase=await evaluate(`(async()=>{const h=__liquidityQA.chart.indicators().find(h=>h.source?.includes('indicator(\"Agentic - Liquidity\"'));return (await h.context(['barIndex'])).phase;})()`);assert.equal(phase,'streaming');await shot('1h');console.log('1h rendered',one.lines,one.linefills);
 const samples=[];
 for(let tick=0;tick<50;tick++){
  await evaluate(`(()=>{const c=__liquidityQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Liquidity"'));c.orchestrator.registry.get(h.id).session.notifyBars('tick');})()`);
  await pause(1500);
  const sample=await evaluate(`(()=>{const c=__liquidityQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Liquidity"')),m=c.rendererControl.renderer.scene.indicators.get(h.id);globalThis.__liveModelCount??=0;if(globalThis.__lastLiveModel!==c.orchestrator.registry.get(h.id).model){__liveModelCount++;__lastLiveModel=c.orchestrator.registry.get(h.id).model;}return {main:m.lines.filter(l=>l.x2-l.x1>4*3600000).length,bands:m.boxes.length,models:__liveModelCount};})()`);
  assert.ok(sample.main>=Math.min(40,Math.floor(one.mainLevels*.8)),`main levels disappeared at live sample ${tick}`);assert.ok(sample.bands>=Math.floor(one.boxes*.8),`main bands disappeared at sample ${tick}`);samples.push(sample);
 }
 assert.ok(samples.at(-1).models>=3,'observe at least three distinct live models');report.checks.push({kind:'75-second live stability',samples});await shot('live-stable');console.log('Main levels survived 75 seconds of live updates',samples.at(-1));
 await evaluate(`(()=>{const c=__liquidityQA.chart,h=c.indicators().find(h=>h.source?.includes('indicator("Agentic - Liquidity"'));h.setInputs({smallLen:6,showTags:true,bandMode:'Ticks',bandTicks:40});})()`);const modified=await until(`(()=>{const m=${modelExpr};return m?.inputs.smallLen===6&&m?.inputs.bandTicks===40?m:null;})()`,'settings update');assert.equal(modified.inputs.showTags,true);report.checks.push({kind:'settings',...modified});
 await evaluate("document.querySelector('#saveWorkspace').click()");await pause(1000);await send('Page.reload');await until("Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas'))",'reload');await capture();const restored=await until(modelExpr,'saved reload');assert.deepEqual(restored.inputs,modified.inputs);report.checks.push({kind:'saved reload',...restored});console.log('Reload restored all 87 settings');
 await evaluate("__liquidityQA.chart.setMarket({timeframe:'1'})");const minute=await until(`(()=>{const m=${modelExpr};return m?.market.timeframe==='1'?m:null;})()`,'1m chart');assert.equal(minute.linefills,0);assert.ok(minute.lines>0);report.checks.push({kind:'1m',...minute});await shot('1m');
 await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:report.checks.map(c=>c.kind),output}));
} catch(error){await shot('failure');await fs.writeFile(output,JSON.stringify({...report,error:error.stack,body:await evaluate('document.body.innerText')},null,2));throw error;}finally{ws.close();}

// Run against an isolated Desk data directory and a dedicated Chrome debugging port.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const [appUrl='http://127.0.0.1:18882/',debugUrl='http://127.0.0.1:9226',output='/private/tmp/cleo-browser-report.json']=process.argv.slice(2);
const targets=await (await fetch(debugUrl+'/json/list')).json();
const target=targets.find(t=>t.type==='page');assert.ok(target,'Start a dedicated Chrome with --remote-debugging-port first.');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id)return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capture(){
 await evaluate(`(async()=>{const {registerStatePersistence}=await import('/vendor/vela.js');registerStatePersistence({key:'qa.cleo.capture',scope:'cell',serialize:ctx=>{globalThis.__cleoQA=ctx;return {};},restore:()=>{}});document.querySelector('#saveWorkspace').click();})()`);
 for(let n=0;n<60;n++){if(await evaluate('Boolean(globalThis.__cleoQA)'))return;await pause(250);}
 throw Error('The Desk chart did not initialize.');
}
async function waitForModel(){
 const started=Date.now();while(Date.now()-started<125000){
  const state=await evaluate(`(()=>{const c=__cleoQA.chart,h=c.indicators().find(h=>h.source?.includes("Cleo's Liquidity"));const rec=h&&c.orchestrator.registry.get(h.id),r=c.rendererControl.renderer,m=h&&r.scene.indicators.get(h.id);return {loaded:Boolean(m?.lines?.length&&rec?.loading===false),error:String(rec?.error||'')};})()`);
  if(state.error)throw Error(state.error);if(state.loaded)return Date.now()-started;await pause(250);
 }
 throw Error('Cleo did not draw within 125 seconds.');
}
async function metrics(){return evaluate(`(()=>{const c=__cleoQA.chart,r=c.rendererControl.renderer,vr=r.coords.visibleLogicalRange(),p=r.scene.orderedPanes().find(p=>p.kind==='price');const b=r.bars.slice(Math.max(0,Math.floor(vr.from)),Math.min(r.bars.length,Math.ceil(vr.to)+1));const m=[...r.scene.indicators.values()].find(m=>m.title==="Cleo's Liquidity");return {market:c.market,visibleBars:b.length,first:b[0]?.time,last:b.at(-1)?.time,candleMin:Math.min(...b.map(b=>b.low)),candleMax:Math.max(...b.map(b=>b.high)),scale:p.scale,lines:m?.lines?.length,labels:m?.labels?.length,drawingAutoscale:m?.drawingAutoscale,inputs:m?.inputValues,frameTags:m?.labels?.filter(l=>l.x>b.at(-1).time&&/^(1440|240|60|30|15|5|1)(\\/(1440|240|60|30|15|5|1))*$/.test(String(l.text))).map(l=>l.text)};})()`);}
function verify(m){assert.ok(m.lines>0);assert.ok(m.labels>0);assert.equal(m.drawingAutoscale,false);assert.ok(m.scale.min<=m.candleMin&&m.scale.max>=m.candleMax);assert.ok((m.scale.max-m.scale.min)/(m.candleMax-m.candleMin)<1.6,'distant drawings must not flatten candles');assert.equal(Object.keys(m.inputs).length,199);assert.equal(m.inputs.rawDisplayMode,'All retained');}
try{
 await send('Emulation.setDeviceMetricsOverride',{width:1800,height:1050,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:appUrl});
 for(let n=0;n<80;n++){if(await evaluate("Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas'))"))break;await pause(250);}
 await capture();
 await evaluate(`(async()=>{const c=__cleoQA.chart;for(const h of c.indicators().filter(h=>h.source))h.remove();await c.setMarket({symbol:'hyperliquid:BTC',timeframe:'1'});await c.historyComplete();const source=await(await fetch('/pine-examples/cleos-liquidity.pine')).text();__cleoQA.addIndicator({id:'desk-pine-browser-cleo',name:"Cleo's Liquidity",script:source,language:'pine',inputs:{rawDisplayMode:'All retained'}});})()`);
 const report={url:appUrl,asOf:new Date().toISOString(),checks:[]};
 const oneMs=await waitForModel();const one=await metrics();verify(one);report.checks.push({kind:'1m',milliseconds:oneMs,...one});
 const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(output.replace(/\.json$/, '-1m.png'),Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('#saveWorkspace').click()");await pause(700);
 await send('Page.reload',{});await pause(700);await capture();await waitForModel();const restored=await metrics();verify(restored);assert.deepEqual(restored.inputs,one.inputs);report.checks.push({kind:'saved-reload',...restored});
 await evaluate("__cleoQA.chart.setMarket({timeframe:'240'})");const fourMs=await waitForModel();const four=await metrics();verify(four);assert.equal(four.market.timeframe,'240');assert.ok(four.frameTags.length>0);assert.ok(four.frameTags.every(t=>t.split('/').every(tf=>Number(tf)>=240)));report.checks.push({kind:'4h',milliseconds:fourMs,...four});
 const fourShot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(output.replace(/\.json$/, '-4h.png'),Buffer.from(fourShot.data,'base64'));
 await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:report.checks.map(({kind,milliseconds,lines,scale})=>({kind,milliseconds,lines,scale})),output}));
}finally{ws.close();}

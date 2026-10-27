// Real Codex + public chart acceptance. Requires the isolated Desk already open.
// Run only on an isolated port. This script never touches an order interface.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),[url,out]=process.argv.slice(2);
assert.ok(url&&out);assert.notEqual(new URL(url).port,'18880');await fs.mkdir(out,{recursive:true});
const cmd=async(...args)=>(await exec('chrome-devtools-axi',args,{timeout:45000,maxBuffer:4e6})).stdout;
async function evaluate(fn){const text=await cmd('eval',typeof fn==='function'?fn.toString():fn);const line=text.split('\n').find(l=>l.startsWith('result: '));if(!line)throw Error(text);let value=JSON.parse(line.slice(8));try{return JSON.parse(value);}catch{return value;}}
async function until(fn,label,seconds=400){const end=Date.now()+seconds*1000;while(Date.now()<end){const result=await evaluate(fn);if(result)return result;await new Promise(r=>setTimeout(r,1800));}throw Error(label+' timed out');}
async function capture(){return evaluate(async()=>{const {registerStatePersistence}=await import('/vendor/vela.js');registerStatePersistence({key:'qa.chart-chat.capture',scope:'cell',serialize:ctx=>{globalThis.__chatQA=ctx;return {};},restore:()=>{}});document.querySelector('#saveWorkspace').click();return Boolean(globalThis.__chatQA);});}
async function latest(){return evaluate(async()=>{const id=localStorage.getItem('desk.chart-chat.last'),d=await(await fetch('/api/chart-chat/history?chatId='+id)).json();const r=d.runs.at(-1);return {id:r.id,status:r.status,error:r.error,application:r.application,sources:r.sources,events:r.events,reviews:r.reviews.map(x=>({agent:x.agent})),snapshot:{timeframe:r.snapshot.timeframe,sha256:r.snapshot.sha256,completedCutoff:r.snapshot.completedCutoff},result:{action:r.result?.action,drawings:Array(r.result?.drawings?.length||0).fill(null),evidence:r.result?.evidence?.map(e=>({side:e.side}))}};});}
const shot=name=>cmd('screenshot',path.join(out,name+'.png'));
const report={url,createdAt:new Date().toISOString(),checks:[]};
try{
 assert.equal(await evaluate(()=>location.origin),new URL(url).origin);await capture();
 // The caller starts the 30m web run through the real composer before this script.
 await until(()=>!document.querySelector('#ccSend').disabled,'30m agent run');
 const liquidity=await latest();assert.equal(liquidity.status,'complete',liquidity.error||liquidity.application);assert.equal(liquidity.snapshot.timeframe,'30m');
 assert.equal(liquidity.result.action,'liquidity');assert.deepEqual(liquidity.reviews.map(x=>x.agent),['RIDER','Spider']);
 assert.ok(liquidity.events.some(e=>e.message.startsWith('Web · ')),'Real web research must be observed');
 assert.ok(liquidity.result.evidence.some(e=>e.side==='high'));assert.ok(liquidity.result.evidence.some(e=>e.side==='low'));
 const poolCount=await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.visible&&d.text?.value?.startsWith('Desk AI · liquidity ·')).length);
 assert.equal(poolCount,liquidity.result.drawings.length);report.checks.push({scenario:'30-minute liquidity + RIDER + Spider + web',runId:liquidity.id,drawings:poolCount,sources:liquidity.sources,searches:liquidity.events.filter(e=>e.message.startsWith('Web · ')),sha256:liquidity.snapshot.sha256,completedCutoff:liquidity.snapshot.completedCutoff});
 await shot('liquidity-30m-final');console.log('PASS: 30m liquidity, both specialists, actual web research, native drawings');
 await evaluate(()=>{document.querySelector('#ccWeb').checked=false;document.querySelector('#ccInput').value='On the one-minute chart, draw me a volume profile for every completed swing.';document.querySelector('#ccForm').requestSubmit();return true;});
 await until(()=>!document.querySelector('#ccSend').disabled,'1m volume profiles');const volume=await latest();assert.equal(volume.status,'complete',volume.error||volume.application);assert.equal(volume.snapshot.timeframe,'1m');assert.equal(volume.result.action,'volume_profile');assert.ok(volume.result.drawings.length>1);
 const native=await evaluate(()=>({profiles:__chatQA.chart.drawings.all().filter(d=>d.visible&&d.type==='fixedrangevp').length,visibleLiquidity:__chatQA.chart.drawings.all().filter(d=>d.visible&&d.text?.value?.startsWith('Desk AI · liquidity ·')).length}));
 assert.equal(native.profiles,volume.result.drawings.length);assert.equal(native.visibleLiquidity,0);report.checks.push({scenario:'1-minute profiles on confirmed swings',runId:volume.id,...native,sha256:volume.snapshot.sha256,completedCutoff:volume.snapshot.completedCutoff});await shot('volume-1m-final');console.log('PASS: 1m native swing profiles; 30m drawings hidden');
 await evaluate(()=>{document.querySelector('#ccHide').click();return true;});assert.equal(await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.visible&&d.text?.value?.startsWith('Desk AI · ')).length),0);
 await evaluate(()=>{document.querySelector('#ccHide').click();return true;});assert.equal(await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.visible&&d.type==='fixedrangevp').length),native.profiles);
 const manual=await evaluate(()=>{const c=__chatQA.chart,b=c.renderer.renderer.scene.bars.at(-5);return c.drawings.add('hline',{anchors:[{time:b.time,price:b.close}],text:{value:'QA manual drawing',size:'small',hAlign:'right',vAlign:'top'}}).id;});
 await evaluate(()=>{document.querySelector('#ccClear').click();return true;});assert.equal(await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.text?.value?.startsWith('Desk AI · ')).length),0);
 assert.ok(await evaluate(`() => __chatQA.chart.drawings.all().some(d=>d.id===${JSON.stringify(manual)})`));
 await evaluate(()=>{document.querySelector('#ccUndo').click();return true;});assert.equal(await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.visible&&d.type==='fixedrangevp').length),native.profiles);report.checks.push({scenario:'hide/show + clear/undo preserves manual drawings',passed:true});
 await evaluate(()=>{document.querySelector('#ccClose').click();return true;});assert.equal(await evaluate(()=>document.querySelector('#chartChat').hidden),true);await evaluate(()=>{document.querySelector('#chartChatButton').click();return true;});assert.equal(await evaluate(()=>document.querySelector('#chartChat').hidden),false);
 await evaluate(()=>{document.querySelector('#ccInput').value='Explain the chart structure';document.querySelector('#ccForm').requestSubmit();return true;});await until(()=>!document.querySelector('#ccStop').hidden,'stop available',20);await evaluate(()=>{document.querySelector('#ccStop').click();return true;});await until(()=>!document.querySelector('#ccSend').disabled,'stop finished',20);const cancelled=await latest();assert.equal(cancelled.status,'cancelled');report.checks.push({scenario:'stop cancels real pending agent run',runId:cancelled.id,passed:true});
 await evaluate(()=>{document.querySelector('#saveWorkspace').click();return true;});await until(()=>document.querySelector('#saveStatus').textContent.includes('saved')||document.querySelector('#saveStatus').textContent.includes('Saved'),'workspace save',30);
 await cmd('open',url);await until(()=>Boolean(document.querySelector('#ccInput')&&document.querySelectorAll('canvas').length),'reload',40);await capture();
 await until(()=>__chatQA.chart.renderer.renderer.scene.bars.length>8,'restored chart',40);
 assert.equal(await evaluate(()=>__chatQA.chart.drawings.all().filter(d=>d.visible&&d.type==='fixedrangevp').length),native.profiles);
 assert.ok((await evaluate(()=>document.querySelector('#ccMessages').innerText)).includes('volume profile'));
 report.checks.push({scenario:'native drawings and conversation survive reload',passed:true});await shot('restored-final');console.log('PASS: persistence, collapse, cancellation and canvas controls');
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;console.error(error);process.exitCode=1;}
await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));

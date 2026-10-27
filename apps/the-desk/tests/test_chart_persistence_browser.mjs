import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rename,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(!process.env.DESK_LAYOUT_BROWSER){
 console.log('SKIP chart persistence browser acceptance (set DESK_LAYOUT_BROWSER=1)');
}else{
const playwright=process.env.DESK_PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(playwright);
const root=fileURLToPath(new URL('..',import.meta.url));
const port=Number(process.env.DESK_LAYOUT_BROWSER_PORT||18896);
const url=`http://127.0.0.1:${port}/`;
const temp=await mkdtemp(path.join(os.tmpdir(),'desk-layout-browser-'));
const data=path.join(temp,'data'),old=path.join(temp,'previous-build-data');
let server;

async function start(){
 let errors='';server=spawn('python3',['-B','server.py','--port',String(port),'--data-dir',data,'--no-workers'],{cwd:root,stdio:['ignore','ignore','pipe']});
 server.stderr.on('data',chunk=>errors+=chunk);
 for(let attempt=0;attempt<80;attempt++){
  if(server.exitCode!==null)throw Error('Desk fixture exited: '+errors);
  try{const response=await fetch(url+'api/health');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('Desk fixture did not become ready: '+errors);
}
async function stop(){
 if(!server||server.exitCode!==null)return;
 server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
 if(server.exitCode===null)server.kill('SIGKILL');
}
async function savedState(){
 const response=await fetch(url+'api/settings/state');assert.equal(response.ok,true);return response.json();
}
async function browserState(page){
 return page.evaluate(()=>{
  const saved=JSON.parse(localStorage.getItem('the-desk.workspace.mirror.v1')||'null'),workspace=saved?.workspace;
  return {layout:workspace?.layout,charts:workspace?.charts?.length,
   pine:workspace?.charts?.flatMap(chart=>(chart.ext?.['desk.pine.v1']||[]).map(study=>study.name))||[],pending:saved?.pending};
 });
}

const browser=await chromium.launch({headless:true,...(process.env.DESK_CHROME_BIN?{executablePath:process.env.DESK_CHROME_BIN}:{})});
const context=await browser.newContext({viewport:{width:1600,height:1000}});const page=await context.newPage();
try{
 await start();await page.goto(url);await page.locator('#saveStatus').filter({hasText:'All changes saved'}).waitFor({timeout:20000});
 await page.getByRole('button',{name:/^Layout/}).click();await page.getByRole('button',{name:'2 × 2'}).click();
 await page.getByRole('button',{name:'Indicators',exact:true}).first().click();await page.locator('[data-premium-add="pineTaper"]').click();
 await page.locator('#pineFeedback').filter({hasText:"Added Taper's Volume"}).waitFor({timeout:20000});await page.locator('#pineClose').click();
 await page.waitForFunction(()=>{const saved=JSON.parse(localStorage.getItem('the-desk.workspace.mirror.v1')||'null'),charts=saved?.workspace?.charts;
  return charts?.length===4&&charts.some(chart=>(chart.ext?.['desk.pine.v1']||[]).some(study=>study.script?.includes("indicator(\"Taper's Volume\"")))&&saved.pending===false;},{timeout:30000});
 const changed=await browserState(page);assert.notEqual(changed.layout,'1');assert.equal(changed.charts,4);assert.deepEqual(changed.pine,["Taper's Volume"]);assert.equal(changed.pending,false);
 const firstServer=await savedState();assert.equal(firstServer.values.workspace.layout,changed.layout);assert.equal(firstServer.values.workspace.charts.length,4);

 await page.reload();await page.locator('#saveStatus').filter({hasText:/All changes saved|Workspace restored/}).waitFor({timeout:20000});
 assert.deepEqual(await browserState(page),changed);

 await stop();await rename(data,old);await start();await page.reload();
 await page.waitForFunction(async expected=>{const state=await (await fetch('/api/settings/state')).json();return state.values?.workspace?.layout===expected;},changed.layout,{timeout:30000});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-desk.workspace.mirror.v1')||'null')?.pending===false,null,{timeout:30000});
 const rebuilt=await browserState(page);assert.deepEqual(rebuilt,changed);
 const recovered=await savedState();assert.equal(recovered.values.workspace.layout,changed.layout);assert.equal(recovered.values.workspace.charts.length,4);
 assert.deepEqual(recovered.values.workspace.charts.flatMap(chart=>(chart.ext?.['desk.pine.v1']||[]).map(study=>study.name)),["Taper's Volume"]);
 console.log(JSON.stringify({passed:true,changed,recoveredRevision:recovered.revisions.workspace,url}));
}finally{await browser.close();await stop();await rm(temp,{recursive:true,force:true});}
}

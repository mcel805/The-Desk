import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
test('enhanced manager, real video encoding/archive, assistant chart controls and responsive workspace',{skip:!process.env.DESK_CHART_QA,timeout:180000},async t=>{
 const server=spawn('python3',[fileURLToPath(new URL('./launch_chart_trader_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());
 const url=await new Promise(resolve=>server.stdout.once('data',d=>resolve(d.toString().trim())));
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.DESK_CHROME_BIN});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{try{await page.screenshot({path:'/tmp/desk-new-browser-last.png'});console.log(await page.locator('#ccWork').textContent());}catch{}});
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.addInitScript(()=>{window.qaLongTasks=[];new PerformanceObserver(list=>window.qaLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
 await page.goto(url);await page.locator('.trade-overlay').waitFor();await page.waitForFunction(()=>!document.querySelector('#submitOrder').disabled);
 await page.locator('#quantity').fill('.002');await page.locator('#saveTicketPreset').click();await page.locator('[name=name]').fill('Two units');await page.locator('#dialogForm [type=submit]').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.locator('#quantity').fill('.001');await page.locator('#ticketPreset').selectOption('0');assert.equal(await page.locator('#quantity').inputValue(),'.002');
 await page.locator('#tradeRecorder').click();await page.locator('#orderKind').selectOption('limit');await page.locator('#entryPrice').fill('79500');await page.locator('#submitOrder').click();await page.waitForFunction(()=>document.querySelector('#tradeRecorder').textContent==='● Recording');await page.waitForTimeout(2500);
 await page.locator('[data-cancel]').first().focus();const focused=await page.locator('[data-cancel]').first().getAttribute('data-cancel');await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>document.activeElement.dataset.cancel),focused,'poll retains keyboard focus');
 await page.locator('#managerSearch').fill('ETH');assert.equal(await page.locator('[data-cancel]').count(),0);await page.locator('#managerSearch').fill('');await page.locator('#managerCancel').click();await page.waitForFunction(()=>!document.querySelector('[data-cancel]'));
 await page.locator('#tradeRecorder').click();await page.waitForFunction(()=>document.querySelector('#tradeRecorder').textContent==='○ Record trades');
 const archive=await(await page.request.get(url+'/api/trade-videos')).json();assert.equal(archive.recordings.length,1);assert.ok(archive.recordings[0].bytes>1000);assert.equal(archive.recordings[0].status,'interrupted');
 const media=await page.request.get(url+'/api/trade-videos/media?id='+archive.recordings[0].id,{headers:{Range:'bytes=0-3'}});assert.equal(media.status(),206);assert.equal((await media.body()).toString('hex'),'1a45dfa3');
 const videoCheck=await page.evaluate(async id=>{const v=document.createElement('video');v.src='/api/trade-videos/media?id='+id;v.muted=true;document.body.append(v);try{await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(Error('Video decode failed'));});return {width:v.videoWidth,height:v.videoHeight};}finally{v.remove();}},archive.recordings[0].id);assert.ok(videoCheck.width>=640);
 // Actual Vela application, synthetic planner response (no external model or account).
 let commands=[],receipt;
 await page.route('**/api/chart-controls/plan',r=>r.fulfill({json:{id:'fixture-plan',commands,answer:'Fixture chart plan'}}));await page.route('**/api/chart-controls/verify',r=>{receipt=r.request().postDataJSON();return r.fulfill({json:{id:'fixture-plan',answer:'Fixture visual receipt accepted'}});});
 await page.locator('#ccControlMode').check();const cmd=(op,value='',source='',indicatorId='',cell=0)=>({op,value,source,indicatorId,cell});
 async function ask(text){receipt=null;await page.locator('#ccInput').fill(text);await page.evaluate(()=>document.querySelector('#ccWork').textContent='');await page.locator('#ccSend').click();await page.waitForFunction(()=>document.querySelector('#ccWork').textContent.includes('Fixture visual receipt accepted'));await page.waitForTimeout(200);assert.ok(receipt,'actual renderer receipt');}
 commands=[cmd('layout','2h'),cmd('market',JSON.stringify({timeframe:'60'})),cmd('market',JSON.stringify({timeframe:'240'}),'','',1)];await ask('Open 1h and 4h');assert.equal(await page.locator('.trade-overlay').count(),2);assert.equal(receipt.facts.receipts.length,3);
 commands=[cmd('layout','1'),cmd('style','line')];await ask('Use a single line chart');
 commands=[cmd('style','candles'),cmd('pine','',await fs.readFile(new URL('../web/pine-examples/agentic-key-levels.pine',import.meta.url),'utf8'))];await ask('Build key levels');console.log(JSON.stringify(receipt.facts.receipts.at(-1)));assert.ok(receipt.facts.receipts.at(-1).indicators.some(h=>h.id.startsWith('assistant-')));
 await page.locator('#focusChart').click();assert.equal(await page.locator('#chartChat').isVisible(),false);await page.locator('#focusChart').click();assert.equal(await page.locator('#chartChat').isVisible(),true);
 await page.screenshot({path:'/tmp/desk-trade-experience-desktop.png'});
 await page.setViewportSize({width:768,height:900});await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/desk-trade-experience-tablet.png'});
 assert.deepEqual(errors,[]);const performance=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(n=>({domContentLoaded:n.domContentLoadedEventEnd,load:n.loadEventEnd})),longTasks:window.qaLongTasks}));
 await fs.writeFile('/tmp/desk-trade-experience-report.json',JSON.stringify({synthetic:true,realEngine:true,realVideoEncoder:true,videoCheck,performance,errors,checks:['ticket presets','manager focus persistence','working order filter','cancel batch','record/archive/decode','byte ranges','two chart timeframe controls','style change','key-level Pine compile/render','focus restore','tablet overflow']},null,2));
});

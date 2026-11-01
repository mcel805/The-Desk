import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('normal chat places real paper limit with chart protection; missing size asks without execution',{skip:!process.env.DESK_CHART_QA,timeout:90000},async t=>{
 const server=spawn('python3',[fileURLToPath(new URL('./launch_chart_trader_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());const url=await new Promise(resolve=>server.stdout.once('data',d=>resolve(d.toString().trim())));
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.DESK_CHROME_BIN});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('desk.recorder.auto','false'));await page.goto(url);await page.locator('.trade-overlay').waitFor();await page.waitForFunction(()=>!document.querySelector('#submitOrder').disabled);
 await page.locator('#ccInput').fill('Place a paper sell limit for .002 BTC at 80500, stop 81000 and target 79000.');await page.locator('#ccSend').click();await page.locator('.cc-assistant .cc-answer').filter({hasText:'Accepted by the trading engine'}).waitFor();
 const state=await(await page.request.get(url+'/api/state')).json();const o=state.orders.find(o=>o.status==='working');assert.ok(o);assert.equal(o.side,'sell');assert.equal(o.qty,'0.002');assert.equal(o.price,'80500');assert.equal(o.stop,'81000');assert.equal(o.target,'79000');
 for(const field of ['price','stop','target'])await page.locator(`.trade-line[data-item-id="${o.id}"][data-field="${field}"]`).waitFor({state:'visible'});
 const run=await page.locator('.cc-assistant').last().getAttribute('data-run');for(let i=0;i<2;i++){const r=await page.request.post(url+'/api/chart-chat/execute',{data:{id:run,account_id:state.active_account,instrument:'hyperliquid:BTC'}});assert.ok(r.ok());}
 assert.equal((await(await page.request.get(url+'/api/state')).json()).orders.length,1);
 await page.locator('#ccInput').fill('Place a limit with missing size');await page.locator('#ccSend').click();await page.locator('.cc-answer').filter({hasText:'What quantity should I use?'}).waitFor();assert.equal((await(await page.request.get(url+'/api/state')).json()).orders.length,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/desk-chat-trading-accepted.png'});
});

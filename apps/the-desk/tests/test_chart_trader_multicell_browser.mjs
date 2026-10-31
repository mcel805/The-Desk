import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('inactive chart cells keep inline amendments scoped and actionable',{skip:!process.env.DESK_CHART_QA,timeout:120000},async t=>{
 const server=spawn('python3',[fileURLToPath(new URL('./launch_chart_trader_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());
 const url=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(b.toString().trim()));server.once('error',reject);});
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.DESK_CHROME_BIN?{executablePath:process.env.DESK_CHROME_BIN}:{})});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.route('**/api/settings/state',r=>r.fulfill({json:{values:{appearance:{theme:'dark'},trading:{instant:true},workspace:{version:1,layout:'4',activeCellId:'c1',charts:['c1','c2','c3','c4'].map(id=>({id,symbol:'hyperliquid:BTC',timeframe:'60'}))}},revisions:{}}}));
 const get=async path=>(await page.request.get(url+path)).json(),state=()=>get('/api/state');
 async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(60);}throw Error('Expectation timed out');}
 await page.goto(url);await page.locator('.trade-overlay').first().waitFor({state:'attached'});await until(()=>page.locator('#submitOrder').isEnabled());
 await page.locator('#sideBuy').click();await page.locator('#orderKind').selectOption('limit');await page.locator('#sizeMode').selectOption('units');await page.locator('#quantity').fill('.002');await page.locator('#entryPrice').fill('79500');await page.locator('#stopPrice').fill('');await page.locator('#targetPrice').fill('');await page.locator('#submitOrder').click();
 let order;await until(async()=>!!(order=(await state()).orders.find(o=>o.side==='buy'&&o.status==='working')));
 const first=page.locator('.trade-overlay').first(),second=page.locator('.trade-overlay').nth(1),firstLine=first.locator(`.trade-line[data-item-id="${order.id}"]`).first(),secondLine=second.locator(`.trade-line[data-item-id="${order.id}"]`).first();await secondLine.waitFor({state:'visible'});
 await secondLine.locator('[data-action=add-stop]').focus();await page.keyboard.press('Space');await until(async()=>!!(await state()).orders.find(o=>o.id===order.id)?.stop);
 await firstLine.locator('[data-action=add-target]').click();await until(async()=>!!(await state()).orders.find(o=>o.id===order.id)?.target);
 const secondStop=second.locator(`.trade-line[data-item-id="${order.id}"][data-field="stop"]`).first();await secondStop.locator('[data-action=cancel]').click();await until(async()=>!(await state()).orders.find(o=>o.id===order.id)?.stop);
 await firstLine.locator('[data-action=add-stop]').click();await until(async()=>!!(await state()).orders.find(o=>o.id===order.id)?.stop);
 await secondLine.locator('[data-action=quantity]').click();await secondLine.locator('input').fill('.003');await secondLine.getByRole('button',{name:'Apply',exact:true}).click();await until(async()=>['.003','0.003'].includes((await state()).orders.find(o=>o.id===order.id)?.qty));
 await secondLine.locator('[data-action=cancel]').click();await until(async()=> (await state()).orders.find(o=>o.id===order.id)?.status==='cancelled');
 assert.deepEqual(errors,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('right-click sell limit remains fixed through quote polls and pull handles follow the pointer',{skip:!process.env.DESK_CHART_QA,timeout:60000},async t=>{
 const server=spawn('python3',[fileURLToPath(new URL('./launch_chart_trader_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());
 const url=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(b.toString().trim()));server.once('error',reject);});
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.DESK_CHROME_BIN});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1500,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let polls=0;
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.route('**/api/settings/state',r=>r.fulfill({json:{values:{appearance:{theme:'dark'},trading:{instant:false},workspace:{version:1,layout:'1',activeCellId:'c1',charts:[{id:'c1',symbol:'hyperliquid:BTC',timeframe:'1'}]}},revisions:{}}}));
 await page.route('**/api/state?*',async r=>{const res=await r.fetch(),s=await res.json();polls++;for(const q of Object.values(s.quotes)){q.bid=String(79999+polls*3);q.ask=String(80000+polls*3);q.last=q.bid;}await r.fulfill({json:s});});
 await page.goto(url);const overlay=page.locator('.trade-overlay');await overlay.waitFor();await page.locator('#submitOrder').waitFor({state:'visible'});
 await page.locator('#sizeMode').selectOption('units');await page.locator('#quantity').fill('.001');
 const box=await overlay.boundingBox();await page.mouse.click(box.x+box.width*.55,box.y+box.height*.3,{button:'right'});
 const price=Number((await page.locator('#chartMenu [data-action=sell]').innerText()).match(/at ([\d,.]+)/)[1].replaceAll(',',''));await page.locator('#chartMenu [data-action=sell]').click();
 const entry=page.locator('[data-key=draftentry]');await entry.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-key=draftentry] .trade-line-label')?.textContent==='Sell Limit');assert.equal(await entry.locator('.trade-line-label').innerText(),'Sell Limit');assert.equal(await entry.locator('select').count(),0);assert.equal(await page.locator('[data-key=draftstop],[data-key=drafttarget]').count(),0);
 await page.waitForTimeout(500);const redundantWrites=await entry.evaluate(node=>new Promise(resolve=>{const noops=[];const observer=new MutationObserver(records=>{for(const m of records)if(m.oldValue===m.target.getAttribute(m.attributeName))noops.push(m.attributeName);});observer.observe(node,{attributes:true,attributeOldValue:true,subtree:true,attributeFilter:['style','data-price','data-kind','data-field','data-item-id','title','aria-label']});setTimeout(()=>{observer.disconnect();resolve(noops);},500);}));assert.deepEqual(redundantWrites,[],'steady price markers should not rewrite unchanged DOM attributes every animation frame');
 const firstPoll=polls;await page.waitForTimeout(7500);assert.ok(polls>firstPoll,'state refresh must occur');assert.equal(Number(await page.locator('#entryPrice').inputValue()),price);assert.equal(Number(await entry.getAttribute('data-price')),price);assert.equal(await page.locator('#orderKind').inputValue(),'limit');
 for(const [field,dy] of [['stop',-55],['target',90]]){
  const handle=entry.locator('[data-action=add-'+field+']');await handle.hover();const hb=await handle.boundingBox(),start=Number(await entry.evaluate(e=>e.style.top.replace('px','')));
  await page.mouse.down();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2+dy,{steps:15});await page.waitForTimeout(80);
  const line=page.locator('[data-key=draft'+field+']');await line.waitFor({state:'visible'});const preview=Number(await line.getAttribute('data-price'));assert.ok(Math.abs(Number(await line.evaluate(e=>e.style.top.replace('px','')))-start-dy)<3,'pulled line must follow requested chart location');
  await page.mouse.up();await page.waitForTimeout(120);assert.equal(Number(await page.locator('#'+field+'Price').inputValue()),preview);assert.equal(Number(await entry.getAttribute('data-price')),price);
 }
 assert.equal((await (await page.request.get(url+'/qa/commands')).json()).length,0);
 if(process.env.DESK_CHART_SCREENSHOT)await page.screenshot({path:process.env.DESK_CHART_SCREENSHOT});assert.deepEqual(errors,[]);
});

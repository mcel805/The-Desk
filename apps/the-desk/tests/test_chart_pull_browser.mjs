import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Real pointer events, real Engine commands, temporary ledger and invented prices.
test('pull TP/SL from entry, preview/confirm/discard, quantity and context cancellation',{skip:!process.env.DESK_CHART_QA,timeout:180000},async t=>{
 const server=spawn('python3',[fileURLToPath(new URL('./launch_chart_trader_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());
 const url=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(b.toString().trim()));server.once('error',reject);});
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.DESK_CHROME_BIN?{executablePath:process.env.DESK_CHROME_BIN}:{})});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin||r.request().url().startsWith('data:')?r.continue():r.abort());
 const get=async path=>(await page.request.get(url+path)).json(),state=()=>get('/api/state'),commands=()=>get('/qa/commands');
 const post=async(path,data)=>(await page.request.post(url+path,{data})).json();
 async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(60);}throw Error('Expectation timed out');}
 const line=(id,field='price')=>page.locator(`.trade-line[data-item-id="${id}"][data-field="${field}"]`).first();
 const contrast=locator=>locator.evaluate(e=>{const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255);const lum=value=>value.map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const fg=rgb(getComputedStyle(e).color),bg=rgb(getComputedStyle(e).backgroundColor),a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 async function drag(button,dy,beforeRelease){await button.hover();const b=await button.boundingBox();await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+dy,{steps:12});await page.waitForTimeout(80);await beforeRelease?.();await page.mouse.up();}
 async function setting(instant){await page.locator('#tradingSettings').click();await page.locator('[name=instant]').setChecked(instant);await page.locator('#dialogForm button[type=submit]').click();await page.locator('#dialog').waitFor({state:'hidden'});}
 async function ticket(side,kind='limit'){
  await page.locator(side==='buy'?'#sideBuy':'#sideSell').click();await page.locator('#orderKind').selectOption(kind);await page.locator('#sizeMode').selectOption('units');await page.locator('#quantity').fill('.002');
  if(kind==='limit')await page.locator('#entryPrice').fill(side==='buy'?'79500':'80500');
  await page.locator('#stopPrice').fill('');await page.locator('#targetPrice').fill('');
 }
 await page.addInitScript(()=>localStorage.setItem('desk.recorder.auto','false'));await page.goto(url);await page.locator('.trade-overlay').waitFor({state:'attached'});await until(()=>page.locator('#submitOrder').isEnabled());
 await ticket('buy');
 const draft=page.locator('[data-key=draftentry]');await draft.waitFor({state:'visible'});const n=(await commands()).length;
 await drag(draft.locator('[data-action=add-stop]'),30,async()=>assert.equal((await commands()).length,n));
 await until(async()=>Number(await page.locator('#stopPrice').inputValue())>0);assert.ok(Number(await page.locator('#stopPrice').inputValue())<79500);
 await drag(draft.locator('[data-action=add-target]'),-45);assert.ok(Number(await page.locator('#targetPrice').inputValue())>79500);assert.equal((await commands()).length,n);
 await draft.locator('[data-action=quantity]').click();await draft.locator('[aria-label="Chart order quantity"]').fill('.003');await draft.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await page.locator('#quantity').inputValue(),'.003');
 await draft.locator('.trade-order-kind').selectOption('stop');assert.equal(await page.locator('#orderKind').inputValue(),'stop');await draft.locator('.trade-order-kind').selectOption('limit');
 await draft.locator('[data-action=cancel]').click();await draft.waitFor({state:'detached'});
 // Both buy and sell orders begin naked; each leg must be created by the pull.
 for(const side of ['buy','sell']){
  await ticket(side);await page.locator('#submitOrder').click();let order;await until(async()=>!!(order=(await state()).orders.find(o=>o.side===side&&o.status==='working')));await line(order.id).waitFor({state:'visible'});assert.ok(await contrast(line(order.id).locator('.trade-price-badge'))>=3);
  let count=(await commands()).length;await drag(line(order.id).locator('[data-action=add-stop]'),side==='buy'?35:-35,async()=>assert.equal((await commands()).length,count));
  await until(async()=>!!(await state()).orders.find(o=>o.id===order.id)?.stop);
  await drag(line(order.id).locator('[data-action=add-target]'),side==='buy'?-60:60);await until(async()=>!!(await state()).orders.find(o=>o.id===order.id)?.target);
  let updated=(await state()).orders.find(o=>o.id===order.id);assert.ok(side==='buy'?Number(updated.stop)<Number(updated.price)&&Number(updated.target)>Number(updated.price):Number(updated.stop)>Number(updated.price)&&Number(updated.target)<Number(updated.price));
  assert.match(await line(order.id,'target').innerText(),/TP.*\+/);assert.match(await line(order.id,'target').innerText(),/R · gross/);
  await line(order.id).locator('[data-action=quantity]').click();await line(order.id).locator('input').fill('.004');await line(order.id).getByRole('button',{name:'Apply',exact:true}).click();await until(async()=>(await state()).orders.find(o=>o.id===order.id)?.qty==='.004'||(await state()).orders.find(o=>o.id===order.id)?.qty==='0.004');
  await setting(false);count=(await commands()).length;updated=(await state()).orders.find(o=>o.id===order.id);
  await drag(line(order.id,'target').locator('.trade-line-label'),side==='buy'?-18:18);await line(order.id).locator('[data-action=confirm]').waitFor({state:'visible'});assert.equal((await commands()).length,count);assert.equal((await state()).orders.find(o=>o.id===order.id).target,updated.target);
  await line(order.id).locator('[data-action=discard]').click();await until(async()=>!(await line(order.id).locator('[data-action=confirm]').isVisible()));assert.equal(Number(await line(order.id,'target').getAttribute('data-price')),Number(updated.target));
  await drag(line(order.id,'target').locator('.trade-line-label'),side==='buy'?-22:22);await line(order.id).locator('[data-action=confirm]').click();await until(async()=>(await state()).orders.find(o=>o.id===order.id)?.revision>updated.revision);assert.equal((await commands()).length,count+1);
  // Removing a leg is also an unsaved change and Discard restores it.
  await line(order.id,'stop').locator('[data-action=cancel]').click();await line(order.id,'stop').waitFor({state:'detached'});assert.ok((await state()).orders.find(o=>o.id===order.id).stop);await line(order.id).locator('[data-action=discard]').click();await line(order.id,'stop').waitFor({state:'visible'});
  // Server rejection leaves a retryable preview with the original ledger intact.
  await post('/qa/faults',{reject:true});await drag(line(order.id,'stop').locator('.trade-line-label'),side==='buy'?15:-15);await line(order.id).locator('[data-action=confirm]').click();await line(order.id).locator('.trade-line-detail').filter({hasText:'Synthetic command rejection'}).waitFor();await post('/qa/faults',{});await line(order.id).locator('[data-action=discard]').click();
  // Escape while holding a handle cannot submit an amendment.
  count=(await commands()).length;await line(order.id,'stop').locator('.trade-line-label').hover();await page.mouse.down();await page.mouse.move(100,100,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();assert.equal((await commands()).length,count);
  await setting(true);await line(order.id).locator('[data-action=cancel]').click();await until(async()=>(await state()).orders.find(o=>o.id===order.id)?.status==='cancelled');
 }
 await ticket('sell','market');await page.locator('#submitOrder').click();let position;await until(async()=>!!(position=(await state()).positions[0]));await line(position.id,'entry').waitFor({state:'visible'});
 await drag(line(position.id,'entry').locator('[data-action=add-stop]'),-40);await until(async()=>!!(await state()).positions[0]?.stop);
 await drag(line(position.id,'entry').locator('[data-action=add-target]'),60);await until(async()=>!!(await state()).positions[0]?.target);
 assert.equal(await line(position.id,'entry').locator('[data-action=quantity]').isDisabled(),true);
 await setting(false);await drag(line(position.id,'target').locator('.trade-line-label'),25);await line(position.id,'entry').locator('[data-action=confirm]').waitFor({state:'visible'});
 const positionBeforeManager=await state(),managerStop=Number(positionBeforeManager.positions[0].stop)+1;await page.locator('[data-panel=positions]').click();await page.locator(`[data-bracket="${position.id}"]`).click();await page.locator('#dialog').waitFor({state:'visible'});await page.locator('#dialogForm input[name=stop]').fill(String(managerStop));await page.locator('#dialogForm button[type=submit]').click();await page.locator('#dialog').waitFor({state:'hidden'});await until(async()=>!(await line(position.id,'entry').locator('[data-action=confirm]').isVisible()));assert.equal(Number((await state()).positions[0].stop),managerStop);
 const beforeReplay=(await commands()).length;await page.locator('#replayButton').click();await page.locator('#startReplay').click();await page.locator('.trade-line').first().waitFor({state:'detached'});await page.locator('#stopReplay').click();await line(position.id,'entry').waitFor({state:'visible'});assert.equal(await line(position.id,'entry').locator('[data-action=confirm]').isVisible(),false);assert.equal((await commands()).length,beforeReplay);
 if(process.env.DESK_CHART_SCREENSHOT)await page.screenshot({path:process.env.DESK_CHART_SCREENSHOT});
 await page.setViewportSize({width:800,height:1000});await page.waitForTimeout(150);assert.ok((await line(position.id,'entry').locator('.trade-line-controls').boundingBox()).x>=0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({synthetic:true,realPaperEngine:true,liveOrders:0,checks:['draft pulls and ticket synchronization','long and short order pulls','gross P&L and R labels','quantity amendment','confirm and discard','rejected amendment','Escape cancellation','position protection pulls','replay invalidation','tablet controls']}));
});

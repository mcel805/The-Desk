import test from 'node:test';
import assert from 'node:assert/strict';

const url=process.env.DESK_CHART_BROWSER_URL;
test('chart limit brackets: staging, all three drags, review, removal and discard', {skip:!url,timeout:180000},async()=>{
 const {chromium}=await import(process.env.DESK_PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.DESK_CHROME_BIN?{executablePath:process.env.DESK_CHROME_BIN}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];let commands=0;
  page.on('pageerror',e=>errors.push(e.message));
  // Keep the browser's chart state separate from saved user layouts. No order
  // commands may leave this draft-only test, even if a regression submits one.
  await page.route('**/api/settings',r=>r.fulfill({json:{appearance:{theme:'dark'},trading:{instant:false}}}));
  await page.route('**/api/command',r=>{commands++;return r.abort();});
  await page.goto(url);await page.locator('.trade-overlay').waitFor({state:'attached'});await page.waitForTimeout(3000);
  const entry=page.locator('.trade-line[data-key=draftentry]'),stop=page.locator('.trade-line[data-key=draftstop]'),target=page.locator('.trade-line[data-key=drafttarget]');
  async function stage(side){const box=await page.locator('.trade-overlay').first().boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.4,{button:'right'});await page.locator('#chartMenu [data-action='+side+']').click();await page.getByRole('heading',{name:'Place paper '+side+' limit'}).waitFor();assert.equal(commands,0);await page.getByRole('button',{name:'Edit on chart'}).click();for(const line of [entry,stop,target])await line.waitFor({state:'visible'});}
  async function values(){return page.evaluate(()=>Object.fromEntries(['entry','stop','target'].map(f=>[f,Number(document.querySelector('#'+f+'Price').value)])));}
  async function drag(line,dy){const label=line.locator('.trade-line-label');await label.hover();const box=await label.boundingBox();await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+dy,{steps:8});await page.mouse.up();await page.waitForTimeout(150);}
  await stage('sell');assert.equal(await entry.evaluate(e=>e.style.getPropertyValue('--level')),'#00bcd4');
  assert.match(await stop.innerText(),/^DRAFT · Stop Loss · −[\d,.]+ ticks/);assert.match(await target.innerText(),/^DRAFT · Take Profit · \+[\d,.]+ ticks/);
  assert.equal(await entry.locator('.trade-line-label').innerText(),'DRAFT · not placed');assert.equal(await stop.evaluate(e=>e.style.getPropertyValue('--level')),'#f23645');
  if(process.env.DESK_CHART_SCREENSHOT)await page.screenshot({path:process.env.DESK_CHART_SCREENSHOT});
  const initial=await values();await drag(entry,25);const moved=await values();assert.notEqual(moved.entry,initial.entry);assert.equal(moved.stop-moved.entry,initial.stop-initial.entry);assert.equal(moved.entry-moved.target,initial.entry-initial.target);
  await drag(stop,-18);const next=await values();assert.notEqual(next.stop,moved.stop);assert.equal(next.entry,moved.entry);assert.equal(next.target,moved.target);
  await drag(target,20);assert.notEqual((await values()).target,next.target);assert.equal(await page.locator('.trade-line[data-kind=draft] .trade-price-badge').count(),3);
  await entry.locator('.trade-line-label').click({button:'right'});assert.equal(await page.locator('#entryPrice').evaluate(e=>e===document.activeElement),true);
  await stop.locator('[data-action=cancel]').click();await stop.waitFor({state:'detached'});assert.equal((await values()).stop,0);
  await entry.locator('[data-action=cancel]').click();await entry.waitFor({state:'detached'});
  await stage('buy');assert.equal(await entry.evaluate(e=>e.style.getPropertyValue('--level')),'#00bcd4');const buy=await values();assert.ok(buy.stop<buy.entry&&buy.target>buy.entry);
  await drag(entry,-15);await page.keyboard.press('Escape');await entry.waitFor({state:'detached'});
  // Escape while holding a bracket cancels the drag as well as the draft.
  await stage('buy');await entry.locator('.trade-line-label').hover();await page.mouse.down();await page.keyboard.press('Escape');await entry.waitFor({state:'detached'});await page.mouse.up();assert.equal(await page.locator('.trade-line[data-kind=draft]').count(),0);
  assert.equal(commands,0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

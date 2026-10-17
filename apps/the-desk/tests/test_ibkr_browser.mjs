// Opt-in actual-browser regression; only an isolated synthetic server is allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const url=process.env.DESK_IBKR_BROWSER_URL;
const cli=(args,input)=>execFileSync('chrome-devtools-axi',args,{input,encoding:'utf8',timeout:45000,maxBuffer:2_000_000,env:{...process.env,CHROME_DEVTOOLS_AXI_SESSION:process.env.CHROME_DEVTOOLS_AXI_SESSION||'desk-ibkr-qa'}});
function evaluate(fn){return JSON.parse(cli(['run'],'console.log(JSON.stringify(await page.eval('+fn.toString()+')));').trim());}
function click(role,name){
 const lines=cli(['snapshot']).split('\n'),line=lines.find(s=>s.includes(' '+role+' "'+name+'"'));
 assert.ok(line,'Visible '+role+': '+name);const ref=line.match(/uid=([^ ]+)/)?.[1];assert.ok(ref);cli(['click','@'+ref]);
}
async function until(fn,label){for(let i=0;i<12;i++){if(evaluate(fn))return;await new Promise(r=>setTimeout(r,150));}assert.fail('Timed out: '+label);}
test('synthetic MYM renders, switches timeframe, recovers and keeps all trading disabled',{skip:!url,timeout:360000},async()=>{
 const target=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(target.hostname));assert.notEqual(target.port,'18880');
 const health=await fetch(new URL('/api/health',url)).then(r=>r.json());assert.equal(health.ibkr.configured_mode,'demo','Refusing a non-demo server');
 cli(['open',url]);
 await until(()=>document.querySelector('#ibkrBanner')?.textContent.includes('DEMO DATA'),'demo banner');
 const initial=evaluate(async()=>{
  window.ibkrBrowserErrors=[];window.addEventListener('unhandledrejection',e=>window.ibkrBrowserErrors.push(String(e.reason)));window.addEventListener('error',e=>window.ibkrBrowserErrors.push(e.message));
  const before=await fetch('/api/state').then(r=>r.json());window.ibkrBefore={orders:before.orders.length,fills:before.fills.length};
  window.ibkrResponses=[];const nativeFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const r=await nativeFetch(...args);if(String(args[0]).startsWith('/api/ibkr/bars'))window.ibkrResponses.push(await r.clone().json());return r;};
  return {canvas:document.querySelectorAll('#workspace canvas').length,label:document.querySelector('#instrumentLabel').textContent,disabled:['submitOrder','quickBuy','quickSell','sideBuy','sideSell'].every(id=>document.getElementById(id).disabled)};
 });
 assert.ok(initial.canvas>0);assert.equal(initial.label,'IBKR:MYM-202612');assert.ok(initial.disabled);
 await until(()=>window.ibkrResponses?.some(r=>r.timeframe==='1m'&&r.bars?.length>0),'continuous browser polling');
 console.log('PASS: rendered MYM with continuous local data and read-only controls');
 click('button','Timeframe — 1m');click('menuitem','1h');
 await until(()=>window.ibkrResponses?.some(r=>r.timeframe==='1h'&&r.bars?.length>0),'hourly bars');
 console.log('PASS: hourly chart requests');
 click('button','IBKR data');click('button','Pause demo feed');
 await until(()=>document.querySelector('#ibkrBanner').textContent.includes('disconnected'),'disconnected banner');
 click('button','Resume demo feed');
 await until(()=>document.querySelector('#ibkrBanner').textContent.includes('connected')&&!document.querySelector('#ibkrBanner').textContent.includes('disconnected'),'resumed feed');
 click('button','Close');
 console.log('PASS: pause/resume through the actual UI');
 click('button','Timeframe — 1h');click('menuitem','1m');
 await until(()=>document.querySelector('button[aria-label^="Timeframe"]')?.textContent.trim()==='1m','minute timeframe');
 click('button','DOM');
 await until(()=>document.querySelector('#domStatus')?.textContent.includes('Depth is not enabled'),'explicit depth scope');
 const result=evaluate(async()=>{
  const after=await fetch('/api/state').then(r=>r.json()),bars=window.ibkrResponses.filter(r=>r.bars?.length);
  return {before:window.ibkrBefore,after:{orders:after.orders.length,fills:after.fills.length},errors:window.ibkrBrowserErrors,
   intervals:[...new Set(bars.map(r=>r.timeframe))],label:document.querySelector('#ibkrBanner').textContent,
   perCell:[...document.querySelectorAll('.ibkr-cell-badge')].filter(e=>!e.hidden).map(e=>e.textContent),
   disabled:['submitOrder','quickBuy','quickSell','domBuy','domSell','domFlatten','domReverse'].every(id=>document.getElementById(id).disabled),
   units:bars.every(r=>r.bars.every(b=>b.time>1e12)),depth:document.querySelector('#domStatus').textContent};
 });
 assert.deepEqual(result.before,result.after);assert.ok(result.disabled);assert.ok(result.units);
 assert.ok(result.perCell.length>0&&result.perCell.every(s=>s.includes('DEMO DATA')));assert.deepEqual(result.errors,[]);
 click('button','Watchlist');console.log(JSON.stringify(result));
});

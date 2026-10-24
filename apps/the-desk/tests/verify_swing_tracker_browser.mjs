// Visual-only fixtures are injected into the browser's fetch response. Never written to the research ledger.
// Invoke with the existing Chrome inspection bridge configured in the environment.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:18884',out=resolve(process.argv[3]||'verification-private/swing-dots.png');
mkdirSync(dirname(out),{recursive:true});
function cli(...args){const r=spawnSync('chrome-devtools-axi',args,{encoding:'utf8',env:process.env});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;}
function evaluate(fn){const result=cli('eval',fn.toString());const match=result.match(/^result: (.+)$/m);if(!match)throw Error(result);return JSON.parse(JSON.parse(match[1]));}
cli('resize','1600','1000');cli('open',base+'/');
// Existing workspace persistence owns the selected market/timeframe. A 1m switch is a chart-only action.
let result=evaluate(()=>({button:!!document.querySelector('[data-swing-one-minute]'),chart:document.querySelector('[aria-label^="Timeframe"]')?.getAttribute('aria-label')}));
if(result.button)evaluate(()=>{document.querySelector('[data-swing-one-minute]').click();return true;});
const fixture=evaluate(async()=>{
 const response=await fetch('/api/swing/status'),data=await response.json(),s=data.symbols['hyperliquid:BTC'];
 if(s.status!=='OBSERVING'||!s.snapshot?.display_bars?.length)throw Error('Start a real public-data BTC observation run before visual verification.');
 const bars=s.snapshot.display_bars.slice(-18,-3),votes=['up','up','flat','down','down','flat','up','down'];
 const fake=structuredClone(data);fake.as_of=Date.now();const f=fake.symbols['hyperliquid:BTC'];
 f.observed_at=Date.now();f.jev={status:'VISUAL TEST — SYNTHETIC VOTES'};f.config.cadence_seconds=15;
 f.dots=bars.flatMap((b,i)=>Array.from({length:4},(_,slot)=>({id:`render-only-${i}-${slot}`,bar:b.time,slot:slot+1,cadence_seconds:15,observed_at:b.time+1000+slot*15000,prediction_bar:b.time+60000,high:b.high,low:b.low,vote:votes[(i+slot)%votes.length],service:'SYNTHETIC_RENDER_TEST',probabilities:null})));
 window.__swingRealFetch=window.fetch.bind(window);window.__swingFixture=fake;
 window.fetch=async function(input,init){const url=typeof input==='string'?input:input.url;if(url==='/api/swing/status'){window.__swingFixture.symbols['hyperliquid:BTC'].observed_at=Date.now();return new Response(JSON.stringify(window.__swingFixture),{status:200,headers:{'Content-Type':'application/json'}});}return window.__swingRealFetch(input,init);};
 const label=document.createElement('div');label.id='swing-render-test-label';label.textContent='VISUAL TEST · synthetic Jev votes over public BTC candles · no model performance implied';label.style.cssText='position:fixed;top:115px;left:60px;z-index:1000;background:#203257;color:#dce8ff;border:1px solid #6a8ad0;padding:6px 12px;border-radius:4px;font:11px system-ui;pointer-events:none';document.body.append(label);
 return {fixtures:f.dots.length,actualRun:s.run,source:'real public BTC candles; votes synthetic'};
});
// Poll visible DOM, bounded. CLI communication keeps the app event loop free.
let proof;
for(let i=0;i<12;i++){
 proof=evaluate(()=>{const dots=[...document.querySelectorAll('.swing-evaluation-dot')];return {count:dots.length,colors:[...new Set(dots.map(d=>d.getAttribute('fill')))],labels:dots.slice(0,4).map(d=>d.getAttribute('aria-label')),marker:document.querySelector('#swing-render-test-label')?.innerText,viewport:{width:innerWidth,scrollWidth:document.documentElement.scrollWidth},title:document.title};});
 if(proof.colors.includes('#00c99b')&&proof.colors.includes('#ff6072')&&proof.colors.includes('#a3acba'))break;
 cli('wait','500');
}
assert.ok(proof.count>=12,'Expected visible multi-vote candle stacks');assert.equal(proof.colors.length,3);assert.ok(proof.marker.includes('synthetic'));assert.ok(proof.viewport.scrollWidth<=proof.viewport.width+1,'Header must not force page overflow');
cli('screenshot',out);writeFileSync(out.replace(/\.png$/,'.json'),JSON.stringify({fixture,proof,disclaimer:'Rendering verification only. Model votes are synthetic; ledger unchanged.'},null,2));
// Restore ordinary server observations after capturing the explicitly labeled fixture.
evaluate(()=>{window.fetch=window.__swingRealFetch;document.querySelector('#swing-render-test-label')?.remove();delete window.__swingFixture;return true;});
process.stdout.write(JSON.stringify({ok:true,screenshot:out,visibleDots:proof.count,syntheticVotes:true})+'\n');

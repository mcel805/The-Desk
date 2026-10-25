import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
// Run after opening launch_swing_view_fixture.py in the selected Chrome session.
const output=process.argv[2];
const fn=async()=>{
 const ws=window.swingViewTest.workspace,select=document.querySelector('.swing-chart-control select'),button=document.querySelector('#swingTrackerButton'),steps=[];
 const wait=()=>new Promise(r=>setTimeout(r,450));
 const proof=(label,count,owner)=>{const roots=[...document.querySelectorAll('.swing-overlay')];if(roots.length!==count||(owner&&roots[0]?.dataset.swingCell!==owner))throw Error(label+': incorrect ownership');if(document.querySelector('.swing-summary'))throw Error('Old table remains');steps.push({label,overlays:roots.length,owner:roots[0]?.dataset.swingCell||null,dots:document.querySelectorAll('.swing-evaluation-dot').length});};
 await wait();proof('auto selects one 1m chart',1,'c3');
 select.value='c4';select.dispatchEvent(new Event('change'));await wait();proof('pin second 1m chart',1,'c4');
 await ws.cells().find(c=>c.id==='c4').chart.setMarket({timeframe:'5'});await wait();proof('pinned chart changed to higher frame',0);
 select.value='auto';select.dispatchEvent(new Event('change'));await wait();proof('auto falls back to remaining 1m chart',1,'c3');
 button.click();await wait();proof('hide dots',0);button.click();await wait();proof('show dots',1,'c3');
 await ws.cells().find(c=>c.id==='c3').chart.setMarket({timeframe:'5'});await wait();proof('no 1m chart no overlay',0);
 await ws.cells().find(c=>c.id==='c3').chart.setMarket({timeframe:'1'});await wait();proof('restored 1m chart',1,'c3');
 await ws.cells().find(c=>c.id==='c3').chart.setMarket({symbol:'hyperliquid:ETH'});await wait();proof('different market cannot show BTC observations',0);
 await ws.cells().find(c=>c.id==='c3').chart.setMarket({symbol:'hyperliquid:BTC'});await wait();proof('restored running market',1,'c3');
 ws.setLayout('1');await wait();proof('removed selected chart',0);ws.setLayout('4');await wait();
 for(const [i,c] of ws.cells().entries()){await c.chart.ready();await c.chart.setMarket({symbol:'hyperliquid:BTC',timeframe:['60','5','1','1'][i]});}
 await wait();proof('four chart layout restored',1);
 return {synthetic:true,paidCalls:0,steps,radii:[...new Set([...document.querySelectorAll('.swing-evaluation-dot')].map(d=>d.getAttribute('r')))]};
};
const r=spawnSync('chrome-devtools-axi',['eval',fn.toString()],{encoding:'utf8',env:process.env});if(r.status)throw Error(r.stderr||r.stdout);const match=r.stdout.match(/^result: (.+)$/m);if(!match)throw Error(r.stdout);const result=JSON.parse(JSON.parse(match[1]));if(output)writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));

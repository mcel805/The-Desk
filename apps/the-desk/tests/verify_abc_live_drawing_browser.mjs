// Isolated synthetic renderer acceptance; never submits orders.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const [url,out]=process.argv.slice(2);assert.ok(url&&out);assert.notEqual(new URL(url).port,'18880');await fs.mkdir(out,{recursive:true});
const command=async(...args)=>(await exec('chrome-devtools-axi',args,{timeout:120000,maxBuffer:3e6})).stdout;
async function evaluate(fn){const stdout=await command('eval',fn.toString()),line=stdout.split('\n').find(l=>l.startsWith('result: '));if(!line)throw Error(stdout);let result=JSON.parse(line.slice(8));try{return JSON.parse(result);}catch{return result;}}
await command('open',url);
for(let i=0;i<35;i++){if(await evaluate(()=>Boolean(document.querySelector('#saveWorkspace')&&document.querySelector('canvas'))))break;}
await evaluate(async()=>{const {registerStatePersistence}=await import('/vendor/vela.js');registerStatePersistence({key:'qa.abc.live-capture',scope:'cell',serialize:ctx=>{globalThis.__abcQA=ctx;return {};},restore:()=>{}});document.querySelector('#saveWorkspace').click();return true;});
await evaluate(async()=>{
 const Vela=__abcQA.chart.constructor,{DeskPineEngine}=await import('/pine-runtime.mjs');
 document.querySelector('#visual-qa')?.remove();
 const source=await(await fetch('/pine-examples/agentic-abc-reversal.pine')).text();
 const root=document.createElement('div');root.id='visual-qa';root.style='position:fixed;inset:0;z-index:99999;background:#131722;color:#eee;padding:20px;font:14px sans-serif';
 root.innerHTML='<h2 style="margin:0 0 8px">ABC Reversal · live drawing verification</h2><p style="margin:0 0 12px;color:#9ba5b5">SYNTHETIC FIXTURE · solid observed swings · yellow dashed projection · no orders</p><div id="qa-chart" style="height:calc(100% - 85px)"></div>';
 document.body.append(root);
 const values=[...Array.from({length:30},(_,i)=>120+Math.sin(i/2)),110,112,115,112,109,106,102,99,101,103,105,103,100,97,99,101,103,106];
 const producer='//@version=6\nindicator("Agentic - Liquidity", "Agentic - Liquidity",overlay=true)\nf_masterPools() =>\n    true\nf_smallCount() =>\n    true\nplot(100,"Rider HTF support",display=display.data_window)\nplot(100,"Rider HTF resistance",display=display.data_window)\nplot(float(na),"Reached support · this chart bar",display=display.data_window)\nplot(float(na),"Reached resistance · this chart bar",display=display.data_window)\n';
 globalThis.__visualBuild=async count=>{
  globalThis.__visual?.chart.destroy();
  const now=Date.now();
  let bars=values.slice(0,count).map((p,i)=>({time:now-(count-i)*60000,open:p,close:p,high:p+.5,low:p-.5,volume:100}));bars[37].high=100.5;
  bars.push({...bars.at(-1),time:now});
  let push;
  const feed={load:async()=>bars,subscribe:(_,fn)=>{push=fn;return()=>{};},symbolInfo:()=>({ticker:'SYNTHETIC ABC',tickerid:'fixture:ABC',mintick:1,minmov:1,pricescale:1,timezone:'UTC',type:'futures'})};
  const engine=new DeskPineEngine(),chart=new Vela('#qa-chart',{symbol:'fixture:ABC',timeframe:'1',live:true,theme:'dark',nativeBackend:'canvas2d',upColor:'#e0e3eb',downColor:'#e0e3eb'},{dataFeed:feed,engines:[engine]});
  await chart.ready();
  let result=await chart.runIndicator(producer,{id:'visual-liquidity',language:'pine'});if(!result.ok)throw result.error;
  result=await chart.runIndicator(source,{id:'visual-abc',language:'pine',inputs:{reversalSide:'Long from support',pivotBars:1,parentPivotBars:1,breakBufferTicks:0,minAlegAtr:0,requireHLcounter:false,geometryPlay:false,abcSummary:false}});if(!result.ok)throw result.error;
  chart.setVisibleRange({from:bars[25].time,to:now+23*60000});
  globalThis.__visual={chart,engine,bars,push};
  const m=engine.records.get('visual-abc').model;
  return {phase:m.series.find(s=>s.title.endsWith('phase')).points.at(-1).value,lines:m.lines.map(l=>({id:l.id,style:l.style,color:l.color,y2:l.y2})),labels:m.labels.map(l=>l.text),canvas:chart.rendererControl.renderer.scene.indicators.get('visual-abc').lines.length};
 };
 return true;
});
const report={synthetic:true,checks:[]};
for(const [stage,count] of [['A',38],['B',40],['C',42]]){
 const state=await evaluate(`() => __visualBuild(${count})`);assert.ok(state.lines.some(l=>l.id.endsWith(`developing-${stage}`)&&l.style==='solid'));assert.ok(state.lines.some(l=>l.id.endsWith(':forecast')&&l.color==='#FFD94A'&&l.style==='dashed'));assert.ok(state.canvas>0);report.checks.push({stage,...state});
 await command('screenshot',`${out}/synthetic-developing-${stage}.png`);
}
const tick=await evaluate(async()=>{
 await __visualBuild(42);
 const read=()=>{const m=__visual.engine.records.get('visual-abc').model;return {audit:m.series,tip:m.lines.find(l=>l.id.endsWith('developing-C'))};};
 const before=structuredClone(read());
 __visual.push({...__visual.bars.at(-1),low:80,close:82});
 let after;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));after=read();if(after.tip?.y2===80)break;}
 return {before:before.tip.y2,after:after.tip?.y2,completedAuditUnchanged:JSON.stringify(before.audit)===JSON.stringify(after.audit)};
});
assert.equal(tick.after,80);assert.equal(tick.completedAuditUnchanged,true);report.tick=tick;
await command('screenshot',`${out}/synthetic-live-tick.png`);
await fs.writeFile(`${out}/live-visual-report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,stages:report.checks.map(c=>c.stage),tick:report.tick}));

await evaluate(()=>{__visual.chart.destroy();document.querySelector('#visual-qa').remove();return true;});

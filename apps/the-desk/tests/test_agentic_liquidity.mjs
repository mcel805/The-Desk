import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {pineWorkerOptions} from '../web/pine-runtime.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
installNestedSecurity();
const original=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity-original.pine',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../web/pine-examples/agentic-liquidity.pine',import.meta.url),'utf8');
const manifest=JSON.parse(await fs.readFile(new URL('../source-manifest.json',import.meta.url),'utf8'));
const end=Date.UTC(2026,9,17),duration=tf=>({'D':1440,'1D':1440,'240':240,'60':60,'30':30,'15':15,'5':5,'3':3,'2':2,'1':1}[tf])*60000;
function fixture(tf,n=600){return Array.from({length:n},(_,i)=>{const time=end-(n-i)*duration(tf),p=51000+250*Math.sin(time/14400000)+50*Math.sin(time/900000);return {time,open:p,high:p+15,low:p-15,close:p+10*Math.sin(i),volume:1000+i%40};});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
async function run(src=source,{tf='60',inputs={},bars=fixture(tf)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'liquidity-test');let session,model;const warnings=[],calls=[],started=performance.now();
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:market(tf),inputs,visibleRange:{left:bars.at(-200)?.time??bars[0].time,right:end},historyState:'complete',mode:'static',fetchSeries:async(s,f,r)=>{calls.push(f);return fixture(f,r.limit||600);}},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:resolve,onError:reject});});return {model,prepared,bars,warnings,calls,ms:performance.now()-started};}finally{session?.stop();}
}
const normalize=value=>JSON.parse(JSON.stringify(value,(k,v)=>['id','title','shorttitle'].includes(k)?undefined:typeof v==='string'&&/^#[0-9a-f]{6,8}$/i.test(v)?v.toUpperCase():v));
const drawings=['lines','labels','boxes','linefills','polylines','tables'];
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
let baseline;
test('exact attachment archive, name-only port, manifest and compatible worker',()=>{
 assert.equal(fingerprint(original),'40139ef8dd660366e8471413bcc7a584acc826d5d68caa4f9f493c61a2af91bf');
 assert.equal(source,original.replace('"Wave Court · Liquidity + Bridge 3.5 Live Strength", "WC Liq 3.5"','"Agentic - Liquidity", "Agentic - Liquidity"'));
 assert.equal(manifest.agentic_liquidity.original_sha256,fingerprint(original));assert.equal(manifest.agentic_liquidity.source_sha256,fingerprint(source));
 assert.match(pineWorkerOptions(source).workerUrl,/pine-compatible-worker\.js$/);
});
test('all 72 inputs and every plot/drawing match the original on the same data',async()=>{
 const before=await run(original),after=await run();baseline=after;
 assert.equal(after.prepared.meta.title,'Agentic - Liquidity');assert.equal(after.prepared.inputs.length,72);assert.deepEqual(after.prepared.inputs,before.prepared.inputs);
 for(const key of ['series',...drawings])assert.deepEqual(normalize(after.model[key]),normalize(before.model[key]),key);
 assert.ok(after.model.lines.length>50);assert.ok(after.model.boxes.length>0);assert.ok(after.model.linefills.length>0);
 assert.ok(after.model.labels.every(l=>l.text==='•'),'default pools carry dots only, no tags');
 assert.ok(after.calls.includes('1')&&after.calls.includes('60')&&after.calls.includes('30'));
});
for(const tf of ['1','2','3','5','15','30','240','1D'])test(`${tf} chart preserves finite geometry and all bridge/strength feeds`,async()=>{
 const r=await run(source,{tf});assert.equal(r.model.series.length,28);assert.ok(r.model.lines.length>0);assert.ok(r.model.linefills.length>0);
 assert.ok(r.model.lines.every(l=>[l.x1,l.x2,l.y1,l.y2].every(Number.isFinite)));
 assert.ok(r.warnings.every(w=>!/unsupported|out.of.bounds|error/i.test(w.message)));
 console.log(JSON.stringify({tf,ms:Math.round(r.ms),lines:r.model.lines.length,boxes:r.model.boxes.length,linefills:r.model.linefills.length}));
});
test('appearance toggles retain all analytical outputs',async()=>{
 baseline??=await run();const hidden=await run(source,{inputs:{showSmallPools:false,showBands:false,showPockets:false,showRetired:false,showOriginDots:false,showDots:false,showTags:false,showStructureAlerts:false}});
 assert.equal(hidden.model.boxes.length,0);assert.equal(hidden.model.linefills.length,0);assert.equal(hidden.model.labels.length,0);
 assert.deepEqual(normalize(hidden.model.series),normalize(baseline.model.series));
});
test('swept small-pool history can be removed; active strips retain original length',async()=>{
 baseline??=await run();const active=await run(source,{inputs:{keepSweptSmall:false}});
 assert.ok(active.model.linefills.length<baseline.model.linefills.length);
 const strips=baseline.model.linefills.flatMap(f=>[f.line1,f.line2]);
 assert.ok(strips.length>0);assert.ok(strips.every(l=>l.x2-l.x1===4*duration('60')));
});
test('all source frames, tags, tick bands and close-through consumption execute',async()=>{
 const r=await run(source,{inputs:{useD:true,use4:true,use15:true,use5:true,useM:true,showTags:true,showPocketTags:true,showRetiredTags:true,bandMode:'Ticks',consumption:'Close through',useLiveStrength:false,strokeInput:'Solid',smallStyle:'Dashed'}});
 for(const tf of ['1D','240','60','30','15','5'])assert.ok(r.calls.includes(tf),tf);
 assert.ok(r.model.labels.some(l=>/1H|30m|4H|15m|5m|1m|D/.test(l.text)));assert.ok(r.model.boxes.length>0);
 assert.ok(r.model.lines.some(l=>l.style==='solid'));assert.ok(r.model.lines.some(l=>l.style==='dashed'));
});
test('saved source restores all inputs, hidden state and drawing output',async()=>{
 const before=await run(source,{inputs:{smallLen:6,showTags:true,bandPercent:.12,smallHighColor:'#ff000080',rightBars:20}});
 const inputs=before.model.inputValues;assert.equal(Object.keys(inputs).length,72);
 const saved=pineState({indicators:()=>[{id:'saved-liquidity',title:'Agentic - Liquidity',source,visible:false,inputValues:()=>inputs,propValues:()=>({})}]});
 const restored=[];restorePineState(saved,{chart:{indicators:()=>[]},addIndicator:e=>restored.push(e)});
 assert.equal(restored[0].hidden,true);assert.deepEqual(restored[0].inputs,inputs);
 const after=await run(restored[0].script,{inputs:restored[0].inputs});for(const key of ['series',...drawings])assert.deepEqual(normalize(after.model[key]),normalize(before.model[key]),key);
});
test('source validation rejects disabled sources and inverted source ladder',async()=>{
 await assert.rejects(run(source,{inputs:{use1:false,use30:false}}),/Enable at least one liquidity source/);
 await assert.rejects(run(source,{inputs:{tf4:'30',tf1:'60'}}),/Sources must descend/);
});

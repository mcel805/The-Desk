import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {pineWorkerOptions} from '../web/pine-runtime.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
import {sourceHash} from '../web/pine-validation.mjs';
installNestedSecurity();
const original=await fs.readFile(new URL('../web/pine-examples/agentic-elliot-waves-original.pine',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../web/pine-examples/agentic-elliot-waves.pine',import.meta.url),'utf8');
const journalBridge=await fs.readFile(new URL('../../../count-dashboard/paper_journal_bridge.py',import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('../source-manifest.json',import.meta.url),'utf8'));
const end=Date.UTC(2026,9,17),duration=tf=>({D:1440,'1D':1440,'1W':10080,'240':240,'60':60,'30':30,'15':15,'5':5,'1':1}[tf])*60000;
function fixture(tf,n=600){return Array.from({length:n},(_,i)=>{const time=end-(n-i)*duration(tf),p=51000+800*Math.sin(i/20)+250*Math.sin(i/4);return {time,open:p,high:p+30,low:p-30,close:p+10,volume:100};});}
const market=tf=>({symbol:'fixture:MYM',timeframe:tf,symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:1,minmov:1,pricescale:1,type:'futures',currency:'USD'}});
async function run(src=source,{tf='60',inputs={},bars=fixture(tf),fetchSeries=async(_,frame)=>fixture(frame)}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'elliot-test');let session,model;const warnings=[],calls=[],started=performance.now();
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market:market(tf),inputs,visibleRange:{left:bars.at(-200)?.time??bars[0].time,right:end},historyState:'complete',mode:'static',fetchSeries:async(s,f,r)=>{calls.push(f);return fetchSeries(s,f,r);}},{onModel:m=>model=m,onWarning:w=>warnings.push(w),onDone:resolve,onError:reject});});return {model,prepared,bars,warnings,calls,ms:performance.now()-started};}finally{session?.stop();}
}
const clean=value=>JSON.parse(JSON.stringify(value,(key,v)=>['id','title','shorttitle'].includes(key)?undefined:v));
const last=(m,title)=>m.series.find(s=>s.title===title)?.points.at(-1)?.value;
let baseline;
test('archived attachment bytes are preserved; named port uses the compatible worker',()=>{
 assert.equal(createHash('sha256').update(original).digest('hex'),'0772f65205220e8fbc758894c241750301e5487ad45c7cf14c4588cfb154f65f');
 const renamed=original.replace('"Wave Court · Nested Waves 4.1", "WC Waves 4.1"','"Agentic - Elliot Waves", "Agentic - Elliot Waves"');
 assert.equal(source.slice(0,renamed.length),renamed,'original calculation and drawing body is a byte contract');
 assert.match(pineWorkerOptions(source).workerUrl,/pine-compatible-worker\.js$/);
});
test('source manifest consumes the final named source fingerprint',async()=>{
 assert.equal(manifest.agentic_elliot_waves.source,'web/pine-examples/agentic-elliot-waves.pine');
 assert.equal(manifest.agentic_elliot_waves.source_sha256,await sourceHash(source));
 assert.equal(manifest.agentic_elliot_waves.original_sha256,await sourceHash(original));
 assert.equal(manifest.journal.bridge_route_sha256,createHash('sha256').update(journalBridge).digest('hex'));
});
test('generic UDT arrays preserve na instead of introducing false zero counts',async()=>{
 const result=await run('//@version=6\nindicator("NA array")\ntype C\n    int n=2\narray<C> a=array.new<C>(3,na)\narray.set(a,1,C.new(4))\nint found=0\nfor c in a\n    if not na(c)\n        found+=c.n\nplot(found,"Count")');
 assert.equal(last(result.model,'Count'),4);
});
test('original parser screens impulse, correction, triangle, diagonal, invalid overlap and wick invalidation',async()=>{
 const prefix=original.slice(0,original.indexOf('f_pack('));
 const cases=[['impulse',[0,10,5,24,15,30],1],['zigzag',[0,10,5,16],2],['regular',[0,10,.5,12],2],['expanded',[0,10,-2,13],2],['triangle',[0,10,3,8,4,7],4],['diagonal',[0,10,4,12,8,14],3],['bad',[0,10,-1,24,15,30],0]];
 let harness='\n';for(const [name,prices]of cases){harness+=`array<Swing> ${name}=array.new<Swing>()\n`;prices.forEach((p,i)=>harness+=`array.push(${name},Swing.new(${100000+i*60000},${160000+i*60000},${p},${i%2?1:-1},${200000+i*60000}))\n`);harness+=`Count ${name}C=f_basic(${name},0,${prices.length})\nplot(${name}C.family,"${name}")\n`;}
 harness+='plot(f_liveValid(impulseC,40,0)?1:0,"wickInvalid")\nplot(f_liveValid(impulseC,40,1)?1:0,"wickValid")\narray<Count> reconstructed=f_reconstruct(impulse)\nplot(array.size(reconstructed),"reconstructed")\n';
 const {model}=await run(prefix+harness,{bars:fixture('60',2)});for(const [name,,family]of cases)assert.equal(last(model,name),family,name);assert.equal(last(model,'wickInvalid'),0);assert.equal(last(model,'wickValid'),1);assert.equal(last(model,'reconstructed'),1);
});
test('renamed overlay exactly matches original drawing and audit outputs with companion panel off',async()=>{
 const old=await run(original),named=await run(source,{inputs:{agenticSummary:false}});baseline=named;
 assert.equal(named.prepared.meta.title,'Agentic - Elliot Waves');assert.equal(old.prepared.inputs.length,45);assert.equal(named.prepared.inputs.length,47);
 for(const key of ['series','lines','labels','boxes','polylines','linefills'])assert.deepEqual(clean(named.model[key]),clean(old.model[key]),key);
 assert.ok(named.model.lines.length>0);assert.ok(named.model.labels.length>0);assert.equal(named.model.tables.length,0);
});
for(const tf of ['1D','240','60','30','15','5','1'])test(`${tf} executes three-tier overlay and daily-to-1m summary on completed source bars`,async()=>{
 const r=await run(source,{tf});assert.ok(r.model.lines.length>0);assert.ok(r.model.labels.length>0);assert.equal(r.model.tables.length,1);
 assert.ok(r.warnings.every(w=>!/unsupported|error|out.of.bounds/i.test(w.message)));assert.ok(r.model.lines.every(l=>[l.x1,l.x2,l.y1,l.y2].every(Number.isFinite)));assert.ok(r.model.labels.every(l=>Number.isFinite(l.x)&&Number.isFinite(l.y)));
 const table=JSON.stringify(r.model.tables);for(const value of ['Elliott Bias','Current Wave Count','Projections?','1D','4H','1H','30m','15m','5m','1m'])assert.ok(table.includes(value),value);
 assert.ok(last(r.model,'Audit · chart source cutoff')<=end);console.log(JSON.stringify({tf,ms:Math.round(r.ms),lines:r.model.lines.length,labels:r.model.labels.length,calls:r.calls}));
});
test('display toggles hide overlay without changing counts and saved inputs reproduce drawings',async()=>{
 const inputs={agenticSummary:false,showParent:false,showCore:false,showChild:false,showProjection:false};const hidden=await run(source,{inputs});assert.equal(hidden.model.lines.length,0);assert.equal(hidden.model.labels.length,0);assert.equal(hidden.model.tables.length,0);
 baseline??=await run(source,{inputs:{agenticSummary:false}});const originalInputs={...baseline.model.inputValues,detail:'Every pivot',projectionBars:24,fontPx:18};
 const before=await run(source,{inputs:originalInputs});const h={id:'saved-elliot',source,title:'Agentic - Elliot Waves',visible:false,inputValues:()=>originalInputs,propValues:()=>({})};const saved=pineState({indicators:()=>[h]});const restored=[];restorePineState(saved,{chart:{indicators:()=>[]},addIndicator:e=>restored.push(e)});assert.equal(restored[0].hidden,true);assert.deepEqual(restored[0].inputs,originalInputs);
 const after=await run(restored[0].script,{inputs:restored[0].inputs});for(const key of ['series','lines','labels'])assert.deepEqual(clean(after.model[key]),clean(before.model[key]));
});
test('summary table survives disabling and re-enabling its input',async()=>{
 const engine=new PineEngine(),prepared=await engine.prepare(source,'toggle-summary'),states=[];let session,resolveDone,rejectDone;
 const waitDone=()=>new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
 const request={prepared,bars:fixture('60'),market:market('60'),inputs:{},historyState:'complete',mode:'static',fetchSeries:async(_,frame)=>fixture(frame)};
 let done=waitDone();session=engine.execute(request,{onModel:model=>states.push(model),onDone:()=>resolveDone?.(),onError:error=>rejectDone?.(error)});await done;
 assert.equal(states.at(-1).tables.length,1);
 done=waitDone();session.update({agenticSummary:false});await done;assert.equal(states.at(-1).tables.length,0);
 done=waitDone();session.update({agenticSummary:true});await done;assert.equal(states.at(-1).tables.length,1);session.stop();
});
test('summary position follows settings updates through PineEngine',async()=>{
 const engine=new PineEngine(),prepared=await engine.prepare(source,'position-summary'),bars=fixture('60'),states=[];let session,resolveDone,rejectDone;
 const waitDone=()=>new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
 const request={prepared,bars,market:market('60'),inputs:{agenticPosition:'Bottom right'},visibleRange:{left:bars.at(-200).time,right:end},historyState:'complete',mode:'static',fetchSeries:async(_,frame)=>fixture(frame)};
 let done=waitDone();session=engine.execute(request,{onModel:model=>states.push(model),onDone:()=>resolveDone?.(),onError:error=>rejectDone?.(error)});await done;
 assert.equal(states.at(-1).tables[0].position,'bottom_right');
 done=waitDone();session.update({agenticPosition:'Top left'});await done;assert.equal(states.at(-1).tables[0].position,'top_left');session.stop();
});
test('manual ladder validation rejects inverted degrees',async()=>{await assert.rejects(run(source,{inputs:{ladder:'Manual timeframes',parentInput:'1',coreInput:'60',childInput:'240',agenticSummary:false}}),/parent.*chart count.*child/);});

test('forming last bar still renders at the completed history boundary',async()=>{
 const boundary=Math.floor(Date.now()/duration('60'))*duration('60');
 const bars=fixture('60').map(b=>({...b,time:b.time-end+boundary+duration('60')}));
 const result=await run(source,{bars,fetchSeries:async(_,tf)=>fixture(tf).map(b=>({...b,time:b.time-end+Math.floor(Date.now()/duration(tf))*duration(tf)+duration(tf)}))});
 assert.ok(result.model.lines.length>0);assert.ok(result.model.labels.length>0);
 assert.ok(result.model.tables[0].cells.flat().some(c=>c?.text==='Elliott Bias'));
});

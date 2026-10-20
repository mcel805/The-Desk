import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from '../web/pine-compat/nested-security.mjs';
import {installThreeDriveCompatibility,isThreeDriveSource} from '../web/pine-compat/three-drive.mjs';
import {pineWorkerOptions} from '../web/pine-runtime.mjs';
import {pineState,restorePineState} from '../web/pine-state.mjs';
installNestedSecurity();installThreeDriveCompatibility();
const original=await fs.readFile(new URL('../web/pine-examples/agentic-three-drive-pattern-original.pine',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../web/pine-examples/agentic-three-drive-pattern.pine',import.meta.url),'utf8');
const manifest=JSON.parse(await fs.readFile(new URL('../source-manifest.json',import.meta.url),'utf8')).agentic_three_drive_pattern;
const keys=['lines','labels','boxes','polylines','tables','series','linefills'];
const clean=v=>JSON.parse(JSON.stringify(v,(k,v)=>['id','paneId'].includes(k)?undefined:v));
export function driveFixture({sign=1,positions=[0,20,40,60,80,100,120],values=[110,100,107,97,104,94,95],count=125}={}){
 return Array.from({length:count},(_,i)=>{let j=0;while(j<positions.length-2&&i>=positions[j+1])j++;const price=values[j]+(values[j+1]-values[j])*(i-positions[j])/(positions[j+1]-positions[j]),p=110+sign*(price-110);return {time:Date.UTC(2026,0,1)+i*60000,open:p,high:p+.01,low:p-.01,close:p,volume:100};});
}
const market={symbol:'fixture:MYM',timeframe:'1',symbolInfo:{ticker:'MYM',tickerid:'fixture:MYM',timezone:'America/Chicago',mintick:.01,minmov:1,pricescale:100,type:'futures',currency:'USD'}};
async function run(src=source,{bars=driveFixture(),inputs={},props={}}={}){
 const engine=new PineEngine(),prepared=await engine.prepare(src,'three-drive-test');let session,model;const warnings=[];
 try{await new Promise((resolve,reject)=>{session=engine.execute({prepared,bars,market,inputs,props,historyState:'complete',mode:'static',fetchSeries:()=>{throw Error('Three Drive must stay chart-local');}},{onModel:m=>model=m,onDone:resolve,onError:reject,onWarning:w=>warnings.push(w)});});return {model,prepared,warnings};}finally{session?.stop();}
}
test('attachment preserved byte-for-byte; port changes only title and shorttitle',async()=>{
 assert.equal(source,original.replace("indicator('Three Drive Pattern Detector', shorttitle='Three Drive Pattern Detector'","indicator('Agentic - Three Drive Pattern', shorttitle='Agentic - Three Drive Pattern'"));
 for(const [text,key] of [[original,'original_sha256'],[source,'source_sha256']])assert.equal(createHash('sha256').update(text).digest('hex'),manifest[key]);
 assert.equal(isThreeDriveSource(original),true);assert.equal(isThreeDriveSource(source),true);assert.equal(isThreeDriveSource('indicator("Other")'),false);
 assert.match(pineWorkerOptions(source).workerUrl,/pine-compatible-worker\.js$/);
 const editor=await fs.readFile(new URL('../web/pine-editor.mjs',import.meta.url),'utf8');assert.match(editor,/id:'pineThreeDrive',name:'Agentic - Three Drive Pattern'/);
});
test('all original inputs, constraints, defaults, and calculated-bars property survive',async()=>{
 const {prepared}=await run();assert.equal(prepared.meta.title,'Agentic - Three Drive Pattern');
 assert.deepEqual(prepared.inputs.map(x=>[x.key,x.defval]),[['stt',3],['num',100],['ret_L',.618],['ret_H',.786],['ext_L',1.272],['ext_H',1.618],['widthPerc',100],['colBl','#089981FF'],['colBr','#F23645FF'],['textSize','Small'],['showRatios','None'],['showDash',true],['table_position','Top Right'],['table_size','Small']]);
 assert.equal(prepared.props.find(p=>p.key==='calc_bars_count').defval,10000);assert.equal(prepared.props.find(p=>p.key==='calc_bars_count').min,0);
 assert.deepEqual(prepared.inputs.slice(0,6).map(p=>[p.min,p.max]),[[1,99],[2,100],[.5,.618],[.786,.9],[1.1,1.272],[1.618,1.8]]);
});
for(const sign of [1,-1])for(const mode of ['None','Ratios','Ratios With Margin'])test(`${sign===1?'bullish':'bearish'} ${mode}: source and port match, including independent geometric anchors`,async()=>{
 const bars=driveFixture({sign}),inputs={showRatios:mode};const a=await run(source,{bars,inputs}),b=await run(original,{bars,inputs});for(const k of keys)assert.deepEqual(clean(a.model[k]),clean(b.model[k]),k);assert.deepEqual(a.warnings,[]);
 const m=a.model;assert.equal(m.polylines.length,1);assert.equal(m.polylines[0].lineColor,sign===1?'#089981FF':'#f23645FF');assert.equal(m.polylines[0].lineWidth,2);
 assert.deepEqual(m.polylines[0].points.map(p=>p.x),[0,20,40,60,80,100]);
 const prices=sign===1?[110.01,99.99,107.01,96.99,104.01,93.99]:[110.01,120.01,112.99,123.01,115.99,126.01];m.polylines[0].points.forEach((p,i)=>assert.ok(Math.abs(p.price-prices[i])<1e-9));
 assert.equal(m.boxes.length,mode==='None'?0:mode==='Ratios'?4:8);assert.equal(m.lines.filter(l=>l.style==='dashed').length,4);
 const [Y,Z,A,B,C,D]=prices,ratios=[Math.abs((Z-A)/(Z-Y)),Math.abs((B-Y)/(Z-Y)),Math.abs((B-C)/(B-A)),Math.abs((D-A)/(B-A))];
 assert.deepEqual(m.labels.map(l=>l.text),ratios.map(r=>String(Math.round(r*1000)/1000)));assert.ok(m.labels.every(l=>l.noFill&&l.size==='small'));
 assert.ok(m.labels[0].tooltip.includes('0.786')&&m.labels[0].tooltip.includes('0.618'));assert.ok(m.labels[1].tooltip.includes('1.618')&&m.labels[1].tooltip.includes('1.272'));
 assert.equal(m.tables[0].cells[0][0].text,'Last know pattern:\n2025-12-31 19:41');
});
test('ratio labels use local method argument, independent of Maximum Swing Length',async()=>{
 const a=await run(source,{inputs:{stt:3,num:4}}),b=await run(source,{inputs:{stt:3,num:20}});assert.deepEqual(a.model.labels.map(l=>l.text),['0.701','1.299','0.701','1.299']);assert.deepEqual(a.model.labels.map(l=>l.text),b.model.labels.map(l=>l.text));
});
test('ratio windows reject out-of-range retracements and extensions',async()=>{
 for(const values of [[110,100,109,97,104,94,95],[110,100,107,95,102,92,93]])assert.equal((await run(source,{bars:driveFixture({values})})).model.polylines.length,0);
});
test('duration symmetry follows Width Margin and min/max retains source clamping',async()=>{
 const bars=driveFixture({positions:[0,20,40,60,100,120,140],count:145});
 assert.equal((await run(source,{bars,inputs:{widthPerc:99}})).model.polylines.length,0);
 assert.ok((await run(source,{bars,inputs:{widthPerc:100}})).model.polylines.length>0);
 const a=await run(source,{inputs:{stt:3,num:2}}),b=await run(source,{inputs:{stt:3,num:4}});for(const k of keys)assert.deepEqual(clean(a.model[k]),clean(b.model[k]),k);
});
test('dashboard hide, location, sizes, custom colors and no-pattern state preserve source behavior',async()=>{
 const {model}=await run(source,{inputs:{showDash:false,colBl:'#123456FF',textSize:'Tiny'}});assert.equal(model.polylines[0].lineColor,'#123456FF');assert.ok(model.labels.every(l=>l.size==='tiny'));assert.ok(model.tables.every(t=>!t.cells.flat().some(c=>c?.text)));
 for(const location of ['Bottom Right','Bottom Left']){const r=await run(source,{inputs:{table_position:location,table_size:'Normal'}});assert.equal(r.model.tables[0].position,location.toLowerCase().replace(' ','_'));assert.equal(r.model.tables[0].cells[0][0].textSize,'normal');}
 const none=await run(source,{bars:driveFixture({count:60})});assert.equal(none.model.polylines.length,0);assert.equal(none.model.tables[0].cells[0][0].text,'Last know pattern:\nNone');
});
test('saved settings reproduce drawings and calculated-bars property',async()=>{
 const inputs={stt:1,num:100,showRatios:'Ratios With Margin',table_position:'Bottom Left'},props={calc_bars_count:0};const a=await run(source,{inputs,props});const saved=pineState({indicators:()=>[{id:'drive',source,title:'Agentic - Three Drive Pattern',visible:false,inputValues:()=>inputs,propValues:()=>props}]}),restored=[];restorePineState(saved,{chart:{indicators:()=>[]},addIndicator:e=>restored.push(e)});assert.equal(restored[0].hidden,true);assert.deepEqual(restored[0].inputs,inputs);const b=await run(restored[0].script,{inputs:restored[0].inputs,props:restored[0].props});for(const k of keys)assert.deepEqual(clean(a.model[k]),clean(b.model[k]),k);
});
test('input update recomputes ratios and dashboard without stale objects',async()=>{
 const engine=new PineEngine(),prepared=await engine.prepare(source,'drive-updates');let session,resolveDone,rejectDone,model;const wait=()=>new Promise((r,j)=>{resolveDone=r;rejectDone=j;});let done=wait();
 try{session=engine.execute({prepared,bars:driveFixture(),market,historyState:'complete',mode:'static'},{onModel:m=>model=m,onDone:()=>resolveDone(),onError:e=>rejectDone(e)});await done;assert.equal(model.boxes.length,0);
 done=wait();session.update({showRatios:'Ratios With Margin',table_position:'Bottom Left'});await done;assert.equal(model.boxes.length,8);assert.equal(model.tables[0].position,'bottom_left');
 done=wait();session.update({showRatios:'Ratios',showDash:false});await done;assert.equal(model.boxes.length,4);assert.ok(model.tables.every(t=>!t.cells.flat().some(c=>c?.text)));assert.equal(model.labels[0].text,'0.701');
 }finally{session?.stop();}
});

test('new terminal swing replaces the old pattern and leaves the dashed final segment',async()=>{
 const bars=driveFixture({positions:[0,20,40,60,80,100,104,108,120],values:[110,100,107,97,104,94,96,93,95]}),inputs={stt:10,num:11,showRatios:'Ratios With Margin'};
 const a=await run(source,{bars,inputs}),b=await run(original,{bars,inputs});for(const k of keys)assert.deepEqual(clean(a.model[k]),clean(b.model[k]),k);
 assert.equal(a.model.polylines.length,1);assert.equal(a.model.polylines[0].points.at(-1).x,108);assert.equal(a.model.labels.length,4);assert.equal(a.model.boxes.length,8);
 const dashed=a.model.lines.find(l=>l.x1===80&&l.x2===108);assert.equal(dashed.style,'dashed');assert.equal(dashed.color,'#089981');assert.equal(a.model.labels.at(-1).text,'1.399');
});

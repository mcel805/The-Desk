import test from 'node:test';
import assert from 'node:assert/strict';
import {geometryDrawing} from '../web/market-geometry-drawing.mjs';
import {focusTurn,focusSteps} from '../web/market-geometry-focus.mjs';
const minute=60000,cutoff=100*minute;
const pivot=(n,price)=>({time:n*minute,price,knownAt:(n+2)*minute,lockedAt:(n+4)*minute,id:'p'+n,kind:'HL'});
const sources=Object.fromEntries(['60','30','15','5','1'].map(tf=>[tf,{status:'ready',bars:[{time:95*minute,open:100,high:110,low:90,close:105}]}]));
const result={cutoff,frames:Object.fromEntries(['60','30','15','5','1'].map(tf=>[tf,{locked:[pivot(80,100),pivot(85,110),pivot(90,102)],working:pivot(95,109),channels:[],events:[],structure:{direction:1}}])),turns:{candidates:[],events:[]}};
test('Focus retains all evidence, draws only micro path and has no stacked text or giant dots',()=>{
 const before=structuredClone(result),model=geometryDrawing(result,{id:'clean',sources});
 assert.equal(model.geometry,result);assert.deepEqual(result,before);assert.equal(model.labels.length,0);assert.equal(model.tables.length,0);assert.ok(model.lines.some(l=>l.id.includes(':1:swing:')));assert.ok(!model.lines.some(l=>l.id.includes(':60:swing:')));assert.ok(model.geometryFocus.sources['60']);assert.equal(model.drawingAutoscale,false);
 const tail=model.lines.find(l=>l.id.endsWith(':1:working'));assert.equal(tail.style,'dashed');assert.equal(tail.color,'#F6BD54');
});
test('Full overlay and Inspect retain colored parent geometry while disabling Focus UI',()=>{
 for(const inputs of [{geometryPresentation:'Full overlay'},{geometryMode:'Inspect'}]){const model=geometryDrawing(result,{id:'inspect',sources,inputs});assert.equal(model.geometryFocus,null);assert.ok(model.lines.some(l=>l.id.includes(':60:swing:')));assert.ok(model.tables.length);}
});
test('Focus respects source outage, frame visibility and view-only calculation identity',()=>{
 const hidden=geometryDrawing(result,{id:'off',sources,inputs:{showFrame1:false}});assert.equal(hidden.lines.length,0);
 const outage=geometryDrawing(result,{id:'outage',sources:{...sources,1:{status:'unavailable',error:'fixture outage'}}});assert.equal(outage.lines.length,0);assert.equal(outage.geometry.frames['1'].locked.length,3);
});
test('Current turn card uses one active sequence; a forming candidate cannot manufacture shift or retest',()=>{
 const active={id:'active',terminal:false,stage:'forming',lastEvent:{knownAt:cutoff}},failed={id:'failed',terminal:true,stage:'failed',lastEvent:{knownAt:cutoff}};
 const g={...result,turns:{candidates:[active,failed],events:[{candidateId:'active',stage:'contact',knownAt:90*minute},{candidateId:'failed',stage:'retest',knownAt:95*minute}]}};
 assert.equal(focusTurn(g),active);assert.deepEqual(focusSteps(g).map(s=>s.number),[1]);g.turns.events.push({candidateId:'active',stage:'retest',knownAt:110*minute});assert.deepEqual(focusSteps(g).map(s=>s.number),[1]);
 g.turns.events.push({candidateId:'active',stage:'shift',knownAt:95*minute});assert.deepEqual(focusSteps(g).map(s=>s.number),[1,2]);
 g.turns.events.push({candidateId:'active',stage:'retest',knownAt:99*minute});assert.deepEqual(focusSteps(g).map(s=>s.number),[1,2,3]);
});
test('Expired history does not occupy current turn card indefinitely',()=>{
 assert.equal(focusTurn({...result,turns:{candidates:[{terminal:true,lastEvent:{knownAt:cutoff-21*minute}}]}}),null);
});

test('exact pre-Focus catalog upgrades while custom source, input values and original backup survive',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto'),{upgradeGeometryWorkspace,PRE_FOCUS_GEOMETRY_HASH}=await import('../web/market-geometry-upgrade.mjs');
 const latest=await readFile(new URL('../web/pine-examples/agentic-market-geometry-mtf.pine',import.meta.url),'utf8'),previous=latest.replace(/^string geometryPresentation =.*\n/m,'');assert.equal(createHash('sha256').update(previous).digest('hex'),PRE_FOCUS_GEOMETRY_HASH);
 const backup={script:'preserved original',inputs:{geometryPivot:7}},old={charts:[{ext:{'desk.pine.v1':[{id:'known',script:previous,hidden:true,inputs:{geometryMode:'Micro detail',frameColor1:'#123456'},geometryOriginal:backup},{id:'edited',script:previous+'\n// custom edit'}]}}]};
 const next=await upgradeGeometryWorkspace(old,async()=>latest),a=next.charts[0].ext['desk.pine.v1'][0];assert.equal(a.script,latest);assert.equal(a.inputs.geometryMode,'Micro detail');assert.equal(a.inputs.geometryPresentation,'Focus');assert.equal(a.inputs.frameColor1,'#123456');assert.equal(a.hidden,true);assert.deepEqual(a.geometryOriginal,backup);assert.equal(next.charts[0].ext['desk.pine.v1'][1].script,previous+'\n// custom edit');assert.equal(old.charts[0].ext['desk.pine.v1'][0].script,previous);
});

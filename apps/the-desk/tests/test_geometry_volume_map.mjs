import test from 'node:test';
import assert from 'node:assert/strict';
import {geometryVolumeDrawing,geometryMapChannels} from '../web/geometry-volume-drawing.mjs';
import {formatGeometryPrice} from '../web/geometry-volume-view.mjs';
import {reserveGeometryMargin,releaseGeometryMargin,syncGeometryMargin,geometryCalloutLayout} from '../web/geometry-volume-layout.mjs';
import {GEOMETRY_FRAMES,channelBounds} from '../web/market-geometry-model.mjs';
const m=60000,end=Date.UTC(2026,10,1,19);
function fixture(){
 const sources={},frames={};
 for(const tf of GEOMETRY_FRAMES){const ms=Number(tf)*m,start=end-300*ms,points=[{id:tf+'-low',time:start,price:100,lockedAt:start+4*ms},{id:tf+'-high',time:start+80*ms,price:150,lockedAt:start+84*ms}];sources[tf]={status:'ready',bars:[{time:start,open:101,low:99,high:103,close:100},{time:end-ms,open:120,high:124,low:118,close:122}]};frames[tf]={locked:points,working:null,channels:[{id:tf+'-broad',frame:tf,family:'structural',side:-1,t0:start,t1:start+100*ms,p0:100,p1:110,offset:50,endAt:end-ms,knownAt:start+110*ms,touches:2,spanBars:300,broken:false}],structure:{direction:1}};}
 return {sources,result:{tick:1,cutoff:end,frames,turns:{candidates:[],events:[]},geometryVolume:{sweep:{events:[]},strategy:{campaigns:[],paper:[]}}}};
}
for(const tf of GEOMETRY_FRAMES)test(tf+' chart retains full parent anchors, all five maps and its own swing path',()=>{
 const {sources,result}=fixture(),before=structuredClone(result),drawing=geometryVolumeDrawing(result,{id:'map',sources,viewTimeframe:tf,inputs:{abcFocus:false}});
 assert.deepEqual(drawing.geometryVolumeFocus.mappedFrames,GEOMETRY_FRAMES);
 const rail=drawing.lines.find(l=>l.id==='map:gv:60-broad:lower rail');assert.ok(rail);assert.equal(rail.x1,result.frames['60'].channels[0].t0);assert.ok(rail.x1<sources['1'].bars[0].time);assert.equal(rail.y1,100);
 const path=drawing.lines.filter(l=>l.id.includes(':swing:'));assert.equal(path.length,1);assert.equal(path[0].x1,result.frames[tf].locked[0].time);assert.equal(path[0].x2,result.frames[tf].locked[1].time);
 assert.equal(drawing.labels.length,0);assert.equal(drawing.tables.length,0);assert.deepEqual(result,before);
});
test('frame visibility, contact threshold and missing sources remove only their drawing layers',()=>{
 const {sources,result}=fixture();sources['30'].status='unavailable';const d=geometryVolumeDrawing(result,{id:'map',sources,inputs:{showFrame15:false,geometryMinTouches:2}});
 assert.deepEqual(d.geometryVolumeFocus.mappedFrames,['60','5','1']);assert.ok(d.lines.every(l=>!l.id.includes('30-broad')&&!l.id.includes('15-broad')));
 assert.equal(geometryVolumeDrawing(result,{id:'map',sources,inputs:{geometryMinTouches:3}}).geometryVolumeFocus.mappedFrames.length,0);
});
test('different slopes survive while duplicate rails, future evidence and gap-ended channels are excluded',()=>{
 const {result}=fixture(),g=result.frames['60'].channels[0],opposite={...g,id:'opposite',family:'local',p0:150,p1:140};
 const selected=geometryMapChannels({channels:[g,{...g,id:'duplicate'},opposite,{...g,id:'future',knownAt:end+m},{...g,id:'gap',gapEnded:true}]},end,{limit:3,tick:1});
 assert.deepEqual(selected.map(g=>g.id),['60-broad','opposite']);assert.equal(geometryMapChannels({channels:[{...g,broken:true}]},end,{showBroken:false}).length,0);
});
test('projected parallels start at the frozen audited endpoint and do not extend past cutoff by default',()=>{
 const {sources,result}=fixture(),g=result.frames['60'].channels[0];g.endAt=end-20*60*m;g.broken=true;
 const d=geometryVolumeDrawing(result,{id:'map',sources}),line=d.lines.find(l=>l.id==='map:gv:60-broad:projected:lower rail');
 assert.ok(line);assert.equal(line.x1,g.endAt);assert.equal(line.y1,channelBounds(g,g.endAt).low);assert.ok(line.x2<=end);assert.equal(line.style,'dashed');assert.match(line.tooltip,/untested/);
 const forward=geometryVolumeDrawing(result,{id:'map',sources,viewTimeframe:'60',inputs:{showProjection:true}}).lines.find(l=>l.id===line.id);assert.equal(forward.x2,end+20*60*m);
});
function native(){const n={coords:{width:1000,barCount:300,viewport:{barSpacing:5,rightOffset:10},pxPerBar(){return this.viewport.barSpacing;},getViewport(){return {...this.viewport};}},calls:0,applyViewport(v){this.calls++;this.coords.viewport={...v};}};return n;}
test('shared right-margin lease paints once, resizes and restores only after the last owner',()=>{
 const n=native();reserveGeometryMargin(n,'a');assert.equal(n.coords.viewport.rightOffset,42);assert.equal(n.calls,1);reserveGeometryMargin(n,'b');reserveGeometryMargin(n,'a');assert.equal(n.calls,1);
 n.coords.width=500;reserveGeometryMargin(n,'a');assert.equal(n.coords.viewport.rightOffset,23);releaseGeometryMargin(n,'a');assert.equal(n.coords.viewport.rightOffset,23);releaseGeometryMargin(n,'b');assert.equal(n.coords.viewport.rightOffset,10);
});
test('right-margin lease follows callout eligibility and releases while a study remains visible',()=>{
 const n=native();syncGeometryMargin(n,'a',false);assert.equal(n.coords.viewport.rightOffset,10);assert.equal(n.calls,0);
 syncGeometryMargin(n,'a',true);assert.equal(n.coords.viewport.rightOffset,42);assert.equal(n.calls,1);
 syncGeometryMargin(n,'a',false);assert.equal(n.coords.viewport.rightOffset,10);assert.equal(n.calls,2);
});
test('historical panning and a larger user margin remain under user control',()=>{
 const n=native();n.coords.viewport.rightOffset=-50;reserveGeometryMargin(n,'a');assert.equal(n.calls,0);releaseGeometryMargin(n,'a');assert.equal(n.coords.viewport.rightOffset,-50);
 n.coords.viewport.rightOffset=80;reserveGeometryMargin(n,'b');assert.equal(n.calls,0);releaseGeometryMargin(n,'b');assert.equal(n.coords.viewport.rightOffset,80);
 reserveGeometryMargin(n,'c');n.coords.viewport.rightOffset=-30;releaseGeometryMargin(n,'c');assert.equal(n.coords.viewport.rightOffset,-30);
 n.coords.viewport.rightOffset=10;reserveGeometryMargin(n,'d');n.coords.viewport.rightOffset=20;reserveGeometryMargin(n,'d');assert.equal(n.coords.viewport.rightOffset,20);releaseGeometryMargin(n,'d');assert.equal(n.coords.viewport.rightOffset,20);
});
test('ABC status is always to the right of price, including narrow views; no space hides the callout',()=>{
 for(const width of [420,1000,1800]){const priceX=width-200,box=geometryCalloutLayout({width,height:700,priceX,priceY:400});assert.ok(box);assert.ok(box.left>priceX);assert.ok(box.left+box.width<=width-10);}
 assert.equal(geometryCalloutLayout({width:420,height:700,priceX:410,priceY:400}),null);assert.equal(geometryCalloutLayout({width:420,height:700,priceX:-10,priceY:400}),null);
});
test('ABC prices use the instrument tick precision',()=>{
 assert.equal(formatGeometryPrice(52035.085566,0.01),'52,035.09');
 assert.equal(formatGeometryPrice(51931.2,0.1),'51,931.2');
 assert.equal(formatGeometryPrice(0.000012347,0.00000001),'0.00001235');
 assert.equal(formatGeometryPrice(51931,1),'51,931');
});

test('ABC focus hides unrelated swing paths while preserving maps and evidence',()=>{const {sources,result}=fixture(),before=structuredClone(result);const d=geometryVolumeDrawing(result,{id:'focus',sources});assert.ok(!d.lines.some(l=>l.id.includes(':swing:')));assert.equal(d.geometryVolumeFocus.mappedFrames.length,5);assert.deepEqual(result,before);});

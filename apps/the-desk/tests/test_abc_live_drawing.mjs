import test from 'node:test';
import assert from 'node:assert/strict';
import {pineState} from '../web/pine-state.mjs';
import {abcLiveDrawing,marketGeometryDrawing} from '../web/abc-live-drawing.mjs';
const t=Date.UTC(2026,0,1),step=60000;
function model({phase=1,a=NaN,b=NaN,c=NaN,...inputs}={}){
 const values={'ABC audit · phase':phase,'ABC drawing · hosted':1,'ABC drawing · origin':110,'ABC drawing · origin time':t,'ABC drawing · armed time':t+step,'ABC audit · A':a,'ABC audit · B':b,'ABC audit · C':c,'ABC drawing · A time':Number.isFinite(a)?t+step:NaN,'ABC drawing · B time':Number.isFinite(b)?t+3*step:NaN,'ABC drawing · C time':Number.isFinite(c)?t+5*step:NaN,'Provisional C level':95};
 return {series:Object.entries(values).map(([title,value])=>({title,points:[{time:t+6*step,value}]})),lines:[],labels:[],inputValues:{reversalSide:'Long from support',showPath:true,showProjection:true,...inputs}};
}
const bars=[110,100,103,106,101,97,99].map((price,i)=>({time:t+i*step,open:price,close:price,high:price+.5,low:price-.5}));
for(const [leg,state] of [['A',{}],['B',{a:99.5}],['C',{phase:2,a:99.5,b:106.5}]])test(`${leg}: observed path is solid and forecast is yellow dashed`,()=>{
 const raw=model(state),before=structuredClone(raw),drawn=abcLiveDrawing(raw,bars);
 assert.deepEqual(raw,before);assert.ok(drawn.lines.some(l=>l.id.endsWith(`developing-${leg}`)&&l.style==='solid'&&l.width===2));
 assert.ok(drawn.lines.some(l=>l.id.endsWith(':forecast')&&l.style==='dashed'&&l.color==='#FFD94A'&&l.x1<l.x2));
 if(leg!=='A')assert.ok(drawn.lines.some(l=>l.id.endsWith(':A')&&l.style==='solid'));
 assert.ok(drawn.labels.some(l=>l.text===`${leg} · forming`));
});
test('B and C observed extremes follow ticks without moving confirmed A/B or audit series',()=>{
 for(const state of [{a:99.5},{phase:2,a:99.5,b:106.5}]){
  const raw=model(state),before=abcLiveDrawing(raw,bars),updated=bars.map((bar,i)=>i===6?{...bar,high:112,low:90}:bar),after=abcLiveDrawing(raw,updated);
  const key=state.b?'developing-C':'developing-B',get=(m,suffix)=>m.lines.find(l=>l.id.endsWith(suffix));
  assert.notEqual(get(before,key).y2,get(after,key).y2);assert.deepEqual(get(before,':A'),get(after,':A'));assert.deepEqual(before.series,after.series);
  if(state.b)assert.deepEqual(get(before,':B'),get(after,':B'));
 }
});
test('toggles, inactive phases and unhosted scripts do not invent paths',()=>{
 const hidden=abcLiveDrawing(model({showPath:false,showProjection:false}),bars);assert.equal(hidden.lines.length,0);assert.equal(hidden.labels.length,0);
 for(const phase of [0,5]){const raw=model({phase});assert.equal(abcLiveDrawing(raw,bars),raw);}
 const raw=model();raw.series=raw.series.filter(s=>s.title!=='ABC drawing · hosted');assert.equal(abcLiveDrawing(raw,bars),raw);
});
test('confirmed C remains solid, projections remain dashed and short side mirrors long',()=>{
 const raw=model({phase:3,a:99.5,b:106.5,c:96.5}),drawn=abcLiveDrawing(raw,bars);assert.equal(drawn.lines.find(l=>l.id.endsWith(':C')).style,'solid');assert.ok(!drawn.lines.some(l=>l.id.endsWith(':forecast')));
 const short=model({reversalSide:'Short from resistance'}),drawShort=abcLiveDrawing(short,bars);assert.equal(drawShort.lines.find(l=>l.id.endsWith('developing-A')).color,'#F23645');
});
test('geometry retains audited endpoints and adds only faint dashed active extensions',()=>{
 const raw={inputValues:{},lines:[{id:'up',x1:t,y1:100,x2:t+step,y2:102,style:'solid'},{id:'down',x1:t,y1:100,x2:t+step,y2:98,style:'solid'},{id:'ended',x1:t,y1:100,x2:t+step,y2:99,style:'dashed'}]};
 const before=structuredClone(raw),drawn=marketGeometryDrawing(raw,'1');assert.deepEqual(raw,before);assert.equal(drawn.lines.length,5);
 for(let i=0;i<3;i++)for(const key of ['x1','x2','y1','y2'])assert.equal(drawn.lines[i][key],raw.lines[i][key]);
 assert.equal(drawn.lines[0].color,'#F23645');assert.equal(drawn.lines[1].color,'#00B8A9');
 assert.ok(drawn.lines.slice(3).every(l=>l.style==='dashed'&&l.color.endsWith('55')));assert.ok(!drawn.lines.some(l=>l.id==='ended:projection'));
});

test('workspace serialization can persist the upgraded executed source with existing state',()=>{
 const handle={id:'abc',title:'ABC',source:'old source',visible:false,inputValues:()=>({pivotBars:3,longColor:'#123456'}),propValues:()=>({precision:2})};
 const saved=pineState({indicators:()=>[handle]},h=>h.title,()=> 'upgraded source');
 assert.equal(saved[0].script,'upgraded source');assert.equal(saved[0].hidden,true);assert.deepEqual(saved[0].inputs,handle.inputValues());assert.deepEqual(saved[0].props,handle.propValues());
});

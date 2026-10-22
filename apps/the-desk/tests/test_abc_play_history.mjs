import test from 'node:test';
import assert from 'node:assert/strict';
import {abcPlayDrawing,deriveABCPlays} from '../web/abc-play-history.mjs';
const time=Date.UTC(2026,9,21),step=60000;
function fixture({short=false,target=115,prices=[105,101,99,106,98,108,109,106,110,111,110,112,116,115],passed=true,inputs={}}={}){
 const mirror=p=>short?200-p:p;
 const bars=prices.map((p,i)=>({time:time+i*step,open:mirror(p),close:mirror(p),high:mirror(short?p-.4:p+.4),low:mirror(short?p+.4:p-.4)}));
 bars[1].low=short?98.6:99.9;bars[1].high=short?100.1:101.4;
 const make=(title,fn)=>({title,points:bars.map((b,i)=>({time:b.time,value:typeof fn==='function'?fn(i):fn}))});
 const model={inputValues:{reversalSide:short?'Short from resistance':'Long from support',showPath:true,showProjection:true,showPlayBand:true,keepHistory:true,historyCounts:3,pivotBars:1,breakBufferTicks:0,...inputs},lines:[{id:'old-white-band-line'}],labels:[],boxes:[{id:'old-white-band'}],series:[
  make('ABC drawing · hosted',1),make('ABC drawing · tick',.1),make('ABC audit · phase',i=>i===0?0:i<3?1:i===3?2:i===4?3:i===5?4:5),
  make('ABC audit · contact',i=>i===1?1:0),make('ABC audit · shift',i=>i===5?1:0),make('ABC audit · retest passed',i=>i===6&&passed?1:0),
  make('Selected / armed HTF level',mirror(100)),make('ABC drawing · armed time',i=>i?time+step:NaN),make('ABC drawing · origin',mirror(105)),make('ABC drawing · origin time',time),
  ...[['A',99,2],['B',106,3],['C',98,4]].flatMap(([name,p,at])=>[make('ABC audit · '+name,i=>i>=at?mirror(p):NaN),make('ABC drawing · '+name+' time',i=>i>=at?time+at*step:NaN)])]};
 const feed={connected:true,model:{series:[make('Rider HTF support',short?mirror(target):100),make('Rider HTF resistance',short?100:target)]}};
 return {model,bars,options:{feed,timeframe:'1',now:time+bars.length*step,tick:.1}};
}
const slice=(f,n)=>({...f,bars:f.bars.slice(0,n),model:{...f.model,series:f.model.series.map(s=>({...s,points:s.points.slice(0,n)}))},options:{...f.options,now:time+n*step}});
for(const short of [false,true])test(`${short?'short':'long'}: glow persists through B break and qualified retest, then next liquidity freezes dashed history`,()=>{
 const f=fixture({short}),before=structuredClone(f.model),live=slice(f,9);
 const active=abcPlayDrawing(live.model,live.bars,live.options);
 assert.equal(active.abcPlays.at(-1).status,'in-play');assert.equal(active.abcPlays.at(-1).qualifiedAt,time+6*step);
 assert.equal(active.lines.filter(l=>l.id.includes(':glow-')).length,2);assert.ok(active.lines.some(l=>l.id.endsWith(':in-play')&&l.style==='dashed'&&l.color==='#FFD94A'));
 assert.ok(active.lines.some(l=>l.id.endsWith(':A')&&l.style==='solid'),'active A stays solid');assert.ok(active.labels.some(l=>l.text==='START'));assert.ok(!active.labels.some(l=>l.text==='END'));assert.equal(active.boxes.length,1);assert.ok(active.boxes[0].id.endsWith(':highlight'));
 const ended=abcPlayDrawing(f.model,f.bars,f.options),play=ended.abcPlays.at(-1);
 assert.equal(play.status,'complete');assert.equal(play.end.reason,'Next liquidity level');assert.equal(play.end.time,time+13*step);assert.equal(play.end.price,short?85:115);
 assert.ok(ended.labels.some(l=>l.text==='START'));assert.ok(ended.labels.some(l=>l.text==='END'&&l.tooltip.includes('Next liquidity level')));
 assert.ok(ended.lines.some(l=>l.id.endsWith(':start-tick')));assert.ok(ended.lines.some(l=>l.id.endsWith(':end-tick')));
 assert.ok(ended.lines.every(l=>l.style==='dashed'&&l.color!=='#FFD94A'));assert.ok(ended.lines.some(l=>l.id.endsWith(':A')&&l.color.endsWith('AA')));
 assert.deepEqual(f.model,before,'rendering must not alter Pine model or audit series');
});
test('a confirmed later HL break ends the move; a B break and a wick alone do not',()=>{
 const f=fixture({target:130,prices:[105,101,99,106,98,108,109,106,110,104,108]});
 const plays=deriveABCPlays(f.model,f.bars,f.options);assert.equal(plays.at(-1).end.reason,'Confirmed structure break');assert.equal(plays.at(-1).end.time,time+9*step);
 const wick=fixture({target:130,prices:[105,101,99,106,98,108,109,106,110,108]});wick.bars[9].low=104;
 assert.equal(deriveABCPlays(wick.model,wick.bars,wick.options).at(-1).end,null);
});
test('forming bars cannot end a play or alter completed history',()=>{
 const f=fixture({target:130,prices:[105,101,99,106,98,108,109,106,110,104]});
 const pending={...f.options,now:time+9*step+30000},play=deriveABCPlays(f.model,f.bars,pending).at(-1);assert.equal(play.end,null);
 assert.equal(deriveABCPlays(f.model,f.bars,f.options).at(-1).end.reason,'Confirmed structure break');
});
test('C close invalidation, pending expiry and post-qualification timeout have explicit endpoints',()=>{
 const lost=fixture({target:130,prices:[105,101,99,106,98,108,109,97]});assert.equal(deriveABCPlays(lost.model,lost.bars,lost.options).at(-1).end.reason,'C invalidated · confirmed close');
 const pending=fixture({passed:false,target:130});assert.equal(deriveABCPlays(pending.model,pending.bars,pending.options).at(-1).end.reason,'Setup expired');
 const expired=fixture({target:130,prices:[105,101,99,106,98,108,...Array(30).fill(109)],inputs:{campaignBars:20}});assert.equal(deriveABCPlays(expired.model,expired.bars,expired.options).at(-1).end.reason,'Tracking expired');
});
test('ending at a different line can hand off to a new confirmed campaign on the same candle',()=>{
 const f=fixture({target:130});f.bars[4]={...f.bars[4],open:97,close:96,low:94,high:98};
 for(const s of f.model.series)for(let i=4;i<s.points.length;i++){
  if(s.title==='ABC audit · contact')s.points[i].value=i===4?1:0;
  if(s.title==='ABC drawing · armed time')s.points[i].value=time+4*step;
  if(s.title==='Selected / armed HTF level')s.points[i].value=95;
  if(s.title==='ABC audit · phase')s.points[i].value=1;
  if(/ABC audit · [ABC]$|ABC drawing · [ABC] time/.test(s.title))s.points[i].value=NaN;
  if(s.title==='ABC audit · retest passed')s.points[i].value=0;
 }
 f.options.feed.model.series.push({title:'Reached support · this chart bar',points:[{time:time+4*step,value:95}]});
 const plays=deriveABCPlays(f.model,f.bars,f.options);assert.equal(plays.length,2);assert.equal(plays[0].end.time,time+4*step);assert.equal(plays[1].start.time,time+4*step);assert.equal(plays[1].level,95);assert.equal(plays[1].end,null);
});
test('missing/stale authority clears glow; history toggle hides completed plays; unchanged archives never move',()=>{
 const f=fixture(),done=abcPlayDrawing(f.model,f.bars,f.options);
 const missing=abcPlayDrawing(f.model,f.bars,{...f.options,feed:{connected:false}});assert.equal(missing.lines.length,0);assert.equal(missing.abcPlays.length,0);
 const hidden=abcPlayDrawing({...f.model,inputValues:{...f.model.inputValues,keepHistory:false}},f.bars,f.options);assert.equal(hidden.abcPlays.length,0);assert.equal(hidden.lines.length,0);
 const future=fixture({prices:[105,101,99,106,98,108,109,106,110,111,110,112,116,115,180,50]});const later=abcPlayDrawing(future.model,future.bars,future.options);
 assert.deepEqual(later.lines,done.lines);assert.deepEqual(later.labels,done.labels);
});
test('ambiguous multi-level candles record no invented first-touch ordering',()=>{
 const f=fixture({target:115});f.bars[12].low=114.5;f.options.feed.model.series.push({title:'C resistance 2',points:f.bars.map(b=>({time:b.time,value:115.5}))});
 const play=deriveABCPlays(f.model,f.bars,f.options).at(-1);assert.equal(play.end.reason,'Multiple liquidity levels · order unknown');assert.equal(play.end.price,f.bars[12].close);
});

test('5m play endpoints and marker lengths use the chart interval without shifting event timestamps',()=>{
 const f=fixture(),scale=t=>time+(t-time)*5;
 f.bars=f.bars.map(b=>({...b,time:scale(b.time)}));
 f.model.series=f.model.series.map(s=>({...s,points:s.points.map(p=>({...p,time:scale(p.time),value:/ time$/.test(s.title)&&Number.isFinite(p.value)?scale(p.value):p.value}))}));
 f.options.feed.model.series=f.options.feed.model.series.map(s=>({...s,points:s.points.map(p=>({...p,time:scale(p.time)}))}));
 f.options={...f.options,timeframe:'5',now:time+f.bars.length*step*5};
 const drawn=abcPlayDrawing(f.model,f.bars,f.options),play=drawn.abcPlays.at(-1),tick=drawn.lines.find(l=>l.id.endsWith(':end-tick'));
 assert.equal(play.start.time,time+5*step);assert.equal(play.end.time,time+65*step);assert.equal(tick.x2-tick.x1,10*step);
});
test('only the configured number of finished plays survives; the current play is retained separately',()=>{
 const f=fixture({target:130,prices:Array(28).fill(105),inputs:{historyCounts:2}});
 f.model.series.find(s=>s.title==='ABC audit · retest passed').points.forEach(p=>p.value=0);
 for(let i=0;i<f.bars.length;i++){
  const cycle=Math.floor(i/6),at=i%6;
  for(const s of f.model.series){
   if(s.title==='ABC audit · contact')s.points[i].value=at===1?1:0;
   if(s.title==='ABC audit · phase')s.points[i].value=at===0?0:at===4||at===5?5:1;
   if(s.title==='ABC drawing · armed time')s.points[i].value=time+(cycle*6+1)*step;
  }
 }
 const plays=deriveABCPlays(f.model,f.bars,f.options);assert.equal(plays.length,3);assert.equal(plays[0].start.time,time+13*step);assert.equal(plays[1].start.time,time+19*step);assert.equal(plays[2].start.time,time+25*step);assert.equal(plays[2].end,null);
});

test('completed summary uses frozen ABC anchors and end reason rather than later setup values',()=>{
 const f=fixture();f.model.tables=[{cells:Array.from({length:6},()=>[{text:'FUTURE 999'},{text:'FUTURE 999'}])}];
 const drawn=abcPlayDrawing(f.model,f.bars,f.options),cells=drawn.tables[0].cells;
 assert.match(cells[1][1].text,/PLAY OVER/);assert.equal(cells[2][1].text,'100');assert.equal(cells[3][1].text,'99 / 106');assert.equal(cells[4][1].text,'98');assert.equal(cells[5][1].text,'Next liquidity level');assert.equal(f.model.tables[0].cells[3][1].text,'FUTURE 999');
});


test('touched price stays explicit after consumption, with only an observed pre-contact lead-in',()=>{
 const f=fixture(),live=slice(f,9),m=abcPlayDrawing(live.model,live.bars,live.options);
 const play=m.abcPlays[0],lead=m.lines.find(l=>l.id.endsWith(':level-before-contact'));
 assert.equal(play.levelKnownAt,time);assert.equal(lead.x1,time);assert.equal(lead.x2,play.start.time);assert.equal(lead.y1,100);assert.equal(lead.style,'dashed');
 assert.ok(m.labels.some(l=>l.text==='TOUCHED 100 · IN PLAY'));
 const consumed=abcPlayDrawing(f.model,f.bars,f.options);assert.ok(consumed.labels.some(l=>l.text==='TOUCHED 100 · OVER'));
 assert.equal(consumed.lines.find(l=>l.id.endsWith(':retired-level')).y1,100);
});

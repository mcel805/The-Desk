import test from 'node:test';
import assert from 'node:assert/strict';
import {swingChannels,channelState,channelRails,geometryVolumeContext,selectChannels} from './web/market-geometry.mjs';
import {DEFAULTS,analyze,render,FRAMES} from './web/wave-court-port.mjs';
const ms=60000;
const fixture=(n=140)=>Array.from({length:n},(_,i)=>{const price=100+i*.08+(i%20<=10?i%20:20-i%20)*.5;return {time:i*ms,open:price,close:price,high:price+.2,low:price-.2,volume:100};});
const flat={t0:0,t1:ms,p0:100,p1:100,t3:ms/2,p3:110,side:-1,offset:10,confirmedAt:3*ms};
const bar=(i,low,high,close)=>({time:i*ms,open:close,low,high,close,volume:100});

test('all three anchors are confirmed, significant wick swings; point 3 is widest',()=>{
 const bars=fixture(),gs=swingChannels(bars,DEFAULTS);assert(gs.length>0);
 for(const g of gs){
  assert.equal(g.anchors.length,3);assert(g.t0<g.t3&&g.t3<g.t1);
  for(const a of g.anchors){assert.equal(a.price,bars[a.index][a.side===1?'high':'low']);assert.equal(a.confirmedAt,bars[a.index+DEFAULTS.geometryPivot].time);assert.equal(a.confirmedCloseAt,a.confirmedAt+ms);assert(a.reactionATR>=DEFAULTS.geometryMinReactionATR);}
  assert.equal(channelRails(g,g.t3).autoline,g.p3);
  for(const b of bars.filter(x=>x.time>=g.t0&&x.time<=g.t1)){const r=channelRails(g,b.time);assert(b.high<=r.upper+DEFAULTS.geometryTolerance*DEFAULTS.tick+1e-8&&b.low>=r.lower-DEFAULTS.geometryTolerance*DEFAULTS.tick-1e-8);}
 }
});
test('a channel cannot appear before the confirmation close; future bars never refit its anchors',()=>{
 const bars=fixture(),full=swingChannels(bars,DEFAULTS);
 for(const g of full){const before=bars.filter(b=>b.time<g.confirmedAt),at=bars.filter(b=>b.time<=g.confirmedAt);assert(!swingChannels(before,DEFAULTS).some(x=>x.id===g.id));const first=swingChannels(at,DEFAULTS).find(x=>x.id===g.id);assert(first);assert.equal(first.offset,g.offset);assert.deepEqual(first.anchors,g.anchors);}
});
test('gaps cannot support a baseline or consecutive break confirmation',()=>{
 const bars=fixture().filter((_,i)=>i!==65);for(const g of swingChannels(bars,DEFAULTS)){const between=bars.filter(b=>b.time>=g.t0&&b.time<=g.t1);assert(between.every((b,i)=>!i||b.time-between[i-1].time===ms));}
 const s=channelState(flat,[bar(4,105,112,111),bar(6,105,113,112)],ms,DEFAULTS);assert.equal(s.broken,false);
});
test('wick throw-over remains active; two outside closes break and later retest is distinct',()=>{
 const wick=bar(4,108,112,109),one=bar(5,109,112,111),two=bar(6,110,113,112),retest=bar(7,109.8,112,111);
 assert.equal(channelState(flat,[wick],ms,DEFAULTS).breakState,'WICK_ONLY');assert.equal(channelState(flat,[wick],ms,DEFAULTS).broken,false);
 assert.equal(channelState(flat,[wick,one],ms,DEFAULTS).broken,false);
 const accepted=channelState(flat,[wick,one,two],ms,DEFAULTS);assert.equal(accepted.confirmedBreakAt,two.time);assert.equal(accepted.firstBreakAt,one.time);assert.equal(accepted.breakState,'CLOSE_BREAK_UP');
 assert.equal(channelState(flat,[wick,one,two,retest],ms,DEFAULTS).breakState,'RETEST_HELD_UP');
});
test('volume stall requires measured effort and actual location; missing volume remains unknown',()=>{
 const bars=Array.from({length:25},(_,i)=>bar(i,105.5,109.5,107));bars[24]={...bar(24,109,110,109.2),volume:300};
 const c=geometryVolumeContext(flat,bars,ms,DEFAULTS);assert.equal(c.latest.volumeRatio,3);assert.equal(c.latest.densityRatio,12);assert.equal(c.reaction,'UPPER_STALL_CANDIDATE');assert.equal(c.followThrough,'PENDING');
 bars[24]={...bar(24,106,107,106.2),volume:300};assert.equal(geometryVolumeContext(flat,bars,ms,DEFAULTS).reaction,'NO_EDGE_REACTION');
 bars[24].volume=null;assert.equal(geometryVolumeContext(flat,bars,ms,DEFAULTS).status,'unavailable');
});
test('native baseline control points are the exact observed wicks, separate from extension',()=>{
 const bars=fixture(),read=analyze(FRAMES.map(timeframe=>({timeframe,bars:timeframe==='1m'?bars:[]})),'1m'),drawings=[];
 render(read,(type,config)=>drawings.push({type,config}));
 const baselines=drawings.filter(x=>x.type==='trendline'&&x.config.style.lineColor==='#988ad8'&&x.config.style.lineStyle==='solid');assert(baselines.length>0);
 for(const d of baselines){assert(read.channels.some(g=>d.config.anchors[0].time===g.t0&&d.config.anchors[0].price===g.p0&&d.config.anchors[1].time===g.t1&&d.config.anchors[1].price===g.p1));}
});

test('missing candles cannot confirm follow-through from a line contact',()=>{
 const bars=Array.from({length:25},(_,i)=>bar(i,105.5,109.5,107));bars[24]=bar(24,109,110,109.2);
 bars.push(bar(26,106,108,107),bar(27,105.5,108,107));
 const v=geometryVolumeContext(flat,bars,ms,DEFAULTS);assert.equal(v.status,'gapped');assert.equal(v.followThrough,'UNAVAILABLE_GAP');
});

test('midpoint contact preserves the preceding rail rejection and continued touches are not a retest',()=>{
 const bars=Array.from({length:25},(_,i)=>bar(i,105.5,109.5,107));bars[24]={...bar(24,109,110,109.2),volume:300};
 bars.push({...bar(25,109,109.99,109.2),volume:100});assert.equal(geometryVolumeContext(flat,bars,ms,DEFAULTS).lighterRetest,false);
 bars.push(bar(26,104.5,106,105.5));const v=geometryVolumeContext(flat,bars,ms,DEFAULTS);assert.equal(v.reaction,'UPPER_PRICE_REJECTION');assert.equal(v.followThrough,'PENDING');
 bars.push(bar(27,104,106,105));assert.equal(geometryVolumeContext(flat,bars,ms,DEFAULTS).followThrough,'CONFIRMED_AWAY_DOWN');
});


test('far-left anchors survive more than four later same-side swings and 600 history bars',()=>{
 const bars=fixture(900),gs=swingChannels(bars,DEFAULTS);
 const spanning=gs.filter(g=>g.t0<bars.at(-600).time&&g.t1-g.t0>600*ms);assert(spanning.length>0);
 for(const g of spanning){for(const a of g.anchors)assert.equal(a.price,bars[a.index][a.side===1?'high':'low']);}
});
test('visible-history parent cannot be displaced by a recent short channel',()=>{
 const bars=fixture(900),g=(id,start,end,broken=false)=>({...flat,id,t0:start*ms,t1:end*ms,t3:(start+10)*ms,p0:100,p1:110,offset:20,touches:0,anchorReactionATR:1,broken,confirmedBreakAt:broken?(end+6)*ms:null});
 const full=g('full',20,800),parent=g('visible-parent',500,820),local=g('local',825,860),old=g('old-history',30,700,true),recent=g('recent-break',850,880,true),options={...DEFAULTS,geometryVisibleFrom:480*ms,geometryVisibleTo:900*ms};
 const selected=selectChannels([local,full,parent,recent,old],bars,options);
 assert.deepEqual(selected.map(x=>x.id),['visible-parent','local','old-history','recent-break']);
 assert.equal(selectChannels([local,full,parent],bars,DEFAULTS)[0].id,'full');
});
test('broad and short baselines may share their second swing without hiding the parent',()=>{
 const bars=fixture(900),g=(id,start)=>({...flat,id,t0:start*ms,t1:860*ms,t3:(start+5)*ms,p0:100,p1:110,offset:20,touches:1,anchorReactionATR:1,broken:false});
 assert.deepEqual(selectChannels([g('local',830),g('parent',20)],bars,DEFAULTS).map(x=>x.id),['parent','local']);
});

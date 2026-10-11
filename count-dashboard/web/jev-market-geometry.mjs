/** Source-bound evidence for confirmed swing channels and volume reactions. */
import {FRAMES,FRAME_MS,channels,structure,DEFAULTS} from './wave-court-port.mjs?v=left-swing-geometry-1';
import {channelRails,channelState,selectChannels,geometryVolumeContext} from './market-geometry.mjs';
export const GEOMETRY_RECENT_BARS=28;
// One shared history contract for chart reads and the background Rider.
export function geometryTape(bars){return bars.slice(-GEOMETRY_RECENT_BARS);}
export const GEOMETRY_METHOD='wave-court.geometry-evidence.v2';
const rounded=v=>Number.isFinite(v)?Number(v.toFixed(6)):null;
export function channelEvidence(g,bars,ms,o,atr){
 const last=bars.at(-1);if(!last||!g.anchors||g.confirmedAt>last.time)return null;
 const state=channelState(g,bars,ms,o),r=channelRails(g,last.time),slope=(g.p1-g.p0)*ms/(g.t1-g.t0);
 return {id:g.id,status:state.broken?'BROKEN':'ACTIVE',direction:slope>o.tick*.0001?'UP':slope<-o.tick*.0001?'DOWN':'FLAT',
  anchorTimes:[g.t0,g.t1],anchorPrices:[g.p0,g.p1],anchors:g.anchors.map((a,i)=>({role:i+1,time:a.time,price:a.price,side:a.side,confirmedAt:a.confirmedAt,confirmedCloseAt:a.confirmedCloseAt,reactionATR:rounded(a.reactionATR),bar:a.bar})),
  confirmedAt:g.confirmedAt,tradableAfter:g.tradableAfter,lastSafeAt:state.lastSafeAt,wickContacts:3+state.touches,
  slopePerBar:rounded(slope),slopeATR:rounded(atr>0?slope/atr:null),width:rounded(g.offset),lower:rounded(r.lower),upper:rounded(r.upper),median:rounded(r.median),
  position:rounded((last.close-r.lower)/g.offset),interaction:state.interaction,breakState:state.breakState,breakDirection:state.breakDirection,
  firstWickBreachAt:state.firstWickBreachAt,firstBreakAt:state.firstBreakAt,confirmedBreakAt:state.confirmedBreakAt,retestAt:state.retestAt,
  breakAgeBars:state.firstBreakAt!=null?Math.round((last.time-state.firstBreakAt)/ms):null,referenceOnlyAfterBreak:state.broken,
  volumeContext:geometryVolumeContext({...g,...state},bars,ms,o)};
}
export function marketGeometryEvidence(read,source){
 const o={...DEFAULTS,...read.settings},one=read.frames.find(f=>f.timeframe==='1m'),last=one?.barData.at(-1);
 if(!last)return null;
 const frames=FRAMES.map((tf,i)=>{const f=read.frames.find(x=>x.timeframe===tf),bars=f?.barData||[],b=bars.at(-1);
  if(!b)return {timeframe:tf,status:'unavailable',weight:o.weights[i],cutoff:null,channels:[]};
  const candidates=tf===read.chartTimeframe&&read.channels?read.channels:channels(bars,o);
  const gs=candidates.map(g=>channelEvidence(g,bars,FRAME_MS[i],o,f.atr)).filter(Boolean);
  const active=gs.filter(g=>g.status==='ACTIVE'),recent=gs.filter(g=>g.status==='BROKEN'&&g.breakAgeBars<=8);
  const selectedIds=new Set(selectChannels(candidates,bars,{...o,geometryActiveShown:2,geometryShown:4,...(tf===read.chartTimeframe&&read.geometryView?{geometryVisibleFrom:read.geometryView.from,geometryVisibleTo:read.geometryView.to}:{})}).map(g=>g.id));
  const selected=gs.filter(g=>selectedIds.has(g.id)&&(g.status==='ACTIVE'||g.breakAgeBars<=8));
  return {timeframe:tf,status:'available',cutoff:b.time,closeTime:b.time+FRAME_MS[i],weight:o.weights[i],atr:rounded(f.atr),lastBar:{time:b.time,open:b.open,high:b.high,low:b.low,close:b.close},recentBars:geometryTape(bars).map(x=>({time:x.time,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume??null})),
   cadenceGaps:bars.slice(-600).reduce((n,x,j,a)=>n+(j>0&&x.time-a[j-1].time!==FRAME_MS[i]?1:0),0),
   activeCount:active.length,recentBreakCount:recent.length,historicalBrokenCount:gs.length-active.length,
   directionCounts:{UP:active.filter(g=>g.direction==='UP').length,DOWN:active.filter(g=>g.direction==='DOWN').length,FLAT:active.filter(g=>g.direction==='FLAT').length},
   channels:selected,detailCoverage:'Broadest established channel from visible swing history plus the recent leg; full-frame parent used when view context is absent. Up to two recent accepted breaks. Frozen three-wick anchors; median is derived.'};
 });
 const micro=structure(one.barData,o).filter(p=>!p.broken).sort((a,b)=>Math.abs(a.price-last.close)-Math.abs(b.price-last.close)).slice(0,6).map(p=>({price:p.price,side:p.side,score:rounded(p.score),retests:p.retests,reactionATR:rounded(p.reaction),anchorTime:p.time,confirmedAt:one.barData[p.confirmedIndex]?.time}));
 const zones=[...(read.zones||[])].sort((a,b)=>Math.abs((a.lo+a.hi)/2-last.close)-Math.abs((b.lo+b.hi)/2-last.close)).slice(0,6).map(z=>({lo:z.lo,hi:z.hi,side:z.side,timeframes:z.ids.map(i=>FRAMES[i]),weight:z.weight,strength:rounded(z.strength),born:z.born}));
 const core=read.frames[o.core],c=core?.degrees[0]?.candidate,points=c?.points||[],a=points.at(-2),b=points.at(-1);
 let fibs=null;
 if(a&&b){const move=b.price-a.price;fibs={timeframe:FRAMES[o.core],confirmedAt:(b.born??b.time)+FRAME_MS[o.core],anchorTimes:[a.time,b.time],anchorPrices:[a.price,b.price],conditional:true,measurement:'Core timeframe confirmed-pivot swing; indicator Fib status replayed from anchor against completed 1M history, not proof of earlier tradability.',levels:[0,.382,.5,.618,.786,1,2].map(ratio=>{const price=ratio===2?a.price+move*2:b.price-move*ratio;let status=one.barData[0].time>b.time?'unverified':'open';for(const bar of one.barData.filter(x=>x.time>b.time)){if(ratio===2?(move>0?bar.close>price:bar.close<price):(move>0?bar.close<price:bar.close>price))status='broken';else if(status==='open'&&bar.low<=price&&bar.high>=price)status='tested';}return {ratio,price:rounded(price),status};})};}
 return {method:GEOMETRY_METHOD,source:{provider:source.id,symbol:source.market,completedCutoff:last.time},
  semantics:'Completed frame bars only. Points 1/2 are confirmed same-side swings and point 3 is the widest confirmed opposite swing. Anchors freeze when known. Median is derived, not a swing. ACTIVE allows wick throw-overs; two consecutive outside closes retire the channel. Broken rails remain references. Volume supports observed reactions, never authorizes orders. Weights are user settings, not probabilities.',
  params:{tick:o.tick,wickToleranceTicks:o.geometryTolerance,pivotRadius:o.geometryPivot,minSpan:o.geometryMinSpan,extraWickContacts:o.geometryExtraTouches,minReactionATR:o.geometryMinReactionATR,breakConfirmationCloses:2},
  frames,microStructure:micro,convergence:zones,fibonacci:fibs};
}

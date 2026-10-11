/** Three-point swing geometry. Completed OHLC only; no fit or movable anchors. */
export const GEOMETRY_VERSION='swing-channel.v2.1';
export const GEOMETRY_DEFAULTS={geometryMinReactionATR:.75,geometryAnchors:true,geometryMedian:true};
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const finite=Number.isFinite;
export function frameDuration(bars){return bars.slice(1).reduce((n,b,i)=>Math.min(n,b.time-bars[i].time),Infinity);}
function atrs(bars){let value=0;return bars.map((b,i)=>{const tr=Math.max(b.high-b.low,Math.abs(b.high-(bars[i-1]?.close??b.close)),Math.abs(b.low-(bars[i-1]?.close??b.close)));if(i<14){value+=tr;return i===13?value/=14:NaN;}return value=(value*13+tr)/14;});}
function contiguous(bars,ms){return bars.every((b,i)=>!i||b.time-bars[i-1].time===ms);}

/** Each point becomes usable only after its right-hand confirmation has closed. */
export function geometrySwings(bars,options={},ms=frameDuration(bars)){
 const o={...GEOMETRY_DEFAULTS,...options},r=Math.max(1,Math.min(24,Math.floor(o.geometryPivot||4))),atr=atrs(bars),points=[];
 for(let i=r;i+r<bars.length;i++){
  const b=bars[i],window=bars.slice(i-r,i+r+1);if(!finite(atr[i])||!contiguous(window,ms))continue;
  const peers=window.filter((_,j)=>j!==r),hi=peers.every(x=>x.high<b.high||x.high===b.high&&x.time<b.time),lo=peers.every(x=>x.low>b.low||x.low===b.low&&x.time<b.time);
  if(hi===lo)continue; // An outside bar identifying both extremes is ambiguous.
  const side=hi?1:-1,price=hi?b.high:b.low,right=bars.slice(i+1,i+r+1);
  const reaction=hi?price-Math.min(...right.map(x=>x.low)):Math.max(...right.map(x=>x.high))-price;
  if(reaction<atr[i]*o.geometryMinReactionATR)continue;
  points.push({time:b.time,price,side,index:i,confirmedIndex:i+r,confirmedAt:bars[i+r].time,confirmedCloseAt:bars[i+r].time+ms,reactionATR:reaction/atr[i],bar:{time:b.time,open:b.open,high:b.high,low:b.low,close:b.close}});
 }
 return points;
}
export function channelRails(g,time){const baseline=g.p0+(g.p1-g.p0)*(time-g.t0)/(g.t1-g.t0),autoline=baseline+g.side*-g.offset;return {baseline,autoline,median:(baseline+autoline)/2,lower:Math.min(baseline,autoline),upper:Math.max(baseline,autoline)};}

/** Distinguish an overthrow from acceptance; never re-fit after point 3 is fixed. */
export function channelState(g,bars,ms,options={}){
 const tick=options.tick||.01,eps=tick*.0001,tol=(options.geometryTolerance??2)*tick+eps;
 let run=0,runSide=null,runStart=null,previous=null,firstWickBreachAt=null,firstBreakAt=null,confirmedBreakAt=null,breakDirection=null,retestAt=null,lastSafeAt=g.confirmedAt,contacts=0,touching=false;
 for(const b of bars.filter(x=>x.time>g.confirmedAt)){
  const r=channelRails(g,b.time),above=b.close>r.upper+tol,below=b.close<r.lower-tol,d=above?'UP':below?'DOWN':null;
  const wickOutside=b.high>r.upper+tol||b.low<r.lower-tol;
  if(wickOutside&&firstWickBreachAt==null)firstWickBreachAt=b.time;
  const contact=b.low<=r.lower+tol&&b.high>=r.lower-tol||b.low<=r.upper+tol&&b.high>=r.upper-tol;
  if(confirmedBreakAt==null){
   if(contact&&(!touching||previous==null||b.time-previous!==ms))contacts++;
   if(!d)lastSafeAt=b.time;
   if(d&&d===runSide&&previous!=null&&b.time-previous===ms)run++;else{run=d?1:0;runStart=d?b.time:null;}
   runSide=d;
   if(run>=2){firstBreakAt=runStart;confirmedBreakAt=b.time;breakDirection=d;}
  }else if(b.time>confirmedBreakAt&&retestAt==null){
   const edge=breakDirection==='UP'?r.upper:r.lower;
   if(b.low<=edge+tol&&b.high>=edge-tol&&(breakDirection==='UP'?b.close>edge+tol:b.close<edge-tol))retestAt=b.time;
  }
  previous=b.time;touching=contact;
 }
 const last=bars.at(-1),r=channelRails(g,last?.time??g.t1),up=last?.close>r.upper+tol,down=last?.close<r.lower-tol;
 let breakState=firstWickBreachAt==null?'INTACT':'WICK_ONLY';
 if(confirmedBreakAt!=null)breakState=!up&&!down?'RETURNED_INSIDE':(up?'UP':'DOWN')!==breakDirection?'RETURNED_INSIDE':retestAt!=null?'RETEST_HELD_'+breakDirection:'CLOSE_BREAK_'+breakDirection;
 const lower=last&&last.low<=r.lower+tol&&last.high>=r.lower-tol,upper=last&&last.high>=r.upper-tol&&last.low<=r.upper+tol;
 const interaction=lower&&upper?'BOTH_EDGES':lower?(last.close>r.lower+tol?'LOWER_REJECTION':'LOWER_TOUCH'):upper?(last.close<r.upper-tol?'UPPER_REJECTION':'UPPER_TOUCH'):up?'CLOSE_ABOVE':down?'CLOSE_BELOW':'INSIDE';
 return {broken:confirmedBreakAt!=null,endAt:confirmedBreakAt??last?.time??g.t1,lastSafeAt,firstWickBreachAt,firstBreakAt,confirmedBreakAt,breakDirection,retestAt,breakState,interaction,touches:contacts};
}

export function swingChannels(input,options={}){
 const o={...GEOMETRY_DEFAULTS,...options},bars=input,ms=frameDuration(bars);if(bars.length<20||!finite(ms)||ms<=0)return [];
 const local=geometrySwings(bars,o,ms),established=[],out=[],atr=atrs(bars),tick=o.tick||.01,tol=(o.geometryTolerance??2)*tick+tick*.0001;
 for(const p of local){
  const last=established.at(-1);
  if(last?.side===p.side){if(p.side*p.price<=p.side*last.price)continue;established.pop();}
  const opposite=established.at(-1);
  if(opposite&&Math.abs(p.price-opposite.price)<Math.max(atr[p.index],tick)*o.geometryMinReactionATR)continue;
  // The intervening reversal must be established too; no arbitrary two local wiggles.
  const prior=established.filter(x=>x.side===p.side);
  for(const a of prior){
   if(p.index-a.index+1<(o.geometryMinSpan||8))continue;
   const between=bars.slice(a.index,p.index+1);if(!contiguous(between,ms))continue;
   const baseline=t=>a.price+(p.price-a.price)*(t-a.time)/(p.time-a.time);
   if(between.some(b=>p.side===-1?b.low<baseline(b.time)-tol:b.high>baseline(b.time)+tol))continue;
   const opposites=established.filter(x=>x.side===-p.side&&x.time>a.time&&x.time<p.time);
   const width=x=>p.side===-1?x.price-baseline(x.time):baseline(x.time)-x.price;
   const c=opposites.sort((x,y)=>width(y)-width(x)||y.time-x.time)[0];if(!c)continue;
   const offset=width(c);if(offset<=tick)continue;
   // Point 3 must actually be the widest wick, not a convenient smaller swing.
   if(between.some(b=>p.side===-1?b.high>baseline(b.time)+offset+tol:b.low<baseline(b.time)-offset-tol))continue;
   const anchors=[a,p,c].map(x=>({...x})),confirmedAt=Math.max(...anchors.map(x=>x.confirmedAt));
   const g={method:GEOMETRY_VERSION,id:[a.time,p.time,c.time,p.side,a.price,p.price,c.price].join(':'),t0:a.time,p0:a.price,t1:p.time,p1:p.price,t3:c.time,p3:c.price,side:p.side,offset,anchors,confirmedAt,tradableAfter:confirmedAt+ms,anchorReactionATR:Math.min(...anchors.map(x=>x.reactionATR))};
   Object.assign(g,channelState(g,bars,ms,o));if(g.touches<(o.geometryExtraTouches||0))continue;
   out.push(g);
  }
  established.push(p);
 }
 return out;
}

/** Shared structural-first selection. View context selects existing anchors; never refits them. */
export function selectChannels(channels,bars,options={}){
 const last=bars.at(-1);if(!last)return [];
 const ms=frameDuration(bars),activeLimit=Math.max(1,Math.min(4,options.geometryActiveShown??2)),totalLimit=Math.max(activeLimit,Math.min(8,options.geometryShown??4));
 const rank=g=>{const r=channelRails(g,last.time),distance=Math.max(0,r.lower-last.close,last.close-r.upper)/g.offset,age=(last.time-g.t1)/ms;return 12*Math.min(g.touches,4)+10*Math.min(g.anchorReactionATR,3)-Math.min(age,100)*.35-20*distance;};
 const span=g=>g.t1-g.t0,wide=(a,b)=>span(b)-span(a)||a.t0-b.t0||rank(b)-rank(a),recent=(a,b)=>b.t1-a.t1||b.t0-a.t0||rank(b)-rank(a);
 const active=channels.filter(g=>!g.broken),chosen=[];
 // The broad structure owns the first slot. A current local channel cannot evict it.
 const inView=active.filter(g=>(!finite(options.geometryVisibleFrom)||g.t0>=options.geometryVisibleFrom)&&(!finite(options.geometryVisibleTo)||g.t1<=options.geometryVisibleTo));
 const parent=[...(inView.length?inView:active)].sort(wide)[0];if(parent)chosen.push(parent);
 const distinct=g=>!chosen.some(x=>x.id===g.id||x.side===g.side&&x.t1===g.t1&&Math.min(span(x),span(g))>.65*Math.max(span(x),span(g)));
 for(const g of [...active].sort(recent)){if(chosen.length>=activeLimit)break;if(distinct(g))chosen.push(g);}
 if(options.broken!==false&&chosen.length<totalLimit){
  const ended=channels.filter(g=>g.broken),historical=[...ended].sort(wide)[0];
  if(historical&&distinct(historical))chosen.push(historical);
  for(const g of ended.sort((a,b)=>b.confirmedBreakAt-a.confirmedBreakAt||wide(a,b))){if(chosen.length>=totalLimit||chosen.filter(x=>x.broken).length>=2)break;if(distinct(g))chosen.push(g);}
 }
 return chosen;
}

/** Volume is supporting evidence at an observed geometric contact, never an entry. */
export function geometryVolumeContext(g,bars,ms,options={}){
 const recent=bars.slice(-8),tol=(options.geometryTolerance??2)*(options.tick||.01),rows=[];
 for(const b of recent){
  const index=bars.findIndex(x=>x.time===b.time),prior=bars.slice(Math.max(0,index-20),index),r=channelRails(g,b.time),range=b.high-b.low;
  const valid=prior.length===20&&prior.every(x=>finite(x.volume)&&x.volume>=0)&&contiguous([...prior,b],ms),volume=finite(b.volume)&&b.volume>=0?b.volume:null;
  const baseline=valid?mean(prior.map(x=>x.volume)):null,density=volume!=null&&range>0?volume/range:null,ds=prior.filter(x=>x.high>x.low).map(x=>x.volume/(x.high-x.low)),densityBaseline=valid&&ds.length===20?mean(ds):null,rangeBaseline=valid?mean(prior.map(x=>x.high-x.low)):null;
  const touches=edge=>b.low<=edge+tol&&b.high>=edge-tol,upper=touches(r.upper),lower=touches(r.lower),contact=upper&&lower?'BOTH':upper?'UPPER':lower?'LOWER':touches(r.median)?'MEDIAN':'NONE';
  const volumeRatio=volume!=null&&baseline>0?volume/baseline:null,densityRatio=density!=null&&densityBaseline>0?density/densityBaseline:null,rangeRatio=rangeBaseline>0?range/rangeBaseline:null,closeLocation=range>0?(b.close-b.low)/range:.5;
  const highEffortNarrowRange=volumeRatio!=null&&densityRatio!=null&&volumeRatio>=1.5&&densityRatio>=1.5&&rangeRatio<1;
  const rejection=upper&&b.close<r.upper-tol?'UPPER':lower&&b.close>r.lower+tol?'LOWER':null;
  rows.push({time:b.time,knownAt:b.time+ms,high:b.high,low:b.low,close:b.close,volume,volumeRatio,density,densityRatio,range,rangeRatio,closeLocation,contact,rejection,highEffortNarrowRange,lightParticipation:volumeRatio!=null&&volumeRatio<.8});
 }
 const latest=rows.at(-1),contacts=rows.filter(x=>x.time>=g.confirmedAt&&x.contact!=='NONE').slice(-4),lastContact=contacts.filter(x=>x.contact!=='MEDIAN').at(-1)??contacts.at(-1);
 let reaction='NO_EDGE_REACTION';
 if(lastContact){reaction=lastContact.highEffortNarrowRange&&lastContact.rejection?lastContact.rejection+'_STALL_CANDIDATE':lastContact.rejection?lastContact.rejection+'_PRICE_REJECTION':'UNRESOLVED_CONTACT';}
 if(g.broken)reaction=g.breakState;
 let followThrough='NONE',lighterRetest=false;
 if(lastContact){const after=rows.filter(x=>x.time>lastContact.time),upper=lastContact.rejection==='UPPER',lower=lastContact.rejection==='LOWER';
  followThrough=!contiguous([lastContact,...after],ms)?'UNAVAILABLE_GAP':after.length<2?'PENDING':after.some(x=>upper?x.close>lastContact.high:lower?x.close<lastContact.low:false)?'INVALIDATED':after.some(x=>upper?x.close<lastContact.low:lower?x.close>lastContact.high:false)?(upper?'CONFIRMED_AWAY_DOWN':'CONFIRMED_AWAY_UP'):'UNRESOLVED';
  const previous=contacts.filter(x=>x.time<lastContact.time&&x.contact===lastContact.contact).at(-1),leftEdge=previous&&rows.some(x=>x.time>previous.time&&x.time<lastContact.time&&x.contact!==lastContact.contact&&x.contact!=='BOTH');lighterRetest=!!leftEdge&&contiguous(rows.filter(x=>x.time>=previous.time&&x.time<=lastContact.time),ms)&&lastContact.volume!=null&&previous.volume!=null&&lastContact.volume<previous.volume&&(lastContact.contact==='UPPER'&&previous.contact==='UPPER'&&lastContact.high<previous.high||lastContact.contact==='LOWER'&&previous.contact==='LOWER'&&lastContact.low>previous.low);
 }
 return {status:latest?.volume==null?'unavailable':!contiguous(bars.slice(-21),ms)?'gapped':latest.volumeRatio==null?'warming_up':'available',baseline:'20 prior completed bars of reported venue volume and volume/range; not same-time RVOL',knownAt:latest?.knownAt??null,latest,recentContacts:contacts,reaction,followThrough,lighterRetest,semantics:'High effort and narrow range at an observed line is a possible stall, not proof of buyer/seller identity. A reaction needs completed rejection and follow-through. Missing volume is unknown. Median prices are derived references; anchors stay at observed wicks.'};
}

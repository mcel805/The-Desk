import {strictPivot,gvOptions} from './geometry-volume-evidence.mjs';
import {GeometryVolumeStrategy,contextPermission,netPaperRoom,frameAvailable} from './geometry-volume-strategy.mjs';
const MINUTE=60000, clone=v=>structuredClone(v);

// Completed-bar House ABC reconstruction. Origin and A are parent pivots;
// a B pivot and a subsequent local close break start the projected C leg.
export class HouseGeometryABC {
 constructor({identity,tick,inputs={}}){this.identity=identity;this.tick=tick;this.o=gvOptions(inputs);this.paper=[];this.qualified=[];this.attempts={};this.parent=[];this.parents=[];this.bars=[];this.cycles=[];this.events=[];this.root=null;this.index=0;}
 event(c,stage,knownAt,extra={}){c.stage=stage;c.lastEvent={id:c.id+':'+stage+':'+knownAt,campaignId:c.id,side:c.side,stage,knownAt,price:extra.price??c.a?.price??c.o.price,...extra};this.events.push(clone(c.lastEvent));this.events=this.events.slice(-400);}
 gap(now){for(const c of this.cycles.filter(c=>!c.terminal)){c.terminal=true;this.event(c,'unavailable',now,{reason:'Missing source interval'});}for(const p of this.paper.filter(p=>['pending','open'].includes(p.status))){p.status='unresolved-gap';p.closedAt=now;}this.root=null;this.parent=[];this.parents=[];this.bars=[];}
 parentBar(bar,atr){
  const previous=this.parent.at(-1);if(previous&&bar.time-previous.time!==5*MINUTE)this.gap(bar.time+5*MINUTE);
  this.parent.push({...bar});if(this.parent.length>120)this.parent.shift();
  const found=[-1,1].map(side=>strictPivot(this.parent,4,side)).filter(Boolean);if(found.length!==1||!(this.tick>0))return;
  const q={...found[0],knownAt:bar.time+5*MINUTE},now=q.knownAt;
  if(this.root&&q.side===this.root.side&&q.side*(q.price-this.root.price)<this.tick)return;
  for(const c of this.cycles.filter(x=>!x.terminal)){
   if((c.stage==='drive'||c.stage==='B developing')&&q.side===c.side&&q.time>c.o.time&&Math.abs(q.price-c.o.price)>=c.threshold&&(c.stage==='drive'||!c.a||c.side*(q.price-c.a.price)>=this.tick)){
    c.a=clone(q);c.aRecognized=now;c.b=null;c.bTurn=null;this.event(c,'B developing',now,{price:q.price});
    for(const b of this.bars.filter(b=>b.time>q.time&&b.time+MINUTE<=now)){const value=c.side>0?b.low:b.high;if(!c.b||-c.side*(value-c.b.price)>=0)c.b={time:b.time,price:value,side:-c.side,knownAt:now,developing:true};}
    if(c.b)for(let i=this.bars.length-1-this.o.abcPivot;i>=this.o.abcPivot;i--){if(this.bars[i].time<=q.time)break;const p=strictPivot(this.bars.slice(i-this.o.abcPivot,i+this.o.abcPivot+1),this.o.abcPivot,-c.side);if(p&&Math.abs(p.price-c.b.price)<=this.tick){c.bTurn={...p,knownAt:now};break;}}
   }else if((c.stage==='C started'||c.stage==='C beyond A')&&q.side===c.side&&q.time>c.b.time){c.c=clone(q);c.terminal=true;this.event(c,'C completed',now,{price:q.price});}
   if(this.root&&q.side===this.root.side&&c.stage==='drive'&&c.o.time===this.root.time){c.terminal=true;this.event(c,'invalidated',now,{reason:'Origin replaced'});}
  }
  this.parents.push(clone(q));this.parents=this.parents.slice(-120);
  this.root=q;const c={id:this.identity+':house:'+q.time+':'+(++this.index),side:-q.side,o:clone(q),a:null,b:null,c:null,projectedC:null,startedAt:now,threshold:Math.max(12*this.tick,Number.isFinite(atr)?atr:this.tick),stage:'drive',terminal:false};
  const history=this.bars.filter(b=>b.time>q.time&&b.time+MINUTE<=now);for(const b of history){const value=c.side>0?b.high:b.low;if(!c.a||c.side*(value-c.a.price)>=0)c.a={time:b.time,price:value,side:c.side,knownAt:now,developing:true};}
  this.cycles.push(c);this.cycles=this.cycles.slice(-60);this.event(c,'drive',now);
 }
 minute(bar,atr,context,sweep,volumes){
  if(context&&!frameAvailable('5',bar,context.sources['5'],context.frames.get('5'))){if(this.root||this.cycles.some(c=>!c.terminal))this.gap(bar.time+MINUTE);return;}
  const prev=this.bars.at(-1);if(prev&&bar.time-prev.time!==MINUTE)this.gap(bar.time+MINUTE);
  GeometryVolumeStrategy.prototype.observePaper.call(this,bar);
  const now=bar.time+MINUTE,prior=this.bars.slice(-3);this.bars.push({...bar});if(this.bars.length>3000)this.bars.shift();
  const pivots=[-1,1].map(side=>strictPivot(this.bars,this.o.abcPivot,side)).filter(Boolean);
  for(const c of this.cycles.filter(x=>!x.terminal)){
   const adverse=c.side>0?bar.low:bar.high,forward=c.side>0?bar.high:bar.low;
   if(c.side*(adverse-c.o.price)<=-this.tick){c.terminal=true;this.event(c,'invalidated',now,{reason:'Origin breached',price:bar.close});continue;}
   if(bar.time-c.o.time>600*MINUTE){c.terminal=true;this.event(c,'expired',now,{price:bar.close});continue;}
   if(c.stage==='drive'){if(!c.a||c.side*(forward-c.a.price)>=0)c.a={time:bar.time,price:forward,side:c.side,knownAt:now,developing:true};continue;}
   if(c.stage==='B developing'){
    if(bar.time>c.a.time&&(!c.b||-c.side*(adverse-c.b.price)>=0)){c.b={time:bar.time,price:adverse,side:-c.side,knownAt:now,developing:true};c.bTurn=null;}
    const p=pivots.length===1?pivots[0]:null;if(p&&p.side===-c.side&&p.time>c.a.time&&c.b&&Math.abs(p.price-c.b.price)<=this.tick)c.bTurn=p;
    const drive=Math.abs(c.a.price-c.o.price),ratio=c.b&&drive? -c.side*(c.b.price-c.a.price)/drive:0;
    if(ratio>0.95){c.terminal=true;this.event(c,'invalidated',now,{reason:'B retracement exceeds 95%',price:bar.close});continue;}
    const held=c.bTurn&&c.side*(adverse-c.bTurn.price)>=-this.tick,level=prior.length===3?(c.side>0?Math.max(...prior.map(x=>x.high)):Math.min(...prior.map(x=>x.low))):null;
    if(ratio>=0.25&&held&&level!=null&&c.side*(bar.close-level)>=this.tick&&c.side*(bar.close-bar.open)>0&&bar.time>c.bTurn.time){
     c.b=clone(c.bTurn);c.bRecognized=now;c.c={time:bar.time,price:forward,side:c.side,knownAt:now,developing:true};
     const candidates=this.parents.filter(p=>p.side===c.side&&p.time<c.b.time&&p.knownAt<=now&&c.side*(p.price-forward)>3*this.tick&&this.bars[0]?.time<=p.time&&!this.bars.some(b=>b.time>p.time&&b.time<bar.time&&(c.side>0?b.high>=p.price:b.low<=p.price))).sort((a,b)=>c.side*(a.price-b.price));
     const measured=c.b.price+c.side*drive,chosen=candidates[0]?.price??(c.side*(measured-forward)>this.tick?measured:null);c.projectedC=chosen==null?null:{price:chosen,knownAt:now,source:candidates.length?'Prior untouched parent structure':'1 × O–A from B · measured move',touchedAt:null};
     this.event(c,'C started',now,{price:bar.close});this.qualify(c,bar,context,sweep,volumes);
    }
   }else if(c.stage==='C started'||c.stage==='C beyond A'){
    if(c.side*(adverse-c.b.price)<=-this.tick){c.terminal=true;this.event(c,'invalidated',now,{reason:'B breached',price:bar.close});
     if((c.attempt||1)<3&&c.side*(adverse-c.o.price)>this.tick){const retry={id:c.id+':retry:'+(c.attempt||1),side:c.side,o:clone(c.o),a:clone(c.a),b:{time:bar.time,price:adverse,side:-c.side,knownAt:now,developing:true},bTurn:null,c:null,projectedC:null,startedAt:c.startedAt,threshold:c.threshold,stage:'B developing',terminal:false,attempt:(c.attempt||1)+1};this.cycles.push(retry);this.event(retry,'B developing',now,{reason:'Fresh B attempt',price:bar.close});}continue;}
    if(c.side*(forward-c.c.price)>=0)c.c={time:bar.time,price:forward,side:c.side,knownAt:now,developing:true};
    if(c.stage==='C started'&&c.side*(bar.close-c.a.price)>=this.tick)this.event(c,'C beyond A',now,{price:bar.close});
    if(c.projectedC&&!c.projectedC.touchedAt&&now>c.projectedC.knownAt&&c.side*(forward-c.projectedC.price)>=0)c.projectedC.touchedAt=now;
   }
  }
 }
 qualify(c,bar,context,sweep,volumes){
  const now=bar.time+MINUTE;if(!context||!sweep||!volumes)return;
  const parents=contextPermission(c.side,bar,context),reclaim=sweep.reclaimed(c.side,c.o.knownAt,now),one=volumes.get('1');
  const signals=['1','5'].flatMap(tf=>volumes.get(tf)?.rows.filter(r=>r.knownAt>=c.o.knownAt&&r.knownAt<=now&&now-r.knownAt<=this.o.volumeExpiry*MINUTE&&(r.climax||r.churn||r.twoBar)).map(r=>({...r,frame:tf}))||[]);
  const divergence=['1','5'].flatMap(tf=>volumes.get(tf)?.divergences||[]).filter(d=>d.side===c.side&&d.knownAt>=c.o.knownAt&&d.knownAt<=now&&now-d.knownAt<=this.o.campaignBars*MINUTE);
  c.blockers=[];if(!parents.allowed)c.blockers.push('1H / 30M / 15M context unresolved or conflicting');if(!reclaim)c.blockers.push('Sweep / reclaim not confirmed');if(!signals.length)c.blockers.push('Volume confirmation missing');if(this.o.requireDivergence&&!divergence.some(d=>d.momentum))c.blockers.push('Confirmed momentum divergence missing');
  const value=one?.rows.at(-1)?.vwap;if(this.o.requireValueArea&&(!value?.complete||value.value==null||value.sigma==null))c.blockers.push('Complete anchored VWAP history required');else if(this.o.requireValueArea&&Math.abs(bar.close-value.value)>this.o.valueSigma*value.sigma+this.tick)c.blockers.push('Outside anchored VWAP value area');
  if(!one?.rows.at(-1)?.ready)c.blockers.push('Volume warmup / zero baseline');if(!context.sources['1']||context.sources['1'].status!=='ready'||!frameAvailable('5',bar,context.sources['5'],context.frames.get('5')))c.blockers.push('Source unavailable');if(!c.projectedC)c.blockers.push('Projected C objective unavailable');
  const raw=c.b.price-c.side*this.o.stopTicks*this.tick,stop=(c.side>0?Math.floor(raw/this.tick+1e-9):Math.ceil(raw/this.tick-1e-9))*this.tick,target=c.projectedC?{price:c.projectedC.price,kind:c.projectedC.source}:null,room=target?netPaperRoom(c.side,bar.close,stop,target.price,this.tick,this.o):null;
  if(!target||room?.rr==null||room.rr<this.o.minRewardRisk)c.blockers.push('Insufficient net room to projected C');const areaId='house:'+c.o.time;if((this.attempts[areaId]||0)>=2)c.blockers.push('Two stopped attempts at this origin');if(this.paper.some(p=>p.areaId===areaId&&['pending','open'].includes(p.status)))c.blockers.push('An observation is already open at this origin');
  if(c.blockers.length)return;c.qualifiedAt=now;const observation={id:c.id+':qualified',campaignId:c.id,areaId,side:c.side,qualifiedAt:now,entryReference:bar.close,stop,target,rr:room.rr,context:clone(parents),abc:{o:clone(c.o),a:clone(c.a),b:clone(c.b),projection:clone(c.projectedC)},sweep:clone(reclaim),volume:clone(signals),divergence:clone(divergence),scope:'hypothetical next-bar-open observation; no order'};this.qualified.push(observation);this.qualified=this.qualified.slice(-100);this.paper.push({...clone(observation),status:'pending'});this.paper=this.paper.slice(-100);this.events.push({id:observation.id,campaignId:c.id,side:c.side,stage:'qualified paper',knownAt:now,price:bar.close});this.events=this.events.slice(-400);
 }
 snapshot(){return clone({campaigns:this.cycles,events:this.events,paper:this.paper.slice(-100),qualified:this.qualified.slice(-100),attempts:this.attempts,scope:'House ABC observations; paper simulation only'});}
}

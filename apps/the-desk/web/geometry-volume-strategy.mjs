import {GEOMETRY_FRAMES,frameMs,channelBounds} from './market-geometry-model.mjs';
import {gvOptions} from './geometry-volume-evidence.mjs';
const copy=v=>structuredClone(v);
export function geometryParallels(g,time){const {low,high}=channelBounds(g,time),width=high-low;return [{kind:'lower warning',price:low-width},{kind:'lower rail',price:low},{kind:'median',price:(low+high)/2},{kind:'upper rail',price:high},{kind:'upper warning',price:high+width}];}
export function frameAvailable(tf,bar,source,frame){return source?.status==='ready'&&!source.error&&frame?.lastTime!=null&&frame.lastTime+frameMs(tf)>=Math.floor(bar.time/frameMs(tf))*frameMs(tf);}
export function contextPermission(side,bar,{sources,frames}){const details=['60','30','15'].map(tf=>({frame:tf,available:frameAvailable(tf,bar,sources[tf],frames.get(tf)),direction:frames.get(tf)?.structure.direction||0}));return {allowed:details.every(d=>d.available&&d.direction===side),details};}
export function areaLines(bar,{sources,frames},tick,atr,inputs={}){
 const o=gvOptions(inputs),out=[],band=Math.max(o.areaTicks*tick,o.areaAtr*(atr||0));
 for(const tf of GEOMETRY_FRAMES){const f=frames.get(tf);if(!frameAvailable(tf,bar,sources[tf],f))continue;
  const channels=f.channels.filter(g=>g.knownAt<=bar.time&&!g.gapEnded&&(g.touches||0)>=(Number(inputs.geometryMinTouches)||0)&&bar.time-g.knownAt<=120*frameMs(tf)).slice(-8);
  for(const g of channels)for(const p of geometryParallels(g,bar.time))out.push({...p,id:g.id+':'+p.kind,frame:tf,geometry:copy(g),time:bar.time,band,projected:bar.time>g.endAt});
 }
 return out;
}
export function confluenceContacts(bar,previous,lines,inputs={}){
 if(!previous)return [];const o=gvOptions(inputs),touches=lines.filter(l=>bar.low<=l.price+l.band&&bar.high>=l.price-l.band),out=[];
 for(const side of [1,-1]){const eligible=touches.filter(l=>side*(previous.close-l.price)>=-l.band).sort((a,b)=>Math.abs(a.price-bar.close)-Math.abs(b.price-bar.close)||Number(b.frame)-Number(a.frame)||a.id.localeCompare(b.id));
  for(const anchor of eligible){const cluster=eligible.filter(l=>Math.abs(l.price-anchor.price)<=anchor.band),frames=[...new Set(cluster.map(l=>l.frame))];if(frames.length<o.confluenceFrames)continue;
   const representatives=frames.map(tf=>cluster.find(l=>l.frame===tf)),key=representatives.map(l=>l.geometry.id).sort().join('|');out.push({id:'area:'+side+':'+key,side,at:bar.time+60000,price:anchor.price,band:anchor.band,lines:copy(representatives),frames});break;
  }
 }
 return out;
}
export function firstObjective(side,entry,lines,pools,tick){
 const candidates=[...lines.map(l=>({price:l.price,id:l.id,kind:l.kind,frame:l.frame})),...pools.filter(p=>!p.consumed&&p.side===side).map(p=>({price:p.price,id:p.id,kind:'unswept pivot',frame:'1'}))].filter(v=>side*(v.price-entry)>=tick).sort((a,b)=>side*(a.price-b.price)||a.id.localeCompare(b.id));
 return candidates[0]||null;
}

export function netPaperRoom(side,entry,stop,target,tick,options,{entryIncludesSlippage=false}={}){
 const slip=options.slippageTicks*tick,at=entry+(entryIncludesSlippage?0:side*slip),lossExit=stop-side*slip,winExit=target-side*slip,fee=options.feeBps/10000;
 const risk=side*(at-lossExit)+(Math.abs(at)+Math.abs(lossExit))*fee,reward=side*(winExit-at)-(Math.abs(at)+Math.abs(winExit))*fee;
 return {netRisk:risk,netReward:reward,rr:risk>0&&reward>0?reward/risk:null};
}

export class GeometryVolumeStrategy {
 constructor({identity,tick,inputs={}}){this.identity=identity;this.tick=tick;this.o=gvOptions(inputs);this.campaigns=[];this.events=[];this.qualified=[];this.paper=[];this.attempts={};this.previous=null;this.seenPivots=new Set();}
 event(c,stage,bar,extra={}){const e={id:c.id+':'+stage+':'+bar.time,campaignId:c.id,side:c.side,family:'geometry-volume',stage,knownAt:bar.time+60000,price:bar.close,...extra};c.stage=stage;c.lastEvent=e;this.events.push(e);if(this.events.length>400)this.events.shift();return e;}
 gap(bar){for(const c of this.campaigns.filter(c=>!c.terminal)){c.terminal=true;this.event(c,'unavailable',bar,{reason:'Missing 1M interval'});}for(const p of this.paper.filter(p=>['pending','open'].includes(p.status))){p.status='unresolved-gap';p.closedAt=bar.time+60000;}this.previous=null;this.seenPivots.clear();}
 observePaper(bar){
  for(const p of this.paper.filter(p=>['pending','open'].includes(p.status))){
   const slip=this.o.slippageTicks*this.tick;
   if(p.status==='pending'){
    if(bar.time!==p.qualifiedAt){p.status='unresolved-gap';continue;}
    const entry=bar.open+p.side*slip,room=netPaperRoom(p.side,entry,p.stop,p.target.price,this.tick,this.o,{entryIncludesSlippage:true});
    if(room.rr==null||room.rr<this.o.minRewardRisk){p.status='skipped-open';continue;}p.entry=entry;p.enteredAt=bar.time;p.status='open';
   }
   const stop=p.side>0?bar.low<=p.stop:bar.high>=p.stop,target=p.side>0?bar.high>=p.target.price:bar.low<=p.target.price;
   if(!stop&&!target)continue;
   const raw=stop?(p.side>0?Math.min(bar.open,p.stop):Math.max(bar.open,p.stop)):p.target.price;
   p.exit=raw-p.side*slip;p.status=stop?'stopped':'target';p.ambiguous=stop&&target;p.closedAt=bar.time+60000;
   p.grossPerUnit=p.side*(p.exit-p.entry);p.feesPerUnit=(Math.abs(p.entry)+Math.abs(p.exit))*this.o.feeBps/10000;p.netPerUnit=p.grossPerUnit-p.feesPerUnit;
   if(stop)this.attempts[p.areaId]=(this.attempts[p.areaId]||0)+1;
  }
 }
 before(bar,{sources,frames},sweep,volume){
  if(this.previous&&bar.time-this.previous.time!==60000)this.gap(bar);
  this.observePaper(bar);this.lines=areaLines(bar,{sources,frames},this.tick,volume?.atr,this.o);
  const contacts=confluenceContacts(bar,this.previous,this.lines,this.o);
  for(const area of contacts){
   if(this.campaigns.some(c=>!c.terminal&&c.side===area.side)||this.campaigns.some(c=>c.area.id===area.id&&bar.time+60000-c.lastEvent.knownAt<15*60000)||this.attempts[area.id]>=2)continue;
   const c={id:this.identity+':abc:'+area.side+':'+bar.time,side:area.side,area,startedAt:bar.time+60000,stage:'area',terminal:false,a:null,b:null,c:null,breakAt:null,retestAt:null,blockers:[],parentAtContact:contextPermission(area.side,bar,{sources,frames})};
   this.campaigns.push(c);this.event(c,'area',bar);
  }
  this.campaigns=this.campaigns.slice(-80);this.previous=copy(bar);
 }
 after(bar,{sources,frames},sweep,volumes){
  const now=bar.time+60000,frame=frames.get('1'),fresh=frame.rawPivots.filter(p=>p.knownAt===now),one=volumes.get('1');
  for(const c of this.campaigns.filter(c=>!c.terminal)){
   if(now-c.startedAt>this.o.campaignBars*60000||c.breakAt&&now-c.breakAt>this.o.retestBars*60000){c.terminal=true;this.event(c,'expired',bar);continue;}
   if(c.c&&c.side*((c.side>0?bar.low:bar.high)-c.c.price)<-this.tick){c.terminal=true;this.event(c,'failed',bar,{reason:'C extreme lost'});continue;}
   // A and C point into the area; B is the opposite corrective pivot.
   for(const p of fresh.filter(p=>p.time>=c.startedAt-60000)){
    if(!c.a&&p.side===-c.side){c.a=copy(p);this.event(c,'A',bar,{anchor:copy(p)});}
    else if(c.a&&!c.b&&p.side===c.side&&p.time>c.a.time){c.b=copy(p);this.event(c,'B',bar,{anchor:copy(p)});}
    else if(c.b&&!c.c&&p.side===-c.side&&p.time>c.b.time&&c.side*(c.a.price-p.price)>=this.tick){c.c=copy(p);this.event(c,'C',bar,{anchor:copy(p)});}
   }
   if(c.c&&!c.breakAt&&now>c.c.knownAt&&c.side*(bar.close-c.b.price)>=this.tick){c.breakAt=now;this.event(c,'B break',bar);}
   if(c.breakAt&&now>c.breakAt&&bar.low<=c.b.price+this.o.areaTicks*this.tick&&bar.high>=c.b.price-this.o.areaTicks*this.tick&&c.side*(bar.close-c.b.price)>=this.tick){c.retestAt=now;this.event(c,'retest held',bar);}
   const parents=contextPermission(c.side,bar,{sources,frames}),reclaim=sweep.reclaimed(c.side,c.startedAt,now);
   const signals=['1','5'].flatMap(tf=>{const v=volumes.get(tf);return v.rows.filter(r=>r.knownAt>=c.startedAt&&r.knownAt<=now&&now-r.knownAt<=this.o.volumeExpiry*60000&&(r.climax||r.churn||r.twoBar)).map(r=>({...r,frame:tf}));});
   const divergence=['1','5'].flatMap(tf=>volumes.get(tf).divergences).filter(d=>d.side===c.side&&d.knownAt>=c.startedAt&&d.knownAt<=now&&now-d.knownAt<=this.o.campaignBars*60000);
   c.blockers=[];
   if(!parents.allowed)c.blockers.push('1H / 30M / 15M context unresolved or conflicting');
   if(!reclaim)c.blockers.push('Sweep / reclaim not confirmed');
   if(!c.c)c.blockers.push('Corrective C not confirmed');else if(!c.breakAt)c.blockers.push('Wait for closed 1M B break');else if(!c.retestAt)c.blockers.push('Wait for later held B retest');
   if(!signals.length)c.blockers.push('Volume confirmation missing');
   if(this.o.requireDivergence&&!divergence.some(d=>d.momentum))c.blockers.push('Confirmed momentum divergence missing');
   const value=one.rows.at(-1)?.vwap;if(this.o.requireValueArea&&(!value?.complete||value.value==null||value.sigma==null))c.blockers.push('Complete anchored VWAP history required');else if(this.o.requireValueArea&&Math.abs(bar.close-value.value)>this.o.valueSigma*value.sigma+this.tick)c.blockers.push('Outside anchored VWAP value area');
   if(!one.rows.at(-1)?.ready)c.blockers.push('Volume warmup / zero baseline');
   if(!sources['1']||sources['1'].status!=='ready'||!['5','15','30','60'].every(tf=>frameAvailable(tf,bar,sources[tf],frames.get(tf))))c.blockers.push('Source unavailable');
   if(!c.retestAt)continue;
   if(now!==c.retestAt||c.side*(bar.close-c.b.price)<this.tick)c.blockers.push('Wait for a fresh held B retest');
   if(!(this.tick>0))c.blockers.push('Verified tick unavailable');
   const rawStop=(c.side>0?Math.min(c.c.price,reclaim?.extreme??c.c.price):Math.max(c.c.price,reclaim?.extreme??c.c.price))-c.side*this.o.stopTicks*this.tick,stop=(c.side>0?Math.floor(rawStop/this.tick+1e-9):Math.ceil(rawStop/this.tick-1e-9))*this.tick;
   const target=firstObjective(c.side,bar.close,this.lines,sweep.pools,this.tick),risk=c.side*(bar.close-stop),room=target?c.side*(target.price-bar.close):null,net=target?netPaperRoom(c.side,bar.close,stop,target.price,this.tick,this.o):null,rr=net?.rr??null;
   if(!target||rr==null||rr<this.o.minRewardRisk||risk<=0)c.blockers.push('Insufficient net room to first known objective');
   if(this.attempts[c.area.id]>=2)c.blockers.push('Two stopped attempts at this area');
   c.risk={entryReference:bar.close,stop,target,rr,grossRR:risk>0&&room!=null?room/risk:null,...net};
   if(c.blockers.length)continue;
   const observation={id:c.id+':qualified',campaignId:c.id,areaId:c.area.id,side:c.side,qualifiedAt:now,entryReference:bar.close,stop,target:copy(target),rr,context:copy(parents),area:copy(c.area),abc:{a:copy(c.a),b:copy(c.b),c:copy(c.c),breakAt:c.breakAt,retestAt:c.retestAt},sweep:copy(reclaim),volume:copy(signals),divergence:copy(divergence),scope:'hypothetical next-bar-open observation; no order'};
   c.terminal=true;c.qualifiedAt=now;this.event(c,'qualified paper',bar);this.qualified.push(observation);this.paper.push({...copy(observation),status:'pending'});
  }
  this.qualified=this.qualified.slice(-100);this.paper=this.paper.slice(-100);
 }
 snapshot(){return copy({campaigns:this.campaigns,events:this.events,qualified:this.qualified,paper:this.paper,attempts:this.attempts});}
}

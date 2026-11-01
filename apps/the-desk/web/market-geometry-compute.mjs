import {GeometryFrame,MicroTurns,GEOMETRY_FRAMES,geometryOptions,geometryCalculationOptions,frameMs,GEOMETRY_VERSION} from './market-geometry-model.mjs';
// One instance per study/settings/source generation. Incoming snapshots may overlap.
export class GeometryComputation {
 constructor({identity,tick,inputs={},checkpoint=null}){this.identity=identity;this.tick=tick;this.inputs=geometryOptions(inputs);this.frames=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new GeometryFrame(tf,{tick,inputs})]));this.turns=new MicroTurns({tick,inputs,identity});this.accepted=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new Map()]));this.revision=0;this.cutoff=-Infinity;if(checkpoint)this.restore(checkpoint);}
 checkpoint(){return structuredClone({identity:this.identity,tick:this.tick,profile:JSON.stringify(geometryCalculationOptions(this.inputs)),revision:this.revision,cutoff:this.cutoff,frames:Object.fromEntries([...this.frames].map(([tf,f])=>[tf,f])),turns:{candidates:this.turns.candidates,events:this.turns.events,previous:this.turns.previous,index:this.turns.index,used:[...this.turns.used]},accepted:Object.fromEntries([...this.accepted].map(([tf,rows])=>[tf,[...rows]]))});}
 restore(checkpoint){if(checkpoint.identity!==this.identity||checkpoint.tick!==this.tick||checkpoint.profile!==JSON.stringify(geometryCalculationOptions(this.inputs)))return false;for(const tf of GEOMETRY_FRAMES){const frame=checkpoint.frames?.[tf];if(frame)Object.assign(this.frames.get(tf),frame);}const turns=checkpoint.turns||{};Object.assign(this.turns,{candidates:turns.candidates||[],events:turns.events||[],previous:turns.previous||null,index:turns.index||0,used:new Set(turns.used||[])});this.accepted=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new Map(checkpoint.accepted?.[tf]||[])]));this.revision=checkpoint.revision||0;this.cutoff=checkpoint.cutoff??-Infinity;return true;}
 update(sources,cutoff){
  let rebuild=cutoff<this.cutoff;
  for(const tf of GEOMETRY_FRAMES){for(const b of sources[tf]?.bars||[]){const old=this.accepted.get(tf).get(b.time);if(old&&['open','high','low','close','volume'].some(k=>old[k]!==b[k]))rebuild=true;}}
  if(rebuild){const replacement=new GeometryComputation({identity:this.identity,tick:this.tick,inputs:this.inputs});replacement.revision=this.revision+1;Object.assign(this,replacement);}
  this.cutoff=cutoff;
  const pending=[];
  for(const tf of GEOMETRY_FRAMES){const f=this.frames.get(tf),s=sources[tf];if(!s||s.error)continue;for(const b of s.bars){if(b.time+frameMs(tf)<=cutoff&&(f.lastTime==null||b.time>f.lastTime))pending.push({tf,b,at:b.time+frameMs(tf)});}}
  // At an equal close, 1M evaluates against the parent state that was already known
  // BEFORE this candle. Later parent confirmations are independent evidence.
  pending.sort((a,b)=>a.at-b.at||Number(a.tf)-Number(b.tf));
  for(const {tf,b} of pending){
   const f=this.frames.get(tf);
   if(tf==='1'){
    const channels=[...this.frames.values()].filter(x=>sources[x.tf]?.status==='ready'&&x.lastTime!=null&&x.lastTime+frameMs(x.tf)>=Math.floor(b.time/frameMs(x.tf))*frameMs(x.tf)).flatMap(x=>x.channels.filter(g=>g.knownAt<=b.time));
    const parents=GEOMETRY_FRAMES.filter(t=>t!=='1'&&sources[t]?.status==='ready').map(t=>{const p=this.frames.get(t);return {frame:t,direction:p.structure.direction,protected:p.structure.protected};});
    // Historical replay uses availability at that bar, never today's tail staleness.
    this.turns.feed(b,{channels,pivots:f.rawPivots.filter(p=>p.time>=(f.bars[f.segmentStart||0]?.time??-Infinity)),parents,available:this.tick>0&&sources['1']?.status==='ready'});
   }
   f.feed(b);this.accepted.get(tf).set(b.time,{...b});
   const accepted=this.accepted.get(tf);while(accepted.size>this.inputs.geometryHistory+64)accepted.delete(accepted.keys().next().value);
  }
  const frames=Object.fromEntries(GEOMETRY_FRAMES.map(tf=>[tf,{...this.frames.get(tf).snapshot(),source:{...sources[tf],bars:undefined}}]));
  const turns=this.turns.snapshot();
  for(const c of turns.candidates){c.parentProgress=GEOMETRY_FRAMES.filter(t=>t!=='1').map(tf=>({frame:tf,shift:frames[tf].events.find(e=>e.kind==='shift'&&e.side===c.side&&e.knownAt>=c.startedAt)||null,available:sources[tf]?.status==='ready',direction:frames[tf].structure.direction}));}
  return {version:GEOMETRY_VERSION,identity:this.identity,cutoff,revision:this.revision,tick:this.tick,frames,turns};
 }
}

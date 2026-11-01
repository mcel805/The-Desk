import {GeometryComputation} from './market-geometry-compute.mjs';
import {GEOMETRY_FRAMES,geometryCalculationOptions} from './market-geometry-model.mjs';
import {GV_VERSION,gvOptions,gvCalculationOptions,VolumeEvidence,SweepEvidence} from './geometry-volume-evidence.mjs';
import {GeometryVolumeStrategy} from './geometry-volume-strategy.mjs';
export class GeometryVolumeComputation {
 constructor({identity,tick,inputs={},checkpoint=null}){
  this.identity=identity;this.tick=tick;this.inputs=gvOptions(inputs);
  const valid=checkpoint?.identity===identity&&checkpoint.tick===tick&&checkpoint.profile===JSON.stringify(geometryCalculationOptions({...inputs,microPivot:this.inputs.abcPivot}))&&checkpoint.gv?.version===GV_VERSION&&checkpoint.gv.settings===JSON.stringify(gvCalculationOptions(inputs));if(!valid)checkpoint=null;
  this.geo=new GeometryComputation({identity,tick,inputs:{...inputs,microPivot:this.inputs.abcPivot},checkpoint});this.reset();
  const old=checkpoint?.gv;if(old?.version===GV_VERSION&&old.settings===JSON.stringify(gvCalculationOptions(inputs))){for(const tf of GEOMETRY_FRAMES)Object.assign(this.volumes.get(tf),old.volumes[tf]);Object.assign(this.sweep,old.sweep,{seen:new Set(old.sweep.seen)});Object.assign(this.strategy,old.strategy,{seenPivots:new Set(old.strategy.seenPivots)});this.sourceAudit=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new Map(old.sourceAudit?.[tf]||[])]));}
  this.geo.onReset=()=>this.reset();
  this.geo.beforeFeed=(tf,b,context)=>{if(tf==='1'){this.sweep.feed(b,this.volumes.get('1').rows.at(-1)?.atr);this.strategy.before(b,context,this.sweep,this.volumes.get('1').rows.at(-1));}};
  this.geo.afterFeed=(tf,b,context)=>{this.volumes.get(tf).feed(b);if(tf==='1')this.strategy.after(b,context,this.sweep,this.volumes);};
 }
 reset(){this.sourceAudit=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new Map()]));this.volumes=new Map(GEOMETRY_FRAMES.map(tf=>[tf,new VolumeEvidence(tf,{window:this.inputs.volumeWindow,pivot:this.inputs.abcPivot,anchorHour:this.inputs.vwapAnchorHour})]));this.sweep=new SweepEvidence({tick:this.tick,inputs:this.inputs});this.strategy=new GeometryVolumeStrategy({identity:this.identity,tick:this.tick,inputs:this.inputs});}
 update(sources,cutoff){
  const fields=['open','high','low','close','volume'];for(const tf of GEOMETRY_FRAMES)for(const b of sources[tf]?.bars||[]){if(b.time+Number(tf)*60000>cutoff)continue;const prior=this.sourceAudit.get(tf).get(b.time);if(prior&&fields.some(k=>prior[k]!==b[k]))this.geo.cutoff=Infinity;}
  const result=this.geo.update(sources,cutoff);
  for(const tf of GEOMETRY_FRAMES){const audit=this.sourceAudit.get(tf);for(const b of sources[tf]?.bars||[])if(b.time+Number(tf)*60000<=cutoff)audit.set(b.time,{...b});while(audit.size>(tf==='1'?2000:1200))audit.delete(audit.keys().next().value);}
  return {...result,geometryVolume:{version:GV_VERSION,volumes:Object.fromEntries([...this.volumes].map(([tf,v])=>[tf,v.snapshot()])),sweep:this.sweep.snapshot(),strategy:this.strategy.snapshot(),scope:'source-informed OHLCV reconstruction; paper observations only'}};}
 checkpoint(){return {...this.geo.checkpoint(),gv:structuredClone({version:GV_VERSION,settings:JSON.stringify(gvCalculationOptions(this.inputs)),volumes:Object.fromEntries(this.volumes),sweep:{...this.sweep,seen:[...this.sweep.seen]},strategy:{...this.strategy,seenPivots:[...this.strategy.seenPivots]},sourceAudit:Object.fromEntries([...this.sourceAudit].map(([tf,rows])=>[tf,[...rows]]))})};}
}

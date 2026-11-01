// Deterministic completed-candle geometry. No account, order or model-service access.
export const GEOMETRY_VERSION='desk-market-geometry.2';
export const GEOMETRY_FRAMES=['60','30','15','5','1'];
export const FRAME_STYLE={60:{name:'1H',color:'#5B8FFF',width:3.5},30:{name:'30M',color:'#B39AFF',width:3},15:{name:'15M',color:'#F6BD54',width:2.5},5:{name:'5M',color:'#2CCAC8',width:2},1:{name:'1M',color:'#E7EDF7',width:1.5}};
export function geometryFrameColor(tf,inputs={},light=false){
 const custom=inputs['frameColor'+tf],ink=FRAME_STYLE[tf].color,value=String(custom||ink).toUpperCase(),untouched=value===ink.toUpperCase()||value===ink.toUpperCase()+'FF';
 return light&&untouched?({60:'#2458CF',30:'#7751C9',15:'#986207',5:'#087F83',1:'#39475D'})[tf]:custom||ink;
}
export const DEFAULT_GEOMETRY={geometryMode:'Context + Micro',geometryPresentation:'Focus',geometryHistory:600,geometryPivot:4,geometryMinSpan:8,geometryTouchTolerance:2,geometryMinTouches:0,structuralPivot:8,structuralMinSpan:32,microPivot:2,parentPivot:4,turnExpiry:20,showChannels:true,showSwingPaths:true,showWorking:true,showProjection:false,geometryShowBroken:true,geometryShowLabels:true,showStatus:true,showTurnHistory:true,stageAlerts:false};
const copy=v=>structuredClone(v),finite=Number.isFinite;
const CALCULATION_KEYS=['geometryHistory','geometryPivot','geometryMinSpan','geometryTouchTolerance','geometryMinTouches','structuralPivot','structuralMinSpan','microPivot','parentPivot','turnExpiry'];
export const frameMs=tf=>Number(tf)*60000;
export function geometryOptions(inputs={}){
 const o={...DEFAULT_GEOMETRY,...inputs};
 for(const [key,min,max] of [['geometryHistory',100,1200],['geometryPivot',2,15],['geometryMinSpan',2,100],['geometryTouchTolerance',0,10],['geometryMinTouches',0,8],['structuralPivot',4,15],['structuralMinSpan',8,100],['microPivot',1,10],['parentPivot',2,15],['turnExpiry',5,100]]){
  const raw=o[key],value=typeof raw==='number'||typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;
  o[key]=finite(value)?Math.max(min,Math.min(max,Math.round(value))):DEFAULT_GEOMETRY[key];
 }
 return o;
}
export function geometryCalculationOptions(inputs={}){
 const o=geometryOptions(inputs);return Object.fromEntries(CALCULATION_KEYS.map(k=>[k,o[k]]));
}
export function geometryEvidenceIdentity(identity,tick,inputs={}){
 return JSON.stringify({source:String(identity),rule:GEOMETRY_VERSION,tick,settings:geometryCalculationOptions(inputs)});
}
export function validateBars(bars,tf,cutoff){
 const ms=frameMs(tf),byTime=new Map();
 for(const b of bars||[]){
  if(!['time','open','high','low','close','volume'].every(k=>finite(b[k]))||b.time%ms!==0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)||b.volume<0)throw Error('Invalid '+tf+' candle');
  if(b.time+ms<=cutoff)byTime.set(b.time,{...b});
 }
 return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
export function aggregateThirty(bars,cutoff){
 const source=validateBars(bars,'15',cutoff),buckets=new Map(),missing=[];
 for(const b of source){const t=Math.floor(b.time/1800000)*1800000;if(t+1800000>cutoff)continue;const parts=buckets.get(t)||[];parts.push(b);buckets.set(t,parts);}
 const result=[];
 for(const [t,p] of buckets){if(p.length!==2||p[0].time!==t||p[1].time!==t+900000){missing.push(t);continue;}result.push({time:t,open:p[0].open,high:Math.max(...p.map(b=>b.high)),low:Math.min(...p.map(b=>b.low)),close:p[1].close,volume:p[0].volume+p[1].volume});}
 return {bars:result,missing,aggregation:'15M → 30M'};
}
export const channelBase=(g,t)=>g.p0+(g.p1-g.p0)*(t-g.t0)/(g.t1-g.t0);
export function channelBounds(g,t){const b=channelBase(g,t);return g.side<0?{low:b,high:b+g.offset}:{low:b-g.offset,high:b};}
function inside(g,b,tick){const v=channelBounds(g,b.time),eps=tick*.0001;return b.low>=v.low-eps&&b.high<=v.high+eps;}
function touches(g,b,tolerance,tick){const v=channelBounds(g,b.time),tol=tolerance*tick+tick*.0001;return Math.abs(b.low-v.low)<=tol||Math.abs(b.high-v.high)<=tol;}
export function pivotAt(bars,i,span,side){
 const k=i-span;if(k<span)return null;const field=side>0?'high':'low',p=bars[k][field];
 for(let j=k-span;j<k;j++)if(side>0?bars[j][field]>p:bars[j][field]<p)return null;
 for(let j=k+1;j<=i;j++)if(side>0?bars[j][field]>=p:bars[j][field]<=p)return null;
 return {time:bars[k].time,price:p,side,knownAt:bars[i].time,barIndex:k};
}
export function channelCandidate(bars,a,b,side,{tick,minSpan,tolerance,knownAt,family,tf}){
 const begin=bars.findIndex(v=>v.time===a.time);if(begin<0||b.time<=a.time)return null;
 const g={id:`${tf}:${family}:${side}:${a.time}:${b.time}`,frame:tf,family,t0:a.time,p0:a.price,t1:b.time,p1:b.price,side,offset:0,endAt:b.time,broken:false,touches:0,spanBars:0,knownAt,breakAt:null};
 for(let j=begin;j<bars.length&&bars[j].time<=b.time;j++){
  const c=bars[j],base=channelBase(g,c.time);if(side<0?c.low<base-tick*.0001:c.high>base+tick*.0001)return null;
  g.offset=Math.max(g.offset,side<0?c.high-base:base-c.low);g.spanBars++;
 }
 if(g.spanBars<minSpan||g.offset<=0)return null;
 for(let j=begin+1;j<bars.length;j++){
  const c=bars[j];if(c.time<b.time&&touches(g,c,tolerance,tick))g.touches++;
  if(c.time>b.time){if(!inside(g,c,tick)){g.broken=true;g.breakAt=c.time;break;}g.endAt=c.time;if(touches(g,c,tolerance,tick))g.touches++;}
 }
 return g;
}
function structuralAnchors(pivots){
 const chosen=pivots.slice(-4).reverse(),older=pivots.slice(0,-4);
 if(older.length){for(let j=0;j<4;j++){const target=older[0].time+(older.at(-1).time-older[0].time)*j/3;const p=older.reduce((a,b)=>Math.abs(b.time-target)<Math.abs(a.time-target)?b:a);if(!chosen.includes(p))chosen.push(p);}}
 return chosen;
}
export class GeometryFrame {
 constructor(tf,{tick,inputs={}}={}){
  this.tf=String(tf);this.tick=tick;this.o=geometryOptions(inputs);this.bars=[];this.processed=0;this.lastTime=null;this.rawPivots=[];this.locked=[];this.working=null;this.channels=[];this.structure={direction:0,protected:null,lastHigh:null,lastLow:null};this.events=[];this.ambiguities=[];this.pivots={local:{high:[],low:[]},structural:{high:[],low:[]}};
 }
 addPivot(p){
  const prev=this.rawPivots.filter(x=>x.side===p.side).at(-1);p={...p,knownAt:p.knownAt+frameMs(this.tf),id:`${this.tf}:pivot:${p.side}:${p.time}`,kind:!prev?(p.side>0?'H':'L'):p.side>0?(p.price>prev.price?'HH':p.price<prev.price?'LH':'EH'):(p.price>prev.price?'HL':p.price<prev.price?'LL':'EL')};
  this.rawPivots.push(p);if(this.rawPivots.length>500)this.rawPivots.shift();
  if(!this.working){this.working=p;return;}
  if(this.working.side===p.side){if(p.side>0?p.price>this.working.price:p.price<this.working.price)this.working=p;return;}
  const locked={...this.working,lockedAt:p.knownAt},previous=this.locked.filter(v=>v.side===locked.side).at(-1);if(previous)locked.kind=locked.side>0?(locked.price>previous.price?'HH':locked.price<previous.price?'LH':'EH'):(locked.price>previous.price?'HL':locked.price<previous.price?'LL':'EL');this.locked.push(locked);if(this.locked.length>500)this.locked.shift();this.working=p;
 }
 updateStructure(b,knownAt){
  const segmentTime=this.bars[this.segmentStart||0]?.time??-Infinity,highs=this.locked.filter(p=>p.side>0&&p.time>=segmentTime),lows=this.locked.filter(p=>p.side<0&&p.time>=segmentTime),h=highs.at(-1),l=lows.at(-1),s=this.structure,t=this.tick;
  if(s.protected&&s.direction*(b.close-s.protected.price)<=-t){
   const side=-s.direction;this.events.push({id:`${this.tf}:shift:${knownAt}:${side}`,kind:'shift',side,frame:this.tf,knownAt,price:b.close,reference:copy(s.protected)});s.direction=side;s.protected=copy(side>0?l:h)||null;
  }
  if(h&&l&&h.time<l.time&&b.close>=h.price+t&&s.lastHigh!==h.id){s.lastHigh=h.id;s.direction=1;s.protected=copy(l);this.events.push({id:`${this.tf}:continuation:${knownAt}:1`,kind:'continuation',side:1,frame:this.tf,knownAt,price:b.close,reference:copy(h)});}
  else if(h&&l&&l.time<h.time&&b.close<=l.price-t&&s.lastLow!==l.id){s.lastLow=l.id;s.direction=-1;s.protected=copy(h);this.events.push({id:`${this.tf}:continuation:${knownAt}:-1`,kind:'continuation',side:-1,frame:this.tf,knownAt,price:b.close,reference:copy(l)});}
  if(this.events.length>1000)this.events.splice(0,this.events.length-1000);
 }
 feed(b){
  if(this.lastTime!=null&&b.time<=this.lastTime)throw Error('Geometry candles must append chronologically');
  const gap=this.lastTime!=null&&b.time-this.lastTime!==frameMs(this.tf);this.lastTime=b.time;this.processed++;this.bars.push({...b});
  const knownAt=b.time+frameMs(this.tf),o=this.o;
  if(gap){this.ambiguities.push({kind:'gap',knownAt});this.segmentStart=this.bars.length-1;this.working=null;this.structure={direction:0,protected:null,lastHigh:null,lastLow:null};for(const family of ['local','structural'])this.pivots[family]={high:[],low:[]};for(const g of this.channels)if(!g.broken){g.broken=true;g.breakAt=b.time;g.gapEnded=true;}}
  for(const g of this.channels)if(!g.broken&&b.time>g.endAt){if(inside(g,b,this.tick)){g.endAt=b.time;if(touches(g,b,o.geometryTouchTolerance,this.tick))g.touches++;}else{g.broken=true;g.breakAt=b.time;}}
  const segment=this.bars.slice(this.segmentStart||0),i=segment.length-1;
  for(const [family,span,minSpan] of [['local',o.geometryPivot,o.geometryMinSpan],['structural',o.structuralPivot,o.structuralMinSpan]])for(const side of [1,-1]){
   const p=pivotAt(segment,i,span,side);if(!p)continue;const list=this.pivots[family][side>0?'high':'low'];
   const history=this.bars.slice(-o.geometryHistory),anchors=family==='local'?list.slice(-4).reverse():structuralAnchors(list);
   for(const a of anchors){const g=channelCandidate(history,a,p,side,{tick:this.tick,minSpan,tolerance:o.geometryTouchTolerance,knownAt,family,tf:this.tf});if(g)this.channels.push(g);}
   list.push(p);if(list.length>(family==='local'?8:24))list.shift();
   const same=this.channels.filter(g=>g.family===family);for(const old of same.slice(0,-48))this.channels.splice(this.channels.indexOf(old),1);
  }
  const span=Number(this.tf)<=5?o.microPivot:o.parentPivot,ps=[1,-1].map(side=>pivotAt(segment,i,span,side)).filter(Boolean);
  if(ps.length===2)this.ambiguities.push({kind:'dual-pivot',knownAt});else if(ps[0])this.addPivot(ps[0]);
  this.updateStructure(b,knownAt);
  // Keep the audit window plus enough pivot lookback; event/anchor ledgers are independent.
  if(this.bars.length>o.geometryHistory+64){const n=this.bars.length-(o.geometryHistory+64);this.bars.splice(0,n);this.segmentStart=Math.max(0,(this.segmentStart||0)-n);}
  if(this.ambiguities.length>100)this.ambiguities.shift();
 }
 snapshot(){return copy({frame:this.tf,tick:this.tick,closedThrough:this.lastTime==null?null:this.lastTime+frameMs(this.tf),coverageStart:this.bars[0]?.time,processed:this.processed,rawPivots:this.rawPivots,locked:this.locked,working:this.working,channels:this.channels,structure:this.structure,events:this.events,ambiguities:this.ambiguities});}
}
const stageNames={contact:'Contact',escape:'Channel escape',forming:'Turn forming',shift:'1M shift',retest:'Retest held',railRetest:'Rail retest held',failed:'Failed',expired:'Expired',unavailable:'Unavailable'};
export class MicroTurns {
 constructor({tick,inputs={},identity=''}={}){this.tick=tick;this.o=geometryOptions(inputs);this.identity=geometryEvidenceIdentity(identity,tick,inputs);this.candidates=[];this.events=[];this.previous=null;this.index=0;this.used=new Set();}
 event(c,stage,bar,extra={}){const e={id:`${c.id}:${stage}`,candidateId:c.id,side:c.side,family:c.family,frame:'1',stage,knownAt:bar.time+60000,price:bar.close,reference:c.reference,geometry:c.geometry,invalidation:c.invalidation,...extra};c.stage=stage;c.next=stage==='shift'?'Retest of frozen level':stage==='retest'||stage==='railRetest'?'Independent 5M / parent evidence':stage==='contact'||stage==='forming'||stage==='escape'?'Close through frozen 1M reference':'Fresh geometry contact';c.lastEvent=e;this.events.push(e);return e;}
 feed(bar,{channels=[],pivots=[],parents=[],available=true}={}){
  const now=bar.time+60000,tick=this.tick,prior=this.previous;this.index++;
  const gap=prior&&bar.time-prior.time!==60000;
  for(const c of this.candidates.filter(c=>!c.terminal)){
   if(!available||gap){this.event(c,'unavailable',bar);c.terminal=true;continue;}
   if(c.side*(c.side>0?bar.low-c.invalidation:bar.high-c.invalidation)<=-tick){this.event(c,'failed',bar);c.terminal=true;continue;}
   if(this.index-c.startIndex>=this.o.turnExpiry){this.event(c,'expired',bar);c.terminal=true;continue;}
   this.advance(c,bar,prior);
  }
  if(available&&prior&&!gap&&tick>0){
   // Only geometry and pivots published before this candle's close can seed a candidate.
   const eligible=channels.filter(g=>(g.touches||0)>=this.o.geometryMinTouches&&g.knownAt<=bar.time&&!g.gapEnded&&(!g.broken||g.breakAt+this.o.turnExpiry*60000>=bar.time));
   for(const side of [1,-1])for(const family of ['rejection','escape']){
    if(this.candidates.some(c=>!c.terminal&&c.side===side&&c.family===family))continue;
    const matches=eligible.filter(g=>{
     const v=channelBounds(g,bar.time),before=channelBounds(g,prior.time),slope=g.p1-g.p0;
     if(family==='escape')return (side>0?slope<0:slope>0)&&prior.close>=before.low&&prior.close<=before.high&&(side>0?bar.close>=v.high+tick:bar.close<=v.low-tick);
     const p=side>0?v.low:v.high;
     // A gap entirely past a boundary is not a touch/rejection.
     return side>0?bar.low<=p+2*tick&&bar.high>=p-2*tick&&bar.close>=p+tick:bar.high>=p-2*tick&&bar.low<=p+2*tick&&bar.close<=p-tick;
    }).sort((a,b)=>Number(b.frame)-Number(a.frame)||b.spanBars-a.spanBars||a.id.localeCompare(b.id));
    const g=matches.find(g=>!this.used.has(`${g.id}:${side}:${family}`));if(!g)continue;
    const ref=pivots.filter(p=>p.side===side&&p.knownAt<=bar.time).at(-1)||null;
    const c={id:`${this.identity}:${family}:${side}:${bar.time}`,side,family,startIndex:this.index,startedAt:now,reference:ref?copy(ref):null,invalidation:side>0?bar.low:bar.high,geometry:{...copy(g),projected:bar.time>g.endAt},parents:copy(parents),stage:family==='escape'?'escape':'contact',terminal:false,shiftAt:null};
    this.used.add(`${g.id}:${side}:${family}`);if(this.used.size>1000)this.used.delete(this.used.values().next().value);this.candidates.push(c);this.event(c,c.stage,bar,{gapEscape:family==='escape'&&(side>0?bar.low>channelBounds(g,bar.time).high:bar.high<channelBounds(g,bar.time).low)});this.advance(c,bar,prior);
   }
  }
  this.previous={...bar};if(this.candidates.length>200)this.candidates.splice(0,this.candidates.length-200);if(this.events.length>1000)this.events.splice(0,this.events.length-1000);
 }
 advance(c,bar,prior){
  const t=this.tick,side=c.side;
  if(!c.shiftAt){
   if(prior&&side*(bar.close-(side>0?prior.high:prior.low))>=t&&!c.formingAt){c.formingAt=bar.time+60000;this.event(c,'forming',bar);}
   if(c.reference&&side*(bar.close-c.reference.price)>=t){c.shiftAt=bar.time+60000;this.event(c,'shift',bar);}
  }else if(bar.time+60000>c.shiftAt){
   const ref=c.reference.price;
   if(!c.retestAt&&bar.low<=ref+2*t&&bar.high>=ref-2*t&&side*(bar.close-ref)>=t){c.retestAt=bar.time+60000;this.event(c,'retest',bar);}
   if(c.family==='escape'&&!c.railRetestAt){const v=channelBounds(c.geometry,bar.time),rail=side>0?v.high:v.low;if(bar.low<=rail+2*t&&bar.high>=rail-2*t&&side*(bar.close-rail)>=t){c.railRetestAt=bar.time+60000;this.event(c,'railRetest',bar);}}
  }
 }
 snapshot(){return copy({candidates:this.candidates,events:this.events});}
}
export function stageLabel(stage){return stageNames[stage]||stage;}

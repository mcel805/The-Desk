/** Source-clocked research observer. Never submits orders. */
export const REVISION='swing-warnings-1.3.0';
export const FEATURES=['SLOW','CHOP','REJECT','EXTENDED','LEVEL','DIVERGENCE','EFFORT','STRUCTURE'];
export const FAMILY=[0,0,1,2,3,0,4,5];
export const WEIGHTS=[2,2,1,2,1,3];
export const DEFAULTS=Object.freeze({window:5,atrLength:14,pivotBars:2,slowRatio:.7,efficiency:.45,overlap:.55,wick:.45,extension:3,rsiLength:14,rsiDelta:5,volumeLength:20,relativeVolume:1.5,effortProgress:.35,holdBars:3,volumeEnabled:false,momentumEnabled:true,maxEvents:300,maxBars:2000,cadenceMs:15000,gapMs:60000,side:0,tick:1,weights:Object.freeze([2,2,1,2,1,3])});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const mean=a=>a.reduce((n,x)=>n+x,0)/a.length;
const clamp=n=>Math.max(0,Math.min(1,n));
const sign=n=>Math.sign(n);
export function validateBar(b){
  if(!b||!Number.isSafeInteger(b.time)||b.time%60000!==0)throw Error('Aligned UTC one-minute time required');
  if(!['open','high','low','close'].every(k=>finite(b[k])&&b[k]>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error('Invalid OHLC');
  if(b.volume!=null&&(!finite(b.volume)||b.volume<0))throw Error('Invalid volume');
}
export function validateConfig(c){
  for(const k of ['window','atrLength','pivotBars','rsiLength','volumeLength','holdBars','maxEvents','maxBars','cadenceMs','gapMs'])if(!Number.isSafeInteger(c[k])||c[k]<1)throw Error('Invalid '+k);
  if(c.window<2||c.pivotBars<1||c.atrLength<2||c.rsiLength<2||c.volumeLength<2||c.cadenceMs!==15000||c.gapMs!==60000||c.maxEvents<8||c.maxBars<Math.max(2*c.window+1,c.volumeLength+1,c.atrLength+1,2*c.pivotBars+1,c.rsiLength+1))throw Error('Invalid sampling/history config');
  for(const k of ['slowRatio','efficiency','overlap','wick','effortProgress'])if(!finite(c[k])||c[k]<=0||c[k]>=1)throw Error('Invalid '+k);
  for(const k of ['extension','rsiDelta','relativeVolume','tick'])if(!finite(c[k])||c[k]<=0)throw Error('Invalid '+k);
  if(![-1,0,1].includes(c.side)||typeof c.volumeEnabled!=='boolean'||typeof c.momentumEnabled!=='boolean')throw Error('Invalid direction or optional feature');
  if(!Array.isArray(c.weights)||c.weights.length!==6||!c.weights.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=5))throw Error('Invalid family weights');
}
function simpleRsi(rows,n){
  if(rows.length<n+1)return null;
  const changes=rows.slice(-n-1).slice(1).map((b,i)=>b.close-rows[rows.length-n-1+i].close);
  const up=changes.reduce((a,x)=>a+Math.max(0,x),0),down=changes.reduce((a,x)=>a+Math.max(0,-x),0);
  return up+down===0?50:100*up/(up+down);
}
export function measurements(rows,side,anchor,c=DEFAULTS,pivot=null){
  const empty={available:false,severity:Array(8).fill(null),values:{},bullish:0};
  if(![-1,1].includes(side)||rows.length<Math.max(2*c.window+1,c.atrLength+1))return empty;
  const b=rows.at(-1),prev=rows.at(-2),w=c.window,priorRows=rows.slice(0,-1);
  const tr=rows.slice(-c.atrLength).map((x,j)=>{const p=rows[rows.length-c.atrLength+j-1];return Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));});
  const atr=mean(tr),range=Math.max(c.tick,b.high-b.low);
  if(atr<c.tick/100)return empty;
  const speed=side*(b.close-rows.at(-w-1).close)/w,prior=side*(rows.at(-w-1).close-rows.at(-2*w-1).close)/w;
  const travel=rows.slice(-w).reduce((a,x,j)=>a+Math.abs(x.close-rows[rows.length-w+j-1].close),0);
  const efficiency=travel?Math.abs(b.close-rows.at(-w-1).close)/travel:0;
  const overlaps=rows.slice(-w).map((x,j)=>{const p=rows[rows.length-w+j-1];return clamp((Math.min(x.high,p.high)-Math.max(x.low,p.low))/Math.max(c.tick,Math.min(x.high-x.low,p.high-p.low)));});
  const overlap=mean(overlaps),ratio=prior>=c.tick/w?Math.max(0,speed)/prior:null;
  const peak=side===1?Math.max(...rows.slice(-w-1).map(x=>x.high)):Math.min(...rows.slice(-w-1).map(x=>x.low));
  const near=side*(peak-(side===1?b.high:b.low))<=atr*.5;
  const rejection=side===1?(b.high-Math.max(b.open,b.close))/range:(Math.min(b.open,b.close)-b.low)/range;
  const clv=side===1?(b.close-b.low)/range:(b.high-b.close)/range;
  const rejected=near&&rejection>=c.wick&&clv<=.5;
  const extension=anchor==null?null:side*((side===1?b.high:b.low)-anchor)/atr;
  const rsi=simpleRsi(rows,c.rsiLength);
  const divergence=c.momentumEnabled&&pivot&&finite(pivot.rsi)&&finite(rsi)?(side===1?peak>pivot.price+c.tick&&rsi<pivot.rsi-c.rsiDelta:peak<pivot.price-c.tick&&rsi>pivot.rsi+c.rsiDelta):null;
  const vols=priorRows.slice(-c.volumeLength).map(x=>x.volume),volumeAvailable=c.volumeEnabled&&vols.length===c.volumeLength&&vols.every(x=>finite(x)&&x>0)&&finite(b.volume)&&b.volume>0;
  const relativeVolume=volumeAvailable?b.volume/mean(vols):null;
  const body=Math.abs(b.close-b.open)/range;
  return {available:true,severity:[ratio==null?null:ratio<c.slowRatio?(speed<=0?2:1):0,efficiency<c.efficiency&&overlap>=c.overlap?1:0,rejected?1:0,extension==null?null:extension>=c.extension?1:0,null,divergence==null?null:near&&divergence?1:0,volumeAvailable?near&&relativeVolume>=c.relativeVolume&&body<c.effortProgress?1:0:null,0],values:{atr,speed,priorSpeed:prior,speedRatio:ratio,efficiency,overlap,rejection,closeLocation:clv,extension,rsi,relativeVolume,bodyFraction:body,peak,close:b.close},bullish:Number(speed>0&&efficiency>=.6)+Number(clv>=.7&&side*(b.close-b.open)>0)};
}
export class WarningEngine{
  constructor(config={}){this.config={...DEFAULTS,...config,weights:[...(config.weights??DEFAULTS.weights)]};validateConfig(this.config);Object.freeze(this.config.weights);Object.freeze(this.config);this.rows=[];this.events=[];this.active=Array(8).fill(null);this.liveEpisodes=Array(8).fill(null);this.liveSequence=0;this.sequence=0;this.swing=0;this.side=0;this.anchor=null;this.lastClosed=null;this.lastSlot=null;this.lastObserved=null;this.protected=null;this.extremePivot=null;this.broken=null;this.stage=0;this.levels=[];this.levelContact=null;this.lastSnapshot=null;this.snapshots=0;this.resetReason=null;}
  setLevels(levels,observedAt){
    if(!Number.isSafeInteger(observedAt))throw Error('Level receipt clock required');
    const previous=new Map(this.levels.map(x=>[x.id,x]));
    this.levels=levels.map(x=>{if(!x||!['upper','lower'].includes(x.side)||!finite(x.price)||x.price<=0||!Number.isSafeInteger(x.knownAt)||x.knownAt>observedAt||!x.id)throw Error('Invalid level provenance');const old=previous.get(x.id);const availableAt=old&&['price','side','knownAt'].every(k=>old[k]===x[k])?old.availableAt:observedAt;return {...x,availableAt};});
  }
  emit(kind,at,data={}){const event={revision:REVISION,seq:++this.sequence,swing:this.swing,kind,at,...structuredClone(data)};this.events.push(event);if(this.events.length>this.config.maxEvents)this.events.shift();return event;}
  clear(at,reason){for(let i=0;i<8;i++)if(this.active[i]){this.emit('CLEARED',at,{feature:FEATURES[i],episode:this.active[i].id,reason});this.active[i]=null;}}
  start(side,at){this.clear(at,'SWING_CHANGED');this.liveEpisodes=Array(8).fill(null);this.side=side;this.swing++;const b=this.rows.at(-1);this.anchor=side===1?Math.min(...this.rows.slice(-2*this.config.window-1).map(x=>x.low)):Math.max(...this.rows.slice(-2*this.config.window-1).map(x=>x.high));this.protected=null;this.extremePivot=null;this.broken=null;this.stage=0;this.levelContact=null;this.emit('SWING',at,{side,anchor:this.anchor,originAt:b.time,knownAt:at});}
  feed(bar,observedAt=bar.time+60000){
    validateBar(bar);if(!Number.isSafeInteger(observedAt)||observedAt<bar.time+60000)throw Error('Closed bar observed before close');
    if(this.lastClosed!=null&&bar.time<=this.lastClosed)throw Error('Duplicate or out-of-order close');
    if(this.lastClosed!=null&&bar.time!==this.lastClosed+60000){this.clear(observedAt,'DATA_GAP');this.emit('DATA_GAP',observedAt);this.rows=[];this.side=0;this.protected=null;this.extremePivot=null;this.broken=null;this.stage=0;this.levelContact=null;}
    this.rows.push({...bar});if(this.rows.length>this.config.maxBars)this.rows.shift();this.lastClosed=bar.time;
    const c=this.config,w=c.window;
    if(this.side&&c.side===0&&this.stage>=3)this.start(-this.side,observedAt);
    else if(!this.side&&this.rows.length>=Math.max(2*w+1,c.atrLength+1)){const d=c.side||sign(bar.close-this.rows.at(-w-1).close);if(d)this.start(d,observedAt);}
    const m=this.assess(this.rows,observedAt,true);
    for(let i=0;i<8;i++){
      const severity=m.severity[i],old=this.active[i];
      if(severity>0){
        if(!old){const firstSeen=this.liveEpisodes[i]?.firstSeen??observedAt;const ev=this.emit('START',observedAt,{feature:FEATURES[i],severity,side:-this.side,originAt:bar.time,firstObserved:firstSeen,knownAt:observedAt,value:this.featureValue(i,m)});this.active[i]={id:ev.seq,firstSeen,firstConfirmed:observedAt,originAt:bar.time,severity,updates:1};}
        else{old.updates++;if(old.severity!==severity){old.severity=severity;this.emit('UPDATE',observedAt,{feature:FEATURES[i],episode:old.id,severity});}}
      }else if(old){this.emit('CLEARED',observedAt,{feature:FEATURES[i],episode:old.id,reason:severity==null?'UNAVAILABLE':'REPAIRED'});this.active[i]=null;}
    }
    this.recognize(observedAt,m.values.rsi);
    this.lastSnapshot=this.snapshot(m,observedAt,false);return structuredClone(this.lastSnapshot);
  }
  featureValue(i,m){return [m.values.speedRatio,m.values.efficiency,m.values.rejection,m.values.extension,m.values.level,m.values.rsi,m.values.relativeVolume,m.values.protected][i]??null;}
  recognize(at){
    const n=this.config.pivotBars;if(this.rows.length<2*n+1)return;
    const window=this.rows.slice(-2*n-1),center=window[n],others=window.filter((_,i)=>i!==n);
    const high=others.every(b=>center.high>b.high),low=others.every(b=>center.low<b.low);
    if(high===low)return;
    const side=high?1:-1,price=high?center.high:center.low;
    if(side===this.side)this.extremePivot={price,rsi:simpleRsi(this.rows.slice(0,-n),this.config.rsiLength),origin:center.time,known:at};
    else if(this.protected==null||this.side*(price-this.protected.price)>0)this.protected={price,origin:center.time,known:at};
  }
  assess(rows,at,commit=false){
    const c=this.config,m=measurements(rows,this.side,this.anchor,c,this.extremePivot);if(!m.available)return m;
    const b=rows.at(-1),prior=rows.slice(0,-1),minor=this.side===1?Math.min(...prior.slice(-3).map(x=>x.low)):Math.max(...prior.slice(-3).map(x=>x.high));
    const relevant=this.levels.filter(x=>x.side===(this.side===1?'upper':'lower')&&x.knownAt<=b.time&&x.availableAt<=at);
    let contact=this.levelContact;
    for(const level of relevant)if(this.side*((this.side===1?b.high:b.low)-level.price)>=0)contact={...level,bar:b.time};
    const levelAvailable=relevant.length>0;
    m.values.level=contact?.price??null;m.values.levelKnownAt=contact?.knownAt??null;m.values.levelAvailableAt=contact?.availableAt??null;
    m.severity[4]=!levelAvailable?null:contact&&b.time-contact.bar<c.holdBars*60000&&this.side*(b.close-contact.price)<=0?2:0;
    if(commit)this.levelContact=contact;
    let stage=this.stage,broken=this.broken;
    const microBreak=this.side*(b.close-minor)<-c.tick/2;
    const majorBreak=this.protected&&this.protected.known<=b.time&&this.side*(b.close-this.protected.price)<-c.tick/2;
    if(broken&&this.side*(b.close-broken.level)>c.tick){stage=0;broken=null;}
    if(majorBreak){stage=Math.max(stage,2);if(!broken||broken.kind!=='protected')broken={level:this.protected.price,at,kind:'protected'};}
    else if(microBreak&&stage===0){stage=1;broken={level:minor,at,kind:'micro'};}
    if(broken&&at>broken.at&&this.side*((this.side===1?b.high:b.low)-broken.level)>=0&&this.side*(b.close-broken.level)<0)stage=broken.kind==='protected'?3:Math.max(stage,1);
    if(broken?.kind==='protected'&&stage>=2&&b.time+60000-broken.at>=c.pivotBars*60000&&this.side*(b.close-broken.level)<0&&m.values.speed<0)stage=3;
    if(commit){this.stage=stage;this.broken=broken;}
    m.severity[7]=stage;m.values.protected=this.protected?.price??null;m.values.minor=minor;m.values.breakLevel=broken?.level??null;
    m.bullish+=Number(this.protected!=null&&this.side*((this.side===1?b.low:b.high)-this.protected.price)>=0)+Number(this.broken!=null&&this.side*(b.close-this.broken.level)>c.tick);
    return m;
  }
  observe(forming,observedAt,{sourceAt=observedAt}={}){
    validateBar(forming);if(!Number.isSafeInteger(observedAt)||observedAt<forming.time||observedAt>=forming.time+60000||!Number.isSafeInteger(sourceAt)||sourceAt>observedAt+1000||observedAt-sourceAt>20000)throw Error('Invalid or stale intrabar clock');
    if(this.lastObserved!=null&&observedAt<this.lastObserved)throw Error('Observation clock moved backward');
    if(this.lastClosed==null||forming.time!==this.lastClosed+60000)throw Error('Missing adjacent completed bar');
    const slot=Math.floor(observedAt/this.config.cadenceMs);if(this.lastSlot===slot)return null;
    this.lastSlot=slot;this.lastObserved=observedAt;this.snapshots++;
    const m=this.assess([...this.rows,forming],observedAt,false);
    // A partial minute's volume cannot be compared with full-minute volume.
    m.severity[6]=null;m.values.relativeVolume=null;
    for(let i=0;i<8;i++){if(m.severity[i]>0){this.liveEpisodes[i]??={id:++this.liveSequence,firstSeen:observedAt};this.liveEpisodes[i].severity=m.severity[i];}else this.liveEpisodes[i]=null;}
    return {...this.snapshot(m,observedAt,true),liveEpisodes:structuredClone(this.liveEpisodes)};
  }
  snapshot(m,at,provisional){
    const groups=Array(6).fill(null),available=Array(6).fill(false);
    for(let i=0;i<8;i++)if(m.severity[i]!=null){const f=FAMILY[i];groups[f]=Math.max(groups[f]??0,Math.min(2,m.severity[i]));available[f]=true;}
    const max=available.reduce((n,x,i)=>n+(x?2*this.config.weights[i]:0),0),weighted=groups.reduce((n,x,i)=>n+(x??0)*this.config.weights[i],0);
    const pressure=m.available&&max?100*weighted/max:null;
    const stage=m.severity[7]??0;
    return {schema:'agentic.swing.warnings.v1',revision:REVISION,symbol:null,featureConfig:JSON.stringify(this.config),observedAt:at,closedCutoff:this.lastClosed==null?null:this.lastClosed+60000,provisional,swing:this.swing,side:this.side,anchor:this.anchor,severity:[...m.severity],values:{...m.values},deliverySupport:m.bullish,pressure,coverage:available.map(x=>x?'1':'0').join(''),activeFamilies:groups.filter(x=>x>0).length,availableFamilies:available.filter(Boolean).length,stage,state:!m.available?'UNAVAILABLE':stage>=3?'CONFIRMED_LOCAL_TURN':stage>=2?'PROTECTED_LEVEL_BROKEN':stage===1?'LOCAL_TURN':m.severity.some(x=>x>0)?'CAUTION':'TRACKING',probability:null,probabilityStatus:'UNCALIBRATED',episodes:structuredClone(this.active),sequence:this.sequence};
  }
}

// Independent OHLCV definitions. No bid/ask delta or proprietary TTP parity.
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const finite=Number.isFinite;
export const GV_VERSION='desk-geometry-volume.2';
export const GV_DEFAULTS={areaTicks:4,areaAtr:.12,confluenceFrames:2,sweepPivot:1,sweepMinTicks:4,sweepMinAtr:.25,reclaimBars:3,abcPivot:2,campaignBars:90,retestBars:20,volumeWindow:16,volumeExpiry:12,requireDivergence:true,requireValueArea:true,vwapAnchorHour:0,valueSigma:1,minRewardRisk:3,stopTicks:2,feeBps:5,slippageTicks:1,abcFocus:true,showContext:true,showVolume:true,showABC:true,showPaperLevels:true,showHistory:false,contextFrame:'15'};
const ranges={areaTicks:[0,100],areaAtr:[0,2],confluenceFrames:[1,5],sweepPivot:[1,10],sweepMinTicks:[1,100],sweepMinAtr:[0,3],reclaimBars:[0,20],abcPivot:[1,10],campaignBars:[10,300],retestBars:[2,100],volumeWindow:[7,50],volumeExpiry:[1,60],vwapAnchorHour:[0,23],valueSigma:[.5,3],minRewardRisk:[1,10],stopTicks:[1,50],feeBps:[0,100],slippageTicks:[0,20]};
export function gvOptions(inputs={}){const o={...GV_DEFAULTS,...inputs};for(const [k,[lo,hi]]of Object.entries(ranges)){const raw=o[k],n=typeof raw==='number'||typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;o[k]=finite(n)?Math.max(lo,Math.min(hi,n)):GV_DEFAULTS[k];if(!['areaAtr','sweepMinAtr','minRewardRisk','feeBps','valueSigma'].includes(k))o[k]=Math.round(o[k]);}for(const k of ['abcFocus','requireDivergence','requireValueArea','showContext','showVolume','showABC','showPaperLevels','showHistory'])if(typeof o[k]!=='boolean')o[k]=GV_DEFAULTS[k];if(!['60','30','15'].includes(String(o.contextFrame)))o.contextFrame='15';return o;}
export const gvCalculationOptions=inputs=>{const o=gvOptions(inputs);return {...Object.fromEntries(Object.keys(ranges).map(k=>[k,o[k]])),requireDivergence:o.requireDivergence,requireValueArea:o.requireValueArea};};
export function strictPivot(bars,span,side){const i=bars.length-1-span;if(i<span)return null;const p=bars[i],field=side>0?'high':'low';for(let j=i-span;j<=i+span;j++)if(j!==i&&(side>0?bars[j][field]>=p[field]:bars[j][field]<=p[field]))return null;return {id:`${side}:${p.time}`,side,time:p.time,price:p[field],knownAt:bars.at(-1).time+60000};}

export class VolumeEvidence {
 constructor(tf,{window=16,pivot=2,anchorHour=0}={}){this.tf=String(tf);this.window=window;this.pivot=pivot;this.anchorHour=anchorHour;this.reset();}
 reset(){this.bars=[];this.rows=[];this.divergences=[];this.gapResets=(this.gapResets||0)+1;this.gain=null;this.loss=null;this.pivots=[];this.vwapSession=null;}
 feed(b){
  const previous=this.bars.at(-1),duration=Number(this.tf)*60000;
  if(previous&&b.time-previous.time!==duration)this.reset();
  const prior=this.bars.at(-1),history=this.rows.slice(-20),range=b.high-b.low,density=range>0?b.volume/range:null,baseline=history.length===20?mean(history.map(r=>r.volume)):null;
  const delta=prior?b.close-prior.close:0,changes=this.bars.slice(-14).map((v,i,a)=>i?v.close-a[i-1].close:null).filter(finite);
  changes.push(delta);const moves=changes.slice(-14);
  const gains=mean(moves.map(v=>Math.max(0,v))),losses=mean(moves.map(v=>Math.max(0,-v))),rsi=prior&&this.bars.length>=14?(losses===0?(gains===0?50:100):100-100/(1+gains/losses)):null;
  const last=this.rows.slice(-(this.window-1)),ready=last.length===this.window-1&&baseline>0&&b.volume>0,score=b.volume*range;
  const climax=ready&&range>0&&score>=Math.max(...last.map(r=>r.score)),churn=ready&&density!=null&&b.volume>baseline&&density>=Math.max(...last.map(r=>r.density??-Infinity));
  const row={time:b.time,knownAt:b.time+duration,volume:b.volume,range,density,score,relative:baseline>0?b.volume/baseline:null,baseline,rsi,ready,climax,churn,twoBar:churn&&this.rows.at(-1)?.climax===true,low:ready&&b.volume<Math.min(...this.rows.slice(-6).map(r=>r.volume)),atr:this.bars.length>=14?mean([...this.bars.slice(-13),b].map((v,i,a)=>{const prev=i?a[i-1]:this.bars.at(-14);return Math.max(v.high-v.low,prev?Math.abs(v.high-prev.close):0,prev?Math.abs(v.low-prev.close):0);})):null,scope:'venue OHLCV · rolling RV20, not same-time RVOL'};
  const anchor=Math.floor((b.time-this.anchorHour*3600000)/86400000)*86400000+this.anchorHour*3600000;
  if(this.vwapSession?.anchor!==anchor)this.vwapSession={anchor,complete:b.time===anchor,volume:0,pv:0,p2v:0};
  const session=this.vwapSession,typical=(b.high+b.low+b.close)/3;session.volume+=b.volume;session.pv+=typical*b.volume;session.p2v+=typical*typical*b.volume;
  const vwap=session.volume>0?session.pv/session.volume:null;row.vwap={anchor,complete:session.complete,value:vwap,sigma:vwap!=null?Math.sqrt(Math.max(0,session.p2v/session.volume-vwap*vwap)):null,scope:'bar-typical-price UTC-anchored VWAP / SD approximation'};
  this.bars.push({...b});this.rows.push(row);
  // Confirmation time uses this source frame's close, never the anchor time.
  for(const side of [1,-1]){const p=strictPivot(this.bars,this.pivot,side);if(!p)continue;p.knownAt=b.time+duration;const at=this.rows.find(r=>r.time===p.time),old=this.pivots.filter(v=>v.side===side).at(-1);
   if(old&&at&&side*(p.price-old.price)>0){const momentum=finite(at.rsi)&&finite(old.rsi)&&side*(at.rsi-old.rsi)<0,volume=finite(at.relative)&&finite(old.relative)&&at.relative<old.relative;if(momentum||volume)this.divergences.push({id:this.tf+':'+p.id,frame:this.tf,side:-side,anchor:p.time,knownAt:p.knownAt,momentum,volume,price:p.price});}
   this.pivots.push({...p,rsi:at?.rsi,relative:at?.relative});
  }
  if(this.bars.length>1200){this.bars.shift();this.rows.shift();}if(this.pivots.length>100)this.pivots.shift();if(this.divergences.length>100)this.divergences.shift();return row;
 }
 snapshot(){return structuredClone({frame:this.tf,latest:this.rows.at(-1)||null,recent:this.rows.slice(-600),divergences:this.divergences,gapResets:this.gapResets-1});}
}

export class SweepEvidence {
 constructor({tick,inputs={}}){this.tick=tick;this.o=gvOptions(inputs);this.bars=[];this.pools=[];this.pending=[];this.events=[];this.seen=new Set();this.lastPivot=null;}
 reset(){this.bars=[];this.pools=[];this.pending=[];this.lastPivot=null;}
 feed(b,atr){
  const prior=this.bars.at(-1);if(prior&&b.time-prior.time!==60000)this.reset();
  const now=b.time+60000,newSweeps=[];
  for(const pool of this.pools.filter(p=>!p.consumed&&p.knownAt<=b.time))if(pool.side>0?b.high>=pool.price+this.tick:b.low<=pool.price-this.tick){pool.consumed=true;const s={id:'sweep:'+pool.id,side:-pool.side,pool:structuredClone(pool),sweptAt:now,knownAt:now,extreme:pool.side>0?b.high:b.low,stage:'swept',ambiguous:false};newSweeps.push(s);}
  const ambiguous=new Set(newSweeps.map(s=>s.side)).size>1;
  for(const s of newSweeps){s.ambiguous=ambiguous;this.events.push(s);if(!ambiguous)this.pending.push(s);}
  for(const p of this.pending){p.extreme=p.side>0?Math.min(p.extreme,b.low):Math.max(p.extreme,b.high);
   if(now-p.sweptAt>this.o.reclaimBars*60000){p.stage='expired';continue;}
   if(p.side*(b.close-p.pool.price)>0){p.stage='reclaimed';p.reclaimedAt=now;p.knownAt=now;p.price=b.close;}
  }
  this.pending=this.pending.filter(s=>s.stage==='swept');this.bars.push({...b,atr});
  for(const side of [1,-1]){const p=strictPivot(this.bars,this.o.sweepPivot,side);if(!p||this.seen.has(p.id))continue;this.seen.add(p.id);
   const threshold=Math.max(this.o.sweepMinTicks*this.tick,this.o.sweepMinAtr*(this.bars.find(b=>b.time===p.time)?.atr||0));
   if(this.lastPivot&&this.lastPivot.side!==side&&Math.abs(p.price-this.lastPivot.price)<threshold)continue;
   this.pools.push({...p,consumed:false});this.lastPivot=p;
  }
  if(this.bars.length>100)this.bars.shift();this.pools=this.pools.filter(p=>b.time-p.time<300*60000).slice(-100);this.events=this.events.slice(-200);while(this.seen.size>1000)this.seen.delete(this.seen.values().next().value);
  return newSweeps;
 }
 reclaimed(side,since,now){return this.events.filter(s=>s.side===side&&s.stage==='reclaimed'&&!s.ambiguous&&s.sweptAt>=since&&s.reclaimedAt<=now).at(-1)||null;}
 snapshot(){return structuredClone({pools:this.pools,events:this.events});}
}

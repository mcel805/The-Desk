import {GEOMETRY_FRAMES,frameMs,validateBars,aggregateThirty} from './market-geometry-model.mjs';
const same=(a,b)=>['time','open','high','low','close','volume'].every(k=>a[k]===b[k]);
const aggregateThirtyForming=(bars,forming,cutoff)=>{
 if(!forming||forming.time!==Math.floor(cutoff/frameMs('15'))*frameMs('15')||forming.time+frameMs('15')<=cutoff)return null;
 const bucket=Math.floor(forming.time/frameMs('30'))*frameMs('30'),first=bars.find(b=>b.time===bucket);
 if(!first||forming.time!==bucket+frameMs('15'))return null;
 return {time:bucket,open:first.open,high:Math.max(first.high,forming.high),low:Math.min(first.low,forming.low),close:forming.close,volume:first.volume+forming.volume};
};
export function geometryCutoff(req,now=Date.now(),context={}){
 if(req.mode==='live'&&context.replay===false)return now;
 if(Number.isFinite(context.cutoff))return Math.min(now,context.cutoff);
 const last=(req.getBars?.()||req.bars||[]).at(-1);return last?Math.min(now,last.time+frameMs(req.market.timeframe)):now;
}
export function verifiedGeometryTick(market){
 const info=market?.symbolInfo,id=String(info?.tickerid||'').toLowerCase();
 return info&&id===String(market.symbol).toLowerCase()&&Number.isFinite(info.mintick)&&info.mintick>0&&info.timezone?info.mintick:null;
}
export class GeometrySources {
 constructor(fetchSeries,market,{history=600,now=Date.now}={}){this.fetchSeries=fetchSeries;this.market=structuredClone(market);this.history=history;this.now=now;this.cache=new Map();this.stopped=false;}
 stop(){this.stopped=true;this.cache.clear();}
 invalidate(){this.cache.clear();}
 async read(tf,cutoff,depth){
  if(this.stopped)throw Error('Geometry source cancelled');
  const ms=frameMs(tf),through=Math.floor(cutoff/ms)*ms,prior=this.cache.get(tf);
  if(prior?.through===through&&this.now()-prior.fetchedAt<15000)return prior;
  const from=prior&&through>=prior.through?Math.max(prior.bars[0]?.time||0,prior.through-2*ms):undefined;
  const range={to:cutoff,...(from==null?{limit:depth+2}:{from})};
  const raw=await this.fetchSeries(this.market.symbol,tf,range);
  if(this.stopped)throw Error('Geometry source cancelled');
  const fresh=validateBars(raw,tf,cutoff);if(!fresh.length)throw Error('No completed '+tf+' candles');
  let correction=false;
  if(prior)for(const b of fresh){const old=prior.bars.find(p=>p.time===b.time);if(old&&!same(old,b))correction=true;}
  const joined=validateBars([...(prior&&through>=prior.through?prior.bars:[]),...fresh],tf,cutoff).slice(-Math.max(depth+64,128));
  const forming=raw.find(b=>b.time===Math.floor(cutoff/ms)*ms&&b.time+ms>cutoff);
  const value={bars:joined,forming,through,fetchedAt:this.now(),correction};this.cache.set(tf,value);return value;
 }
 async load(cutoff){
  const coinbase=this.market.symbol.toLowerCase().startsWith('coinbase:'),requests=GEOMETRY_FRAMES.filter(tf=>!(coinbase&&tf==='30'));
  const settled=await Promise.allSettled(requests.map(async tf=>[tf,await this.read(tf,cutoff,coinbase&&tf==='15'?this.history*2+2:this.history)]));
  const out={};settled.forEach((r,i)=>{const tf=requests[i];if(r.status==='fulfilled')out[tf]={...r.value[1],aggregation:'native'};else out[tf]={bars:[],error:String(r.reason?.message||r.reason)};});
  if(coinbase){const source=out['15'];if(source.error)out['30']={bars:[],error:'15M components unavailable'};else{const agg=aggregateThirty(source.bars,cutoff);out['30']={...source,bars:agg.bars.slice(-this.history),forming:aggregateThirtyForming(source.bars,source.forming,cutoff),aggregation:agg.aggregation,missingComponents:agg.missing.filter(t=>t>=(agg.bars.slice(-this.history)[0]?.time??Infinity))};}}
  for(const tf of GEOMETRY_FRAMES){
   const s=out[tf],ms=frameMs(tf);s.frame=tf;s.symbol=this.market.symbol;s.observedAt=this.now();s.bars=s.bars.slice(-this.history);s.coverageStart=s.bars[0]?.time??null;s.closedThrough=s.bars.at(-1)?.time+ms||null;s.gaps=[];
   for(let i=1;i<s.bars.length;i++)if(s.bars[i].time-s.bars[i-1].time!==ms)s.gaps.push({from:s.bars[i-1].time+ms,to:s.bars[i].time});
   s.expectedThrough=Math.floor(cutoff/ms)*ms;s.stale=!s.closedThrough||s.closedThrough<s.expectedThrough;s.status=s.error?'unavailable':s.stale?'stale':s.gaps.length||s.missingComponents?.length?'partial':'ready';
  }
  return out;
 }
}

import {elliotHistoryFrames,elliotHistoryEnd} from './elliot-history.mjs';
import {elliotRefreshGate} from './pine-refresh.mjs';
import {requiredSecondaryHistory} from './pine-history.mjs';
import {ABCReversalWorker,isABCSource} from './abc-reversal-bridge.mjs';
import {liquidityDisplayModel} from './pine-compat/liquidity-display.mjs';
import {PineWorkerEngine} from './vendor/pine-engine.js';
import {checkPineSource,drawingCounts} from './pine-validation.mjs';

const CLEO_INDICATOR_DECL='indicator("Cleo\'s Liquidity", "Cleo\'s Liquidity"';
const isCleoLiquiditySource=source=>typeof source==='string'&&source.includes(CLEO_INDICATOR_DECL)&&/f_confirmedMaster\s*\(/.test(source)&&/f_marketSource\s*\(/.test(source);
export const isAgenticElliotSource=source=>typeof source==='string'&&source.includes('indicator("Agentic - Elliot Waves", "Agentic - Elliot Waves"')&&/f_reconstruct\s*\(/.test(source)&&/f_capture\s*\(/.test(source);
export const isAgenticLiquiditySource=source=>typeof source==='string'&&source.includes('indicator("Agentic - Liquidity", "Agentic - Liquidity"')&&/f_masterPools\s*\(/.test(source)&&/f_smallCount\s*\(/.test(source);
export const isAgenticMarketGeometrySource=source=>typeof source==='string'&&source.includes('indicator("Agentic - Market Geometry", "Agentic - Market Geometry"')&&/f_geometryCandidate\s*\(/.test(source)&&/f_drawWickChannels\s*\(/.test(source);
const needsCompatibleWorker=source=>isCleoLiquiditySource(source)||isAgenticElliotSource(source)||isAgenticLiquiditySource(source)||isAgenticMarketGeometrySource(source)||isABCSource(source);
const CLEO_EXECUTION_TIMEOUT=120000;
export const pineWorkerOptions=source=>needsCompatibleWorker(source)?{workerUrl:new URL("./vendor/pine-compatible-worker.js",import.meta.url).href}:{};

// Each study owns a worker. Cancelling a test cannot stop installed studies.
export class DeskPineEngine {
 language='pine';capabilities={streaming:true,visibleRange:true,inputs:true,props:true};
 constructor({factory=null,compileTimeout=15000,executionTimeout=30000,onStatus=()=>{},now=Date.now}={}){this.onStatus=onStatus;this.now=now;this.abcListeners=new Set();this.factory=factory||((source)=>isABCSource(source)?new ABCReversalWorker({records:this.records,subscribe:fn=>{this.abcListeners.add(fn);return ()=>this.abcListeners.delete(fn);}}):new PineWorkerEngine(pineWorkerOptions(source)));this.compileTimeout=compileTimeout;this.executionTimeout=executionTimeout;this.records=new Map();this.active=new Map();this.workers=new Map();}
 async prepare(source,id){
  checkPineSource(source);const worker=this.factory(source);let timer,rejectPending;
  const entry={worker,cancel:()=>rejectPending?.(Error('Pine test cancelled.'))};this.workers.set(id,entry);
  try{return await Promise.race([worker.prepare(source,id),new Promise((_,reject)=>{rejectPending=reject;timer=setTimeout(()=>reject(Error('Pine compilation exceeded 15 seconds.')),this.compileTimeout);})]);}
  catch(error){worker.terminate();if(this.workers.get(id)===entry)this.workers.delete(id);this.onStatus({id,source,error});throw error;}finally{clearTimeout(timer);}
 }
 execute(req,handlers){
  const source=req.prepared.token.source,elliot=isAgenticElliotSource(source),refresh=elliot?elliotRefreshGate(this.now):null;
  const getBars=()=>req.getBars?.()||req.bars;refresh?.mark(getBars());
  const id=req.prepared.token.instanceId;let entry=this.workers.get(id);if(!entry){entry={worker:this.factory(req.prepared.token.source)};this.workers.set(id,entry);}
  let timer,stopped=false,session,studyRevision=0,dataRevision=0;const secondary=[],seriesCache=new Map(),executionTimeout=needsCompatibleWorker(req.prepared.token.source)?CLEO_EXECUTION_TIMEOUT:this.executionTimeout;
  const clear=()=>{clearTimeout(timer);timer=null;};
  const fail=error=>{if(stopped)return;clear();result.stop();this.onStatus({id,source,error});if(elliot&&typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent('desk:agentic-elliot-model',{detail:{id,model:null}}));handlers.onError?.(error);};
  const arm=()=>{if(timer||stopped)return;timer=setTimeout(()=>fail(Error(`Pine execution exceeded ${executionTimeout/1000} seconds. Reduce history or script complexity.`)),executionTimeout);};
  const fetchSeries=async(symbol,timeframe,range)=>{const key=JSON.stringify([symbol,timeframe,range?.from??null,range?.to??null,range?.limit??null,studyRevision,dataRevision]);let task=seriesCache.get(key);if(!task){task=requiredSecondaryHistory(req.fetchSeries?.bind(req),symbol,timeframe,range,{stopped:()=>stopped});seriesCache.set(key,task);if(seriesCache.size>32)seriesCache.delete(seriesCache.keys().next().value);}let bars;try{bars=await task;}catch(e){seriesCache.delete(key);throw e;}secondary.push({symbol,timeframe,bars:bars.length,first:bars[0].time,last:bars.at(-1).time});return bars;};
  let preloaded=false;const preload=()=>{if(preloaded||!elliot||!req.market?.symbol?.toLowerCase().startsWith('hyperliquid:')||!req.fetchSeries||!getBars()?.length)return;preloaded=true;try{const range={to:elliotHistoryEnd(getBars(),req.market.timeframe),limit:req.inputs?.sourceBars||3000};for(const frame of elliotHistoryFrames(req.inputs,req.market.timeframe))void fetchSeries(req.market.symbol.replace(/^[^:]+:/,prefix=>prefix.toLowerCase()),frame,range).catch(()=>{});}catch{/* Unsupported chart resolutions retain the normal worker path. */}};
  const result={stop:()=>{if(stopped)return;stopped=true;clear();this.onStatus({id,source,error:null});session?.stop();entry.worker.terminate();if(this.workers.get(id)===entry)this.workers.delete(id);if(this.active.get(id)===result){this.records.delete(id);this.active.delete(id);if(isABCSource(req.prepared.token.source)&&!id.startsWith('pine-test-')&&typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent('desk:agentic-abc-model',{detail:{id,model:null}}));if(isAgenticLiquiditySource(req.prepared.token.source))for(const notify of this.abcListeners)notify();}},cancel:()=>fail(Error('Pine test cancelled.')),update:(...args)=>{if(!stopped){studyRevision+=1;arm();session.update(...args);}},setVisibleRange:r=>{if(!stopped){arm();session.setVisibleRange(r);}},notifyBars:reason=>{if(!stopped){if(!isABCSource(source)&&reason!=='backfill'&&!getBars()?.length){fail(Error('Chart candle history unavailable. Reload the chart after the public data feed recovers.'));return;}if(refresh&&!refresh.accepts(reason,getBars()))return;if(reason!=='backfill'){dataRevision+=1;arm();}if(reason==='complete')preload();session.notifyBars(reason);}},getContext:select=>{if(stopped)return Promise.resolve(null);let contextTimer;return Promise.race([session.getContext(select),new Promise((_,reject)=>{contextTimer=setTimeout(()=>reject(Error('Pine context request timed out.')),15000);})]).finally(()=>clearTimeout(contextTimer));}};
  this.active.set(id,result);entry.cancel=result.cancel;
  if(!isABCSource(source)&&req.historyState!=='backfill'&&!getBars()?.length){queueMicrotask(()=>fail(Error('Chart candle history unavailable. Reload the chart after the public data feed recovers.')));return result;}
  if(req.historyState!=='backfill'){arm();preload();}
  session=entry.worker.execute({...req,fetchSeries},{...handlers,onModel:model=>{if(stopped)return;clear();this.onStatus({id,source,error:null});if(isAgenticLiquiditySource(req.prepared.token.source))model=liquidityDisplayModel(model);const counts=drawingCounts(model);if(isAgenticElliotSource(req.prepared.token.source)){if(typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent('desk:agentic-elliot-model',{detail:{id,model}}));model={...model,tables:[]};}if(isABCSource(req.prepared.token.source)&&!id.startsWith('pine-test-')){if(typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent('desk:agentic-abc-model',{detail:{id,model}}));model={...model,tables:[]};}if(needsCompatibleWorker(req.prepared.token.source))model={...model,drawingAutoscale:false};this.records.set(id,{model,counts,bars:structuredClone(req.getBars?.()||req.bars),market:req.market,source:req.prepared.token.source,secondary:[...secondary]});handlers.onModel(model);if(isAgenticLiquiditySource(req.prepared.token.source))for(const notify of this.abcListeners)notify();},onError:fail,onDone:()=>{clear();handlers.onDone?.();}});
  return result;
 }
 cancelTests(){for(const [id,entry] of this.workers)if(id.startsWith('pine-test-'))entry.cancel();}
 terminate(){for(const s of [...this.active.values()])s.cancel();for(const entry of this.workers.values()){entry.cancel();entry.worker.terminate();}this.workers.clear();this.records.clear();}
}

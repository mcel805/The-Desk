import {PineWorkerEngine} from './vendor/pine-engine.js';
import {checkPineSource,drawingCounts} from './pine-validation.mjs';

const CLEO_INDICATOR_DECL='indicator("Cleo\'s Liquidity", "Cleo\'s Liquidity"';
const isCleoLiquiditySource=source=>typeof source==='string'&&source.includes(CLEO_INDICATOR_DECL)&&/f_confirmedMaster\s*\(/.test(source)&&/f_marketSource\s*\(/.test(source);
export const isAgenticElliotSource=source=>typeof source==='string'&&source.includes('indicator("Agentic - Elliot Waves", "Agentic - Elliot Waves"')&&/f_reconstruct\s*\(/.test(source)&&/f_capture\s*\(/.test(source);
const needsCompatibleWorker=source=>isCleoLiquiditySource(source)||isAgenticElliotSource(source);
const CLEO_EXECUTION_TIMEOUT=120000;
export const pineWorkerOptions=source=>needsCompatibleWorker(source)?{workerUrl:new URL("./vendor/pine-compatible-worker.js",import.meta.url).href}:{};

// Each study owns a worker. Cancelling a test cannot stop installed studies.
export class DeskPineEngine {
 language='pine';capabilities={streaming:true,visibleRange:true,inputs:true,props:true};
 constructor({factory=source=>new PineWorkerEngine(pineWorkerOptions(source)),compileTimeout=15000,executionTimeout=30000}={}){this.factory=factory;this.compileTimeout=compileTimeout;this.executionTimeout=executionTimeout;this.records=new Map();this.active=new Map();this.workers=new Map();}
 async prepare(source,id){
  checkPineSource(source);const worker=this.factory(source);let timer,rejectPending;
  const entry={worker,cancel:()=>rejectPending?.(Error('Pine test cancelled.'))};this.workers.set(id,entry);
  try{return await Promise.race([worker.prepare(source,id),new Promise((_,reject)=>{rejectPending=reject;timer=setTimeout(()=>reject(Error('Pine compilation exceeded 15 seconds.')),this.compileTimeout);})]);}
  catch(error){worker.terminate();if(this.workers.get(id)===entry)this.workers.delete(id);throw error;}finally{clearTimeout(timer);}
 }
 execute(req,handlers){
  const id=req.prepared.token.instanceId;let entry=this.workers.get(id);if(!entry){entry={worker:this.factory(req.prepared.token.source)};this.workers.set(id,entry);}
  let timer,stopped=false,session,studyRevision=0,dataRevision=0;const secondary=[],seriesCache=new Map(),executionTimeout=needsCompatibleWorker(req.prepared.token.source)?CLEO_EXECUTION_TIMEOUT:this.executionTimeout;
  const clear=()=>{clearTimeout(timer);timer=null;};
  const fail=error=>{if(stopped)return;clear();result.stop();handlers.onError?.(error);};
  const arm=()=>{if(timer||stopped)return;timer=setTimeout(()=>fail(Error(`Pine execution exceeded ${executionTimeout/1000} seconds. Reduce history or script complexity.`)),executionTimeout);};
  const fetchSeries=async(symbol,timeframe,range)=>{const key=JSON.stringify([symbol,timeframe,range,studyRevision,dataRevision]);let task=seriesCache.get(key);if(!task){task=Promise.resolve().then(()=>req.fetchSeries?.(symbol,timeframe,range)||[]);seriesCache.set(key,task);if(seriesCache.size>32)seriesCache.delete(seriesCache.keys().next().value);}let bars;try{bars=await task;}catch(e){seriesCache.delete(key);throw e;}if(!bars.length){seriesCache.delete(key);throw Error('Required secondary data unavailable: '+symbol+' '+timeframe);}secondary.push({symbol,timeframe,bars:bars.length,first:bars[0].time,last:bars.at(-1).time});return bars;};
  const result={stop:()=>{if(stopped)return;stopped=true;clear();session?.stop();entry.worker.terminate();if(this.workers.get(id)===entry)this.workers.delete(id);if(this.active.get(id)===result){this.records.delete(id);this.active.delete(id);}},cancel:()=>fail(Error('Pine test cancelled.')),update:(...args)=>{if(!stopped){studyRevision+=1;arm();session.update(...args);}},setVisibleRange:r=>{if(!stopped){arm();session.setVisibleRange(r);}},notifyBars:reason=>{if(!stopped){if(reason!=='backfill'){dataRevision+=1;arm();}session.notifyBars(reason);}},getContext:select=>{if(stopped)return Promise.resolve(null);let contextTimer;return Promise.race([session.getContext(select),new Promise((_,reject)=>{contextTimer=setTimeout(()=>reject(Error('Pine context request timed out.')),15000);})]).finally(()=>clearTimeout(contextTimer));}};
  this.active.set(id,result);entry.cancel=result.cancel;
  if(req.historyState!=='backfill')arm();
  session=entry.worker.execute({...req,fetchSeries},{...handlers,onModel:model=>{if(stopped)return;clear();if(needsCompatibleWorker(req.prepared.token.source))model={...model,drawingAutoscale:false};this.records.set(id,{model,counts:drawingCounts(model),bars:structuredClone(req.getBars?.()||req.bars),market:req.market,secondary:[...secondary]});handlers.onModel(model);},onError:fail,onDone:()=>{clear();handlers.onDone?.();}});
  return result;
 }
 cancelTests(){for(const [id,entry] of this.workers)if(id.startsWith('pine-test-'))entry.cancel();}
 terminate(){for(const s of [...this.active.values()])s.cancel();for(const entry of this.workers.values()){entry.cancel();entry.worker.terminate();}this.workers.clear();this.records.clear();}
}

import {PineWorkerEngine} from './vendor/pine-engine.js';
import {GeometrySources,geometryCutoff,verifiedGeometryTick} from './market-geometry-source.mjs';
import {geometryDrawing} from './market-geometry-drawing.mjs';
import {GEOMETRY_FRAMES,geometryOptions,geometryCalculationOptions} from './market-geometry-model.mjs';
export const MTF_GEOMETRY_HASH='2fca9099e4c2bb34f61e7737597f17f6a4ad487cfa4b837ae3dcb4b83b4febc0';
export const GEOMETRY_CUSTOM_SCOPE_WARNING='Edited Market Geometry source runs chart-timeframe Pine only; Desk multi-timeframe controls are inactive until the catalog source is restored.';
const CUSTOM_MTF_KEYS=new Set(['geometryMode','structuralPivot','structuralMinSpan','microPivot','parentPivot','turnExpiry','showSwingPaths','showWorking','showProjection','showStatus','showTurnHistory','stageAlerts','showFrame60','showFrame30','showFrame15','showFrame5','showFrame1','frameColor60','frameColor30','frameColor15','frameColor5','frameColor1']);
const CHECKPOINT_LIMIT=24,checkpoints=new Map();
const checkpointKey=(req,id,source,inputs,tick,cutoff,context)=>{const phase=context?.replay===true?'replay':context?.replay===false?'live':'unknown',boundary=phase==='replay'||phase==='unknown'?(Number.isFinite(context?.cutoff)?context.cutoff:cutoff):null;return JSON.stringify([id,req.market?.symbol||'',source,req.mode||'static',phase,boundary,tick,geometryCalculationOptions(inputs)]);};
const getCheckpoint=key=>{const value=checkpoints.get(key);if(value){checkpoints.delete(key);checkpoints.set(key,value);}return value||null;};
const setCheckpoint=(key,value)=>{checkpoints.delete(key);checkpoints.set(key,value);while(checkpoints.size>CHECKPOINT_LIMIT)checkpoints.delete(checkpoints.keys().next().value);};
const usableCheckpoint=(checkpoint,sources)=>checkpoint&&GEOMETRY_FRAMES.every(tf=>{const source=sources[tf];return source?.status==='ready'&&source.bars.length>0&&!source.gaps?.length;})?checkpoint:null;
const resumeCheckpoint=(checkpoint,sources)=>{if(!checkpoint)return null;const resumed=structuredClone(checkpoint);for(const tf of GEOMETRY_FRAMES){const source=sources[tf],last=resumed.frames?.[tf]?.lastTime,step=Number(tf)*60000;if(source?.bars[0]&&last!=null&&source.bars[0].time>last+step)resumed.frames[tf].lastTime=source.bars[0].time-step;}return resumed;};
// Deliberately hash-owned: edited Pine executes its own chart-only rules.
export const isMTFGeometrySource=s=>typeof s==='string'&&s.includes('// Desk MTF Geometry v2.');
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.replace(/\r\n/g,'\n'))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export class MarketGeometryWorker {
 constructor({legacy=new PineWorkerEngine({workerUrl:new URL('./vendor/pine-compatible-worker.js',import.meta.url).href}),context=()=>({}),now=Date.now,threadFactory=()=>new Worker(new URL('./market-geometry-thread.mjs',import.meta.url),{type:'module'}),displayTarget=globalThis}={}){this.legacy=legacy;this.context=context;this.now=now;this.threadFactory=threadFactory;this.displayTarget=displayTarget;this.sessions=new Set();}
 async prepare(source,id){
  const prepared=await this.legacy.prepare(source,id),hosted=await digest(source)===MTF_GEOMETRY_HASH,custom=isMTFGeometrySource(source)&&!hosted;
  if(hosted){const originalOnly=new Set(['geometryShown','geometryActiveShown','geometryActiveInk','geometryBrokenInk']);
   prepared.inputs=prepared.inputs.map(s=>({...s,...(originalOnly.has(s.key)?{when:{key:'geometryMode',equals:'Original chart only'}}:{}),title:s.title.replace('Chart bars retained','Source bars retained').replace('chart bars','source bars'),group:s.key==='geometryMode'?'Geometry view':s.group}));
   prepared.inputs.sort((a,b)=>(a.key==='geometryMode'?-1:b.key==='geometryMode'?1:0));
  }else if(custom)prepared.inputs=prepared.inputs.filter(s=>!CUSTOM_MTF_KEYS.has(s.key));
  return {...prepared,meta:{...prepared.meta,...(custom?{scope:'chart-only/custom-source',scopeWarning:GEOMETRY_CUSTOM_SCOPE_WARNING}:{})},geometryHosted:hosted,geometryScope:custom?'chart-only/custom-source':hosted?'desk-mtf':'pine',geometryWarning:custom?GEOMETRY_CUSTOM_SCOPE_WARNING:null,token:{...prepared.token,source,instanceId:id}};
 }
 execute(req,handlers){
  if(!req.prepared.geometryHosted||req.inputs?.geometryMode==='Original chart only')return this.executeSwitchable(req,handlers);
  return this.start(req,handlers);
 }
 executeSwitchable(req,handlers){
  // The outer adapter owns stop/termination; this wrapper permits Original ↔ MTF settings.
  const warning=req.prepared.geometryWarning;if(warning)handlers.onWarning?.({message:warning,method:'scope',bar:0});
  let child=this.legacy.execute(req,handlers),inputs={...req.inputs};
  return {stop:()=>child.stop(),update:(next,props)=>{inputs={...inputs,...next};if(req.prepared.geometryHosted&&inputs.geometryMode!=='Original chart only'){child.stop();child=this.start({...req,inputs,props},handlers);}else child.update(next,props);},notifyBars:r=>child.notifyBars(r),setVisibleRange:r=>child.setVisibleRange(r),getContext:s=>child.getContext(s).then(context=>warning?{...(context||{}),warnings:[...(context?.warnings||[]),{message:warning,method:'scope',bar:0}]}:context)};
 }
 start(req,handlers){
  const id=req.prepared.token.instanceId;let inputs={...Object.fromEntries(req.prepared.inputs.map(s=>[s.key,s.defval])),...req.inputs},props={...req.props},stopped=false,running=false,again=false,generation=0,sources,result,legacyChild;
  let loader=new GeometrySources(req.fetchSeries,req.market,{history:geometryOptions(inputs).geometryHistory,now:this.now}),thread=this.threadFactory(),lastMinute=null,alertBaseline=false,lastAlertTime=-Infinity,lastKey=null;
  const pending=new Map();
  thread.onmessage=({data:m})=>{const p=pending.get(m.generation);if(!p)return;pending.delete(m.generation);m.error?p.reject(Error(m.error)):p.resolve({result:m.result,checkpoint:m.checkpoint});};
  thread.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message||'Geometry worker failed'));pending.clear();};
  const compute=(payload)=>new Promise((resolve,reject)=>{pending.set(payload.generation,{resolve,reject});thread.postMessage(payload);});
  const emit=()=>{if(stopped||!result||!sources)return;const ctx=this.context(req.market,id)||{},liveBar=!ctx.replay&&String(req.market.timeframe)==='1'?(req.getBars?.()||req.bars).at(-1):null;
   handlers.onModel(geometryDrawing(result,{id,inputs,schema:req.prepared.inputs,props,sources,light:ctx.light,viewTimeframe:req.market.timeframe,liveBar,compact:this.displayTarget.innerWidth<700}));
  };
  const displayTarget=this.displayTarget,redraw=()=>emit();
  if(typeof displayTarget?.addEventListener==='function')displayTarget.addEventListener('resize',redraw);
  const body=displayTarget?.document?.body,Observer=displayTarget?.MutationObserver;
  const themeObserver=body&&typeof Observer==='function'?new Observer(redraw):null;
  themeObserver?.observe(body,{attributes:true,attributeFilter:['class']});
  const run=async()=>{
   if(stopped)return;if(legacyChild){legacyChild.notifyBars();return;}if(running){again=true;return;}running=true;const revision=generation;
   try{
    const ctx=this.context(req.market,id)||{},cutoff=geometryCutoff(req,this.now(),ctx),tick=verifiedGeometryTick(req.market),o=geometryOptions(inputs);
    if(req.market.chartStyle&&!['standard','candles'].includes(req.market.chartStyle)||!/^\d+$/.test(String(req.market.timeframe))||Number(req.market.timeframe)<1)throw Error('Use standard time-based candles of at least one minute.');
    const loaded=await loader.load(cutoff);if(stopped||revision!==generation)return;sources=loaded;if(ctx.replay)for(const s of Object.values(sources))delete s.forming;
    if(!tick){for(const s of Object.values(sources)){s.error='Verified source tick metadata unavailable';s.status='unavailable';s.bars=[];}}
    const key=JSON.stringify([req.market.symbol,req.market.symbolInfo?.timezone,req.market.symbolInfo?.session,tick,geometryCalculationOptions(o)]);
    if(lastKey!==key){lastKey=key;alertBaseline=false;}
    const scope=checkpointKey(req,id,req.prepared.token.source,inputs,tick||0,cutoff,ctx),checkpoint=resumeCheckpoint(usableCheckpoint(getCheckpoint(scope),sources),sources);
    const computed=await compute({generation:revision,key,config:{identity:req.market.symbol,tick:tick||0,inputs,checkpoint},sources,cutoff});if(stopped||revision!==generation)return;result=computed.result;if(computed.checkpoint)setCheckpoint(scope,computed.checkpoint);
    if(inputs.stageAlerts&&alertBaseline&&!ctx.replay&&!id.startsWith('pine-test-')&&sources['1'].status==='ready')for(const e of result.turns.events)if(e.knownAt>lastAlertTime&&e.knownAt>=cutoff-60000)handlers.onAlert?.({id:e.id,title:'Geometry · '+e.stage,message:`${e.side>0?'Bullish':'Bearish'} ${e.family} · ${e.stage} · 1M · ${req.market.symbol}`,time:e.knownAt,barIndex:Math.max(0,(req.getBars?.()||req.bars).length-1),freq:'once_per_bar_close'});
    lastAlertTime=Math.max(lastAlertTime,...result.turns.events.map(e=>e.knownAt));alertBaseline=true;lastMinute=Math.floor(cutoff/60000);emit();handlers.onDone?.();
   }catch(error){if(!stopped&&revision===generation)handlers.onError?.(error);}finally{running=false;if(again&&!stopped){again=false;void run();}}
  };
  // Timer updates 1M sources on a 1H viewing chart even without a chart tick.
  const timer=setInterval(()=>{if(!stopped&&!legacyChild&&req.mode==='live'){const ctx=this.context(req.market,id)||{};if(!ctx.replay)void run();}},15000);
  const session={stop:()=>{if(stopped)return;stopped=true;generation++;clearInterval(timer);if(typeof displayTarget?.removeEventListener==='function')displayTarget.removeEventListener('resize',redraw);themeObserver?.disconnect();loader.stop();thread.terminate();legacyChild?.stop();for(const p of pending.values())p.reject(Error('Geometry cancelled'));pending.clear();this.sessions.delete(session);},update:(next,nextProps)=>{
   const previous=inputs.geometryMode,previousRules=JSON.stringify(geometryCalculationOptions(inputs));inputs={...inputs,...next};props={...props,...nextProps};const rulesChanged=previousRules!==JSON.stringify(geometryCalculationOptions(inputs));
   if(inputs.geometryMode==='Original chart only'){generation++;lastMinute=null;loader.stop();if(!legacyChild)legacyChild=this.legacy.execute({...req,inputs,props},handlers);else legacyChild.update(next,nextProps);return;}
   if(previous==='Original chart only'){legacyChild?.stop();legacyChild=null;}else if(!rulesChanged){emit();handlers.onDone?.();return;}
   generation++;lastMinute=null;loader.stop();loader=new GeometrySources(req.fetchSeries,req.market,{history:geometryOptions(inputs).geometryHistory,now:this.now});lastKey=null;void run();
  },notifyBars:reason=>{if(reason==='backfill')return;if(reason==='complete')loader.invalidate();if(legacyChild){legacyChild.notifyBars(reason);return;}const ctx=this.context(req.market,id)||{},minute=Math.floor(geometryCutoff(req,this.now(),ctx)/60000);if(reason==='complete'||minute!==lastMinute)void run();else{emit();handlers.onDone?.();}},setVisibleRange:()=>{emit();handlers.onDone?.();},getContext:async()=>legacyChild?legacyChild.getContext():{language:'pine',phase:running?'computing':'idle',barIndex:(req.getBars?.()||req.bars).length-1,meta:req.prepared.meta,plots:{},variables:{geometry:result},warnings:Object.values(sources||{}).filter(s=>s.status!=='ready').map(s=>({message:s.frame+'M · '+(s.error||s.status),bar:0}))}};
  this.sessions.add(session);if(req.historyState!=='backfill')void run();return session;
 }
 terminate(){for(const s of [...this.sessions])s.stop();this.legacy.terminate();}
}

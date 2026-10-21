import {abcLiveDrawing} from './abc-live-drawing.mjs';
import {PineWorkerEngine} from './vendor/pine-engine.js';
export const isABCSource=source=>typeof source==='string'&&source.includes('indicator("Agentic - ABC Reversal"')&&/f_cForecast\s*\(/.test(source)&&/var map<int,bool> deadLevels/.test(source);
const hiddenInputs=new Set(['hostLivePath','manualLevel','externalLevel','externalConnected','reachedFeed','reachedConnected','cPool2','cPool3','cExtraConnected','parentBiasFeed','parentBiasConnected','parentPivotBars','requireParentAligned']);
const priceFields=['open','high','low','close'];
const completed=(bars,tf,now)=>bars.filter(b=>b.time+Number(tf)*60000<=now);
const sameMarket=(a,b)=>a.symbol===b.symbol&&a.timeframe===b.timeframe&&(a.chartStyle||'standard')===(b.chartStyle||'standard');
const series=(model,title)=>model.series?.find(s=>s.title===title);
const sourceTitles=['Rider HTF support','Rider HTF resistance','Reached support · this chart bar','Reached resistance · this chart bar'];
export function selectABCFeed(records,req,now=Date.now()){
 const bars=completed(req.getBars?.()||req.bars,req.market.timeframe,now);
 const candidates=[...records.entries()].filter(([id,r])=>!id.startsWith('pine-test-')&&r.source?.includes('indicator("Agentic - Liquidity", "Agentic - Liquidity"')&&sameMarket(r.market,req.market));
 if(candidates.length!==1)return {connected:false,reason:candidates.length?'Multiple Liquidity studies · keep one':'Add Agentic - Liquidity on this chart'};
 const [id,record]=candidates[0],other=completed(record.bars,req.market.timeframe,now);
 if(bars.length!==other.length||bars.some((b,i)=>b.time!==other[i].time||priceFields.some(k=>b[k]!==other[i][k])))return {connected:false,reason:'Waiting for matching completed Liquidity candles'};
 if(!sourceTitles.every(title=>series(record.model,title)))return {connected:false,reason:'Liquidity bridge outputs unavailable'};
 if(bars.length&&!sourceTitles.every(title=>series(record.model,title).points?.some(p=>p.time===bars.at(-1).time)))return {connected:false,reason:'Waiting for Liquidity to finish this candle'};
 return {connected:true,id,model:record.model,cutoff:bars.at(-1)?.time,reason:'Same-chart Agentic Liquidity'};
}
export function abcTransportInputs(inputs,feed,direction,now=Date.now(),tf='1'){
 const support=direction==='Long from support',names=support?['Rider HTF support','Reached support · this chart bar','C support 2','C support 3']:['Rider HTF resistance','Reached resistance · this chart bar','C resistance 2','C resistance 3'];
 const values=title=>({__deskABCSource:1,values:Object.fromEntries((feed.connected?series(feed.model,title)?.points||[]:[]).filter(p=>p.time+Number(tf)*60000<=now).map(p=>[p.time,Number.isFinite(p.value)?p.value:null]))});
 return {...inputs,hostLivePath:true,zoneSource:'Liquidity bridge',reversalSide:direction,externalConnected:feed.connected,reachedConnected:feed.connected,externalLevel:values(names[0]),reachedFeed:values(names[1]),cPool2:values(names[2]),cPool3:values(names[3]),cExtraConnected:feed.connected,requireParentAligned:false,parentBiasFeed:{__deskABCSource:1,values:{}},parentBiasConnected:false};
}
export function mergeABCModels(models,prepared,inputs,feed){
 const base=models[0];if(!base)return null;
 const merged={...base,title:'Agentic - ABC Reversal',inputs:prepared.inputs,inputValues:Object.fromEntries(prepared.inputs.map(spec=>[spec.key,inputs[spec.key]??spec.defval])),drawingAutoscale:false,abcBridge:{connected:feed.connected,reason:feed.reason,producerId:feed.id,cutoff:feed.cutoff}};
 for(const key of ['series','lines','labels','boxes','polylines','linefills','tables'])merged[key]=models.flatMap(m=>(m[key]||[]).map(v=>({...v,...(key==='series'?{title:(m.inputValues.reversalSide==='Long from support'?'Long · ':'Short · ')+v.title}:{} )})));
 merged.labels=merged.labels.map(l=>({...l,...(l.text?.startsWith('C?')?{textColor:'#FFC35C'}:{})}));
 if(models.length===2){
  const active=models.map(m=>(series(m,'ABC audit · phase')?.points.at(-1)?.value||0)>0);
  merged.tables=models.flatMap((m,i)=>active[i]||!active.some(Boolean)&&i===0?m.tables||[]:[]);
 }
 if(!feed.connected)merged.tables=merged.tables.map(t=>({...t,cells:t.cells.map((row,i)=>i===1?row.map((cell,j)=>j===1?{...cell,text:feed.reason}:cell):row)}));
 return merged;
}
// One chart owns one DeskPineEngine. Its records are the only producer authority.
// Pine owns completed-candle decisions. The display layer follows streaming wicks.
export class ABCReversalWorker {
 constructor({records,subscribe,worker=new PineWorkerEngine({workerUrl:new URL('./vendor/pine-compatible-worker.js',import.meta.url).href})}){this.worker=worker;this.records=records;this.subscribe=subscribe;this.sessions=new Set();}
 async prepare(source,id){
  // Upgrade only the exact shipped v1 source, preserving user-edited scripts.
  let abcVisualUpgrade=false;
  if(!source.includes('Desk visual anchors v2')&&globalThis.crypto?.subtle){
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
   const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(hash==='a89bf4f837aa7bad8855751075008c4164c1865d03a7afb47ba244e9108fc08f'){
    const response=await fetch(new URL('./pine-examples/agentic-abc-reversal.pine',import.meta.url));
    if(!response.ok)throw Error('ABC visual source update unavailable. Reload the chart.');
    source=await response.text();abcVisualUpgrade=true;
   }
  }
  const prepared=await this.worker.prepare(source,id);
  return {...prepared,abcVisualUpgrade,inputs:prepared.inputs.filter(s=>!hiddenInputs.has(s.key))};
 }
 execute(req,handlers){
  let stopped=false,generation=0,children=[],timer,lastSignature='',inputs={...req.inputs},props={...req.props},range=req.visibleRange,models=[],feed;
  if(req.prepared.abcVisualUpgrade){
   if(inputs.showProjection===false)inputs.showProjection=true;
   for(const key of ['longColor','shortColor'])if(/^#FFFFFF(?:DF|E0)?$/i.test(inputs[key]||''))inputs[key]=key==='longColor'?'#00B8A9FF':'#F23645FF';
   // The orchestrator persists this input object; retain the migrated visual defaults.
   if(req.inputs)Object.assign(req.inputs,inputs);
   req.prepared.abcVisualUpgrade=false;
  }
  const emit=()=>{
   if(!models.length||models.some(m=>!m))return;
   const bars=req.getBars?.()||req.bars;
   const displayed=models.map((m,i)=>abcLiveDrawing(m,bars,{timeframe:req.market.timeframe,id:req.prepared.token.instanceId+':'+i}));
   const model=mergeABCModels(displayed,req.prepared,inputs,feed);if(model)handlers.onModel?.(model);
  };
  const clear=()=>{clearTimeout(timer);for(const s of children)s.stop();children=[];};
  const run=()=>{
   if(stopped)return;
   try{
    const bars=structuredClone(req.getBars?.()||req.bars),now=Date.now();feed=selectABCFeed(this.records,{...req,bars,getBars:()=>bars},now);
    if(!['1','5'].includes(String(req.market.timeframe))||req.market.chartStyle&&!['standard','candles'].includes(req.market.chartStyle))feed={connected:false,reason:'Use standard 1m or 5m candles'};
    const choice=inputs.reversalSide??'Automatic · both sides',directions=choice==='Automatic · both sides'?['Long from support','Short from resistance']:[choice];
    const transports=directions.map(d=>abcTransportInputs(inputs,feed,d,now,req.market.timeframe));
    const signature=JSON.stringify([completed(bars,req.market.timeframe,now),transports,props,range,feed.connected,feed.reason,feed.id,feed.cutoff]);
    if(signature===lastSignature){if(children.length===models.filter(Boolean).length){emit();handlers.onDone?.();}return;}lastSignature=signature;
    const revision=++generation;clear();models=[];let finished=0;
    timer=setTimeout(()=>{if(stopped||revision!==generation)return;clear();handlers.onError?.(Error('ABC Reversal execution timed out.'));},120000);
    directions.forEach((direction,i)=>{
     const prepared={...req.prepared,token:{...req.prepared.token,instanceId:req.prepared.token.instanceId+(direction==='Long from support'?':long':':short')}};
     const child=this.worker.execute({...req,prepared,bars,getBars:()=>bars,inputs:transports[i],props,visibleRange:range,mode:'static',historyState:'complete'}, {
      onModel:model=>{if(stopped||revision!==generation)return;models[i]=model;},
      onDone:()=>{if(stopped||revision!==generation)return;if(++finished===directions.length){clearTimeout(timer);emit();handlers.onDone?.();}},
      onError:error=>{if(stopped||revision!==generation)return;clear();handlers.onError?.(error);},onWarning:w=>{if(!stopped&&revision===generation)handlers.onWarning?.(w);},onAlert:alert=>{if(!stopped&&revision===generation)handlers.onAlert?.({...alert,title:(direction==='Long from support'?'LONG · ':'SHORT · ')+(alert.title||'ABC reversal')});}
     });children.push(child);
    });
   }catch(error){clear();handlers.onError?.(error);}
  };
  const unsubscribe=this.subscribe(run),session={stop:()=>{if(stopped)return;stopped=true;generation++;unsubscribe();clear();this.sessions.delete(session);},update:(next,nextProps)=>{inputs={...inputs,...next};props={...props,...nextProps};run();},setVisibleRange:next=>{range=next;run();},notifyBars:()=>run(),getContext:async select=>{const contexts=await Promise.all(children.map(s=>s.getContext(select)));return {...contexts[0],abcDirections:contexts};}};
  this.sessions.add(session);if(req.historyState!=='backfill')run();else handlers.onDone?.();return session;
 }
 terminate(){for(const s of [...this.sessions])s.stop();this.worker.terminate();}
}

import {PineEngine} from '@luxalgo/vela-pinets';
import {installNestedSecurity} from './pine-compat/nested-security.mjs';
installNestedSecurity();
const engine=new PineEngine(),sessions=new Map(),fetches=new Map();let requestId=0;
const post=m=>self.postMessage(m);
const fetchSeries=(symbol,timeframe,range)=>new Promise((resolve,reject)=>{const reqId=++requestId;fetches.set(reqId,{resolve,reject});post({kind:'fetchSeries',reqId,symbol,timeframe,range});});
self.addEventListener('message',async({data:m})=>{
 try{switch(m.kind){
  case 'prepare':try{post({kind:'prepared',reqId:m.reqId,prepared:await engine.prepare(m.source,m.instanceId)});}catch(e){post({kind:'prepared',reqId:m.reqId,error:e.message});}break;
  case 'execute':{const entry={bars:m.bars,mode:m.mode,session:null};sessions.set(m.sessionId,entry);entry.session=engine.execute({...m,getBars:()=>entry.bars,fetchSeries},{onModel:model=>{post({kind:'reactsToViewport',sessionId:m.sessionId,value:m.prepared.reactsToViewport});post({kind:'model',sessionId:m.sessionId,model});},onDone:()=>post({kind:'done',sessionId:m.sessionId}),onAlert:alert=>post({kind:'alert',sessionId:m.sessionId,alert}),onWarning:warning=>post({kind:'warning',sessionId:m.sessionId,warning}),onError:e=>post({kind:'error',sessionId:m.sessionId,message:e.message})});break;}
  case 'update':sessions.get(m.sessionId)?.session.update(m.inputs,m.props);break;
  case 'setVisibleRange':sessions.get(m.sessionId)?.session.setVisibleRange(m.range);break;
  case 'notifyBars':{const e=sessions.get(m.sessionId);if(e){e.bars=m.bars;e.session.notifyBars('complete');}break;}
  case 'bars':{const e=sessions.get(m.sessionId);if(e){if(m.restart)e.bars=m.bars;else for(const b of m.bars){const last=e.bars.at(-1);if(last?.time===b.time)e.bars[e.bars.length-1]=b;else if(!last||b.time>last.time)e.bars.push(b);}e.session.notifyBars(m.restart?'complete':'tick');}break;}
  case 'getContext':post({kind:'contextResult',reqId:m.reqId,snapshot:await sessions.get(m.sessionId)?.session.getContext(m.select)||null});break;
  case 'stop':sessions.get(m.sessionId)?.session.stop();sessions.delete(m.sessionId);break;
  case 'fetchSeriesResult':{const f=fetches.get(m.reqId);fetches.delete(m.reqId);if(f)m.error?f.reject(Error(m.error)):f.resolve(m.bars||[]);break;}
 }}catch(e){post({kind:'error',sessionId:m.sessionId,message:e.message});}
});

// SPDX-License-Identifier: AGPL-3.0-only
// The worker transport acknowledges each static command; the public engine
// otherwise starts overlapping runs when the viewport changes during startup.
export function executeSerial(engine,req,handlers){
 if(req.mode==='live')return engine.execute(req,handlers);
 let session,running=req.historyState!=='backfill',activeCount=1,stopped=false;
 const queue=[];
 const start=job=>{running=true;activeCount=job.count;session[job.kind](...job.args);};
 const enqueue=(kind,args)=>{
  if(stopped)return;
  if(!running){start({kind,args,count:1});return;}
  const last=queue.at(-1);
  if(last?.kind===kind){last.count++;if(kind==='update')last.args=[{...last.args[0],...args[0]},{...last.args[1],...args[1]}];else last.args=args;}
  else queue.push({kind,args,count:1});
 };
 session=engine.execute(req,{...handlers,onDone:()=>{
  if(stopped)return;running=false;
  for(let n=0;n<activeCount;n++)handlers.onDone?.();
  const next=queue.shift();if(next)start(next);
 }});
 // A deferred engine emits no completion until the complete-history command.
 // Acknowledge the initial transport message so the host can send that command.
 if(req.historyState==='backfill')handlers.onDone?.();
 return {stop(){stopped=true;queue.length=0;session.stop();},update:(...a)=>enqueue('update',a),setVisibleRange:(...a)=>enqueue('setVisibleRange',a),notifyBars:(...a)=>enqueue('notifyBars',a),getContext:(...a)=>session.getContext(...a)};
}

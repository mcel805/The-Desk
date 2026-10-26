// One command per affected entity while a request is pending. Retrying an
// uncertain response reuses its key so a lost acknowledgement cannot trade twice.
export function createTradingActions({send,accountId,replay,key=()=>crypto.randomUUID(),onPending=()=>{}}){
  const pending=new Map(),attempts=new Map();
  const trading=new Set(['order','amend','cancel','close','bracket','cancel_orders','flatten','reverse']);
  function run(action,payload){
    if(trading.has(action)){
      if(replay())return Promise.reject(Error('Exit chart replay to manage paper trading.'));
      if(payload.account_id!==accountId())return Promise.reject(Error('Account changed. Refresh and retry.'));
    }
    const scope=payload.account_id||'',entity=payload.id||payload.instrument||action;
    const lock=scope+':'+entity;
    const signature=JSON.stringify([action,payload]);
    const current=pending.get(lock);
    if(current)return current.signature===signature?current.promise:Promise.reject(Error('An action is already pending for this order or instrument.'));
    const id=attempts.get(signature)||key();attempts.set(signature,id);
    const promise=Promise.resolve().then(()=>send(action,payload,id)).then(result=>{attempts.delete(signature);return result;}).catch(error=>{
      // Validation failures are definitive; transport failures may have committed.
      if(error.status>=400&&error.status<500)attempts.delete(signature);
      throw error;
    }).finally(()=>{pending.delete(lock);onPending();});
    pending.set(lock,{signature,promise});onPending();return promise;
  }
  return {run,pending:(account,entity)=>pending.has(account+':'+entity)};
}

// Apply only acknowledged cancellations. A slow poll must never resurrect them.
export function acknowledgeCancellation(state,result){
  if(!state||!result.cancelled)return;
  const ids=new Set(Array.isArray(result.cancelled)?result.cancelled:[result.cancelled]);
  for(const order of state.orders)if(ids.has(order.id)){order.status='cancelled';order.revision++;}
}

export function acknowledgeTradingResult(state,action,payload,result){
  if(!state||state.active_account!==payload.account_id)return;
  acknowledgeCancellation(state,result);
  if(['order','amend','reverse'].includes(action)&&result.id){
    const i=state.orders.findIndex(o=>o.id===result.id);
    if(i<0)state.orders.unshift(result);else state.orders[i]=result;
  }
  if(action==='order'&&result.status==='filled'&&Array.isArray(result.positions)){
    state.positions=[...state.positions.filter(p=>p.instrument!==payload.instrument),...result.positions];
  }
  if(action==='bracket')for(const p of state.positions)if(p.id===result.updated){p.stop=payload.stop||null;p.target=payload.target||null;p.revision++;}
  if(action==='close')state.positions=state.positions.flatMap(p=>{
    if(p.id!==result.position_id)return [p];
    const remaining=Number(p.qty)-Number(result.closed_quantity);
    return remaining>1e-12?[{...p,qty:String(Number(remaining.toPrecision(12))),revision:p.revision+1}]:[];
  });
  if(action==='flatten'){
    const closed=new Set(result.closed||[]);
    state.positions=state.positions.filter(p=>!closed.has(p.id));
  }
  if(action==='reverse'&&Array.isArray(result.positions)){
    state.positions=[...state.positions.filter(p=>p.instrument!==payload.instrument),...result.positions];
  }
}

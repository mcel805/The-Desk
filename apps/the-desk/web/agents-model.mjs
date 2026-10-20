export const robotIcon='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 5V2m-3 0h6M7 11h18v16H7zM3 16v7m26-7v7M12 31v-4m8 4v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M11 20v-4m10 4v-4M12 23h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v));
export const time=v=>v?new Date(v*1000).toLocaleString():'No activity yet';
export function cyan(value){
 const v=String(value||'').toLowerCase().replaceAll(' ','');
 return ['cyan','aqua','#00ffff','#00ffffff','#0ff','#22d3ee','#22d3eeff','rgb(0,255,255)','rgba(0,255,255,1)'].includes(v);
}
export function manualLevels(drawings,cellId='single'){
 return (drawings||[]).filter(d=>d&&d.type==='hline'&&d.visible!==false&&d.hidden!==true&&cyan(d.style?.color||d.style?.lineColor||d.color)&&d.anchors?.length&&Number.isFinite(Number(d.anchors[0].price))&&Number(d.anchors[0].price)>0)
  .map(d=>({id:'drawing:'+encodeURIComponent(cellId)+':'+d.id,price:String(d.anchors[0].price),source:'manual-cyan',label:'Cyan horizontal · '+d.id}));
}
export function drawingScope(storage=globalThis.localStorage){
 const key='the-desk.agents.drawing-scope.v1';let known={};
 try{known=JSON.parse(storage?.getItem(key)||'{}');if(!known||typeof known!=='object'||Array.isArray(known))known={};}catch{}
 const save=()=>{try{storage?.setItem(key,JSON.stringify(known));}catch{}};
 return {bind(cell,id,instrument){known[cell+':'+id]=instrument;save();},filter(cell,instrument,drawings,adopt=false){
  let changed=false;const rows=(drawings||[]).filter(d=>{
   const id=cell+':'+d.id;
   if(!known[id]&&adopt){known[id]=instrument;changed=true;}
   return known[id]===instrument;
  });if(changed)save();return rows;
 }};
}
export function liquidityLevels(records,instrument,timeframe){
 const out=[];
 for(const [id,r] of records||[]){
  if(!r?.liquidity||r.instrument!==instrument||r.timeframe!==timeframe||Date.now()-r.observedAt>15000)continue;
  for(const line of r.lines||[]){
   // Active horizontal pools only: retired/dashed/finite historical segments
   // do not become live trading signals just because they are visible.
   const active=line.extend==='right'||line.xloc==='bar_time'&&Number(line.x2)>Number(r.lastBarTime);
   if(line.y1!==line.y2||!active||line.style!=='solid'||line.width!==2||!Number.isFinite(Number(line.y1))||Number(line.y1)<=0)continue;
   if(!Number.isFinite(Number(line.x1)))continue;
   const key='liquidity:'+id+':'+line.xloc+':'+line.x1+':'+line.y1;
   if(!out.some(level=>level.id===key))out.push({id:key,price:String(line.y1),source:'liquidity',label:'Liquidity pool · '+id+' · origin '+line.x1});
  }
 }
 return out;
}
export function editPayload(fd,agent){
 const n=k=>Number(fd.get(k)),s=k=>String(fd.get(k)||'');
 return {...(agent?{id:agent.id,expectedRevision:agent.revision}:{}),name:s('name'),description:s('description'),avatar:s('avatar'),color:s('color'),mode:s('mode'),account:{venue:s('venue'),id:s('accountId')},instrument:s('instrument'),executionInstrument:s('executionInstrument')||(s('venue')==='simulation'?s('instrument'):''),modules:{signal:{type:'line-touch',sources:['manual-cyan','liquidity'].filter(k=>fd.has(k)),side:s('side'),toleranceBps:s('toleranceBps')},entry:{type:s('entryType'),quantity:s('quantity'),expirySeconds:n('expirySeconds')},exit:{type:'bracket',stopBps:s('stopBps'),rewardRisk:s('rewardRisk'),maxHoldingSeconds:n('maxHoldingSeconds')},risk:{type:'risk-v1',maxOrderUSD:s('maxOrderUSD'),maxRiskUSD:s('maxRiskUSD'),maxExposureUSD:s('maxExposureUSD'),maxDailyLossUSD:s('maxDailyLossUSD'),maxTradesPerDay:n('maxTradesPerDay'),maxConcurrent:n('maxConcurrent'),cooldownSeconds:n('cooldownSeconds'),maxQuoteAgeSeconds:n('maxQuoteAgeSeconds'),maxSpreadBps:s('maxSpreadBps')}}};
}

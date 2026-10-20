import {manualLevels,liquidityLevels,drawingScope} from './agents-model.mjs';
import {marketIdentity} from './trading-model.mjs';
export function setupAgentsChart({workspace,instrument,toast}){
 let pending=false,queued=false;const attached=new WeakSet(),scope=drawingScope();
 function attach(){
  const ws=workspace();if(!ws)return;
  for(const cell of ws.cells())if(!attached.has(cell)){
   attached.add(cell);
   cell.chart.on('market:changed',()=>void publish());
   cell.chart.on('drawing:created',({id})=>{if(cell!==ws.active)return;scope.bind(cell.id,id,marketIdentity(cell.chart));void publish();});
   for(const event of ['drawing:edited','drawing:removed'])cell.chart.on(event,()=>void publish());
  }
 }
 async function publish(){
  const ws=workspace();if(!ws?.chart)return;if(pending){queued=true;return;}pending=true;
  try{
   attach();
   const active=ws.active,market=instrument(),tf=String(ws.chart.market.timeframe);
   const studies=(ws.chart.indicators?.()||[]).filter(h=>h.visible!==false&&h.source?.includes('indicator("Agentic - Liquidity"'));
   const relevant=await Promise.all(studies.map(async h=>[active.id+':'+h.id,await h.context({deskAgentLevels:true})]));
   if(ws.active!==active||instrument()!==market||String(ws.chart.market.timeframe)!==tf){queued=true;return;}
   const levels=[...manualLevels(scope.filter(ws.active.id,market,ws.chart.drawings.all()),ws.active.id),...liquidityLevels(relevant,market,tf)].slice(0,200);
   const body={instrument:market,timeframe:tf,observedAt:Date.now()/1000,replay:!!ws.replay.state.active,levels};
   await fetch('/api/agents/chart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }catch{}finally{pending=false;if(queued){queued=false;void publish();}}
 }
 window.addEventListener('desk:agents-sync-chart',publish);
 window.addEventListener('desk:agents-adopt-lines',()=>{const ws=workspace();if(!ws||ws.replay.state.active)return;scope.filter(ws.active.id,instrument(),ws.chart.drawings.all(),true);void publish();});
 window.addEventListener('desk:agents-add-line',()=>{
  const ws=workspace();if(!ws||ws.replay.state.active)return toast('Exit replay before adding an agent line.',true);
  const chart=ws.chart,price=Number(prompt('Cyan horizontal line price (simulation signal):'));
  if(!Number.isFinite(price)||price<=0)return;
  const line=chart.drawings.add('hline',{anchors:[{time:Date.now(),price}],style:{lineColor:'#00ffff',lineWidth:2,lineStyle:'solid'}});
  if(line)scope.bind(ws.active.id,line.id,instrument());
  void publish();toast('Cyan agent level added. Save layout to retain the drawing.');
 });
 setInterval(publish,2000);return {publish,attach};
}

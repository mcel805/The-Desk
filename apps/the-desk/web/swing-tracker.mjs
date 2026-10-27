import {projectWarningTags} from './swing-warnings.mjs';
import {projectEvaluationDots} from './swing-dot-model.mjs';
import {marketIdentity} from './trading-model.mjs';
import {eligibleSwingCharts,selectSwingChart} from './swing-view-model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupSwingTracker({workspace}){
 let data=null,view=null,pending=null,previous=null,optionsSignature='',disposed=false;
 let enabled=localStorage.getItem('desk.swing.v12.visible')!=='false',selected=localStorage.getItem('desk.swing.chart')||'auto';
 const button=document.querySelector('#swingTrackerButton'),control=document.createElement('span');
 control.className='swing-chart-control';control.innerHTML='<label>1m chart <select aria-label="Swing Tracker chart"><option value="auto">Auto · one chart</option></select></label><span class="swing-observer-status" role="status"></span>';
 button?.after(control);const select=control.querySelector('select'),status=control.querySelector('[role=status]');
 select.title='Choose one 1-minute chart for dots. This changes the display only; observations are controlled in Swing Lab.';
 button?.setAttribute('aria-pressed',String(enabled));
 button?.setAttribute('title','Show or hide dots on one 1-minute chart. This does not start or pause paid observations.');
 button?.addEventListener('click',()=>{enabled=!enabled;localStorage.setItem('desk.swing.v12.visible',String(enabled));button.setAttribute('aria-pressed',String(enabled));paint();});
 select.onchange=()=>{selected=select.value;localStorage.setItem('desk.swing.chart',selected);previous=null;paint();};
 async function poll(){try{const r=await fetch('/api/swing/status');if(!r.ok)throw Error();data=await r.json();}catch{data=null;}if(!disposed)paint();}
 function clear(){view?.root.remove();view=null;}
 function paint(){
  if(disposed)return;const ws=workspace();if(!ws)return;
  const cells=ws.cells(),charts=cells.map((c,i)=>({id:c.id,market:marketIdentity(c.chart),timeframe:c.chart.market.timeframe,index:i+1}));
  const eligible=eligibleSwingCharts(charts),running=Object.keys(data?.symbols||{}).find(k=>data.symbols[k].running)||null;
  const signature=JSON.stringify([eligible,selected]);
  if(signature!==optionsSignature){optionsSignature=signature;select.innerHTML='<option value="auto">Auto · one chart</option>'+eligible.map(c=>`<option value="${esc(c.id)}">${esc(c.market.split(':')[1])} · chart ${c.index}</option>`).join('')+(selected!=='auto'&&!eligible.some(c=>c.id===selected)?`<option value="${esc(selected)}">Selected chart unavailable</option>`:'');select.value=selected;}
  const chosen=selectSwingChart(charts,{selected,previous,active:cells.find(c=>c.chart===ws.chart)?.id,runningMarket:running});
  if(chosen)previous=chosen.id;
  status.textContent=!data?'Offline':running?`${running.split(':')[1]} · ${data.symbols[running].status.toLowerCase()}${!chosen?' · add matching 1m chart':''}`:chosen?'Paused':'Add a BTC/ETH 1m chart';
  status.title=running?'One shared 1m collector. Hiding dots or closing charts does not pause collection; use Swing Lab.':'No paid observation run is active. Start one in Swing Lab.';
  const cell=cells.find(c=>c.id===chosen?.id),show=enabled&&!ws.replay?.state.active&&cell;
  if(!show){pending=null;clear();return;}
  if(view?.cell!==cell){clear();if(pending?.cell===cell)return;const request={cell};pending=request;cell.chart.ready().then(()=>{if(pending!==request||disposed||!cell.host.isConnected)return;pending=null;const native=cell.chart.renderer.renderer;if(!native?.plot)return;const root=document.createElement('div');root.className='swing-overlay';root.dataset.swingCell=cell.id;root.innerHTML='<svg aria-label="Swing Tracker research annotations"></svg><a class="swing-mini-status" href="/swing-lab.html" target="_blank" rel="noopener"></a>';native.plot.append(root);view={cell,native,root,svg:root.querySelector('svg'),badge:root.querySelector('a')};paint();}).catch(()=>{if(pending===request)pending=null;});return;}
  const {native,svg,badge}=view,s=data?.symbols?.[chosen.market],pane=native.scene?.panes.get('price');
  badge.textContent=`Swing · ${chosen.market.split(':')[1]} 1m · ${s?.status?.toLowerCase()||'offline'} ↗`;
  badge.title='Settings, costs, pause and observation history in Swing Lab';
  if(!s?.snapshot||!['OBSERVING','PAUSED'].includes(s.status)||(s.status==='OBSERVING'&&Date.now()-(s.observed_at||0)>75000)||!pane){svg.innerHTML='';view.markup=null;return;}
  const now=s.snapshot.cutoff,x=t=>native.coords.timeToX(t),y=p=>native.coords.priceToY(p,pane.scale,pane.bounds);
  const dots=projectEvaluationDots(s.dots||[],{timeToX:x,priceToY:y,width:native.coords.width,top:pane.bounds.top,height:pane.bounds.height,timeframe:cell.chart.market.timeframe,barWidth:Math.abs(x(now+60000)-x(now))});
  const tags=projectWarningTags(s.snapshot.warnings,{timeToX:x,priceToY:y,width:native.coords.width,top:pane.bounds.top,height:pane.bounds.height,timeframe:cell.chart.market.timeframe});
  const markup=dots.map(d=>`<circle class="swing-evaluation-dot" data-evaluation-id="${esc(d.id)}" cx="${d.cx}" cy="${d.cy}" r="${d.radius}" fill="${d.hollow?'#131722':d.color}" stroke="${d.color}" stroke-width=".8" tabindex="0" role="img" aria-label="${esc(d.label)}"><title>${esc(d.label)}</title></circle>`).join('')+tags.map(t=>`<g class="swing-warning-tag" data-warning-id="${esc(t.id)}" tabindex="0" role="img" aria-label="${esc(t.label+' '+t.detail)}"><title>${esc(t.detail)}</title><text x="${t.cx}" y="${t.cy}" fill="${t.color}" text-anchor="middle" paint-order="stroke" stroke="#131722" stroke-width="3" font-size="9">${esc(t.label)}</text></g>`).join('');
  if(view.markup!==markup){svg.innerHTML=markup;view.markup=markup;}
 }
 poll();const timer=setInterval(poll,3000),render=setInterval(paint,200);
 window.addEventListener('pagehide',()=>{disposed=true;pending=null;clear();clearInterval(timer);clearInterval(render);});
 return {attach:paint};
}

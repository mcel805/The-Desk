import {projectWarningTags,warningGlyph} from './swing-warnings.mjs';
import {projectEvaluationDots} from './swing-dot-model.mjs';
import {projectHouseABC,houseFamilies,houseColors} from './house-abc-view.mjs';
import {marketIdentity} from './trading-model.mjs';
import {eligibleSwingCharts,selectSwingChart} from './swing-view-model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupSwingTracker({workspace}){
 let data=null,view=null,pending=null,previous=null,optionsSignature='',disposed=false,selectedWarning=null;
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
  if(view?.cell!==cell){clear();if(pending?.cell===cell)return;const request={cell};pending=request;cell.chart.ready().then(()=>{if(pending!==request||disposed||!cell.host.isConnected)return;pending=null;const native=cell.chart.renderer.renderer;if(!native?.plot)return;const root=document.createElement('div');root.className='swing-overlay';root.dataset.swingCell=cell.id;root.innerHTML='<svg aria-label="Swing Tracker research annotations"></svg><div class="house-abc-card" hidden></div><a class="swing-mini-status" href="/swing-lab.html" target="_blank" rel="noopener"></a>';native.plot.append(root);view={cell,native,root,svg:root.querySelector('svg'),badge:root.querySelector('a'),card:root.querySelector('.house-abc-card')};root.addEventListener('pointerdown',e=>{if(e.target.closest('[data-house-event]'))e.stopPropagation();});root.addEventListener('pointerup',e=>{if(e.target.closest('[data-house-event]'))e.stopPropagation();});root.addEventListener('click',e=>{const mark=e.target.closest('[data-house-event]');if(mark){e.stopPropagation();selectedWarning=mark.dataset.houseEvent;paint();}});root.addEventListener('keydown',e=>{const mark=e.target.closest('[data-house-event]');if(mark&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectedWarning=mark.dataset.houseEvent;paint();}});paint();}).catch(()=>{if(pending===request)pending=null;});return;}
  const {native,svg,badge}=view,s=data?.symbols?.[chosen.market],pane=native.scene?.panes.get('price');
  badge.textContent=`Swing · ${chosen.market.split(':')[1]} 1m · ${s?.status?.toLowerCase()||'offline'} ↗`;
  badge.title='Settings, costs, pause and observation history in Swing Lab';
  if(!s?.snapshot||!['OBSERVING','PAUSED'].includes(s.status)||(s.status==='OBSERVING'&&Date.now()-(s.observed_at||0)>75000)||!pane){svg.innerHTML='';view.markup=null;view.card.hidden=true;return;}
  const now=s.snapshot.cutoff,x=t=>native.coords.timeToX(t),y=p=>native.coords.priceToY(p,pane.scale,pane.bounds);
  const dots=projectEvaluationDots(s.dots||[],{timeToX:x,priceToY:y,width:native.coords.width,top:pane.bounds.top,height:pane.bounds.height,timeframe:cell.chart.market.timeframe,barWidth:Math.abs(x(now+60000)-x(now))});
  const tags=projectWarningTags(s.snapshot.warnings,{timeToX:x,priceToY:y,width:native.coords.width,top:pane.bounds.top,height:pane.bounds.height,timeframe:cell.chart.market.timeframe});
  const house=projectHouseABC(s.snapshot.house_abc,{timeToX:x,priceToY:y,width:native.coords.width,top:pane.bounds.top,height:pane.bounds.height,cutoff:now});
  const houseContour=house?house.lines.map(l=>`<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}" y2="${l.b.y}" stroke="#00c99b" stroke-opacity=".06" stroke-width="18"/>`).join(''):'';
  const houseEnd=house&&(house.points.c||house.points.b||house.points.a);
  const bracket=house?.points.o&&houseEnd?(()=>{const bx=Math.max(0,house.points.o.x),ex=Math.min(native.coords.width,houseEnd.x),by=Math.min(pane.bounds.top+pane.bounds.height-14,Math.max(...Object.values(house.points).map(p=>p.y))+24);return ex>bx&&Number.isFinite(by)?`<path d="M${bx} ${by-5}V${by}H${ex}V${by-5}" stroke="#00c99b" stroke-opacity=".65" fill="none" stroke-width=".8"/><text x="${(bx+ex)/2}" y="${by-4}" text-anchor="middle" fill="#00c99b" font-size="9">SWING ${esc(house.id)}</text>`:'';})():'';
  const houseLines=house?house.lines.map(l=>`<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}" y2="${l.b.y}" stroke="${l.color}" stroke-width="1.5" ${l.dashed?'stroke-dasharray="5 4"':''}/>`).join(''):'';
  const housePoints=house?Object.entries(house.points).filter(([,p])=>p.visible).map(([k,p])=>`<g><circle cx="${p.x}" cy="${p.y}" r="3" fill="#131722" stroke="${{o:'#00c3ff',a:'#00c3ff',b:'#ffc41e',c:'#b97dff'}[k]}"/><text x="${p.x}" y="${p.y-8}" fill="${{o:'#00c3ff',a:'#00c3ff',b:'#ffc41e',c:'#b97dff'}[k]}" text-anchor="middle" font-size="11" font-weight="700" paint-order="stroke" stroke="#131722" stroke-width="3">${house.labels[k]}</text><title>${esc(`${house.labels[k]} · origin ${new Date(p.origin).toISOString()} · ${p.known?(k==='c'?'C start observed ':'recognized ')+new Date(p.known).toISOString():'developing'}`)}</title></g>`).join(''):'';
  const shapeKeys=['EFFORT','SLOW','LEVEL','REJECT','EXTENDED','STRUCTURE','CHOP','DIVERGENCE'];
  const houseEvents=house?house.events.map(e=>{const cy=e.y+(house.side===1?-11:11);return `<g data-house-event="${esc(e.id)}" class="house-event" tabindex="0" role="button" aria-label="${esc(e.name+' '+e.detail)}"><title>${esc(e.detail)}</title><circle cx="${e.x}" cy="${cy}" r="10" fill="transparent"/><path d="M${e.x} ${cy+(house.side===1?3:-3)}L${e.x} ${e.y}" stroke="${e.color}" stroke-width=".6" stroke-opacity=".6"/><path d="${warningGlyph({cx:e.x,cy,feature:shapeKeys[e.family]})}" fill="none" stroke="${e.color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g>`}).join(''):'';
  const chosenEvent=house&&selectedWarning!==null?house.events.find(e=>e.id===selectedWarning):null;
  const guide=chosenEvent?`<line x1="${chosenEvent.x}" x2="${chosenEvent.x}" y1="${pane.bounds.top}" y2="${pane.bounds.top+pane.bounds.height}" stroke="#e3b75d" stroke-width=".7" stroke-dasharray="3 5"/>`:'';
  const card=view.card;
  if(house){
   const dir=house.points.o&&house.points.a?(house.points.a.price>house.points.o.price?'UP':'DOWN'):'DEVELOPING';
   const own=house.matched?`<b>EXHAUSTION · ${house.score??'—'} / 14</b> <span>${esc(house.tier)}</span><small>Coverage ${house.available??'—'} / 14${house.available<14?' · PARTIAL':''} · research score, not odds</small>`:`<b>EXHAUSTION · DIFFERENT SWING</b><small>${house.scoreSide===1?'UP':house.scoreSide===-1?'DOWN':'UNKNOWN'} LEG · score ${house.score??'—'} / 14 · root ${esc(house.scoreRoot??'—')} · coverage ${house.available??'—'} / 14</small>`;
   const chips=house.contributions.map((v,i)=>`<span title="${esc(houseFamilies[i])}: ${v??'unavailable'}"><i style="background:${v==null?'transparent':v>0?houseColors[i]:'#505965'};border:${v==null?'1px solid #7e8794':'0'}"></i>${['VOL','EMA','SAR','CANDLE','GEO','STRUCT','PACE','DIV'][i]}</span>`).join('');
   const event=chosenEvent?`<div class="house-event-detail"><strong>${esc(chosenEvent.name)} · reconstructed</strong><small>Bar ${esc(new Date(chosenEvent.bar).toISOString())} · calculated at ${esc(new Date(house.receivedAt).toISOString())}
${esc(chosenEvent.detail)}</small></div>`:'';
   const content=`<strong>SWING ${esc(house.id??'—')} · ${dir}</strong><em>${esc(house.stage)}</em><p>${house.retracement===null?'B developing':`B retrace ${house.retracement.toFixed(0)}%`}</p>${own}<div class="house-contributions">${chips}</div><small>Parent ${esc(s.snapshot.house_abc.parent_timeframe)}m · closed ${esc(new Date(now).toISOString())} · reconstructed from ${esc(new Date(house.historyStart).toISOString())}</small>${event}`;
   if(card.innerHTML!==content)card.innerHTML=content;card.hidden=false;
   // Place the card in the least crowded corner and keep event targets reachable.
   const cardWidth=Math.min(340,native.coords.width*.42),cardHeight=chosenEvent?Math.min(300,pane.bounds.height*.65):190;
   const lefts=[14,Math.max(14,native.coords.width-cardWidth-14)],tops=[pane.bounds.top+40,Math.max(pane.bounds.top+40,pane.bounds.top+pane.bounds.height-cardHeight-14)];
   const locations=lefts.flatMap(left=>tops.map(top=>({left,top,score:0})));
   const obstacles=[...Object.values(house.points).filter(p=>p.visible).map(p=>({x:p.x,y:p.y,weight:30})),...house.events.map(e=>({x:e.x,y:e.y+(house.side===1?-11:11),weight:100})),...dots.map(d=>({x:d.cx,y:d.cy,weight:3})),...(s.snapshot.display_bars||[]).flatMap(b=>{const px=x(b.time),hi=y(b.high),lo=y(b.low);return Number.isFinite(px)&&Number.isFinite(hi)&&Number.isFinite(lo)?[{x:px,y:(hi+lo)/2,weight:1}]:[]})];
   for(const loc of locations)for(const obstacle of obstacles)if(obstacle.x>=loc.left-10&&obstacle.x<=loc.left+cardWidth+10&&obstacle.y>=loc.top-10&&obstacle.y<=loc.top+cardHeight+10)loc.score+=obstacle.weight;
   locations.sort((a,b)=>a.score-b.score);card.style.left=locations[0].left+'px';card.style.top=locations[0].top+'px';card.style.right='auto';

  }else {selectedWarning=null;const h=s.snapshot.house_abc;card.innerHTML=h?`<strong>HOUSE ABC</strong><small>${h.reason==='EVALUATION_FAILED'?'Evaluation unavailable':h.status==='AVAILABLE'?'Waiting for confirmed parent pivot':'Evaluating completed candles'} · ${esc(h.error_class||'')}</small>`:'';card.hidden=!h;}
  const markup=houseContour+houseLines+bracket+housePoints+guide+houseEvents+dots.map(d=>`<circle class="swing-evaluation-dot" data-evaluation-id="${esc(d.id)}" cx="${d.cx}" cy="${d.cy}" r="${d.radius}" fill="${d.hollow?'#131722':d.color}" stroke="${d.color}" stroke-width=".8" tabindex="0" role="img" aria-label="${esc(d.label)}"><title>${esc(d.label)}</title></circle>`).join('')+(house?[]:tags).map(t=>`<g class="swing-warning-tag" data-warning-id="${esc(t.id)}" tabindex="0" role="img" aria-label="${esc(t.label+' '+t.detail)}"><title>${esc(t.detail)}</title><circle cx="${t.cx}" cy="${t.cy}" r="10" fill="transparent"/><path d="M${t.cx} ${t.cy+3} L${t.cx} ${t.anchorY}" stroke="${t.color}" stroke-opacity=".5" stroke-width=".7"/>${t.features.map((feature,i)=>`<path d="${warningGlyph({...t,feature,cy:t.cy-i*8})}" fill="none" stroke="${t.color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g>`).join('');
  if(view.markup!==markup){svg.innerHTML=markup;view.markup=markup;}
 }
 poll();const timer=setInterval(poll,3000),render=setInterval(paint,200);
 window.addEventListener('pagehide',()=>{disposed=true;pending=null;clear();clearInterval(timer);clearInterval(render);});
 return {attach:paint};
}

import {projectEvaluationDots} from './swing-dot-model.mjs';
import {marketIdentity} from './trading-model.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupSwingTracker({workspace}){
 const wraps=new Map();let data=null,enabled=localStorage.getItem('desk.swing.v12.visible')!=='false';
 const button=document.querySelector('#swingTrackerButton');
 button?.addEventListener('click',()=>{enabled=!enabled;localStorage.setItem('desk.swing.v12.visible',String(enabled));button.setAttribute('aria-pressed',String(enabled));});
 button?.setAttribute('aria-pressed',String(enabled));
 async function poll(){try{const r=await fetch('/api/swing/status');if(!r.ok)throw Error();data=await r.json();}catch{data=null;}}
 poll();const timer=setInterval(poll,3000);
 function attach(cell){if(wraps.has(cell.id))return;wraps.set(cell.id,null);cell.chart.ready().then(()=>{if(!cell.host.isConnected)return;const native=cell.chart.renderer.renderer;if(!native?.plot)return;const root=document.createElement('div');root.className='swing-overlay';root.hidden=!enabled;root.innerHTML='<svg aria-label="Swing Tracker research annotations"></svg><div class="swing-summary"></div>';native.plot.append(root);root.addEventListener('click',e=>{if(e.target.closest('[data-swing-one-minute]'))void cell.chart.setMarket({timeframe:'1'});});wraps.set(cell.id,{cell,native,root,svg:root.querySelector('svg'),panel:root.querySelector('div')});}).catch(()=>wraps.delete(cell.id));}
 function paint(){const ws=workspace();if(ws)for(const cell of ws.cells())attach(cell);
 for(const [id,w] of wraps){if(!w)continue;if(!w.cell.host.isConnected){w.root.remove();wraps.delete(id);continue;}const {native,root,svg,panel,cell}=w,market=marketIdentity(cell.chart),s=data?.symbols?.[market],pane=native.scene?.panes.get('price');root.hidden=!enabled||!!ws?.replay?.state.active;if(root.hidden||!pane)continue;
 if(!s||!s.snapshot||!['OBSERVING','PAUSED'].includes(s.status)||(s.status==='OBSERVING'&&Date.now()-(s.observed_at||0)>75000)){svg.innerHTML='';w.signature=null;panel.innerHTML=`<strong>SWING TRACKER 1.2</strong><p>${!s?'Select Hyperliquid BTC or ETH.':esc(s.status)+' · '+esc(s.detail)}</p><a href="/swing-lab.html" target="_blank" rel="noopener">Open Swing Lab ↗</a>`;continue;}
 const snap=s.snapshot,minuteChart=String(cell.chart.market.timeframe)==='1',x=t=>native.coords.timeToX(t),y=p=>native.coords.priceToY(p,pane.scale,pane.bounds),width=native.coords.width,now=snap.cutoff,ink='#b7c9e1',green='#00bfa5',red='#ff6072',amber='#e3b75d';let shapes=[];
 const line=(t1,p1,t2,p2,color,dash='')=>{const points=[x(t1),y(p1),x(t2),y(p2)];if(points.every(Number.isFinite))shapes.push(`<line x1="${points[0]}" y1="${points[1]}" x2="${points[2]}" y2="${points[3]}" stroke="${color}" stroke-width="1.5" ${dash?`stroke-dasharray="${dash}"`:''}/>`);};
 const text=(t,p,label,color)=>{const px=x(t),py=y(p);if(Number.isFinite(px)&&Number.isFinite(py))shapes.push(`<text x="${px+5}" y="${py-7}" fill="${color}" font-size="10" paint-order="stroke" stroke="#131722" stroke-width="3">${esc(label)}</text>`);};
 const context=snap.visual_context;
 if(context){const left=Math.max(0,x(context.range_start)),right=Math.min(width,x(now+5*60000)),high=context.range_high,low=context.range_low,span=high-low;
  if(right>left){for(const [top,bottom,color] of [[high,high-span*.15,red],[low+span*.15,low,green],[low+span*.52,low+span*.48,ink]])shapes.push(`<rect x="${left}" y="${y(top)}" width="${right-left}" height="${Math.max(0,y(bottom)-y(top))}" fill="${color}" opacity=".08"/>`);}
  const band=context.band;if(band){line(band.start,band.start_upper,band.end,band.end_upper,ink);line(band.start,band.start_lower,band.end,band.end_lower,ink);const projected=now+5*60000,steps=(projected-band.end)/60000;for(const key of ['upper','lower'])line(band.end,band['end_'+key],projected,band['end_'+key]+band.slope_per_minute*steps,ink,'4 5');line(band.start,band.anchor_price,band.endpoint,band.endpoint_price,band.direction===1?green:red);}
 }
 const piv=snap.pivots;for(let i=1;i<piv.length;i++)line(piv[i-1].origin,piv[i-1].price,piv[i].origin,piv[i].price,ink);
 const candidates=snap.candidates.filter(c=>c.state==='WATCH').slice(-2);
 for(const c of candidates){const color=c.side===1?green:red;line(c.a.origin,c.a.price,c.b.origin,c.b.price,color);line(c.b.origin,c.b.price,c.c_origin,c.c,amber,'5 4');text(c.a.origin,c.a.price,'A #'+c.id,color);text(c.b.origin,c.b.price,'B #'+c.id,color);text(c.c_origin,c.c,'C? · '+c.reason,amber);
 if(c.channel){const r=c.channel;for(let i=0;i<2;i++)line(r.start,r.start_edges[i],r.end,r.end_edges[i],amber,'4 5');}
 }
 for(const p of snap.plans.slice(-8)){if(p.signal_at<(s.started||Infinity)||p.reason==='WARMUP_END')continue;text(p.observed_at||p.signal_at,p.reference,`${p.side===1?'▲':'▼'} #${p.id} ${p.status}`,p.side===1?green:red);if(['PENDING','OPEN'].includes(p.status)){for(const [price,label,color] of [[p.reference,'Shadow entry',ink],[p.stop,'Shadow stop',red],[p.target,'Shadow target',green]]){line(p.signal_at,price,now+3*60000,price,color,'5 4');text(now+3*60000,price,label,color);}}}
 const dots=projectEvaluationDots(s.dots||[],{timeToX:x,priceToY:y,width,top:pane.bounds.top,height:pane.bounds.height,timeframe:cell.chart.market.timeframe,barWidth:Math.abs(x(now+60000)-x(now))});
 for(const d of dots)shapes.push(`<circle class="swing-evaluation-dot" data-evaluation-id="${esc(d.id)}" cx="${d.cx}" cy="${d.cy}" r="${d.radius}" fill="${d.hollow?'#131722':d.color}" stroke="${d.color}" stroke-width="1.2" tabindex="0" role="img" aria-label="${esc(d.label)}"><title>${esc(d.label)}</title></circle>`);
 const markup=`<defs><clipPath id="swing-clip-${esc(id)}"><rect x="0" y="${pane.bounds.top}" width="${width}" height="${pane.bounds.height}"/></clipPath></defs><g clip-path="url(#swing-clip-${esc(id)})">${shapes.join('')}</g>`;if(w.signature!==markup){svg.innerHTML=markup;w.signature=markup;}
 panel.innerHTML=`<strong>SWING TRACKER 1.2 · RESEARCH</strong><p>${esc(market)} · ${snap.config.swing_minutes}m swing / 1m confirmation<br>${esc(s.status)} · Parent #${snap.parent_id} · ${snap.trend===1?'HH / HL':snap.trend===-1?'LH / LL':'ROTATION'} · ${candidates.length} watches<br>Jev ${esc(s.jev?.status||'disabled')} · ${60/s.config.cadence_seconds} evaluations / minute<br>${minuteChart?'● Green: long · ● Red: short · ● Gray: neutral':'<button data-swing-one-minute>Switch to 1m for dots</button>'}<br>Hollow: unavailable · hover a dot for its timestamp</p><a href="/swing-lab.html" target="_blank" rel="noopener">Decisions & outcomes ↗</a>`;
 }}
 const render=setInterval(paint,200);window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(render);});return {attach};
}

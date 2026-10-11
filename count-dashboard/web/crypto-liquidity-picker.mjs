import {FRAMES,FRAME_MS,liquidityVisible} from './wave-court-port.mjs';
// Pixel geometry comes from the same native coordinate system as the wick drawings.
// This optional UI adapter never changes Wave Court calculations or source candles.
export function createLiquidityPicker({getSlot,getRead,getManual,getSelected,isEnabled,onToggle,onHover}){
 let slot=null,native=null,root=null,frame=null,last='',hoverKey='',buttons=new Map();
 function attach(next){root?.remove();buttons.clear();last='';hoverKey='';slot=next;native=slot?.chart?.renderer?.renderer;root=null;
  if(!native?.plot||!native.coords||!native.scene)return;
  root=document.createElement('div');root.className='desk-liquidity-pick-layer';root.setAttribute('aria-label','Select liquidity hunt lines on the chart');native.plot.append(root);
  slot.chart.renderer.applyConfig({margins:{right:32}});
 }
 function tick(){frame=requestAnimationFrame(tick);if(document.hidden)return;const next=getSlot();if(next!==slot||next?.chart?.renderer?.renderer!==native)attach(next);if(!root)return;
  const read=getRead(),o=read?.settings,pane=native.scene.panes.get('price');const enabled=isEnabled()&&!slot.chart.drawings.getTool();
  root.hidden=!read||!pane||(!o.liquidity&&!(getManual?.().length));root.style.pointerEvents='none';if(root.hidden)return;
  const selected=getSelected(),picked=new Set(selected),end=(read.frames[6].cutoff??read.cutoff)+60000+12*FRAME_MS[o.core];
  // Selected consumed levels remain removable over their original, ended segment.
  const pools=[...read.raw,...(getManual?.()||[])].filter(p=>(p.origin==='manual'||o.liquidity&&liquidityVisible(p,read.chartTimeframe))&&(!p.taken||picked.has(p.id)));
  const groups=new Map();for(const p of pools){const key=String(p.price)+':'+(p.taken?p.takenAt:end);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
  const signature=[enabled,read.frames[6].cutoff,read.cutoff,...pools.map(p=>p.id+':'+p.price),...selected,native.coords.width,pane.bounds.top,pane.bounds.height,pane.scale.min,pane.scale.max,pane.scale.log,pane.scale.invert,JSON.stringify(native.coords.getViewport())].join('|');if(signature===last)return;last=signature;
  const retained=new Set();for(const [key,group] of groups){const p=group[0],y=native.coords.priceToY(p.price,pane.scale,pane.bounds),x0=Math.max(0,native.coords.timeToX(Math.min(...group.map(p=>p.time)))),x1=Math.min(native.coords.width,native.coords.timeToX(p.taken?p.takenAt:end));
   if(!Number.isFinite(y)||y<pane.bounds.top+6||y>pane.bounds.top+pane.bounds.height-6||x1<=x0)continue;retained.add(key);let button=buttons.get(key);
   if(!button){button=document.createElement('button');button.type='button';button.className='desk-liquidity-pick-line';button.dataset.huntLine=key;button.innerHTML='<i></i>';root.append(button);buttons.set(key,button);button.onpointerdown=e=>{e.stopPropagation();};button.onclick=e=>{e.stopPropagation();if(!enabled)return;const ids=group.some(p=>getSelected().includes(p.id))?group.filter(p=>getSelected().includes(p.id)).map(p=>p.id):group.filter(p=>!p.taken).map(p=>p.id);if(ids.length)onToggle(ids);};button.onpointerenter=()=>{hoverKey=key;onHover?.(group);};button.onpointerleave=()=>{if(hoverKey===key){hoverKey='';onHover?.([]);}};}
   // Handlers must read the latest pool set after source refreshes.
   button.onclick=e=>{e.stopPropagation();if(!isEnabled()||slot.chart.drawings.getTool())return;const ids=group.some(p=>getSelected().includes(p.id))?group.filter(p=>getSelected().includes(p.id)).map(p=>p.id):group.filter(p=>!p.taken).map(p=>p.id);if(ids.length)onToggle(ids);};button.onpointerenter=()=>onHover?.(group);
   const isPicked=group.some(p=>picked.has(p.id)),tf=group.some(p=>p.origin==='manual')?'MANUAL':[...new Set(group.map(p=>FRAMES[p.tf].toUpperCase()))].join('/');button.setAttribute('aria-label',`${isPicked?'Deselect':'Select'} ${tf} liquidity ${p.price}`);button.setAttribute('aria-pressed',String(isPicked));button.title=`${tf} · ${p.price} · click to ${isPicked?'stop hunting':'hunt'}`;button.classList.toggle('is-selected',isPicked);button.classList.toggle('is-enabled',enabled);Object.assign(button.style,{left:x0+'px',top:(y-6)+'px',width:(x1-x0)+'px',pointerEvents:enabled?'auto':'none'});
  }
  for(const [key,button] of buttons)if(!retained.has(key)){button.remove();buttons.delete(key);}
 }
 frame=requestAnimationFrame(tick);
 return {refresh(){last='';},destroy(){cancelAnimationFrame(frame);root?.remove();buttons.clear();}};
}

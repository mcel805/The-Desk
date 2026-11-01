import {GEOMETRY_FRAMES,FRAME_STYLE,geometryFrameColor,stageLabel} from './market-geometry-model.mjs';

// Display selection only. The complete, causal ledger remains in model.geometry.
export function focusTurn(result){
 const candidates=result.turns?.candidates||[],active=candidates.filter(c=>!c.terminal);
 return active.at(-1)||candidates.filter(c=>result.cutoff-c.lastEvent?.knownAt<=20*60000).at(-1)||null;
}
export function focusSteps(result,candidate=focusTurn(result)){
 if(!candidate)return [];
 const events=result.turns.events.filter(e=>e.candidateId===candidate.id&&e.knownAt<=result.cutoff),stages=[['contact','escape'],['shift'],['retest']];
 return stages.map((allowed,i)=>{const event=events.find(e=>allowed.includes(e.stage));return event?{number:i+1,event,text:i===0?'Geometry contact':i===1?'1M structure shift':'Retest held'}:null;}).filter(Boolean);
}
const svgNS='http://www.w3.org/2000/svg';
const svg=(tag,attributes={})=>{const e=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attributes))e.setAttribute(k,String(v));return e;};
const text=(tag,value,className='')=>{const e=document.createElement(tag);e.textContent=value;e.className=className;return e;};
const time=t=>Number.isFinite(t)?new Date(t).toISOString().slice(11,16)+' UTC':'unavailable';
const dateTime=t=>new Date(t).toISOString().slice(5,16).replace('T',' ')+' UTC';

export function createGeometryFocus(native,id,{chart:owner}={}){
 const root=document.createElement('section');root.className='geometry-focus';root.dataset.studyId=id;root.setAttribute('aria-label','Market Geometry focus');
 const panel=document.createElement('div');panel.className='geometry-focus-panel';
 const header=text('div','','geometry-focus-header'),title=text('strong','MARKET GEOMETRY'),toggle=text('button','−');toggle.type='button';toggle.setAttribute('aria-label','Collapse geometry overview');const lineView=text('button','Line view');lineView.type='button';lineView.title='Close-price line or candles; geometry still uses source OHLC wicks.';lineView.onclick=()=>{const isLine=native.scene.priceStyle==='line';owner?.renderer.set('priceStyle',isLine?'candles':'line');lineView.textContent=isLine?'Line view':'Candles';};header.append(title,lineView,toggle);
 const chips=document.createElement('div');chips.className='geometry-focus-chips';
 const overview=document.createElement('div');overview.className='geometry-focus-overview';
 const controls=document.createElement('div');controls.className='geometry-focus-controls';controls.append(text('span','BIGGER PICTURE'));
 const chart=svg('svg',{viewBox:'0 0 480 86',role:'img','aria-label':'Higher timeframe closes and confirmed swing geometry'});
 const legend=text('div','','geometry-focus-legend'),turn=document.createElement('div');turn.className='geometry-focus-turn';
 overview.append(controls,chart,legend);panel.append(header,chips,text('div','1M: solid = locked swings · dashed = developing','geometry-focus-main-legend'),overview,turn);
 const leaders=svg('svg',{'aria-hidden':'true',class:'geometry-focus-leaders'}),callout=document.createElement('div');callout.className='geometry-focus-callout';callout.hidden=true;
 root.append(leaders,panel,callout);native.plot.append(root);
 // The overlay never captures price-chart gestures except its own controls.
 for(const type of ['pointerdown','pointermove','pointerup','mousedown','click','dblclick','contextmenu','wheel'])panel.addEventListener(type,e=>e.stopPropagation());
 let selected='15',collapsed=false,current=null,signature='';
 toggle.onclick=()=>{collapsed=!collapsed;overview.hidden=collapsed;toggle.textContent=collapsed?'＋':'−';toggle.setAttribute('aria-label',(collapsed?'Expand':'Collapse')+' geometry overview');};
 for(const tf of ['60','30','15','5']){const b=text('button',FRAME_STYLE[tf].name);b.type='button';b.dataset.frame=tf;b.onclick=()=>{selected=tf;signature='';update(current);};controls.append(b);}
 function update(model){
  if(!model)return;current=model;const g=model.geometry,inputs=model.inputValues||{},data=model.geometryFocus,light=data.light;
  root.classList.toggle('is-light',!!light);root.classList.toggle('is-overview-only',!!data.overviewOnly);
  root.hidden=inputs.showStatus===false;
  const fingerprint=JSON.stringify([g.cutoff,g.revision,inputs,selected,focusTurn(g)?.lastEvent?.id,light,GEOMETRY_FRAMES.map(tf=>[data.sources[tf]?.status,data.sources[tf]?.error,data.sources[tf]?.closedThrough,g.frames[tf]?.structure?.direction])]);
  lineView.textContent=native.scene.priceStyle==='line'?'Candles':'Line view';
  if(signature===fingerprint)return;signature=fingerprint;
  chips.replaceChildren();
  for(const tf of GEOMETRY_FRAMES){const s=data.sources[tf],f=g.frames[tf],d=f?.structure?.direction,chip=text('span',FRAME_STYLE[tf].name+' '+(s?.status==='ready'?(d>0?'↑':d<0?'↓':'·'):'—'));
   chip.style.color=geometryFrameColor(tf,inputs,light);
   chip.title=s?.status==='ready'?'Independent '+FRAME_STYLE[tf].name+' structure · closed through '+time(s.closedThrough):s?.error||s?.status||'Unavailable';chips.append(chip);
  }
  for(const b of controls.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b.dataset.frame===selected));b.disabled=inputs['showFrame'+b.dataset.frame]===false;}
  if(inputs['showFrame'+selected]===false)selected=['60','30','15','5'].find(tf=>inputs['showFrame'+tf]!==false)||'15';
  const source=data.sources[selected],bars=source?.status==='ready'&&inputs['showFrame'+selected]!==false?(source.bars||[]).slice(-120):[],f=g.frames[selected];chart.replaceChildren();
  if(bars.length>1){
   const start=bars[0].time,end=bars.at(-1).time,lo=Math.min(...bars.map(b=>b.low)),hi=Math.max(...bars.map(b=>b.high)),span=Math.max(hi-lo,g.tick||1);
   const x=t=>8+464*(t-start)/(end-start),y=p=>76-66*(p-lo)/span;
   const path=points=>points.map((p,i)=>(i?'L':'M')+x(p.time).toFixed(2)+','+y(p.price).toFixed(2)).join(' ');
   chart.append(svg('path',{d:path(bars.map(b=>({time:b.time,price:b.close}))),fill:'none',stroke:light?'#8894A5':'#69778B','stroke-width':1}));
   const pivots=(f?.locked||[]).filter(p=>p.time>=start&&p.time<=end&&p.lockedAt<=g.cutoff);
   if(inputs.showSwingPaths!==false&&pivots.length>1)chart.append(svg('path',{d:path(pivots),fill:'none',stroke:geometryFrameColor(selected,inputs,light),'stroke-width':2}));
   legend.textContent=FRAME_STYLE[selected].name+' · '+dateTime(start)+' – '+dateTime(end)+' · gray: closes / color: locked swings';
  }else legend.textContent=FRAME_STYLE[selected].name+' · '+(source?.error||source?.status||'Unavailable');
  const candidate=focusTurn(g);turn.replaceChildren();
  if(!data.overviewOnly&&inputs.showFrame1!==false){
   const ready=data.sources['1']?.status==='ready',held=candidate&&!candidate.terminal&&candidate.retestAt;
   turn.classList.toggle('is-held',!!held&&ready);
   turn.append(text('strong',!ready?'1M · source unavailable':candidate?(candidate.side>0?'↑ ':'↓ ')+stageLabel(candidate.stage):'1M · waiting for geometry contact'));
   const next=text('span',candidate?(candidate.terminal?'Latest sequence ended · wait for a fresh contact':candidate.next):'Contact → closed-bar shift → held retest');turn.append(next);
   const steps=text('div','1 Contact   →   2 Shift   →   3 Retest held','geometry-focus-steps');
   if(candidate){const done=focusSteps(g,candidate);steps.textContent=['Contact','Shift','Retest held'].map((s,i)=>(done.some(d=>d.number===i+1)?'● ':'○ ')+(i+1)+' '+s).join('  →  ');}
   turn.append(steps,text('small',time(g.cutoff)+' · closed evidence · parent shifts independent'));
   if(candidate?.geometry){const rail=candidate.geometry;turn.title=candidate.family+' · '+FRAME_STYLE[rail.frame]?.name+' rail · '+(rail.projected?'projected contact':'audited contact')+' · rail ends '+dateTime(rail.endAt)+' · reference '+(candidate.reference?.price??'unavailable');}
  }
 }
 function position(){
  if(!current||root.hidden)return;const model=current,g=model.geometry,pane=native.scene?.panes.get('price'),width=native.coords?.width;
  if(!pane||!width)return;root.style.width=width+'px';root.style.height=(pane.bounds.top+pane.bounds.height)+'px';leaders.setAttribute('viewBox',`0 0 ${width} ${pane.bounds.top+pane.bounds.height}`);leaders.replaceChildren();callout.hidden=true;
  if(model.geometryFocus.overviewOnly||model.inputValues.showFrame1===false)return;
  const candidate=focusTurn(g);if(!candidate||candidate.terminal||model.geometryFocus.sources['1']?.status!=='ready')return;
  const points=focusSteps(g,candidate);if(!points.length)return;
  let last=null;
  for(const p of points){const x=native.coords.timeToX(p.event.knownAt-60000),y=native.coords.priceToY(p.event.price,pane.scale,pane.bounds);if(!Number.isFinite(x)||!Number.isFinite(y)||x<10||x>width-10||y<pane.bounds.top+12||y>pane.bounds.top+pane.bounds.height-12)continue;
   const ink=p.number===3?(model.geometryFocus.light?'#087F83':'#2CCAC8'):(model.geometryFocus.light?'#986207':'#F6BD54');leaders.append(svg('circle',{cx:x,cy:y,r:4,fill:ink,stroke:'#131722','stroke-width':1.5}));last={...p,x,y,ink};
  }
  if(!last)return;const boxWidth=Math.min(205,width-30),left=Math.max(12,Math.min(width-boxWidth-12,last.x-boxWidth/2)),top=Math.min(pane.bounds.top+pane.bounds.height-52,Math.max(panel.offsetTop+panel.offsetHeight+14,last.y-70));
  // On small/short charts keep the single status card; don't force a callout over it.
  if(top<panel.offsetTop+panel.offsetHeight+12)return;
  callout.hidden=false;callout.style.left=left+'px';callout.style.top=top+'px';callout.style.width=boxWidth+'px';callout.style.borderColor=last.ink;
  callout.textContent=last.number+' · '+last.text;callout.title='Closed bar known at '+time(last.event.knownAt)+' · '+(last.event.family||'')+' · reference '+(candidate.reference?.price??'unavailable');
  leaders.append(svg('path',{d:`M${left+boxWidth/2},${top+30} L${last.x},${last.y}`,stroke:last.ink,'stroke-width':1,fill:'none'}));
 }
 return {root,update,position,destroy:()=>root.remove()};
}

// Resolve models from each chart's own engine; duplicate study IDs never cross charts.
export function setupGeometryFocus({workspace}){
 const panels=new Map();let stopped=false,last=0,raf;
 function frame(now){
  if(stopped)return;raf=requestAnimationFrame(frame);if(document.hidden||now-last<80)return;last=now;const live=new Set();
  for(const cell of workspace()?.cells()||[]){
   const chart=cell.chart,native=chart.renderer?.renderer;if(!native?.plot)continue;
   const engine=chart.orchestrator?.engines?.get('pine');
   for(const study of chart.indicators?.()||[]){const id=study.id||study.instanceId,model=engine?.records?.get(id)?.model,key=cell.id+':'+id;if(!model?.geometryFocus||study.visible===false)continue;live.add(key);let p=panels.get(key);if(!p){p=createGeometryFocus(native,id,{chart});panels.set(key,p);}p.update(model);p.position();}
  }
  for(const [key,p]of panels)if(!live.has(key)){p.destroy();panels.delete(key);}
 }
 raf=requestAnimationFrame(frame);return {destroy(){stopped=true;cancelAnimationFrame(raf);for(const p of panels.values())p.destroy();panels.clear();}};
}

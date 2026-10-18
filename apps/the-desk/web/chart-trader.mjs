import {marketIdentity,tradingLevels,tradeLevelPlacement,paperExecutionMarkers,formatTradePrice} from './trading-model.mjs';
import {moveDraftBracket,bracketLabel} from './chart-bracket-model.mjs';
import {createAgenticElliotPanel} from './agentic-elliot-panel.mjs';

export function setupChartTrader({workspace,state,config,draftLevels,snap,stage,menu,placeDraft,editOrder,editBracket,closePosition,reversePosition,cancelOrder,removeProtection,toast}){
  const wraps=new Map();let drag=null;
  function agenticModel(event){const {id,model}=event.detail||{};if(!id)return;const cells=workspace()?.cells()||[],exact=[];for(const cell of cells)for(const study of cell.chart.indicators?.()||[])if(study.id===id||study.instanceId===id)exact.push({cell,study});let matches=exact;if(!matches.length){for(const cell of cells)for(const study of cell.chart.indicators?.()||[])if(study.title==='Agentic - Elliot Waves'||study.name==='Agentic - Elliot Waves'||study.source?.includes('indicator("Agentic - Elliot Waves", "Agentic - Elliot Waves"'))matches.push({cell,study});if(matches.length!==1)return;}for(const {cell,study} of matches){const wrap=wraps.get(cell.id);if(!wrap)continue;const key=study.id||study.instanceId||id;let panel=wrap.elliotPanels.get(key);if(!panel){panel=createAgenticElliotPanel(wrap.overlay,key);wrap.elliotPanels.set(key,panel);}panel.update(model);}}
  window.addEventListener('desk:agentic-elliot-model',agenticModel);
  function validDrag(d){const ws=workspace(),s=state();return !!ws&&!!s&&!ws.replay.state.active&&s.active_account===d.account&&ws.active.id===d.cellId&&marketIdentity(ws.active.chart)===d.market;}
  function attach(cell){
    if(cell.deskAttached)return;cell.deskAttached=true;
    cell.chart.ready().then(()=>{
      const native=cell.chart.renderer.renderer;if(!native?.plot)return;
      const overlay=document.createElement('div');overlay.className='trade-overlay';native.plot.append(overlay);
      const quick=document.createElement('div');quick.className='chart-quick-trade';quick.innerHTML='<button class="sell" data-quick="sell">Sell · PAPER</button><button class="buy" data-quick="buy">Buy · PAPER</button>';overlay.append(quick);quick.querySelectorAll('button').forEach(b=>b.onclick=()=>{workspace().setActiveCell(cell.id);stage(b.dataset.quick,'market');});
      const plus=document.createElement('button');plus.className='chart-price-plus';plus.textContent='+';plus.title='Trade at this chart price';plus.setAttribute('aria-label','Trade at hovered chart price');plus.hidden=true;overlay.append(plus);
      const wrap={overlay,nodes:new Map(),fills:new Map(),elliotPanels:new Map(),native,quick,plus,cursorTime:null,cursorPrice:null};wraps.set(cell.id,wrap);
      cell.chart.renderer.onCrosshairMove(({time,price,paneKind})=>{if(paneKind==='price'){wrap.cursorTime=time;wrap.cursorPrice=price;}});
      native.plot.addEventListener('contextmenu',e=>{if(e.target.closest('.trade-line,.chart-price-plus'))return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect();if(!pane||e.clientY-rect.top>pane.bounds.top+pane.bounds.height)return;const price=native.coords.yToPrice(e.clientY-rect.top,pane.scale,pane.bounds);if(!(price>0))return;e.preventDefault();e.stopImmediatePropagation();workspace().setActiveCell(cell.id);menu(price,e.clientX,e.clientY,cell,wrap.cursorTime);},true);
      native.plot.addEventListener('pointermove',e=>{if(drag)return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect(),y=e.clientY-rect.top;if(!pane||y<pane.bounds.top||y>pane.bounds.top+pane.bounds.height){plus.hidden=true;return;}const x=e.clientX-rect.left;plus.hidden=x<rect.width-85||workspace().replay.state.active;if(!plus.hidden){plus.style.top=Math.max(0,y-11)+'px';plus.dataset.price=cellSnap(cell,native.coords.yToPrice(y,pane.scale,pane.bounds));}});
      native.plot.addEventListener('pointerleave',()=>{plus.hidden=true;});plus.onclick=e=>{workspace().setActiveCell(cell.id);menu(Number(plus.dataset.price),e.clientX,e.clientY,cell,wrap.cursorTime);};
    }).catch(e=>toast('Chart trader initialization: '+e.message,true));
  }
  function cellSnap(cell,value){const tick=Number(state()?.quotes[marketIdentity(cell.chart)]?.tick||.01);return Number((Math.round(value/tick)*tick).toPrecision(12));}
  function createLine(level,wrap,cell,pane){
    const {overlay,native}=wrap,node=document.createElement('div');node.className='trade-line';node.dataset.key=level.key;
    const group=document.createElement('div');group.className='trade-line-controls';const label=document.createElement('button');label.className='trade-line-label';group.append(label);node.append(group);const badge=document.createElement('span');badge.className='trade-price-badge';node.append(badge);overlay.append(node);
    function edit(l){if(l.kind==='order')editOrder(l.item);else if(l.kind==='position')editBracket(l.item);else document.querySelector('#'+({entry:l.item.kind==='stop'?'triggerPrice':'entryPrice',trigger:'triggerPrice',stop:'stopPrice',target:'targetPrice'}[l.field]))?.focus();}
    label.onpointerdown=e=>{const l=node.level;if(e.button!==0||node.offscale||l.kind==='position'&&l.field==='entry')return;e.preventDefault();e.stopPropagation();workspace().setActiveCell(cell.id);drag={node,level:l,startY:e.clientY,startPrice:l.price,price:l.price,native,pane:native.scene.panes.get('price'),account:state().active_account,market:marketIdentity(cell.chart),cellId:cell.id};e.target.setPointerCapture(e.pointerId);};
    label.onpointermove=e=>{if(drag?.node!==node)return;e.stopPropagation();const pane=drag.pane;drag.price=cellSnap(cell,native.coords.yToPrice(native.coords.priceToY(drag.startPrice,pane.scale,pane.bounds)+e.clientY-drag.startY,pane.scale,pane.bounds));};
    label.onpointerup=e=>{if(drag?.node!==node)return;e.stopPropagation();const d=drag;drag=null;if(!validDrag(d))return;if(Math.abs(e.clientY-d.startY)<3){edit(d.level);return;}if(d.level.kind==='draft')d.level.amend?.(d.price);else if(d.level.kind==='order')editOrder(d.level.item,{[d.level.field]:String(d.price)});else editBracket(d.level.item,{[d.level.field]:String(d.price)});};
    label.onpointercancel=()=>{drag=null;};label.onlostpointercapture=()=>{if(drag?.node===node)drag=null;};label.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();edit(node.level);}};
    node.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();edit(node.level);};
    label.onclick=()=>{if(node.offscale)edit(node.level);else if(node.level.kind==='position'&&node.level.field==='entry')editBracket(node.level.item);};
    if(level.kind==='draft'||level.kind==='order'||['stop','target'].includes(level.field)){const cancel=document.createElement('button');cancel.textContent='×';cancel.dataset.action='cancel';cancel.setAttribute('aria-label',level.kind==='draft'?'Remove draft '+level.field:['stop','target'].includes(level.field)?'Remove '+level.field:'Cancel chart order');cancel.onclick=()=>{const l=node.level;if(l.kind==='draft')l.remove?.();else if(['stop','target'].includes(l.field))removeProtection(l);else cancelOrder(l.item);};group.append(cancel);}
    if(level.kind==='draft'&&level.field==='entry'&&level.item.kind==='limit'){
      const b=document.createElement('button');b.textContent='Place';b.dataset.action='place';b.setAttribute('aria-label','Review and place draft paper order');b.onclick=()=>placeDraft?.();group.append(b);
    }
    if(level.kind==='position'&&level.field==='entry'){
      for(const [action,text] of [['protect','SL/TP'],['reverse','⇄'],['close','×']]){const b=document.createElement('button');b.textContent=text;b.dataset.action=action;b.setAttribute('aria-label',action==='close'?'Close chart position':action==='reverse'?'Reverse chart position':'Protect chart position');b.onclick=()=>action==='close'?closePosition(node.level.item):action==='reverse'?reversePosition(node.level.item):editBracket(node.level.item);group.append(b);}
    }
    return node;
  }
  function frame(){
    const ws=workspace(),s=state(),c=config();
    if(drag&&!validDrag(drag))drag=null;
    if(ws&&s)for(const cell of ws.cells()){
      const wrap=wraps.get(cell.id);if(!wrap)continue;
      const {overlay,nodes,native,quick}=wrap,pane=native.scene?.panes.get('price');if(!pane)continue;
      const studyIds=new Set((cell.chart.indicators?.()||[]).flatMap(h=>[h.id,h.instanceId].filter(Boolean)));for(const [id,panel] of wrap.elliotPanels)if(!studyIds.has(id)){panel.destroy();wrap.elliotPanels.delete(id);}
      const market=marketIdentity(cell.chart),replay=ws.replay.state.active;
      quick.hidden=!c.quickButtons||replay;const quote=s.quotes[market];quick.querySelectorAll('button').forEach(b=>{b.disabled=!quote||Date.now()/1000-quote.received_at>15;b.textContent=(b.dataset.quick==='buy'?'Buy ':'Sell ')+(quote?quote[b.dataset.quick==='buy'?'ask':'bid']:'—')+' · PAPER';});
      const levels=replay?[]:tradingLevels(s,market,c);if(!replay&&cell.id===ws.active.id)levels.push(...draftLevels());
      const live=new Set(levels.map(l=>l.key));if(drag?.cellId===cell.id&&!live.has(drag.level.key))drag=null;for(const [key,node] of nodes)if(!live.has(key)){node.remove();nodes.delete(key);}
      const occupied=[],preview=drag?.level.kind==='draft'?moveDraftBracket(drag.level.item,drag.level.field,drag.price,Number(quote?.tick||.01)):null;
      for(let level of levels){const dragging=drag?.level.key===level.key;
        if(level.kind==='draft'&&preview&&preview[level.field]!=null){const item={...level.item,...preview};level={...level,price:preview[level.field],label:level.field==='entry'?'DRAFT · not placed':'DRAFT · '+bracketLabel(item,level.field,quote)};}
        else if(dragging){const item={...level.item,[level.field]:drag.price};level={...level,price:drag.price,label:(level.kind==='draft'?'DRAFT · ':'')+bracketLabel(item,level.field,quote)};}
        let node=nodes.get(level.key);if(!node){node=createLine(level,wrap,cell,pane);nodes.set(level.key,node);}node.level=level;node.dataset.price=level.price;node.dataset.kind=level.kind;node.dataset.field=level.field;node.dataset.itemId=level.item?.id||'';
        const placement=tradeLevelPlacement(native.coords.priceToY(level.price,pane.scale,pane.bounds),pane.bounds),y=placement?.y;
        node.offscale=placement?.edge||null;node.classList.toggle('offscale',!!node.offscale);node.dataset.edge=node.offscale||'';
        node.style.display=placement?'':'none';node.style.top=y+'px';node.style.right=Math.max(0,overlay.clientWidth-native.coords.width)+'px';node.style.left='0px';node.style.setProperty('--level',level.color);node.classList.toggle('draft',level.kind==='draft');
        node.classList.toggle('protection',['stop','target'].includes(level.field));node.classList.toggle('dragging',dragging);
        const axisWidth=Math.max(0,overlay.clientWidth-native.coords.width);node.querySelector('.trade-price-badge').style.width=axisWidth+'px';node.querySelector('.trade-price-badge').textContent=Number(level.price).toLocaleString('en-US',{maximumFractionDigits:8});
        let labelY=Math.max(pane.bounds.top+13,Math.min(y,pane.bounds.top+pane.bounds.height-13));
        for(let i=0;i<levels.length*2;i++){const candidate=labelY+(i%2?1:-1)*Math.ceil(i/2)*26;if(candidate>=pane.bounds.top+13&&candidate<=pane.bounds.top+pane.bounds.height-13&&!occupied.some(v=>Math.abs(v-candidate)<25)){labelY=candidate;break;}}
        occupied.push(labelY);node.querySelector('.trade-line-controls').style.transform='translateY('+(labelY-y)+'px)';
        const label=node.querySelector('.trade-line-label');label.textContent=node.offscale?(node.offscale==='top'?'↑ ':'↓ ')+level.label+(level.label.includes(' @ ')?' · off scale':' · '+level.item.side.toUpperCase()+' '+level.item.qty+' · '+formatTradePrice(level.price)+' · off scale'):level.label;
        label.title=(level.kind==='draft'?'Draft':'Paper')+' · '+level.item.side+' '+level.item.qty+(dragging?' · Release to '+(level.kind==='draft'?'update ticket':'review amendment'):'');label.setAttribute('aria-label',level.label+' at '+level.price+(node.offscale?'. Outside visible price scale. Click or press Enter to edit.':'. Drag or press Enter to edit.'));
        const reverse=node.querySelector('[data-action=reverse]');if(reverse){reverse.hidden=!c.reverse;reverse.disabled=market.startsWith('coinbase:');reverse.title=market.startsWith('coinbase:')?'Spot reversal would create an unsupported short':'Reverse paper position';}
      }
      const executions=paperExecutionMarkers(s,market,c,replay),ids=new Set(executions.map(f=>f.id));for(const [id,n] of wrap.fills)if(!ids.has(id)){n.remove();wrap.fills.delete(id);}
      for(const fill of executions){let n=wrap.fills.get(fill.id);if(!n){n=document.createElement('div');n.className='chart-execution';n.dataset.fillId=fill.id;n.title='PAPER · '+fill.side.toUpperCase()+' '+fill.qty+' '+fill.instrument+' at '+fill.price+' · '+fill.reason+' · '+fill.executed_at;n.setAttribute('aria-label',n.title);overlay.append(n);wrap.fills.set(fill.id,n);}const x=native.coords.timeToX(Date.parse(fill.executed_at)),y=native.coords.priceToY(Number(fill.price),pane.scale,pane.bounds);n.style.display=Number.isFinite(x)&&x>=0&&x<=native.coords.width&&y>=pane.bounds.top&&y<=pane.bounds.top+pane.bounds.height?'':'none';n.style.left=x+'px';n.style.top=y+'px';n.classList.toggle('buy',fill.side==='buy');n.classList.toggle('sell',fill.side==='sell');n.textContent=fill.side==='buy'?'▲':'▼';}
    }
    requestAnimationFrame(frame);
  }
  function cleanup(){for(const [id,wrap] of wraps)if(!workspace().cells().some(c=>c.id===id)){for(const panel of wrap.elliotPanels.values())panel.destroy();wrap.overlay.remove();wraps.delete(id);}}
  return {attach,cleanup,start:()=>requestAnimationFrame(frame)};
}

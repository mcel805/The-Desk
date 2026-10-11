import {marketIdentity,tradingLevels} from './trading-model.mjs';

export function setupChartTrader({workspace,state,config,draftLevels,snap,stage,menu,editOrder,editBracket,closePosition,reversePosition,cancelOrder,toast}){
  const wraps=new Map();let drag=null;
  function attach(cell){
    if(cell.deskAttached)return;cell.deskAttached=true;
    cell.chart.ready().then(()=>{
      const native=cell.chart.renderer.renderer;if(!native?.plot)return;
      const overlay=document.createElement('div');overlay.className='trade-overlay';native.plot.append(overlay);
      const quick=document.createElement('div');quick.className='chart-quick-trade';quick.innerHTML='<button class="sell" data-quick="sell">Sell · PAPER</button><button class="buy" data-quick="buy">Buy · PAPER</button>';overlay.append(quick);quick.querySelectorAll('button').forEach(b=>b.onclick=()=>{workspace().setActiveCell(cell.id);stage(b.dataset.quick,'market');});
      const plus=document.createElement('button');plus.className='chart-price-plus';plus.textContent='+';plus.title='Trade at this chart price';plus.setAttribute('aria-label','Trade at hovered chart price');plus.hidden=true;overlay.append(plus);
      wraps.set(cell.id,{overlay,nodes:new Map(),fills:new Map(),native,quick,plus});
      native.plot.addEventListener('contextmenu',e=>{if(e.target.closest('.trade-line,.chart-price-plus'))return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect();if(!pane||e.clientY-rect.top>pane.bounds.top+pane.bounds.height)return;const price=native.coords.yToPrice(e.clientY-rect.top,pane.scale,pane.bounds);if(!(price>0))return;e.preventDefault();e.stopImmediatePropagation();workspace().setActiveCell(cell.id);menu(price,e.clientX,e.clientY);},true);
      native.plot.addEventListener('pointermove',e=>{if(drag)return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect(),y=e.clientY-rect.top;if(!pane||y<pane.bounds.top||y>pane.bounds.top+pane.bounds.height){plus.hidden=true;return;}const x=e.clientX-rect.left;plus.hidden=x<rect.width-85||workspace().replay.state.active;if(!plus.hidden){plus.style.top=Math.max(0,y-11)+'px';plus.dataset.price=cellSnap(cell,native.coords.yToPrice(y,pane.scale,pane.bounds));}});
      native.plot.addEventListener('pointerleave',()=>{plus.hidden=true;});plus.onclick=e=>{workspace().setActiveCell(cell.id);menu(Number(plus.dataset.price),e.clientX,e.clientY);};
    }).catch(e=>toast('Chart trader initialization: '+e.message,true));
  }
  function cellSnap(cell,value){const tick=Number(state()?.quotes[marketIdentity(cell.chart)]?.tick||.01);return Number((Math.round(value/tick)*tick).toPrecision(12));}
  function createLine(level,wrap,cell,pane){
    const {overlay,native}=wrap,node=document.createElement('div');node.className='trade-line';node.dataset.key=level.key;
    const group=document.createElement('div');group.className='trade-line-controls';const label=document.createElement('button');label.className='trade-line-label';group.append(label);node.append(group);overlay.append(node);
    label.onpointerdown=e=>{const l=node.level;if(e.button!==0||l.kind==='position'&&l.field==='entry')return;e.preventDefault();e.stopPropagation();workspace().setActiveCell(cell.id);drag={node,level:l,startY:e.clientY,startPrice:l.price,price:l.price,native,pane:native.scene.panes.get('price')};e.target.setPointerCapture(e.pointerId);};
    label.onpointermove=e=>{if(drag?.node!==node)return;const pane=drag.pane;drag.price=cellSnap(cell,native.coords.yToPrice(native.coords.priceToY(drag.startPrice,pane.scale,pane.bounds)+e.clientY-drag.startY,pane.scale,pane.bounds));node.style.top=native.coords.priceToY(drag.price,pane.scale,pane.bounds)+'px';label.textContent='Release to review '+drag.price;};
    label.onpointerup=e=>{if(drag?.node!==node)return;const d=drag;drag=null;if(Math.abs(e.clientY-d.startY)<3){if(d.level.kind==='order')editOrder(d.level.item);else if(d.level.kind==='position')editBracket(d.level.item);return;}if(d.level.kind==='draft')d.level.amend?.(d.price);else if(d.level.kind==='order')editOrder(d.level.item,{[d.level.field]:String(d.price)});else editBracket(d.level.item,{[d.level.field]:String(d.price)});};
    label.onpointercancel=()=>{drag=null;};label.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(node.level.kind==='order')editOrder(node.level.item);else if(node.level.kind==='position')editBracket(node.level.item);}};
    label.onclick=()=>{if(node.level.kind==='position'&&node.level.field==='entry')editBracket(node.level.item);};
    if(level.kind==='order'){const cancel=document.createElement('button');cancel.textContent='×';cancel.dataset.action='cancel';cancel.setAttribute('aria-label','Cancel chart order');cancel.onclick=()=>cancelOrder(node.level.item);group.append(cancel);}
    if(level.kind==='position'&&level.field==='entry'){
      for(const [action,text] of [['protect','SL/TP'],['reverse','⇄'],['close','×']]){const b=document.createElement('button');b.textContent=text;b.dataset.action=action;b.setAttribute('aria-label',action==='close'?'Close chart position':action==='reverse'?'Reverse chart position':'Protect chart position');b.onclick=()=>action==='close'?closePosition(node.level.item):action==='reverse'?reversePosition(node.level.item):editBracket(node.level.item);group.append(b);}
    }
    return node;
  }
  function frame(){
    const ws=workspace(),s=state(),c=config();
    if(ws&&s)for(const cell of ws.cells()){
      const wrap=wraps.get(cell.id);if(!wrap)continue;
      const {overlay,nodes,native,quick}=wrap,pane=native.scene?.panes.get('price');if(!pane)continue;
      const market=marketIdentity(cell.chart),replay=ws.replay.state.active;
      quick.hidden=!c.quickButtons||replay;const quote=s.quotes[market];quick.querySelectorAll('button').forEach(b=>{b.disabled=!quote||Date.now()/1000-quote.received_at>15;b.textContent=(b.dataset.quick==='buy'?'Buy ':'Sell ')+(quote?quote[b.dataset.quick==='buy'?'ask':'bid']:'—')+' · PAPER';});
      const levels=replay?[]:tradingLevels(s,market,c);if(!replay&&cell.id===ws.active.id)levels.push(...draftLevels());
      const live=new Set(levels.map(l=>l.key));for(const [key,node] of nodes)if(!live.has(key)&&drag?.node!==node){node.remove();nodes.delete(key);}
      const occupied=[];
      for(const level of levels){let node=nodes.get(level.key);if(!node){node=createLine(level,wrap,cell,pane);nodes.set(level.key,node);}node.level=level;node.dataset.price=level.price;node.dataset.kind=level.kind;node.dataset.field=level.field;node.dataset.itemId=level.item?.id||'';if(drag?.node===node)continue;
        const y=native.coords.priceToY(level.price,pane.scale,pane.bounds);node.style.display=Number.isFinite(y)&&y>pane.bounds.top&&y<pane.bounds.top+pane.bounds.height?'':'none';node.style.top=y+'px';node.style.right=Math.max(0,overlay.clientWidth-native.coords.width)+'px';node.style.left='0px';node.style.setProperty('--level',level.color);node.classList.toggle('draft',level.kind==='draft');
        let offset=0;while(occupied.some(v=>Math.abs(v-(y+offset))<22))offset+=22;occupied.push(y+offset);node.querySelector('.trade-line-controls').style.transform='translateY('+offset+'px)';
        const label=node.querySelector('.trade-line-label');label.textContent=level.label+' · '+level.price;label.setAttribute('aria-label',level.label+' at '+level.price+'. Drag or press Enter to edit.');
        const reverse=node.querySelector('[data-action=reverse]');if(reverse){reverse.hidden=!c.reverse;reverse.disabled=market.startsWith('coinbase:');reverse.title=market.startsWith('coinbase:')?'Spot reversal would create an unsupported short':'Reverse paper position';}
      }
      const executions=!replay&&c.executions?s.fills.filter(f=>f.instrument===market).slice(0,100):[],ids=new Set(executions.map(f=>f.id));for(const [id,n] of wrap.fills)if(!ids.has(id)){n.remove();wrap.fills.delete(id);}
      for(const fill of executions){let n=wrap.fills.get(fill.id);if(!n){n=document.createElement('div');n.className='chart-execution';n.dataset.fillId=fill.id;n.title=fill.side+' '+fill.qty+' at '+fill.price+' · '+fill.reason+' · '+fill.executed_at;overlay.append(n);wrap.fills.set(fill.id,n);}const x=native.coords.timeToX(Date.parse(fill.executed_at)),y=native.coords.priceToY(Number(fill.price),pane.scale,pane.bounds);n.style.display=Number.isFinite(x)&&x>=0&&x<=native.coords.width&&y>=pane.bounds.top&&y<=pane.bounds.top+pane.bounds.height?'':'none';n.style.left=x+'px';n.style.top=y+'px';n.classList.toggle('buy',fill.side==='buy');n.classList.toggle('sell',fill.side==='sell');n.textContent=(fill.side==='buy'?'▲':'▼')+(c.labels?' '+fill.qty:'');}
    }
    requestAnimationFrame(frame);
  }
  function cleanup(){for(const [id,wrap] of wraps)if(!workspace().cells().some(c=>c.id===id)){wrap.overlay.remove();wraps.delete(id);}}
  return {attach,cleanup,start:()=>requestAnimationFrame(frame)};
}

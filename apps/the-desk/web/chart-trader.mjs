import {createAgenticABCPanel} from './agentic-abc-panel.mjs';
import {marketIdentity,tradingLevels,tradeLevelPlacement,paperExecutionMarkers,formatTradePrice,formatMoney,positionMetrics,formatPnl} from './trading-model.mjs';
import {moveDraftBracket,bracketLabel,chartMove,chartEntry,chartBracketMetrics,starterBracket} from './chart-bracket-model.mjs';
import {createAgenticElliotPanel} from './agentic-elliot-panel.mjs';

export function setupChartTrader({workspace,state,config,draftLevels,stage,menu,placeDraft,amendDraftParameter,editOrder,editBracket,closePosition,reversePosition,cancelOrder,pending=()=>false,toast}){
  const wraps=new Map(),abcModels=new Map();let drag=null,editing=null,lastFrame=0;
  const agenticPosition=value=>typeof value==='string'?value.trim().toLowerCase().replace(/\s+/g,'_'):null;
  function agenticModel(event){const {id,model}=event.detail||{};if(!id)return;const cells=workspace()?.cells()||[],exact=[];for(const cell of cells)for(const study of cell.chart.indicators?.()||[])if(study.id===id||study.instanceId===id)exact.push({cell,study});let matches=exact;if(!matches.length){for(const cell of cells)for(const study of cell.chart.indicators?.()||[])if(study.title==='Agentic - Elliot Waves'||study.name==='Agentic - Elliot Waves'||study.source?.includes('indicator("Agentic - Elliot Waves", "Agentic - Elliot Waves"'))matches.push({cell,study});if(matches.length!==1)return;}for(const {cell,study} of matches){const wrap=wraps.get(cell.id);if(!wrap)continue;const key=study.id||study.instanceId||id;let panel=wrap.elliotPanels.get(key);if(!panel){panel=createAgenticElliotPanel(wrap.overlay,key);wrap.elliotPanels.set(key,panel);}panel.update(model);}}
  window.addEventListener('desk:agentic-elliot-model',agenticModel);
  window.addEventListener('desk:agentic-abc-model',({detail})=>{if(detail?.id)abcModels.set(detail.id,detail.model);});
  function validDrag(d){const ws=workspace(),s=state();return !!ws&&!!s&&!ws.replay.state.active&&s.active_account===d.account&&ws.active.id===d.cellId&&marketIdentity(ws.active.chart)===d.market;}
  function scope(cell){return {account:state().active_account,market:marketIdentity(cell.chart),cellId:cell.id};}
  function currentItem(edit){return state()?.[edit.kind==='order'?'orders':'positions']?.find(i=>i.id===edit.original.id&&i.account_id===edit.account&&(edit.kind!=='order'||['working','triggered'].includes(i.status)));}
  function validEdit(edit){return validDrag(edit)&&currentItem(edit)?.revision===edit.original.revision;}
  function change(level,changes,cell){
    if(level.kind==='draft'){for(const [field,value] of Object.entries(changes)){if(field==='qty'||field==='kind')amendDraftParameter?.(field,value);else level.amendField(field,value);}return;}
    if(editing?.saving||pending(level.item.account_id,level.item.id))return;
    if(editing&&editing.original.id!==level.item.id){toast('Confirm or discard the current chart changes first.',true);return;}
    if(!editing)editing={...scope(cell),kind:level.kind,original:level.item,changes:{},error:''};
    Object.assign(editing.changes,changes);editing.error='';
    if(config().instant)void confirmEdit();
  }
  async function confirmEdit(){
    const edit=editing;if(!edit||edit.saving)return;
    if(!validEdit(edit)){editing=null;toast('Order or chart changed. Review the latest values.',true);return;}
    edit.saving=true;edit.error='';
    try{await (edit.kind==='order'?editOrder:editBracket)(edit.original,edit.changes,true);if(editing===edit)editing=null;toast('Paper chart changes accepted.');}
    catch(error){edit.saving=false;edit.error=error.message;toast(error.message,true);}
  }
  function priceChanges(level,value,cell){const q=state().quotes[marketIdentity(cell.chart)]||{};return chartMove(level.item,level.field,value,Number(q.tick||.01),level.kind,q);}
  function startDrag(e,node,cell,field=node.level.field,pull=false){
    const l=node.level;if(e.button!==0||node.offscale||pending(l.item.account_id,l.item.id)||editing?.saving||l.kind==='position'&&field==='entry')return;
    e.preventDefault();e.stopPropagation();workspace().setActiveCell(cell.id);
    const native=wraps.get(cell.id).native,level={...l,field};
    const price=pull?chartEntry(l.item):l.price;
    drag={node,level,startY:e.clientY,startPrice:price,price,native,pane:native.scene.panes.get('price'),pull,...scope(cell)};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e,node,cell){if(drag?.node!==node)return;e.stopPropagation();const pane=drag.native.scene.panes.get('price');if(!pane){drag=null;return;}const raw=drag.native.coords.yToPrice(drag.native.coords.priceToY(drag.startPrice,pane.scale,pane.bounds)+e.clientY-drag.startY,pane.scale,pane.bounds);const changes=priceChanges(drag.level,raw,cell);drag.price=Number(changes[drag.level.field]??raw);}
  function endDrag(e,node,cell,edit){
    if(drag?.node!==node)return;e.stopPropagation();const d=drag;drag=null;if(!validDrag(d))return;
    if(Math.abs(e.clientY-d.startY)<3){if(!d.pull){edit?.(d.level);return;}const q=state().quotes[d.market]||{},defaults=starterBracket({entry:d.level.kind==='position'?Number(q[d.level.item.side==='buy'?'bid':'ask']):chartEntry(d.level.item),side:d.level.item.side,tick:q.tick});d.price=Number(defaults[d.level.field]);}
    if(Number.isFinite(d.price))change(d.level,priceChanges(d.level,d.price,cell),cell);
  }
  function bindDrag(button,node,cell,field,pull,edit){button.onpointerdown=e=>startDrag(e,node,cell,field,pull);button.onpointermove=e=>moveDrag(e,node,cell);button.onpointerup=e=>endDrag(e,node,cell,edit);button.onpointercancel=()=>{drag=null;};button.onlostpointercapture=()=>{if(drag?.node===node)drag=null;};}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){drag=null;if(!editing?.saving)editing=null;for(const wrap of wraps.values())wrap.overlay.querySelectorAll('.chart-quantity-editor').forEach(n=>n.remove());}});
  function quantityEditor(node,cell){
    const level=node.level;if(level.kind==='position')return;
    node.querySelector('.chart-quantity-editor')?.remove();
    const form=document.createElement('form');form.className='chart-quantity-editor';
    const input=document.createElement('input');input.type='number';input.min='0';input.step='any';input.value=level.item.qty;input.setAttribute('aria-label','Chart order quantity');
    const apply=document.createElement('button');apply.type='submit';apply.textContent='Apply';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='×';cancel.setAttribute('aria-label','Dismiss quantity editor');cancel.onclick=()=>form.remove();
    form.append(input,apply,cancel);node.refs.group.append(form);input.focus();input.select();
    form.onpointerdown=e=>e.stopPropagation();form.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')form.remove();};
    const initialScope=scope(cell),revision=level.item.revision;
    form.onsubmit=e=>{e.preventDefault();if(!validDrag(initialScope)||node.level.item.revision!==revision){form.remove();return;}if(!(Number(input.value)>0)){input.setCustomValidity('Enter a positive quantity.');input.reportValidity();return;}change(node.level,{qty:input.value},cell);form.remove();};input.oninput=()=>input.setCustomValidity('');
  }
  function attach(cell){
    if(cell.deskAttached)return;cell.deskAttached=true;
    cell.chart.ready().then(()=>{
      const native=cell.chart.renderer.renderer;if(!native?.plot)return;
      const overlay=document.createElement('div');overlay.className='trade-overlay';native.plot.append(overlay);
      const quick=document.createElement('div');quick.className='chart-quick-trade';quick.innerHTML='<button class="sell" data-quick="sell">Sell · PAPER</button><button class="buy" data-quick="buy">Buy · PAPER</button>';overlay.append(quick);quick.querySelectorAll('button').forEach(b=>b.onclick=()=>{workspace().setActiveCell(cell.id);stage(b.dataset.quick,'market');});
      const plus=document.createElement('button');plus.className='chart-price-plus';plus.textContent='+';plus.title='Trade at this chart price';plus.setAttribute('aria-label','Trade at hovered chart price');plus.hidden=true;overlay.append(plus);
      const wrap={overlay,nodes:new Map(),fills:new Map(),elliotPanels:new Map(),abcPanels:new Map(),native,quick,plus,cursorTime:null,cursorPrice:null};wraps.set(cell.id,wrap);
      wrap.offIndicatorInputs=cell.chart.on?.('indicator:inputs',({id})=>{const panel=wrap.elliotPanels.get(id);if(!panel)return;const study=cell.chart.indicators?.().find(h=>h.id===id||h.instanceId===id);panel.syncPosition(agenticPosition(study?.inputValues?.().agenticPosition));});
      cell.chart.renderer.onCrosshairMove(({time,price,paneKind})=>{if(paneKind==='price'){wrap.cursorTime=time;wrap.cursorPrice=price;}});
      native.plot.addEventListener('contextmenu',e=>{if(e.target.closest('.trade-line,.chart-price-plus,.agentic-elliot-float'))return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect();if(!pane||e.clientY-rect.top>pane.bounds.top+pane.bounds.height)return;const price=native.coords.yToPrice(e.clientY-rect.top,pane.scale,pane.bounds);if(!(price>0))return;e.preventDefault();e.stopImmediatePropagation();workspace().setActiveCell(cell.id);menu(price,e.clientX,e.clientY,cell,wrap.cursorTime);},true);
      native.plot.addEventListener('pointermove',e=>{if(drag)return;const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect(),y=e.clientY-rect.top;if(!pane||y<pane.bounds.top||y>pane.bounds.top+pane.bounds.height){plus.hidden=true;return;}const x=e.clientX-rect.left;plus.hidden=x<rect.width-85||workspace().replay.state.active||marketIdentity(cell.chart).startsWith('ibkr:');if(!plus.hidden){plus.style.top=Math.max(0,y-11)+'px';plus.dataset.price=cellSnap(cell,native.coords.yToPrice(y,pane.scale,pane.bounds));}});
      native.plot.addEventListener('pointerleave',()=>{plus.hidden=true;});plus.onclick=e=>{workspace().setActiveCell(cell.id);menu(Number(plus.dataset.price),e.clientX,e.clientY,cell,wrap.cursorTime);};
    }).catch(e=>toast('Chart trader initialization: '+e.message,true));
  }
  function cellSnap(cell,value){const tick=Number(state()?.quotes[marketIdentity(cell.chart)]?.tick||.01);return Number((Math.round(value/tick)*tick).toPrecision(12));}
  function createLine(level,wrap,cell,pane){
    const {overlay,native}=wrap,node=document.createElement('div');node.className='trade-line';node.dataset.key=level.key;
    const group=document.createElement('div');group.className='trade-line-controls';const label=document.createElement('button');label.className='trade-line-label';group.append(label);node.append(group);const badge=document.createElement('span');badge.className='trade-price-badge';node.append(badge);overlay.append(node);
    function edit(l){if(l.kind==='order')editOrder(l.item);else if(l.kind==='position')editBracket(l.item);else document.querySelector('#'+({entry:l.item.kind==='stop'?'triggerPrice':'entryPrice',trigger:'triggerPrice',stop:'stopPrice',target:'targetPrice'}[l.field]))?.focus();}
    bindDrag(label,node,cell,level.field,false,edit);
    label.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();edit(node.level);}};
    node.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();edit(node.level);};
    label.onclick=()=>{if(node.offscale)edit(node.level);else if(node.level.kind==='position'&&node.level.field==='entry')editBracket(node.level.item);};
    if(level.kind==='draft'||level.kind==='order'||['stop','target'].includes(level.field)){const cancel=document.createElement('button');cancel.textContent='×';cancel.dataset.action='cancel';cancel.setAttribute('aria-label',level.kind==='draft'?'Remove draft '+level.field:['stop','target'].includes(level.field)?'Remove '+level.field:'Cancel chart order');cancel.onclick=()=>{const l=node.level;if(l.kind==='draft')l.remove?.();else if(['stop','target'].includes(l.field))change(l,{[l.field]:''},cell);else cancelOrder(l.item);};group.append(cancel);}
    if(level.kind==='draft'&&level.field==='entry'){
      const b=document.createElement('button');b.textContent='Place';b.dataset.action='place';b.setAttribute('aria-label','Review and place draft paper order');b.onclick=()=>placeDraft?.();group.append(b);
    }
    if(level.kind==='position'&&level.field==='entry'){
      for(const [action,text] of [['reverse','⇄'],['close','×']]){const b=document.createElement('button');b.textContent=text;b.dataset.action=action;b.setAttribute('aria-label',action==='close'?'Close chart position':action==='reverse'?'Reverse chart position':'Protect chart position');b.onclick=()=>action==='close'?closePosition(node.level.item):action==='reverse'?reversePosition(node.level.item):editBracket(node.level.item);group.append(b);}
    }
    const parent=level.kind==='draft'?level.field==='entry':level.kind==='position'?level.field==='entry':level.field===(level.item.kind==='stop'?'trigger':'price');
    if(parent){
      const qty=document.createElement('button');qty.className='trade-quantity';qty.dataset.action='quantity';qty.title='Change order quantity';qty.onclick=()=>quantityEditor(node,cell);group.prepend(qty);
      const handles=document.createElement('div');handles.className='trade-bracket-handles';group.prepend(handles);
      for(const [field,text] of [['target','TP'],['stop','SL']]){const handle=document.createElement('button');handle.textContent=text;handle.dataset.action='add-'+field;handle.className='trade-pull '+field;handle.setAttribute('aria-label','Drag to add '+(field==='stop'?'Stop Loss':'Take Profit'));handle.title='Drag '+text+' from entry, or click to add';handles.append(handle);bindDrag(handle,node,cell,field,true);handle.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const l=node.level,q=state().quotes[marketIdentity(cell.chart)]||{},entry=l.kind==='position'?Number(q[l.item.side==='buy'?'bid':'ask']):chartEntry(l.item);const value=starterBracket({entry,side:l.item.side,tick:q.tick})[field];if(value)change({...l,field},{[field]:value},cell);}};}
      if(level.kind==='draft'){
        const kind=document.createElement('select');kind.className='trade-order-kind';kind.setAttribute('aria-label','Projected order type');for(const [value,text] of [['market','Market'],['limit','Limit'],['stop','Stop'],['stop_limit','Stop limit']]){const o=document.createElement('option');o.value=value;o.textContent=text;kind.append(o);}kind.onchange=()=>amendDraftParameter?.('kind',kind.value);group.insertBefore(kind,label);
      }else{
        const confirm=document.createElement('button');confirm.dataset.action='confirm';confirm.className='chart-confirm';confirm.textContent='Confirm';confirm.onclick=confirmEdit;
        const discard=document.createElement('button');discard.dataset.action='discard';discard.textContent='Discard';discard.onclick=()=>{if(!editing?.saving)editing=null;};group.append(confirm,discard);
      }
    }
    const connector=document.createElement('span');connector.className='trade-bracket-connector';node.append(connector);
    const detail=document.createElement('span');detail.className='trade-line-detail';group.after(detail);
    const stem=document.createElement('span');stem.className='trade-label-stem';node.append(stem);
    node.refs={label,badge,group,detail,connector,stem,buttons:[...group.querySelectorAll('button')],reverse:group.querySelector('[data-action=reverse]')};return node;
  }
  function frame(now=0){
    requestAnimationFrame(frame);
    if(document.hidden||now-lastFrame<(drag?15:32))return;lastFrame=now;
    const ws=workspace(),s=state(),c=config();
    if(editing&&!editing.saving&&!validEdit(editing)){editing=null;toast('Chart edit discarded because the order or chart changed.',true);}
    if(drag&&!validDrag(drag))drag=null;
    if(ws&&s)for(const cell of ws.cells()){
      const wrap=wraps.get(cell.id);if(!wrap)continue;
      const {overlay,nodes,native,quick}=wrap,pane=native.scene?.panes.get('price');if(!pane)continue;
      const axisWidth=Math.max(0,overlay.clientWidth-native.coords.width);
      const studyIds=new Set((cell.chart.indicators?.()||[]).flatMap(h=>[h.id,h.instanceId].filter(Boolean)));for(const [id,panel] of wrap.elliotPanels)if(!studyIds.has(id)){panel.destroy();wrap.elliotPanels.delete(id);}
      for(const [id,panel] of wrap.abcPanels)if(!studyIds.has(id)){panel.destroy();wrap.abcPanels.delete(id);}
      for(const study of cell.chart.indicators?.()||[]){const key=study.id||study.instanceId,model=abcModels.get(key)||abcModels.get(study.instanceId);let panel=wrap.abcPanels.get(key);if(!model){if(panel)panel.root.hidden=true;continue;}if(!panel){panel=createAgenticABCPanel(overlay,key);wrap.abcPanels.set(key,panel);}if(panel.model!==model){panel.update(model);panel.model=model;}panel.root.hidden=!study.visible||study.inputValues?.().abcSummary===false||!model.tables?.length;}
      const market=marketIdentity(cell.chart),replay=ws.replay.state.active;
      quick.hidden=!c.quickButtons||replay||market.startsWith('ibkr:');const quote=s.quotes[market];quick.querySelectorAll('button').forEach(b=>{b.disabled=!quote||Date.now()/1000-quote.received_at>15;setText(b,(b.dataset.quick==='buy'?'Buy ':'Sell ')+(quote?quote[b.dataset.quick==='buy'?'ask':'bid']:'—')+' · '+(s.tradingMode||'PAPER'));});
      // Previews share the same item across every layout of this symbol.
      const apply=(item,kind)=>{
        let result=editing?.original.id===item.id?{...item,...editing.changes}:item;
        if(drag?.level.item.id===item.id&&drag.level.kind===kind)result={...result,...priceChanges({...drag.level,item:result},drag.price,cell)};
        return result;
      };
      const view={...s,orders:s.orders.map(i=>apply(i,'order')),positions:s.positions.map(i=>apply(i,'position'))};
      const levels=replay?[]:tradingLevels(view,market,c);
      if(!replay&&cell.id===ws.active.id){const drafts=draftLevels();for(let l of drafts){const original=l.item;const preview=drag?.level.kind==='draft'?moveDraftBracket(original,drag.level.field,drag.price,Number(quote?.tick||.01)):{};const item={...original,...preview};l={...l,item,price:Number(item[l.field]),amendField:(field,value)=>{const target=drafts.find(d=>d.field===field);if(target)target.amend(value);else amendDraftParameter?.(field,value);}};levels.push(l);}
        // A new protection leg exists only in the visual preview until release.
        if(drag?.level.kind==='draft'&&!drafts.some(l=>l.field===drag.level.field)){const l=drafts.find(l=>l.field==='entry');if(l){const item={...l.item,...moveDraftBracket(l.item,drag.level.field,drag.price,Number(quote?.tick||.01))};levels.push({...l,key:'draft'+drag.level.field,field:drag.level.field,price:Number(item[drag.level.field]),item});}}
      }
      const live=new Set(levels.map(l=>l.key));if(drag?.cellId===cell.id&&!live.has(drag.node.dataset.key))drag=null;
      for(const [key,node] of nodes)if(!live.has(key)){node.remove();nodes.delete(key);}
      const occupied=[];
      for(let level of levels){const dragging=drag?.level.key===level.key||drag?.pull&&drag.level.kind===level.kind&&drag.level.item.id===level.item.id&&drag.level.field===level.field;
        let node=nodes.get(level.key);if(!node){node=createLine(level,wrap,cell,pane);nodes.set(level.key,node);}node.level=level;node.dataset.price=level.price;node.dataset.kind=level.kind;node.dataset.field=level.field;node.dataset.itemId=level.item?.id||'';
        const protection=['stop','target'].includes(level.field),item=level.item;
        level={...level,color:level.field==='stop'?'#ffb300':level.field==='target'?'#089981':level.kind==='draft'?'#00bcd4':item.side==='buy'?'#2962ff':'#f23645'};
        const placement=tradeLevelPlacement(native.coords.priceToY(level.price,pane.scale,pane.bounds),pane.bounds),y=placement?.y;
        node.offscale=placement?.edge||null;node.classList.toggle('offscale',!!node.offscale);node.dataset.edge=node.offscale||'';
        node.style.display=placement?'':'none';setStyle(node,'top',y+'px');setStyle(node,'right',axisWidth+'px');node.style.left='0px';node.style.setProperty('--level',level.color);node.classList.toggle('draft',level.kind==='draft');
        node.classList.toggle('protection',['stop','target'].includes(level.field));node.classList.toggle('dragging',dragging);
        setStyle(node.refs.badge,'width',axisWidth+'px');setText(node.refs.badge,Number(level.price).toLocaleString('en-US',{maximumFractionDigits:8}));
        let labelY=Math.max(pane.bounds.top+13,Math.min(y,pane.bounds.top+pane.bounds.height-13));
        for(let i=0;i<levels.length*2;i++){const candidate=labelY+(i%2?1:-1)*Math.ceil(i/2)*42;if(candidate>=pane.bounds.top+13&&candidate<=pane.bounds.top+pane.bounds.height-13&&!occupied.some(v=>Math.abs(v-candidate)<40)){labelY=candidate;break;}}
        const parentEntry=chartEntry(item),entryY=native.coords.priceToY(parentEntry,pane.scale,pane.bounds);node.refs.connector.hidden=!protection||!!node.offscale||!Number.isFinite(entryY)||entryY<pane.bounds.top||entryY>pane.bounds.top+pane.bounds.height;setStyle(node.refs.connector,'top',Math.min(0,entryY-y)+'px');setStyle(node.refs.connector,'height',Math.abs(entryY-y)+'px');
        node.refs.stem.hidden=!!node.offscale||Math.abs(labelY-y)<2;setStyle(node.refs.stem,'top',Math.min(0,labelY-y)+'px');setStyle(node.refs.stem,'height',Math.abs(labelY-y)+'px');setStyle(node.refs.detail,'transform','translateY('+(labelY-y)+'px)');
        occupied.push(labelY);setStyle(node.refs.group,'transform','translateY('+(labelY-y)+'px)');
        const label=node.refs.label;
        let text;
        if(protection){const m=chartBracketMetrics(item,level.field,quote);text=(level.field==='stop'?'SL  ':'TP  ')+(m.amount<0?'−':'+')+formatMoney(Math.abs(m.amount),Math.abs(Number(item.qty)*Number(quote?.tick||.01)));setText(node.refs.detail,Math.abs(m.ticks).toLocaleString('en-US',{maximumFractionDigits:2})+' ticks'+(m.ratio!=null?' · '+m.ratio.toFixed(2)+'R':'')+' · gross');}
        else{text=level.kind==='position'?(item.side==='buy'?'LONG':'SHORT')+(c.pnl?'  '+formatPnl(positionMetrics(item,quote,c.pnlUnit)):''):(item.side==='buy'?'Buy ':'Sell ')+(item.kind||'limit').replace('_',' ')+(level.field==='trigger'&&item.kind==='stop_limit'?' · trigger':'');setText(node.refs.detail,level.kind==='draft'?(document.querySelector('#orderError')?.textContent||'Projection · not placed'):editing&&editing.original.id===item.id?(editing.error||'Unsaved changes · PAPER'):'');}
        if(node.offscale)text=(node.offscale==='top'?'↑ ':'↓ ')+text+' · '+formatTradePrice(level.price)+' · off scale';
        setText(label,text);label.title=(level.kind==='draft'?'Projection':'Paper')+' · '+item.side+' '+item.qty+' · '+(protection?'Gross P&L before fees':'Drag price; click to edit');label.setAttribute('aria-label',(protection?bracketLabel(item,level.field,quote):text)+' at '+level.price+(node.offscale?'. Outside visible price scale. Click or press Enter to edit.':'. Drag or press Enter to edit.'));
        const isEditing=!!editing&&editing.original.id===item.id;
        for(const button of node.refs.buttons)button.disabled=pending(item.account_id,item.id)||!!(isEditing&&editing.saving);
        const qty=node.querySelector('.trade-quantity');if(qty){setText(qty,String(item.qty));qty.disabled=level.kind==='position'||pending(item.account_id,item.id)||!!(isEditing&&editing.saving);qty.setAttribute('aria-label',level.kind==='position'?'Position quantity '+item.qty:'Change order quantity '+item.qty);}
        for(const field of ['stop','target']){const h=node.querySelector('[data-action=add-'+field+']');if(h)h.hidden=!c.brackets||Number(item[field])>0&&!(drag?.node===node&&drag.pull&&drag.level.field===field);}
        const kind=node.querySelector('.trade-order-kind');if(kind&&kind!==document.activeElement)kind.value=item.kind;
        for(const action of ['confirm','discard']){const b=node.querySelector('[data-action='+action+']');if(b){b.hidden=!isEditing;if(action==='confirm')setText(b,editing?.saving?'Saving…':'Confirm');}}
        node.classList.toggle('editing',!!isEditing);node.classList.toggle('invalid',!!(isEditing&&editing.error));
        const reverse=node.refs.reverse;if(reverse){reverse.hidden=!c.reverse;reverse.disabled=pending(level.item.account_id,level.item.id)||market.startsWith('coinbase:');reverse.title=market.startsWith('coinbase:')?'Spot reversal would create an unsupported short':'Reverse paper position';}
      }
      const executions=paperExecutionMarkers(s,market,c,replay),ids=new Set(executions.map(f=>f.id));for(const [id,n] of wrap.fills)if(!ids.has(id)){n.remove();wrap.fills.delete(id);}
      for(const fill of executions){let n=wrap.fills.get(fill.id);if(!n){n=document.createElement('div');n.className='chart-execution';n.dataset.fillId=fill.id;n.title='PAPER · '+fill.side.toUpperCase()+' '+fill.qty+' '+fill.instrument+' at '+fill.price+' · '+fill.reason+' · '+fill.executed_at;n.setAttribute('aria-label',n.title);overlay.append(n);wrap.fills.set(fill.id,n);}const x=native.coords.timeToX(Date.parse(fill.executed_at)),y=native.coords.priceToY(Number(fill.price),pane.scale,pane.bounds);n.style.display=Number.isFinite(x)&&x>=0&&x<=native.coords.width&&y>=pane.bounds.top&&y<=pane.bounds.top+pane.bounds.height?'':'none';n.style.left=x+'px';n.style.top=y+'px';n.classList.toggle('buy',fill.side==='buy');n.classList.toggle('sell',fill.side==='sell');setText(n,fill.side==='buy'?'▲':'▼');}
    }
    const activeStudyIds=new Set((ws?.cells()||[]).flatMap(cell=>(cell.chart.indicators?.()||[]).flatMap(h=>[h.id,h.instanceId].filter(Boolean))));for(const id of abcModels.keys())if(!activeStudyIds.has(id))abcModels.delete(id);
  }
  function setText(node,value){if(node.textContent!==value)node.textContent=value;}
  function setStyle(node,name,value){if(node.style[name]!==value)node.style[name]=value;}
  function cleanup(){for(const [id,wrap] of wraps)if(!workspace().cells().some(c=>c.id===id)){wrap.offIndicatorInputs?.();for(const panel of wrap.elliotPanels.values())panel.destroy();for(const panel of wrap.abcPanels.values())panel.destroy();wrap.overlay.remove();wraps.delete(id);}}
  return {attach,cleanup,start:()=>requestAnimationFrame(frame)};
}

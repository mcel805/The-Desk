// Keep controls and keyboard focus alive while prices change.
export function reconcileHTML(host, html) {
 const template=document.createElement('template');template.innerHTML=html;
 function patch(parent,source){
  const wanted=[...source.childNodes];
  wanted.forEach((fresh,i)=>{
   let old=parent.childNodes[i];
   const key=fresh.nodeType===1&&(fresh.dataset.positionId||fresh.dataset.orderId);
   if(key){const match=[...parent.children].find(n=>(n.dataset.positionId||n.dataset.orderId)===key);if(match&&match!==old){parent.insertBefore(match,old||null);old=match;}}
   if(!old){parent.append(fresh.cloneNode(true));return;}
   if(old.nodeType!==fresh.nodeType||old.nodeName!==fresh.nodeName){old.replaceWith(fresh.cloneNode(true));return;}
   if(old.nodeType===3){if(old.data!==fresh.data)old.data=fresh.data;return;}
   if(old.nodeType!==1)return;
   for(const a of [...old.attributes])if(!fresh.hasAttribute(a.name))old.removeAttribute(a.name);
   for(const a of fresh.attributes)if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
   patch(old,fresh);
  });
  while(parent.childNodes.length>wanted.length)parent.lastChild.remove();
 }
 patch(host,template.content);
}
export function acceptsShortcut(event,{replay=false,broker=false}={}){
 return !replay&&!broker&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.shiftKey&&
 !event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')&&!document.querySelector('dialog[open]');
}
export function setupTradeWorkbench({workspace,state,instrument,accountId,config,stage,command,showDialog,toast,render,broker}){
 const $=s=>document.querySelector(s), ticket=$('#orderForm');
 const more=document.createElement('details');more.className='workspace-more';more.innerHTML='<summary>Workspace ▾</summary><div></div>';$('#tradeButton').before(more);for(const id of ['ibkrButton','robinhoodButton','walletButton','saveWorkspace','templatesButton','themeButton','dataHealthLink']){const el=$('#'+id);if(el)more.lastElementChild.append(el);}document.addEventListener('click',e=>{if(!more.contains(e.target))more.open=false;});
 const tools=document.createElement('div');tools.className='manager-tools';tools.innerHTML='<label>Show <select id="managerScope"><option value="all">All markets</option><option value="chart">Chart market</option></select></label><label>Orders <select id="managerOrderFilter"><option value="working">Working</option><option value="all">All history</option></select></label><input id="managerSearch" type="search" placeholder="Filter instrument…" aria-label="Filter trading rows"><span class="header-spacer"></span><button id="managerCancel">Cancel chart orders</button><button id="managerFlatten" class="negative">Flatten chart</button>';
 $('#managerTabs').after(tools);tools.oninput=()=>render();
 const presets=document.createElement('div');presets.className='ticket-presets';presets.innerHTML='<label>Ticket preset<select id="ticketPreset"><option value="">Current ticket</option></select></label><button type="button" id="saveTicketPreset">Save</button><button type="button" id="deleteTicketPreset" aria-label="Delete selected ticket preset">×</button>';
 ticket.prepend(presets);
 const fields=['orderKind','sizeMode','quantity','stopPrice','targetPrice','timeInForce'];
 let saved=[];try{saved=JSON.parse(localStorage.getItem('desk.ticket-presets.v1')||'[]');if(!Array.isArray(saved))saved=[];}catch{}saved=saved.filter(x=>x&&typeof x.name==='string'&&x.values&&typeof x.values==='object').slice(0,9);
 function draw(){const select=$('#ticketPreset');select.replaceChildren(new Option('Current ticket',''));saved.forEach((p,i)=>select.add(new Option(p.name,String(i))));}
 function persist(){localStorage.setItem('desk.ticket-presets.v1',JSON.stringify(saved));draw();}
 $('#saveTicketPreset').onclick=()=>showDialog('Save ticket preset','<label>Name<input name="name" maxlength="40" required></label><p>Stores size mode, size, order type, exits and duration in this browser. Review absolute exit prices when switching markets.</p>',async fd=>{const name=String(fd.get('name')).trim();if(!name)throw Error('Enter a name.');if(saved.length>=9&&!saved.some(p=>p.name===name))throw Error('Nine presets maximum. Delete one first.');saved=saved.filter(p=>p.name!==name);saved.push({name,values:Object.fromEntries(fields.map(id=>[id,$('#'+id).value]))});persist();});
 $('#ticketPreset').onchange=()=>{const p=saved[Number($('#ticketPreset').value)];if($('#ticketPreset').value===''||!p)return;for(const id of fields)if(typeof p.values[id]==='string')$('#'+id).value=p.values[id];$('#orderKind').dispatchEvent(new Event('change',{bubbles:true}));$('#quantity').dispatchEvent(new Event('input',{bubbles:true}));toast('Preset applied to ticket.');};
 $('#deleteTicketPreset').onclick=()=>{if($('#ticketPreset').value==='')return;saved.splice(Number($('#ticketPreset').value),1);persist();};draw();
 const size=document.createElement('div');size.className='quick-sizes';size.innerHTML='<span>Size</span><button type="button" data-scale="0.5">½</button><button type="button" data-scale="2">2×</button><span class="muted">Shift B / S · buy / sell</span>';
 $('#sizeLabel').parentElement.after(size);size.onclick=e=>{const scale=Number(e.target.dataset.scale);if(!scale)return;const input=$('#quantity');input.value=String(Number((Number(input.value)*scale).toPrecision(10)));input.dispatchEvent(new Event('input',{bubbles:true}));};
 async function batch(action){
  const s=state(),market=instrument();if(!s||broker()||workspace()?.replay.state.active)return;
  const orders=s.orders.filter(o=>o.instrument===market&&['working','triggered'].includes(o.status)),positions=s.positions.filter(p=>p.instrument===market),refs=a=>a.map(({id,revision})=>({id,revision}));
  if(!orders.length&&(action==='cancel_orders'||!positions.length)){toast('Nothing to '+(action==='flatten'?'flatten':'cancel')+' on this chart.');return;}
  const payload={account_id:accountId(),instrument:market,orders:refs(orders),...(action==='flatten'?{positions:refs(positions)}:{})};
  const run=async()=>{await command(action,payload);toast(action==='flatten'?'Chart instrument flattened.':'Chart orders cancelled.');};
  try{if(config().instant)await run();else showDialog(action==='flatten'?'Flatten chart instrument':'Cancel chart orders','<p>Applies to the selected chart market and paper account.</p>',run);}catch(e){toast(e.message,true);}
 }
 $('#managerCancel').onclick=()=>batch('cancel_orders');$('#managerFlatten').onclick=()=>batch('flatten');
 document.addEventListener('keydown',e=>{if(!acceptsShortcut(e,{replay:workspace()?.replay.state.active,broker:broker()}))return;if(['B','S'].includes(e.key.toUpperCase())){e.preventDefault();stage(e.key.toUpperCase()==='B'?'buy':'sell','market');}});
 const focus=document.createElement('button');focus.id='focusChart';focus.textContent='Focus chart';focus.setAttribute('aria-pressed','false');$('#tradeButton').before(focus);focus.onclick=()=>{const on=document.body.classList.toggle('chart-focus');focus.setAttribute('aria-pressed',String(on));focus.textContent=on?'Restore panels':'Focus chart';workspace()?.cells().forEach(c=>c.chart.resize());};
 const handle=document.createElement('div');handle.className='manager-resize';handle.role='separator';handle.tabIndex=0;handle.setAttribute('aria-label','Resize trading manager');handle.setAttribute('aria-orientation','horizontal');$('#manager').prepend(handle);
 function resize(height){const h=Math.max(160,Math.min(innerHeight*.65,height));document.body.style.setProperty('--manager-height',h+'px');workspace()?.cells().forEach(c=>c.chart.resize());return h;}
 let drag;handle.onpointerdown=e=>{drag={y:e.clientY,height:$('#manager').getBoundingClientRect().height};handle.setPointerCapture(e.pointerId);};handle.onpointermove=e=>{if(drag)resize(drag.height+drag.y-e.clientY);};handle.onpointerup=handle.onpointercancel=()=>{drag=null;};handle.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();resize($('#manager').getBoundingClientRect().height+(e.key==='ArrowUp'?30:-30));}};
 return {filter(items,type){const search=$('#managerSearch').value.trim().toLowerCase();return items.filter(x=>($('#managerScope').value!=='chart'||x.instrument===instrument())&&(!search||x.instrument.toLowerCase().includes(search))&&(type!=='orders'||$('#managerOrderFilter').value==='all'||['working','triggered'].includes(x.status)));},sync(){tools.hidden=broker();for(const id of ['managerCancel','managerFlatten'])$('#'+id).disabled=broker()||!!workspace()?.replay.state.active;}};
}

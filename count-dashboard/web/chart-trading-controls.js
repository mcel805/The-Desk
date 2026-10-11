/** Chart trading UX. The server owns orders; these controls never fabricate fills. */
export function mountChartTrading(bridge) {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = p => Number(p).toLocaleString(undefined, {maximumFractionDigits:8});
  const storageKey = 'count-desk-chart-trading-v1';
  const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
  let prefs = {...{quantity:.001, orders:true, positions:true, brackets:true}, ...read(storageKey,{})};
  let alerts = read(storageKey+'-alerts',[]), templates = read(storageKey+'-templates',[]);
  let slot, native, root, drag = null, cursor = null, context = null, lastAlertBar = new Map();
  const nodes = new Map(), busy = new Set();
  const menu = $('#chartContextMenu');
  const css = document.createElement('link'); css.rel='stylesheet'; css.href=new URL('./chart-trading-controls.css',import.meta.url); document.head.append(css);
  const dialog = document.createElement('dialog'); dialog.className='ct-dialog'; dialog.id='chartTradingDialog'; document.body.append(dialog);
  const save = () => localStorage.setItem(storageKey,JSON.stringify(prefs));
  const identity = s => [s.source.id,s.source.market,s.source.timeframe].join(':');
  const snapshot = () => bridge.snapshot();
  const pane = () => native?.scene?.panes.get('price');
  const priceAt = e => {const p=pane(), bounds=native?.plot.getBoundingClientRect(); return p&&bounds?native.coords.yToPrice(e.clientY-bounds.top,p.scale,p.bounds):null;};
  const round = p => Number(Number(p).toFixed(8));
  const notify = (m,error=false) => bridge.toast(m,error);
  function show(title, body, handler) {
    dialog.innerHTML=`<form><header><h2>${esc(title)}</h2><button type="button" data-close aria-label="Close chart dialog">×</button></header>${body}<p class="ct-notice" role="status"></p></form>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();try {await handler?.(new FormData(e.currentTarget));} catch (error) {dialog.querySelector('.ct-notice').textContent=error.message;}};
    dialog.showModal();
  }
  function validContext() {
    const s=snapshot();
    if(!s?.source||!s.accountId||!s.barTime) throw Error('Load a chart and choose a paper account first.');
    if(context&&identity(s)!==context.key) throw Error('Chart changed; right-click the price again.');
    return s;
  }
  async function request(path, body) {
    const result=await bridge.request(path,{method:'POST',body:JSON.stringify(body)});
    await bridge.refresh(); return result;
  }
  let placing=false;
  async function place(side, kind='limit', details={}) {
    if(placing)return;placing=true;
    try {
    const s=validContext(), entry=Number(details.entry_price??context.price);
    const quantity=Number(details.quantity??prefs.quantity);
    const payload={account_id:s.accountId,provider:s.source.id,symbol:s.source.market,timeframe:s.source.timeframe,side,quantity,entry_price:entry,bar_time:s.barTime,order_type:kind,trigger_price:details.trigger_price??(kind==='stop_limit'?entry:null),stop_price:details.stop_price||null,target_price:details.target_price||null,chart_bracket_draft:true};
    const result=kind==='market'?await request('quant-lab/open',payload):await request('quant-lab/limit',payload);
    menu.hidden=true;
    notify(kind==='market'?`Paper ${side==='long'?'buy':'sell'} market simulation opened at the completed close.`:result.bracket_ready?'Paper limit is working. Drag its entry, SL or PT to amend it.':'Pending paper limit is on the chart. Drag SL and PT to protect it; it becomes working when both are valid.');
    return result;
    }finally {placing=false;}
  }
  function orderDialog(order=null, side='long', kind='limit') {
    const s=order?snapshot():validContext(), p=order?.limit_price??context.price;
    show(order?'Modify pending paper order':'Add paper order',`<p>${esc(s.source.market)} · ${esc(s.source.timeframe)} · ${esc(s.accountName)} · PAPER</p>
      <label>Side<select name="side" ${order?'disabled':''}><option value="long" ${(order?.side||side)==='long'?'selected':''}>Buy / Long</option><option value="short" ${(order?.side||side)==='short'?'selected':''}>Sell / Short</option></select></label>
      <label>Order type<select name="kind" ${order?'disabled':''}><option value="limit" ${(order?.order_type||kind)==='limit'?'selected':''}>Limit</option><option value="stop_limit" ${(order?.order_type||kind)==='stop_limit'?'selected':''}>Stop Limit</option></select></label>
      <div class="ct-fields">${[['entry_price',kind==='market'?'Completed close reference':'Limit price',p],['quantity','Units',order?.quantity??prefs.quantity],['trigger_price','Stop trigger (stop-limit)',order?.trigger_price??(kind==='stop_limit'?p:'')],['stop_price','Stop loss',order?.stop_price??''],['target_price','Profit target',order?.target_price??'']].map(([name,label,value])=>`<label>${label}<input type="number" step="any" min="0.00000001" name="${name}" value="${esc(value)}" ${['entry_price','quantity'].includes(name)||kind==='market'&&['stop_price','target_price'].includes(name)?'required':''} ${kind==='market'&&name==='entry_price'?'readonly':''}></label>`).join('')}</div>
      <p>${kind==='market'?'Market simulation opens at the latest completed chart close. A manual crypto session and valid stop/target are required. No broker route is connected.':'Limit entries stay at the selected price and wait for a later completed bar. SL and PT activate after the entry fills.'}</p><button class="ct-primary">${order?'Save order':kind==='market'?'Open paper market simulation':'Place pending paper order'}</button>`,async fd=>{
        const data=Object.fromEntries(fd.entries());
        if(order) await amend(order,data); else await place(data.side,data.kind,data);
        dialog.close();
      });
    const kindSelect=dialog.querySelector('[name=kind]');if(kindSelect)kindSelect.onchange=()=>{const kind=kindSelect.value,price=dialog.querySelector('[name=entry_price]'),stop=dialog.querySelector('[name=stop_price]'),target=dialog.querySelector('[name=target_price]');price.readOnly=kind==='market';stop.required=target.required=kind==='market';};
  }
  async function amend(order, fields) {
    const s=snapshot();
    await request('quant-lab/update-limit',{order_id:order.order_id,revision:order.revision,current_bar_time:s.barTime,...fields});
    notify('Pending paper order updated.');
  }
  async function modify(item, field, price) {
    const id=item.order_id||item.position_id;
    if(busy.has(id))return;
    busy.add(id);
    try {
      if(item.order_id) await amend(item,{[field]:price==null?null:round(price)});
      else {
        const s=snapshot();
        await request('quant-lab/bracket',{position_id:id,current_bar_time:s.barTime,current_price:s.mark,
          stop_price:field==='stop_price'?(price==null?null:round(price)):item.stop_price,target_price:field==='target_price'?(price==null?null:round(price)):item.target_price});
        notify('Paper position bracket updated.');
      }
    } catch(error) {notify(error.message,true);await bridge.refresh();}
    finally {busy.delete(id);refresh();}
  }
  function suggestions(item) {
    const s=snapshot(), p=pane(), entry=Number(item.limit_price??item.entry_price), direction=item.side==='long'?1:-1;
    const policy=s.policy||{}, coin=s.source.market.split(/[-/]/)[0], riskTick=Number(policy['riskTick'+coin]);
    const gap=riskTick>0?riskTick*Math.max(1,Math.floor(Number(policy.maxStopTicks||30)*.6)):Math.max(entry*.0005,Math.abs(p.scale.max-p.scale.min)/30);
    return {stop_price:round(entry-direction*gap),target_price:round(entry+direction*gap*Math.max(3,Number(policy.minRR||3)+1))};
  }
  function level(item, field, ghost=false) {
    const id=item.order_id||item.position_id, key=id+':'+field, isOrder=Boolean(item.order_id);
    const entry=Number(item.limit_price??item.entry_price), hint=suggestions(item);
    const value=field==='entry_price'?entry:field==='trigger_price'?Number(item.trigger_price):Number(item[field]??hint[field]);
    let node=nodes.get(key);
    if(!node){
      node=document.createElement('div');node.className='ct-level';node.innerHTML='<div class="ct-level-track"></div><div class="ct-level-leader"></div><div class="ct-pill"><button type="button" class="ct-drag"></button><span class="ct-actions"></span></div>';
      root.append(node);nodes.set(key,node);
      node.onpointerdown=e=>{
        if(e.button!==0||e.target.closest('.ct-actions'))return;
        if(field==='entry_price'&&!isOrder)return;
        if(busy.has(id))return;
        e.preventDefault();e.stopPropagation();menu.hidden=true;
        drag={key,node,item:node._item,field,price:node._price,startPrice:node._price,startY:e.clientY,moved:false};
        node.setPointerCapture(e.pointerId);node.classList.add('is-dragging');
      };
      node.onpointermove=e=>{
        if(drag?.node!==node)return;e.preventDefault();e.stopPropagation();
        const p=pane(), next=native.coords.yToPrice(native.coords.priceToY(drag.startPrice,p.scale,p.bounds)+e.clientY-drag.startY,p.scale,p.bounds);if(!Number.isFinite(next)||next<=0)return;
        drag.moved ||= Math.abs(e.clientY-drag.startY)>2;drag.price=round(next);
        node._price=drag.price;node.querySelector('.ct-drag').textContent=`${field==='entry_price'?'LIMIT':field==='stop_price'?'SL':field==='target_price'?'PT':'TRIGGER'} ${fmt(drag.price)} · release to save`;
      };
      node.onpointerup=e=>{if(drag?.node!==node)return;e.preventDefault();e.stopPropagation();const edit=drag;drag=null;node.classList.remove('is-dragging');
        if(edit.moved)void modify(edit.item,field,edit.price);else if(isOrder&&field==='entry_price')orderDialog(node._item);refresh();};
      node.onpointercancel=()=>{drag=null;node.classList.remove('is-dragging');refresh();};
      node.querySelector('.ct-drag').onkeydown=e=>{
        if(!['ArrowUp','ArrowDown'].includes(e.key)||field==='entry_price'&&!isOrder)return;
        e.preventDefault();const step=Math.max(.01,Number(snapshot().tick)||.01)*(e.shiftKey?10:1);
        void modify(node._item,field,node._price+(e.key==='ArrowUp'?step:-step));
      };
    }
    node._item=item;
    if(drag?.key!==key){
      node._price=value;
      const pnl=(value-entry)*(item.side==='long'?1:-1)*Number(item.quantity), live=isOrder?(item.bracket_ready?(item.order_type==='stop_limit'&&!item.triggered_bar_time?'AWAITING TRIGGER':'WORKING'):'SET SL / PT'):'OPEN';
      const marketPosition=!isOrder&&String(item.entry_source||'').includes('· MARKET PAPER');
      const title=field==='entry_price'?`${item.side==='long'?'BUY':'SELL'} ${isOrder?item.order_type==='stop_limit'?'STOP LIMIT':'LIMIT':marketPosition?'MARKET':'POSITION'} · ${fmt(item.quantity)} · ${live}`:field==='stop_price'?'SL':field==='target_price'?'PT':'STOP-LIMIT TRIGGER';
      node.classList.toggle('is-ghost',ghost);node.classList.toggle('is-stop',field==='stop_price');node.classList.toggle('is-target',field==='target_price');
      const button=node.querySelector('.ct-drag');button.textContent=`${ghost?'Drag to set ':''}${title} · ${fmt(value)}${field==='stop_price'||field==='target_price'?` · ${pnl>=0?'+':''}${fmt(pnl)} USD`:''}`;
      button.setAttribute('aria-label',`${ghost?'Set':'Drag'} ${field==='entry_price'?'limit entry':field==='stop_price'?'stop loss':field==='target_price'?'profit target':'stop trigger'} ${fmt(value)}`);
      button.disabled=busy.has(id);button.title='Drag vertically; arrow keys move one price increment, Shift moves ten';
      const actions=node.querySelector('.ct-actions');actions.replaceChildren();
      if(field==='entry_price'){
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent=isOrder?'×':'Edit';cancel.title=isOrder?'Cancel pending paper order':'Edit paper position';cancel.setAttribute('aria-label',cancel.title);
        cancel.onclick=e=>{e.stopPropagation();if(isOrder)void bridge.cancel(item);else bridge.ticket(item);};actions.append(cancel);
      }else if(!ghost&&field!=='trigger_price'){
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title=`Remove ${field==='stop_price'?'SL':'PT'}`;remove.setAttribute('aria-label',remove.title);
        remove.onclick=e=>{e.stopPropagation();void modify(item,field,null);};actions.append(remove);
      }
    }
    return key;
  }
  function attach(next) {
    root?.remove();nodes.clear();slot=next;native=slot?.chart?.renderer?.renderer;
    if(!native?.plot||!native.coords||!native.scene){root=null;return;}
    root=document.createElement('div');root.className='ct-overlay';root.setAttribute('aria-label','Paper orders and position brackets');native.plot.append(root);
  }
  function refresh() {
    const s=snapshot();if(!s?.slot)return;
    if(slot!==s.slot||native!==s.slot.chart?.renderer?.renderer)attach(s.slot);
    if(!root||!pane())return;
    const visible=new Set(), matches=i=>i.account_id===s.accountId&&i.provider===s.source.id&&i.symbol===s.source.market&&String(i.timeframe).toLowerCase()===s.source.timeframe.toLowerCase();
    const items=[...(prefs.orders?s.orders.filter(i=>matches(i)&&i.status==='pending'):[]),...(prefs.positions?s.positions.filter(i=>matches(i)&&i.status==='open'):[])];
    for(const item of items){visible.add(level(item,'entry_price'));if(item.order_type==='stop_limit')visible.add(level(item,'trigger_price'));
      if(prefs.brackets)for(const field of ['stop_price','target_price'])visible.add(level(item,field,item[field]==null));}
    for(const [key,node] of nodes)if(!visible.has(key)&&drag?.key!==key){node.remove();nodes.delete(key);}
  }
  function tick() {
    requestAnimationFrame(tick);if(document.hidden)return;
    const s=snapshot();if(s?.slot!==slot||s?.slot?.chart?.renderer?.renderer!==native)refresh();
    const p=pane();if(!root||!p)return;
    const displayed=[];
    for(const node of nodes.values()){
      const y=native.coords.priceToY(node._price,p.scale,p.bounds);
      node.hidden=!Number.isFinite(y)||y<p.bounds.top+8||y>p.bounds.top+p.bounds.height-8;
      node.style.top=y+'px';node.style.width=native.coords.width+'px';
      if(!node.hidden)displayed.push({node,y,label:y});
    }
    displayed.sort((a,b)=>a.y-b.y);
    for(let i=1;i<displayed.length;i++)displayed[i].label=Math.max(displayed[i].y,displayed[i-1].label+28);
    const overflow=Math.max(0,(displayed.at(-1)?.label||0)-(p.bounds.top+p.bounds.height-14));
    for(const d of displayed){const offset=d.label-overflow-d.y;d.node.querySelector('.ct-pill').style.top=(offset-13)+'px';
      const leader=d.node.querySelector('.ct-level-leader');leader.style.top=Math.min(0,offset)+'px';leader.style.height=Math.abs(offset)+'px';}
    let lock=root.querySelector('.ct-time-lock');
    if(cursor&&cursor.key===identity(s)){if(!lock){lock=document.createElement('div');lock.className='ct-time-lock';root.append(lock);}lock.style.left=native.coords.timeToX(cursor.time)+'px';lock.style.top=p.bounds.top+'px';lock.style.height=p.bounds.height+'px';}
    else lock?.remove();
    const bar=s?.completed?.at(-1);if(!bar)return;
    const market=identity(s),last=lastAlertBar.get(market);if(last===bar.time)return;lastAlertBar.set(market,bar.time);
    let changed=false;
    for(const a of alerts.filter(a=>a.key===market&&!a.fired&&bar.time>a.after))if(bar.low<=a.price&&bar.high>=a.price){a.fired=bar.time;changed=true;notify(`PRICE ALERT · ${s.source.market} touched ${fmt(a.price)} on the ${new Date(bar.time).toISOString()} completed candle.`);}
    if(changed)localStorage.setItem(storageKey+'-alerts',JSON.stringify(alerts));
  }
  function table() {
    const s=validContext();show('Table view',`<p>${esc(s.source.label)} · ${esc(s.source.market)} · ${esc(s.source.timeframe)} · completed candles</p><div class="ct-table"><table><thead><tr>${['Time UTC','Open','High','Low','Close','Volume'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${s.completed.slice().reverse().map(b=>`<tr>${[new Date(b.time).toISOString(),b.open,b.high,b.low,b.close,b.volume??'—'].map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button type="button" data-csv>Download CSV</button>`);
    dialog.querySelector('[data-csv]').onclick=()=>{const text='time_utc,open,high,low,close,volume\n'+s.completed.map(b=>[new Date(b.time).toISOString(),b.open,b.high,b.low,b.close,b.volume??''].join(',')).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=s.source.market+'-'+s.source.timeframe+'.csv';a.click();URL.revokeObjectURL(url);};
  }
  function objects() {
    const s=validContext(), owned=new Set([...(s.slot.tradeDrawings||[]),...(s.slot.cleoDrawingIds||[]),...(s.slot.shammyDrawingIds||[]),...[...s.slot.premiumDrawings.values()].flat()]);
    const drawings=s.slot.chart.drawings.all();
    show('Object tree',`<p>${esc(s.source.market)} · chart drawings and paper trading objects</p><div class="ct-object-list">${drawings.map(d=>`<div><span>${esc(d.text?.value||d.type)} · ${esc(d.anchors?.[0]?.price??'')} ${d.locked||owned.has(d.id)?'· study':''}</span><button type="button" data-toggle="${esc(d.id)}">${d.visible===false?'Show':'Hide'}</button></div>`).join('')||'<p>No chart drawings.</p>'}${s.orders.filter(i=>i.status==='pending'&&i.account_id===s.accountId).map(o=>`<div><span>${o.side==='long'?'Buy':'Sell'} ${esc(o.order_type)} · ${fmt(o.limit_price)} · ${o.bracket_ready?'working':'awaiting SL/PT'}</span><button type="button" data-order="${esc(o.order_id)}">Modify</button></div>`).join('')}</div><button type="button" data-copy>Copy user drawings</button>`);
    dialog.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const d=s.slot.chart.drawings.all().find(d=>d.id===b.dataset.toggle);s.slot.chart.drawings.show(d.id,d.visible===false);b.textContent=d.visible===false?'Hide':'Show';});
    dialog.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{dialog.close();orderDialog(s.orders.find(o=>o.order_id===b.dataset.order));});
    dialog.querySelector('[data-copy]').onclick=async()=>{const data={kind:'count-desk-drawings',source:identity(s),drawings:drawings.filter(d=>!d.locked&&!owned.has(d.id))};try{await navigator.clipboard.writeText(JSON.stringify(data));notify('User drawings copied.');}catch {notify('Clipboard access unavailable. Use Paste to enter drawing JSON manually.',true);}};
  }
  function paste() {
    show('Paste drawing or price','<label>Paste a price to create a horizontal line, or copied chart drawings<textarea name="content" required rows="6"></textarea></label><button class="ct-primary">Paste on chart</button>',fd=>{
      const s=validContext(),text=String(fd.get('content')).trim(),price=Number(text.replace(/,/g,''));
      if(Number.isFinite(price)&&price>0)s.slot.chart.drawings.add('hline',{paneId:'price',anchors:[{time:s.barTime*1000,price}],style:{lineColor:'#19d0e9',lineWidth:2}});
      else {const data=JSON.parse(text);if(data.kind!=='count-desk-drawings'||data.source!==identity(s)||!Array.isArray(data.drawings))throw Error('Paste drawings copied from this same chart source.');
        for(const d of data.drawings.slice(0,100))s.slot.chart.drawings.add(d.type,{paneId:'price',anchors:d.anchors,style:d.style,text:d.text});}
      dialog.close();notify('Drawing pasted onto chart.');
    });
    void navigator.clipboard.readText().then(t=>{if(dialog.open)dialog.querySelector('textarea').value=t;}).catch(()=>{});
  }
  function alertDialog() {
    const s=validContext();show('Price alerts',`<p>Alerts run while this chart is open, using completed bars.</p><label>Alert price<input name="price" type="number" min="0.00000001" step="any" value="${context.price}" required></label><button class="ct-primary">Add price alert</button><div class="ct-object-list">${alerts.filter(a=>a.key===identity(s)).map(a=>`<div><span>${fmt(a.price)} · ${a.fired?'Triggered':'Watching'}</span><button type="button" data-remove-alert="${a.id}">Delete</button></div>`).join('')}</div>`,fd=>{
      alerts.push({id:crypto.randomUUID(),key:identity(s),price:Number(fd.get('price')),after:s.completed.at(-1).time});localStorage.setItem(storageKey+'-alerts',JSON.stringify(alerts));dialog.close();notify('Price alert saved.');
    });
    dialog.querySelectorAll('[data-remove-alert]').forEach(b=>b.onclick=()=>{alerts=alerts.filter(a=>a.id!==b.dataset.removeAlert);localStorage.setItem(storageKey+'-alerts',JSON.stringify(alerts));b.parentElement.remove();});
  }
  function templateDialog() {
    const s=validContext();show('Chart templates',`<label>Template name<input name="name" required maxlength="80" placeholder="My chart view"></label><button class="ct-primary">Save current chart appearance</button><div class="ct-object-list">${templates.map((t,i)=>`<div><span>${esc(t.name)}</span><button type="button" data-load-template="${i}">Apply</button><button type="button" data-delete-template="${i}">Delete</button></div>`).join('')}</div><p>Templates save chart appearance and trading display settings. They do not create or change orders.</p>`,fd=>{
      const name=String(fd.get('name')).trim();templates=templates.filter(t=>t.name!==name);templates.push({name,config:s.slot.chart.renderer.getConfig(),prefs:{...prefs}});localStorage.setItem(storageKey+'-templates',JSON.stringify(templates));dialog.close();notify('Chart template saved.');
    });
    dialog.querySelectorAll('[data-load-template]').forEach(b=>b.onclick=()=>{const t=templates[Number(b.dataset.loadTemplate)];s.slot.chart.renderer.applyConfig(t.config);prefs={...prefs,...t.prefs};save();refresh();dialog.close();notify('Chart template applied.');});
    dialog.querySelectorAll('[data-delete-template]').forEach(b=>b.onclick=()=>{templates.splice(Number(b.dataset.deleteTemplate),1);localStorage.setItem(storageKey+'-templates',JSON.stringify(templates));dialog.close();templateDialog();});
  }
  function tradingSettings() {
    show('Chart trading settings',`<label>Default order units<input name="quantity" type="number" min="0.00000001" max="1000000" step="any" value="${prefs.quantity}" required></label>${[['orders','Pending orders'],['positions','Open positions'],['brackets','SL / PT handles']].map(([key,label])=>`<label class="ct-check"><input type="checkbox" name="${key}" ${prefs[key]?'checked':''}>${label}</label>`).join('')}<button type="button" data-appearance>Candle appearance…</button><button class="ct-primary">Save trading settings</button>`,fd=>{prefs={quantity:Number(fd.get('quantity')),orders:fd.has('orders'),positions:fd.has('positions'),brackets:fd.has('brackets')};save();refresh();dialog.close();});
    dialog.querySelector('[data-appearance]').onclick=()=>{dialog.close();$('#tradingChartSettingsLink')?.click();};
  }
  async function action(name) {
    try {
      const s=validContext();
      if(name==='buy')await place('long');
      if(name==='sell')await place('short');
      if(name==='buy-market')orderDialog(null,'long','market');
      if(name==='sell-market')orderDialog(null,'short','market');
      if(name==='stop')orderDialog(null,context.price>=s.mark?'long':'short','stop_limit');
      if(name==='stop-limit')await place(context.price>=s.mark?'long':'short','stop_limit');
      if(name==='order')orderDialog();
      if(name==='reset'){native.resetView();notify('Chart view reset.');}
      if(name==='copy'){try {await navigator.clipboard.writeText(String(context.price));notify('Price copied.');}catch {show('Copy price',`<label>Selected price<input readonly value="${context.price}"></label>`);dialog.querySelector('input').select();}}
      if(name==='paste')paste();
      if(name==='alert')alertDialog();
      if(name==='lock'){cursor=cursor?null:{key:identity(s),time:context.time};notify(cursor?'Vertical time cursor locked.':'Vertical time cursor unlocked.');}
      if(name==='table')table();
      if(name==='objects')objects();
      if(name==='templates')templateDialog();
      if(name==='indicators'){api.studiesHidden=!api.studiesHidden;await bridge.studies(api.studiesHidden);notify(api.studiesHidden?'Indicators hidden. Choose Restore indicators to show them again.':'Indicators restored.');}
      if(name==='settings')tradingSettings();
    }catch(error){notify(error.message,true);}finally{menu.hidden=true;}
  }
  function openMenu(e) {
    const host=e.target.closest('.chart-host');if(!host||e.target.closest('.ct-level'))return;
    e.preventDefault();e.stopPropagation();
    const clicked=bridge.slotForHost(host);if(clicked)bridge.activate(clicked.index);
    const s=snapshot();if(!s?.source||!s.barTime)return;
    if(slot!==s.slot)attach(s.slot);
    const bounds=native.plot.getBoundingClientRect(),p=pane(),y=e.clientY-bounds.top;
    const price=p&&y>=p.bounds.top&&y<=p.bounds.top+p.bounds.height?round(priceAt(e)):round(s.mark);
    context={key:identity(s),price,time:native.coords.logicalToTime(native.coords.xToLogical(e.clientX-bounds.left))};
    const qty=prefs.quantity,symbol=s.source.market,stopSide=price>=s.mark?'Buy':'Sell';
    menu.innerHTML=`<div class="ct-menu-heading"><span>CHART TRADER · PAPER</span><label>Units <input type="number" min="0.00000001" step="any" value="${qty}" aria-label="Quick order units"></label></div>`+
      [['reset','↺','Reset chart view'],['copy','⧉',`Copy price ${fmt(price)}`],['paste','▣','Paste'],['alert','♧',`Add alert on ${symbol} at ${fmt(price)}…`],
      ['buy','↑',`Buy ${qty} ${symbol} @ ${fmt(price)} limit`],['sell','↓',`Sell ${qty} ${symbol} @ ${fmt(price)} limit`],
      ['stop','⇥',`${stopSide} stop → configure stop-limit…`],['stop-limit','⇥',`${stopSide} @ ${fmt(price)} stop / ${fmt(price)} limit`],
      ['order','⊞',`Add order on ${symbol} at ${fmt(price)}…`],['lock','┆',`${cursor?'Unlock':'Lock'} vertical cursor line by time`],['table','▤','Table view'],['objects','☷','Object tree'],['templates','◇','Chart template…'],['indicators','⊖',api.studiesHidden?'Restore indicators':'Remove indicators'],['settings','⚙','Settings…']]
      .map(([key,icon,label])=>`<button type="button" role="menuitem" data-chart-action="${key}" ${['reset','paste','order','lock','templates','indicators'].includes(key)?'class="ct-menu-separator"':''}><span class="ct-menu-icon">${icon}</span>${esc(label)}</button>`).join('');
    menu.querySelector('input').onchange=e=>{const value=Number(e.target.value);if(value>0&&value<=1e6){prefs.quantity=value;save();menu.querySelector('[data-chart-action="buy"]').lastChild.textContent=`Buy ${value} ${symbol} @ ${fmt(price)} limit`;menu.querySelector('[data-chart-action="sell"]').lastChild.textContent=`Sell ${value} ${symbol} @ ${fmt(price)} limit`;}};
    menu.hidden=false;const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(e.clientX,window.innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(e.clientY,window.innerHeight-rect.height-8))+'px';
    menu.querySelector('[role="menuitem"]').focus({preventScroll:true});
  }
  $('#chartGrid').addEventListener('contextmenu',openMenu);
  menu.addEventListener('click',e=>{const b=e.target.closest('[data-chart-action]');if(b)void action(b.dataset.chartAction);});
  menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('[role="menuitem"]')];if(e.key==='Escape'){menu.hidden=true;return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const i=buttons.indexOf(document.activeElement),delta=e.key==='ArrowDown'?1:-1;buttons[(i+delta+buttons.length)%buttons.length].focus();}});
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.hidden=true;});
  const api={refresh,studiesHidden:false,settings:tradingSettings,placeAt:async(side,price)=>{const s=snapshot();context={key:identity(s),price,time:s.barTime*1000};try{await place(side);}catch(e){notify(e.message,true);}}};
  for(const [id,side] of [['quickBuy','long'],['quickSell','short'],['deskBuyLimit','long'],['deskSellLimit','short']]) {
    document.getElementById(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();try{bridge.ticket(side);}catch(error){notify(error.message,true);}},true);
  }
  window.chartTradingUI=api;requestAnimationFrame(tick);return api;
}

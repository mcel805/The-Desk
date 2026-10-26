import {summarizePositions,formatPnl,ladderPrices} from './trading-model.mjs';

export function setupDOMTrader({state,instrument,quote,accountId,replay,stage,book,editOrder,closePosition,editBracket,showDialog,command,pending=()=>false,cancelOrder,toast,config}){
  const $=s=>document.querySelector(s),fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:8});
  const panel=$('#domPanel'),view=$('#domView'),ladder=$('#domLadder'),orders=$('#domOrders');
  let center=null,current='',lastOrderSignature='',lastPositionSignature='',unit=config().pnlUnit;
  view.value=localStorage.getItem('the-desk.dom.view')==='ladder'?'ladder':'book';
  const refs=items=>items.map(({id,revision})=>({id,revision}));
  const scoped=()=>{const s=state();return {positions:s?.positions.filter(p=>p.instrument===instrument())||[],orders:s?.orders.filter(o=>o.instrument===instrument()&&['working','triggered'].includes(o.status))||[]};};
  const batch=(action,title,items)=>{
    if(replay())return toast('Exit replay to manage paper trading.',true);
    const snapshot={account_id:accountId(),instrument:instrument(),orders:refs(items.orders),positions:refs(items.positions)};
    if(config().instant){void command(action,snapshot).then(()=>toast(title+' accepted · PAPER')).catch(e=>toast(e.message,true));return;}
    showDialog(title,`<p>${snapshot.instrument.toUpperCase()} · PAPER</p><p>${action==='cancel_orders'?'Cancel '+items.orders.length+' working orders.':action==='flatten'?'Cancel '+items.orders.length+' working orders and close '+items.positions.length+' positions.':'Cancel '+items.orders.length+' working orders and reverse the net position at the current server quote.'}</p>`,async()=>{await command(action,snapshot);toast(title+' accepted · PAPER');});
  };
  function paint(){
    if(panel.hidden)return;
    if(current!==instrument()){current=instrument();center=null;lastOrderSignature='';lastPositionSignature='';}
    if(document.activeElement!==$('#domQuantity'))$('#domQuantity').value=$('#quantity').value;
    const items=scoped(),q=quote(),summary=summarizePositions(items.positions,q,unit),locked=replay();
    $('#domPosition').textContent=items.positions.length?(summary.qty>0?'Long ':summary.qty<0?'Short ':'Net flat ')+fmt(Math.abs(summary.qty))+' · avg '+fmt(summary.entry):'Flat · '+current.toUpperCase();
    $('#domPnl').textContent=formatPnl(summary);$('#domPnl').className=summary.pnl>=0?'positive':'negative';
    $('#domFlatten').disabled=locked||!items.positions.length&&!items.orders.length;
    $('#domReverse').disabled=locked||!summary.qty||current.startsWith('coinbase:');$('#domReverse').title=current.startsWith('coinbase:')?'Spot has no short position to reverse into':'Reverse net paper position';
    panel.querySelectorAll('[data-dom-cancel]').forEach(b=>b.disabled=locked||!items.orders.some(o=>matches(o,b.dataset.domCancel)));
    const sig=JSON.stringify(items.orders);if(sig!==lastOrderSignature){
      lastOrderSignature=sig;orders.replaceChildren();
      for(const o of items.orders){const row=document.createElement('div');row.className='dom-own-order';row.dataset.orderId=o.id;row.draggable=true;
        const label=document.createElement('button');label.textContent=o.side.toUpperCase()+' '+o.kind.replace('_',' ').toUpperCase()+' '+fmt(o.qty)+' @ '+fmt(o.trigger||o.price);label.dataset.modify=o.id;label.onclick=()=>editOrder(o);label.disabled=locked;
        const cancel=document.createElement('button');cancel.textContent='×';cancel.dataset.cancel=o.id;cancel.setAttribute('aria-label','Cancel '+o.side+' '+o.kind+' order');cancel.disabled=locked;cancel.onclick=()=>cancelOrder(o);
        row.append(label,cancel);row.ondragstart=e=>{if(locked){e.preventDefault();return;}e.dataTransfer.setData('application/x-desk-order',o.id);e.dataTransfer.effectAllowed='move';};orders.append(row);
      }
      if(!items.orders.length){const label=document.createElement('span');label.className='muted';label.textContent='No working orders';orders.append(label);}
    }
    orders.querySelectorAll('button').forEach(b=>b.disabled=locked||pending(accountId(),b.dataset.cancel||b.dataset.modify));
    const psig=JSON.stringify(items.positions);if(psig!==lastPositionSignature){lastPositionSignature=psig;$('#domPositionActions').replaceChildren();for(const p of items.positions){const row=document.createElement('div');row.className='dom-position-actions';const bracket=document.createElement('button');bracket.textContent='SL / TP · '+fmt(p.qty);bracket.onclick=()=>editBracket(p);bracket.dataset.bracket=p.id;const close=document.createElement('button');close.textContent='Close';close.onclick=()=>closePosition(p);close.dataset.close=p.id;const partial=document.createElement('button');partial.textContent='Partial';partial.onclick=()=>closePosition(p,{partial:true});row.append(bracket,close,partial);$('#domPositionActions').append(row);}}
    $('#domPositionActions').querySelectorAll('button').forEach(b=>b.disabled=locked);
    const isLadder=view.value==='ladder';$('#domBook').hidden=isLadder;ladder.hidden=!isLadder;
    if(isLadder&&q){
      const b=book(),tick=Number(q.tick),multiple=Number($('#domGroup').value);if(center===null)center=b?(b.bids[0].price+b.asks[0].price)/2:Number(q.last);
      const prices=ladderPrices(center,tick,multiple),signature=prices.join(',');
      if(ladder.dataset.prices!==signature){ladder.dataset.prices=signature;ladder.replaceChildren();const labels=document.createElement('div');labels.className='ladder-labels';labels.innerHTML='<span>BUY</span><span>BID</span><span>PRICE</span><span>ASK</span><span>SELL</span>';ladder.append(labels);
        for(const price of prices){const row=document.createElement('div');row.className='ladder-row';row.dataset.price=price;const buy=document.createElement('button'),sell=document.createElement('button');buy.className='buy';sell.className='sell';buy.textContent='＋';sell.textContent='＋';
          for(const [button,side] of [[buy,'buy'],[sell,'sell']]){button.dataset.side=side;button.dataset.price=price;button.setAttribute('aria-label',side+' paper limit at '+fmt(price)+'. Command or Control click for stop.');button.onclick=e=>stage(side,e.ctrlKey||e.metaKey?'stop':'limit',price);button.oncontextmenu=e=>{e.preventDefault();menu(side,price,e.clientX,e.clientY);};}
          const bid=document.createElement('span'),label=document.createElement('span'),ask=document.createElement('span');bid.className='ladder-bid';ask.className='ladder-ask';label.textContent=fmt(price);label.className='ladder-price';row.append(buy,bid,label,ask,sell);
          row.ondragover=e=>{if(!locked&&e.dataTransfer.types.includes('application/x-desk-order'))e.preventDefault();};row.ondrop=e=>{e.preventDefault();if(replay())return;const o=scoped().orders.find(o=>o.id===e.dataTransfer.getData('application/x-desk-order'));if(o)editOrder(o,{[o.kind==='stop'||o.kind==='stop_limit'?'trigger':'price']:String(price)});};ladder.append(row);
        }
      }
      const bids=new Map(),asks=new Map();const step=tick*multiple;
      if(b){for(const [list,map,round] of [[b.bids,bids,Math.floor],[b.asks,asks,Math.ceil]])for(const r of list){const p=Number((round(r.price/step+(round===Math.floor?1e-8:-1e-8))*step).toPrecision(12));map.set(p,(map.get(p)||0)+r.qty);}}
      for(const row of ladder.querySelectorAll('.ladder-row')){const p=Number(row.dataset.price);for(const [selector,values] of [['.ladder-bid',bids],['.ladder-ask',asks]]){const cell=row.querySelector(selector),value=values.get(p);if(cell.dataset.qty!==undefined&&cell.dataset.qty!==String(value)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){cell.getAnimations().forEach(a=>a.cancel());cell.animate([{background:selector==='.ladder-bid'?'#08998177':'#f2364577'},{background:'transparent'}],{duration:420});}cell.dataset.qty=String(value);cell.textContent=values.has(p)?fmt(value):'—';}row.classList.toggle('best-bid',p===Number((Math.floor(Number(b?.bids[0]?.price??q.bid)/step+1e-8)*step).toPrecision(12)));row.classList.toggle('best-ask',p===Number((Math.ceil(Number(b?.asks[0]?.price??q.ask)/step-1e-8)*step).toPrecision(12)));row.classList.toggle('owns-order',items.orders.some(o=>Number(o.price||o.trigger)===p));row.querySelectorAll('button').forEach(x=>x.disabled=locked);}
    }
  }
  function menu(side,price,x,y){const host=$('#chartMenu');host.replaceChildren();for(const kind of ['market','limit','stop','stop_limit']){const b=document.createElement('button');b.textContent=(side==='buy'?'Buy':'Sell')+' '+kind.replace('_',' ')+' at '+fmt(price)+' · PAPER';b.onclick=()=>{stage(side,kind,price);host.hidden=true;};host.append(b);}host.style.left=Math.min(x,innerWidth-260)+'px';host.style.top=Math.min(y,innerHeight-160)+'px';host.hidden=false;}
  function matches(o,filter){return filter==='all'||filter===o.side||filter==='limit'&&o.kind.includes('limit')||filter==='stop'&&o.kind.includes('stop');}
  panel.querySelectorAll('[data-dom-cancel]').forEach(button=>button.onclick=()=>{const items=scoped();items.orders=items.orders.filter(o=>matches(o,button.dataset.domCancel));batch('cancel_orders','Cancel paper '+button.dataset.domCancel+' orders',items);});
  $('#domFlatten').onclick=()=>batch('flatten','Flatten paper instrument',scoped());$('#domReverse').onclick=()=>batch('reverse','Reverse paper instrument',scoped());
  $('#domPnl').onclick=()=>{unit={money:'ticks',ticks:'percent',percent:'money'}[unit];paint();};
  $('#domQuantity').oninput=()=>{$('#sizeMode').value='units';$('#quantity').value=$('#domQuantity').value;$('#quantity').dispatchEvent(new Event('input',{bubbles:true}));};
  $('#domCenter').addEventListener('click',()=>{center=null;paint();});$('#domGroup').addEventListener('change',()=>{center=null;paint();});
  view.onchange=()=>{localStorage.setItem('the-desk.dom.view',view.value);center=null;paint();};
  $('#domBook').addEventListener('contextmenu',e=>{const r=e.target.closest('[data-price]');if(!r)return;e.preventDefault();menu(r.dataset.side,Number(r.dataset.price),e.clientX,e.clientY);});
  setInterval(paint,150);return {paint};
}

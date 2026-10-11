import {BookStream,normalizeBook,depthRows} from './dom-book.mjs';

export function setupDOM({instrument,quote,stage,account,replay}){
  const $=s=>document.querySelector(s),host=$('#domBook'),status=$('#domStatus'),mode=$('#domMode'),group=$('#domGroup');
  const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:8}),size=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('the-desk.dom.v1')||'{}');}catch{return {};}})();
  mode.value=['fast','depth'].includes(saved.mode)?saved.mode:'depth';group.value=['1','10','100'].includes(saved.group)?saved.group:'1';
  let active='',book=null,streamState='connecting',frame=0,trade=null,selected=null,pinned=false,shown=[],lastPaint=new Map(),changes=new Map(),renderedInstrument='',fallbackAt='',ticks=0,previousMid=null;
  const rows=new Map();
  host.innerHTML='<div class="dom-labels"><span>Price</span><span id="domSizeLabel">Size</span><span id="domTotalLabel">Total</span></div><div class="dom-asks"></div><div class="dom-spread"><strong id="domMid">—</strong><span id="domSpread">Spread —</span></div><div class="dom-bids"></div><div class="dom-empty">Connecting order book…</div>';
  const asks=host.querySelector('.dom-asks'),bids=host.querySelector('.dom-bids'),empty=host.querySelector('.dom-empty');
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  const stream=new BookStream({onBook:next=>{
    if(next.instrument!==active)return;
    // A delayed source packet must not appear as a current book.
    if(next.sourceTime&&Date.now()-next.sourceTime>10000){streamState='stale';schedule();return;}
    book=next;ticks++;schedule();
  },onTrade:next=>{if(next.instrument===active){trade=next;schedule();}},onStatus:next=>{streamState=next;schedule();}});
  function useFallback(){
    const q=quote(),age=q?.received_at?(Date.now()/1000-q.received_at):q?.age;
    if(q?.book&&age<=15&&(!book||book.transport!=='WebSocket'||Date.now()-book.receivedAt>10000)){
      const marker=String(q.received_at??q.updated_at??q.source_time??JSON.stringify(q.book));
      if(marker!==fallbackAt){try{book={...normalizeBook(q.book),instrument:active,receivedAt:Date.now()-age*1000,transport:'REST snapshot',mode:'depth'};fallbackAt=marker;}catch{}}
    }
  }
  function sync(){
    const next=instrument();
    if(next!==active){active=next;book=null;trade=null;selected=null;previousMid=null;ticks=0;fallbackAt='';pinned=false;shown=[];changes.clear();lastPaint.clear();$('#domSelection').textContent='Click a price to stage a paper limit';stream.start(active,mode.value);}
    useFallback();schedule();
  }
  function pick(side,price,sourceInstrument,stop=false){
    if(sourceInstrument!==instrument()||sourceInstrument!==active)return;
    selected={side,price};stage(side,stop?'stop':'limit',price);
    $('#domSelection').textContent=(side==='buy'?'Buy':'Sell')+(stop?' stop ':' limit ')+fmt(price)+' · review in ticket';schedule();
  }
  function makeRow(r){
    const button=document.createElement('button');button.className='dom-row '+r.kind;button.type='button';
    button.innerHTML='<i class="dom-depth"></i><i class="dom-flash"></i><span class="dom-price"></span><span class="dom-size"></span><span class="dom-total"></span>';
    button.dataset.price=r.price;button.dataset.side=r.kind==='bid'?'buy':'sell';button.dataset.instrument=active;
    let pressed=null;
    button.onpointerdown=e=>{if(e.button===0)pressed={side:button.dataset.side,price:Number(button.dataset.price),instrument:button.dataset.instrument};};
    button.onclick=e=>{const p=pressed||{side:button.dataset.side,price:Number(button.dataset.price),instrument:button.dataset.instrument};pressed=null;pick(p.side,p.price,p.instrument,e.ctrlKey||e.metaKey);};
    button.onpointercancel=()=>{pressed=null;};
    return button;
  }
  function paint(){
    frame=0;if($('#domPanel').hidden)return;const q=quote(),age=book?(Date.now()-book.receivedAt)/1000:Infinity,live=book?.transport==='WebSocket'&&streamState==='streaming'&&age<=10;
    const serverAge=q?.received_at?Math.max(0,Date.now()/1000-q.received_at):q?.age;
    const serverOK=!!q&&serverAge<=15&&!!account()&&!replay();
    mode.disabled=active.startsWith('coinbase:');
    const base=active.split(':')[1]?.replace('-USD','')||'';$('#domSizeLabel').textContent='Size ('+base+')';$('#domTotalLabel').textContent='Total ('+base+')';
    const name=active.toUpperCase();$('#domInstrument').textContent=name;
    status.className='dom-status '+(live?'live':'');
    status.textContent=live?'● Streaming · '+age.toFixed(1)+'s':book?((age>15?'STALE':book.transport==='WebSocket'?'Reconnecting':'REST fallback')+' · '+age.toFixed(1)+'s'):'Connecting · '+streamState;
    $('#domFlow').textContent=pinned?'Prices pinned under pointer':live?(active.startsWith('hyperliquid:')&&mode.value==='fast'?'Fast feed · up to 5 per side':'Depth feed · up to 20 per side'):'Waiting for stream';
    $('#domFlow').dataset.updates=ticks;
    $('#domBuy').disabled=$('#domSell').disabled=!serverOK;
    $('#domExecution').textContent=replay()?'Exit replay to trade':serverOK?'Paper ticket ready · server quote '+serverAge.toFixed(1)+'s':'Paper ticket waiting for fresh server quote';
    if(!book){empty.hidden=false;empty.textContent=streamState==='unsupported'?'Order book unavailable for this instrument.':'Connecting order book…';asks.replaceChildren();bids.replaceChildren();rows.clear();renderedInstrument=active;return;}
    empty.hidden=true;
    const data=depthRows(book,mode.value==='fast'&&active.startsWith('hyperliquid:')?5:20,Number(group.value),Number(q?.tick||.01));
    const ordered=[...data.asks].reverse().concat(data.bids),incoming=new Map(ordered.map(r=>[r.key,r]));
    const now=performance.now();
    for(const r of ordered){const old=lastPaint.get(r.key);if((old!==undefined&&old!==r.qty)||(old===undefined&&lastPaint.size))changes.set(r.key,{time:now,direction:old===undefined||r.qty>old?'up':'down'});lastPaint.set(r.key,r.qty);}
    // Keep the flash ledger bounded to currently displayed prices.
    for(const key of lastPaint.keys())if(!incoming.has(key)){lastPaint.delete(key);changes.delete(key);}
    if(renderedInstrument!==active){asks.replaceChildren();bids.replaceChildren();rows.clear();shown=[];renderedInstrument=active;}
    if(!pinned||!shown.length)shown=ordered.map(r=>({key:r.key,price:r.price,kind:r.kind}));
    const keep=new Set(shown.map(r=>r.key));for(const [key,node] of rows)if(!keep.has(key)){node.remove();rows.delete(key);}
    for(const slot of shown){
      const r=incoming.get(slot.key)||{...slot,qty:0,total:0,best:false};let node=rows.get(slot.key);
      if(!node){node=makeRow(r);rows.set(slot.key,node);}
      const parent=r.kind==='ask'?asks:bids;
      const index=shown.filter(x=>x.kind===r.kind).findIndex(x=>x.key===r.key);
      if(parent.children[index]!==node)parent.insertBefore(node,parent.children[index]||null);
      node.querySelector('.dom-price').textContent=fmt(r.price);node.querySelector('.dom-size').textContent=r.qty?size(r.qty):'—';node.querySelector('.dom-total').textContent=r.qty?size(r.total):'—';
      node.querySelector('.dom-depth').style.width=(data.maximum?r.total/data.maximum*100:0)+'%';
      const change=changes.get(r.key),elapsed=change?now-change.time:Infinity;
      node.querySelector('.dom-flash').style.opacity=elapsed<420?String(.48*(1-elapsed/420)):'0';
      node.classList.toggle('reduced',change?.direction==='down');node.classList.toggle('best',!!r.best);node.classList.toggle('vacant',!r.qty);
      const chosen=selected?.price===r.price&&selected.side===(r.kind==='bid'?'buy':'sell');node.classList.toggle('selected',chosen);node.setAttribute('aria-pressed',String(chosen));
      node.classList.toggle('last-trade',!!trade&&Date.now()-trade.time<3000&&trade.price===r.price);
      node.setAttribute('aria-label',`${r.kind==='bid'?'Buy':'Sell'} paper limit at ${fmt(r.price)}. Size ${size(r.qty)}, cumulative ${size(r.total)} ${base}.`);
    }
    const mid=$('#domMid');mid.textContent=(trade&&Date.now()-trade.time<10000?fmt(trade.price):fmt(data.mid))+(previousMid!==null&&data.mid!==previousMid?(data.mid>previousMid?' ↑':' ↓'):'');
    if(previousMid!==null&&data.mid!==previousMid){mid.className=data.mid>previousMid?'positive':'negative';mid.animate([{background:data.mid>previousMid?'#08998166':'#f2364566'},{background:'transparent'}],{duration:420});}previousMid=data.mid;
    $('#domSpread').textContent='Spread '+fmt(data.spread)+' · '+(data.spread/data.mid*100).toFixed(3)+'%';
    if([...changes.values()].some(c=>now-c.time<420))schedule();
  }
  const release=()=>{if(host.matches(':hover')||host.contains(document.activeElement))return;pinned=false;schedule();};
  host.addEventListener('pointerenter',()=>{pinned=true;schedule();});host.addEventListener('pointerleave',release);
  host.addEventListener('focusin',()=>{pinned=true;schedule();});host.addEventListener('focusout',()=>setTimeout(release,0));
  $('#domCenter').onclick=()=>{pinned=false;shown=[];schedule();};
  const save=()=>localStorage.setItem('the-desk.dom.v1',JSON.stringify({mode:mode.value,group:group.value}));
  mode.onchange=()=>{save();book=null;shown=[];lastPaint.clear();changes.clear();stream.start(active,mode.value);schedule();};
  group.onchange=()=>{save();pinned=false;shown=[];lastPaint.clear();changes.clear();schedule();};
  $('#domBuy').onclick=()=>stage('buy','market');$('#domSell').onclick=()=>stage('sell','market');
  setInterval(()=>{useFallback();schedule();},500);
  window.addEventListener('pagehide',()=>stream.stop());window.addEventListener('pageshow',()=>{if(active)stream.start(active,mode.value);});
  return {sync,book:()=>book};
}

import {VelaWorkspace,CoinbaseProvider,HyperliquidProvider} from './vendor/vela.js';
import {runSmaBacktest} from './sma-backtest.mjs';

const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=2)=>Number(v??0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=v=>Number.isFinite(Number(v))?'$'+number(v):'—', fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:8});
let state=null,ws=null,activeAccount=localStorage.getItem('the-desk.account'),panel='positions',rail='watch',side='buy',draft=false,busy=false,settings={},templates=[],polling=false,commandKey=null,dialogKey=null,contextKey='',menuPrice=null;
const instruments=['hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL','coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD'];

async function api(path,payload,headers={}){
 const response=await fetch(path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Service unavailable');return result;
}
function toast(text,error=false){$('#toast').textContent=text;$('#toast').classList.add('visible');$('#toast').style.borderColor=error?'#f23645':'#525d73';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
async function command(action,payload,key=($('#dialog').open?dialogKey:crypto.randomUUID())){
 const result=await api('/api/command',{action,payload},{'Idempotency-Key':key});await refresh();return result;
}
function instrument(){
 const m=ws?.chart?.market;if(!m)return 'hyperliquid:BTC';
 const symbol=m.symbol||'hyperliquid:BTC';const resolved=ws.chart.data?.resolve?.(symbol);
 const provider=String(resolved?.provider?.name||resolved?.provider||m.provider||symbol.split(':')[0]).toLowerCase();
 const base=String(resolved?.ticker||symbol.split(':').at(-1));
 return (provider.includes('coinbase')?'coinbase':'hyperliquid')+':'+base;
}
function account(){return state?.accounts.find(a=>a.id===activeAccount);}
function quote(){return state?.quotes[instrument()];}
function snap(v){const tick=Number(quote()?.tick||.01);return Number((Math.round(Number(v)/tick)*tick).toPrecision(12));}
function quantity(){
 const amount=Number($('#quantity').value),q=quote(),price=entryReference();let qty=amount;
 if($('#sizeMode').value==='cash')qty=amount/price;
 if($('#sizeMode').value==='balance')qty=Number(account()?.balance)*amount/100/price;
 if($('#sizeMode').value==='risk'){const stop=Number($('#stopPrice').value);if(!stop||stop===price)return NaN;qty=amount/Math.abs(price-stop);}
 const step=Number(q?.qty_step||.000001);
 return Number((Math.floor((qty+step*1e-7)/step)*step).toPrecision(12));
}
function entryReference(){const k=$('#orderKind').value;return Number(k==='limit'||k==='stop_limit'?$('#entryPrice').value:k==='stop'?$('#triggerPrice').value:quote()?.[side==='buy'?'ask':'bid']||0);}
function payload(){return {account_id:activeAccount,instrument:instrument(),side,kind:$('#orderKind').value,qty:String(quantity()),price:$('#entryPrice').value||null,trigger:$('#triggerPrice').value||null,stop:$('#stopPrice').value||null,target:$('#targetPrice').value||null,ttl_seconds:Number($('#timeInForce').value)};}

function updateTicket(){
 const q=quote(),a=account(),kind=$('#orderKind').value;$('#limitField').hidden=!['limit','stop_limit'].includes(kind);$('#triggerField').hidden=!['stop','stop_limit'].includes(kind);
 $('#entryPrice').required=!$('#limitField').hidden;$('#triggerPrice').required=!$('#triggerField').hidden;
 $('#entryPrice').disabled=$('#limitField').hidden;$('#triggerPrice').disabled=$('#triggerField').hidden;
 $('#sizeName').textContent=({units:'Quantity',cash:'Notional · USD',balance:'Balance · %',risk:'Risk · USD'})[$('#sizeMode').value];
 if($('#sizeMode').value==='balance')$('#quantity').max=100;else $('#quantity').removeAttribute('max');
 $('#ticketInstrument').textContent=instrument().toUpperCase()+' · '+(a?.name||'Choose account')+' · PAPER';
 $('#sideBuy').classList.toggle('selected',side==='buy');$('#sideSell').classList.toggle('selected',side==='sell');$('#sideBuy').setAttribute('aria-pressed',side==='buy');$('#sideSell').setAttribute('aria-pressed',side==='sell');
 const px=entryReference(),qty=quantity(),risk=$('#stopPrice').value?Math.abs(px-Number($('#stopPrice').value))*qty:null,reward=$('#targetPrice').value?Math.abs(Number($('#targetPrice').value)-px)*qty:null;
 $('#ticketSummary').innerHTML=`<dt>Estimated quantity</dt><dd>${Number.isFinite(qty)?fmt(qty):'Set a valid stop'}</dd><dt>Notional</dt><dd>${usd(Number.isFinite(qty)?qty*px:0)}</dd><dt>Commission / side</dt><dd>${usd(qty*px*Number(a?.fee_bps||0)/10000)}</dd><dt>Stop risk</dt><dd>${risk===null?'—':usd(risk)}</dd><dt>Reward / risk</dt><dd>${risk&&reward?number(reward/risk)+' R':'—'}</dd><dt>Price / size step</dt><dd>${q?fmt(q.tick)+' / '+fmt(q.qty_step):'Waiting for quote'}</dd>`;
 const replay=!!ws?.replay?.state?.active;
 $('#submitOrder').disabled=busy||!a||!q||q.age>15||replay;
 $('#submitOrder').textContent=replay?'Trading disabled during chart replay':busy?'Submitting…':'Place paper '+(side==='buy'?'Buy':'Sell');
 for(const id of ['entryPrice','triggerPrice','stopPrice','targetPrice'])if(q){$('#'+id).step=q.tick;$('#'+id).min=q.tick;}
 if(q){$('#bid').textContent=fmt(q.bid);$('#ask').textContent=fmt(q.ask);$('#feedState').textContent=(q.age>15?'STALE':'PUBLIC QUOTE')+' · '+number(q.age,0)+'s · '+q.transport;}
 else{$('#bid').textContent=$('#ask').textContent='—';$('#feedState').textContent='Server quote unavailable';}
 $('#instrumentLabel').textContent=instrument().toUpperCase();
}

function setSide(next){side=next;draft=true;commandKey=null;updateTicket();}
function stage(nextSide,kind='market',price){
 if(ws.replay.state.active)return toast('Exit chart replay before staging a paper order.',true);
 side=nextSide;$('#orderKind').value=kind;if(price){$('#entryPrice').value=snap(price);$('#triggerPrice').value=snap(price);}
 else if(kind!=='market'){$('#entryPrice').value=snap(entryReference()||quote()?.last);$('#triggerPrice').value=snap(quote()?.last);}
 draft=true;commandKey=null;$('#orderError').textContent='';document.body.classList.remove('rail-hidden');$('#tradeButton').setAttribute('aria-expanded','true');updateTicket();
}
$('#sideBuy').onclick=()=>setSide('buy');$('#sideSell').onclick=()=>setSide('sell');
$('#quickBuy').onclick=()=>stage('buy');$('#quickSell').onclick=()=>stage('sell');
$('#orderForm').oninput=()=>{draft=true;commandKey=null;updateTicket();};
$('#orderKind').onchange=()=>{if(!$('#entryPrice').value)$('#entryPrice').value=snap(quote()?.last||0);if(!$('#triggerPrice').value)$('#triggerPrice').value=snap(quote()?.last||0);updateTicket();};
$('#orderForm').onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 if(ws.replay.state.active)return toast('Paper orders are disabled during chart replay.',true);
 const p=payload();if(!Number.isFinite(Number(p.qty))||Number(p.qty)<=0){$('#orderError').textContent='Set a valid quantity and stop for risk sizing.';return;}
 busy=true;commandKey ||= crypto.randomUUID();$('#orderError').textContent='';updateTicket();
 try{await command('order',p,commandKey);draft=false;commandKey=null;toast('Paper order accepted by The Desk.');setPanel('orders');}
 catch(e){$('#orderError').textContent=e.message;}
 finally{busy=false;updateTicket();}
};
$('#discardDraft').onclick=()=>{draft=false;commandKey=null;$('#orderError').textContent='';toast('Order projection discarded.');};
$('#tradeButton').onclick=()=>{document.body.classList.toggle('rail-hidden');$('#tradeButton').setAttribute('aria-expanded',!document.body.classList.contains('rail-hidden'));ws.cells().forEach(c=>c.chart.resize());};

function showDialog(title,body,submit){
 dialogKey=crypto.randomUUID();
 $('#dialogBody').innerHTML=`<h2>${esc(title)}</h2><form id="dialogForm">${body}<p class="error" role="alert" id="dialogError"></p><div class="dialog-actions"><button type="button" id="dialogCancel">Cancel</button>${submit?'<button class="primary" type="submit">Confirm</button>':''}</div></form>`;
 $('#dialogCancel').onclick=()=>$('#dialog').close();
 $('#dialogForm').oninput=()=>{dialogKey=crypto.randomUUID();};
 $('#dialogForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;if(b)b.disabled=true;try{await submit(new FormData(e.target));$('#dialog').close();}catch(err){$('#dialogError').textContent=err.message;}finally{if(b)b.disabled=false;}};
 $('#dialog').showModal();
}
$('#addAccount').onclick=()=>showDialog('Create paper account',`<label>Account name<input name="name" value="My paper account" required maxlength="80"></label><div class="two-col"><label>Starting capital · USD<input name="capital" type="number" min="1" max="1000000000" value="10000" required></label><label>Commission · bps / side<input name="fee_bps" type="number" min="0" max="1000" step="any" value="5" required></label></div><label>Perpetual paper leverage<select name="leverage"><option>1</option><option>2</option><option>5</option><option>10</option><option>20</option></select></label><p class="muted small">Separate virtual capital and ledger. Coinbase spot uses owned inventory; Hyperliquid supports paper longs and shorts.</p>`,async fd=>{const a=await command('account',Object.fromEntries(fd));activeAccount=a.id;localStorage.setItem('the-desk.account',activeAccount);draft=false;await refresh();toast('Paper account created and queued for Lux Journal.');});
$('#accountSelect').onchange=async e=>{activeAccount=e.target.value;localStorage.setItem('the-desk.account',activeAccount);draft=false;commandKey=null;await refresh();};

function drawWatch(){
 $('#watchlist').innerHTML=instruments.map(i=>{const q=state?.quotes[i];return `<button class="watch-row ${i===instrument()?'active':''}" data-instrument="${esc(i)}"><span><span class="ticker">${esc(i.split(':')[1].replace('-USD',''))}</span><br><small>${i.startsWith('coinbase')?'COINBASE · SPOT':'HYPERLIQUID · PERP'}</small></span><span class="watch-value">${q?number(q.last):'—'}</span><span class="muted small">${q&&q.age<15?'●':'○'}</span></button>`;}).join('');
 $('#watchlist').querySelectorAll('button').forEach(b=>b.onclick=async()=>{draft=false;commandKey=null;try{await ws.chart.setMarket({symbol:b.dataset.instrument});updateTicket();drawWatch();}catch(e){toast(e.message,true);}});
}
function drawDOM(){
 const q=quote(),b=q?.book;if(!b){$('#domBook').innerHTML='<div class="empty">Order book unavailable for this instrument.</div>';return;}
 const rows=(list,kind)=>list.slice(0,10).map(r=>`<button class="dom-row ${kind}" data-price="${esc(r.price)}" data-side="${kind==='bid'?'buy':'sell'}"><span>${kind==='bid'?fmt(r.qty):''}</span><span>${fmt(r.price)}</span><span>${kind==='ask'?fmt(r.qty):''}</span></button>`).join('');
 $('#domBook').innerHTML='<div class="dom-labels"><span>BID SIZE</span><span>PRICE</span><span>ASK SIZE</span></div>'+rows([...b.asks.slice(0,10)].reverse(),'ask')+`<div class="empty" style="padding:5px">Spread ${fmt(Number(q.ask)-Number(q.bid))} · ${number(q.age,0)}s</div>`+rows(b.bids,'bid');
 $('#domBook').querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>stage(b.dataset.side,'limit',Number(b.dataset.price)));
}
document.querySelectorAll('[data-rail]').forEach(b=>b.onclick=()=>{rail=b.dataset.rail;$('#watchPanel').hidden=rail!=='watch';$('#domPanel').hidden=rail!=='dom';document.querySelectorAll('[data-rail]').forEach(x=>x.classList.toggle('active',x===b));drawDOM();});
$('#domCenter').onclick=drawDOM;

function setPanel(next){
 panel=next;document.querySelectorAll('[data-panel]').forEach(b=>{b.classList.toggle('active',b.dataset.panel===next);b.setAttribute('aria-selected',b.dataset.panel===next);});document.body.classList.toggle('journal-expanded',next==='journal');renderManager();ws?.cells().forEach(c=>c.chart.resize());
}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
$('#managerSize').onclick=()=>{document.body.classList.toggle('manager-expanded');ws.cells().forEach(c=>c.chart.resize());};
function empty(title,subtitle){return `<div class="empty"><strong>${esc(title)}</strong>${esc(subtitle)}</div>`;}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;}
function instrumentShort(i){return i.toUpperCase();}
function renderManager(){
 if(!state)return;
 const host=$('#managerContent');
 if(panel==='journal'){
   const url=state.journal_url+'/?'+new URLSearchParams({...(state.journal.account_id?{accounts:state.journal.account_id}:{}),range:'all'});
   if(!host.querySelector('iframe'))host.innerHTML=`<div class="journal-toolbar"><span>Existing LuxAlgo Trade Journal</span><a id="fullJournal" target="_blank" rel="noopener">Open full journal ↗</a><button id="refreshJournal">Refresh journal</button><button id="retryJournal">Retry pending delivery</button><span id="journalDelivery" class="muted"></span></div><iframe class="journal-frame" title="LuxAlgo Trade Journal"></iframe>`;
   const frame=host.querySelector('iframe');if(frame.dataset.accountUrl!==url){frame.src=url;frame.dataset.accountUrl=url;}
   $('#fullJournal').href=url;$('#journalDelivery').textContent=state.journal.pending+' pending · '+state.journal.delivered+' delivered';
   $('#refreshJournal').onclick=()=>{frame.src=url;};
   if($('#retryJournal'))$('#retryJournal').onclick=async()=>{await api('/api/journal/retry',{});toast('Pending journal events queued for retry.');};return;
 }
 if(panel==='strategy'){if(!host.querySelector('#strategyForm'))renderStrategy();return;}
 if(panel==='positions'){
  const rows=state.positions.map(p=>{const q=state.quotes[p.instrument],mark=Number(q?.[p.side==='buy'?'bid':'ask']||p.entry),pnl=(mark-Number(p.entry))*Number(p.qty)*(p.side==='buy'?1:-1);return `<tr><td>${esc(instrumentShort(p.instrument))}</td><td class="${p.side==='buy'?'positive':'negative'}">${p.side==='buy'?'Long':'Short'}</td><td>${fmt(p.qty)}</td><td>${fmt(p.entry)}</td><td>${fmt(mark)}</td><td class="${pnl>=0?'positive':'negative'}">${usd(pnl)}</td><td>${p.stop?fmt(p.stop):'—'} / ${p.target?fmt(p.target):'—'}</td><td><button data-bracket="${p.id}">SL / TP</button><button data-close="${p.id}">Close</button><button data-reverse="${p.id}">Reverse</button></td></tr>`;});
  host.innerHTML=rows.length?table(['Instrument','Side','Quantity','Entry','Mark','Open P&L','SL / TP','Actions'],rows):empty('No open positions','Place a paper order from the chart, ticket or DOM.');
 }
 if(panel==='orders'){
  const rows=state.orders.map(o=>`<tr><td>${esc(instrumentShort(o.instrument))}</td><td>${o.side.toUpperCase()}</td><td>${esc(o.kind.replace('_',' '))}</td><td>${fmt(o.qty)}</td><td>${o.price?fmt(o.price):o.filled_price?fmt(o.filled_price):'Market'}</td><td>${o.trigger?fmt(o.trigger):'—'}</td><td>${esc(o.status)}</td><td>${['working','triggered'].includes(o.status)?`<button data-edit="${o.id}">Modify</button><button data-cancel="${o.id}">Cancel</button>`:'—'}</td></tr>`);
  host.innerHTML=rows.length?table(['Instrument','Side','Type','Quantity','Price','Trigger','Status','Actions'],rows):empty('No orders yet','Submitted paper orders and their accepted status appear here.');
 }
 if(panel==='fills'){
  host.innerHTML=state.fills.length?table(['Time','Instrument','Side','Quantity','Fill price','Fee','Realized gross','Reason'],state.fills.map(f=>`<tr><td>${esc(new Date(f.executed_at).toLocaleString())}</td><td>${esc(instrumentShort(f.instrument))}</td><td>${f.side.toUpperCase()}</td><td>${fmt(f.qty)}</td><td>${fmt(f.price)}</td><td>${usd(f.fee)}</td><td>${usd(f.realized)}</td><td>${esc(f.reason)}</td></tr>`)):empty('No executions','Accepted fills are stored here and sent to Lux Journal.');
 }
 if(panel==='events')host.innerHTML=state.events.length?table(['Time','Event','Detail'],state.events.map(e=>`<tr><td>${esc(new Date(e.created_at).toLocaleString())}</td><td>${esc(e.kind)}</td><td>${esc(JSON.parse(e.content).message||'Account event')}</td></tr>`)):empty('No events','Accepted account and order events appear here.');
 if(panel==='alerts')host.innerHTML=state.alerts.length?table(['Instrument','Condition','Price','Status','Actions'],state.alerts.map(a=>`<tr><td>${esc(a.instrument.toUpperCase())}</td><td>${a.condition}</td><td>${fmt(a.price)}</td><td>${a.status}</td><td><button data-alert-delete="${a.id}">Delete</button></td></tr>`)):empty('No alerts','Create an above/below price alert. Server evaluation continues with the browser closed.');
 host.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{const o=state.orders.find(x=>x.id===b.dataset.cancel);try{await command('cancel',{id:o.id,account_id:activeAccount,revision:o.revision});toast('Paper order cancelled.');}catch(e){toast(e.message,true);}});
 host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editOrder(state.orders.find(x=>x.id===b.dataset.edit)));
 host.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closePosition(state.positions.find(x=>x.id===b.dataset.close)));
 host.querySelectorAll('[data-bracket]').forEach(b=>b.onclick=()=>editBracket(state.positions.find(x=>x.id===b.dataset.bracket)));
 host.querySelectorAll('[data-reverse]').forEach(b=>b.onclick=()=>reversePosition(state.positions.find(x=>x.id===b.dataset.reverse)));
 host.querySelectorAll('[data-alert-delete]').forEach(b=>b.onclick=async()=>{try{await command('alert_delete',{id:b.dataset.alertDelete});}catch(e){toast(e.message,true);}});
 if(ws?.replay.state.active)host.querySelectorAll('[data-close],[data-reverse],[data-bracket],[data-edit],[data-cancel]').forEach(b=>b.disabled=true);
}
function levelInputs(item){return `<div class="two-col"><label>Limit price<input name="price" type="number" step="any" value="${esc(item.price||'')}" ${item.kind?.includes('limit')?'required':''}></label><label>Stop trigger<input name="trigger" type="number" step="any" value="${esc(item.trigger||'')}" ${item.kind?.includes('stop')?'required':''}></label></div><div class="two-col"><label>Stop loss<input name="stop" type="number" step="any" value="${esc(item.stop||'')}"></label><label>Take profit<input name="target" type="number" step="any" value="${esc(item.target||'')}"></label></div>`;}
function editOrder(o,changes={}){showDialog('Modify paper '+o.kind.replace('_',' '),`<p>${esc(o.instrument.toUpperCase())} · ${esc(account()?.name)}</p>${levelInputs({...o,...changes})}`,async fd=>{await command('amend',{id:o.id,account_id:o.account_id,revision:o.revision,...Object.fromEntries(fd)});toast('Paper amendment accepted.');});}
function editBracket(p,changes={}){showDialog('Position protection',`<p>${esc(p.instrument.toUpperCase())} · ${fmt(p.qty)} units · server-managed paper bracket</p><div class="two-col"><label>Stop loss<input name="stop" type="number" step="any" value="${esc(changes.stop??p.stop??'')}"></label><label>Take profit<input name="target" type="number" step="any" value="${esc(changes.target??p.target??'')}"></label></div>`,async fd=>{await command('bracket',{id:p.id,account_id:p.account_id,revision:p.revision,...Object.fromEntries(fd)});toast('Paper protection updated.');});}
function closePosition(p){showDialog('Close paper position',`<p>${esc(p.instrument.toUpperCase())} · ${p.side==='buy'?'Long':'Short'} · ${fmt(p.qty)} open</p><label>Quantity to close<input name="qty" type="number" min="0.00000001" step="any" max="${esc(p.qty)}" value="${esc(p.qty)}" required></label>`,async fd=>{await command('close',{id:p.id,account_id:p.account_id,revision:p.revision,qty:fd.get('qty')});toast('Paper exit accepted; journal event queued.');});}
function reversePosition(p){showDialog('Reverse paper position',`<p>Net ${esc(p.instrument.toUpperCase())} from ${p.side==='buy'?'long to short':'short to long'} using a market order of ${fmt(Number(p.qty)*2)} units.</p><p class="muted">The server closes the current exposure and opens the opposite remainder. Coinbase spot cannot become short.</p>`,async()=>{await command('order',{account_id:p.account_id,instrument:p.instrument,side:p.side==='buy'?'sell':'buy',kind:'market',qty:String(Number(p.qty)*2)});toast('Paper reversal accepted.');});}

$('#alertButton').onclick=()=>showDialog('Create price alert',`<p>${esc(instrument().toUpperCase())} · server evaluation</p><label>Condition<select name="condition"><option value="above">At or above</option><option value="below">At or below</option></select></label><label>Price<input name="price" type="number" min="0.00000001" step="any" value="${snap(quote()?.last||0)}" required></label><p class="muted small">One trigger. Browser closure does not stop evaluation; a missing feed pauses it.</p>`,async fd=>{await command('alert',{instrument:instrument(),...Object.fromEntries(fd)});setPanel('alerts');toast('Server price alert created.');});

async function renderStrategy(){
 $('#managerContent').innerHTML=`<form id="strategyForm" class="strategy-form"><label>Fast SMA<input name="fast" type="number" min="2" max="299" value="9"></label><label>Slow SMA<input name="slow" type="number" min="3" max="300" value="21"></label><label>Fee · bps / side<input name="fee" type="number" min="0" step="any" value="5"></label><button class="primary">Run study</button><span class="muted small">Long-only SMA · 1 unit · next-open fills · completed bars · no funding/slippage · historical simulation</span></form><div id="strategyOutput" class="empty">Run a reproducible study on the selected market. This MVP tester does not execute Pine scripts.</div>`;
 $('#strategyForm').onsubmit=async e=>{
  e.preventDefault();try{const fd=new FormData(e.target);const tf=canonicalTimeframe(ws.chart.market.timeframe);const data=await api('/api/bars?'+new URLSearchParams({instrument:instrument(),timeframe:tf,limit:'600'}));const secs=timeframeMs(tf);const bars=data.bars.filter(b=>b.time+secs<=data.as_of).map(b=>({...b,time:Math.floor(b.time/1000)}));if(bars.some((b,i)=>i&&b.time-bars[i-1].time!==secs/1000))throw Error('Provider history contains missing bars. Select another interval or retry; this study requires continuous completed bars.');const result=runSmaBacktest(bars,{fast:Number(fd.get('fast')),slow:Number(fd.get('slow')),feeBps:Number(fd.get('fee'))});$('#strategyOutput').className='';$('#strategyOutput').innerHTML=`<div class="strategy-results"><span><small>Completed bars</small><strong>${result.bars}</strong></span><span><small>Trades</small><strong>${result.trades.length}</strong></span><span><small>Net P&amp;L · 1 unit</small><strong>${usd(result.equity)}</strong></span><span><small>Realized drawdown</small><strong>${usd(result.maxDrawdown)}</strong></span><span><small>Study source</small><strong style="font-size:12px">${esc(data.instrument.toUpperCase())} · ${esc(tf)}</strong></span></div><p class="muted small" style="padding:0 16px">Completed cutoff ${esc(new Date(bars.at(-1).time*1000+secs).toISOString())} · ${esc(data.coverage)} · Open study position ${result.openPosition?'excluded from realized P&amp;L':'none'}</p>`+table(['Entry UTC','Exit UTC','Entry','Exit','Gross','Fee','Net'],result.trades.map(t=>`<tr><td>${new Date(t.entryTime*1000).toISOString()}</td><td>${new Date(t.exitTime*1000).toISOString()}</td><td>${fmt(t.entry)}</td><td>${fmt(t.exit)}</td><td>${usd(t.gross)}</td><td>${usd(t.fee)}</td><td>${usd(t.pnl)}</td></tr>`));}catch(err){$('#strategyOutput').textContent=err.message;}
 };
}
function canonicalTimeframe(tf){const map={'1':'1m','3':'3m','5':'5m','15':'15m','30':'30m','60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d'};return map[String(tf)]||String(tf).toLowerCase();}
function timeframeMs(tf){return ({'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'2h':120,'4h':240,'1d':1440}[tf]||60)*60000;}

$('#replayButton').onclick=()=>{$('#replayBar').hidden=!$('#replayBar').hidden;if(!$('#replayStartTime').value)$('#replayStartTime').value=new Date(Date.now()-86400000).toISOString().slice(0,16);ws.cells().forEach(c=>c.chart.resize());};
$('#startReplay').onclick=async()=>{try{draft=false;await ws.replay.start({from:Date.parse($('#replayStartTime').value+'Z')});updateTicket();toast('Chart replay started. New submissions disabled; server orders continue on current quotes.');}catch(e){toast(e.message,true);}};
$('#stepReplay').onclick=()=>{ws.replay.step();replayUpdate();};$('#playReplay').onclick=()=>{ws.replay.play(600);replayUpdate();};$('#pauseReplay').onclick=()=>{ws.replay.pause();replayUpdate();};$('#stopReplay').onclick=()=>{ws.replay.stop();replayUpdate();updateTicket();};
function replayUpdate(){const r=ws?.replay.state;$('#replayState').textContent=r?.active?(r.playing?'Playing':'Paused')+' · '+r.remaining+' hidden bars':'Replay off';updateTicket();renderManager();}

async function saveSettings(values){await api('/api/settings',values);Object.assign(settings,values);}
$('#saveWorkspace').onclick=async()=>{try{await saveSettings({workspace:ws.getState()});$('#saveStatus').textContent='Saved to this computer';toast('Workspace saved, including drawings and indicator settings.');}catch(e){toast(e.message,true);}};
$('#templatesButton').onclick=()=>{
 showDialog('Chart templates',`<label>Template name<input name="name" value="My layout" required maxlength="80"></label>${templates.map((t,i)=>`<div class="template-row"><span>${esc(t.name)}</span><button type="button" data-load-template="${i}">Load</button></div>`).join('')}`,async fd=>{templates=templates.filter(t=>t.name!==fd.get('name'));templates.push({name:fd.get('name'),state:ws.getState()});await saveSettings({presets:templates});toast('Complete chart template saved.');});
 $('#dialogBody').querySelectorAll('[data-load-template]').forEach(b=>b.onclick=async()=>{try{await ws.applyState(templates[Number(b.dataset.loadTemplate)].state);$('#dialog').close();toast('Chart template restored.');}catch(e){$('#dialogError').textContent=e.message;}});
};
$('#themeButton').onclick=async()=>{const light=!document.body.classList.contains('light');document.body.classList.toggle('light',light);ws.setTheme(light?'light':'dark');await saveSettings({appearance:{theme:light?'light':'dark'}});};
$('#journalButton').onclick=()=>setPanel('journal');
$('#exportAccount').onclick=async()=>{try{const data=await api('/api/export?account_id='+encodeURIComponent(activeAccount));const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='The-Desk-PAPER-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);}catch(e){toast(e.message,true);}};

async function refresh(){
 if(polling)return;polling=true;
 try{
  state=await api('/api/state?account_id='+encodeURIComponent(activeAccount||''));activeAccount=state.active_account;const options=state.accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===activeAccount?'selected':''}>${esc(a.name)} · PAPER</option>`).join('');if($('#accountSelect').innerHTML!==options)$('#accountSelect').innerHTML=options;
  const a=account();for(const [id,key] of [['balance','balance'],['equity','equity'],['unrealized','unrealized'],['buyingPower','buying_power']])$('#'+id).textContent=usd(a?.[key]);$('#unrealized').className=Number(a?.unrealized)>=0?'positive':'negative';
  $('#positionCount').textContent=state.positions.length;$('#orderCount').textContent=state.orders.filter(o=>['working','triggered'].includes(o.status)).length;
  $('#journalBadge').textContent=state.journal.pending?state.journal.pending+' queued':'synced';$('#journalStatus').textContent='Lux Journal '+(state.journal_available?'connected':'unavailable')+' · '+state.journal.pending+' queued / '+state.journal.delivered+' delivered';
  $('#healthDot').className='status-dot ok';$('#healthText').textContent='The Desk · server connected';updateTicket();drawWatch();if(rail==='dom')drawDOM();renderManager();
  const alerts=state.events.filter(e=>e.kind==='alert');if(refresh.lastAlert&&alerts.length&&alerts[0].id>refresh.lastAlert)toast(JSON.parse(alerts[0].content).message);if(alerts.length)refresh.lastAlert=alerts[0].id;
 }catch(e){$('#healthDot').className='status-dot';$('#healthText').textContent='Server disconnected';$('#submitOrder').disabled=true;}
 finally{polling=false;}
}

const overlayNodes=new Map();let dragging=null;
function attachChart(cell){
 if(cell.deskAttached)return;cell.deskAttached=true;
 const c=cell.chart;
 c.on('market:changed',()=>{draft=false;commandKey=null;updateTicket();drawWatch();});
 c.ready().then(()=>{
  const native=c.renderer.renderer;if(!native?.plot)return;
  const overlay=document.createElement('div');overlay.className='trade-overlay';native.plot.append(overlay);overlayNodes.set(cell.id,{overlay,nodes:new Map(),native});
  native.plot.addEventListener('contextmenu',e=>{
    if(e.target.closest('.trade-line'))return;
    const pane=native.scene.panes.get('price'),rect=native.plot.getBoundingClientRect();if(!pane)return;
    menuPrice=native.coords.yToPrice(e.clientY-rect.top,pane.scale,pane.bounds);if(!Number.isFinite(menuPrice)||menuPrice<=0)return;
    e.preventDefault();e.stopImmediatePropagation();ws.setActiveCell(cell.id);
    $('#chartMenu').innerHTML=`<button data-menu-side="buy">Buy limit at ${fmt(snap(menuPrice))} · PAPER</button><button data-menu-side="sell">Sell limit at ${fmt(snap(menuPrice))} · PAPER</button><button id="menuAlert">Create alert at ${fmt(snap(menuPrice))}</button>`;
    $('#chartMenu').hidden=false;$('#chartMenu').style.left=Math.min(e.clientX,window.innerWidth-260)+'px';$('#chartMenu').style.top=Math.min(e.clientY,window.innerHeight-140)+'px';
    $('#chartMenu').querySelectorAll('[data-menu-side]').forEach(b=>b.onclick=()=>{stage(b.dataset.menuSide,'limit',menuPrice);$('#chartMenu').hidden=true;});$('#menuAlert').onclick=()=>{$('#chartMenu').hidden=true;$('#alertButton').click();$('#dialogBody input[name=price]').value=snap(menuPrice);};
  },true);
 }).catch(e=>toast('Chart initialization: '+e.message,true));
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#chartMenu'))$('#chartMenu').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#chartMenu').hidden=true;draft=false;}});
function overlayFrame(){
 if(ws&&state){
  for(const cell of ws.cells()){
   const wrap=overlayNodes.get(cell.id);if(!wrap)continue;
   const {overlay,nodes,native}=wrap,pane=native.scene?.panes.get('price');if(!pane)continue;
   const symbol=String(cell.chart.market.symbol).toLowerCase();const matches=i=>i.toLowerCase()===symbol;
   const levels=[];
   if(!ws.replay.state.active){
    for(const o of state.orders.filter(x=>matches(x.instrument)&&['working','triggered'].includes(x.status))){for(const [field,label,color] of [['price','LIMIT','#5b9bff'],['trigger','TRIGGER','#e3b75d'],['stop','SL','#f23645'],['target','TP','#089981']])if(o[field])levels.push({key:o.id+field,item:o,field,price:Number(o[field]),label:label+' '+fmt(o.qty),color,kind:'order'});}
    for(const p of state.positions.filter(x=>matches(x.instrument))){for(const [field,label,color] of [['entry','POSITION','#5b9bff'],['stop','SL','#f23645'],['target','TP','#089981']])if(p[field])levels.push({key:p.id+field,item:p,field,price:Number(p[field]),label:label+' '+fmt(p.qty),color,kind:'position'});}
   }
   if(draft&&cell.id===ws.active.id&&!ws.replay.state.active){for(const [field,label,color,val] of [['entry','DRAFT','#aeb9d0',entryReference()],['stop','DRAFT SL','#f23645',$('#stopPrice').value],['target','DRAFT TP','#089981',$('#targetPrice').value]])if(Number(val)>0)levels.push({key:'draft'+field,field,price:Number(val),label,color,kind:'draft'});}
   const live=new Set(levels.map(l=>l.key));for(const [key,node] of nodes)if(!live.has(key)&&dragging?.node!==node){node.remove();nodes.delete(key);}
   for(const level of levels){
    let node=nodes.get(level.key);if(!node){node=document.createElement('div');node.className='trade-line';node.innerHTML='<button></button>';overlay.append(node);nodes.set(level.key,node);
     node.querySelector('button').onpointerdown=e=>{const l=node.level;if(e.button!==0||l.kind==='position'&&l.field==='entry')return;e.preventDefault();e.stopPropagation();dragging={node,level:l,startY:e.clientY,startPrice:l.price,price:l.price,native,pane};e.target.setPointerCapture(e.pointerId);};
     node.querySelector('button').onpointermove=e=>{if(dragging?.node!==node)return;const d=dragging;d.price=snap(d.native.coords.yToPrice(d.native.coords.priceToY(d.startPrice,d.pane.scale,d.pane.bounds)+e.clientY-d.startY,d.pane.scale,d.pane.bounds));node.style.top=d.native.coords.priceToY(d.price,d.pane.scale,d.pane.bounds)+'px';e.target.textContent='Release to review '+fmt(d.price);};
     node.querySelector('button').onpointerup=e=>{if(dragging?.node!==node)return;const d=dragging;dragging=null;if(Math.abs(e.clientY-d.startY)<3){if(d.level.kind==='order')editOrder(d.level.item);return;}if(d.level.kind==='draft'){$('#'+({entry:'entryPrice',stop:'stopPrice',target:'targetPrice'}[d.level.field])).value=d.price;if(d.level.field==='entry')$('#orderKind').value='limit';updateTicket();}else if(d.level.kind==='order')editOrder(d.level.item,{[d.level.field]:String(d.price)});else editBracket(d.level.item,{[d.level.field]:String(d.price)});};
     node.querySelector('button').onpointercancel=()=>{dragging=null;};
     node.querySelector('button').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(node.level.kind==='order')editOrder(node.level.item);else if(node.level.kind==='position')editBracket(node.level.item);}};
    }
    node.level=level;if(dragging?.node===node)continue;const y=native.coords.priceToY(level.price,pane.scale,pane.bounds);node.style.display=Number.isFinite(y)&&y>pane.bounds.top&&y<pane.bounds.top+pane.bounds.height?'':'none';node.style.top=y+'px';node.style.setProperty('--level',level.color);node.classList.toggle('draft',level.kind==='draft');node.querySelector('button').textContent=level.label+' · '+fmt(level.price);node.querySelector('button').setAttribute('aria-label',level.label+' at '+fmt(level.price)+'. Drag to modify or press Enter to edit.');
   }
  }
 }
 requestAnimationFrame(overlayFrame);
}

async function boot(){
 try{settings=await api('/api/settings');templates=Array.isArray(settings.presets)?settings.presets:[];
  const theme=settings.appearance?.theme||'dark';document.body.classList.toggle('light',theme==='light');
  ws=new VelaWorkspace('#workspace',{layout:'1',symbol:'hyperliquid:BTC',timeframe:'60',bars:600,providers:{coinbase:()=>new CoinbaseProvider(),hyperliquid:()=>new HyperliquidProvider()},live:true,theme,volume:true,nativeBackend:'canvas2d',upColor:'#089981',downColor:'#f23645',drawings:true,timeframes:['1','3','5','15','30','60','240','D'],persist:'the-desk.workspace.v1',storage:{get:()=>settings.workspace?JSON.stringify(settings.workspace):null,set:async(_,value)=>{try{$('#saveStatus').textContent='Saving…';await saveSettings({workspace:JSON.parse(value)});$('#saveStatus').textContent='All changes saved';}catch(e){$('#saveStatus').textContent='Save failed · retry';}}},topbar:{left:['symbol','timeframes','style','indicators','layout','undo-redo'],right:['panels','screenshot','alerts']}});
  ws.cells().forEach(attachChart);ws.on('cell:created',()=>ws.cells().forEach(attachChart));ws.on('cell:active',()=>{draft=false;commandKey=null;updateTicket();drawWatch();});ws.on('cell:destroyed',()=>{for(const [id,v] of overlayNodes)if(!ws.cells().some(c=>c.id===id)){v.overlay.remove();overlayNodes.delete(id);}});ws.replay.on('replay:step',replayUpdate);ws.replay.on('replay:end',replayUpdate);
  await refresh();setInterval(refresh,2000);setInterval(()=>$('#clock').textContent=new Date().toLocaleTimeString('en-US',{timeZone:'UTC'})+' UTC',1000);overlayFrame();
  Promise.allSettled(ws.cells().map(c=>c.chart.ready())).then(()=>{if($('#saveStatus').textContent==='Loading workspace…')$('#saveStatus').textContent='Workspace restored';});
  if(window.innerWidth<700){document.body.classList.add('rail-hidden');$('#tradeButton').setAttribute('aria-expanded','false');}
 }catch(e){$('#saveStatus').textContent='Initialization failed';toast(e.message,true);}
}
boot();

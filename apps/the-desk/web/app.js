import {createTradingActions,acknowledgeTradingResult} from './trading-actions.mjs';
import {setupSwingTracker} from './swing-tracker.mjs';
import {DurableSettings} from './durable-settings.mjs';
import {stripSpiderDrawings} from './spider-model.mjs';
import {setupSpider} from './spider-ui.mjs';
import {SpiderIntervalProvider,BinanceProvider} from './spider-provider.mjs';
import {DeskHyperliquidProvider} from './hyperliquid-provider.mjs';
import {VelaWorkspace,CoinbaseProvider,HyperliquidProvider} from './vendor/vela.js';
import {IBKRProvider,isIBKR,ibkrLabel} from './ibkr-provider.mjs';
import {marketIdentity,tradingConfig,tradingDefaults,positionMetrics,positionPnlIncrement,formatMoney} from './trading-model.mjs';
import {setupDOMTrader} from './dom-trader.mjs';
import {setupChartTrader} from './chart-trader.mjs';
import {starterBracket,moveDraftBracket,draftTradingLevels} from './chart-bracket-model.mjs';
import {buildChartMenuActions} from './chart-menu-actions.mjs';
import {setupDOM} from './dom-view.mjs';
import {runSmaBacktest} from './sma-backtest.mjs';
import {upgradeLiquidityWorkspace} from './liquidity-catalog-upgrade.mjs';
import {setupChartAccount} from './chart-account.mjs';
import {RobinhoodProvider,brokerMoney} from './account-context.mjs';
import {setupPineEditor,loadPineLibrary,createPineEngine} from './pine-editor.mjs';

const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=2)=>Number(v??0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=v=>Number.isFinite(Number(v))?'$'+number(v):'—', fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:8});
let brokerContext=null,brokerScope='';
let state=null,ws=null,activeAccount=localStorage.getItem('the-desk.account'),panel='positions',rail='watch',side='buy',draft=false,busy=false,settings={},templates=[],polling=false,refreshQueued=false,contextKey='',menuPrice=null;
const instruments=['hyperliquid:BTC','hyperliquid:ETH','hyperliquid:SOL','coinbase:BTC-USD','coinbase:ETH-USD','coinbase:SOL-USD'];

async function api(path,payload,headers={}){
 const response=await fetch(path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 const result=await response.json();if(!response.ok){const error=Error(result.error||'Service unavailable');error.status=response.status;throw error;}return result;
}
function toast(text,error=false){$('#toast').textContent=text;$('#toast').classList.add('visible');$('#toast').style.borderColor=error?'#f23645':'#525d73';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
let tradingGeneration=0;
const tradingActions=createTradingActions({onPending:()=>renderManager(),accountId:()=>activeAccount,replay:()=>!!ws?.replay.state.active,send:async(action,payload,key)=>{
 if(brokerContext?.selected)throw Error('Robinhood selected. Paper ledger actions are unavailable; use the broker workspace.');
 const result=await api('/api/command',{action,payload},{'Idempotency-Key':key});
 tradingGeneration++;acknowledgeTradingResult(state,action,payload,result);renderManager();
 // Ledger acknowledgement completes the action; unrelated health/poll requests
 // cannot hold a chart click or a dialog open after the command succeeded.
 void refresh();return result;
}});
function command(action,payload){return tradingActions.run(action,payload);}
async function instantAction(action,payload,message){
 try{await command(action,payload);toast(message);}catch(error){toast(error.message,true);void refresh();}
}
function instrument(){return marketIdentity(ws?.chart);}
function tradeConfig(){return tradingConfig(settings.trading);}
function stageTrade(next,kind='market',price){if(busy)return;stage(next,kind,price);if(!brokerContext?.selected&&tradeConfig().instant&&!ws.replay.state.active)$('#orderForm').requestSubmit();}
function stageChartTrade(next,kind='limit',price){
 if(busy)return;stage(next,kind,price);if(!draft||ws.replay.state.active)return;
 if(brokerContext?.selected){reviewChartOrder();return;}
 if(tradeConfig().instant){$('#orderForm').requestSubmit();return;}
 const q=quote();if(!q)return;
 const native=ws.chart.renderer.renderer,pane=native?.scene?.panes.get('price'),entry=entryReference();
 const y=pane?native.coords.priceToY(entry,pane.scale,pane.bounds):null;
 const distance=Number.isFinite(y)?Math.abs(entry-native.coords.yToPrice(y+40,pane.scale,pane.bounds)):undefined;
 const levels=starterBracket({entry,side,tick:q.tick,stop:$('#stopPrice').value,target:$('#targetPrice').value,distance});
 for(const field of ['stop','target'])if(levels[field])$('#'+field+'Price').value=levels[field];
 updateTicket();reviewChartOrder();
}
function reviewChartOrder(){
 if(brokerContext?.selected){$('#orderForm').requestSubmit();return;}
 if(!draft||ws.replay.state.active||$('#orderKind').value!=='limit')return;
 if(tradeConfig().instant){$('#orderForm').requestSubmit();return;}
 const p=payload(),scope={account:activeAccount,instrument:instrument()},a=account();
 showDialog('Place paper '+p.side+' '+p.kind,
  `<p>${esc(p.instrument)} · ${esc(a?.name)} · PAPER</p><p class="muted">This is a draft. Confirm placement to create a working order.</p>`+
  `<label>Quantity<input name="qty" type="number" min="0" step="any" value="${esc(p.qty)}" required></label>`+
  `<label>Limit price<input name="price" type="number" min="0" step="any" value="${esc(p.price)}" required></label>`+
  `<div class="two-col"><label>Stop loss<input name="stop" type="number" min="0" step="any" value="${esc(p.stop||'')}"></label><label>Take profit<input name="target" type="number" min="0" step="any" value="${esc(p.target||'')}"></label></div>`,async fd=>{
   if(scope.account!==activeAccount||scope.instrument!==instrument()||ws.replay.state.active)throw Error('Account or chart changed. Review the order again.');
   const result=await command('order',{...p,...Object.fromEntries(fd)});
   if(!['working','filled','triggered'].includes(result.status))throw Error('Order was not accepted. Refresh the ledger.');
   $('#sizeMode').value='units';$('#quantity').value=fd.get('qty');
   for(const [key,id] of [['price','entryPrice'],['stop','stopPrice'],['target','targetPrice']])$('#'+id).value=fd.get(key)||'';
   draft=false;updateTicket();setPanel(result.status==='filled'?'positions':'orders');
   toast(result.status==='filled'?'Paper order filled.':'Paper '+p.side+' limit accepted · WORKING.');
  },{submitLabel:'Place paper '+p.side+' limit',cancelLabel:'Edit on chart'});
}
// Explicit chart-to-agent handoff. This never calls the paper command or a broker order tool.
async function captureShadowIntent(){
 const button=$('#shadowAgentButton');button.disabled=true;
 try{
  if(brokerContext?.selected)throw Error('Agents supports paper-ticket shadow evaluation. Broker tickets currently support native review only.');
  if(!ws||ws.replay.state.active)throw Error('Exit chart replay before capturing a shadow ticket.');
  if($('#orderKind').value!=='limit')throw Error('Select a limit ticket with an exact price for shadow evaluation.');
  const p=payload(),tf=canonicalTimeframe(ws.chart.market.timeframe),q=quote();
  if(!q||q.age>15)throw Error('A fresh chart quote is required.');
  if(!Number.isFinite(Number(p.qty))||Number(p.qty)<=0||!p.price)throw Error('Set a positive quantity and limit price.');
  const data=await api('/api/bars?'+new URLSearchParams({instrument:p.instrument,timeframe:tf,limit:'50'}));
  if(p.account_id!==activeAccount||p.instrument!==instrument()||tf!==canonicalTimeframe(ws.chart.market.timeframe)||ws.replay.state.active)throw Error('Chart or account changed. Capture the ticket again.');
  const ms=timeframeMs(tf),completed=data.bars.filter(b=>b.time+ms<=data.as_of);
  if(!completed.length)throw Error('No completed provider bar is available for the chart cutoff.');
  const intent={chartInstrument:p.instrument,timeframe:tf,completedBarCutoff:new Date(completed.at(-1).time+ms).toISOString(),chartObservedAt:new Date(q.received_at*1000).toISOString(),replay:false,side:p.side,kind:'limit',quantity:p.qty,limitPrice:p.price,stopPrice:p.stop,targetPrice:p.target,paperAccountId:p.account_id};
  window.dispatchEvent(new CustomEvent('desk:shadow-chart-intent',{detail:intent}));
 }catch(e){toast(e.message,true);}finally{button.disabled=false;}
}
$('#shadowAgentButton').onclick=()=>window.dispatchEvent(new CustomEvent('desk:open-agents'));
window.addEventListener('desk:request-shadow-chart',captureShadowIntent);
function account(){return brokerContext?.selected?{id:'rh:'+brokerContext.selected,name:brokerContext.account()?.name||'Robinhood',balance:brokerContext.metrics[brokerContext.asset?.kind==='crypto'?'cryptoBuyingPower':'buyingPower']}:state?.accounts.find(a=>a.id===activeAccount);}
function quote(){if(readonlyMarket())return undefined;return brokerContext?.selected?brokerContext.quote():state?.quotes[instrument()];}
function chartTradingState(){if(!brokerContext?.selected)return state;return {...state,active_account:'rh:'+brokerContext.selected,tradingMode:'ROBINHOOD · REVIEW',positions:[],orders:[],fills:[],quotes:quote()?{[instrument()]:quote()}: {}};}
let ibkrStatus=null;
const readonlyMarket=()=>isIBKR(instrument());
const ibkrProvider=new IBKRProvider({onStatus:s=>{ibkrStatus=s;if(ws)updateTicket();}});
let ibkrRefresh=null;
async function refreshIBKR(){if(ibkrRefresh)return ibkrRefresh;ibkrRefresh=(async()=>{try{ibkrStatus=await api('/api/ibkr/status');}catch{ibkrStatus={...ibkrStatus,connected:false,phase:'unavailable',quote:null,history_stale:true,message:'IBKR backend unavailable.'};}})();try{await ibkrRefresh;}finally{ibkrRefresh=null;}}
$('#ibkrButton').onclick=async()=>{
 await refreshIBKR();const s=ibkrStatus,c=s.contract;
 showDialog('IBKR futures data',`<p><strong>${esc(ibkrLabel(s))}</strong></p><p>${esc(s.message)}</p>`+
  (c?`<dl><dt>Contract</dt><dd>${esc(c.instrument)}</dd><dt>Exchange / expiry</dt><dd>${esc(c.exchange)} / ${esc(c.expiry)}</dd><dt>Tick / multiplier</dt><dd>${esc(c.tick)} / ${esc(c.multiplier)}</dd></dl>`:'')+
  `<p class="muted">Read-only MYM candles and quotes. Futures orders, depth and exchange holiday calendars are not enabled. Daily bars use standard session boundaries; holiday exceptions remain unverified.</p>`+
  (s.configured_mode==='demo'?`<p>These are invented prices, including weekend activity. No broker login, entitlement or real market connection is being tested.</p><button type="button" id="ibkrPause">${s.connected?'Pause demo feed':'Resume demo feed'}</button>`:
  `<p>Try without an account: start the isolated demo with <code>python3 server.py --port 18882 --data-dir /tmp/desk-ibkr-demo --no-workers --ibkr-mode demo</code>.</p><p>For Gateway setup, see <a href="/ibkr-setup.html" target="_blank" rel="noopener">IBKR connection instructions</a>. Credentials stay in IBKR's login window.</p>`),
  s.instrument?async()=>{await ws.chart.setMarket({symbol:s.instrument,timeframe:'1'});draft=false;updateTicket();drawWatch();drawDOM();}:null,{submitLabel:'Open MYM '+(s.configured_mode==='demo'?'demo ':'')+'chart',cancelLabel:'Close'});
 const pause=$('#ibkrPause');if(pause)pause.onclick=async()=>{try{ibkrStatus=await api('/api/ibkr/demo',{paused:!!ibkrStatus.connected});$('#dialog').close();$('#ibkrButton').click();updateTicket();}catch(e){toast(e.message,true);}};
} ;
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
 const broker=!!brokerContext?.selected,brokerLive=broker&&brokerContext.valid()&&brokerContext.account()?.tradable===true;
 const domButton=document.querySelector('[data-rail="dom"]');domButton.disabled=broker;domButton.title=broker?'Robinhood DOM routing is not enabled. Use the chart limit preview.':'Depth of market';
 if(broker&&rail==='dom')document.querySelector('[data-rail="watch"]').click();
 $('#balance').parentElement.firstChild.textContent=broker?'Cash ':'Balance ';$('#equity').parentElement.firstChild.textContent=broker?'Account value ':'Equity ';
 $('#ticketInstrument').textContent=broker?'ROBINHOOD · '+(brokerContext.asset?.symbol||'Select an asset')+' · '+(brokerContext.account()?.account||'disconnected')+' · chart '+instrument():instrument().toUpperCase()+' · '+(a?.name||'Choose account')+' · PAPER';
 document.querySelector('.desk-header .mode').textContent=broker?(brokerLive?'ROBINHOOD · LIVE':'ROBINHOOD · VERIFY'):'PAPER';document.querySelector('.ticket-heading .mode').textContent=broker?(brokerLive?'LIVE · PREVIEW':'READ ONLY'):'SIM';
 $('#exportAccount').disabled=broker;$('#journalBadge').hidden=broker;
 $('#shadowAgentButton').disabled=false;$('#shadowAgentButton').textContent='Open Agents';$('#brokerChartFeed').hidden=!broker||!brokerContext.asset;if(broker&&brokerContext.matches)$('#brokerChartFeed').value=instrument();
 $('#sideBuy').textContent=broker?'Buy':'Buy / Long';$('#sideSell').textContent=broker?'Sell owned':'Sell / Short';
 document.querySelector('.ticket > p.small').textContent=broker?'Robinhood crypto market / limit and equity limit orders. Robinhood supplies the execution preview; your final confirmation sends the live order. Chart prices are reference only.':'Public bid/ask and Hyperliquid limit-touch simulation. Full quantity modeled; no queue or funding model. Fees follow this account’s settings.';
 $('#sideBuy').classList.toggle('selected',side==='buy');$('#sideSell').classList.toggle('selected',side==='sell');$('#sideBuy').setAttribute('aria-pressed',side==='buy');$('#sideSell').setAttribute('aria-pressed',side==='sell');
 const px=entryReference(),qty=quantity(),risk=$('#stopPrice').value?Math.abs(px-Number($('#stopPrice').value))*qty:null,reward=$('#targetPrice').value?Math.abs(Number($('#targetPrice').value)-px)*qty:null;
 $('#ticketSummary').innerHTML=`<dt>Estimated quantity</dt><dd>${Number.isFinite(qty)?fmt(qty):'Set a valid stop'}</dd><dt>Notional</dt><dd>${usd(Number.isFinite(qty)?qty*px:0)}</dd><dt>Commission / side</dt><dd>${usd(qty*px*Number(a?.fee_bps||0)/10000)}</dd><dt>Stop risk</dt><dd>${risk===null?'—':usd(risk)}</dd><dt>Reward / risk</dt><dd>${risk&&reward?number(reward/risk)+' R':'—'}</dd><dt>Price / size step</dt><dd>${q?fmt(q.tick)+' / '+fmt(q.qty_step):'Waiting for quote'}</dd>`;
 $('#timeInForce').disabled=broker;$('#timeInForce').options[0].textContent=broker?'Good until cancelled · Robinhood':'Good until cancelled · SIM';
 if(broker)$('#timeInForce').value='0';
 const replay=!!ws?.replay?.state?.active;
 const rhTypeOkay=!broker||((brokerContext.asset?.kind==='crypto'&&['market','limit'].includes(kind))||(brokerContext.asset?.kind==='equity'&&kind==='limit'));
 const rhSizeOkay=!broker||($('#sizeMode').value==='cash'?brokerContext.asset?.kind==='crypto':$('#sizeMode').value==='units');
 $('#submitOrder').disabled=busy||!a||!q||q.age>15||replay||(broker&&(!brokerContext.valid()||!brokerContext.account()?.tradable||!brokerContext.matches||!brokerContext.asset?.eligible||!rhTypeOkay||!rhSizeOkay));
 $('#submitOrder').textContent=replay?'Trading disabled during chart replay':busy?'Submitting…':broker?(kind==='market'?'Preview Robinhood market '+(side==='buy'?'buy':'sell'):'Preview Robinhood '+(side==='buy'?'buy':'sell')):'Place paper '+(side==='buy'?'Buy':'Sell');
 for(const id of ['entryPrice','triggerPrice','stopPrice','targetPrice'])if(q){$('#'+id).step=q.tick;$('#'+id).min=q.tick;}
 if(q){$('#bid').textContent=fmt(q.bid);$('#ask').textContent=fmt(q.ask);$('#feedState').textContent=(q.age>15?'STALE':'PUBLIC QUOTE')+' · '+number(q.age,0)+'s · '+q.transport;}
 else{$('#bid').textContent=$('#ask').textContent='—';$('#feedState').textContent='Server quote unavailable';}
 if(broker){const cashMode=$('#sizeMode').value==='cash';$('#ticketSummary').innerHTML='<dt>Broker asset</dt><dd>'+esc(brokerContext.asset?.symbol||'Select an asset')+'</dd><dt>Broker buying power</dt><dd>'+brokerMoney(a?.balance)+'</dd><dt>Chart estimate</dt><dd>'+fmt(qty)+' units · '+brokerMoney(qty*px)+'</dd><dt>Robinhood execution</dt><dd>Fresh native preview required before final confirmation</dd><dt>Order routing</dt><dd>Selected account · '+(cashMode?'USD notional':'units')+'</dd><dt>Price / size step</dt><dd>'+esc(brokerContext.asset?.priceStep||'—')+' / '+esc(brokerContext.asset?.quantityStep||'—')+'</dd>';$('#feedState').textContent=brokerContext.asset?.symbol+' · Robinhood bid / ask '+(q?(q.age>15?'STALE':'')+' · '+number(q.age,0)+'s':'unavailable')+(instrument().startsWith('hyperliquid:')?' · chart: perpetual reference':instrument().startsWith('coinbase:')?' · chart: spot reference':' · chart: Robinhood');}
 $('#instrumentLabel').textContent=instrument().toUpperCase();
 const readOnly=readonlyMarket();$('#ibkrBanner').hidden=!readOnly;
 for(const cell of ws?.cells()||[]){const badge=cell.host.querySelector('.ibkr-cell-badge');if(badge){badge.hidden=!isIBKR(marketIdentity(cell.chart));badge.textContent=ibkrLabel(ibkrStatus);}}
 if(readOnly){
  const label=ibkrLabel(ibkrStatus),q=ibkrStatus?.instrument===instrument()?ibkrStatus?.quote:null;
  $('#ibkrBanner').textContent=label+' · '+instrument().toUpperCase()+' · '+(ibkrStatus?.history_stale?'History may be stale':'Recent intraday history; calendar unavailable');
  $('#feedState').textContent=label;$('#ticketInstrument').textContent=instrument().toUpperCase()+' · READ ONLY';
  $('#bid').textContent=q?.bid?fmt(q.bid):'—';$('#ask').textContent=q?.ask?fmt(q.ask):'—';
  $('#submitOrder').disabled=true;$('#submitOrder').textContent='Futures trading is not enabled';
  $('#ticketSummary').innerHTML='<dt>Access</dt><dd>Read-only data</dd><dt>Order routing</dt><dd>Disabled</dd>';
 }
 $('#quickBuy').disabled=$('#quickSell').disabled=readOnly;
 $('#sideBuy').disabled=$('#sideSell').disabled=readOnly;
 $('#alertButton').disabled=readOnly;

}

function setSide(next){side=next;draft=true;updateTicket();}
function stage(nextSide,kind='market',price){
 if(readonlyMarket())return toast('IBKR futures data is read-only. Orders are disabled.',true);
 if(ws.replay.state.active)return toast('Exit chart replay before staging a paper order.',true);
 side=nextSide;$('#orderKind').value=kind;if(price){$('#entryPrice').value=snap(price);$('#triggerPrice').value=snap(price);}
 else if(kind!=='market'){$('#entryPrice').value=snap(entryReference()||quote()?.last);$('#triggerPrice').value=snap(quote()?.last);}
 draft=true;$('#orderError').textContent='';document.body.classList.remove('rail-hidden');$('#tradeButton').setAttribute('aria-expanded','true');updateTicket();
}
$('#sideBuy').onclick=()=>setSide('buy');$('#sideSell').onclick=()=>setSide('sell');
$('#quickBuy').onclick=()=>stageTrade('buy');$('#quickSell').onclick=()=>stageTrade('sell');
$('#orderForm').oninput=()=>{draft=true;updateTicket();};
$('#orderKind').onchange=()=>{if(!$('#entryPrice').value)$('#entryPrice').value=snap(quote()?.last||0);if(!$('#triggerPrice').value)$('#triggerPrice').value=snap(quote()?.last||0);updateTicket();};
$('#orderForm').onsubmit=async e=>{
 e.preventDefault();if(readonlyMarket())return toast('IBKR futures data is read-only.',true);if(busy)return;
 if(ws.replay.state.active)return toast('Paper orders are disabled during chart replay.',true);
 if(brokerContext?.selected){await reviewBrokerTicket();return;}
 const p=payload();if(!Number.isFinite(Number(p.qty))||Number(p.qty)<=0){$('#orderError').textContent='Set a valid quantity and stop for risk sizing.';return;}
 busy=true;$('#orderError').textContent='';updateTicket();
 try{await command('order',p);draft=false;toast('Paper order accepted by The Desk.');setPanel('orders');}
 catch(e){$('#orderError').textContent=e.message;}
 finally{busy=false;updateTicket();}
};
$('#discardDraft').onclick=()=>{draft=false;$('#orderError').textContent='';toast('Order projection discarded.');};
$('#tradeButton').onclick=()=>{document.body.classList.toggle('rail-hidden');$('#tradeButton').setAttribute('aria-expanded',!document.body.classList.contains('rail-hidden'));ws.cells().forEach(c=>c.chart.resize());};

function showDialog(title,body,submit,{submitLabel='Confirm',cancelLabel='Cancel'}={}){
 $('#dialogBody').innerHTML=`<h2>${esc(title)}</h2><form id="dialogForm">${body}<p class="error" role="alert" id="dialogError"></p><div class="dialog-actions"><button type="button" id="dialogCancel">${esc(cancelLabel)}</button>${submit?'<button class="primary" type="submit">'+esc(submitLabel)+'</button>':''}</div></form>`;
 $('#dialogCancel').onclick=()=>$('#dialog').close();
 $('#dialogForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;if(b)b.disabled=true;try{await submit(new FormData(e.target));$('#dialog').close();}catch(err){$('#dialogError').textContent=err.message;}finally{if(b)b.disabled=false;}};
 $('#dialog').showModal();
}
$('#addAccount').onclick=()=>showDialog('Create paper account',`<label>Account name<input name="name" value="My paper account" required maxlength="80"></label><div class="two-col"><label>Starting capital · USD<input name="capital" type="number" min="1" max="1000000000" value="10000" required></label><label>Commission · bps / side<input name="fee_bps" type="number" min="0" max="1000" step="any" value="5" required></label></div><label>Perpetual paper leverage<select name="leverage"><option>1</option><option>2</option><option>5</option><option>10</option><option>20</option></select></label><p class="muted small">Separate virtual capital and ledger. Coinbase spot uses owned inventory; Hyperliquid supports paper longs and shorts.</p>`,async fd=>{const a=await command('account',Object.fromEntries(fd));activeAccount=a.id;localStorage.setItem('the-desk.account',activeAccount);draft=false;await refresh();toast('Paper account created and queued for Lux Journal.');});


$('#manageAccount').onclick=()=>{
 const a=account();if(!a)return toast('Create a paper account first.',true);
 const accountForm='<label>Account name<input name="name" value="'+esc(a.name)+'" required maxlength="80"></label>'+
  '<div class="two-col"><label>Starting capital · USD<input name="capital" type="number" min="1" max="1000000000" step="any" value="'+esc(a.capital)+'" required></label>'+
  '<label>Commission · bps / side<input name="fee_bps" type="number" min="0" max="1000" step="any" value="'+esc(a.fee_bps)+'" required></label></div>'+
  '<label>Perpetual paper leverage<select name="leverage">'+[1,2,5,10,20].map(n=>'<option value="'+n+'" '+(Number(a.leverage)===n?'selected':'')+'>'+n+'×</option>').join('')+'</select></label>'+
  '<label><input type="checkbox" name="reset_journal"> Also reset this account’s linked Lux Journal history</label>'+
  '<div class="template-row"><button type="button" id="resetPaperAccount">Reset paper account…</button>'+
  '<button type="button" id="deletePaperAccount" '+(state.accounts.length<2?'disabled':'')+'>Delete paper account…</button></div>'+
  '<p class="muted small">Reset clears this account’s paper orders, positions, executions and cash ledger, then restores starting capital.</p>';
 showDialog('Manage paper account',accountForm,async fd=>{
  const resetJournal=fd.get('reset_journal')==='on';
  await command('account_update',{account_id:a.id,name:fd.get('name'),capital:fd.get('capital'),fee_bps:fd.get('fee_bps'),leverage:fd.get('leverage'),reset_journal:resetJournal});
  toast(resetJournal?'Account updated; Lux Journal reset queued.':'Paper account updated; journal history retained.');
 });
 $('#resetPaperAccount').onclick=()=>{
  $('#dialog').close();
  showDialog('Reset paper account','<p><strong>'+esc(a.name)+'</strong> will return to its starting capital. Its paper orders, open positions, executions and cash ledger will be cleared.</p>'+
   '<label><input type="checkbox" name="reset_journal"> Also reset this account’s linked Lux Journal history</label>'+
   '<p class="muted small">The journal reset is queued if Lux Journal is unavailable.</p>',async fd=>{
    const resetJournal=fd.get('reset_journal')==='on';
    await command('account_reset',{account_id:a.id,reset_journal:resetJournal});
    toast(resetJournal?'Paper account reset; Lux Journal reset queued.':'Paper account reset; Lux Journal history retained.');
   });
 };
 $('#deletePaperAccount').onclick=()=>{
  if(state.accounts.length<2)return;
  $('#dialog').close();
  showDialog('Delete paper account','<p>Delete <strong>'+esc(a.name)+'</strong> and its paper orders, positions, executions, alerts and cash ledger. This cannot be undone.</p>'+
   '<label>Type <strong>'+esc(a.name)+'</strong> to confirm<input name="confirm_name" required autocomplete="off"></label>'+
   '<label><input type="checkbox" name="reset_journal"> Also reset this account’s linked Lux Journal history</label>'+
   '<p class="muted small">Create another paper account before deleting the last one.</p>',async fd=>{
    if(fd.get('confirm_name')!==a.name)throw Error('The account name does not match.');
    const resetJournal=fd.get('reset_journal')==='on';
    await command('account_delete',{account_id:a.id,reset_journal:resetJournal});
    activeAccount=state.active_account;localStorage.setItem('the-desk.account',activeAccount);
    toast(resetJournal?'Paper account deleted; Lux Journal reset queued.':'Paper account deleted; Lux Journal history retained.');
   });
 };
};

function drawWatch(){
 if(brokerContext?.selected){$('#watchPanel .rail-heading').innerHTML='ROBINHOOD MARKETS <span>USD</span>';$('#watchPanel > p.small').textContent='Robinhood account catalog · choose an asset to chart';$('#watchlist').innerHTML='<div class="rh-empty"><strong>ROBINHOOD ASSETS</strong><p>'+esc(brokerContext.asset?.symbol||'Select an asset')+'</p><button id="openWatchBrokerAssets">Browse Robinhood assets</button><p class="small muted">Account-scoped crypto catalog and stock / ETF search. Selection is shared by chart and ticket.</p></div>';$('#openWatchBrokerAssets').onclick=brokerContext.openAssets;return;}
 $('#watchPanel .rail-heading').innerHTML='CRYPTO MARKETS <span>USD</span>';$('#watchPanel > p.small').textContent='Public exchange data · choose a row to chart';
 $('#watchlist').innerHTML=[...instruments,...(ibkrStatus?.instrument?[ibkrStatus.instrument]:[])].map(i=>{const q=isIBKR(i)?ibkrStatus.quote:state?.quotes[i];return `<button class="watch-row ${i===instrument()?'active':''}" data-instrument="${esc(i)}"><span><span class="ticker">${esc(i.split(':')[1].replace('-USD',''))}</span><br><small>${isIBKR(i)?(ibkrStatus.mode==='DEMO_DATA'?'DEMO DATA · IBKR':'IBKR · READ ONLY'):i.startsWith('coinbase')?'COINBASE · SPOT':'HYPERLIQUID · PERP'}</small></span><span class="watch-value">${q?.last?number(q.last):'—'}</span><span class="muted small">${q&&!q.stale&&q.age<15?'●':'○'}</span></button>`;}).join('');
 $('#watchlist').querySelectorAll('button').forEach(b=>b.onclick=async()=>{draft=false;try{await ws.chart.setMarket({symbol:b.dataset.instrument,...(isIBKR(b.dataset.instrument)?{timeframe:'1'}:{})});updateTicket();drawWatch();}catch(e){toast(e.message,true);}});
}
const dom=setupDOM({instrument,quote,stage:stageTrade,account,replay:()=>!!ws?.replay?.state?.active});
const domTrader=setupDOMTrader({state:chartTradingState,instrument,quote,accountId:()=>activeAccount,replay:()=>readonlyMarket()||!!ws?.replay?.state?.active,stage:stageTrade,book:()=>dom.book(),editOrder,closePosition,editBracket,showDialog,command,pending:tradingActions.pending,cancelOrder:cancelChartOrder,toast,config:tradeConfig});
function drawDOM(){dom.sync();domTrader.paint();}
document.querySelectorAll('[data-rail]').forEach(b=>b.onclick=()=>{
 rail=b.dataset.rail;$('#watchPanel').hidden=rail!=='watch';$('#domPanel').hidden=rail!=='dom';
 document.body.classList.toggle('dom-open',rail==='dom');
 document.querySelectorAll('[data-rail]').forEach(x=>x.classList.toggle('active',x===b));drawDOM();ws?.cells().forEach(c=>c.chart.resize());
});

function setPanel(next){
 panel=next;document.body.classList.add('manager-open');$('#managerOpen').setAttribute('aria-expanded','true');document.querySelectorAll('[data-panel]').forEach(b=>{b.classList.toggle('active',b.dataset.panel===next);b.setAttribute('aria-selected',b.dataset.panel===next);});document.body.classList.toggle('journal-expanded',next==='journal');renderManager();ws?.cells().forEach(c=>c.chart.resize());
}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
$('#managerOpen').onclick=()=>{document.body.classList.add('manager-open');$('#managerOpen').setAttribute('aria-expanded','true');ws?.cells().forEach(c=>c.chart.resize());};
$('#managerSize').onclick=()=>{const expanded=document.body.classList.toggle('manager-expanded');$('#managerSize').setAttribute('aria-label',expanded?'Restore account manager height':'Expand account manager');ws.cells().forEach(c=>c.chart.resize());};
$('#managerClose').onclick=()=>{document.body.classList.remove('manager-open','manager-expanded','journal-expanded');$('#managerOpen').setAttribute('aria-expanded','false');ws.cells().forEach(c=>c.chart.resize());};
function empty(title,subtitle){return `<div class="empty"><strong>${esc(title)}</strong>${esc(subtitle)}</div>`;}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;}
function instrumentShort(i){return i.toUpperCase();}
function renderManager(){
 if(!state)return;
 const host=$('#managerContent');
 if(brokerContext?.selected){
  if(panel==='orders'){
   const accountId=brokerContext.selected;host.innerHTML='<div class="rh-empty">Reading Robinhood order status…</div>';
   brokerContext.orders().then(result=>{if(!brokerContext?.selected||brokerContext.selected!==accountId||panel!=='orders')return;const rows=(result.orders||[]).map(o=>`<tr><td>${esc(o.symbol||o.instrument||'—')}</td><td>${esc(String(o.side||'—').toUpperCase())}</td><td>${esc(o.type||'—')}</td><td>${esc(o.quantity||o.requested_quantity||o.dollar_amount||'—')}</td><td>${esc(o.filled_quantity||'0')}</td><td>${esc(o.limit_price||o.average_price||'Market')}</td><td>${esc(o.state||o.status||'Unknown')}</td><td>${esc(o.updated_at||o.created_at||'—')}</td></tr>`),approvals=(result.approvals||[]).map(a=>`<tr><td>${esc(a.symbol||'—')}</td><td>${esc(String(a.side||'—').toUpperCase())}</td><td>${esc(a.state||a.status||'Pending')}</td><td>${esc(a.created_at||'—')}</td></tr>`);const journal=result.journal||{};host.innerHTML=`<div class="journal-toolbar"><span>Robinhood order status · ${esc(brokerContext.account()?.account||'')}</span><button id="refreshRobinhoodOrders">Refresh status</button><span class="muted">Updated ${new Date(result.observedAt*1000).toLocaleTimeString()} · Journal ${journal.accepted||0} synced / ${journal.pending||0} pending${journal.error?' · '+esc(journal.error):''}</span></div>`+(approvals.length?'<h3>Robinhood approvals</h3>'+table(['Asset','Side','Approval state','Created'],approvals):'')+(rows.length?table(['Asset','Side','Type','Requested','Filled','Price','Robinhood state','Updated'],rows):empty('No Robinhood orders','Orders and state changes from this selected account will appear here.'))+`<p class="muted small">Order states come from Robinhood. A submission acknowledgement is not a fill. Only completed crypto orders with a broker filled quantity and average price are imported to the Robinhood account in Lux Journal. ${result.approvalsStatus==='error'?'Approval status could not be refreshed.':''}</p>`;$('#refreshRobinhoodOrders')?.addEventListener('click',()=>window.dispatchEvent(new Event('desk:robinhood-orders')));}).catch(error=>{if(panel==='orders')host.innerHTML='<div class="rh-empty">Robinhood order status unavailable · '+esc(error.message)+'<button id="refreshRobinhoodOrders">Retry</button></div>';$('#refreshRobinhoodOrders')?.addEventListener('click',()=>window.dispatchEvent(new Event('desk:robinhood-orders')));});return;
  }
  host.innerHTML='<div class="rh-empty"><strong>Robinhood · '+esc(brokerContext.account()?.account||'disconnected')+'</strong><p>Orders are polled directly from this selected Robinhood account. Filled trades are journaled under a separate Robinhood account in Lux Journal.</p><button id="openBrokerLedger">Open Robinhood account & agents</button><button id="showRobinhoodOrders">View order status</button></div>';$('#openBrokerLedger').onclick=()=>window.dispatchEvent(new CustomEvent('desk:open-robinhood-account',{detail:{accountId:brokerContext.selected}}));$('#showRobinhoodOrders').onclick=()=>setPanel('orders');return;
 }
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
  const rows=state.positions.map(p=>{const {mark,pnl,increment}=positionMetrics(p,state.quotes[p.instrument]);return `<tr data-position-id="${esc(p.id)}"><td>${esc(instrumentShort(p.instrument))}</td><td class="${p.side==='buy'?'positive':'negative'}">${p.side==='buy'?'Long':'Short'}</td><td>${fmt(p.qty)}</td><td>${fmt(p.entry)}</td><td data-position-mark>${fmt(mark)}</td><td data-position-pnl class="${pnl>=0?'positive':'negative'}">${formatMoney(pnl,increment)}</td><td>${p.stop?fmt(p.stop):'—'} / ${p.target?fmt(p.target):'—'}</td><td><button data-bracket="${p.id}">SL / TP</button><button data-close="${p.id}">Close</button><button data-partial="${p.id}">Partial</button><button data-reverse="${p.id}">Reverse</button></td></tr>`;});
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
 host.querySelectorAll('[data-cancel]').forEach(b=>{const o=state.orders.find(x=>x.id===b.dataset.cancel);b.disabled=tradingActions.pending(o.account_id,o.id);b.onclick=()=>cancelChartOrder(o);});
 host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editOrder(state.orders.find(x=>x.id===b.dataset.edit)));
 host.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closePosition(state.positions.find(x=>x.id===b.dataset.close)));
 host.querySelectorAll('[data-partial]').forEach(b=>b.onclick=()=>closePosition(state.positions.find(x=>x.id===b.dataset.partial),{partial:true}));
 host.querySelectorAll('[data-bracket]').forEach(b=>b.onclick=()=>editBracket(state.positions.find(x=>x.id===b.dataset.bracket)));
 host.querySelectorAll('[data-reverse]').forEach(b=>b.onclick=()=>reversePosition(state.positions.find(x=>x.id===b.dataset.reverse)));
 host.querySelectorAll('[data-alert-delete]').forEach(b=>b.onclick=async()=>{try{await command('alert_delete',{id:b.dataset.alertDelete,account_id:activeAccount});}catch(e){toast(e.message,true);}});
 if(ws?.replay.state.active)host.querySelectorAll('[data-close],[data-partial],[data-reverse],[data-bracket],[data-edit],[data-cancel]').forEach(b=>b.disabled=true);
}
window.addEventListener('desk:robinhood-orders',()=>{if(brokerContext?.selected&&panel==='orders')renderManager();});
setInterval(()=>{if(brokerContext?.selected&&panel==='orders')window.dispatchEvent(new Event('desk:robinhood-orders'));},10000);
function levelInputs(item){return `<div class="two-col"><label>Limit price<input name="price" type="number" step="any" value="${esc(item.price||'')}" ${item.kind?.includes('limit')?'required':''}></label><label>Stop trigger<input name="trigger" type="number" step="any" value="${esc(item.trigger||'')}" ${item.kind?.includes('stop')?'required':''}></label></div><div class="two-col"><label>Stop loss<input name="stop" type="number" step="any" value="${esc(item.stop||'')}"></label><label>Take profit<input name="target" type="number" step="any" value="${esc(item.target||'')}"></label></div>`;}
function editOrder(o,changes={}){if(tradeConfig().instant&&Object.keys(changes).length)return instantAction('amend',{id:o.id,account_id:o.account_id,revision:o.revision,qty:o.qty,price:o.price,trigger:o.trigger,stop:o.stop,target:o.target,...changes},'Paper amendment accepted.');showDialog('Modify paper '+o.kind.replace('_',' '),`<p>${esc(o.instrument.toUpperCase())} · ${esc(account()?.name)}</p>${levelInputs({...o,...changes})}<label>Quantity<input name="qty" type="number" min="0.00000001" step="any" value="${esc(changes.qty??o.qty)}" required></label>`,async fd=>{await command('amend',{id:o.id,account_id:o.account_id,revision:o.revision,...Object.fromEntries(fd)});toast('Paper amendment accepted.');});}
function editBracket(p,changes={}){if(tradeConfig().instant&&Object.keys(changes).length)return instantAction('bracket',{id:p.id,account_id:p.account_id,revision:p.revision,stop:p.stop,target:p.target,...changes},'Paper protection updated.');showDialog('Position protection',`<p>${esc(p.instrument.toUpperCase())} · ${fmt(p.qty)} units · server-managed paper bracket</p><div class="two-col"><label>Stop loss<input name="stop" type="number" step="any" value="${esc(changes.stop??p.stop??'')}"></label><label>Take profit<input name="target" type="number" step="any" value="${esc(changes.target??p.target??'')}"></label></div>`,async fd=>{await command('bracket',{id:p.id,account_id:p.account_id,revision:p.revision,...Object.fromEntries(fd)});toast('Paper protection updated.');});}
function closePosition(p,{partial=false}={}){if(tradeConfig().instant&&!partial)return instantAction('close',{id:p.id,account_id:p.account_id,revision:p.revision,qty:p.qty},'Paper position closed.');showDialog('Close paper position',`<p>${esc(p.instrument.toUpperCase())} · ${p.side==='buy'?'Long':'Short'} · ${fmt(p.qty)} open</p><label>Quantity to close<input name="qty" type="number" min="0.00000001" step="any" max="${esc(p.qty)}" value="${esc(p.qty)}" required></label>`,async fd=>{await command('close',{id:p.id,account_id:p.account_id,revision:p.revision,qty:fd.get('qty')});toast('Paper exit accepted; journal event queued.');});}
function reversePosition(p){const scoped={account_id:p.account_id,instrument:p.instrument,orders:state.orders.filter(o=>o.instrument===p.instrument&&['working','triggered'].includes(o.status)).map(({id,revision})=>({id,revision})),positions:state.positions.filter(x=>x.instrument===p.instrument).map(({id,revision})=>({id,revision}))};if(tradeConfig().instant)return instantAction('reverse',scoped,'Paper reversal accepted.');showDialog('Reverse paper instrument',`<p>Cancel ${scoped.orders.length} working orders and reverse the net ${esc(p.instrument.toUpperCase())} position at the current server quote.</p><p>Coinbase spot cannot become short.</p>`,async()=>{await command('reverse',scoped);toast('Paper reversal accepted.');});}

$('#alertButton').onclick=()=>showDialog('Create price alert',`<p>${esc(instrument().toUpperCase())} · server evaluation</p><label>Condition<select name="condition"><option value="above">At or above</option><option value="below">At or below</option></select></label><label>Price<input name="price" type="number" min="0.00000001" step="any" value="${snap(quote()?.last||0)}" required></label><p class="muted small">One trigger. Browser closure does not stop evaluation; a missing feed pauses it.</p>`,async fd=>{await command('alert',{account_id:activeAccount,instrument:instrument(),...Object.fromEntries(fd)});setPanel('alerts');toast('Server price alert created.');});

async function renderStrategy(){
 $('#managerContent').innerHTML=`<form id="strategyForm" class="strategy-form"><label>Fast SMA<input name="fast" type="number" min="2" max="299" value="9"></label><label>Slow SMA<input name="slow" type="number" min="3" max="300" value="21"></label><label>Fee · bps / side<input name="fee" type="number" min="0" step="any" value="5"></label><button class="primary">Run study</button><span class="muted small">Long-only SMA · 1 unit · next-open fills · completed bars · no funding/slippage · historical simulation</span></form><div id="strategyOutput" class="empty">Run a reproducible study on the selected market. This MVP tester does not execute Pine scripts.</div>`;
 $('#strategyForm').onsubmit=async e=>{
  e.preventDefault();try{if(readonlyMarket())throw Error('The crypto strategy tester is unavailable for read-only futures. Futures P&L and data-use rights need separate validation.');const fd=new FormData(e.target);const tf=canonicalTimeframe(ws.chart.market.timeframe);const data=await api('/api/bars?'+new URLSearchParams({instrument:instrument(),timeframe:tf,limit:'600'}));const secs=timeframeMs(tf);const bars=data.bars.filter(b=>b.time+secs<=data.as_of).map(b=>({...b,time:Math.floor(b.time/1000)}));if(bars.some((b,i)=>i&&b.time-bars[i-1].time!==secs/1000))throw Error('Provider history contains missing bars. Select another interval or retry; this study requires continuous completed bars.');const result=runSmaBacktest(bars,{fast:Number(fd.get('fast')),slow:Number(fd.get('slow')),feeBps:Number(fd.get('fee'))});$('#strategyOutput').className='';$('#strategyOutput').innerHTML=`<div class="strategy-results"><span><small>Completed bars</small><strong>${result.bars}</strong></span><span><small>Trades</small><strong>${result.trades.length}</strong></span><span><small>Net P&amp;L · 1 unit</small><strong>${usd(result.equity)}</strong></span><span><small>Realized drawdown</small><strong>${usd(result.maxDrawdown)}</strong></span><span><small>Study source</small><strong style="font-size:12px">${esc(data.instrument.toUpperCase())} · ${esc(tf)}</strong></span></div><p class="muted small" style="padding:0 16px">Completed cutoff ${esc(new Date(bars.at(-1).time*1000+secs).toISOString())} · ${esc(data.coverage)} · Open study position ${result.openPosition?'excluded from realized P&amp;L':'none'}</p>`+table(['Entry UTC','Exit UTC','Entry','Exit','Gross','Fee','Net'],result.trades.map(t=>`<tr><td>${new Date(t.entryTime*1000).toISOString()}</td><td>${new Date(t.exitTime*1000).toISOString()}</td><td>${fmt(t.entry)}</td><td>${fmt(t.exit)}</td><td>${usd(t.gross)}</td><td>${usd(t.fee)}</td><td>${usd(t.pnl)}</td></tr>`));}catch(err){$('#strategyOutput').textContent=err.message;}
 };
}
function canonicalTimeframe(tf){const map={'1':'1m','2':'2m','3':'3m','5':'5m','15':'15m','30':'30m','60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d'};return map[String(tf)]||String(tf).toLowerCase();}
function timeframeMs(tf){return ({'1m':1,'2m':2,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'2h':120,'4h':240,'1d':1440}[tf]||60)*60000;}

$('#replayButton').onclick=()=>{$('#replayBar').hidden=!$('#replayBar').hidden;if(!$('#replayStartTime').value)$('#replayStartTime').value=new Date(Date.now()-86400000).toISOString().slice(0,16);ws.cells().forEach(c=>c.chart.resize());};
$('#startReplay').onclick=async()=>{try{draft=false;await ws.replay.start({from:Date.parse($('#replayStartTime').value+'Z')});updateTicket();toast('Chart replay started. New submissions disabled; server orders continue on current quotes.');}catch(e){toast(e.message,true);}};
$('#stepReplay').onclick=()=>{ws.replay.step();replayUpdate();};$('#playReplay').onclick=()=>{ws.replay.play(600);replayUpdate();};$('#pauseReplay').onclick=()=>{ws.replay.pause();replayUpdate();};$('#stopReplay').onclick=()=>{ws.replay.stop();replayUpdate();updateTicket();};
function replayUpdate(){const r=ws?.replay.state;$('#replayState').textContent=r?.active?(r.playing?'Playing':'Paused')+' · '+r.remaining+' hidden bars':'Replay off';updateTicket();renderManager();}

let settingsWriter=sessionStorage.getItem('the-desk.settings-writer');if(!settingsWriter){settingsWriter=crypto.randomUUID();sessionStorage.setItem('the-desk.settings-writer',settingsWriter);}
const durableSettings=new DurableSettings({writer:settingsWriter,read:()=>api('/api/settings/state'),write:value=>api('/api/settings/commit',value),
 prepare:async values=>values.workspace?{...values,workspace:await upgradeLiquidityWorkspace(values.workspace)}:values,
 onCommit:values=>Object.assign(settings,values),onState:status=>{$('#saveStatus').textContent=({saving:'Saving…',saved:'All changes saved',failed:status.local?'Saved locally · server rejected save':'Save rejected',retrying:status.local?'Saved locally · retrying server':'Save failed · retrying',conflict:'Local draft · changed in another tab',recovered:'Local draft recovered'})[status.state]||'Workspace restored';}});
window.addEventListener('online',()=>durableSettings.resume());window.addEventListener('pagehide',()=>durableSettings.close());
async function saveSettings(values,options){return durableSettings.save(values,options);}
$('#saveWorkspace').onclick=async()=>{try{await saveSettings({workspace:stripSpiderDrawings(ws.getState())},{force:true});$('#saveStatus').textContent='Saved to this computer';toast('Workspace saved, including drawings and indicator settings.');}catch(e){toast(e.message,true);}};
$('#templatesButton').onclick=()=>{
 showDialog('Chart templates',`<label>Template name<input name="name" value="My layout" required maxlength="80"></label>${templates.map((t,i)=>`<div class="template-row"><span>${esc(t.name)}</span><button type="button" data-load-template="${i}">Load</button></div>`).join('')}`,async fd=>{templates=templates.filter(t=>t.name!==fd.get('name'));templates.push({name:fd.get('name'),state:stripSpiderDrawings(ws.getState())});await saveSettings({presets:templates});toast('Complete chart template saved.');});
 $('#dialogBody').querySelectorAll('[data-load-template]').forEach(b=>b.onclick=async()=>{try{await ws.applyState(templates[Number(b.dataset.loadTemplate)].state);$('#dialog').close();toast('Chart template restored.');}catch(e){$('#dialogError').textContent=e.message;}});
};
$('#themeButton').onclick=async()=>{const light=!document.body.classList.contains('light');document.body.classList.toggle('light',light);ws.setTheme(light?'light':'dark');await saveSettings({appearance:{theme:light?'light':'dark'}});};
$('#journalButton').onclick=()=>brokerContext?.selected?window.dispatchEvent(new CustomEvent('desk:open-robinhood-account',{detail:{accountId:brokerContext.selected,tab:'performance'}})):setPanel('journal');
$('#exportAccount').onclick=async()=>{try{const data=await api('/api/export?account_id='+encodeURIComponent(activeAccount));const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='The-Desk-PAPER-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);}catch(e){toast(e.message,true);}};

async function refresh(){
 if(polling){refreshQueued=true;return;}polling=true;const requestedAccount=activeAccount,generation=tradingGeneration;
 try{
  void refreshIBKR();
  const nextState=await api('/api/state?account_id='+encodeURIComponent(requestedAccount||''));
  if(requestedAccount!==activeAccount||generation!==tradingGeneration){refreshQueued=true;return;}
  if(nextState.accounts.find(a=>a.id===nextState.active_account)?.agent_owner){const manual=nextState.accounts.find(a=>!a.agent_owner);if(!manual)throw Error('Create a manual trading account before using Trader.');activeAccount=manual.id;localStorage.setItem('the-desk.account',activeAccount);refreshQueued=true;return;}
  state=nextState;activeAccount=state.active_account;
  const a=state.accounts.find(a=>a.id===activeAccount),pnlIncrement=positionPnlIncrement(state.positions,state.quotes);for(const [id,key] of [['balance','balance'],['equity','equity'],['unrealized','unrealized'],['buyingPower','buying_power']]){$('#'+id).textContent=id==='unrealized'?formatMoney(a?.[key],pnlIncrement):usd(a?.[key]);$('#'+id).title=!brokerContext?.selected&&a?.[key]!=null?'USD '+a[key]:'';}$('#unrealized').className=Number(a?.unrealized)>=0?'positive':'negative';
  brokerContext?.render();
  $('#positionCount').textContent=brokerContext?.selected?'—':state.positions.length;$('#orderCount').textContent=brokerContext?.selected?'—':state.orders.filter(o=>['working','triggered'].includes(o.status)).length;
  $('#journalBadge').textContent=state.journal.pending?state.journal.pending+' queued':'synced';$('#journalStatus').textContent='Lux Journal '+(state.journal_available?'connected':'unavailable')+' · '+state.journal.pending+' queued / '+state.journal.delivered+' delivered';
  $('#healthDot').className='status-dot ok';$('#healthText').textContent='The Desk · server connected';updateTicket();drawWatch();drawDOM();renderManager();
  const alerts=state.events.filter(e=>e.kind==='alert');if(refresh.lastAlert&&alerts.length&&alerts[0].id>refresh.lastAlert)toast(JSON.parse(alerts[0].content).message);if(alerts.length)refresh.lastAlert=alerts[0].id;
 }catch(e){$('#healthDot').className='status-dot';$('#healthText').textContent='Server disconnected';$('#submitOrder').disabled=true;}
 finally{polling=false;if(refreshQueued){refreshQueued=false;void refresh();}}
}

function cancelChartOrder(o){if(!o)return;if(tradeConfig().instant)return instantAction('cancel',{id:o.id,account_id:o.account_id,revision:o.revision},'Paper order cancelled.');showDialog('Cancel chart order',`<p>${esc(o.side.toUpperCase()+' '+o.kind+' '+o.qty+' · '+o.instrument)} · PAPER</p>`,async()=>{await command('cancel',{id:o.id,account_id:o.account_id,revision:o.revision});toast('Paper order cancelled.');});}
function chartMenu(price,x,y,cell,cursorTime){
 menuPrice=snap(price);const host=$('#chartMenu'),chart=cell?.chart;
 const placementLabel=brokerContext?.selected?'Review live order':tradeConfig().instant?'Place now · PAPER':'Review & place · PAPER';
 const actions=buildChartMenuActions({chart,cell,price:menuPrice,priceLabel:fmt(menuPrice),cursorTime,workspace:ws,copyPrice:copyChartPrice,openAlert:openChartAlert,stageTrade:stageChartTrade,side,openTemplates:()=>$('#templatesButton').click(),toast,placementLabel});
 host.replaceChildren();for(const item of actions){if(['reset','alert','lock-time','table','remove-drawings','settings'].includes(item.id)){const sep=document.createElement('div');sep.className='chart-menu-separator';sep.setAttribute('aria-hidden','true');sep.style.cssText='height:1px;background:var(--line);margin:4px 2px';host.append(sep);}const b=document.createElement('button');b.type='button';b.dataset.action=item.id;b.textContent=item.label;b.disabled=item.disabled===true;host.append(b);}
 host.hidden=false;host.style.left=Math.max(0,Math.min(x,window.innerWidth-300))+'px';host.style.top=Math.max(0,Math.min(y,window.innerHeight-host.offsetHeight-8))+'px';
 host.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{host.hidden=true;try{await actions.find(item=>item.id===button.dataset.action)?.run();}catch(error){toast(error.message||'Chart action failed.',true);}});
}
async function copyChartPrice(price){try{await navigator.clipboard.writeText(String(price));}catch{const input=document.createElement('textarea');input.value=String(price);document.body.append(input);input.select();document.execCommand('copy');input.remove();}toast('Price copied.');}
function openChartAlert(price){$('#alertButton').click();const field=$('#dialogBody input[name=price]');if(field)field.value=price;}
function draftBracket(){return {entry:entryReference(),side,kind:$('#orderKind').value,qty:quantity(),trigger:$('#triggerPrice').value,stop:$('#stopPrice').value,target:$('#targetPrice').value};}
function amendDraft(field,value){
 const changes=moveDraftBracket(draftBracket(),field,value,Number(quote()?.tick||.01));
 for(const [key,price] of Object.entries(changes)){
  const id=key==='entry'&&$('#orderKind').value==='stop'?'triggerPrice':({entry:'entryPrice',trigger:'triggerPrice',stop:'stopPrice',target:'targetPrice'}[key]);$('#'+id).value=price;
 }
 if(field==='entry'&&$('#orderKind').value==='market')$('#orderKind').value='limit';updateTicket();
}
function removeDraft(field){if(field==='entry'){draft=false;}else $('#'+field+'Price').value='';updateTicket();}
function removeChartProtection(level){const changes={[level.field]:''};if(level.kind==='order')editOrder(level.item,changes);else editBracket(level.item,changes);}
const swingTracker=setupSwingTracker({workspace:()=>ws});
const chartTrader=setupChartTrader({workspace:()=>ws,state:chartTradingState,config:tradeConfig,snap,stage:stageTrade,menu:chartMenu,placeDraft:reviewChartOrder,editOrder,editBracket,closePosition,reversePosition,cancelOrder:cancelChartOrder,removeProtection:removeChartProtection,pending:tradingActions.pending,toast,draftLevels:()=>draft?draftTradingLevels(draftBracket(),quote(),amendDraft,removeDraft):[]});
function attachChart(cell){if(!cell.deskMarketAttached){cell.deskMarketAttached=true;const badge=document.createElement('div');badge.className='ibkr-cell-badge';badge.hidden=true;cell.host.append(badge);cell.chart.on('market:changed',()=>{draft=false;updateTicket();drawWatch();drawDOM();window.dispatchEvent(new CustomEvent('desk:agents-sync-chart'));});}chartTrader.attach(cell);swingTracker.attach(cell);}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#chartMenu'))$('#chartMenu').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#chartMenu').hidden=true;draft=false;}});
$('#tradingSettings').onclick=()=>{const c=tradeConfig();showDialog('Trading settings',Object.entries(tradingDefaults).filter(([key])=>key!=='pnlUnit').map(([key])=>`<label class="trading-check"><input type="checkbox" name="${key}" ${c[key]?'checked':''}>${esc(({positions:'Position lines',orders:'Working order lines',brackets:'SL / TP lines',executionHistory:'Paper execution history (optional; hover arrows for details)',pnl:'Position P&L',reverse:'Chart reverse button',quickButtons:'Chart buy / sell buttons',instant:'One-click PAPER trading (place, cancel, drag, close and reverse)'})[key])}</label>`).join('')+`<label>P&L units<select name="pnlUnit"><option value="money">Money</option><option value="ticks">Ticks</option><option value="percent">Percent</option></select></label><p class="muted small">One-click paper trading is on by default. Chart limits use your current ticket size and optional protection. Turn it off for confirmation dialogs. Click SL / TP or Modify to enter exact values; drag levels to amend immediately. Quote freshness and replay checks always apply. Robinhood uses its native live-order review.</p>`,async fd=>{const value=Object.fromEntries(Object.keys(tradingDefaults).map(key=>[key,key==='pnlUnit'?fd.get(key):fd.has(key)]));await saveSettings({trading:tradingConfig(value)});toast('Trading settings saved.');});$('#dialogForm [name=pnlUnit]').value=c.pnlUnit;};

setupPineEditor({saveSettings});

async function reviewBrokerTicket(){
 if(busy)return;
 if(ws.replay.state.active)return toast('Exit replay before broker review.',true);
 const orderType=$('#orderKind').value,asset=brokerContext.asset,sizeMode=$('#sizeMode').value;
 if(!asset)return toast('Select an account-scoped Robinhood asset first.',true);
 if(orderType!=='limit'&&!(asset.kind==='crypto'&&orderType==='market'))return toast('Robinhood supports crypto market / limit and equity limit chart orders.',true);
 if(sizeMode!=='units'&&!(asset.kind==='crypto'&&sizeMode==='cash'))return toast('Robinhood chart tickets support crypto USD notional or unit sizing.',true);
 if($('#stopPrice').value||$('#targetPrice').value)return toast('Remove attached SL / TP. Robinhood standalone orders do not include chart protection.',true);
 const p=payload(),ticket={orderType,quantity:sizeMode==='units'?p.qty:null,dollarAmount:sizeMode==='cash'?String($('#quantity').value):null,price:orderType==='limit'?p.price:null};
 if(!Number.isFinite(Number($('#quantity').value))||Number($('#quantity').value)<=0)return toast('Enter a positive order size.',true);
 const scope={account:brokerContext.selected,instrument:instrument(),asset:asset.id};
 const frozen=JSON.stringify(p);busy=true;updateTicket();
 try{
  const result=await brokerContext.review(ticket);
  if(scope.account!==brokerContext.selected||scope.instrument!==instrument()||scope.asset!==brokerContext.asset?.id||frozen!==JSON.stringify(payload())||ws.replay.state.active)throw Error('Account, chart or ticket changed. Review again.');
  const amount=ticket.dollarAmount?'$'+Number(ticket.dollarAmount).toFixed(2):ticket.quantity+' units';
  const preview=result.preview;
  if(!preview?.id||preview.blocked)throw Error(preview?.review?.validation_errors||'Robinhood preview is blocked. No order was sent.');
  showDialog('Review live Robinhood order',`<p><strong>${esc(brokerContext.account()?.name)} ${esc(brokerContext.account()?.account)}</strong></p><p>${esc(result.intent.symbol)} · ${esc(p.side.toUpperCase())} · ${esc(orderType.toUpperCase())} · ${esc(amount)}${ticket.price?' @ limit '+esc(ticket.price):''}</p><p>${esc(result.disclosure)}</p><pre class="broker-review-json">${esc(JSON.stringify(preview.review,null,2))}</pre><p>This Robinhood preview expires in 30 seconds. Choose <strong>Place live order</strong> only if the account, side, asset, amount and Robinhood estimate are correct. This confirmation sends a real order.</p>`,async()=>{
   if(scope.account!==brokerContext.selected||scope.instrument!==instrument()||scope.asset!==brokerContext.asset?.id||frozen!==JSON.stringify(payload())||ws.replay.state.active)throw Error('Account, chart or ticket changed. Close this preview and review again.');
   const placed=await brokerContext.submit(preview.id);const response=placed.result||{};
   draft=false;$('#sizeMode').value='units';
   const approval=response.approval||response.trade_approval||response.customer_approval_required;
   window.dispatchEvent(new Event('desk:robinhood-orders'));updateTicket();setPanel('orders');
   toast(approval?'Robinhood submission requests your approval in the Robinhood app.':'Robinhood accepted the submission request; verify its order status below.');
  },{submitLabel:'Place live order',cancelLabel:'Cancel'});
 }catch(e){$('#orderError').textContent=e.message;}finally{busy=false;updateTicket();}
}
brokerContext=setupChartAccount({paperAccounts:()=>state?.accounts.filter(a=>!a.agent_owner)||[],paperId:()=>activeAccount,onPaper:async id=>{draft=false;activeAccount=id;localStorage.setItem('the-desk.account',id);await refresh();},onChange:()=>{const scope=(brokerContext?.selected||'')+':'+(brokerContext?.asset?.id||'');if(scope!==brokerScope){draft=false;brokerScope=scope;if(brokerContext?.selected){$('#orderKind').value='limit';for(const id of ['stopPrice','targetPrice','triggerPrice'])$('#'+id).value='';}}if(ws){updateTicket();drawWatch();drawDOM();renderManager();}},onMarket:async value=>{draft=false;if(ws){await ws.chart.setMarket({symbol:value});updateTicket();}},instrument,toast});


async function boot(){
 try{settings=await durableSettings.load();durableSettings.resume();await refreshIBKR();try{const upgraded=await upgradeLiquidityWorkspace(settings.workspace);if(upgraded!==settings.workspace)await saveSettings({workspace:upgraded});}catch(error){console.warn('Saved Liquidity upgrade unavailable; retaining the existing study.',error);}templates=Array.isArray(settings.presets)?settings.presets:[];await loadPineLibrary(settings);
  const theme=settings.appearance?.theme||'dark';document.body.classList.toggle('light',theme==='light');
  if(brokerContext.selected)await brokerContext.refresh(true);
  const spiderHistories={coinbase:new SpiderIntervalProvider(new CoinbaseProvider(),'coinbase'),hyperliquid:new SpiderIntervalProvider(new DeskHyperliquidProvider(),'hyperliquid')};
  ws=new VelaWorkspace('#workspace',{layout:'1',symbol:ibkrStatus?.configured_mode==='demo'?ibkrStatus.instrument:'hyperliquid:BTC',timeframe:ibkrStatus?.configured_mode==='demo'?'1':'60',bars:600,engines:{pine:createPineEngine},providers:{ibkr:()=>ibkrProvider,coinbase:()=>spiderHistories.coinbase,hyperliquid:()=>spiderHistories.hyperliquid,binance:()=>new BinanceProvider(),robinhood:()=>new RobinhoodProvider(()=>brokerContext?.selected)},live:true,theme,volume:true,nativeBackend:'canvas2d',upColor:'#089981',downColor:'#f23645',drawings:true,timeframes:['1','2','3','5','15','30','60','240','D'],persist:'the-desk.workspace.v1',storage:{get:()=>settings.workspace?JSON.stringify(settings.workspace):null,set:async(_,value)=>{try{await saveSettings({workspace:stripSpiderDrawings(JSON.parse(value))});}catch(e){toast(e.message,true);}}},topbar:{left:['symbol','timeframes','style','indicators','layout','undo-redo'],right:['panels','screenshot','alerts']}});
  setupSpider({workspace:()=>ws,instrument,toast,sourceContext:()=>({accountId:brokerContext?.selected||null}),executionContext:()=>({connected:!!brokerContext?.valid(),account:brokerContext?.account()?.account||'',symbol:brokerContext?.asset?.symbol||'',matches:!!brokerContext?.matches,tradable:!!brokerContext?.account()?.tradable}),openExecution:()=>{if(!brokerContext?.selected)$('#robinhoodButton').click();else if(!brokerContext?.asset||!brokerContext?.matches)$('#brokerAssetsButton').click();else{if($('#tradeButton').getAttribute('aria-expanded')!=='true')$('#tradeButton').click();toast('Robinhood spot ticket ready. Review amount and native broker preview before placing an order.');}},setHistory:enabled=>{for(const p of Object.values(spiderHistories))p.serverHistory=enabled;}});
  ws.cells().forEach(attachChart);ws.on('cell:created',()=>ws.cells().forEach(attachChart));ws.on('cell:active',()=>{draft=false;updateTicket();drawWatch();drawDOM();});ws.on('cell:destroyed',()=>chartTrader.cleanup());ws.replay.on('replay:step',replayUpdate);ws.replay.on('replay:end',replayUpdate);
  await refresh();void brokerContext.refresh(true);setInterval(refresh,2000);setInterval(()=>$('#clock').textContent=new Date().toLocaleTimeString('en-US',{timeZone:'UTC'})+' UTC',1000);chartTrader.start();
  Promise.allSettled(ws.cells().map(c=>c.chart.ready())).then(async()=>{
   const swingMarket=new URLSearchParams(location.search).get('swing_market');
   if(['hyperliquid:BTC','hyperliquid:ETH'].includes(swingMarket)){
    const toggle=$('#swingTrackerButton');if(toggle?.getAttribute('aria-pressed')==='false')toggle.click();
    await ws.chart.setMarket({symbol:swingMarket,timeframe:'1'});
   }
   if($('#saveStatus').textContent==='Loading workspace…')$('#saveStatus').textContent='Workspace restored';
  }).catch(e=>toast(e.message,true));
  if(window.innerWidth<700){document.body.classList.add('rail-hidden');$('#tradeButton').setAttribute('aria-expanded','false');}
 }catch(e){$('#saveStatus').textContent='Initialization failed';toast(e.message,true);}
}
boot();

import {runSmaBacktest} from './quant-backtest.mjs';
import {completedBars,createSmartFibOverlay,quantPremiumItems,renderLiquidityOverlay} from './quant-premium-overlays.mjs';
import {renderQuantOrderFlow,renderQuantExecutedOrderFlow} from './quant-order-flow-overlays.mjs?v=2';
import {fetchCoinbaseFootprint} from './coinbase-footprint-feed.mjs';
import {createCodexWidget} from './codex-widget.js?v=19';
import {registerVolumeAnalyst} from './volume-analyst.mjs?v=5';

const $ = selector => document.querySelector(selector);
registerVolumeAnalyst();
const providerSpecs = {
  binance:{label:'Binance public data',className:'BinanceProvider',market:'BTCUSDT',type:'spot or perpetual, according to market symbol'},
  coinbase:{label:'Coinbase Exchange public data',className:'CoinbaseProvider',market:'BTC-USD',type:'spot'},
  hyperliquid:{label:'Hyperliquid public data',className:'HyperliquidProvider',market:'BTC',type:'perpetual or spot, according to market symbol'},
};
const storageKey = 'count-desk-quant-lab-v1';
const versionsKey = 'count-desk-quant-lab-strategies-v1';
const layoutStorageKey = 'count-desk-quant-lab-layout-v1';
let chart = null;
let bars = [];
let source = null;
let slots = [];
let activeIndex = 0;
let syncPrefs = {symbol:false,interval:false,crosshair:false,style:false};
let styleSyncBusy = false;
const pendingBars = new Map();
let history = [];
let versions = [];
let activePanel = '';
let indicatorTab = 'vela';
let lastResult = null;
let lastRunKey = '';
const accountStorageKey = 'count-desk-quant-lab-active-sim-account-v1';
let simAccounts = [];
let activeAccountId = '';
let traderView = 'trade';

function readStored(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } }
history = readStored(storageKey, []);
versions = readStored(versionsKey, []);
function save() { try { localStorage.setItem(storageKey, JSON.stringify(history.slice(-24))); localStorage.setItem(versionsKey, JSON.stringify(versions.slice(-50))); } catch {} }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function fmt(value, maximumFractionDigits=2) { return Number(value).toLocaleString(undefined,{maximumFractionDigits}); }
function utc(time) { return new Date(time).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'); }
function runKey() { return JSON.stringify({name:draft.name,fast:draft.fast,slow:draft.slow,feeBps:draft.feeBps,source:source&&{id:source.id,market:source.market,timeframe:source.timeframe,cutoff:source.cutoff}}); }
function setStatus(message, error=false) { $('#sourceState').textContent=message; $('#sourceState').style.color=error?'#ffb8c1':''; }
function panel(name,title,html) { activePanel=name; $('#panelEyebrow').textContent='QUANT LAB · '+name.toUpperCase(); $('#panelTitle').textContent=title; $('#panelBody').innerHTML=html; $('#sidePanel').hidden=false; $('#chartTraderButton').setAttribute('aria-expanded',String(name==='trader')); }
function closePanel() { activePanel=''; $('#sidePanel').hidden=true; $('#chartTraderButton').setAttribute('aria-expanded','false'); }
$('#closePanel').addEventListener('click',closePanel);
const simRequest = async (path,options={}) => {
  const response=await fetch(`/api/chart-sim/${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Simulation service returned ${response.status}`);
  return data;
};
function syncAccountPicker(){
  const picker=$('#activeSimAccount');
  picker.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=simAccounts.length?'Choose SIM account':'No SIM accounts';picker.append(placeholder);
  for(const account of simAccounts){const option=document.createElement('option');option.value=account.account_id;option.textContent=`${account.name} · ${Number(account.starting_balance).toLocaleString(undefined,{style:'currency',currency:account.currency||'USD',maximumFractionDigits:0})}`;picker.append(option);}
  if(!simAccounts.some(item=>item.account_id===activeAccountId))activeAccountId=simAccounts[0]?.account_id||'';
  picker.value=activeAccountId;
  try{if(activeAccountId)localStorage.setItem(accountStorageKey,activeAccountId);else localStorage.removeItem(accountStorageKey);}catch{}
}
async function loadSimAccounts(){
  try{const data=await simRequest('accounts',{method:'GET'});simAccounts=data.accounts||[];
    try{activeAccountId=localStorage.getItem(accountStorageKey)||activeAccountId;}catch{}
    syncAccountPicker();
    if(activePanel==='trader')renderChartTrader();
  }catch(error){simAccounts=[];syncAccountPicker();$('#activeSimAccount').title=error.message;}
}
$('#activeSimAccount').addEventListener('change',event=>{
  activeAccountId=event.target.value;
  try{if(activeAccountId)localStorage.setItem(accountStorageKey,activeAccountId);else localStorage.removeItem(accountStorageKey);}catch{}
  if(activePanel==='trader')renderChartTrader();
});
function closeContextMenu(){const menu=$('#chartContextMenu');menu.hidden=true;}
function openTradePanel(side='long'){
  closeContextMenu();traderView='trade';renderChartTrader(side);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
}
function renderChartTrader(side='long'){
  if(traderView==='accounts'){renderTraderAccounts(side);return;}
  const account=simAccounts.find(item=>item.account_id===activeAccountId);
  const supported=Boolean(source&&source.type==='micro futures (stored bars)');
  panel('trader','Chart Trader',`<div class="trader-tabs" role="tablist" aria-label="Chart Trader views"><button type="button" role="tab" data-trader-view="trade" aria-selected="true">Trade</button><button type="button" role="tab" data-trader-view="accounts" aria-selected="false">Accounts</button></div><div class="trader-account-card"><span>ACTIVE SIM ACCOUNT</span><strong>${escapeHtml(account?.name||'No account selected')}</strong><small>${account?`${escapeHtml(account.currency||'USD')} · virtual starting balance ${fmt(account.starting_balance,2)}`:'Create or select an account above to continue.'}</small></div>
  <p class="trader-market"><b>${escapeHtml(source?.market||slots[activeIndex]?.params?.market||'No chart loaded')}</b> · ${escapeHtml(source?.timeframe||slots[activeIndex]?.params?.timeframe||'—')} · ${escapeHtml(source?.label||'public chart source')}</p>
  <p class="trader-boundary">${supported?'This chart source is eligible for the local paper simulator. Orders remain simulated.':`Paper order entry is unavailable for this chart. Quant Lab is showing ${escapeHtml(source?.type||'public crypto data')}; the current simulator requires stored micro-futures bars. No order will be sent.`}</p>
  <div class="trader-ticket"><div class="trader-ticket-head"><strong>Order ticket</strong><span>SIM · PAPER</span></div><label>Side<select id="traderSide"><option value="long" ${side==='long'?'selected':''}>Buy / Long</option><option value="short" ${side==='short'?'selected':''}>Sell / Short</option></select></label><div class="panel-row"><label>Order type<select id="traderType"><option value="market">Market</option><option value="limit">Limit</option></select></label><label>Quantity<input id="traderQty" type="number" min="1" step="1" value="1"></label></div><label>Limit price<input id="traderLimit" type="number" min="0" step="any" placeholder="Only used for limit orders"></label><button id="traderReview" class="trader-submit" type="button" disabled>${supported&&account?'Review paper order':'Unavailable for this chart'}</button><small class="trader-cutoff">Chart cutoff: ${source?escapeHtml(utc(source.cutoff)):'not loaded'}</small></div>
  <div class="trader-list-head"><strong>Orders &amp; positions</strong><button id="traderRefresh" type="button">Refresh</button></div><div id="traderLedger" class="trader-ledger"><p>${account?'Loading account activity…':'Select a SIM account to view its activity.'}</p></div><p id="traderNotice" class="muted" role="status"></p>`);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
  $('#traderType').addEventListener('change',()=>{$('#traderLimit').closest('label').hidden=$('#traderType').value!=='limit';});
  $('#traderType').dispatchEvent(new Event('change'));
  $('#traderReview').addEventListener('click',()=>{
    if(!supported||!account)return;
    $('#traderNotice').textContent='Review flow is ready when this chart is backed by stored simulator bars. The current public crypto snapshot cannot be submitted to the micro-futures simulator.';
  });
  $('#panelBody').querySelectorAll('[data-trader-view]').forEach(button=>button.addEventListener('click',()=>{traderView=button.dataset.traderView;renderChartTrader(side);}));
  $('#traderRefresh').addEventListener('click',()=>void loadTraderLedger());
  void loadTraderLedger();
}
function renderTraderAccounts(side='long'){
  const account=simAccounts.find(item=>item.account_id===activeAccountId);
  const rows=simAccounts.map(item=>`<div class="trader-account-row ${item.account_id===activeAccountId?'is-active':''}"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.currency||'USD')} · virtual starting balance ${fmt(item.starting_balance,2)} · SIM</small></div><button type="button" data-select-sim-account="${escapeHtml(item.account_id)}" ${item.account_id===activeAccountId?'disabled':''}>${item.account_id===activeAccountId?'Active':'Select'}</button></div>`).join('');
  panel('trader','Chart Trader',`<div class="trader-tabs" role="tablist" aria-label="Chart Trader views"><button type="button" role="tab" data-trader-view="trade" aria-selected="false">Trade</button><button type="button" role="tab" data-trader-view="accounts" aria-selected="true">Accounts</button></div><div class="trader-accounts-head"><div><strong>Accounts</strong><small>Local simulation accounts for paper trading</small></div><span>SIM</span></div><div class="trader-active-summary"><small>ACTIVE ACCOUNT</small><strong>${escapeHtml(account?.name||'No account selected')}</strong><span>${account?`${escapeHtml(account.currency||'USD')} · virtual starting balance ${fmt(account.starting_balance,2)}`:'Create a SIM account to start.'}</span></div><div class="trader-account-list">${rows||'<p>No simulation accounts yet. Create one below.</p>'}</div><p class="trader-boundary">Live broker accounts are not connected. These accounts are local simulations and do not control a broker.</p><form id="createSimAccount"><label>New account name<input name="name" maxlength="80" required placeholder="e.g. BTC paper study"></label><label>Starting virtual balance (USD)<input name="starting_balance" type="number" min="1" step="any" value="10000" required></label><button type="submit">Create SIM account</button></form><p id="accountsNotice" class="muted" role="status"></p>`);
  $('#panelBody').querySelectorAll('[data-trader-view]').forEach(button=>button.addEventListener('click',()=>{traderView=button.dataset.traderView;renderChartTrader(side);}));
  $('#panelBody').querySelectorAll('[data-select-sim-account]').forEach(button=>button.addEventListener('click',()=>{activeAccountId=button.dataset.selectSimAccount;syncAccountPicker();renderChartTrader(side);}));
  $('#createSimAccount').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{const created=await simRequest('accounts',{method:'POST',body:JSON.stringify({name:form.get('name'),starting_balance:form.get('starting_balance')})});simAccounts.push(created);activeAccountId=created.account_id;traderView='accounts';syncAccountPicker();renderChartTrader(side);}
    catch(error){$('#accountsNotice').textContent=error.message;}
    finally{const submit=$('#createSimAccount button');if(submit)submit.disabled=false;}
  });
}
async function loadTraderLedger(){
  const target=$('#traderLedger');if(!target)return;
  if(!activeAccountId){target.innerHTML='<p>Select or create a SIM account to see activity.</p>';return;}
  try{
    const result=await simRequest(`positions?account_id=${encodeURIComponent(activeAccountId)}`,{method:'GET'});
    if(!$('#traderLedger'))return;
    const orders=result.orders||[],positions=result.positions||[];
    if(!orders.length&&!positions.length){target.innerHTML='<p>No paper orders or positions in this account yet.</p>';return;}
    const rows=[...orders.slice(0,8).map(order=>`<div class="trader-ledger-row"><strong>${escapeHtml(order.side)} ${fmt(order.quantity,0)} · ${escapeHtml(order.symbol)}</strong><small>Order · ${escapeHtml(order.status)} · ${escapeHtml(order.timeframe)}</small></div>`),...positions.slice(0,8).map(position=>`<div class="trader-ledger-row"><strong>${escapeHtml(position.side)} ${fmt(position.quantity,0)} · ${escapeHtml(position.symbol)}</strong><small>Position · ${escapeHtml(position.status)} · entry ${fmt(position.entry_price,2)}</small></div>`)];
    target.innerHTML=rows.join('');
  }catch(error){target.innerHTML=`<p class="warning">${escapeHtml(error.message)}</p>`;}
}
$('#chartTraderButton').addEventListener('click',()=>{if(activePanel==='trader'&&!$('#sidePanel').hidden){closePanel();$('#chartTraderButton').setAttribute('aria-expanded','false');}else openTradePanel();});
$('#quickBuy').addEventListener('click',()=>openTradePanel('long'));
$('#quickSell').addEventListener('click',()=>openTradePanel('short'));
$('#chartContextMenu').addEventListener('click',event=>{
  const button=event.target.closest('[data-trade-side]');if(button)openTradePanel(button.dataset.tradeSide);
  else if(event.target.closest('[data-trader-open]'))openTradePanel();
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#chartContextMenu'))closeContextMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();});
$('#chartGrid').addEventListener('contextmenu',event=>{
  if(!event.target.closest('.chart-host'))return;
  event.preventDefault();
  const menu=$('#chartContextMenu');const bounds=$('.workspace').getBoundingClientRect();
  menu.style.left=`${Math.max(8,Math.min(event.clientX-bounds.left,bounds.width-240))}px`;
  menu.style.top=`${Math.max(8,Math.min(event.clientY-bounds.top,bounds.height-100))}px`;menu.hidden=false;
});
loadSimAccounts();
function updateClock(){ $('#clock').textContent=new Date().toISOString().slice(11,19); }
updateClock(); setInterval(updateClock,1000);
function validMarket(value){ return /^[A-Z0-9/_-]{1,32}$/.test(value); }
function isBar(bar) { return Number.isFinite(bar?.time) && Number.isFinite(bar?.open) && Number.isFinite(bar?.high) && Number.isFinite(bar?.low) && Number.isFinite(bar?.close); }
const styleKeys = ['layout','panes','grid','priceScale','crosshair'];
function styleSlice(chartInstance) {
  const config=chartInstance?.renderer?.getConfig?.();
  if (!config || typeof config!=='object') return null;
  return Object.fromEntries(styleKeys.filter(key=>config[key] && typeof config[key]==='object').map(key=>[key,config[key]]));
}
function syncStyleFrom(originIndex) {
  if (!syncPrefs.style || styleSyncBusy) return;
  const slice=styleSlice(slots[originIndex]?.chart);
  if (!slice) return;
  styleSyncBusy=true;
  try { for (const slot of slots) if(slot.index!==originIndex && slot.chart && JSON.stringify(styleSlice(slot.chart))!==JSON.stringify(slice)) slot.chart.renderer.applyConfig(slice); }
  finally { styleSyncBusy=false; }
}
function clearGhosts(){for(const slot of slots)slot.chart?.renderer?.setExternalCrosshair?.(null);}
function syncCrosshairFrom(originIndex,event){
  if(!syncPrefs.crosshair)return;
  const origin=slots[originIndex]?.source;
  for(const slot of slots){
    if(slot.index===originIndex||!slot.chart)continue;
    const sameMarket=origin && slot.source?.id===origin.id && slot.source?.market===origin.market;
    slot.chart.renderer.setExternalCrosshair(event.time??null,sameMarket&&event.paneKind==='price'?event.price:null);
  }
}
function saveLayoutState(){
  try {localStorage.setItem(layoutStorageKey,JSON.stringify({count:slots.length,activeIndex,sync:syncPrefs,charts:slots.map(slot=>slot.params)}));}catch{}
}
function readLayoutState(){
  try{const value=JSON.parse(localStorage.getItem(layoutStorageKey));if(!value||typeof value!=='object')return null;
    const count=Number(value.count);if(!Number.isInteger(count)||count<1||count>6)return null;
    return {count,activeIndex:Math.max(0,Math.min(count-1,Number(value.activeIndex)||0)),sync:value.sync||{},charts:Array.isArray(value.charts)?value.charts:[]};
  }catch{return null;}
}
function validParams(value){return value && providerSpecs[value.id] && validMarket(String(value.market||'')) && ['1m','5m','15m','1h','4h','1d'].includes(value.timeframe);}
function selectedParams(){return {id:$('#provider').value,market:$('#market').value.trim().toUpperCase(),timeframe:$('#timeframe').value};}
function slotLabel(slot){return slot.source?`${slot.source.market} · ${slot.source.timeframe}`:slot.params?`${slot.params.market} · ${slot.params.timeframe}`:'Waiting for data';}
function makeSlot(index,params){
  const cell=document.createElement('section');cell.className='chart-cell';cell.dataset.slot=String(index);
  const head=document.createElement('button');head.type='button';head.className='chart-cell-head';head.innerHTML=`<span class="cell-number">${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(params.market)}</strong><small>${escapeHtml(params.timeframe)} · ${escapeHtml(providerSpecs[params.id].label)}</small>`;
  const host=document.createElement('div');host.className='chart-host';host.setAttribute('aria-label',`Quant Lab chart ${index+1}`);
  const error=document.createElement('div');error.className='chart-error';error.hidden=true;
  cell.append(head,host,error);cell.addEventListener('pointerdown',()=>activateSlot(index));head.addEventListener('click',()=>activateSlot(index));
  $('#chartGrid').append(cell);
  return {index,cell,head,host,error,params,chart:null,bars:[],source:null,sequence:0,unsub:[],premium:new Set(),premiumDrawings:new Map(),executionPanels:new Map(),executionPanelTab:'footprint',executionPanelCollapsed:false,tradeDrawings:[],cleoDrawingIds:[],cleoMarksVisible:true,cleoReadout:null,hover:null,fib:null,premiumStatus:''};
}
function renderExecutionPanel(slot){
  let panel=slot.host.querySelector('.execution-ladder');
  if(!slot.executionPanels.size){panel?.remove();return;}
  if(!panel){panel=document.createElement('section');panel.className='execution-ladder';panel.setAttribute('aria-label','Coinbase executed volume ladder');slot.host.append(panel);}
  if(!slot.executionPanels.has(slot.executionPanelTab))slot.executionPanelTab=slot.executionPanels.keys().next().value;
  const id=slot.executionPanelTab,{payload,result}=slot.executionPanels.get(id);
  const header=document.createElement('header');header.className='execution-ladder-head';
  const title=document.createElement('strong');title.textContent=`${id==='footprint'?'Footprint':'Volume Bubbles'} · ${payload.product}`;
  const collapse=document.createElement('button');collapse.type='button';collapse.textContent=slot.executionPanelCollapsed?'Expand':'Collapse';collapse.setAttribute('aria-expanded',String(!slot.executionPanelCollapsed));collapse.onclick=()=>{slot.executionPanelCollapsed=!slot.executionPanelCollapsed;renderExecutionPanel(slot);};
  header.append(title,collapse);panel.replaceChildren(header);panel.classList.toggle('collapsed',slot.executionPanelCollapsed);
  if(slot.executionPanelCollapsed)return;
  if(slot.executionPanels.size>1){
    const tabs=document.createElement('div');tabs.className='execution-ladder-tabs';
    for(const key of slot.executionPanels.keys()){
      const button=document.createElement('button');button.type='button';button.textContent=key==='footprint'?'Exact ticks':'Bubbles';button.setAttribute('aria-pressed',String(key===id));button.onclick=()=>{slot.executionPanelTab=key;renderExecutionPanel(slot);};tabs.append(button);
    }
    panel.append(tabs);
  }
  const note=document.createElement('p');note.className='execution-ladder-note';note.textContent=`${payload.source} · ${utc(payload.coverage.from)} · ${payload.coverage.trades} trades · ${payload.unit} · candle volume reconciled`;
  panel.append(note);
  const scroll=document.createElement('div');scroll.className='execution-ladder-scroll';
  const table=document.createElement('table'),thead=document.createElement('thead'),headRow=document.createElement('tr');
  const labels=id==='footprint'?['Bid sell','Exact price','Ask buy']:['Price bucket','Size','Delta'];
  for(const label of labels){const th=document.createElement('th');th.textContent=label;headRow.append(th);}thead.append(headRow);table.append(thead);
  const tbody=document.createElement('tbody');
  const decimals=Math.max(0,Math.min(8,Math.ceil(-Math.log10(payload.tickSize))));
  const number=value=>new Intl.NumberFormat('en-US',{maximumSignificantDigits:10}).format(value);
  if(id==='footprint'){
    for(const row of [...result.rows].reverse()){
      const tr=document.createElement('tr');tr.className=row.delta>=0?'buy-dominant':'sell-dominant';
      for(const value of [number(row.bidVolume),row.price.toFixed(decimals),number(row.askVolume)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);
    }
  }else{
    const largest=Math.max(...result.clusters.map(row=>row.volume));
    for(const row of [...result.clusters].reverse()){
      const tr=document.createElement('tr');tr.className=row.delta>=0?'buy-dominant':'sell-dominant';
      const price=document.createElement('td');price.textContent=row.price.toFixed(decimals);
      const size=document.createElement('td'),bubble=document.createElement('span');size.className='execution-bubble-cell';bubble.className='execution-bubble';
      const diameter=6+20*Math.sqrt(row.volume/largest);bubble.style.width=`${diameter}px`;bubble.style.height=`${diameter}px`;
      bubble.style.background=row.delta>=0?'#43b89c88':'#dc667488';bubble.title=`${number(row.volume)} ${payload.unit}`;
      size.append(bubble,document.createTextNode(number(row.volume)));
      const delta=document.createElement('td');delta.textContent=`${row.delta>=0?'+':''}${number(row.delta)}`;
      tr.append(price,size,delta);tbody.append(tr);
    }
  }
  table.append(tbody);scroll.append(table);panel.append(scroll);
}
function clearPremium(slot,id){
  if(id==='ttp-volume-analyst'){const handle=slot.chart?.indicators?.().find(item=>item.nativeType==='ttp-relative-volume');handle?.remove();}
  if(id==='smart-fib'){slot.fib?.destroy();slot.fib=null;slot.host.onpointerleave=null;}
  for(const drawingId of slot.premiumDrawings.get(id)||[])slot.chart?.drawings?.remove?.(drawingId);
  slot.premiumDrawings.delete(id);
  if(slot.executionPanels.delete(id))renderExecutionPanel(slot);
}
function drawFor(slot,id){
  const ids=[];slot.premiumDrawings.set(id,ids);
  return {add:(type,config)=>{const drawing=slot.chart.drawings.add(type,config);if(drawing?.id)ids.push(drawing.id);return drawing;},
    clear:()=>{for(const drawingId of ids)slot.chart.drawings.remove(drawingId);ids.length=0;}};
}
async function addPremium(slot,id){
  if(id==='ttp-volume-analyst'){
    clearPremium(slot,id);
    const handle=slot.chart?.addNativeIndicator?.('ttp-relative-volume',{inputs:{provider:slot.params.id,ticker:slot.params.market}});
    if(!handle)throw new Error('The chart could not create the native RelativeVolume indicator.');
    slot.premium.add(id);
    slot.premiumStatus=`TTP RelativeVolume · dedicated indicator pane · separately loads up to 5,000 prior bars to build the same-time UTC reference · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · last completed bar ${utc(slot.source.cutoff)} · descriptive, unscored.`;
    return;
  }
  if(quantPremiumItems[id]?.requiresExecutionFeed&&slot.params.id!=='coinbase')throw new Error('Select a Coinbase Exchange chart for executed-trade Footprint or Bubbles.');
  if(!slot.chart?.drawings?.supported||typeof slot.chart.drawings.add!=='function')throw new Error('This chart renderer cannot display research drawings.');
  const chartAtStart=slot.chart;
  clearPremium(slot,id);
  const draw=drawFor(slot,id);
  try{
    if(id==='liquidity'){
      const chartBars=completedBars(slot.bars,slot.params.timeframe,slot.source.snapshotAsOf);
      const contextFrames=['1m','5m','15m','30m','1h'];
      const wanted=(['1m','5m','15m','1h'].includes(slot.params.timeframe)?contextFrames:['30m','1h'])
        .filter(timeframe=>timeframe!==slot.params.timeframe);
      const series=await Promise.allSettled(wanted.map(async timeframe=>({timeframe,bars:await fetchBars({...slot.params,timeframe})})));
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const available=series.filter(result=>result.status==='fulfilled').map(result=>result.value);
      const result=renderLiquidityOverlay([{timeframe:slot.params.timeframe,bars:chartBars},...available],slot.params.timeframe,chartBars,draw.add);
      if(!result.count)throw new Error('No confirmed Liquidity levels are drawable in this completed-bar snapshot.');
      slot.premiumStatus=`Liquidity · ${result.count} chart drawings · ${result.method} · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · last completed bar opened ${utc(result.cutoff)} · descriptive, unscored.`;
    }else if(id==='smart-fib'){
      const sourceBars=await fetchBars({...slot.params,timeframe:'1h'});
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const closed=completedBars(sourceBars,'1h');
      if(closed.length<5)throw new Error('Smart Fib needs at least five completed 1h bars.');
      slot.fib=createSmartFibOverlay(slot.chart,closed,draw);
      if(!slot.fib.swingCount)throw new Error('No confirmed 1h swings are available in this snapshot.');
      slot.premiumStatus=`Smart Fib · ${slot.fib.swingCount} confirmed 1h swings · ${providerSpecs[slot.params.id].label} · ${slot.params.market} · last completed 1h bar opened ${utc(closed.at(-1).time)} · hover a swing to preview, then lock it in Tools · descriptive, unscored.`;
    }else if(['volume-profile','tpo','vwap'].includes(id)){
      const closed=completedBars(slot.bars,slot.params.timeframe,slot.source.snapshotAsOf);
      const result=renderQuantOrderFlow(id,closed,slot.params.timeframe,draw.add);
      slot.premiumStatus=`${quantPremiumItems[id].name} · ${result.status} · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · last completed bar opened ${utc(result.cutoff)} · descriptive, unscored.`;
    }else if(itemRequiresExecution(id)){
      const closed=completedBars(slot.bars,slot.params.timeframe,slot.source.snapshotAsOf),bar=closed.at(-1);
      if(!bar)throw new Error('No completed Coinbase bar is available.');
      const payload=await fetchCoinbaseFootprint(slot.params.market,{...bar,timeframe:slot.params.timeframe});
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const result=renderQuantExecutedOrderFlow(id,payload,draw.add);
      slot.executionPanels.set(id,{payload,result});slot.executionPanelTab=id;renderExecutionPanel(slot);
      slot.premiumStatus=`${quantPremiumItems[id].name} · ${result.status} · ${slot.params.market} ${slot.params.timeframe} · completed bar opened ${utc(result.cutoff)} · local research only; no redistribution or trade execution.`;
    }else{
      throw new Error('Unknown premium indicator.');
    }
    slot.premium.add(id);
  }catch(error){clearPremium(slot,id);throw error;}
}
function itemRequiresExecution(id){return Boolean(quantPremiumItems[id]?.requiresExecutionFeed);}
function updateSlotHead(slot){
  slot.head.innerHTML=`<span class="cell-number">${String(slot.index+1).padStart(2,'0')}</span><strong>${escapeHtml(slot.source?.market||slot.params.market)}</strong><small>${escapeHtml(slot.source?.timeframe||slot.params.timeframe)} · ${escapeHtml(providerSpecs[slot.params.id].label)}</small>`;
}
function refreshActivePanel(){
  if(activePanel==='connections')renderConnections();
  if(activePanel==='strategy')renderStrategy();
  if(activePanel==='indicators')void renderIndicators();
  if(activePanel==='replay')renderReplay();
  if(activePanel==='trader')renderChartTrader();
}
function activateSlot(index,refresh=true){
  const slot=slots[index];if(!slot)return;
  const changed=activeIndex!==index;
  activeIndex=index;chart=slot.chart;bars=slot.bars;source=slot.source;
  for(const item of slots)item.cell.classList.toggle('active',item.index===index);
  $('#provider').value=slot.params.id;$('#market').value=slot.params.market;$('#timeframe').value=slot.params.timeframe;
  $('#sourceCutoff').textContent=source?`LAST BAR ${utc(source.cutoff)}`:'CUTOFF —';
  $('#barCount').textContent=`${bars.length} bars · ${slots.length} chart${slots.length===1?'':'s'}`;
  if(slot.error.hidden)setStatus(source?`Chart ${index+1} · ${source.label} · ${source.market} · ${source.timeframe} · snapshot loaded ${utc(source.loadedAt)}`:`Chart ${index+1} · loading ${slot.params.market}…`);
  else setStatus(`Chart ${index+1} · ${slot.error.textContent}`,true);
  $('#loadChart').disabled=false;
  updateCleoMarksButton();
  if(changed){lastResult=null;lastRunKey='';if(refresh)refreshActivePanel();saveLayoutState();}
}
async function fetchBars(params){
  const key=`${params.id}|${params.market}|${params.timeframe}`;
  if(!pendingBars.has(key)){
    const Provider=window.Vela?.[providerSpecs[params.id].className];
    if(!Provider)throw new Error('Vela public provider is unavailable.');
    const request=new Provider().getBars(params.market,params.timeframe,{limit:500}).then(result=>result.filter(isBar).sort((a,b)=>a.time-b.time));
    pendingBars.set(key,request);
    request.finally(()=>{if(pendingBars.get(key)===request)pendingBars.delete(key);}).catch(()=>{});
  }
  return pendingBars.get(key);
}
async function loadSlot(index,params,reuse=null){
  const slot=slots[index];if(!slot)return;
  const sequence=++slot.sequence;slot.params={...params};updateSlotHead(slot);slot.error.hidden=true;
  const snapshotAsOf=reuse?.snapshotAsOf??Date.now();
  if(index===activeIndex){$('#loadChart').disabled=true;setStatus(`Chart ${index+1} · loading ${providerSpecs[params.id].label} · ${params.market} · ${params.timeframe}…`);}
  try{
    if(!validParams(params))throw new Error('Enter a valid market and interval.');
    if(!window.Vela?.Vela)throw new Error('Vela browser bundle is unavailable.');
    const nextBars=reuse?.bars || await fetchBars(params);
    if(slot.sequence!==sequence || slots[index]!==slot)return;
    if(!nextBars.length)throw new Error('The public provider returned no valid bars. Check the symbol or network.');
    for(const off of slot.unsub)off();slot.unsub=[];
    for(const id of slot.premium)clearPremium(slot,id);
    slot.cleoDrawingIds=[];
    slot.chart?.destroy();slot.host.replaceChildren();
    const nextChart=new window.Vela.Vela(slot.host,{symbol:params.market,timeframe:params.timeframe,data:nextBars,live:false,theme:'dark',drawings:true,volume:true,currentPriceLine:true,timeScale:{timezone:'UTC'},nativeBackend:'canvas2d',animations:{intro:false}});
    slot.chart=nextChart;
    await nextChart.ready();
    if(slot.sequence!==sequence || slots[index]!==slot){nextChart.destroy();return;}
    await new Promise(resolve=>requestAnimationFrame(resolve));nextChart.resize();
    slot.bars=nextBars;slot.source={...params,label:providerSpecs[params.id].label,type:providerSpecs[params.id].type,cutoff:nextBars.at(-1).time,snapshotAsOf,loadedAt:Date.now()};
    restoreCleoMarks(slot);
    slot.unsub.push(nextChart.on('drawing:edited',({id})=>{if(slot.cleoDrawingIds.includes(id))saveCleoMarks(slot);}));
    slot.unsub.push(nextChart.on('drawing:removed',({id})=>{
      if(!slot.cleoDrawingIds.includes(id))return;
      slot.cleoDrawingIds=slot.cleoDrawingIds.filter(item=>item!==id);saveCleoMarks(slot);updateCleoMarksButton();
    }));
    slot.unsub.push(nextChart.renderer.onCrosshairMove(event=>{
      if(Number.isFinite(Number(event.price)))slot.hover={price:Number(event.price),time:Number.isFinite(Number(event.time))?Number(event.time):slot.bars.at(-1)?.time};
      syncCrosshairFrom(index,event);
    }));
    slot.unsub.push(nextChart.renderer.onConfigChanged(()=>syncStyleFrom(index)));
    for(const id of slot.premium){
      try{await addPremium(slot,id);}catch(error){slot.premium.delete(id);slot.premiumStatus=`${quantPremiumItems[id].name} unavailable: ${error.message}`;}
    }
    updateSlotHead(slot);slot.error.hidden=true;
    if(syncPrefs.style && index!==activeIndex)syncStyleFrom(activeIndex);
    if(index===activeIndex){lastResult=null;lastRunKey='';activateSlot(index,false);refreshActivePanel();}
    saveLayoutState();
  }catch(error){
    if(slot.sequence!==sequence || slots[index]!==slot)return;
    slot.error.textContent=error.message;slot.error.hidden=false;
    if(index===activeIndex)activateSlot(index,false);
  }finally{if(index===activeIndex && slot.sequence===sequence)$('#loadChart').disabled=false;}
}
function resizeCharts(){requestAnimationFrame(()=>{for(const slot of slots)slot.chart?.resize();});}
function updateLayoutPicker(){
  $('#chartGrid').dataset.count=String(slots.length);
  $('#layoutCount').textContent=String(slots.length);
  $('#layoutButton').setAttribute('aria-label',`Chart layout, ${slots.length} chart${slots.length===1?'':'s'}`);
  $('#layoutDescription').textContent=`${slots.length} chart${slots.length===1?'':'s'} · select a chart to edit it`;
  for(const button of $('#layoutChoices').querySelectorAll('[data-layout-count]'))button.setAttribute('aria-pressed',String(Number(button.dataset.layoutCount)===slots.length));
}
function setLayout(count,{initial=false,charts=[]}={}){
  if(!Number.isInteger(count)||count<1||count>6)return;
  const seed=slots[activeIndex]?.source || selectedParams();
  while(slots.length>count){const slot=slots.pop();slot.sequence++;for(const off of slot.unsub)off();for(const id of slot.premium)clearPremium(slot,id);slot.chart?.destroy();slot.cell.remove();}
  const toLoad=[];
  while(slots.length<count){
    const index=slots.length;
    const raw=initial?charts[index]:null;
    const params=validParams(raw)?raw:{id:seed.id,market:seed.market,timeframe:seed.timeframe};
    const slot=makeSlot(index,params);slots.push(slot);
    const same=slots.find(item=>item!==slot && item.source?.id===params.id && item.source?.market===params.market && item.source?.timeframe===params.timeframe && item.bars.length);
    toLoad.push(loadSlot(index,params,same?{bars:same.bars,snapshotAsOf:same.source.snapshotAsOf}:null));
  }
  if(activeIndex>=count)activeIndex=count-1;
  updateLayoutPicker();activateSlot(activeIndex,false);resizeCharts();saveLayoutState();
  return Promise.allSettled(toLoad);
}
async function loadChart(){
  const chosen=selectedParams();
  if(!validParams(chosen)){setStatus('Enter a valid market symbol and interval.',true);return;}
  const tasks=slots.map((slot,index)=>{
    const current=slot.source||slot.params;
    return loadSlot(index,{
      id:syncPrefs.symbol||index===activeIndex?chosen.id:current.id,
      market:syncPrefs.symbol||index===activeIndex?chosen.market:current.market,
      timeframe:syncPrefs.interval||index===activeIndex?chosen.timeframe:current.timeframe,
    });
  });
  await Promise.allSettled(tasks);
}
for(let count=1;count<=6;count++){
  const button=document.createElement('button');button.type='button';button.className='layout-choice';button.dataset.layoutCount=String(count);button.title=`${count} chart${count===1?'':'s'}`;button.setAttribute('aria-label',button.title);
  const mini=document.createElement('span');mini.className='mini-layout';mini.dataset.count=String(count);for(let i=0;i<count;i++)mini.append(document.createElement('i'));button.append(mini);
  button.addEventListener('click',()=>{setLayout(count);$('#layoutPopover').hidden=true;$('#layoutButton').setAttribute('aria-expanded','false');});$('#layoutChoices').append(button);
}
$('#layoutButton').addEventListener('click',()=>{const popover=$('#layoutPopover');popover.hidden=!popover.hidden;$('#layoutButton').setAttribute('aria-expanded',String(!popover.hidden));});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.layout-control')){$('#layoutPopover').hidden=true;$('#layoutButton').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#layoutPopover').hidden=true;$('#layoutButton').setAttribute('aria-expanded','false');}});
for(const kind of ['symbol','interval','crosshair','style']){
  const input=$(`#sync${kind[0].toUpperCase()}${kind.slice(1)}`);
  input.addEventListener('change',()=>{syncPrefs[kind]=input.checked;saveLayoutState();if(kind==='crosshair')clearGhosts();else if(kind==='style')syncStyleFrom(activeIndex);else if(input.checked)void loadChart();});
}
$('#loadChart').addEventListener('click',loadChart);
$('#provider').addEventListener('change',()=>{$('#market').value=providerSpecs[$('#provider').value].market;setStatus('Source changed. Press Load chart to load its bars.');});
$('#market').addEventListener('keydown',event=>{if(event.key==='Enter')loadChart();});
$('#timeframe').addEventListener('change',()=>setStatus('Interval changed. Press Load chart to load its bars.'));
window.addEventListener('resize',resizeCharts);

async function renderIndicators() {
  panel('indicators','Indicators','<div class="indicator-tabs" role="tablist" aria-label="Chart study categories"><button type="button" role="tab" data-indicator-tab="vela">Vela defaults</button><button type="button" role="tab" data-indicator-tab="premium">Premium</button><button type="button" role="tab" data-indicator-tab="tools">Tools</button></div><p id="indicatorIntro"></p><p id="indicatorStatus" class="indicator-status" role="status" aria-live="polite"></p><div id="indicatorList" class="panel-list" role="tabpanel"></div>');
  for(const button of $('#panelBody').querySelectorAll('[data-indicator-tab]')){
    button.setAttribute('aria-selected',String(button.dataset.indicatorTab===indicatorTab));
    button.addEventListener('click',()=>{indicatorTab=button.dataset.indicatorTab;void renderIndicators();});
  }
  const list=$('#indicatorList');
  const slot=slots[activeIndex];
  $('#indicatorStatus').textContent=slot?.premiumStatus||'';
  if(indicatorTab!=='vela'){
    $('#indicatorIntro').textContent=indicatorTab==='premium'?'TTP RelativeVolume is a native indicator with its own lower pane. It loads additional public bars, up to the provider limit, to build the same-time UTC historical reference; outputs are descriptive and unscored.':'Interactive chart tools use confirmed swings. Hover the chart after adding Smart Fib to preview its levels.';
    const ids=indicatorTab==='premium'?['liquidity','volume-profile','tpo','vwap','footprint','volume-bubbles','ttp-volume-analyst']:['smart-fib'];
    for(const id of ids){
      const item=quantPremiumItems[id],active=Boolean(slot?.premium.has(id));
      const card=document.createElement('article');card.className=`card premium-card${active?' is-active':''}`;
      const image=document.createElement('img');image.src=`./tool-belt-assets/${item.image}`;image.alt='';image.className='premium-icon';
      const copy=document.createElement('div');copy.className='premium-copy';
      const title=document.createElement('strong');title.textContent=item.name;
      const detail=document.createElement('small');detail.textContent=item.description;
      const state=document.createElement('span');state.className='premium-state';state.textContent=active?'On selected chart':item.requiresExecutionFeed?(slot?.params.id==='coinbase'&&slot?.chart?'Coinbase trade check on Add':'Select Coinbase chart'):slot?.chart?'Available':'Load a chart';
      copy.append(title,detail,state);
      if(item.requiresExecutionFeed){const terms=document.createElement('a');terms.href='https://www.coinbase.com/legal/market_data';terms.target='_blank';terms.rel='noopener noreferrer';terms.textContent='Coinbase market-data terms ↗';terms.className='premium-terms';copy.append(terms);}
      const actions=document.createElement('div');actions.className='premium-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.textContent=active?'Remove':'Add';
      toggle.disabled=!slot?.chart||(item.requiresExecutionFeed&&slot?.params.id!=='coinbase');
      if(item.requiresExecutionFeed)toggle.title='Checks Coinbase trade coverage, maker-side inversion, product price increment, and candle-volume reconciliation before drawing.';
      toggle.addEventListener('click',async()=>{
        toggle.disabled=true;
        try{
          if(active){clearPremium(slot,id);slot.premium.delete(id);slot.premiumStatus=`${item.name} removed from chart ${slot.index+1}.`;}
          else await addPremium(slot,id);
        }catch(error){slot.premiumStatus=`${item.name} unavailable: ${error.message}`;}
        if(activePanel==='indicators'&&slots[activeIndex]===slot)void renderIndicators();
      });
      actions.append(toggle);
      if(id==='smart-fib'&&active){
        const lock=document.createElement('button');lock.type='button';lock.textContent=slot.fib?.locked?'Unlock swing':'Lock preview';
        lock.addEventListener('click',()=>{if(slot.fib?.locked)slot.fib.unlock();else if(!slot.fib?.lock())slot.premiumStatus='Hover a confirmed 1h swing on the chart before locking it.';void renderIndicators();});
        actions.append(lock);
      }
      card.append(image,copy,actions);list.append(card);
    }
    return;
  }
  if (!chart) { list.textContent='Load a chart first.'; return; }
  $('#indicatorIntro').textContent='Native Vela studies run in the renderer on the selected chart. They do not validate a trading strategy.';
  try {
    const indicators=await chart.availableNativeIndicators();
    if (activePanel!=='indicators'||indicatorTab!=='vela'||slots[activeIndex]!==slot)return;
    list.replaceChildren();
    for(const item of indicators){
      const card=document.createElement('div'); card.className='card';
      const title=document.createElement('strong'); title.textContent=item.title || item.type;
      const detail=document.createElement('small'); detail.textContent=item.supported ? (item.present?'On chart':'Available') : 'Unavailable for this market';
      const button=document.createElement('button'); button.type='button';button.textContent=item.present?'Remove':'Add';button.disabled=!item.supported;
      button.addEventListener('click',()=>{try{if(item.present){const handle=chart.indicators().find(h=>h.nativeType===item.type);handle?.remove();}else chart.addNativeIndicator(item.type);renderIndicators();}catch(error){setStatus(error.message,true);}});
      card.append(title,detail,button);list.append(card);
    }
    if(!indicators.length)list.textContent='No native indicators are available.';
  } catch(error){list.textContent=error.message;}
}
$('#indicatorButton').addEventListener('click',renderIndicators);

function replayInfo(){const state=chart?.replay?.state; const node=$('#replayState');if(node)node.textContent=state?.active?`Showing through ${state.cursorTime?utc(state.cursorTime):'loading'} · ${state.remaining} bars hidden`:'Replay off';}
function renderReplay(){panel('replay','Bar replay','<p>Replays only bars already loaded in this chart. Historical replay is a visual study, not a forward result.</p><label>Start at bar <input id="replayIndex" type="range" min="0" max="100" value="50"></label><p id="replayTarget"></p><div class="panel-row"><button id="replayStart">Start</button><button id="replayStep">Step</button><button id="replayPlay">Play</button><button id="replayPause">Pause</button><button id="replayStop">Stop</button></div><p id="replayState"></p>');
  if(!chart||bars.length<3){$('#replayTarget').textContent='Load a chart with at least three bars first.';return;}
  const slider=$('#replayIndex');slider.max=String(bars.length-2);slider.min='0';slider.value=String(Math.max(0,Math.floor(bars.length*.6)));
  const target=()=>{$('#replayTarget').textContent=`Start after ${utc(bars[Number(slider.value)].time)}`;};slider.addEventListener('input',target);target();replayInfo();
  $('#replayStart').addEventListener('click',async()=>{try{await chart.replay.start({from:bars[Number(slider.value)].time});replayInfo();}catch(error){$('#replayState').textContent=error.message;}});
  $('#replayStep').addEventListener('click',()=>{chart.replay.step();replayInfo();});
  $('#replayPlay').addEventListener('click',()=>{chart.replay.play(600);replayInfo();});
  $('#replayPause').addEventListener('click',()=>{chart.replay.pause();replayInfo();});
  $('#replayStop').addEventListener('click',()=>{chart.replay.stop();replayInfo();});
}
$('#replayButton').addEventListener('click',renderReplay);

const defaultStrategy={name:'SMA crossover',fast:9,slow:21,feeBps:0};
let draft={...defaultStrategy};
function renderStrategy(){
  panel('strategy','Paper backtest',`<p>Close-confirmed, long-only SMA crossover. An entry or exit signal fills at the next bar open. One unit per trade; fees are entered per side. Open positions remain unrealized. No slippage or funding model is included.</p><label>Study name<input id="studyName" maxlength="60" value="${escapeHtml(draft.name)}"></label><div class="panel-row"><label>Fast bars<input id="fastLength" type="number" min="2" max="299" value="${draft.fast}"></label><label>Slow bars<input id="slowLength" type="number" min="3" max="300" value="${draft.slow}"></label></div><label>Fee per side (basis points)<input id="feeBps" type="number" min="0" max="1000" step="0.1" value="${draft.feeBps}"></label><div class="panel-row"><button id="runStudy">Run on loaded bars</button><button id="saveStudy">Save version</button></div><div id="studyOutput"></div>`);
  $('#runStudy').addEventListener('click',()=>{try{readDraft();if(!source)throw new Error('Load a chart first.');lastResult=runSmaBacktest(bars,draft);lastRunKey=runKey();renderStudyResult(lastResult);}catch(error){lastResult=null;lastRunKey='';$('#studyOutput').textContent=error.message;}});
  $('#saveStudy').addEventListener('click',()=>{try{readDraft();if(!source||!lastResult||lastRunKey!==runKey())throw new Error('Run these exact settings on the loaded bars before saving.');const version={...draft,id:crypto.randomUUID(),createdAt:Date.now(),source:{...source},summary:{equity:lastResult.equity,trades:lastResult.trades.length,maxDrawdown:lastResult.maxDrawdown}};versions.unshift(version);save();$('#studyOutput').insertAdjacentHTML('afterbegin','<p class="good">Saved this tested version in this browser.</p>');}catch(error){$('#studyOutput').textContent=error.message;}});
  if(lastResult&&source)renderStudyResult(lastResult);
}
function readDraft(){draft={name:$('#studyName').value.trim()||'Untitled study',fast:Number($('#fastLength').value),slow:Number($('#slowLength').value),feeBps:Number($('#feeBps').value)};if(!Number.isInteger(draft.fast)||!Number.isInteger(draft.slow)||!Number.isFinite(draft.feeBps))throw new Error('Enter valid whole-number averages and fee.');}
function renderStudyResult(result){const output=$('#studyOutput');if(!output)return;const total=result.trades.length;const hit=total?fmt(result.wins/total*100,1)+'%':'—';output.innerHTML=`<h3>Historical simulation · ${escapeHtml(source.label)} · ${escapeHtml(source.market)} · ${escapeHtml(source.timeframe)}</h3><p class="muted">${result.bars} loaded bars · last bar ${utc(source.cutoff)} · 1 unit per trade · quote-currency P&amp;L</p><div class="metric-grid"><div class="metric">Closed trades<b>${total}</b></div><div class="metric">Win rate<b>${hit}</b></div><div class="metric">Net P&amp;L<b>${fmt(result.equity)}</b></div><div class="metric">Max closed-equity drawdown<b>${fmt(result.maxDrawdown)}</b></div></div><p class="warning">${result.openPosition?'One open position is excluded from closed-trade results.':'No open position at sample end.'} Fees: ${fmt(draft.feeBps,1)} bps/side. Slippage and funding excluded. Historical selection can overfit.</p><h3>Last closed trades</h3><table><thead><tr><th>Entry</th><th>Exit</th><th>Net</th></tr></thead><tbody>${result.trades.slice(-8).reverse().map(trade=>`<tr><td>${utc(trade.entryTime).slice(5,16)}</td><td>${utc(trade.exitTime).slice(5,16)}</td><td>${fmt(trade.pnl)}</td></tr>`).join('')}</tbody></table>`;}
$('#strategyButton').addEventListener('click',renderStrategy);

function renderLibrary(){panel('saved','Saved versions',`<p>Versions stay in this browser. Each result retains its market, timeframe, source, and last-bar cutoff.</p><div id="savedList"></div>`);const list=$('#savedList');for(const version of versions){const card=document.createElement('div');card.className='card';card.innerHTML=`<strong>${escapeHtml(version.name)}</strong><small>${escapeHtml(version.source?.label||'Unknown source')} · ${escapeHtml(version.source?.market||'—')} · ${escapeHtml(version.source?.timeframe||'—')} · ${version.source?.cutoff?utc(version.source.cutoff):'cutoff unknown'}</small><small>Fast ${version.fast} / Slow ${version.slow} · ${version.summary?.trades??'—'} closed trades · P&amp;L ${fmt(version.summary?.equity??0)}</small>`;const row=document.createElement('div');row.className='panel-row';const edit=document.createElement('button');edit.textContent='Load settings';edit.addEventListener('click',()=>{draft={name:version.name,fast:version.fast,slow:version.slow,feeBps:version.feeBps};lastResult=null;renderStrategy();});const remove=document.createElement('button');remove.textContent='Delete';remove.addEventListener('click',()=>{versions=versions.filter(item=>item.id!==version.id);save();renderLibrary();});row.append(edit,remove);card.append(row);list.append(card);}if(!versions.length)list.textContent='No saved studies yet. Run a paper backtest and save a version.';}
$('#libraryButton').addEventListener('click',renderLibrary);
function renderConnections(){const active=source?`${escapeHtml(source.label)} · ${escapeHtml(source.market)} · ${escapeHtml(source.timeframe)}<br>Loaded ${utc(source.loadedAt)} · last bar ${utc(source.cutoff)}`:'No chart source loaded.';panel('connections','Market data connections',`<div class="card"><strong>Active chart source</strong><p>${active}</p></div>${Object.entries(providerSpecs).map(([id,spec])=>`<div class="card"><strong>${escapeHtml(spec.label)}</strong><small>${escapeHtml(spec.type)} · public market bars through Vela</small><small>${source?.id===id?'ACTIVE SNAPSHOT':'AVAILABLE TO LOAD'}</small></div>`).join('')}<p class="warning">These are public market-data adapters. Broker login, balances, positions, fills, private streams, and order routing are not connected. A chart refresh requests a new snapshot; availability and freshness depend on the provider.</p>`);}
$('#connectionsButton').addEventListener('click',renderConnections);

for(const message of history){
  if(!message||!['user','assistant'].includes(message.role))continue;
  const row=document.createElement('p');
  row.className=message.role==='user'?'legacy-user':'legacy-assistant';
  row.textContent=`${message.role==='user'?'You':'Count Desk'}: ${String(message.displayContent||message.content||'')}`;
  $('#legacyChatMessages').append(row);
}
const cleoMarksStorageKey='count-desk-cleo-marks-v1';
const cleoReadsStorageKey='count-desk-cleo-reads-v1';
function cleoMarksKey(source){return [source?.id,source?.market,source?.timeframe,source?.cutoff].join('|');}
function readCleoMarks(){try{const value=JSON.parse(localStorage.getItem(cleoMarksStorageKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
function readCleoReads(){try{const value=JSON.parse(localStorage.getItem(cleoReadsStorageKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function archiveCleoRead(slot,spec){
  if(!slot?.source||!spec?.source||!Array.isArray(spec.marks))return false;
  try{
    const reads=readCleoReads();
    reads.unshift({id:crypto.randomUUID(),source:{id:slot.source.id,market:slot.source.market,timeframe:slot.source.timeframe,cutoff:slot.source.cutoff},
      readout:spec.readout||null,method:String(spec.method||'Chart read').slice(0,120),marks:spec.marks.slice(0,5),createdAt:Date.now()});
    localStorage.setItem(cleoReadsStorageKey,JSON.stringify(reads.slice(0,30)));
    renderCleoReadArchive();return true;
  }catch{return false;}
}
function renderCleoReadArchive(){
  const list=$('#cleoReadArchiveList');if(!list)return;
  list.replaceChildren();const reads=readCleoReads();
  if(!reads.length){list.textContent='No saved Cleo chart reads yet.';return;}
  for(const read of reads){
    const card=document.createElement('article');card.className='cleo-read-archive-card';
    const headline=document.createElement('strong');headline.textContent=read.readout?.headline||read.method||'Saved chart read';
    const detail=document.createElement('small');detail.textContent=`${read.source?.id||'source unknown'} · ${read.source?.market||'market unknown'} · ${read.source?.timeframe||'timeframe unknown'} · cutoff ${read.source?.cutoff?utc(read.source.cutoff):'unknown'} · ${new Date(read.createdAt).toLocaleString()}`;
    const rationale=document.createElement('p');rationale.textContent=read.readout?.takeaway||`${read.marks?.length||0} saved chart marks`;
    const button=document.createElement('button');button.type='button';button.textContent='Show on matching chart';
    const matches=slots.some(slot=>slot.source&&slot.source.id===read.source?.id&&slot.source.market===read.source?.market&&slot.source.timeframe===read.source?.timeframe&&Number(slot.source.cutoff)===Number(read.source?.cutoff));
    button.disabled=!matches;
    button.title=matches?'Restore this Cleo mark set on its original chart.':'Load the same source, market, timeframe, and cutoff to restore these marks.';
    button.addEventListener('click',()=>{
      const index=slots.findIndex(slot=>slot.source&&slot.source.id===read.source?.id&&slot.source.market===read.source?.market&&slot.source.timeframe===read.source?.timeframe&&Number(slot.source.cutoff)===Number(read.source?.cutoff));
      if(index<0)return;
      activateSlot(index,false);
      try{applyCleoMarkup({schema:'cleo.chart-markup.v1',chart:index+1,method:read.method,source:{provider:read.source.id,symbol:read.source.market,timeframe:read.source.timeframe,cutoff:read.source.cutoff},readout:read.readout,marks:read.marks});$('#cleoReadArchive').close();}
      catch(error){setStatus(`Saved marks could not be restored · ${error.message}`,true);}
    });
    card.append(headline,detail,rationale,button);list.append(card);
  }
}
$('#savedCleoReads').addEventListener('click',()=>{renderCleoReadArchive();$('#cleoReadArchive').showModal();});
$('#closeCleoReadArchive').addEventListener('click',()=>$('#cleoReadArchive').close());
$('#cleoReadArchive').addEventListener('click',event=>{if(event.target===$('#cleoReadArchive'))$('#cleoReadArchive').close();});
function saveCleoMarks(slot){
  if(!slot?.source)return;
  try{
    const all=readCleoMarks(),key=cleoMarksKey(slot.source),ids=new Set(slot.cleoDrawingIds||[]);
    const drawings=(slot.chart?.drawings?.all?.()||[]).filter(item=>ids.has(item.id)).map(item=>({type:item.type,paneId:item.paneId,anchors:item.anchors,style:item.style,text:item.text,props:item.props,zIndex:item.zIndex}));
    if(drawings.length)all[key]={source:{id:slot.source.id,market:slot.source.market,timeframe:slot.source.timeframe,cutoff:slot.source.cutoff},drawings,readout:slot.cleoReadout||null,savedAt:Date.now()};
    else delete all[key];
    const keys=Object.keys(all);for(const stale of keys.slice(0,Math.max(0,keys.length-20)))delete all[stale];
    localStorage.setItem(cleoMarksStorageKey,JSON.stringify(all));
  }catch{}
}
function restoreCleoMarks(slot){
  if(!slot?.source||!slot.chart?.drawings?.supported)return;
  const stored=readCleoMarks()[cleoMarksKey(slot.source)];
  if(!stored||Number(stored.source?.cutoff)!==Number(slot.source.cutoff)||!Array.isArray(stored.drawings))return;
  const ids=[];
  try{
    for(const item of stored.drawings.slice(0,40)){
      if(!['trendline','ray','hray','hline','box'].includes(item?.type)||!Array.isArray(item.anchors)||!item.anchors.length||item.anchors.length>2)continue;
      if(item.anchors.some(point=>!Number.isFinite(Number(point?.time))||!Number.isFinite(Number(point?.price))||Number(point.price)<=0))continue;
      const type=item.type==='hline'?'hray':item.type;
      const style=item.style&&typeof item.style==='object'?{...item.style,lineWidth:1}:{lineWidth:1};
      const drawing=slot.chart.drawings.add(type,{paneId:'price',anchors:item.anchors,style,props:item.props,zIndex:item.zIndex});
      if(drawing?.id)ids.push(drawing.id);
    }
  }catch{for(const id of ids)slot.chart.drawings.remove(id);return;}
  slot.cleoDrawingIds=ids;
  slot.cleoReadout=stored.readout||null;
  slot.cleoMarksVisible=true;
}
function clearCleoMarks(slot){
  for(const id of [...(slot?.cleoDrawingIds||[])])slot.chart?.drawings?.remove?.(id);
  if(slot)slot.cleoDrawingIds=[];
  saveCleoMarks(slot);
  updateCleoMarksButton();
}
function updateCleoMarksButton(){
  const button=$('#toggleCleoMarks'),clear=$('#clearCleoMarks');
  if(!button||!clear)return;
  const count=slots[activeIndex]?.cleoDrawingIds?.length||0;
  button.hidden=count===0;
  button.textContent=`✦ ${slots[activeIndex]?.cleoMarksVisible===false?'Show':'Hide'} Cleo marks · ${count}`;
  button.setAttribute('aria-pressed',String(slots[activeIndex]?.cleoMarksVisible!==false));
  clear.hidden=count===0;
}
$('#toggleCleoMarks').addEventListener('click',()=>{
  const slot=slots[activeIndex];if(!slot?.chart)return;
  slot.cleoMarksVisible=slot.cleoMarksVisible===false;
  for(const id of slot.cleoDrawingIds)slot.chart.drawings?.setVisible?.(id,slot.cleoMarksVisible);
  updateCleoMarksButton();
});
$('#clearCleoMarks').addEventListener('click',()=>clearCleoMarks(slots[activeIndex]));
function applyCleoMarkup(spec){
  const chartIndex=Number(spec.chart);
  const slot=Number.isInteger(chartIndex)&&chartIndex>=1?slots[chartIndex-1]:null;
  if(!slot?.chart||!slot.source||!slot.bars.length)throw new Error('That chart is no longer loaded.');
  const sourceSpec=spec.source||{};
  if(sourceSpec.provider!==slot.source.id||String(sourceSpec.symbol||'').toUpperCase()!==slot.source.market||sourceSpec.timeframe!==slot.source.timeframe||Number(sourceSpec.cutoff)!==Number(slot.source.cutoff))
    throw new Error('The chart source or cutoff changed. Ask Cleo to refresh its read before marking.');
  if(!slot.chart.drawings?.supported||typeof slot.chart.drawings.add!=='function')throw new Error('This chart cannot accept native marks right now.');
  if(!Array.isArray(spec.marks)||spec.marks.length<1||spec.marks.length>5)throw new Error('A markup must contain 1–5 focused marks.');
  const minTime=Number(slot.bars[0].time),cutoff=Number(slot.source.cutoff);
  const barsByTime=new Map(slot.bars.map(bar=>[Number(bar.time),bar]));
  const roleStyle={OBSERVED:{color:'#69c8bc',dash:'solid'},CONTEXT:{color:'#88a9b8',dash:'solid'},PRIMARY_PROJECTION:{color:'#c3a1ff',dash:'dashed'},ALTERNATE_PROJECTION:{color:'#9c8bb7',dash:'dotted'},INVALIDATION:{color:'#ef7888',dash:'dashed'}};
  const seen=new Set();
  for(const mark of spec.marks){
    if(!mark||typeof mark.id!=='string'||!/^[-a-zA-Z0-9_]{1,50}$/.test(mark.id)||seen.has(mark.id))throw new Error('Cleo returned an invalid or repeated mark id.');
    seen.add(mark.id);
    if(!roleStyle[mark.role]||!['level','trendline','ray','zone'].includes(mark.geometry)||!Array.isArray(mark.anchors))throw new Error(`Unsupported mark ${mark.id}.`);
    if(!Array.isArray(mark.evidenceRefs)||!mark.evidenceRefs.length||mark.evidenceRefs.length>16)throw new Error(`Missing loaded-bar evidence for ${mark.id}.`);
    const evidenceTimes=new Set(mark.evidenceRefs.map(Number));
    if([...evidenceTimes].some(time=>!Number.isFinite(time)||!barsByTime.has(time)))throw new Error(`Unknown evidence bar for ${mark.id}.`);
    const anchorCount=mark.geometry==='level'?1:2;
    if(mark.anchors.length!==anchorCount)throw new Error(`A ${mark.geometry} needs ${anchorCount} sourced anchor${anchorCount===1?'':'s'} (${mark.id}).`);
    const isProjection=['PRIMARY_PROJECTION','ALTERNATE_PROJECTION'].includes(mark.role);
    if((mark.geometry==='ray')!==isProjection)throw new Error(`Use a ray only for a conditional projection (${mark.id}).`);
    if(mark.anchors.length===2&&Number(mark.anchors[1]?.time)<=Number(mark.anchors[0]?.time))throw new Error(`Order the two ${mark.geometry} anchors from left to right (${mark.id}).`);
    for(const point of mark.anchors){
      const time=Number(point?.time),price=Number(point?.price);
      if(!Number.isFinite(time)||!Number.isFinite(price)||price<=0||time<minTime||time>cutoff)throw new Error(`Use only loaded-bar anchors in ${mark.id}.`);
      const bar=barsByTime.get(time);
      if(!bar||!evidenceTimes.has(time))throw new Error(`Anchor ${mark.id} must use a cited loaded bar time.`);
      if(price<Number(bar.low)||price>Number(bar.high))throw new Error(`Anchor ${mark.id} is outside its cited bar range.`);
    }
    if(mark.label!=null&&(typeof mark.label!=='string'||mark.label.length>18||/[\r\n]/.test(mark.label)))throw new Error(`Keep chart labels to 18 characters on one line (${mark.id}).`);
  }
  const currentCleoIds=new Set(slot.cleoDrawingIds||[]);
  const existingLines=(slot.chart.drawings.all?.()||[]).filter(item=>!currentCleoIds.has(item.id)&&['trendline','ray','hray','hline'].includes(item.type));
  const lineEquation=(geometry,anchors)=>{
    if(geometry==='level'||geometry==='hray'||geometry==='hline'){
      const time=Number(anchors[0]?.time),price=Number(anchors[0]?.price);
      return {slope:0,time,price,startTime:geometry==='hline'?-Infinity:time,endTime:Infinity};
    }
    const [a,b]=anchors||[];
    if(!a||!b||Number(b.time)===Number(a.time))return null;
    const startTime=Math.min(Number(a.time),Number(b.time));
    const endTime=geometry==='ray'?Infinity:Math.max(Number(a.time),Number(b.time));
    return {slope:(Number(b.price)-Number(a.price))/(Number(b.time)-Number(a.time)),time:startTime,price:Number(a.price),startTime,endTime};
  };
  for(const mark of spec.marks){
    if(mark.geometry==='zone')continue;
    const candidate=lineEquation(mark.geometry,mark.anchors);
    if(existingLines.some(item=>{
      const existing=lineEquation(item.type,item.anchors);
      if(!existing||!candidate)return false;
      const overlapStart=Math.max(existing.startTime,candidate.startTime);
      if(overlapStart>Math.min(existing.endTime,candidate.endTime))return false;
      const slopeScale=Math.max(1,Math.abs(existing.slope),Math.abs(candidate.slope));
      if(Math.abs(existing.slope-candidate.slope)>1e-18*slopeScale)return false;
      const sharedPrice=existing.price+existing.slope*(overlapStart-existing.time);
      const candidatePrice=candidate.price+candidate.slope*(overlapStart-candidate.time);
      return Math.abs(sharedPrice-candidatePrice)<=1e-8*Math.max(1,Math.abs(sharedPrice),Math.abs(candidatePrice));
    }))throw new Error(`Cleo skipped a line that duplicates an existing chart drawing (${mark.id}).`);
  }
  const nextIds=[];
  const add=(type,anchors,mark)=>{
    const style=roleStyle[mark.role];
    // Vela places new line drawings just below the price series by default, keeping candle bodies and wicks in front.
    const label=String(mark.label||'').trim();
    const drawing=slot.chart.drawings.add(type,{paneId:'price',anchors,style:{lineColor:style.color,lineWidth:1.5,lineStyle:style.dash,...(mark.geometry==='zone'?{fillColor:`${style.color}24`}:{})},...(label?{text:{value:label,color:style.color,size:'tiny',hAlign:'right',vAlign:'bottom'}}:{})});
    if(!drawing?.id)throw new Error('Vela did not return a drawing id.');
    nextIds.push(drawing.id);
  };
  try{
    for(const mark of spec.marks){
      const type=mark.geometry==='level'?'hray':mark.geometry==='zone'?'box':mark.geometry;
      add(type,mark.anchors,mark);
    }
  }catch(error){for(const id of nextIds)slot.chart.drawings.remove(id);throw error;}
  clearCleoMarks(slot);slot.cleoDrawingIds=nextIds;slot.cleoMarksVisible=true;slot.cleoReadout=spec.readout||null;saveCleoMarks(slot);
  const archived=archiveCleoRead(slot,spec);
  updateCleoMarksButton();
  const explanation=String(spec.method||'Provisional chart assessment').slice(0,100);
  return {message:`${nextIds.length} chart mark${nextIds.length===1?'':'s'} added · ${archived?'saved to Cleo’s chart archive':'archive unavailable in this browser'} · ${explanation}`};
}
function normalizeChartTimestamp(value){
  if(typeof value==='number'&&Number.isFinite(value))return Math.abs(value)>=1e9&&Math.abs(value)<1e11?value*1000:value;
  if(typeof value!=='string'||!value.trim())return NaN;
  const numeric=Number(value);
  if(Number.isFinite(numeric))return Math.abs(numeric)>=1e9&&Math.abs(numeric)<1e11?numeric*1000:numeric;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:NaN;
}
function applyMarketReadMarkup(payload,chartContext){
  if(payload?.schema!=='cleo.market-read.v1')throw new Error('Cleo returned an unsupported market-read schema.');
  const chartIndex=Number(chartContext?.chart),slot=Number.isInteger(chartIndex)&&chartIndex>=1?slots[chartIndex-1]:null;
  if(!slot?.chart||!slot.source||!slot.bars.length)throw new Error('The chart used for this read is no longer loaded.');
  const source=payload.source||{};
  const returnedProvider=String(source.provider||'').toLowerCase();
  const providerAliases=[slot.source.id,slot.source.label].map(value=>String(value||'').toLowerCase()).filter(Boolean);
  const providerMatches=Boolean(returnedProvider)&&providerAliases.some(alias=>returnedProvider===alias||[' —',' –',' ·',' -',' ('].some(separator=>returnedProvider.startsWith(`${alias}${separator}`)));
  if(!providerMatches)throw new Error(`The read provider ${source.provider||'(missing)'} does not match ${slot.source.label}.`);
  if(String(source.symbol||'').toUpperCase()!==slot.source.market)throw new Error(`The read symbol ${source.symbol||'(missing)'} does not match ${slot.source.market}.`);
  if(source.timeframe!==slot.source.timeframe)throw new Error(`The read timeframe ${source.timeframe||'(missing)'} does not match ${slot.source.timeframe}.`);
  const readCutoff=normalizeChartTimestamp(source.cutoff);
  if(!Number.isFinite(readCutoff)||readCutoff!==Number(slot.source.cutoff))
    throw new Error(`The read cutoff ${source.cutoff||'(missing)'} does not match the loaded chart cutoff ${utc(slot.source.cutoff)}.`);
  const markMap=new Map();
  for(const section of Object.values(payload.sections||{}))for(const mark of Array.isArray(section?.marks)?section.marks:[]){
    if(!markMap.has(mark?.id))markMap.set(mark?.id,mark);
  }
  const marks=[...markMap.values()];
  if(!marks.length)return {message:'Cleo returned no source-validated active-chart marks.'};
  if(marks.length>5)throw new Error(`Cleo returned ${marks.length} marks; the chart supports up to 5 focused marks per read.`);
  const chartMarks=marks.map(mark=>{
    if(mark.timeframe!==slot.source.timeframe)throw new Error(`Mark ${mark.id} uses ${mark.timeframe||'an unknown timeframe'}, while the active chart is ${slot.source.timeframe}.`);
    if(!['level','trend','trendline','zone'].includes(mark.geometry)||!Array.isArray(mark.anchors))throw new Error(`Mark ${mark.id} has unsupported geometry.`);
    if(typeof mark.evidence!=='string'||!mark.evidence.trim())throw new Error(`Mark ${mark.id} has no evidence description.`);
    const label=String(mark.label||mark.id).replace(/[\r\n]/g,' ').trim();
    return {id:mark.id,geometry:mark.geometry==='trend'?'trendline':mark.geometry,role:'OBSERVED',
      label:label.length>18?`${label.slice(0,17)}…`:label,
      anchors:mark.anchors.map(point=>({time:normalizeChartTimestamp(point?.time),price:Number(point?.price)})),
      evidenceRefs:mark.anchors.map(point=>normalizeChartTimestamp(point?.time))};
  });
  return applyCleoMarkup({schema:'cleo.chart-markup.v1',chart:chartIndex,
    method:'Read the Market · sourced active-chart marks',
    source:{provider:slot.source.id,symbol:slot.source.market,timeframe:slot.source.timeframe,cutoff:slot.source.cutoff},
    marks:chartMarks});
}
const readMarketTimeframes=['1d','4h','2h','1h','30m','15m','5m','3m','2m','1m'];
async function collectReadMarket(onProgress=()=>{}){
  const active=slots[activeIndex];
  if(!active?.source||!active.bars.length)throw new Error('Load a chart before requesting a market read.');
  const initialSource=active.source;
  const cutoff=Number(active.source.cutoff);
  if(!Number.isFinite(cutoff))throw new Error('The active chart cutoff is unavailable.');
  let completed=0;
  const frames=await Promise.all(readMarketTimeframes.map(async timeframe=>{
    try{
      const params={id:active.source.id,market:active.source.market,timeframe};
      const raw=timeframe===active.source.timeframe?active.bars:await fetchBars(params);
      const eligible=raw.filter(isBar).filter(bar=>Number(bar.time)<=cutoff).sort((a,b)=>a.time-b.time).slice(-300);
      return {timeframe,status:eligible.length?'available':'unavailable',bars:eligible.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume})),error:eligible.length?'':'No stored bars at or before the active chart cutoff.'};
    }catch(error){return {timeframe,status:'unavailable',bars:[],error:error.message};}
    finally{completed++;onProgress(completed,readMarketTimeframes.length);}
  }));
  if(slots[activeIndex]!==active||active.source!==initialSource||Number(active.source.cutoff)!==cutoff)throw new Error('The active chart changed while snapshots were collected. Start again.');
  return {schema:'cleo.market-read-context.v1',source:{provider:active.source.id,label:active.source.label,symbol:active.source.market,timeframe:active.source.timeframe,cutoff},requestedTimeframes:readMarketTimeframes,capturedAt:new Date().toISOString(),frames};
}
createCodexWidget($('#quantCodexHost'),{surface:'quant-lab',applyChartMarkup:applyCleoMarkup,applyMarketReadMarkup,collectReadMarket,
captureChartImage:()=>slots[activeIndex]?.chart?.renderer?.screenshot?.()||'',contextProvider:()=>{
  const active=slots[activeIndex];
  if(!active?.source||!active.bars.length)return null;
  const charts=slots.filter(slot=>slot.source&&slot.bars.length).map(slot=>{
    const activeChart=slot.index===activeIndex;
    const drawings=slot.chart?.drawings?.all?.()||[];
    const visibleRange=slot.chart?.getVisibleRange?.()||null;
    const from=Number(visibleRange?.from),to=Number(visibleRange?.to);
    const rangeIsValid=Number.isFinite(from)&&Number.isFinite(to)&&to>from;
    const rangeBars=rangeIsValid?slot.bars.filter(bar=>Number(bar.time)>=from-(to-from)*0.15&&Number(bar.time)<=to):[];
    // Keep chart reads focused on what is actually visible, with a little left context for swing structure.
    // The full bar set stays loaded locally and remains the authority for validating returned anchors.
    const analysisBars=rangeBars.length?rangeBars.slice(-320):slot.bars.slice(activeChart?-320:-120);
    return {chart:slot.index+1,provider:slot.source.id,sourceLabel:slot.source.label,symbol:slot.source.market,
      timeframe:slot.source.timeframe,cutoff:slot.source.cutoff,loadedAt:slot.source.loadedAt,
      freshness:'unverified public provider snapshot',barCount:slot.bars.length,contextBarCount:analysisBars.length,
      visibleRange,
      studies:[...slot.premium,...(slot.chart?.indicators?.()||[]).map(item=>item.nativeType).filter(Boolean)],
      drawings:drawings.slice(-80).map(item=>({id:item.id,type:item.type,anchors:item.anchors,
        label:item.text?.value||item.text?.text||''})),
      bars:analysisBars.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}))};
  });
  return {tab:'Quant Lab',activeChart:activeIndex+1,chartCount:charts.length,charts,capturedAt:new Date().toISOString()};
}});

const restoredLayout=readLayoutState();
if(restoredLayout){
  for(const kind of Object.keys(syncPrefs))syncPrefs[kind]=restoredLayout.sync[kind]===true;
  activeIndex=restoredLayout.activeIndex;
}
for(const kind of Object.keys(syncPrefs))$(`#sync${kind[0].toUpperCase()}${kind.slice(1)}`).checked=syncPrefs[kind];
void setLayout(restoredLayout?.count||1,{initial:true,charts:restoredLayout?.charts||[]});

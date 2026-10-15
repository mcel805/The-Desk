import {applyTradingCandles,mountTradingChartSettings} from './trading-chart-settings.js';
import {mountChartTrading} from './chart-trading-controls.js?v=1';
import {createQuantGame,gameMarketAllowed,gameStudyCount} from './quant-game.js?v=14';
import {startCryptoDesk} from './crypto-day-desk.js?v=jev-nextbar-review-1';
import {registerTaperVolume} from './taper-volume.mjs?v=clean-chart-1';
import {analyze as analyzePineWaveCourt,render as renderPineWaveCourt,DEFAULTS as pineDefaults} from './wave-court-port.mjs';
const cryptoDeskEnabled=location.pathname.endsWith('/crypto-day.html');
const routeParams=new URLSearchParams(location.search);
const selectedTradingStrategy=routeParams.get('strategy')==='day'||routeParams.get('game')==='1'?'day':'hourly';
const quantGameEnabled=selectedTradingStrategy==='day'&&!cryptoDeskEnabled;
if(quantGameEnabled)document.body.classList.add('quant-game');
import {runSmaBacktest} from './quant-backtest.mjs';
import {completedBars,createSmartFibOverlay,quantPremiumItems,renderLiquidityOverlay} from './quant-premium-overlays.mjs?v=8';
import {WAVE_FRAMES,analyzeWaveCourt,renderWaveCourtOverlay,taperEvidence} from './quant-wave-court.mjs?v=3';
import {buildLiquidGravity,renderLiquidGravity} from './liquid-gravity.mjs?v=3';
import {renderLiquidityForce} from './quant-liquidity-force.mjs?v=6';
import {renderQuantOrderFlow,renderQuantExecutedOrderFlow} from './quant-order-flow-overlays.mjs?v=2';
import {fetchCoinbaseFootprint} from './coinbase-footprint-feed.mjs';
import {registerVolumeAnalyst} from './volume-analyst.mjs?v=5';
import {createCodexWidget} from './codex-widget.js?v=41';

const $ = selector => document.querySelector(selector);
if(routeParams.get('game')==='1'&&!routeParams.has('strategy')){
  routeParams.delete('game');routeParams.set('strategy','day');window.history.replaceState(null,'',`${location.pathname}?${routeParams.toString()}`);
}
$('#tradingStrategy').value=selectedTradingStrategy;
$('#tradingStrategy').addEventListener('change',event=>{
  const next=new URL(location.href);next.search='';next.searchParams.set('strategy',event.currentTarget.value);location.assign(next.href);
});
$('#strategyAgentScope').textContent=quantGameEnabled
  ?'DAY TRADING · BTC / ETH / SOL · Wave Court uses seven-frame research context; the chart and paper entries remain scoped to the active 1-minute tape and frozen 15-minute liquidity field.'
  :'1-HOUR WORKFLOW · Cleo handles market research; Shammy handles Elliott Wave structure across the analyst reference charts.';
registerVolumeAnalyst();
registerTaperVolume();
const providerSpecs = {
  binance:{label:'Binance public data',className:'BinanceProvider',market:'BTCUSDT',type:'spot or perpetual, according to market symbol'},
  coinbase:{label:'Coinbase Exchange public data',className:'CoinbaseProvider',market:'BTC-USD',type:'spot'},
  hyperliquid:{label:'Hyperliquid public data',className:'HyperliquidProvider',market:'BTC',type:'perpetual or spot, according to market symbol'},
  tickstream:{label:'Tickstream local delayed MYM',market:'MYM',type:'futures stream; exact dated contract unresolved, memory-only history'},
};
if(quantGameEnabled||cryptoDeskEnabled)$('#provider option[value="tickstream"]')?.remove();
const storageKey = 'count-desk-quant-lab-v1';
const versionsKey = 'count-desk-quant-lab-strategies-v1';
const layoutStorageKey = cryptoDeskEnabled?'count-desk-crypto-day-layout-v1':quantGameEnabled?'count-desk-range-trader-layout-v1':'count-desk-quant-lab-layout-v1';
let chart = null;
let bars = [];
let source = null;
let slots = [];
let activeIndex = 0;
const referenceTimeframes=['1d','4h','1h','30m','15m','5m'];
const referenceHistoryLimit=5000;
const analysisOutputPairKey='count-desk-quant-lab-analysis-output-pair-v1';
const outputTimeframeLabels={'1d':'Daily','4h':'4 hour','1h':'1 hour','30m':'30 minute','15m':'15 minute','5m':'5 minute'};
let referenceCharts=[];
let referenceLoadSequence=0;
let analysisReturnSlotIndex=0;
let referenceSnapshot=null;
let syncPrefs = {symbol:false,interval:false,crosshair:false,style:false};
let styleSyncBusy = false;
const pendingBars = new Map();
let history = [];
let versions = [];
let activePanel = '';
let indicatorTab = 'vela';
let lastResult = null;
let lastRunKey = '';
const accountStorageKey = cryptoDeskEnabled?'count-desk-crypto-day-sim-account-v1':'count-desk-trading-active-sim-account-v1';
let simAccounts = [];
let currentCryptoCycle = null;
let activeAccountId = '';
let traderView = 'trade';
let quantLabPositions = [];
let quantLabOrders = [];
let scoreboardPositions = [];
let scoreboardLoadState = 'loading';
let ticketPositionId = '';
let ticketBarTime = 0;
let contextPrice = null;
let contextTime = null;
let chartTrading = null;

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
  const eligible=cryptoDeskEnabled?simAccounts.filter(a=>a.account_id===currentCryptoCycle?.account.account_id):(quantGameEnabled?simAccounts.filter(a=>a.name.startsWith('Range Trader SIM-')):simAccounts);
  for(const account of eligible){const option=document.createElement('option');option.value=account.account_id;option.textContent=`${account.name} · ${Number(account.starting_balance).toLocaleString(undefined,{style:'currency',currency:account.currency||'USD',maximumFractionDigits:0})}`;picker.append(option);}
  if(!eligible.some(item=>item.account_id===activeAccountId))activeAccountId=eligible[0]?.account_id||'';
  picker.value=activeAccountId;
  try{if(activeAccountId)localStorage.setItem(accountStorageKey,activeAccountId);else localStorage.removeItem(accountStorageKey);}catch{}
  if(source)void loadQuantLabPositions();
}
async function loadSimAccounts(){
  try{if(cryptoDeskEnabled){const response=await fetch('/api/crypto-desk/cycle');const cycle=await response.json();if(!response.ok)throw new Error(cycle.error||'Monthly account unavailable');currentCryptoCycle=cycle;activeAccountId=cycle.account.account_id;}const data=await simRequest('accounts',{method:'GET'});simAccounts=data.accounts||[];
    try{if(!cryptoDeskEnabled)activeAccountId=localStorage.getItem(accountStorageKey)||activeAccountId;}catch{}
    syncAccountPicker();
    void loadScoreboardLedger();
    renderTraderScoreboard();
    if(activePanel==='trader')renderChartTrader();
  }catch(error){simAccounts=[];syncAccountPicker();$('#activeSimAccount').title=error.message;scoreboardLoadState='error';renderTraderScoreboard(error.message);}
}
$('#activeSimAccount').addEventListener('change',event=>{
  activeAccountId=event.target.value;
  try{if(activeAccountId)localStorage.setItem(accountStorageKey,activeAccountId);else localStorage.removeItem(accountStorageKey);}catch{}
  renderTraderScoreboard();
  if(activePanel==='trader')renderChartTrader();
  void loadQuantLabPositions();
});
function closeContextMenu(){const menu=$('#chartContextMenu');menu.hidden=true;}
function scoreboardMoney(value,currency='USD'){
  try{return Number(value||0).toLocaleString(undefined,{style:'currency',currency:currency||'USD',maximumFractionDigits:2});}
  catch{return `${currency||'USD'} ${Number(value||0).toLocaleString(undefined,{maximumFractionDigits:2})}`;}
}
function traderStats(positions){
  const closed=positions.filter(item=>item.status==='closed'&&item.gross_pnl!=null&&Number.isFinite(Number(item.gross_pnl)));
  const open=positions.filter(item=>item.status==='open');
  const gross=closed.reduce((sum,item)=>sum+Number(item.gross_pnl),0);
  const wins=closed.filter(item=>Number(item.gross_pnl)>0).length;
  const losses=closed.filter(item=>Number(item.gross_pnl)<0).length;
  return {closed,open,gross,wins,losses,winRate:closed.length?wins/closed.length*100:null};
}
async function loadScoreboardLedger(){
  scoreboardLoadState='loading';renderTraderScoreboard();
  try{
    const result=await simRequest('quant-lab/positions',{method:'GET'});
    scoreboardPositions=result.positions||[];scoreboardLoadState='ready';renderTraderScoreboard();
  }catch(error){scoreboardPositions=[];scoreboardLoadState='error';renderTraderScoreboard(error.message);}
}
function renderTraderScoreboard(error=''){
  const statsHost=$('#scoreboardStats'),cardsHost=$('#traderProfileCards'),status=$('#scoreboardStatus');
  if(!statsHost||!cardsHost||!status)return;
  const ledgerStats=traderStats(scoreboardPositions);
  const capital=simAccounts.reduce((sum,item)=>sum+Number(item.starting_balance||0),0);
  const closed=scoreboardPositions.filter(item=>item.status==='closed');
  const knownResults=closed.filter(item=>item.gross_pnl!=null&&Number.isFinite(Number(item.gross_pnl)));
  const totalGross=knownResults.reduce((sum,item)=>sum+Number(item.gross_pnl),0);
  const wins=knownResults.filter(item=>Number(item.gross_pnl)>0).length;
  const winRate=knownResults.length?`${(wins/knownResults.length*100).toFixed(0)}%`:'—';
  statsHost.innerHTML=[
    ['VIRTUAL CAPITAL',scoreboardMoney(capital),'Starting balances across SIM profiles'],
    ['IN PLAY',String(ledgerStats.open.length).padStart(2,'0'),'Open paper positions'],
    ['CLOSED TRADES',String(knownResults.length).padStart(2,'0'),'Recorded results in full SIM ledger'],
    ['WIN RATE',winRate,'Gross winning trades / closed trades'],
    ['CYCLE GROSS',scoreboardMoney(totalGross),'Before fees and slippage'],
  ].map(([label,value,note])=>`<div class="scoreboard-stat"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`).join('');
  status.textContent=scoreboardLoadState==='loading'?'Reading paper ledger…':scoreboardLoadState==='error'?`Ledger unavailable · ${error||'retry later'}`:`${simAccounts.length} SIM profile${simAccounts.length===1?'':'s'} · ${scoreboardPositions.length} recorded position${scoreboardPositions.length===1?'':'s'}`;
  if(!simAccounts.length){
    cardsHost.innerHTML='<div class="scoreboard-empty"><span class="scoreboard-empty-mark">+</span><strong>No player cards on the board</strong><span>Create a SIM profile to start a paper cycle. No balance or stats are assumed.</span></div>';
    return;
  }
  cardsHost.innerHTML=simAccounts.map((account,index)=>{
    const positions=scoreboardPositions.filter(item=>item.account_id===account.account_id);
    const stats=traderStats(positions);
    const selected=account.account_id===activeAccountId;
    const cardState=stats.open.length?`${stats.open.length} IN PLAY`:stats.closed.length?'ROSTER ACTIVE':'READY · NO TRADES';
    const pnl=scoreboardMoney(stats.gross,account.currency);
    const pnlClass=stats.gross>0?'is-positive':stats.gross<0?'is-negative':'';
    return `<button type="button" class="trader-profile-card ${selected?'is-selected':''}" data-scoreboard-account="${escapeHtml(account.account_id)}" aria-pressed="${selected}" aria-label="Select ${escapeHtml(account.name)} SIM profile">
      <span class="profile-card-top"><span class="profile-number">${String(index+1).padStart(2,'0')}</span><span class="profile-league">SIM PROFILE</span><span class="profile-state">${cardState}</span></span>
      <strong class="profile-name">${escapeHtml(account.name)}</strong>
      <span class="profile-capital-label">VIRTUAL STARTING BALANCE</span><strong class="profile-capital">${scoreboardMoney(account.starting_balance,account.currency)}</strong>
      <span class="profile-card-stats"><span><b>${stats.wins}-${stats.losses}</b><small>W-L RECORD</small></span><span><b>${stats.winRate==null?'—':`${stats.winRate.toFixed(0)}%`}</b><small>WIN RATE</small></span><span><b class="${pnlClass}">${pnl}</b><small>GROSS CYCLE</small></span></span>
      <span class="profile-card-footer"><span>${selected?'AT BAT · ACTIVE ACCOUNT':'SELECT PLAYER CARD'}</span><span>↗</span></span>
    </button>`;
  }).join('');
  cardsHost.querySelectorAll('[data-scoreboard-account]').forEach(button=>button.addEventListener('click',()=>{
    activeAccountId=button.dataset.scoreboardAccount;syncAccountPicker();renderTraderScoreboard();
  }));
}
$('#scoreboardManage').addEventListener('click',()=>{traderView='accounts';renderChartTrader();});
$('#scoreboardRefresh').addEventListener('click',()=>void loadScoreboardLedger());
function openTradePanel(side='long'){
  closeContextMenu();traderView='trade';renderChartTrader(side);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
}
function renderChartTrader(side='long'){
  if(traderView==='accounts'){renderTraderAccounts(side);return;}
  const account=simAccounts.find(item=>item.account_id===activeAccountId);
  const supported=Boolean(source);
  const traderInstructions=quantGameEnabled?'Buy/Sell open a paper ticket. Choose a live liquidity level to queue an entry; expired levels are unavailable. Manage open positions below.':'Place a resting limit from Buy/Sell or right-click a chart price. It fills only on a later completed bar at the limit or better; if price leaves, it waits until canceled. Manage working orders, brackets, and closed-trade marks here.';
  panel('trader','Chart Trader',`<div class="trader-tabs" role="tablist" aria-label="Chart Trader views"><button type="button" role="tab" data-trader-view="trade" aria-selected="true">Trade</button><button type="button" role="tab" data-trader-view="accounts" aria-selected="false">Accounts</button></div><div class="trader-account-card"><span>ACTIVE SIM ACCOUNT</span><strong>${escapeHtml(account?.name||'No account selected')}</strong><small>${account?`${escapeHtml(account.currency||'USD')} · virtual starting balance ${fmt(account.starting_balance,2)}`:'Create or select an account in Accounts.'}</small></div>
  <p class="trader-market"><b>${escapeHtml(source?.market||slots[activeIndex]?.params?.market||'No chart loaded')}</b> · ${escapeHtml(source?.timeframe||slots[activeIndex]?.params?.timeframe||'—')} · ${escapeHtml(source?.label||'public chart source')}</p>
  <p class="trader-boundary">${supported?'Paper limits are labeled with source and placement bar. A later completed bar must touch the limit; there is no market fallback. Open brackets and closed trades are drawn on the chart.':`No chart is loaded yet. Load a Binance, Coinbase, or Hyperliquid public crypto chart to place a paper position.`}</p><p>${escapeHtml(traderInstructions)}</p>
  <div class="trader-list-head"><strong>Orders &amp; positions</strong><button id="traderRefresh" type="button">Refresh</button></div><div id="traderLedger" class="trader-ledger"><p>${account?'Loading account activity…':'Select a SIM account to view its activity.'}</p></div><p id="traderNotice" class="muted" role="status"></p>`);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
  $('#panelBody').querySelectorAll('[data-trader-view]').forEach(button=>button.addEventListener('click',()=>{traderView=button.dataset.traderView;renderChartTrader(side);}));
  $('#traderRefresh').addEventListener('click',()=>void loadQuantLabPositions());
  void loadTraderLedger();
}
function renderTraderAccounts(side='long'){
  const account=simAccounts.find(item=>item.account_id===activeAccountId);
  const rows=simAccounts.map(item=>`<div class="trader-account-row ${item.account_id===activeAccountId?'is-active':''}"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.currency||'USD')} · virtual starting balance ${fmt(item.starting_balance,2)} · SIM</small></div><button type="button" data-select-sim-account="${escapeHtml(item.account_id)}" ${item.account_id===activeAccountId||cryptoDeskEnabled?'disabled':''}>${item.account_id===activeAccountId?'Active':cryptoDeskEnabled?'History':'Select'}</button></div>`).join('');
  panel('trader','Chart Trader',`<div class="trader-tabs" role="tablist" aria-label="Chart Trader views"><button type="button" role="tab" data-trader-view="trade" aria-selected="false">Trade</button><button type="button" role="tab" data-trader-view="accounts" aria-selected="true">Accounts</button></div><div class="trader-accounts-head"><div><strong>Accounts</strong><small>Local simulation accounts for paper trading</small></div><span>SIM</span></div><div class="trader-active-summary"><small>ACTIVE ACCOUNT</small><strong>${escapeHtml(account?.name||'No account selected')}</strong><span>${account?`${escapeHtml(account.currency||'USD')} · virtual starting balance ${fmt(account.starting_balance,2)}`:'Create a SIM account to start.'}</span></div><div class="trader-account-list">${rows||'<p>No simulation accounts yet. Create one below.</p>'}</div><p class="trader-boundary">Live broker accounts are not connected. These accounts are local simulations and do not control a broker.</p>${cryptoDeskEnabled?'<p class="trader-boundary">On the first of each month at 00:00 Pacific a new $500 paper account starts. Earlier accounts and open positions stay in the journal.</p>':`<form id="createSimAccount"><label>New account name<input name="name" maxlength="80" required placeholder="e.g. BTC paper study"></label><label>Starting virtual balance (USD)<input name="starting_balance" type="number" min="1" step="any" value="10000" required></label><button type="submit">Create SIM account</button></form>`}<p id="accountsNotice" class="muted" role="status"></p>`);
  $('#panelBody').querySelectorAll('[data-trader-view]').forEach(button=>button.addEventListener('click',()=>{traderView=button.dataset.traderView;renderChartTrader(side);}));
  $('#panelBody').querySelectorAll('[data-select-sim-account]').forEach(button=>button.addEventListener('click',()=>{activeAccountId=button.dataset.selectSimAccount;syncAccountPicker();renderTraderScoreboard();renderChartTrader(side);}));
  $('#createSimAccount')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{const created=await simRequest('accounts',{method:'POST',body:JSON.stringify({name:form.get('name'),starting_balance:form.get('starting_balance')})});simAccounts.push(created);activeAccountId=created.account_id;traderView='accounts';syncAccountPicker();renderTraderScoreboard();renderChartTrader(side);}
    catch(error){$('#accountsNotice').textContent=error.message;}
    finally{const submit=$('#createSimAccount button');if(submit)submit.disabled=false;}
  });
}
function openChartTicket(side='long',price=null,time=null,position=null,latestLimit=false){
  closeContextMenu();
  const slot=slots[activeIndex],bar=slot?.bars?.at(-1),latestCompleted=slot?.source?completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf).at(-1):bar;
  if(!activeAccountId){showChartTradeToast('Choose a SIM account in the toolbar before placing a paper trade.',true);return;}
  if(!source||!slot?.bars?.length){showChartTradeToast('Load a chart before placing a paper trade.',true);return;}
  ticketPositionId=position?.position_id||'';
  const reference=position?Number(position.entry_price):(price!=null&&Number.isFinite(Number(price))?Number(price):(Number(slot.hover?.price)||Number(bar.close)));
  ticketBarTime=Number(latestCompleted?.time||bar.time);
  $('#chartTicketSide').value=position?.side||side;
  $('#chartTicketType').value='limit';
  $('#chartTicketPrice').value=latestLimit&&latestCompleted?String(Number(latestCompleted.close)):String(reference);
  $('#chartTicketPrice').readOnly=Boolean(position);
  $('#chartTicketQuantity').value=position?String(position.quantity):'0.001';
  $('#chartTicketStop').value=position?.stop_price==null?'':String(position.stop_price);
  $('#chartTicketTarget').value=position?.target_price==null?'':String(position.target_price);
  $('#chartTicketTitle').textContent=position?`Manage ${position.side==='long'?'Buy / Long':'Sell / Short'}`:(side==='long'?'Buy / Long':'Sell / Short');
  $('#chartTicketContext').textContent=position?`${position.symbol} · open paper position`:`${source.market} · ${source.timeframe} · limit ${fmt(latestLimit&&latestCompleted?latestCompleted.close:reference,8)} · activates after ${utc(ticketBarTime)}`;
  $('#chartTicketStamp').textContent=`${source.label} · chart bar ${utc(ticketBarTime)} · account ${simAccounts.find(item=>item.account_id===activeAccountId)?.name||'SIM'}`;
  const submit=$('#chartTicketSubmit');submit.disabled=false;
  $('#chartTicketStatus').textContent='';$('#chartTicketStatus').classList.remove('error');$('#chartOrderTicket').hidden=false;
  $('#chartTicketSide').disabled=Boolean(position);$('#chartTicketType').disabled=Boolean(position);$('#chartTicketQuantity').readOnly=Boolean(position);
  const syncTicket=()=>{const isShort=$('#chartTicketSide').value==='short',kind=$('#chartTicketType').value,isMarket=!position&&kind==='market';$('#chartTicketTitle').textContent=position?(isShort?'Manage Sell / Short':'Manage Buy / Long'):(isShort?'Sell / Short':'Buy / Long');if(isMarket&&latestCompleted)$('#chartTicketPrice').value=String(Number(latestCompleted.close));$('#chartTicketPrice').readOnly=Boolean(position)||isMarket;submit.textContent=position?'Update TP / SL':`Place SIM ${isShort?'Sell':'Buy'} ${isMarket?'Market':'Limit'}`;submit.classList.toggle('is-short',isShort);$('#chartTicketContext').textContent=position?`${position.symbol} · open paper position`:isMarket?`${source.market} · ${source.timeframe} · market simulation at completed close ${fmt(Number(latestCompleted?.close||reference),8)} · ${utc(ticketBarTime)}`:`${source.market} · ${source.timeframe} · limit ${fmt(Number($('#chartTicketPrice').value),8)} · activates after ${utc(ticketBarTime)}`;};
  $('#chartTicketSide').onchange=syncTicket;$('#chartTicketType').onchange=syncTicket;syncTicket();
}
function showChartTradeToast(message,error=false){const toast=$('#chartTradeToast');toast.textContent=message;toast.classList.toggle('is-error',error);toast.hidden=false;}
function drawQuantLabPositions(){
  for(const slot of slots){for(const id of slot.tradeDrawings||[])slot.chart?.drawings?.remove?.(id);slot.tradeDrawings=[];}
  const slot=slots[activeIndex];if(!slot?.chart?.drawings?.supported||!slot.bars?.length)return;
  const matches=item=>item.account_id===activeAccountId&&item.symbol===slot.source?.market&&item.provider===slot.source?.id&&String(item.timeframe).toLowerCase()===slot.source?.timeframe.toLowerCase();
  const add=(type,anchors,color,label,width=2,style='solid')=>{
    const drawing=slot.chart.drawings.add(type,{paneId:'price',anchors,style:{lineColor:color,lineWidth:width,lineStyle:style},...(label?{text:{value:label,color,size:'tiny',hAlign:'right',vAlign:'bottom'}}:{})});
    if(drawing?.id)slot.tradeDrawings.push(drawing.id);
  };
  chartTrading?.refresh();
  const positions=quantLabPositions.filter(matches);
  for(const position of positions.filter(item=>item.status==='closed'&&item.exit_price!=null).slice(0,8)){
    const entryTime=Number(position.entry_bar_time)*1000,exitTime=Number(position.exit_bar_time)*1000;
    const positive=Number(position.gross_pnl)>=0,color=positive?'#57cba6':'#f07987';
    add('trendline',[{time:entryTime,price:Number(position.entry_price)},{time:exitTime,price:Number(position.exit_price)}],color,`${position.side==='long'?'LONG':'SHORT'} ${positive?'WIN':'LOSS'} · ${Number(position.gross_pnl)>=0?'+':''}${fmt(position.gross_pnl,2)}`,2);
    add('text',[{time:entryTime,price:Number(position.entry_price)}],color,`${position.side==='long'?'BUY':'SELL'} IN`,0);
    add('text',[{time:exitTime,price:Number(position.exit_price)}],color,`EXIT ${Number(position.exit_price).toLocaleString()}`,0);
  }
}
async function loadQuantLabPositions(){
  if(!activeAccountId||!source){quantLabPositions=[];quantLabOrders=[];drawQuantLabPositions();return;}
  try{
    const query=new URLSearchParams({account_id:activeAccountId,symbol:source.market});
    const result=await simRequest(`quant-lab/positions?${query}`,{method:'GET'});
    quantLabPositions=result.positions||[];quantLabOrders=result.orders||[];drawQuantLabPositions();void loadScoreboardLedger();
    if(activePanel==='trader'&&traderView==='trade')void loadTraderLedger();
  }catch(error){showChartTradeToast(`Paper chart trades unavailable: ${error.message}`,true);}
}
async function advanceQuantLabSnapshot(slot){
  if(!slot?.source||!slot.bars?.length)return;
  try{
    const result=await simRequest('quant-lab/advance',{method:'POST',body:JSON.stringify({provider:slot.source.id,symbol:slot.source.market,timeframe:slot.source.timeframe,game_range:quantGameEnabled,completed_cutoff:completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf).at(-1)?.time||0,bars:(quantGameEnabled||cryptoDeskEnabled?completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf):slot.bars).map(bar=>({time:Math.floor(bar.time/1000),open:bar.open,high:bar.high,low:bar.low,close:bar.close}))})});
    if(result.limit_filled?.length){for(const fill of result.limit_filled)if(cryptoDeskEnabled)window.dispatchEvent(new CustomEvent('crypto-desk:trade',{detail:fill.position}));showChartTradeToast(`${result.limit_filled.length} resting paper limit${result.limit_filled.length===1?'':'s'} filled on completed chart bars.`);}
    else if(result.closed){showChartTradeToast(`${result.closed} paper position${result.closed===1?'':'s'} closed by a chart bracket.`);}
    if(slot.index===activeIndex)void loadQuantLabPositions();
  }catch(error){if(slot.index===activeIndex)showChartTradeToast(`Bracket check unavailable: ${error.message}`,true);}
}
function renderChartPositionRows(){
  const host=$('#traderLedger');if(!host)return;
  const orders=quantLabOrders.filter(item=>item.account_id===activeAccountId&&item.status==='pending');
  const positions=quantLabPositions.filter(item=>item.account_id===activeAccountId);
  const open=positions.filter(item=>item.status==='open'),closed=positions.filter(item=>item.status==='closed').slice(0,5);
  if(!orders.length&&!open.length&&!closed.length){host.innerHTML='<p>No chart orders or trades for this account and symbol.</p>';return;}
  host.innerHTML=[...orders.map(item=>`<div class="trader-ledger-row is-working"><strong>${item.side==='long'?'Buy':'Sell'} limit · ${fmt(item.quantity,8)} ${escapeHtml(item.symbol)} · WORKING</strong><small>Limit ${fmt(item.limit_price,8)} · ${escapeHtml(item.provider)} · waits for a later completed bar</small><div class="chart-position-actions"><button type="button" data-cancel-chart-order="${escapeHtml(item.order_id)}">Cancel limit</button></div></div>`),...open.map(item=>`<div class="trader-ledger-row"><strong>${escapeHtml(item.side==='long'?'Buy / Long':'Sell / Short')} ${fmt(item.quantity,8)} ${escapeHtml(item.symbol)} · OPEN</strong><small>Entry ${fmt(item.entry_price,8)} · SL ${item.stop_price==null?'—':fmt(item.stop_price,8)} · TP ${item.target_price==null?'—':fmt(item.target_price,8)} · ${escapeHtml(item.entry_source)}</small><div class="chart-position-actions"><button type="button" data-edit-chart-position="${escapeHtml(item.position_id)}">Edit SL / TP</button><button type="button" data-close-chart-position="${escapeHtml(item.position_id)}">Close at chart</button></div></div>`),...closed.map(item=>`<div class="trader-ledger-row is-closed"><strong>${escapeHtml(item.side==='long'?'Long':'Short')} · ${Number(item.gross_pnl)>=0?'WIN':'LOSS'} · ${Number(item.gross_pnl)>=0?'+':''}${fmt(item.gross_pnl,2)}</strong><small>Entry ${fmt(item.entry_price,8)} → exit ${fmt(item.exit_price,8)} · ${escapeHtml(item.close_reason||'closed')}</small></div>`)].join('');
  host.querySelectorAll('[data-edit-chart-position]').forEach(button=>button.addEventListener('click',()=>openChartTicket('long',null,null,open.find(item=>item.position_id===button.dataset.editChartPosition))));
  host.querySelectorAll('[data-close-chart-position]').forEach(button=>button.addEventListener('click',()=>void closeQuantLabPosition(open.find(item=>item.position_id===button.dataset.closeChartPosition))));
  host.querySelectorAll('[data-cancel-chart-order]').forEach(button=>button.addEventListener('click',()=>void cancelQuantLabLimitOrder(orders.find(item=>item.order_id===button.dataset.cancelChartOrder))));
}
async function cancelQuantLabLimitOrder(order){if(!order)return;try{await simRequest('quant-lab/cancel-limit',{method:'POST',body:JSON.stringify({order_id:order.order_id})});showChartTradeToast('Working paper limit canceled. No market order was sent.');await loadQuantLabPositions();}catch(error){showChartTradeToast(error.message,true);}}
async function closeQuantLabPosition(position){
  const bar=slots[activeIndex]?.bars?.at(-1);if(!position||!bar)return;
  try{await simRequest('quant-lab/close',{method:'POST',body:JSON.stringify({position_id:position.position_id,exit_price:bar.close,bar_time:Math.floor(bar.time/1000)})});showChartTradeToast(`Paper position closed at the displayed ${source?.market} chart close.`);await loadQuantLabPositions();}
  catch(error){showChartTradeToast(error.message,true);}
}
$('#chartTicketForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#chartTicketSubmit'),status=$('#chartTicketStatus');
  if(!activeAccountId||!source){status.textContent='Select a SIM account and load a chart first.';status.classList.add('error');return;}
  const kind=$('#chartTicketType').value,side=$('#chartTicketSide').value;button.disabled=true;status.textContent=ticketPositionId?'Updating paper bracket…':kind==='market'?'Opening paper market simulation at completed close…':'Queueing paper limit…';
  try{
    const payload={account_id:activeAccountId,provider:source.id,symbol:source.market,timeframe:source.timeframe,side,order_type:kind,quantity:$('#chartTicketQuantity').value,entry_price:$('#chartTicketPrice').value,bar_time:Math.floor(ticketBarTime/1000),stop_price:$('#chartTicketStop').value||null,target_price:$('#chartTicketTarget').value||null,...(kind==='limit'?{chart_bracket_draft:true}:{})};
    let result=null;if(ticketPositionId)await simRequest('quant-lab/bracket',{method:'POST',body:JSON.stringify({position_id:ticketPositionId,current_bar_time:Math.floor((slots[activeIndex]?.bars?.at(-1)?.time||ticketBarTime)/1000),stop_price:payload.stop_price,target_price:payload.target_price})});
    else if(kind==='market')result=await simRequest('quant-lab/open',{method:'POST',body:JSON.stringify(payload)});
    else await simRequest('quant-lab/limit',{method:'POST',body:JSON.stringify(payload)});
    if(kind==='market'&&result?.position_id)window.dispatchEvent(new CustomEvent('crypto-desk:trade',{detail:result}));
    $('#chartOrderTicket').hidden=true;showChartTradeToast(ticketPositionId?'Paper stop-loss / take-profit updated.':kind==='market'?`Paper ${side==='long'?'buy':'sell'} market simulation opened at the completed chart close.`:'Paper limit is working at the selected price; it will not chase if price moves away.');ticketPositionId='';await loadQuantLabPositions();
  }catch(error){status.textContent=error.message;status.classList.add('error');button.disabled=false;}
});
$('#chartTicketClose').addEventListener('click',()=>{$('#chartOrderTicket').hidden=true;ticketPositionId='';});
async function loadTraderLedger(){
  const target=$('#traderLedger');if(!target)return;
  if(!activeAccountId){target.innerHTML='<p>Select or create a SIM account to see activity.</p>';return;}
  try{
    const query=new URLSearchParams({account_id:activeAccountId,symbol:source?.market||''});
    const result=await simRequest(`quant-lab/positions?${query}`,{method:'GET'});
    if(!$('#traderLedger'))return;
    quantLabPositions=result.positions||[];quantLabOrders=result.orders||[];
    renderChartPositionRows();drawQuantLabPositions();
  }catch(error){target.innerHTML=`<p class="warning">${escapeHtml(error.message)}</p>`;}
}
$('#chartTraderButton').addEventListener('click',()=>{if(activePanel==='trader'&&!$('#sidePanel').hidden){closePanel();$('#chartTraderButton').setAttribute('aria-expanded','false');}else openTradePanel();});
$('#quickBuy').addEventListener('click',()=>{const bar=slots[activeIndex]?.bars?.at(-1);openChartTicket('long',bar?.close,bar?.time,null,true);});
$('#quickSell').addEventListener('click',()=>{const bar=slots[activeIndex]?.bars?.at(-1);openChartTicket('short',bar?.close,bar?.time,null,true);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();});
loadSimAccounts();
let clockTimezone=null;
function updateClock(){
  let timezone='UTC';
  if(cryptoDeskEnabled){
    try{timezone=clockTimezone||JSON.parse(localStorage.getItem('countdesk.trading-chart.candles.v1'))?.timezone||'America/Los_Angeles';new Intl.DateTimeFormat('en-US',{timeZone:timezone});}
    catch{timezone='America/Los_Angeles';}
  }
  const now=new Date();
  $('#clock').textContent=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
  const label=$('#clockTimezone');
  if(label)label.textContent=new Intl.DateTimeFormat('en-US',{timeZone:timezone,timeZoneName:'short'}).formatToParts(now).find(part=>part.type==='timeZoneName')?.value||timezone;
}
window.addEventListener('countdesk:chart-timezone-change',event=>{clockTimezone=event.detail?.timezone||null;updateClock();});
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
function validParams(value){return (!quantGameEnabled||gameMarketAllowed(value)) && value && providerSpecs[value.id] && validMarket(String(value.market||'')) && ['1m','5m','15m','30m','1h','4h','1d'].includes(value.timeframe);}
function selectedParams(){return {id:$('#provider').value,market:$('#market').value.trim().toUpperCase(),timeframe:$('#timeframe').value};}
function slotLabel(slot){return slot.source?`${slot.source.market} · ${slot.source.timeframe}`:slot.params?`${slot.params.market} · ${slot.params.timeframe}`:'Waiting for data';}
const readMarketSections=['sentiment_bias','liquidity','elliott_fib','volume_divergence'];
const emptyReadMarketLayerIds=()=>Object.fromEntries(readMarketSections.map(section=>[section,[]]));
const defaultReadMarketLayerVisibility=()=>Object.fromEntries(readMarketSections.map(section=>[section,true]));
function makeSlot(index,params){
  const cell=document.createElement('section');cell.className='chart-cell';cell.dataset.slot=String(index);
  const head=document.createElement('button');head.type='button';head.className='chart-cell-head';head.innerHTML=`<span class="cell-number">${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(params.market)}</strong><small>${escapeHtml(params.timeframe)} · ${escapeHtml(providerSpecs[params.id].label)}</small>`;
  const host=document.createElement('div');host.className='chart-host';host.setAttribute('aria-label',`Quant Lab chart ${index+1}`);
  const error=document.createElement('div');error.className='chart-error';error.hidden=true;
  cell.append(head,host,error);cell.addEventListener('pointerdown',()=>activateSlot(index));head.addEventListener('click',()=>activateSlot(index));
  $('#chartGrid').append(cell);
  return {index,cell,head,host,error,params,chart:null,bars:[],source:null,sequence:0,unsub:[],premium:new Set(quantGameEnabled||cryptoDeskEnabled?['wave-court']:[]),premiumDrawings:new Map(),liquidityForceSettings:{view:'Raw Levels',showProfile:true,profileTimeframe:'1h'},executionPanels:new Map(),executionPanelTab:'footprint',executionPanelCollapsed:false,gravityPanelState:{left:null,top:10,collapsed:false},liquidityForcePanelState:{left:null,top:10,collapsed:false},tradeDrawings:[],cleoDrawingIds:[],cleoMarksVisible:true,shammyDrawingIds:[],shammyMarksVisible:true,readMarketLayerIds:emptyReadMarketLayerIds(),readMarketLayerVisibility:defaultReadMarketLayerVisibility(),cleoReadout:null,hover:null,fib:null,premiumStatus:''};
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
  if(id==='wave-court')slot.waveCourtRead=null;
  if(id==='smart-fib'){slot.fib?.destroy();slot.fib=null;slot.host.onpointerleave=null;}
  if(id==='liquidity-force'&&slot.liquidityForceViewport){
    slot.chart?.renderer?.renderer?.applyViewport?.(slot.liquidityForceViewport);
    slot.liquidityForceViewport=null;
  }
  if(id==='ttp-volume-analyst'){const handle=slot.chart?.indicators?.().find(item=>item.nativeType==='ttp-relative-volume');handle?.remove();}
  if(id==='liquid-gravity'){slot.gravityPanelCleanup?.();slot.gravityPanelCleanup=null;slot.host.querySelector('.liquid-gravity-panel')?.remove();}
  if(id==='liquidity-force'){slot.liquidityForcePanelCleanup?.();slot.liquidityForcePanelCleanup=null;slot.host.querySelector('.liquidity-force-gravity-panel')?.remove();}
  for(const drawingId of slot.premiumDrawings.get(id)||[])slot.chart?.drawings?.remove?.(drawingId);
  slot.premiumDrawings.delete(id);
  if(slot.executionPanels.delete(id))renderExecutionPanel(slot);
}
function drawFor(slot,id){
  const ids=[];slot.premiumDrawings.set(id,ids);
  return {add:(type,config)=>{const drawing=slot.chart.drawings.add(type,config);if(drawing?.id)ids.push(drawing.id);return drawing;},
    clear:()=>{for(const drawingId of ids)slot.chart.drawings.remove(drawingId);ids.length=0;}};
}
function wireLiquidGravityPanel(slot,panel,header,body,collapseButton,{state=slot.gravityPanelState,onCleanup}={}){
  const panelState=state||(slot.gravityPanelState={left:null,top:10,collapsed:false});
  const clampPosition=()=>{
    const maxLeft=Math.max(0,slot.host.clientWidth-panel.offsetWidth),maxTop=Math.max(0,slot.host.clientHeight-panel.offsetHeight);
    const left=panelState.left==null?maxLeft-10:panelState.left;
    panelState.left=Math.max(0,Math.min(maxLeft,left));panelState.top=Math.max(0,Math.min(maxTop,panelState.top??10));
    panel.style.left=`${panelState.left}px`;panel.style.top=`${panelState.top}px`;panel.style.right='auto';
  };
  const setCollapsed=collapsed=>{
    panelState.collapsed=collapsed;body.hidden=collapsed;panel.classList.toggle('is-collapsed',collapsed);
    collapseButton.textContent=collapsed?'+':'−';collapseButton.setAttribute('aria-expanded',String(!collapsed));
    const panelName=panel.classList.contains('liquidity-force-gravity-panel')?'Liquidity Force score table':'Liquid Gravity data box';
    collapseButton.setAttribute('aria-label',`${collapsed?'Expand':'Collapse'} ${panelName}`);
    collapseButton.title=collapsed?'Expand data box':'Collapse data box';
    requestAnimationFrame(clampPosition);
  };
  let drag=null;
  header.addEventListener('pointerdown',event=>{
    if(event.target.closest('button')&&!event.target.closest('.gravity-drag-handle'))return;
    event.preventDefault();clampPosition();
    drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:panelState.left,top:panelState.top};
    header.setPointerCapture(event.pointerId);panel.classList.add('is-dragging');
  });
  header.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    const maxLeft=Math.max(0,slot.host.clientWidth-panel.offsetWidth),maxTop=Math.max(0,slot.host.clientHeight-panel.offsetHeight);
    panelState.left=Math.max(0,Math.min(maxLeft,drag.left+event.clientX-drag.x));panelState.top=Math.max(0,Math.min(maxTop,drag.top+event.clientY-drag.y));
    panel.style.left=`${panelState.left}px`;panel.style.top=`${panelState.top}px`;panel.style.right='auto';
  });
  const stopDrag=event=>{if(!drag||drag.pointerId!==event.pointerId)return;drag=null;panel.classList.remove('is-dragging');};
  header.addEventListener('pointerup',stopDrag);header.addEventListener('pointercancel',stopDrag);header.addEventListener('lostpointercapture',stopDrag);
    collapseButton.addEventListener('click',()=>setCollapsed(!panelState.collapsed));
  collapseButton.addEventListener('pointerdown',event=>event.stopPropagation());
  panel.querySelector('.gravity-drag-handle')?.addEventListener('keydown',event=>{
    const delta=event.shiftKey?40:12;let dx=0,dy=0;
    if(event.key==='ArrowLeft')dx=-delta;else if(event.key==='ArrowRight')dx=delta;else if(event.key==='ArrowUp')dy=-delta;else if(event.key==='ArrowDown')dy=delta;else return;
    event.preventDefault();clampPosition();panelState.left=Math.max(0,Math.min(Math.max(0,slot.host.clientWidth-panel.offsetWidth),panelState.left+dx));panelState.top=Math.max(0,Math.min(Math.max(0,slot.host.clientHeight-panel.offsetHeight),panelState.top+dy));
    panel.style.left=`${panelState.left}px`;panel.style.top=`${panelState.top}px`;panel.style.right='auto';
  });
  requestAnimationFrame(()=>{setCollapsed(Boolean(panelState.collapsed));clampPosition();});
  const resizeObserver=new ResizeObserver(clampPosition);resizeObserver.observe(slot.host);resizeObserver.observe(panel);
  const cleanup=()=>resizeObserver.disconnect();
  if(onCleanup)onCleanup(cleanup);else slot.gravityPanelCleanup=cleanup;
}
function renderLiquidityForceGravityPanel(slot,result){
  slot.liquidityForcePanelCleanup?.();slot.liquidityForcePanelCleanup=null;
  slot.host.querySelector('.liquidity-force-gravity-panel')?.remove();
  const panel=document.createElement('section');panel.className='liquid-gravity-panel liquidity-force-gravity-panel';
  panel.setAttribute('aria-label','Liquidity Force Gravity scores');
  const header=document.createElement('header'),move=document.createElement('button'),title=document.createElement('strong'),context=document.createElement('span'),collapse=document.createElement('button');
  move.type='button';move.className='gravity-drag-handle';move.textContent='⠿';move.setAttribute('aria-label','Move Liquidity Force score table');move.title='Drag to move; use arrow keys to nudge';
  title.textContent='Liquidity Force';context.textContent=`${result.timeframe} · OHLC-inferred`;collapse.type='button';collapse.className='gravity-collapse';
  header.append(move,title,context,collapse);panel.append(header);
  const content=document.createElement('div');content.className='liquid-gravity-content';
  const summary=document.createElement('div');summary.className='gravity-summary';
  const sign=result.gravity.gravity>0?'+':'',gravityCell=document.createElement('div'),gravityName=document.createElement('small'),gravityValue=document.createElement('strong');
  gravityName.textContent='Net Gravity';gravityValue.textContent=`${sign}${Math.round(result.gravity.gravity)} · ${result.gravity.direction}`;
  gravityValue.classList.add(result.gravity.gravity>0?'gravity-positive':result.gravity.gravity<0?'gravity-negative':'gravity-neutral');gravityCell.append(gravityName,gravityValue);
  const pressureCell=document.createElement('div'),pressureName=document.createElement('small'),pressureValue=document.createElement('strong');
  pressureName.textContent='Bull / Bear';pressureValue.textContent=`${Math.round(result.gravity.bullishPressure)}% / ${Math.round(result.gravity.bearishPressure)}%`;
  pressureCell.append(pressureName,pressureValue);summary.append(gravityCell,pressureCell);content.append(summary);
  const table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr');
  for(const value of ['Liquidity level','Price','Score','State']){const cell=document.createElement('th');cell.textContent=value;headRow.append(cell);}head.append(headRow);table.append(head);
  const body=document.createElement('tbody');
  for(const [side,levels] of [['HIGH',result.ranks.HIGH],['LOW',result.ranks.LOW]])for(let index=0;index<3;index++){
    const match=levels[index],row=document.createElement('tr');row.className=side==='HIGH'?'gravity-up':'gravity-down';
    const values=[match?`${match.rankName} ${side==='HIGH'?'↑':'↓'} · ${match.timeframe}`:'—',match?match.level.price.toFixed(2):'—',match?String(Math.round(match.pool.gravity)):'—',match?match.pool.state:'—'];
    for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
  }
  table.append(body);content.append(table);
  const note=document.createElement('p');note.className='liquidity-force-gravity-note';note.textContent='Relative balance of matched active Liquidity levels; not a probability.';content.append(note);
  panel.append(content);slot.host.append(panel);
  wireLiquidGravityPanel(slot,panel,header,content,collapse,{state:slot.liquidityForcePanelState,onCleanup:cleanup=>{slot.liquidityForcePanelCleanup=cleanup;}});
}
async function addPremium(slot,id){
  if(quantGameEnabled&&!['wave-court','volume-profile','tpo','vwap','footprint','volume-bubbles'].includes(id))throw new Error('This study requires context outside the battlefield. Use a range-local study or the default liquidity overlay.');
  if(quantGameEnabled&&!slot.premium.has(id)&&gameStudyCount(slot)>=2)throw new Error('The game allows two optional indicators. Remove one first.');
  if(quantPremiumItems[id]?.requiresExecutionFeed&&slot.params.id!=='coinbase')throw new Error('Select a Coinbase Exchange chart for executed-trade Footprint or Bubbles.');
  if(id==='ttp-volume-analyst'){
    clearPremium(slot,id);
    const handle=slot.chart?.addNativeIndicator?.('ttp-relative-volume',{inputs:{provider:slot.params.id,ticker:slot.params.market}});
    if(!handle)throw new Error('The chart could not create the native RelativeVolume indicator.');
    slot.premium.add(id);
    slot.premiumStatus=`TTP RelativeVolume · dedicated indicator pane · separately loads up to 5,000 prior bars to build the same-time UTC reference · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · last completed bar ${utc(slot.source.cutoff)} · descriptive, unscored.`;
    return;
  }
  if(!slot.chart?.drawings?.supported||typeof slot.chart.drawings.add!=='function')throw new Error('This chart renderer cannot display research drawings.');
  const chartAtStart=slot.chart;
  clearPremium(slot,id);
  const draw=drawFor(slot,id);
  try{
    if(id==='wave-court'){
      const closed=completedBars(quantGameEnabled?await fetchBars(slot.params,500,null,{researchContext:true}):slot.bars,slot.params.timeframe,slot.source.snapshotAsOf);
      if(closed.length<40)throw new Error('Wave Court needs at least 40 completed chart bars; higher degrees may need more.');
      const read=await waveCourtRead(slot,slot.params.timeframe,closed,slot.source.snapshotAsOf);
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const rendered=cryptoDeskEnabled?renderPineWaveCourt(read,draw.add):renderWaveCourtOverlay(read,draw.add);
      slot.waveCourtRead=read;
      const available=read.frames.filter(frame=>frame.status==='candidate').length;
      slot.premiumStatus=`Wave Court · ${rendered.status} · ${available}/7 frames have a rule-qualified impulse · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · completed cutoff ${utc(read.cutoff)} · hypothesis only; quality is not probability.`;
    }else if(id==='liquidity-force'){
      const settings=slot.liquidityForceSettings||{view:'Raw Levels',showProfile:true,profileTimeframe:'1h'};
      {
        const native=slot.chart?.renderer?.renderer,viewport=native?.coords?.getViewport?.();
        if(native?.applyViewport&&viewport){
          slot.liquidityForceViewport={barSpacing:viewport.barSpacing,rightOffset:viewport.rightOffset};
          native.applyViewport({barSpacing:viewport.barSpacing,rightOffset:Math.max(viewport.rightOffset,settings.showProfile?75:43)});
        }
      }
      const chartBars=completedBars(slot.bars,slot.params.timeframe,slot.source.snapshotAsOf);
      const timeframes=[...new Set([slot.params.timeframe,'30m','1h'])];
      const frameResults=await Promise.allSettled(timeframes.map(async timeframe=>({timeframe,bars:timeframe===slot.params.timeframe?chartBars:completedBars(await fetchBars({...slot.params,timeframe},500),timeframe,slot.source.snapshotAsOf)})));
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const series=frameResults.filter(result=>result.status==='fulfilled').map(result=>result.value);
      if(!series.some(item=>['30m','1h'].includes(item.timeframe)))throw new Error('The 30m / 1h Liquidity context is unavailable from this chart source.');
      let profileBars=[];
      if(settings.showProfile){
        profileBars=settings.profileTimeframe===slot.params.timeframe?chartBars:completedBars(await fetchBars({...slot.params,timeframe:settings.profileTimeframe},500),settings.profileTimeframe,slot.source.snapshotAsOf);
        if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      }
      const result=renderLiquidityForce({series,chartTimeframe:slot.params.timeframe,chartBars,profileBars,profileTimeframe:settings.profileTimeframe,settings,asOf:slot.source.snapshotAsOf,add:draw.add});
      renderLiquidityForceGravityPanel(slot,{...result,timeframe:slot.params.timeframe.toUpperCase()});
      slot.premiumStatus=`Liquidity Force · ${result.status} · ${result.gravity.direction} Gravity ${result.gravity.gravity>0?'+':''}${Math.round(result.gravity.gravity)} · ${settings.view} · ${settings.showProfile?`${settings.profileTimeframe.toUpperCase()} cluster profile`:'profile off'} · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · completed chart cutoff ${utc(result.cutoff)} · relative Gravity score, not probability.`;
    }else if(id==='liquidity'){
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
    }else if(id==='liquid-gravity'){
      const chartBars=completedBars(slot.bars,slot.params.timeframe,slot.source.snapshotAsOf);
      const history=completedBars(await fetchBars(slot.params,3000),slot.params.timeframe,slot.source.snapshotAsOf);
      if(slot.chart!==chartAtStart||!slots.includes(slot))return;
      const normalizedHistory=history.map(bar=>({...bar,time:bar.time/1000}));
      const normalizedChart=chartBars.map(bar=>({...bar,time:bar.time/1000}));
      const result=buildLiquidGravity(normalizedHistory,slot.params.timeframe,{asOf:slot.source.snapshotAsOf/1000});
      const rendered=renderLiquidGravity(result,normalizedChart,slot.params.timeframe,draw.add);
      const panel=document.createElement('section');panel.className='liquid-gravity-panel';panel.setAttribute('aria-label','Liquid Gravity relative attraction scores');
      const heading=document.createElement('header'),move=document.createElement('button'),title=document.createElement('strong'),regime=document.createElement('span'),collapse=document.createElement('button');
      move.type='button';move.className='gravity-drag-handle';move.textContent='⠿';move.setAttribute('aria-label','Move Liquid Gravity data box');move.title='Drag to move; use arrow keys to nudge';
      title.textContent='Liquid Gravity';regime.textContent=`${result.regime} · ${result.timeframe}`;collapse.type='button';collapse.className='gravity-collapse';heading.append(move,title,regime,collapse);panel.append(heading);
      const content=document.createElement('div');content.className='liquid-gravity-content';
      const summary=document.createElement('div');summary.className='gravity-summary';
      for(const [label,value] of [['Gravity',`${result.gravity>=0?'+':''}${Math.round(result.gravity)}`],['Pressure',`${Math.round(result.bullishPressure)} / ${Math.round(result.bearishPressure)}`]]){const cell=document.createElement('div'),name=document.createElement('small'),amount=document.createElement('strong');name.textContent=label;amount.textContent=value;cell.append(name,amount);summary.append(cell);}
      content.append(summary);
      const table=document.createElement('table');
      const head=document.createElement('thead'),headRow=document.createElement('tr');
      for(const value of ['Level','Price','Gravity','State']){const cell=document.createElement('th');cell.textContent=value;headRow.append(cell);}
      head.append(headRow);table.append(head);
      const body=document.createElement('tbody');
      for(const [side,levels] of [['upper',result.upper],['lower',result.lower]])for(let index=0;index<3;index++){
        const pool=levels[index],row=document.createElement('tr');row.className=side==='upper'?'gravity-up':'gravity-down';
        for(const value of [pool?`${['Primary','Secondary','Tertiary'][index]} ${side==='upper'?'↑':'↓'}`:'—',pool?pool.price.toFixed(2):'—',pool?String(Math.round(pool.gravity)):'—',pool?pool.state:'—']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);
      }
      table.append(body);content.append(table);panel.append(content);slot.host.append(panel);wireLiquidGravityPanel(slot,panel,heading,content,collapse);
      slot.premiumStatus=`${rendered.method} · ${rendered.levels} ranked pools · ${history.length} history bars · ${providerSpecs[slot.params.id].label} · ${slot.params.market} ${slot.params.timeframe} · completed-bar cutoff ${utc(result.cutoff*1000)} · OHLC-inferred, descriptive, unscored.`;
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
  updateShammyMarksButton();
  const waveNote=slot.host.querySelector('.shammy-chart-summary');$('#toggleShammySummary').hidden=!waveNote;if(waveNote)$('#toggleShammySummary').textContent=waveNote.hidden?'✦ Show wave note':'✦ Hide wave note';
  if(changed){lastResult=null;lastRunKey='';if(refresh)refreshActivePanel();saveLayoutState();}
  if(changed&&slot.source){if(!quantGameEnabled||window.quantGame?.mode()==='sim')void advanceQuantLabSnapshot(slot);void loadQuantLabPositions();}
}
async function fetchBars(params,limit=500,from=null,{researchContext=false}={}){
  if(quantGameEnabled&&!researchContext&&params.timeframe!=='1m'&&params.timeframe!=='15m')throw new Error('Range Trader chart supplies active 1m data and 15m field context only.');
  if(quantGameEnabled&&!researchContext&&params.timeframe==='1m'&&from==null)from=slots[activeIndex]?.gameStart??null;
  const key=`${params.id}|${params.market}|${params.timeframe}|${limit}|${from??""}`;
  if(!pendingBars.has(key)){
    let request;
    if(params.id==='tickstream'){
      request=fetch(`/api/tickstream/bars?symbol=${encodeURIComponent(params.market)}&timeframe=${encodeURIComponent(params.timeframe.toUpperCase())}`)
        .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Tickstream bars unavailable');return data;})
        .then(data=>(data.bars||[]).map(bar=>({...bar,time:Number(bar.time)*1000})).filter(isBar)
          .filter(bar=>from==null||bar.time>=from).sort((a,b)=>a.time-b.time).slice(-limit));
    }else{
      const Provider=window.Vela?.[providerSpecs[params.id].className];
      if(!Provider)throw new Error('Vela public provider is unavailable.');
      request=new Provider().getBars(params.market,params.timeframe,{limit,...(from!=null?{from}: {})}).then(result=>result.filter(isBar).filter(bar=>from==null||bar.time>=from).sort((a,b)=>a.time-b.time));
    }
    pendingBars.set(key,request);
    request.finally(()=>{if(pendingBars.get(key)===request)pendingBars.delete(key);}).catch(()=>{});
  }
  return pendingBars.get(key);
}
async function waveCourtRead(slot,chartTimeframe,chartBars,asOf,params=slot.params){
  const wanted=WAVE_FRAMES.filter(timeframe=>timeframe!==chartTimeframe);
  const results=await Promise.allSettled(wanted.map(async timeframe=>({timeframe,
    bars:completedBars(await fetchBars({...params,timeframe},500,null,{researchContext:true}),timeframe,asOf)})));
  const series=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
  return cryptoDeskEnabled?analyzePineWaveCourt([...series,{timeframe:chartTimeframe,bars:chartBars}],chartTimeframe,window.cryptoDayDesk?.getRead()?.settings||pineDefaults):analyzeWaveCourt(series,chartTimeframe,chartBars);
}
function referenceSource(){
  const primary=slots[0];
  const params=primary?.source||primary?.params||selectedParams();
  return {id:params.id,market:String(params.market||'').trim().toUpperCase()};
}
const outputFrameA=$('#analysisOutputFrameA'),outputFrameB=$('#analysisOutputFrameB');
for(const select of [outputFrameA,outputFrameB])for(const [value,label] of Object.entries(outputTimeframeLabels))select.append(new Option(label,value));
function readAnalysisOutputPair(){
  try{
    const saved=JSON.parse(localStorage.getItem(analysisOutputPairKey)||'null');
    if(Array.isArray(saved)&&saved.length===2&&saved.every(frame=>referenceTimeframes.includes(frame))&&saved[0]!==saved[1])return saved;
  }catch{}
  const traderFrame=slots[activeIndex]?.source?.timeframe||slots[activeIndex]?.params?.timeframe;
  const second=referenceTimeframes.includes(traderFrame)&&traderFrame!=='1d'?traderFrame:'4h';
  return ['1d',second];
}
function syncAnalysisOutputPair(){
  if(!outputFrameA||!outputFrameB)return readAnalysisOutputPair();
  const pair=readAnalysisOutputPair();outputFrameA.value=pair[0];outputFrameB.value=pair[1];return pair;
}
function saveAnalysisOutputPair(changed){
  if(outputFrameA.value===outputFrameB.value){
    const other=changed===outputFrameA?outputFrameB:outputFrameA;
    other.value=referenceTimeframes.find(timeframe=>timeframe!==changed.value)||'1d';
  }
  const pair=[outputFrameA.value,outputFrameB.value];
  try{localStorage.setItem(analysisOutputPairKey,JSON.stringify(pair));}catch{}
}
syncAnalysisOutputPair();
outputFrameA.addEventListener('change',()=>saveAnalysisOutputPair(outputFrameA));
outputFrameB.addEventListener('change',()=>saveAnalysisOutputPair(outputFrameB));
function showReferenceWorkspace(show){
  $('#chartGrid').hidden=show;
  $('#referenceWorkspace').hidden=!show;
  $('#referenceLayoutButton').setAttribute('aria-pressed',String(show));
  if(!show){
    $('#referenceLayoutButton').textContent='6 TF Reference';$('#referenceLayoutButton').title='Open six analyst reference charts';
    $('#referenceChartGrid').removeAttribute('data-output-pair');
    for(const item of referenceCharts)item.card.hidden=false;
  }
  if(show)requestAnimationFrame(()=>referenceCharts.forEach(item=>fitReferenceHistory(item)));
  else resizeCharts();
}
function openAnalysisOutputWorkspace(frames=readAnalysisOutputPair().map(timeframe=>({timeframe}))){
  if(!Array.isArray(frames)||frames.length!==2||frames[0]?.timeframe===frames[1]?.timeframe)return false;
  const chosen=frames.map(frame=>referenceCharts.find(item=>item.timeframe===frame.timeframe));
  if(chosen.some((item,index)=>!item?.chart||!item.source||
      item.source.id!==frames[index].provider||item.source.market!==frames[index].symbol||
      (frames[index].loadedCutoff!=null&&Number(item.source.cutoff)!==Number(frames[index].loadedCutoff))))return false;
  outputFrameA.value=frames[0].timeframe;outputFrameB.value=frames[1].timeframe;saveAnalysisOutputPair(outputFrameA);
  showReferenceWorkspace(true);
  $('#referenceChartGrid').dataset.outputPair='true';
  for(const item of referenceCharts)item.card.hidden=!chosen.includes(item);
  $('#referenceLayoutButton').textContent='2 Chart Output';$('#referenceLayoutButton').title='Two marked analysis timeframes · click to return to trading charts';
  $('#referenceWorkspaceStatus').textContent=`Analysis output · ${frames.map(frame=>frame.timeframe.toUpperCase()).join(' + ')} · same source snapshot`;
  requestAnimationFrame(()=>chosen.forEach(fitReferenceHistory));
  return true;
}
function fitReferenceHistory(item){
  if(!item?.chart||!item.bars.length)return;
  item.chart.resize();
  // Reference cards are overviews: tighten the pitch enough to include even 5,000 bars.
  item.chart.renderer?.applyConfig?.({series:{spacing:0.1}});
  item.chart.setVisibleRangePreset('ALL');
  if(item.forecastHorizon){const range=item.chart.getVisibleRange(),duration={'1d':86400000,'4h':14400000,'1h':3600000,'30m':1800000,'15m':900000,'5m':300000}[item.timeframe];
    if(range&&duration)item.chart.setVisibleRange({from:range.from,to:Math.max(range.to,item.bars.at(-1).time+(item.forecastHorizon+2)*duration)});}
}
function makeReferenceChart(timeframe,source){
  const card=document.createElement('section');card.className='reference-chart-card';
  const head=document.createElement('header');head.className='reference-chart-head';
  const title=document.createElement('strong');title.textContent=timeframe.toUpperCase();
  const market=document.createElement('small');market.textContent=`${source.market} · ${providerSpecs[source.id].label}`;
  const fit=document.createElement('button');fit.type='button';fit.className='reference-fit-button';fit.textContent='Fit all';fit.setAttribute('aria-label',`Fit all loaded ${timeframe.toUpperCase()} bars`);
  const marks=document.createElement('button');marks.type='button';marks.className='reference-marks-button';marks.textContent='Count';marks.hidden=true;marks.setAttribute('aria-label',`Hide ${timeframe.toUpperCase()} Rider count`);
  const note=document.createElement('button');note.type='button';note.className='reference-note-button';note.textContent='Note';note.hidden=true;note.setAttribute('aria-label',`Show ${timeframe.toUpperCase()} Rider findings`);
  head.append(title,market,marks,note,fit);
  const host=document.createElement('div');host.className='reference-chart-host';host.setAttribute('aria-label',`${source.market} ${timeframe} analyst reference chart`);
  const error=document.createElement('div');error.className='reference-chart-error';error.hidden=true;
  card.append(head,host,error);$('#referenceChartGrid').append(card);
  const item={index:referenceTimeframes.indexOf(timeframe)+1,timeframe,params:{...source,timeframe},card,head,host,error,chart:null,bars:[],source:null,shammyDrawingIds:[],shammyMarksVisible:true};
  fit.addEventListener('click',()=>fitReferenceHistory(item));
  marks.addEventListener('click',()=>{
    item.shammyMarksVisible=!item.shammyMarksVisible;
    for(const id of item.shammyDrawingIds)item.chart?.drawings?.setVisible?.(id,item.shammyMarksVisible);
    marks.textContent=item.shammyMarksVisible?'Count':'Show count';
    marks.setAttribute('aria-label',`${item.shammyMarksVisible?'Hide':'Show'} ${timeframe.toUpperCase()} Rider count`);
  });
  note.addEventListener('click',()=>{const panel=item.host.querySelector('.shammy-chart-summary');if(!panel)return;panel.hidden=!panel.hidden;note.textContent=panel.hidden?'Note':'Hide note';});
  return item;
}
function updateReferenceChartHead(item){
  const title=document.createElement('strong');title.textContent=item.timeframe.toUpperCase();
  const market=document.createElement('small');
  const first=item.bars[0]?.time,last=item.bars.at(-1)?.time;
  const span=first&&last?`${new Date(first).toISOString().slice(0,10)} → ${new Date(last).toISOString().slice(0,10)}`:'';
  market.textContent=`${item.params.market} · ${fmt(item.bars.length,0)} bars · ${span} · full loaded span`;
  market.title=`${providerSpecs[item.params.id].label} · ${item.bars.length} loaded bars${item.bars.length===referenceHistoryLimit?' (latest 5,000 requested)':''} · ${span}`;
  const fit=item.head.querySelector('.reference-fit-button'),marks=item.head.querySelector('.reference-marks-button'),note=item.head.querySelector('.reference-note-button');
  item.head.replaceChildren(title,market,marks,note,fit);
}
async function loadReferenceWorkspace(onProgress=()=>{}){
  const sourceParams=referenceSource();
  if(!providerSpecs[sourceParams.id]||!validMarket(sourceParams.market))throw new Error('Load a valid trading chart before collecting analyst reference charts.');
  const sequence=++referenceLoadSequence;
  const status=$('#referenceWorkspaceStatus');
  const button=$('#referenceLayoutButton');
  button.disabled=true;
  status.textContent=`Loading ${sourceParams.market} reference charts…`;
  const now=Date.now();
  const results=[];
  for(const timeframe of referenceTimeframes){
    onProgress({timeframe,status:'loading'});
    try{
      const params={...sourceParams,timeframe};
      const bars=await fetchBars(params,referenceHistoryLimit);
      if(!bars.length)throw new Error('No public bars returned for this timeframe.');
      results.push({status:'fulfilled',value:{timeframe,params,bars,loadedAt:Date.now(),snapshotAsOf:now}});
      onProgress({timeframe,status:'loaded',bars:completedBars(bars,timeframe,now).length,cutoff:bars.at(-1).time});
    }catch(error){results.push({status:'rejected',reason:error});onProgress({timeframe,status:'failed',error:error.message});}
  }
  if(sequence!==referenceLoadSequence){button.disabled=false;throw new Error('Reference chart loading was superseded.');}
  for(const item of referenceCharts)item.chart?.destroy();
  referenceCharts=[];$('#referenceChartGrid').replaceChildren();
  const errors=[];
  for(let index=0;index<referenceTimeframes.length;index++){
    const timeframe=referenceTimeframes[index],result=results[index];
    const item=makeReferenceChart(timeframe,sourceParams);referenceCharts.push(item);
    if(result.status!=='fulfilled'){
      item.error.textContent=`${timeframe.toUpperCase()} unavailable · ${result.reason?.message||'Public bars could not be loaded.'}`;item.error.hidden=false;errors.push(`${timeframe}: ${result.reason?.message||'unavailable'}`);continue;
    }
    const loaded=result.value;item.params=loaded.params;item.bars=loaded.bars;
    item.source={...loaded.params,label:providerSpecs[loaded.params.id].label,type:providerSpecs[loaded.params.id].type,cutoff:loaded.bars.at(-1).time,snapshotAsOf:loaded.snapshotAsOf,loadedAt:loaded.loadedAt};
    updateReferenceChartHead(item);
    try{
      const chartInstance=new window.Vela.Vela(item.host,{symbol:loaded.params.market,timeframe, data:loaded.bars,live:false,theme:'dark',...(cryptoDeskEnabled?{upColor:'#57be76',downColor:'#ff354d',volume:false}:quantGameEnabled?{upColor:'#e1e3e8',downColor:'#e1e3e8'}:{}),drawings:true,volume:!cryptoDeskEnabled,currentPriceLine:true,timeScale:{timezone:'UTC'},nativeBackend:'canvas2d',animations:{intro:false}});
      item.chart=chartInstance;await chartInstance.ready();
      if(cryptoDeskEnabled)applyTradingCandles(chartInstance);
      if(sequence!==referenceLoadSequence){chartInstance.destroy();throw new Error('Reference chart loading was superseded.');}
      await new Promise(resolve=>requestAnimationFrame(resolve));fitReferenceHistory(item);
    }catch(error){item.error.textContent=`${timeframe.toUpperCase()} chart unavailable · ${error.message}`;item.error.hidden=false;errors.push(`${timeframe}: ${error.message}`);}
  }
  const saved=readShammyArchive().find(record=>record.markup?.schema==='cleo.elliott-markup.v2'&&
    record.source?.provider===sourceParams.id&&record.source?.symbol===sourceParams.market&&
    Number(record.source?.cutoff)===Number(slots[0]?.source?.cutoff));
  if(saved)for(const frame of saved.markup.frames.filter(view=>view.workspace==='reference')){
    try{applyElliottMarkup({...frame,schema:'cleo.elliott-markup.v1',method:saved.markup.method,packageFrame:true},{keepWorkspace:true});}catch{}
  }
  button.disabled=false;
  const loadedCount=referenceCharts.filter(item=>item.chart&&item.source&&item.bars.length).length;
  referenceSnapshot={provider:sourceParams.id,symbol:sourceParams.market,loadedAt:Date.now(),loadedCount};
  status.textContent=`${loadedCount}/6 loaded · ${providerSpecs[sourceParams.id].label} · ${sourceParams.market} · full loaded span`;
  if(errors.length)throw new Error(`Reference charts incomplete (${loadedCount}/6). ${errors.join('; ')}`);
  if(loadedCount!==6)throw new Error(`Only ${loadedCount} of 6 analyst reference charts loaded.`);
  return referenceCharts;
}
async function captureReferenceComposite(){
  const images=await Promise.all(referenceCharts.map(async item=>{
    const imageData=String(await item.chart?.renderer?.screenshot?.()||'');
    if(!/^data:image\/(?:png|jpeg|webp);base64,/i.test(imageData))throw new Error(`${item.timeframe.toUpperCase()} screenshot is unavailable.`);
    return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({item,image});image.onerror=()=>reject(new Error(`${item.timeframe.toUpperCase()} screenshot could not be prepared.`));image.src=imageData;});
  }));
  const columns=3,rows=2,gap=12,labelHeight=28,tileWidth=Math.min(760,Math.max(...images.map(({image})=>image.naturalWidth)));
  const tileHeight=Math.round(tileWidth*Math.max(...images.map(({image})=>image.naturalHeight/image.naturalWidth)));
  const scale=Math.min(1,2400/(columns*tileWidth+(columns+1)*gap),1600/(rows*(tileHeight+labelHeight)+(rows+1)*gap));
  const canvas=document.createElement('canvas');canvas.width=Math.round((columns*tileWidth+(columns+1)*gap)*scale);canvas.height=Math.round((rows*(tileHeight+labelHeight)+(rows+1)*gap)*scale);
  const context=canvas.getContext('2d');if(!context)throw new Error('The reference workspace image could not be composed.');
  context.scale(scale,scale);context.fillStyle='#101216';context.fillRect(0,0,canvas.width/scale,canvas.height/scale);
  images.forEach(({item,image},index)=>{
    const x=gap+(index%columns)*(tileWidth+gap),y=gap+Math.floor(index/columns)*(tileHeight+labelHeight+gap);
    context.fillStyle='#1b1e23';context.fillRect(x,y,tileWidth,labelHeight);context.fillStyle='#f1f2f4';context.font='700 13px system-ui';context.fillText(`${item.timeframe.toUpperCase()} · ${item.source.market}`,x+9,y+18);
    context.fillStyle='#111317';context.fillRect(x,y+labelHeight,tileWidth,tileHeight);context.drawImage(image,x,y+labelHeight,tileWidth,tileHeight);
  });
  return canvas.toDataURL('image/jpeg',.84);
}
async function captureAnalysisOutputPair(chartContext){
  const pair=syncAnalysisOutputPair(),sourceFrames=chartContext?.charts||[];
  const selected=pair.map(timeframe=>{
    const item=referenceCharts.find(chart=>chart.timeframe===timeframe);
    const source=sourceFrames.find(frame=>frame.timeframe===timeframe)||{};
    return {timeframe,item,frame:{timeframe,provider:source.provider||item?.source?.id||'',symbol:source.symbol||item?.source?.market||'',
      cutoff:source.cutoff&&Number.isFinite(Number(source.cutoff))?new Date(Number(source.cutoff)).toISOString():'',loadedCutoff:source.loadedCutoff??item?.source?.cutoff??null}};
  });
  const frames=selected.map(entry=>entry.frame);
  const images=await Promise.all(selected.map(async({timeframe,item})=>{
    const imageData=String(await item?.chart?.renderer?.screenshot?.()||'');
    if(!/^data:image\/(?:png|jpeg|webp);base64,/i.test(imageData))throw new Error(`${timeframe.toUpperCase()} output image unavailable`);
    return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({timeframe,image,item});image.onerror=()=>reject(new Error(`${timeframe.toUpperCase()} output image could not be decoded`));image.src=imageData;});
  }));
  const gap=10,labelHeight=26,tileWidth=Math.min(1000,Math.max(...images.map(({image})=>image.naturalWidth)));
  const tileHeight=Math.round(tileWidth*Math.max(...images.map(({image})=>image.naturalHeight/image.naturalWidth)));
  const scale=Math.min(1,2200/(tileWidth*2+gap*3),1500/(tileHeight+labelHeight+gap*2));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((tileWidth*2+gap*3)*scale));canvas.height=Math.max(1,Math.round((tileHeight+labelHeight+gap*2)*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('The two-chart output image could not be composed.');
  context.scale(scale,scale);context.fillStyle='#101216';context.fillRect(0,0,canvas.width/scale,canvas.height/scale);
  images.forEach(({timeframe,image,item},index)=>{
    const x=gap+index*(tileWidth+gap),y=gap;
    context.fillStyle='#1b1e23';context.fillRect(x,y,tileWidth,labelHeight);context.fillStyle='#f1f2f4';context.font='700 12px system-ui';
    context.fillText(`${timeframe.toUpperCase()} · ${item?.source?.market||frames[index].symbol||'symbol unavailable'}`,x+8,y+17);
    context.fillStyle='#111317';context.fillRect(x,y+labelHeight,tileWidth,tileHeight);context.drawImage(image,x,y+labelHeight,tileWidth,tileHeight);
  });
  return {image:canvas.toDataURL('image/jpeg',.84),frames};
}
function referenceHistoryExtremes(completed,timeframe){
  const older=completed.slice(0,-240);
  if(!older.length)return [];
  const bucketCount=timeframe==='1d'?96:timeframe==='4h'?72:48;
  const bucketSize=Math.max(1,Math.ceil(older.length/bucketCount));
  const points=[];
  for(let start=0;start<older.length;start+=bucketSize){
    const bucket=older.slice(start,start+bucketSize);
    const high=bucket.reduce((best,bar)=>bar.high>best.high?bar:best,bucket[0]);
    const low=bucket.reduce((best,bar)=>bar.low<best.low?bar:best,bucket[0]);
    points.push({time:high.time,price:high.high,kind:'high'},{time:low.time,price:low.low,kind:'low'});
  }
  return points.sort((a,b)=>a.time-b.time||a.kind.localeCompare(b.kind));
}
function referenceSwingCandidates(completed){
  // A full-span, chronological turning-point catalog. A wider radius gives a
  // coarser view, so parent candidates also remain visible in finer catalogs.
  const radii={major:Math.max(4,Math.round(completed.length/24)),intermediate:Math.max(3,Math.round(completed.length/60)),minor:Math.max(2,Math.round(completed.length/120))};
  return Object.fromEntries(Object.entries(radii).map(([degree,radius])=>{
    const points=[];
    for(let index=1;index<completed.length-1;index++){
      const bar=completed[index],start=Math.max(0,index-radius),end=Math.min(completed.length-1,index+radius);
      let high=true,low=true;
      for(let cursor=start;cursor<=end&&(high||low);cursor++){
        if(cursor===index)continue;
        if(completed[cursor].high>=bar.high)high=false;
        if(completed[cursor].low<=bar.low)low=false;
      }
      // A bar that is both a local high and low has no known intrabar order.
      if(high===low)continue;
      const candidate=[bar.time,high?bar.high:bar.low,high?'high':'low'];
      const previous=points.at(-1);
      if(previous?.[2]===candidate[2]){
        if(high?candidate[1]>previous[1]:candidate[1]<previous[1])points[points.length-1]=candidate;
      }else points.push(candidate);
    }
    return [degree,points];
  }));
}
function recentObservedSwing(completed){
  if(!Array.isArray(completed)||completed.length<8)return null;
  const candidates=referenceSwingCandidates(completed),floorTime=Number(completed[Math.floor(completed.length*.55)]?.time||0);
  for(const degree of ['major','intermediate','minor']){
    const points=(candidates[degree]||[]).filter(point=>Number(point[0])>=floorTime);
    for(let index=points.length-1;index>0;index--){
      const first=points[index-1],last=points[index];
      if(first[2]===last[2]||Number(last[0])<=Number(first[0]))continue;
      const high=first[2]==='high'?first:last,low=first[2]==='low'?first:last;
      if(high[1]<=low[1])continue;
      return {degree,high:{time:Number(high[0]),price:Number(high[1])},low:{time:Number(low[0]),price:Number(low[1])},direction:first[2]==='low'?'advance':'decline'};
    }
  }
  return null;
}
function recentCandidatePriceStructures(completed){
  if(!Array.isArray(completed)||completed.length<12)return {trendlines:[],channels:[]};
  const candidates=referenceSwingCandidates(completed),floorTime=Number(completed[Math.floor(completed.length*.45)]?.time||0);
  const line=(kind)=>{
    let points=(candidates.major||[]).filter(point=>point[2]===kind&&Number(point[0])>=floorTime);
    if(points.length<2)points=(candidates.intermediate||[]).filter(point=>point[2]===kind&&Number(point[0])>=floorTime);
    if(points.length<2)return null;
    const anchors=points.slice(-2).map(([time,price,pivotKind])=>({time:Number(time),price:Number(price),kind:pivotKind}));
    return {anchors,slope:(anchors[1].price-anchors[0].price)/(anchors[1].time-anchors[0].time)};
  };
  const upper=line('high'),lower=line('low');
  if(upper&&lower){
    const start=Math.max(upper.anchors[0].time,lower.anchors[0].time),end=Math.min(upper.anchors[1].time,lower.anchors[1].time),scale=Math.max(Math.abs(upper.slope),Math.abs(lower.slope));
    if(end>start&&Math.abs(upper.slope-lower.slope)<=scale*.25){
      const at=(entry,time)=>entry.anchors[0].price+entry.slope*(time-entry.anchors[0].time);
      if([start,end].every(time=>at(upper,time)>at(lower,time))){
        const falling=upper.slope<0&&lower.slope<0,rising=upper.slope>0&&lower.slope>0;
        return {trendlines:[],channels:[{id:'observed_candidate_channel',label:`candidate ${falling?'falling':rising?'rising':'sideways'} price channel`,status:'candidate',
          upper:{anchors:upper.anchors,evidenceRefs:upper.anchors.map(point=>point.time),touches:upper.anchors},
          lower:{anchors:lower.anchors,evidenceRefs:lower.anchors.map(point=>point.time),touches:lower.anchors}}]};
      }
    }
  }
  const pick=upper&&lower?(upper.anchors[1].time>lower.anchors[1].time?upper:lower):(upper||lower);
  return pick?{trendlines:[{id:'observed_candidate_trendline',label:`candidate ${pick.slope<0?'falling':'rising'} price trendline`,role:pick.anchors[0].kind==='high'?'resistance':'support',status:'candidate',anchors:pick.anchors,evidenceRefs:pick.anchors.map(point=>point.time),touches:pick.anchors}],channels:[]}:{trendlines:[],channels:[]};
}
async function collectReferenceAnalysisBundle(onProgress=()=>{}){
  showReferenceWorkspace(true);
  await loadReferenceWorkspace(onProgress);
  // Loading the reference workspace restores the saved analysis for the exact
  // same trader cutoff. A new analysis must not receive that old markup as its
  // chart image, so clear the just-restored layers before capturing the bundle.
  clearVisibleShammyMarks();
  const charts=referenceCharts.map(item=>{
    const completed=completedBars(item.bars,item.timeframe,item.source.snapshotAsOf);
    if(!completed.length)throw new Error(`${item.timeframe.toUpperCase()} has no completed bars for the analyst context.`);
    const historyHigh=completed.reduce((best,bar)=>bar.high>best.high?bar:best,completed[0]);
    const historyLow=completed.reduce((best,bar)=>bar.low<best.low?bar:best,completed[0]);
    return {chart:item.index,workspace:'analyst reference',provider:item.source.id,sourceLabel:item.source.label,symbol:item.source.market,
      timeframe:item.source.timeframe,cutoff:completed.at(-1)?.time||null,loadedCutoff:item.source.cutoff,
      barCompleteness:completed.length<item.bars.length?'Latest provider bar may be forming; excluded from supplied OHLCV.':'Completed bars inferred from interval and snapshot time.',
      loadedAt:item.source.loadedAt,freshness:'unverified public provider snapshot',barCount:item.bars.length,
      historyFirst:completed[0].time,historyLast:completed.at(-1).time,
      historyFirstUTC:utc(completed[0].time),historyLastUTC:utc(completed.at(-1).time),historyBarCount:completed.length,
      historyHigh:{time:historyHigh.time,utc:utc(historyHigh.time),price:historyHigh.high},
      historyLow:{time:historyLow.time,utc:utc(historyLow.time),price:historyLow.low},
      historyRequestLimit:referenceHistoryLimit,historyExtremes:referenceHistoryExtremes(completed,item.timeframe),
      swingCandidateColumns:['time','wickPrice','kind'],swingCandidates:referenceSwingCandidates(completed),
      ...(['1d','4h'].includes(item.timeframe)?{historyBarsColumns:['time','open','high','low','close','volume'],
        historyBars:completed.map(bar=>[bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume])}:{}),
      contextBarCount:Math.min(240,completed.length),visibleRange:item.chart?.getVisibleRange?.()||null,studies:[],drawings:[],
      bars:completed.slice(-240).map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}))};
  });
  const traderTimeframe=slots[0]?.source?.timeframe||slots[0]?.params?.timeframe;
  const activeReference=charts.find(item=>item.timeframe===traderTimeframe)?.chart||1;
  const trader=slots[0],traderCompleted=completedBars(trader.bars,trader.source.timeframe,trader.source.snapshotAsOf);
  if(!traderCompleted.length)throw new Error('The trader chart has no completed bars for sourced marks.');
  const traderChart={chart:1,provider:trader.source.id,sourceLabel:trader.source.label,symbol:trader.source.market,
    timeframe:trader.source.timeframe,cutoff:trader.source.cutoff,completedCutoff:traderCompleted.at(-1).time,
    snapshotAsOf:trader.source.snapshotAsOf,barCompleteness:traderCompleted.length<trader.bars.length?'Latest provider bar excluded as possibly forming.':'Completed bars inferred from interval and snapshot time.',
    swingCandidateColumns:['time','wickPrice','kind'],swingCandidates:referenceSwingCandidates(traderCompleted),
    bars:traderCompleted.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}))};
  const chart={tab:'Quant Lab analyst reference workspace',workspace:'analyst-reference',activeChart:activeReference,chartCount:charts.length,charts,traderChart,capturedAt:new Date().toISOString()};
  const image=await captureReferenceComposite();
  return {chart,image};
}
async function loadSlot(index,params,reuse=null){
  const slot=slots[index];if(!slot)return;
  const sequence=++slot.sequence;slot.params={...params};updateSlotHead(slot);slot.error.hidden=true;
  const snapshotAsOf=reuse?.snapshotAsOf??Date.now();
  if(index===activeIndex){$('#loadChart').disabled=true;setStatus(`Chart ${index+1} · loading ${providerSpecs[params.id].label} · ${params.market} · ${params.timeframe}…`);}
  try{
    if(!validParams(params))throw new Error('Enter a valid market and interval.');
    if(!window.Vela?.Vela)throw new Error('Vela browser bundle is unavailable.');
    if(quantGameEnabled){const context=completedBars(await fetchBars({...params,timeframe:'15m'},2),'15m',snapshotAsOf).at(-1);if(!context)throw new Error('No completed 15m field context available.');slot.gameContext15=context;slot.gameStart=context.time;}
    const nextBars=reuse?.bars || await fetchBars(params,500,quantGameEnabled?slot.gameStart:null);
    if(slot.sequence!==sequence || slots[index]!==slot)return;
    if(!nextBars.length)throw new Error('The public provider returned no valid bars. Check the symbol or network.');
    for(const off of slot.unsub)off();slot.unsub=[];
    for(const id of slot.premium)clearPremium(slot,id);
    slot.host.classList.remove('rider-reference-presentation');
    slot.cleoDrawingIds=[];slot.shammyDrawingIds=[];slot.shammyMarkupSignature='';slot.readMarketLayerIds=emptyReadMarketLayerIds();slot.readMarketLayerVisibility=defaultReadMarketLayerVisibility();
    slot.chart?.destroy();slot.host.replaceChildren();
    if(index===0)$('#toggleShammySummary').hidden=true;
    const nextChart=new window.Vela.Vela(slot.host,{symbol:params.market,timeframe:params.timeframe,data:nextBars,live:false,theme:'dark',...(cryptoDeskEnabled?{upColor:'#57be76',downColor:'#ff354d',volume:false,grid:{vertLines:{visible:false},horzLines:{visible:false}}}:quantGameEnabled?{upColor:'#e1e3e8',downColor:'#e1e3e8'}:{}),drawings:true,volume:!cryptoDeskEnabled,currentPriceLine:true,timeScale:{timezone:'UTC'},nativeBackend:'canvas2d',animations:{intro:false}});
    slot.chart=nextChart;
    await nextChart.ready();
    if(cryptoDeskEnabled)applyTradingCandles(nextChart);
    if(cryptoDeskEnabled)nextChart.renderer.applyConfig({grid:{vertLines:{visible:false},horzLines:{visible:false}}});
    if(slot.sequence!==sequence || slots[index]!==slot){nextChart.destroy();return;}
    await new Promise(resolve=>requestAnimationFrame(resolve));nextChart.resize();
    slot.bars=nextBars;slot.source={...params,label:providerSpecs[params.id].label,type:providerSpecs[params.id].type,cutoff:nextBars.at(-1).time,snapshotAsOf,loadedAt:Date.now()};
    if(index===0&&!quantGameEnabled&&!cryptoDeskEnabled)applyRiderPresentation(slot);
    if(quantGameEnabled)await window.quantGame?.chartLoaded(slot);
    if(slot.sequence!==sequence||slots[index]!==slot)return;
    if(!quantGameEnabled&&!cryptoDeskEnabled)restoreCleoMarks(slot);
    if(index===0&&!quantGameEnabled){
      const saved=readShammyArchive().find(record=>record.markup&&
        record.source?.provider===slot.source.id&&record.source?.symbol===slot.source.market&&
        record.source?.timeframe===slot.source.timeframe&&Number(record.source?.cutoff)===Number(slot.source.cutoff));
      if(saved)try{
        applyElliottMarkup(saved.markup,{keepWorkspace:true});
        if(saved.hidden){slot.shammyMarksVisible=false;for(const id of slot.shammyDrawingIds)slot.chart.drawings.setVisible(id,false);updateShammyMarksButton();}
      }catch{}
    }
    slot.unsub.push(nextChart.on('drawing:edited',({id})=>{if(slot.cleoDrawingIds.includes(id))saveCleoMarks(slot);}));
    slot.unsub.push(nextChart.on('drawing:removed',({id})=>{
      if(slot.shammyDrawingIds.includes(id)){slot.shammyDrawingIds=slot.shammyDrawingIds.filter(item=>item!==id);updateShammyMarksButton();return;}
      if(!slot.cleoDrawingIds.includes(id))return;
      slot.cleoDrawingIds=slot.cleoDrawingIds.filter(item=>item!==id);
      for(const section of readMarketSections)slot.readMarketLayerIds[section]=slot.readMarketLayerIds[section].filter(item=>item!==id);
      saveCleoMarks(slot);updateCleoMarksButton();
    }));
    slot.unsub.push(nextChart.renderer.onCrosshairMove(event=>{
      if(Number.isFinite(Number(event.price)))slot.hover={price:Number(event.price),time:Number.isFinite(Number(event.time))?Number(event.time):slot.bars.at(-1)?.time};
      syncCrosshairFrom(index,event);
    }));
    slot.unsub.push(nextChart.renderer.onConfigChanged(()=>syncStyleFrom(index)));
    for(const id of slot.premium){
      if(cryptoDeskEnabled&&id==='wave-court')continue;
      try{await addPremium(slot,id);}catch(error){slot.premium.delete(id);slot.premiumStatus=`${quantPremiumItems[id].name} unavailable: ${error.message}`;}
    }
    updateSlotHead(slot);slot.error.hidden=true;
    if(syncPrefs.style && index!==activeIndex)syncStyleFrom(activeIndex);
    if(index===activeIndex){lastResult=null;lastRunKey='';activateSlot(index,false);refreshActivePanel();if(!quantGameEnabled||window.quantGame?.mode()==='sim')void advanceQuantLabSnapshot(slot);void loadQuantLabPositions();}
    saveLayoutState();
  }catch(error){
    if(slot.sequence!==sequence || slots[index]!==slot)return;
    slot.error.textContent=error.message;slot.error.hidden=false;
    if(index===activeIndex)activateSlot(index,false);
  }finally{if(index===activeIndex && slot.sequence===sequence)$('#loadChart').disabled=false;}
}
function resizeCharts(){requestAnimationFrame(()=>{for(const slot of slots)slot.chart?.resize();for(const item of referenceCharts)fitReferenceHistory(item);});}
function updateLayoutPicker(){
  $('#chartGrid').dataset.count=String(slots.length);
  $('#layoutCount').textContent=String(slots.length);
  $('#layoutButton').setAttribute('aria-label',`Chart layout, ${slots.length} chart${slots.length===1?'':'s'}`);
  $('#layoutDescription').textContent=`${slots.length} chart${slots.length===1?'':'s'} · select a chart to edit it`;
  for(const button of $('#layoutChoices').querySelectorAll('[data-layout-count]'))button.setAttribute('aria-pressed',String(Number(button.dataset.layoutCount)===slots.length));
}
function setLayout(count,{initial=false,charts=[]}={}){
  if(quantGameEnabled&&count!==1)return;
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
  if(!$('#referenceWorkspace').hidden)try{await loadReferenceWorkspace();}catch(error){$('#referenceWorkspaceStatus').textContent=error.message;}
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
$('#assetProfileOpen').addEventListener('click',()=>$('#mymAssetProfile').showModal());
$('#assetProfileClose').addEventListener('click',()=>$('#mymAssetProfile').close());
$('#mymAssetProfile').addEventListener('click',event=>{if(event.target===$('#mymAssetProfile'))$('#mymAssetProfile').close();});
$('#referenceLayoutButton').addEventListener('click',async()=>{
  const show=$('#referenceWorkspace').hidden;
  showReferenceWorkspace(show);
  if(show){try{await loadReferenceWorkspace();}catch(error){$('#referenceWorkspaceStatus').textContent=error.message;}}
});
$('#provider').addEventListener('change',()=>{$('#market').value=providerSpecs[$('#provider').value].market;setStatus('Source changed. Press Load chart to load its bars.');});
$('#market').addEventListener('keydown',event=>{if(event.key==='Enter')loadChart();});
$('#timeframe').addEventListener('change',()=>setStatus('Interval changed. Press Load chart to load its bars.'));
window.addEventListener('resize',resizeCharts);

async function renderIndicators() {
  panel('indicators','Indicators','<div class="indicator-tabs" role="tablist" aria-label="Indicator categories"><button type="button" role="tab" data-indicator-tab="vela">Vela defaults</button><button type="button" role="tab" data-indicator-tab="premium">Premium</button><button type="button" role="tab" data-indicator-tab="tools">Tools</button></div><label class="indicator-search">Search indicators<input id="indicatorSearch" type="search" placeholder="Name or description" autocomplete="off"></label><p id="indicatorIntro"></p><p id="indicatorStatus" class="indicator-status" role="status" aria-live="polite"></p><div id="indicatorList" class="panel-list" role="tabpanel"></div>');
  for(const button of $('#panelBody').querySelectorAll('[data-indicator-tab]')){
    button.setAttribute('aria-selected',String(button.dataset.indicatorTab===indicatorTab));
    button.addEventListener('click',()=>{indicatorTab=button.dataset.indicatorTab;void renderIndicators();});
  }
  const list=$('#indicatorList');
  const filterCards=()=>{const query=$('#indicatorSearch').value.trim().toLocaleLowerCase();for(const card of list.children)card.hidden=Boolean(query)&&!card.textContent.toLocaleLowerCase().includes(query);};
  $('#indicatorSearch').addEventListener('input',filterCards);
  const slot=slots[activeIndex];
  $('#indicatorStatus').textContent=slot?.premiumStatus||'';
  if(indicatorTab!=='vela'){
    $('#indicatorIntro').textContent=indicatorTab==='premium'?'Premium chart indicators are descriptive overlays. Liquidity Force joins confirmed Liquidity levels to matched OHLC-inferred Liquid Gravity pools. Gravity is relative, not probability or order-book size.':'Interactive chart tools use confirmed swings. Hover the chart after adding Smart Fib to preview its levels.';
    const ids=indicatorTab==='premium'?['wave-court','liquidity-force','liquidity','liquid-gravity','volume-profile','tpo','vwap','footprint','volume-bubbles','ttp-volume-analyst']:['smart-fib'];
    for(const id of ids){
      const item=quantPremiumItems[id],active=Boolean(slot?.premium.has(id));
      const outsideGameScope=quantGameEnabled&&!['wave-court','volume-profile','tpo','vwap','footprint','volume-bubbles'].includes(id);
      const card=document.createElement('article');card.className=`card premium-card${active?' is-active':''}`;
      const image=document.createElement('img');image.src=`./tool-belt-assets/${item.image}`;image.alt='';image.className='premium-icon';
      const copy=document.createElement('div');copy.className='premium-copy';
      const titleRow=document.createElement('div');titleRow.className='premium-title-row';
      const title=document.createElement('strong');title.textContent=item.name;
      const premiumTag=document.createElement('span');premiumTag.className='premium-tag';premiumTag.textContent='Premium';
      titleRow.append(title,premiumTag);
      const detail=document.createElement('small');detail.textContent=item.description;
      const state=document.createElement('span');state.className='premium-state';state.textContent=active?'On selected chart':item.requiresExecutionFeed?(slot?.params.id==='coinbase'&&slot?.chart?'Coinbase trade check on Add':'Select Coinbase chart'):slot?.chart?'Available':'Load a chart';
      if(outsideGameScope)state.textContent='Requires data outside the active field';
      copy.append(titleRow,detail,state);
      if(item.requiresExecutionFeed){const terms=document.createElement('a');terms.href='https://www.coinbase.com/legal/market_data';terms.target='_blank';terms.rel='noopener noreferrer';terms.textContent='Coinbase market-data terms ↗';terms.className='premium-terms';copy.append(terms);}
      const actions=document.createElement('div');actions.className='premium-actions';
      const toggle=document.createElement('button');toggle.type='button';toggle.textContent=active?'Remove':'Add';
      toggle.disabled=!slot?.chart||(item.requiresExecutionFeed&&slot?.params.id!=='coinbase');
      if(outsideGameScope&&!active)toggle.disabled=true;
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
      card.append(image,copy,actions);
      if(id==='liquidity-force'){
        const settings=slot.liquidityForceSettings||(slot.liquidityForceSettings={view:'Raw Levels',showProfile:true,profileTimeframe:'1h'});
        const controls=document.createElement('div');controls.className='liquidity-force-controls';
        const viewLabel=document.createElement('label');viewLabel.textContent='Liquidity view';
        const view=document.createElement('select');view.setAttribute('aria-label','Liquidity Force level view');
        for(const value of ['Raw Levels','Convergence']){const option=document.createElement('option');option.value=value;option.textContent=value;option.selected=settings.view===value;view.append(option);}
        viewLabel.append(view);controls.append(viewLabel);
        const profileLabel=document.createElement('label');profileLabel.className='liquidity-force-profile-toggle';
        const profile=document.createElement('input');profile.type='checkbox';profile.checked=settings.showProfile;profile.setAttribute('aria-label','Show Liquidity Force cluster volume profile');
        profileLabel.append(profile,document.createTextNode('Show cluster volume profile'));controls.append(profileLabel);
        const tfLabel=document.createElement('label');tfLabel.textContent='Profile timeframe';
        const tf=document.createElement('select');tf.disabled=!settings.showProfile;tf.setAttribute('aria-label','Liquidity Force profile timeframe');
        for(const value of ['5m','15m','30m','1h','4h','1d']){const option=document.createElement('option');option.value=value;option.textContent=value.toUpperCase();option.selected=settings.profileTimeframe===value;tf.append(option);}
        tfLabel.append(tf);controls.append(tfLabel);
        const note=document.createElement('small');note.textContent=active?'Ranks use matched Gravity pools. They are relative attraction scores, not probabilities.':'Choose the view and profile here; Add applies these settings to the chart.';controls.append(note);
        const redraw=async()=>{
          if(!active)return;
          for(const input of controls.querySelectorAll('select,input'))input.disabled=true;
          try{await addPremium(slot,'liquidity-force');}
          catch(error){slot.premiumStatus=`Liquidity Force unavailable: ${error.message}`;}
          if(activePanel==='indicators'&&slots[activeIndex]===slot)void renderIndicators();
        };
        view.addEventListener('change',()=>{settings.view=view.value;void redraw();});
        profile.addEventListener('change',()=>{settings.showProfile=profile.checked;tf.disabled=!settings.showProfile;void redraw();});
        tf.addEventListener('change',()=>{settings.profileTimeframe=tf.value;void redraw();});
        card.append(controls);
      }
      if(id==='smart-fib'&&active){
        const lock=document.createElement('button');lock.type='button';lock.textContent=slot.fib?.locked?'Unlock swing':'Lock preview';
        lock.addEventListener('click',()=>{if(slot.fib?.locked)slot.fib.unlock();else if(!slot.fib?.lock())slot.premiumStatus='Hover a confirmed 1h swing on the chart before locking it.';void renderIndicators();});
        actions.append(lock);
      }
      list.append(card);
    }
    filterCards();return;
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
      const button=document.createElement('button'); button.type='button';button.textContent=item.present?'Remove':'Add';button.disabled=!item.supported||(quantGameEnabled&&item.type==='ttp-relative-volume');
      button.addEventListener('click',()=>{try{if(item.present){const handle=chart.indicators().find(h=>h.nativeType===item.type);handle?.remove();}else {if(quantGameEnabled&&gameStudyCount(slot)>=2)throw new Error('The game allows two optional indicators. Remove one first.');chart.addNativeIndicator(item.type);}renderIndicators();}catch(error){setStatus(error.message,true);}});
      card.append(title,detail,button);list.append(card);
    }
    if(!indicators.length)list.textContent='No native indicators are available.';
    filterCards();
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
function renderConnections(){const active=source?`${escapeHtml(source.label)} · ${escapeHtml(source.market)} · ${escapeHtml(source.timeframe)}<br>Loaded ${utc(source.loadedAt)} · last bar ${utc(source.cutoff)}`:'No chart source loaded.';const boundary=quantGameEnabled?'Chart providers supply public market bars. The separate Broker panel shows configured Robinhood MCP account snapshots and previews. This game does not stream private account updates or route live orders. A chart refresh requests a new market snapshot; availability and freshness depend on the provider.':'These are public market-data adapters. Broker login, balances, positions, fills, private streams, and order routing are not connected. A chart refresh requests a new snapshot; availability and freshness depend on the provider.';panel('connections','Market data connections',`<div class="card"><strong>Active chart source</strong><p>${active}</p></div>${Object.entries(providerSpecs).map(([id,spec])=>`<div class="card"><strong>${escapeHtml(spec.label)}</strong><small>${escapeHtml(spec.type)} · public market bars through Vela</small><small>${source?.id===id?'ACTIVE SNAPSHOT':'AVAILABLE TO LOAD'}</small></div>`).join('')}<p class="warning">${boundary}</p>`);}
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
    const sectionById=new Map(readMarketSections.flatMap(section=>(slot.readMarketLayerIds?.[section]||[]).map(id=>[id,section])));
    const drawings=(slot.chart?.drawings?.all?.()||[]).filter(item=>ids.has(item.id)).map(item=>({type:item.type,paneId:item.paneId,anchors:item.anchors,style:item.style,text:item.text,props:item.props,zIndex:item.zIndex,section:sectionById.get(item.id)||null}));
    if(drawings.length)all[key]={source:{id:slot.source.id,market:slot.source.market,timeframe:slot.source.timeframe,cutoff:slot.source.cutoff},drawings,readout:slot.cleoReadout||null,layerVisibility:slot.readMarketLayerVisibility||defaultReadMarketLayerVisibility(),savedAt:Date.now()};
    else delete all[key];
    const keys=Object.keys(all);for(const stale of keys.slice(0,Math.max(0,keys.length-20)))delete all[stale];
    localStorage.setItem(cleoMarksStorageKey,JSON.stringify(all));
  }catch{}
}
function restoreCleoMarks(slot){
  if(!slot?.source||!slot.chart?.drawings?.supported)return;
  const stored=readCleoMarks()[cleoMarksKey(slot.source)];
  if(!stored||Number(stored.source?.cutoff)!==Number(slot.source.cutoff)||!Array.isArray(stored.drawings))return;
  const ids=[],layers=emptyReadMarketLayerIds();
  try{
    for(const item of stored.drawings.slice(0,120)){
      if(!['trendline','ray','hray','hline','box','text'].includes(item?.type)||!Array.isArray(item.anchors)||!item.anchors.length||item.anchors.length>2)continue;
      if(item.type==='text'&&typeof item.text?.value!=='string')continue;
      if(item.anchors.some(point=>!Number.isFinite(Number(point?.time))||!Number.isFinite(Number(point?.price))||Number(point.price)<=0))continue;
      const type=item.type==='hline'?'hray':item.type;
      const style=item.style&&typeof item.style==='object'?{...item.style,lineWidth:1}:{lineWidth:1};
      const drawing=slot.chart.drawings.add(type,{paneId:'price',anchors:item.anchors,style,text:item.text,props:item.props,zIndex:item.zIndex});
      if(drawing?.id){ids.push(drawing.id);if(readMarketSections.includes(item.section))layers[item.section].push(drawing.id);}
    }
  }catch{for(const id of ids)slot.chart.drawings.remove(id);return;}
  slot.cleoDrawingIds=ids;
  slot.readMarketLayerIds=layers;
  slot.readMarketLayerVisibility={...defaultReadMarketLayerVisibility(),...(stored.layerVisibility||{})};
  for(const section of readMarketSections)for(const id of layers[section])slot.chart.drawings?.setVisible?.(id,slot.readMarketLayerVisibility[section]!==false);
  slot.cleoReadout=stored.readout||null;
  const layeredIds=new Set(readMarketSections.flatMap(section=>layers[section]));
  slot.cleoMarksVisible=ids.some(id=>!layeredIds.has(id))||readMarketSections.some(section=>layers[section].length&&slot.readMarketLayerVisibility[section]!==false);
  updateCleoMarksButton();
}
function clearCleoMarks(slot){
  for(const id of [...(slot?.cleoDrawingIds||[])])slot.chart?.drawings?.remove?.(id);
  if(slot){slot.cleoDrawingIds=[];slot.readMarketLayerIds=emptyReadMarketLayerIds();slot.readMarketLayerVisibility=defaultReadMarketLayerVisibility();slot.cleoMarksVisible=true;}
  saveCleoMarks(slot);
  updateCleoMarksButton();
}
function updateCleoMarksButton(){
  const button=$('#toggleCleoMarks'),clear=$('#clearCleoMarks');
  if(!button||!clear)return;
  const slot=slots[activeIndex],count=slot?.cleoDrawingIds?.length||0;
  const controls=$('#readMarketLayerControls'),counts=Object.fromEntries(readMarketSections.map(section=>[section,slot?.readMarketLayerIds?.[section]?.length||0]));
  if(controls){const hasLayers=readMarketSections.some(section=>counts[section]>0);controls.hidden=!hasLayers;for(const control of controls.querySelectorAll('[data-read-market-layer]')){const section=control.dataset.readMarketLayer,visible=slot?.readMarketLayerVisibility?.[section]!==false;control.disabled=!counts[section];control.setAttribute('aria-pressed',String(Boolean(counts[section]&&visible)));control.title=`${section.replaceAll('_',' ')} · ${counts[section]} marks · ${visible?'visible':'hidden'}`;}}
  button.hidden=count===0;
  const anyVisible=count>0&&(slot?.cleoMarksVisible!==false);
  button.textContent=`✦ ${anyVisible?'Hide':'Show'} all marks · ${count}`;
  button.setAttribute('aria-pressed',String(anyVisible));
  clear.hidden=count===0;
}
$('#toggleCleoMarks').addEventListener('click',()=>{
  const slot=slots[activeIndex];if(!slot?.chart)return;
  slot.cleoMarksVisible=slot.cleoMarksVisible===false;
  for(const section of readMarketSections)slot.readMarketLayerVisibility[section]=slot.cleoMarksVisible;
  for(const id of slot.cleoDrawingIds)slot.chart.drawings?.setVisible?.(id,slot.cleoMarksVisible);
  saveCleoMarks(slot);
  updateCleoMarksButton();
});
$('#readMarketLayerControls')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-read-market-layer]'),slot=slots[activeIndex];if(!button||!slot?.chart)return;
  const section=button.dataset.readMarketLayer;if(!readMarketSections.includes(section))return;
  const visible=slot.readMarketLayerVisibility[section]===false;slot.readMarketLayerVisibility[section]=visible;
  for(const id of slot.readMarketLayerIds[section])slot.chart.drawings?.setVisible?.(id,visible);
  slot.cleoMarksVisible=slot.cleoDrawingIds.some(id=>{
    const ownLayer=readMarketSections.find(key=>slot.readMarketLayerIds[key].includes(id));
    return ownLayer?slot.readMarketLayerVisibility[ownLayer]!==false:true;
  });
  saveCleoMarks(slot);updateCleoMarksButton();
});
$('#clearCleoMarks').addEventListener('click',()=>clearCleoMarks(slots[activeIndex]));
function applyCleoMarkup(spec,{allowExistingDuplicates=false}={}){
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
  if(!allowExistingDuplicates){
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
function updateShammyMarksButton(){
  const button=$('#toggleShammyMarks'),slot=slots[activeIndex],count=slot?.shammyDrawingIds?.length||0;
  button.hidden=!count;button.setAttribute('aria-pressed',String(Boolean(count&&slot.shammyMarksVisible!==false)));
  button.textContent=`✦ ${slot?.shammyMarksVisible===false?'Show':'Hide'} Shammy marks · ${count}`;
}
$('#toggleShammyMarks').addEventListener('click',()=>{
  const slot=slots[activeIndex];if(!slot?.shammyDrawingIds?.length)return;
  slot.shammyMarksVisible=!slot.shammyMarksVisible;
  for(const id of slot.shammyDrawingIds)slot.chart?.drawings?.setVisible?.(id,slot.shammyMarksVisible);
  const records=readShammyArchive();
  const record=records.find(item=>item.markup&&item.source?.provider===slot.source?.id&&
    item.source?.symbol===slot.source?.market&&item.source?.timeframe===slot.source?.timeframe&&
    Number(item.source?.cutoff)===Number(slot.source?.cutoff));
  if(record){record.hidden=!slot.shammyMarksVisible;localStorage.setItem(shammyArchiveKey,JSON.stringify(records));}
  updateShammyMarksButton();
  window.dispatchEvent(new Event('quant-lab:shammy-marks-changed'));
});
function showShammySummary(slot,spec){
  const riderDisplayText=value=>String(value??'').replace(/\bunresolved\b/gi,'not established');
  slot.host.querySelector('.shammy-chart-summary')?.remove();
  const readout=spec.readout||{},panel=document.createElement('aside');panel.className='shammy-chart-summary';panel.setAttribute('aria-label','Shammy Elliott Wave findings');
  const head=document.createElement('header');const title=document.createElement('strong');title.textContent='✦ Elliott Wave · Summary';
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Hide Shammy findings');close.textContent='×';close.addEventListener('click',()=>{panel.hidden=true;if(slot.card)slot.head.querySelector('.reference-note-button').textContent='Note';else $('#toggleShammySummary').textContent='✦ Show wave note';});head.append(title,close);
  const source=document.createElement('small');source.textContent=[slot.source.label,slot.source.market,slot.source.timeframe,utc(slot.source.cutoff),'Rider · provisional'].join(' · ');
  const state=document.createElement('b');state.textContent=riderDisplayText(readout.decision||'PROVISIONAL').toUpperCase();
  const summary=document.createElement('p');summary.textContent=riderDisplayText(readout.takeaway||spec.primary?.summary||'Review the sourced wave labels and alternate.').slice(0,240);
  const next=document.createElement('p');next.innerHTML='<b>Watch</b> ';next.append(document.createTextNode(riderDisplayText(readout.next||'Await completed bars that distinguish the count.').slice(0,160)));
  const alternate=document.createElement('p');alternate.innerHTML='<b>Alternate</b> ';alternate.append(document.createTextNode(riderDisplayText(readout.countercase||spec.alternate?.summary||'Developing · check this segment against the next completed bars.').slice(0,140)));
  const fib=document.createElement('p');
  if(spec.verifiedFib){
    const {high,low,levels}=spec.verifiedFib;
    fib.innerHTML=`<b>${spec.verifiedFib.basis?'Observed swing retracement':'Measured retracement'}</b> `;
    fib.append(document.createTextNode(`${fmt(low.price)} ↔ ${fmt(high.price)} · 38.2% ${fmt(levels[0].price)} · 50% ${fmt(levels[1].price)} · 61.8% ${fmt(levels[2].price)}${spec.verifiedFib.basis?' · separate from Elliott count':''}`));
  }else{fib.innerHTML='<b>Fib</b> ';fib.append(document.createTextNode('Not measured · no defensible exact swing anchors supplied.'));}
  const forecast=document.createElement('p');forecast.innerHTML='<b>Forecast</b> ';forecast.append(document.createTextNode(riderDisplayText(spec.verifiedForecasts?.length?spec.verifiedForecasts.map(item=>`${item.scenario}: ${item.condition}`).join(' · ').slice(0,180):'No sourced future path available.')));
  const forecastWarnings=document.createElement('p');forecastWarnings.innerHTML='<b>Discarded path</b> ';forecastWarnings.append(document.createTextNode(riderDisplayText((spec.forecastIssues||[]).join(' · ').slice(0,220))));
  const pivotWarnings=document.createElement('p');pivotWarnings.innerHTML='<b>Discarded pivot</b> ';pivotWarnings.append(document.createTextNode(riderDisplayText((spec.pivotIssues||[]).join(' · ').slice(0,220))));
  const boundaryWarnings=document.createElement('p');boundaryWarnings.innerHTML='<b>Discarded boundary</b> ';boundaryWarnings.append(document.createTextNode(riderDisplayText((spec.invalidationIssues||[]).join(' · ').slice(0,220))));
  const fibWarnings=document.createElement('p');fibWarnings.innerHTML='<b>Discarded Fib</b> ';fibWarnings.append(document.createTextNode(riderDisplayText((spec.fibIssues||[]).join(' · ').slice(0,220))));
  const degree=document.createElement('p');degree.innerHTML='<b>Degrees</b> ';degree.append(document.createTextNode(['major','intermediate','minor'].map(key=>{const status=spec.degreeStatus?.[key];return `${key} ${status==='unresolved'?'provisional · subdivision not established':status||'developing · needs subdivision check'}`;}).join(' · ')));
  const structures=document.createElement('p');structures.innerHTML='<b>Price structure</b> ';
  const structureNotes=[...(spec.verifiedTrendlines||[]),...(spec.verifiedChannels||[])];
  structures.append(document.createTextNode(riderDisplayText(structureNotes.length?structureNotes.map(item=>`${item.label} · ${item.quality}${item.touches?` · ${item.touches} touches`:''}`).join(' | ').slice(0,220):'No source-supported trendline or channel supplied.')));
  const swingMap=document.createElement('p');swingMap.innerHTML='<b>Observed swings</b> ';
  swingMap.append(document.createTextNode(spec.swingMapCount?`${spec.swingMapCount} exact-bar candidates mapped (${['major','intermediate','minor'].map(key=>`${key} ${spec.swingMapCounts?.[key]||0}`).join(', ')}). M?, I?, and m? mark candidate pivots by degree; their positions show highs/lows. They are not Elliott wave labels.`:'No Elliott labels or observed swing map could be applied to this view.'));
  const structureWarnings=document.createElement('p');structureWarnings.innerHTML='<b>Structure audit</b> ';structureWarnings.append(document.createTextNode(riderDisplayText((spec.structureIssues||[]).join(' · ').slice(0,220))));
  panel.append(head,source,state,summary,degree,swingMap,structures,...(spec.structureIssues?.length?[structureWarnings]:[]),next,forecast,...(spec.forecastIssues?.length?[forecastWarnings]:[]),...(spec.pivotIssues?.length?[pivotWarnings]:[]),...(spec.invalidationIssues?.length?[boundaryWarnings]:[]),alternate,fib,...(spec.fibIssues?.length?[fibWarnings]:[]));slot.host.append(panel);
  if(slot.card){panel.hidden=true;slot.head.querySelector('.reference-note-button').hidden=false;}
  else{panel.hidden=true;const toggle=$('#toggleShammySummary');toggle.hidden=false;toggle.textContent='✦ Show wave note';}
  let drag=null;head.addEventListener('pointerdown',event=>{if(event.target===close)return;const rect=panel.getBoundingClientRect(),hostRect=slot.host.getBoundingClientRect();drag={dx:event.clientX-rect.left,dy:event.clientY-rect.top,hostRect};head.setPointerCapture(event.pointerId);});
  head.addEventListener('pointermove',event=>{if(!drag)return;panel.style.left=`${Math.max(0,Math.min(drag.hostRect.width-panel.offsetWidth,event.clientX-drag.hostRect.left-drag.dx))}px`;panel.style.top=`${Math.max(0,Math.min(drag.hostRect.height-panel.offsetHeight,event.clientY-drag.hostRect.top-drag.dy))}px`;panel.style.right='auto';});
  head.addEventListener('pointerup',()=>{drag=null;});head.addEventListener('pointercancel',()=>{drag=null;});
}
function applyRiderPresentation(slot){
  if(slot?.source?.timeframe!=='15m'||!slot.chart)return false;
  slot.host.classList.add('rider-reference-presentation');
  slot.chart.setTheme?.({background:'#ffffff',textColor:'#151515',gridColor:'#e8e8e8',borderColor:'#333333',fontFamily:'Arial, sans-serif'});
  const renderer=slot.chart.renderer?.applyConfig?slot.chart.renderer:slot.chart.applyConfig?slot.chart:null;
  renderer?.applyConfig?.({layout:{background:'#ffffff',textColor:'#151515',fontFamily:'Arial, sans-serif'},
    grid:{vertLines:{visible:true,color:'#ededed'},horzLines:{visible:true,color:'#e5e5e5'}},
    priceScale:{borderColor:'#333333',labelsVisible:true,currentPriceLine:true},timeScale:{timezone:'UTC'},
    series:{style:'line',spacing:1},line:{color:'#111111',width:1.8}});
  return true;
}
$('#toggleShammySummary').addEventListener('click',()=>{const panel=slots[activeIndex]?.host.querySelector('.shammy-chart-summary');if(!panel)return;panel.hidden=!panel.hidden;$('#toggleShammySummary').textContent=panel.hidden?'✦ Show wave note':'✦ Hide wave note';});
function elliottMarkupKey(spec){return JSON.stringify(spec?.schema==='cleo.elliott-markup.v2'
  ?{source:spec.source,frames:spec.frames?.map(frame=>({workspace:frame.workspace,source:frame.source,pivots:frame.primary?.pivots,fibonacci:frame.fibonacci,forecasts:frame.forecasts,trendlines:frame.trendlines,channels:frame.channels}))}
  :{source:spec?.source,primary:spec?.primary?.pivots,fibonacci:spec?.fibonacci,trendlines:spec?.trendlines,channels:spec?.channels});}
function clearVisibleShammyMarks(){
  for(const target of [...slots,...referenceCharts]){
    if(!target?.shammyDrawingIds?.length)continue;
    for(const id of target.shammyDrawingIds)try{target.chart?.drawings?.remove(id);}catch{}
    target.shammyDrawingIds=[];target.shammyMarkupSignature='';target.forecastHorizon=0;
    target.host?.querySelector('.shammy-chart-summary')?.remove();
    if(target.card){target.head?.querySelector('.reference-marks-button')?.setAttribute('hidden','');target.head?.querySelector('.reference-note-button')?.setAttribute('hidden','');}
    else if(target===slots[activeIndex]){updateShammyMarksButton();$('#toggleShammySummary').hidden=true;}
  }
}
function resolveRiderCandidateRefs(spec){
  if(!Array.isArray(spec?.frames))return spec;
  for(const frame of spec.frames){
    const target=frame.workspace==='trader'?slots[0]:referenceCharts.find(item=>item.timeframe===frame.source?.timeframe);
    const sourceBars=target?.bars?.length?completedBars(target.bars,target.source?.timeframe,target.source?.snapshotAsOf):[];
    const sourceBarsByTime=new Map(sourceBars.map(bar=>[Number(bar.time),bar]));
    const catalog=sourceBars.length?referenceSwingCandidates(sourceBars):null;
    if(!catalog)continue;
    frame.candidateRefIssues=[];
    const resolve=point=>{
      if(!point?.candidateRef)return point;
      const degree=String(point.candidateRef.degree||point.degree||'').toLowerCase(),index=Number(point.candidateRef.index),referenced=catalog[degree]?.[index];
      const requestedTime=normalizeChartTimestamp(point.time),requestedKind=point.kind;
      // The model's candidate index can drift when it counts a degree catalog
      // incorrectly. Accept it only when the model's timestamp and kind agree;
      // otherwise recover solely by the exact timestamp and wick kind across
      // this same frame's catalogs. Never fall back to model-supplied price.
      let candidate=referenced&&Number(referenced[0])===requestedTime&&(!requestedKind||referenced[2]===requestedKind)?referenced:null;
      if(!candidate&&Number.isFinite(requestedTime)){
        const exact=[...(catalog.major||[]),...(catalog.intermediate||[]),...(catalog.minor||[])]
          .filter(item=>Number(item[0])===requestedTime&&(!requestedKind||item[2]===requestedKind));
        candidate=exact[0];
      }
      if(!candidate){
        const bar=sourceBarsByTime.get(requestedTime),sourceWick=requestedKind==='high'?Number(bar?.high):requestedKind==='low'?Number(bar?.low):NaN;
        if(bar&&Number.isFinite(requestedTime)&&Number(point.price)===sourceWick){
          frame.candidateRefIssues.push(`${point.id||'anchor'}: exact ${requestedKind} wick is source-checked but outside the swing catalog; kept as an uncertain anchor`);
          return {...point,time:requestedTime,price:sourceWick,evidenceRefs:[requestedTime],confidence:'uncertain'};
        }
        frame.candidateRefIssues.push(`${point.id||'anchor'}: timestamp does not match an exact same-frame ${requestedKind||'wick'} candidate or wick`);point._candidateRefInvalid=true;return point;
      }
      const [time,price,kind]=candidate;
      return {...point,time:Number(time),price:Number(price),kind,evidenceRefs:[Number(time)]};
    };
    for(const entry of [frame.primary,...(frame.alternate?[frame.alternate]:[])])for(const pivot of entry?.pivots||[])Object.assign(pivot,resolve(pivot));
    if(frame.fibonacci){frame.fibonacci.high=resolve(frame.fibonacci.high);frame.fibonacci.low=resolve(frame.fibonacci.low);}
    for(const forecast of frame.forecasts||[]){if(forecast.basis){forecast.basis.from=resolve(forecast.basis.from);forecast.basis.to=resolve(forecast.basis.to);}}
    for(const line of frame.trendlines||[]){line.anchors=(line.anchors||[]).map(resolve);line.touches=(line.touches||[]).map(resolve);if(line.evidenceRefs)line.evidenceRefs=line.anchors.map(point=>point.time);}
    for(const channel of frame.channels||[])for(const rail of [channel.upper,channel.lower])if(rail){rail.anchors=(rail.anchors||[]).map(resolve);rail.touches=(rail.touches||[]).map(resolve);if(rail.evidenceRefs)rail.evidenceRefs=rail.anchors.map(point=>point.time);}
  }
  return spec;
}
function applyElliottPackage(spec,{keepWorkspace=false}={}){
  if(!Array.isArray(spec.frames)||spec.frames.length!==7)throw new Error('Rider package needs six reference views and one trader view.');
  const expected=[...referenceTimeframes.map(timeframe=>`reference:${timeframe}`),`trader:${slots[0]?.source?.timeframe}`];
  const actual=spec.frames.map(frame=>`${frame.workspace}:${frame.source?.timeframe}`);
  if(expected.some((item,index)=>item!==actual[index]))throw new Error('Rider views must follow Daily through 5m, then the matching trader chart.');
  const trader=slots[0];
  if(!trader?.source||spec.source?.provider!==trader.source.id||spec.source?.symbol!==trader.source.market||spec.source?.timeframe!==trader.source.timeframe||Number(spec.source?.cutoff)!==Number(trader.source.cutoff))
    {clearVisibleShammyMarks();throw new Error('The trader chart snapshot changed. Old Rider marks were cleared; reload the exact source and cutoff before restoring this package.');}
  const outcomes=[];
  for(const frame of spec.frames){
    const target=frame.workspace==='trader'?slots[0]:referenceCharts.find(item=>item.timeframe===frame.source.timeframe);
    if(!target?.chart||!target.source){outcomes.push({frame:`${frame.workspace} ${frame.source.timeframe}`,status:'not loaded',error:'Chart is not loaded for this frame.'});continue;}
    if(frame.source?.provider!==target.source.id||frame.source?.symbol!==target.source.market||frame.source?.timeframe!==target.source.timeframe||Number(frame.source?.cutoff)!==Number(target.source.cutoff)){
      for(const id of target.shammyDrawingIds||[])try{target.chart.drawings.remove(id);}catch{}
      target.shammyDrawingIds=[];target.shammyMarkupSignature='';target.forecastHorizon=0;
      target.host?.querySelector('.shammy-chart-summary')?.remove();
      if(target.card){target.head?.querySelector('.reference-marks-button')?.setAttribute('hidden','');target.head?.querySelector('.reference-note-button')?.setAttribute('hidden','');}
      outcomes.push({frame:`${frame.workspace} ${frame.source.timeframe}`,status:'stale snapshot',error:`Expected cutoff ${frame.source?.cutoff}; loaded cutoff ${target.source.cutoff}.`});
      continue;
    }
    resolveRiderCandidateRefs({frames:[frame]});
    try{
      const result=applyElliottMarkup({...frame,schema:'cleo.elliott-markup.v1',method:spec.method,chart:frame.workspace==='trader'?1:frame.chart,
        readout:frame.readout||spec.readout,packageFrame:true},{keepWorkspace:true});
      outcomes.push({frame:`${frame.workspace} ${frame.source.timeframe}`,status:result.complete?'coverage checked':'partial',result});
    }catch(error){
      for(const id of target.shammyDrawingIds||[])try{target.chart.drawings.remove(id);}catch{}
      target.shammyDrawingIds=[];target.shammyMarkupSignature='';target.forecastHorizon=0;
      target.host.querySelector('.shammy-chart-summary')?.remove();
      if(target.card){target.head.querySelector('.reference-marks-button').hidden=true;target.head.querySelector('.reference-note-button').hidden=true;}
      else{updateShammyMarksButton();$('#toggleShammySummary').hidden=true;}
      outcomes.push({frame:`${frame.workspace} ${frame.source.timeframe}`,status:'unavailable',error:error.message});
    }
  }
  if(slots[0]?.shammyDrawingIds?.length)slots[0].shammyMarkupSignature=elliottMarkupKey(spec);
  if(!keepWorkspace){showReferenceWorkspace(false);activateSlot(0);}
  const complete=outcomes.length===7&&outcomes.every(item=>item.status==='coverage checked');
  const applied=outcomes.filter(item=>item.result).length;
  const mapped=outcomes.filter(item=>item.result&&(item.result.verifiedPivotCount||item.result.swingMapCount)).length;
  const candidateCount=outcomes.reduce((total,item)=>total+(item.result?.swingMapCount||0),0);
  const labelCount=outcomes.reduce((total,item)=>total+(item.result?.verifiedPivotCount||0),0);
  return {complete,outcomes,message:`Rider package: ${mapped}/7 chart views visibly marked (${labelCount} source-anchored wave labels · ${candidateCount} unlabelled swing candidates) · ${complete?'three degrees, full span, Fib and forecasts checked on every view':`partial: ${applied}/7 views received mark review; inspect provisional degrees, forecasts, and source gaps`} · swing candidates are observations, not Elliott labels`.replace(/\bunresolved\b/gi,'not established')};
}
function applyElliottMarkup(spec,{keepWorkspace=false}={}){
  if(spec?.schema==='cleo.elliott-markup.v2')return applyElliottPackage(spec,{keepWorkspace});
  const chartIndex=Number(spec.chart),slot=spec.workspace==='reference'
    ?referenceCharts.find(item=>item.timeframe===spec.source?.timeframe)
    :Number.isInteger(chartIndex)&&chartIndex>=1?slots[chartIndex-1]:null;
  if(!slot?.chart||!slot.source||!slot.bars.length)throw new Error('That chart is no longer loaded.');
  const sourceSpec=spec.source||{};
  if(sourceSpec.provider!==slot.source.id||String(sourceSpec.symbol||'').toUpperCase()!==slot.source.market||sourceSpec.timeframe!==slot.source.timeframe||Number(sourceSpec.cutoff)!==Number(slot.source.cutoff))
    throw new Error('The chart source or cutoff changed. Reload the exact snapshot before restoring this Elliott read.');
  if(!slot.chart.drawings?.supported||typeof slot.chart.drawings.add!=='function')throw new Error('This chart cannot accept native marks right now.');
  const primary=spec.primary,alternate=spec.alternate||null,projections=spec.projections||[],invalidations=(spec.invalidations||[]).map(item=>({...item,time:item.time??item.sourceTime,label:item.label??item.rule}));
  if(!primary||!Array.isArray(primary.pivots)||primary.pivots.length<(spec.packageFrame?0:3)||primary.pivots.length>60)throw new Error('A primary count needs sourced pivots or a specific data limitation.');
  if(alternate&&(!Array.isArray(alternate.pivots)||alternate.pivots.length>24))throw new Error('The alternate count has too many pivots.');
  if(!Array.isArray(projections)||projections.length>2||!Array.isArray(invalidations)||invalidations.length>5)throw new Error('Keep the chart to two conditional paths and five invalidation references.');
  const barsByTime=new Map(completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf).map(bar=>[Number(bar.time),bar]));
  const minTime=Number(slot.bars[0].time),cutoff=Number(slot.source.cutoff),idsSeen=new Set(),drawings=[];
  const degreeStyle={major:{color:'#2468ff',size:'small',wrap:['((' , '))'],align:'right'},intermediate:{color:'#009b83',size:'tiny',wrap:['(',')'],align:'center'},minor:{color:'#d000ff',size:'tiny',wrap:['',''],align:'left'}};
  const bareWave=value=>String(value||'').trim().replace(/\?$/,'').replace(/^\(\((.*)\)\)$/,'$1').replace(/^\((.*)\)$/,'$1');
  const validateId=id=>{if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,50}$/.test(id)||idsSeen.has(id))throw new Error('Elliott markup contains an invalid or repeated mark id.');idsSeen.add(id);};
  const validatePoint=(point,evidenceRefs,id)=>{
    if(point?._candidateRefInvalid)throw new Error(`Elliott anchor ${id} has an invalid same-frame candidate reference.`);
    const time=normalizeChartTimestamp(point?.time),price=Number(point?.price),bar=barsByTime.get(time);
    const evidenceTimes=Array.isArray(evidenceRefs)?evidenceRefs.map(normalizeChartTimestamp):[];
    if(!Number.isFinite(time)||!evidenceTimes.includes(time)||!bar||time<minTime||time>cutoff)throw new Error(`Elliott anchor ${id} must cite an exact completed loaded bar.`);
    if(!Number.isFinite(price)||price<=0||price<Number(bar.low)||price>Number(bar.high))throw new Error(`Elliott anchor ${id} must fall inside its sourced bar.`);
    return {time,price};
  };
  const validateRuleBoundary=(point,evidenceRefs,id)=>{
    const time=normalizeChartTimestamp(point?.time),price=Number(point?.price),evidenceTimes=Array.isArray(evidenceRefs)?evidenceRefs.map(normalizeChartTimestamp):[];
    if(!Number.isFinite(time)||!evidenceTimes.includes(time)||!barsByTime.has(time)||time<minTime||time>cutoff)
      throw new Error(`Elliott rule boundary ${id} must cite an exact completed loaded bar.`);
    if(!Number.isFinite(price)||price<=0)throw new Error(`Elliott rule boundary ${id} needs a positive rule price.`);
    return {time,price};
  };
  const verifiedPivots=[],verifiedAlternatePivots=[],pivotIssues=[];
  for(const issue of spec.candidateRefIssues||[])pivotIssues.push(`candidate reference: ${issue}`);
  const swingMapCounts={major:0,intermediate:0,minor:0};
  let swingMapCount=0;
  const addLabel=(pivot,scenario='primary')=>{
    validateId(pivot.id);
    const point=validatePoint(pivot,pivot.evidenceRefs,pivot.id),degree=degreeStyle[pivot.degree];
    const wave=bareWave(pivot.wave);
    if(!degree||!['high','low'].includes(pivot.kind)||!['confirmed','uncertain'].includes(pivot.confidence)||!/^(?:[1-5]|[A-C]|I|II|III|IV|V|i|ii|iii|iv|v|[a-c])$/.test(wave))throw new Error(`Unsupported Elliott pivot ${pivot.id}.`);
    const uncertain=pivot.confidence==='uncertain',style=scenario==='alternate'?{color:'#b99ade',size:'tiny',wrap:['?(',')']}:degree;
    const label=`${style.wrap[0]}${wave}${style.wrap[1]}${uncertain?'?':''}`;
    drawings.push({type:'text',anchors:[point],style:{lineWidth:1},text:{value:label,color:style.color,size:style.size,hAlign:degree.align,vAlign:pivot.kind==='high'?'top':'bottom'}});
    (scenario==='primary'?verifiedPivots:verifiedAlternatePivots).push({...pivot,_verifiedPoint:point});
  };
  for(const pivot of primary.pivots){try{addLabel(pivot);}catch(error){pivotIssues.push(`${pivot?.id||'primary'}: ${error.message}`);}}
  for(const pivot of alternate?.pivots||[]){try{addLabel(pivot,'alternate');}catch(error){pivotIssues.push(`${pivot?.id||'alternate'}: ${error.message}`);}}
  const addCountPath=(pivots,scenario)=>{
    for(const degree of ['major','intermediate','minor']){
      const path=pivots.filter(pivot=>pivot.degree===degree&&pivot._verifiedPoint).sort((a,b)=>a._verifiedPoint.time-b._verifiedPoint.time);
      for(let index=1;index<path.length;index++)drawings.push({type:'trendline',anchors:[path[index-1]._verifiedPoint,path[index]._verifiedPoint],
        style:{lineColor:scenario==='primary'?'#171717':'#f32935',lineWidth:scenario==='primary'?1.25:1,lineStyle:scenario==='primary'?'solid':'dashed'}});
    }
  };
  addCountPath(verifiedPivots,'primary');addCountPath(verifiedAlternatePivots,'alternate');
  // An unresolved count should not leave the chart visually blank. Show exact
  // OHLC turning-point candidates as a separate, explicitly non-Elliott layer.
  // These are observations only; they never satisfy the wave-count audit.
  if(spec.packageFrame&&!verifiedPivots.length){
    const completed=completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf);
    const candidates=referenceSwingCandidates(completed);
    const limits={major:4,intermediate:6,minor:8};
    const colors={major:'#2468ff',intermediate:'#009b83',minor:'#d000ff'};
    const sizes={major:'small',intermediate:'tiny',minor:'tiny'};
    const seen=new Set();
    for(const degree of ['major','intermediate','minor']){
      const points=candidates[degree]||[],limit=limits[degree];
      const selected=points.length<=limit?points:Array.from({length:limit},(_,index)=>points[Math.round(index*(points.length-1)/(limit-1))]);
      for(const candidate of selected){
        const [time,price,kind]=candidate,key=`${time}:${price}:${kind}`;
        if(seen.has(key))continue;
        const bar=barsByTime.get(Number(time));
        if(!bar||(kind==='high'&&Number(price)!==Number(bar.high))||(kind==='low'&&Number(price)!==Number(bar.low)))continue;
        try{
          const point=validatePoint({time,price},[time],`${degree} observed swing`);
          drawings.push({type:'text',anchors:[point],style:{lineWidth:1},text:{value:`${degree==='major'?'M':degree==='intermediate'?'I':'m'}?`,color:colors[degree],size:sizes[degree],hAlign:kind==='high'?'right':'left',vAlign:kind==='high'?'top':'bottom'}});
          seen.add(key);swingMapCounts[degree]++;swingMapCount++;
        }catch{}
      }
    }
  }
  for(const projection of projections){
    validateId(projection.id);
    if(!['primary','alternate'].includes(projection.scenario)||!Array.isArray(projection.anchors)||projection.anchors.length!==2||typeof projection.condition!=='string'||!projection.condition.trim())throw new Error(`Unsupported Elliott projection ${projection.id}.`);
    const [a,b]=projection.anchors.map(point=>validatePoint(point,projection.evidenceRefs,projection.id));
    if(b.time<=a.time)throw new Error(`Order Elliott projection anchors from left to right (${projection.id}).`);
    const color=projection.scenario==='primary'?'#151515':'#f32935';
    drawings.push({type:'ray',anchors:[a,b],style:{lineColor:color,lineWidth:1,lineStyle:projection.scenario==='primary'?'dashed':'dotted'},text:{value:String(projection.condition).slice(0,42),color,size:'tiny',hAlign:'right',vAlign:'top'}});
  }
  const invalidationIssues=[];
  for(const item of invalidations){
    try{
      validateId(item.id);
      if(typeof item.label!=='string'||!item.label.trim())throw new Error(`Name the Elliott invalidation ${item.id}.`);
      const point=validateRuleBoundary(item,item.evidenceRefs,item.id);
      drawings.push({type:'hray',anchors:[point],style:{lineColor:'#d66c79',lineWidth:1,lineStyle:'dashed'},text:{value:item.label.slice(0,36),color:'#d66c79',size:'tiny',hAlign:'left',vAlign:'top'}});
    }catch(error){invalidationIssues.push(`${item?.id||'boundary'}: ${error.message}`);}
  }
  const structureIssues=[],verifiedTrendlines=[],verifiedChannels=[];
  if(!Array.isArray(spec.trendlines||[])||!Array.isArray(spec.channels||[])||(spec.trendlines||[]).length>6||(spec.channels||[]).length>2)
    throw new Error('Rider markup supports up to six source-anchored trendlines and two candidate channels per chart.');
  const verifyStructureLine=(line,id,expectedKind=null)=>{
    if(!line||!Array.isArray(line.anchors)||line.anchors.length!==2)throw new Error(`Structure ${id} needs two exact wick anchors.`);
    if(!Array.isArray(line.evidenceRefs))throw new Error(`Structure ${id} needs evidence references for both anchors.`);
    const anchors=line.anchors.map((point,index)=>{
      const kind=point?.kind;
      if(!['high','low'].includes(kind)||(expectedKind&&kind!==expectedKind))throw new Error(`Structure ${id} has an unsupported pivot kind.`);
      const verified=validatePoint(point,line.evidenceRefs,id),bar=barsByTime.get(verified.time);
      if(verified.price!==Number(bar[kind]))throw new Error(`Structure ${id} anchor must match the exact ${kind} wick.`);
      return {...verified,kind};
    });
    if(anchors[1].time<=anchors[0].time)throw new Error(`Structure ${id} anchors must run left to right.`);
    const slope=(anchors[1].price-anchors[0].price)/(anchors[1].time-anchors[0].time);
    const projected=time=>anchors[0].price+slope*(time-anchors[0].time);
    const rawTouches=Array.isArray(line.touches)?line.touches:[];
    const validTouchTimes=new Set();
    for(const touch of rawTouches){
      const kind=touch?.kind;
      if(!['high','low'].includes(kind)||(expectedKind&&kind!==expectedKind))continue;
      let point;
      try{point=validatePoint(touch,[touch.time],`${id} touch`);}catch{continue;}
      const bar=barsByTime.get(point.time);
      if(point.price!==Number(bar[kind])||point.time<anchors[0].time||point.time>anchors[1].time)continue;
      const tolerance=Math.max((Number(bar.high)-Number(bar.low))*.25,Math.abs(projected(point.time))*.00015);
      if(Math.abs(point.price-projected(point.time))<=tolerance)validTouchTimes.add(point.time);
    }
    for(const anchor of anchors)validTouchTimes.add(anchor.time);
    const askedSupported=String(line.status||'candidate').toLowerCase()==='supported';
    const quality=askedSupported&&validTouchTimes.size>=3?'supported':'candidate';
    if(askedSupported&&quality!=='supported')structureIssues.push(`${id} called supported but only ${validTouchTimes.size} exact, near-line wick touches were verified; shown as candidate.`);
    return {anchors,slope,projected,quality,touches:validTouchTimes.size};
  };
  for(const line of spec.trendlines||[]){
    try{
      validateId(line.id);
      if(typeof line.label!=='string'||!line.label.trim())throw new Error('Trendline needs a descriptive name.');
      const verified=verifyStructureLine(line,line.id);
      const color=line.scenario==='alternate'?'#f32935':'#ef2525';
      drawings.push({type:'trendline',anchors:verified.anchors,style:{lineColor:color,lineWidth:1.2,lineStyle:line.scenario==='alternate'?'dotted':'dashed'},text:{value:`${verified.quality==='supported'?'Supported':'Candidate'} ${line.label.slice(0,34)} · ${verified.touches} touches`,color,size:'tiny',hAlign:'right',vAlign:'top'}});
      verifiedTrendlines.push({label:line.label,quality:verified.quality,touches:verified.touches});
    }catch(error){structureIssues.push(`${line?.id||'trendline'}: ${error.message}`);}
  }
  for(const channel of spec.channels||[]){
    try{
      validateId(channel.id);
      if(typeof channel.label!=='string'||!channel.label.trim())throw new Error('Channel needs a descriptive name.');
      const upper=verifyStructureLine(channel.upper,`${channel.id}_upper`,'high');
      const lower=verifyStructureLine(channel.lower,`${channel.id}_lower`,'low');
      const overlapStart=Math.max(upper.anchors[0].time,lower.anchors[0].time),overlapEnd=Math.min(upper.anchors[1].time,lower.anchors[1].time);
      if(overlapEnd<=overlapStart)throw new Error('The two channel rails need an overlapping sourced interval.');
      const scale=Math.max(Math.abs(upper.slope),Math.abs(lower.slope));
      if(Math.abs(upper.slope-lower.slope)>scale*.25)throw new Error('Upper and lower channel rails do not support a parallel fit.');
      if([overlapStart,overlapEnd].some(time=>upper.projected(time)<=lower.projected(time)))throw new Error('Upper and lower channel rails cross or invert.');
      const requested=String(channel.status||'candidate').toLowerCase()==='supported';
      const quality=requested&&upper.quality==='supported'&&lower.quality==='supported'?'supported':'candidate';
      if(requested&&quality!=='supported')structureIssues.push(`${channel.id} lacks three verified touches on both rails; shown as a candidate channel.`);
      const color=channel.scenario==='alternate'?'#f32935':'#ef2525',style=channel.scenario==='alternate'?'dotted':'dashed';
      for(const [rail,label] of [[upper,'upper'],[lower,'lower']])drawings.push({type:'trendline',anchors:rail.anchors,style:{lineColor:color,lineWidth:1.2,lineStyle:style},text:{value:`${quality} ${channel.label.slice(0,25)} · ${label}`,color,size:'tiny',hAlign:'right',vAlign:label==='upper'?'top':'bottom'}});
      verifiedChannels.push({label:channel.label,quality,touches:`${upper.touches}/${lower.touches}`});
    }catch(error){structureIssues.push(`${channel?.id||'channel'}: ${error.message}`);}
  }
  if(spec.packageFrame&&!verifiedTrendlines.length&&!verifiedChannels.length){
    const observed=recentCandidatePriceStructures(completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf));
    for(const line of observed.trendlines){
      try{
        validateId(line.id);const verified=verifyStructureLine(line,line.id);
        drawings.push({type:'trendline',anchors:verified.anchors,style:{lineColor:'#ef2525',lineWidth:1.2,lineStyle:'dashed'},text:{value:`Candidate observed ${line.role} · 2 anchors`,color:'#ef2525',size:'tiny',hAlign:'right',vAlign:'top'}});
        verifiedTrendlines.push({label:line.label,quality:'candidate',touches:verified.touches});
      }catch(error){structureIssues.push(`Observed candidate trendline: ${error.message}`);}
    }
    for(const channel of observed.channels){
      try{
        const upper=verifyStructureLine(channel.upper,`${channel.id}_upper`,'high'),lower=verifyStructureLine(channel.lower,`${channel.id}_lower`,'low');
        const start=Math.max(upper.anchors[0].time,lower.anchors[0].time),end=Math.min(upper.anchors[1].time,lower.anchors[1].time);
        const scale=Math.max(Math.abs(upper.slope),Math.abs(lower.slope));
        if(end<=start||Math.abs(upper.slope-lower.slope)>scale*.25||[start,end].some(time=>upper.projected(time)<=lower.projected(time)))throw new Error('Observed pivots do not form a defensible parallel channel.');
        const color='#ef2525';
        for(const [rail,label] of [[upper,'upper'],[lower,'lower']])drawings.push({type:'trendline',anchors:rail.anchors,style:{lineColor:color,lineWidth:1.2,lineStyle:'dashed'},text:{value:`Candidate observed price channel · ${label}`,color,size:'tiny',hAlign:'right',vAlign:label==='upper'?'top':'bottom'}});
        verifiedChannels.push({label:channel.label,quality:'candidate',touches:`${upper.touches}/${lower.touches}`});
      }catch(error){structureIssues.push(`Observed candidate channel: ${error.message}`);}
    }
  }
  let verifiedFib=null;
  const fibIssues=[];
  if(spec.fibonacci){
    try{
    const fib=spec.fibonacci;
    const high=validatePoint(fib.high,fib.high?.evidenceRefs,'Fib swing high');
    const low=validatePoint(fib.low,fib.low?.evidenceRefs,'Fib swing low');
    if(high.price!==Number(barsByTime.get(high.time).high)||low.price!==Number(barsByTime.get(low.time).low)||high.price<=low.price||high.time===low.time)
      throw new Error('Fibonacci anchors must be exact, distinct completed-bar wick extremes.');
    const direction=String(fib.direction||'');
    if(direction!=='advance'&&direction!=='decline'||direction==='advance'&&low.time>=high.time||direction==='decline'&&high.time>=low.time)
      throw new Error('Fibonacci swing direction does not match the ordered source pivots.');
    const span=high.price-low.price,originTime=Math.max(high.time,low.time);
    const ratios=[{ratio:0.382,color:'#63d397'},{ratio:0.5,color:'#e8cb5b'},{ratio:0.618,color:'#ee797b'}];
    const levels=ratios.map(({ratio,color})=>({ratio,color,price:direction==='advance'?high.price-ratio*span:low.price+ratio*span}));
    for(const [kind,point] of [['high',high],['low',low]])drawings.push({type:'text',anchors:[point],style:{lineWidth:1},text:{value:`◎ Fib swing ${kind} ${fmt(point.price)}`,color:'#70aaff',size:'small',hAlign:'left',vAlign:kind==='high'?'top':'bottom'}});
    for(const level of levels)drawings.push({type:'hray',anchors:[{time:originTime,price:level.price}],style:{lineColor:level.color,lineWidth:3,lineStyle:'solid'},text:{value:`Fib ${Math.round(level.ratio*1000)/10}% ${fmt(level.price)}`,color:level.color,size:'tiny',hAlign:'right',vAlign:'top'}});
    verifiedFib={high,low,direction,levels};
    }catch(error){fibIssues.push(error.message);}
  }
  if(!verifiedFib&&spec.packageFrame){
    const swing=recentObservedSwing(completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf));
    if(swing){
      try{
        const high=validatePoint(swing.high,[swing.high.time],'observed swing high'),low=validatePoint(swing.low,[swing.low.time],'observed swing low');
        const highBar=barsByTime.get(high.time),lowBar=barsByTime.get(low.time);
        if(high.price!==Number(highBar.high)||low.price!==Number(lowBar.low)||high.price<=low.price||high.time===low.time)throw new Error('No distinct exact-wick observed swing is available.');
        const direction=swing.direction,span=high.price-low.price,originTime=Math.max(high.time,low.time);
        const ratios=[{ratio:0.382,color:'#63d397'},{ratio:0.5,color:'#e8cb5b'},{ratio:0.618,color:'#ee797b'}];
        const levels=ratios.map(({ratio,color})=>({ratio,color,price:direction==='advance'?high.price-ratio*span:low.price+ratio*span}));
        for(const [kind,point] of [['high',high],['low',low]])drawings.push({type:'text',anchors:[point],style:{lineWidth:1},text:{value:`◎ Observed swing ${kind} ${fmt(point.price)}`,color:'#70aaff',size:'small',hAlign:'left',vAlign:kind==='high'?'top':'bottom'}});
        for(const level of levels)drawings.push({type:'hray',anchors:[{time:originTime,price:level.price}],style:{lineColor:level.color,lineWidth:3,lineStyle:'solid'},text:{value:`Swing Fib ${Math.round(level.ratio*1000)/10}% ${fmt(level.price)}`,color:level.color,size:'tiny',hAlign:'right',vAlign:'top'}});
        verifiedFib={high,low,direction,levels,basis:`observed ${swing.degree} price swing · separate from Elliott count`};
      }catch(error){structureIssues.push(`Observed swing Fib: ${error.message}`);}
    }
  }
  const timeframeMs={'1d':86400000,'4h':14400000,'1h':3600000,'30m':1800000,'15m':900000,'5m':300000}[slot.source.timeframe];
  const lastCompleted=completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf).at(-1);
  let forecastHorizon=0;
  const verifiedForecasts=[],forecastIssues=[];
  if(spec.forecasts!=null){
    if(!Array.isArray(spec.forecasts)||spec.forecasts.length>2)throw new Error('Use at most two conditional forecast branches.');
    for(const forecast of spec.forecasts){
      const pathDrawings=[];
      try{
      if(!['primary','alternate'].includes(forecast.scenario)||typeof forecast.condition!=='string'||!forecast.condition.trim()||
        !Array.isArray(forecast.legs)||forecast.legs.length<1||forecast.legs.length>5||!timeframeMs||!lastCompleted)
        throw new Error('A Rider forecast needs a condition, completed as-of bar, and one to five future legs.');
      const from=validatePoint(forecast.basis?.from,forecast.basis?.from?.evidenceRefs,'forecast basis from');
      const to=validatePoint(forecast.basis?.to,forecast.basis?.to?.evidenceRefs,'forecast basis to');
      if(to.time<=from.time||to.price===from.price)throw new Error('Forecast basis must be two chronological, distinct sourced pivots.');
      const span=to.price-from.price,color=forecast.scenario==='primary'?'#77aaff':'#ad8adb';
      let previous={time:lastCompleted.time,price:lastCompleted.close},ahead=0;
      const legs=[];
      for(const leg of forecast.legs){
        const barsAhead=Number(leg.barsAhead),ratio=Number(leg.ratio),degree=degreeStyle[leg.degree],wave=bareWave(leg.wave);
        if(!Number.isInteger(barsAhead)||barsAhead<=ahead||barsAhead>120||!Number.isFinite(ratio)||Math.abs(ratio)>3||
          !degree||!/^(?:[1-5]|[A-C]|I|II|III|IV|V|i|ii|iii|iv|v|[a-c])$/.test(wave))
          throw new Error('A forecast leg needs a supported degree, wave, increasing bar horizon, and bounded ratio.');
        const point={time:lastCompleted.time+barsAhead*timeframeMs,price:lastCompleted.close+span*ratio};
        if(point.price<=0)throw new Error('A forecast calculation produced a nonpositive price.');
        if(/^(?:3|iii|III)$/.test(wave)){
          const firstWave=verifiedPivots.find(pivot=>pivot.degree===leg.degree&&/^(?:1|i|I)$/.test(bareWave(pivot.wave)));
          if(firstWave&&(span>0?point.price<=Number(firstWave.price):point.price>=Number(firstWave.price)))
            throw new Error('A projected third wave must extend beyond its sourced first-wave extreme.');
        }
        pathDrawings.push({type:'trendline',anchors:[previous,point],style:{lineColor:color,lineWidth:1.5,lineStyle:forecast.scenario==='primary'?'dashed':'dotted'}});
        pathDrawings.push({type:'text',anchors:[point],style:{lineWidth:1},text:{value:`${degree.wrap[0]}${wave}${degree.wrap[1]}?`,color:degree.color,size:degree.size,hAlign:'left',vAlign:'top'}});
        legs.push({time:point.time,price:point.price,wave,degree:leg.degree});
        previous=point;ahead=barsAhead;
      }
      forecastHorizon=Math.max(forecastHorizon,ahead);
      drawings.push(...pathDrawings);
      verifiedForecasts.push({scenario:forecast.scenario,condition:forecast.condition,from,to,legs});
      }catch(error){forecastIssues.push(`${String(forecast?.scenario||'branch')}: ${error.message}`);}
    }
  }
  if(drawings.length<(spec.packageFrame?0:3)||drawings.length>100)throw new Error('Elliott markup has too many or too few source-grounded marks.');
  const nextIds=[];
  try{
    for(const item of drawings){
      const drawing=slot.chart.drawings.add(item.type,{paneId:'price',anchors:item.anchors,style:item.style,text:item.text});
      if(!drawing?.id)throw new Error('Vela did not return a drawing id.');
      nextIds.push(drawing.id);
    }
  }catch(error){for(const id of nextIds)slot.chart.drawings.remove(id);throw error;}
  if(/rider/i.test(String(spec.method||''))){
    for(const id of slot.shammyDrawingIds||[])slot.chart.drawings.remove(id);
    slot.shammyDrawingIds=nextIds;slot.shammyMarkupSignature=elliottMarkupKey(spec);slot.shammyMarksVisible=true;slot.forecastHorizon=forecastHorizon;
    applyRiderPresentation(slot);
    if(slot.card){const button=slot.head.querySelector('.reference-marks-button');button.hidden=!nextIds.length;button.textContent='Count';fitReferenceHistory(slot);}
    else{updateShammyMarksButton();if(forecastHorizon){const range=slot.chart.getVisibleRange();if(range)slot.chart.setVisibleRange({from:range.from,to:Math.max(range.to,lastCompleted.time+(forecastHorizon+2)*timeframeMs)});}}
    showShammySummary(slot,{...spec,verifiedFib,verifiedForecasts,forecastIssues,pivotIssues,invalidationIssues,fibIssues,verifiedTrendlines,verifiedChannels,structureIssues,swingMapCount,swingMapCounts});
  }else{clearCleoMarks(slot);slot.cleoDrawingIds=nextIds;slot.cleoMarksVisible=true;slot.cleoReadout=spec.readout||null;saveCleoMarks(slot);updateCleoMarksButton();}
  if(!keepWorkspace){showReferenceWorkspace(false);activateSlot(0);}
  const first=Number(slot.bars[0].time),last=Number(slot.bars.at(-1).time),span=last-first;
  const portions=new Set(verifiedPivots.map(pivot=>Math.min(2,Math.floor(3*(Number(pivot.time)-first)/Math.max(1,span)))));
  const degrees=new Set(verifiedPivots.map(pivot=>pivot.degree));
  const omissions=[];
  if(pivotIssues.length)omissions.push(`rejected pivot: ${pivotIssues.join(' | ')}`);
  if(invalidationIssues.length)omissions.push(`rejected boundary: ${invalidationIssues.join(' | ')}`);
  if(![0,1,2].every(portion=>portions.has(portion)))omissions.push('older/middle/recent history not all labeled');
  if(degrees.size<3)omissions.push('three degrees not established');
  if(!verifiedFib)omissions.push('Fib guides unavailable');
  if(fibIssues.length)omissions.push(`rejected Fib: ${fibIssues.join(' | ')}`);
  if(!verifiedForecasts.length)omissions.push('conditional future path unavailable');
  if(forecastIssues.length)omissions.push(`rejected future branch: ${forecastIssues.join(' | ')}`);
  if(structureIssues.length)omissions.push(`price structure needs review: ${structureIssues.join(' | ')}`);
  if(spec.packageFrame&&['major','intermediate','minor'].some(degree=>spec.degreeStatus?.[degree]!=='supported'))omissions.push(`degree status: ${['major','intermediate','minor'].filter(degree=>spec.degreeStatus?.[degree]!=='supported').map(degree=>`${degree} ${spec.degreeStatus?.[degree]||'unresolved'}`).join(', ')}`);
  const complete=!omissions.length;
  return {complete,omissions,verifiedPivotCount:verifiedPivots.length,swingMapCount,swingMapCounts,message:`${verifiedPivots.length} source-anchored wave labels and ${swingMapCount} observed swing markers on ${slot.card?`${slot.timeframe.toUpperCase()} reference`:'trader'} chart · ${complete?'span, degree, Fib and forecast checks passed':`partial Rider markup: ${omissions.join('; ')}`} · swing markers are not wave labels; anchors checked against loaded bars`};
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
  const drawingContext=readMarketDrawingContext;
  if(!drawingContext||drawingContext.source.provider!==slot.source.id||drawingContext.source.symbol!==slot.source.market||drawingContext.source.timeframe!==slot.source.timeframe||Number(drawingContext.source.cutoff)!==Number(slot.source.cutoff))throw new Error('The collected multi-timeframe bars no longer match this chart and cutoff. Run Read the market again.');
  const chartBars=completedBars(slot.bars,slot.source.timeframe,drawingContext.source.snapshotAsOf),barByTime=new Map(chartBars.map(bar=>[Number(bar.time),bar]));
  const colors={sentiment_bias:'#74d3bd',liquidity:'#e9a164',elliott_fib:'#ae92e8',volume_divergence:'#6eafe1'},nextLayers=emptyReadMarketLayerIds(),nextIds=[];
  const activeTimeframe=slot.source.timeframe,activeHistory=drawingContext.histories[activeTimeframe];
  const add=(section,type,anchors,style,text)=>{
    const drawing=slot.chart.drawings.add(type,{paneId:'price',anchors,style,text});
    if(!drawing?.id)throw new Error(`Chart renderer could not place the ${section} mark.`);
    nextIds.push(drawing.id);nextLayers[section].push(drawing.id);return drawing;
  };
  try{
    const seen=new Set();
    for(const section of readMarketSections){
      const candidates=Array.isArray(payload.sections?.[section]?.marks)?payload.sections[section].marks:[];
      if(candidates.length>5)throw new Error(`${section.replaceAll('_',' ')} returned more than five sourced chart marks.`);
      for(const mark of candidates){
        if(!mark||typeof mark.id!=='string'||seen.has(mark.id))throw new Error('Cleo returned a missing or repeated market-read mark id.');seen.add(mark.id);
        if(mark.timeframe!==slot.source.timeframe)throw new Error(`Mark ${mark.id} uses ${mark.timeframe||'an unknown timeframe'}, while the active chart is ${slot.source.timeframe}.`);
        if(!['level','trend','trendline','ray','zone','text'].includes(mark.geometry)||!Array.isArray(mark.anchors))throw new Error(`Mark ${mark.id} has unsupported geometry.`);
        if(typeof mark.evidence!=='string'||!mark.evidence.trim())throw new Error(`Mark ${mark.id} has no evidence description.`);
        const anchors=mark.anchors.map(point=>({time:normalizeChartTimestamp(point?.time),price:Number(point?.price)})),expected=['level','text'].includes(mark.geometry)?1:2;
        if(anchors.length!==expected)throw new Error(`Mark ${mark.id} needs ${expected} evidence-backed anchor${expected===1?'':'s'}.`);
        for(const point of anchors){const bar=barByTime.get(point.time);if(!bar||!Number.isFinite(point.price)||point.price<bar.low||point.price>bar.high)throw new Error(`Mark ${mark.id} is not anchored to a matching loaded bar and price.`);}
        const label=String(mark.label||mark.id).replace(/[\r\n]/g,' ').trim().slice(0,42),geometry=mark.geometry==='trend'?'trendline':mark.geometry,type=geometry==='level'?'hray':geometry==='zone'?'box':geometry;
        const text=label?{value:label,color:colors[section],size:geometry==='text'?'small':'tiny',hAlign:geometry==='text'?'left':'right',vAlign:mark.position==='below'?'bottom':'top'}:undefined;
        add(section,type,anchors,{lineColor:colors[section],lineWidth:geometry==='level'?1.25:1.5,lineStyle:geometry==='level'?'dotted':section==='elliott_fib'?'dashed':'solid',...(geometry==='zone'?{fillColor:`${colors[section]}20`}:{})},text);
      }
    }
    const timeframeResults=[];
    for(const timeframe of ['4h','1h','30m','15m']){
      const bars=drawingContext.histories[timeframe];if(!bars||bars.length<24)continue;
      const result=buildLiquidGravity(bars.map(bar=>({...bar,time:bar.time/1000})),timeframe,{asOf:drawingContext.source.snapshotAsOf/1000});
      timeframeResults.push(result);
    }
    if(activeHistory?.length>=24){
      const activeResult=buildLiquidGravity(activeHistory.map(bar=>({...bar,time:bar.time/1000})),slot.source.timeframe,{asOf:drawingContext.source.snapshotAsOf/1000});
      const normalizedChart=chartBars.map(bar=>({...bar,time:bar.time/1000}));
      renderLiquidGravity(activeResult,normalizedChart,slot.source.timeframe,(type,config)=>{
        const drawing=slot.chart.drawings.add(type,config);if(!drawing?.id)throw new Error('The chart could not draw a Liquid Gravity path or level.');nextIds.push(drawing.id);nextLayers.liquidity.push(drawing.id);return drawing;
      });
    }
    const mapped=timeframeResults.flatMap(result=>[...result.upper,...result.lower].map(pool=>({result,pool})));
    for(const {result,pool} of mapped){
      if(result.timeframe.toLowerCase()===activeTimeframe)continue;
      const peers=mapped.filter(other=>other.pool.side===pool.side&&other.result.timeframe!==result.timeframe&&Math.abs(other.pool.price-pool.price)<=Math.max(other.result.atr,result.atr)*.15);
      const confluence=[...new Set([result.timeframe,...peers.map(item=>item.result.timeframe)])].join('+');
      const label=`${result.timeframe} ${pool.rankName} ${pool.side==='upper'?'↑':'↓'} · G${Math.round(pool.gravity)} · ${pool.state}${peers.length?` · ${confluence}`:''}`;
      const anchorTime=Number(slot.bars.at(-1).time),color=pool.side==='upper'?'#00E5A8':'#FF4664',lineStyle=pool.rank===1?'dashed':pool.rank===2?'dotted':'solid';
      add('liquidity','hray',[{time:anchorTime,price:pool.price}],{lineColor:color,lineWidth:pool.rank===1?1.5:1,lineStyle},{value:label,color,size:'tiny',hAlign:'right',vAlign:pool.side==='upper'?'top':'bottom'});
    }
  }catch(error){for(const id of nextIds)slot.chart.drawings.remove(id);throw error;}
  clearCleoMarks(slot);slot.cleoDrawingIds=nextIds;slot.readMarketLayerIds=nextLayers;slot.readMarketLayerVisibility=defaultReadMarketLayerVisibility();slot.cleoMarksVisible=true;slot.cleoReadout={sections:payload.sections,finalRecommendation:payload.finalRecommendation||''};
  saveCleoMarks(slot);updateCleoMarksButton();
  const generated=nextLayers.liquidity.length,manual=nextIds.length-generated;
  return {message:`${nextIds.length} source-checked drawings placed · ${generated} Liquidity/Gravity marks from completed 4h/1h/30m/15m pools${activeHistory?.length>=24?` plus ${activeTimeframe} paths`:''} · ${manual} Cleo evidence marks · four layers can be toggled separately`};
}
const readMarketTimeframes=['1d','4h','2h','1h','30m','15m','5m','3m','2m','1m'];
let readMarketDrawingContext=null;
async function collectReadMarket(onProgress=()=>{}){
  const active=slots[activeIndex];
  if(!active?.source||!active.bars.length)throw new Error('Load a chart before requesting a market read.');
  const initialSource=active.source;
  const cutoff=Number(active.source.cutoff);
  if(!Number.isFinite(cutoff))throw new Error('The active chart cutoff is unavailable.');
  let completed=0;
  const histories={};
  const longHistoryTimeframes=new Set(['4h','1h','30m','15m',active.source.timeframe]);
  const frames=await Promise.all(readMarketTimeframes.map(async timeframe=>{
    try{
      const params={id:active.source.id,market:active.source.market,timeframe};
      const raw=await fetchBars(params,longHistoryTimeframes.has(timeframe)?3000:500);
      const eligible=completedBars(raw.filter(isBar).filter(bar=>Number(bar.time)<=cutoff),timeframe,active.source.snapshotAsOf).sort((a,b)=>a.time-b.time);
      histories[timeframe]=eligible;
      const contextBars=eligible.slice(-300);
      return {timeframe,status:contextBars.length?'available':'unavailable',bars:contextBars.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume})),error:contextBars.length?'':'No completed stored bars at or before the active chart cutoff.'};
    }catch(error){return {timeframe,status:'unavailable',bars:[],error:error.message};}
    finally{completed++;onProgress(completed,readMarketTimeframes.length);}
  }));
  if(slots[activeIndex]!==active||active.source!==initialSource||Number(active.source.cutoff)!==cutoff)throw new Error('The active chart changed while snapshots were collected. Start again.');
  readMarketDrawingContext={source:{provider:active.source.id,symbol:active.source.market,timeframe:active.source.timeframe,cutoff,snapshotAsOf:active.source.snapshotAsOf},histories};
  return {schema:'cleo.market-read-context.v1',source:{provider:active.source.id,label:active.source.label,symbol:active.source.market,timeframe:active.source.timeframe,cutoff},requestedTimeframes:readMarketTimeframes,capturedAt:new Date().toISOString(),frames};
}
const shammyArchiveKey='count-desk-shammy-elliott-analyses-v1';
function readShammyArchive(){try{const value=JSON.parse(localStorage.getItem(shammyArchiveKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function renderShammyArchive(){
  const records=readShammyArchive(),list=$('#shammyArchiveList');list.replaceChildren();
  $('#shammyArchiveCount').textContent=String(records.length);
  if(!records.length){const empty=document.createElement('p');empty.className='shammy-archive-empty';empty.textContent='No completed Shammy analyses yet. The first finished read will appear here.';list.append(empty);return;}
  for(const record of records){
    const item=document.createElement('article');item.className='shammy-archive-item';
    const head=document.createElement('div');head.className='shammy-archive-item-head';
    const title=document.createElement('strong');title.textContent=(record.headline&&record.headline!=='Status'?record.headline:`${record.text?.match(/(?:^|\n)#{1,3}\s*Status\s*\n\s*\**\b(UNRESOLVED|PROVISIONAL|SUPPORTED)\b/i)?.[1]||'Saved'} Elliott Wave read · ${record.source?.symbol||'Chart'} ${record.source?.timeframe||''}`).replace(/\bunresolved\b/gi,'not established');
    const stamp=document.createElement('small');stamp.textContent=new Date(record.savedAt).toLocaleString();head.append(title,stamp);
    const source=document.createElement('p');source.textContent=[record.source?.provider,record.source?.symbol,record.source?.timeframe,record.source?.cutoff&&`cutoff ${new Date(record.source.cutoff).toISOString()}`].filter(Boolean).join(' · ');
    const badges=document.createElement('small');
    const daily=record.referenceFrames?.find(frame=>frame.timeframe==='1d');
    badges.textContent=`${record.referenceFrames?.length||0}/6 reference frames${daily?.loadedBars?` · Daily ${fmt(daily.loadedBars,0)} loaded bars`:''}${record.outputPair?.length===2?` · output ${record.outputPair.map(frame=>frame.timeframe.toUpperCase()).join(' + ')}`:''} · ${record.markup?record.marked?record.markupQuality==='partial'?'partial marks applied':'marks applied':'markup returned; marks unavailable':'no source-validated marks'}`;
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Read analysis';const body=document.createElement('div');body.className='shammy-archive-body';body.textContent=String(record.text||'').replace(/```(?:chart-markup|json)\s*\n[\s\S]*?```/i,'').trim().replace(/\bunresolved\b/gi,'not established');details.append(summary,body);
    item.append(head,source,badges,details);
    if(record.markOutcomes?.length){const audit=document.createElement('details');const label=document.createElement('summary');label.textContent='Chart-by-chart mark check';audit.append(label);
      for(const view of record.markOutcomes){const row=document.createElement('p');row.textContent=`${view.frame} · ${view.error||view.omissions?.join('; ')||view.status}`.replace(/\bunresolved\b/gi,'not established');audit.append(row);}item.append(audit);}
    if(record.markup){const restore=document.createElement('button');restore.type='button';restore.className='shammy-restore';restore.textContent=record.markup.schema==='cleo.elliott-markup.v2'?'Restore seven-view marks':'Show marks on trader chart';restore.addEventListener('click',()=>{try{const result=applyElliottMarkup(record.markup);record.marked=Boolean(result.outcomes?.some(view=>view.result)||result.message&&!result.outcomes);record.hidden=false;record.markupQuality=result.complete?'coverage-checked':'partial';record.markOutcomes=result.outcomes?.map(view=>({frame:view.frame,status:view.status,error:view.error||'',omissions:view.result?.omissions||[]}))||record.markOutcomes;localStorage.setItem(shammyArchiveKey,JSON.stringify(records));restore.textContent=result.message.replace(/\bunresolved\b/gi,'not established');renderShammyArchive();$('#shammyArchive').close();}catch(error){restore.textContent=`Cannot restore · ${error.message}`.replace(/\bunresolved\b/gi,'not established');}});item.append(restore);}
    list.append(item);
  }
}
async function recordShammyAnalysis({text,markup,markResult,chart,threadId,outputTarget,appendAnalysisOutputPair,openAnalysisOutputWorkspace}){
  const trader=chart?.traderChart;if(!trader||!text?.trim())return;
  const returnIndex=Math.min(analysisReturnSlotIndex,Math.max(0,slots.length-1));
  let outputPair=null,outputNote='Captured after analysis; any visible marks are the source-accepted drawings. The trader workspace returns to its saved primary layout.';
  try{outputPair=await captureAnalysisOutputPair(chart);}
  catch(error){outputNote=`Two-chart capture unavailable · ${error.message}`;}
  showReferenceWorkspace(false);activateSlot(returnIndex);
  const outputFrames=outputPair?.frames||readAnalysisOutputPair().map(timeframe=>{
    const sourceFrame=(chart?.charts||[]).find(frame=>frame.timeframe===timeframe)||{};
    return {timeframe,provider:sourceFrame.provider||trader.provider,symbol:sourceFrame.symbol||trader.symbol,
      cutoff:sourceFrame.cutoff&&Number.isFinite(Number(sourceFrame.cutoff))?new Date(Number(sourceFrame.cutoff)).toISOString():'',loadedCutoff:sourceFrame.loadedCutoff||null};
  });
  appendAnalysisOutputPair?.({...outputPair,frames:outputFrames,note:outputNote,onOpen:openAnalysisOutputWorkspace},outputTarget);
  if(!markup&&slots[0]?.shammyDrawingIds?.length){
    slots[0].shammyMarksVisible=false;
    for(const id of slots[0].shammyDrawingIds)slots[0].chart?.drawings?.setVisible?.(id,false);
    const prior=readShammyArchive();
    for(const record of prior)if(record.markup&&record.source?.provider===trader.provider&&record.source?.symbol===trader.symbol&&record.source?.timeframe===trader.timeframe&&Number(record.source?.cutoff)===Number(trader.cutoff))record.hidden=true;
    localStorage.setItem(shammyArchiveKey,JSON.stringify(prior));updateShammyMarksButton();
  }
  const records=readShammyArchive();
  const duplicate=records.find(item=>item.threadId===threadId&&item.text===text.slice(0,60000));
  if(duplicate){duplicate.outputPair=outputFrames;if(markResult?.result&&!duplicate.marked)duplicate.marked=true;localStorage.setItem(shammyArchiveKey,JSON.stringify(records));renderShammyArchive();return;}
  const priorRider=records.find(record=>record.markup&&/rider/i.test(String(record.markup.method||''))&&
    record.markup?.readout?.headline===slots[0]?.cleoReadout?.headline&&
    record.source?.provider===slots[0]?.source?.id&&record.source?.symbol===slots[0]?.source?.market&&
    record.source?.timeframe===slots[0]?.source?.timeframe&&Number(record.source?.cutoff)===Number(slots[0]?.source?.cutoff));
  if(priorRider)clearCleoMarks(slots[0]);
  records.unshift({id:globalThis.crypto?.randomUUID?.()||String(Date.now()),savedAt:new Date().toISOString(),threadId,
    source:{provider:trader.provider,symbol:trader.symbol,timeframe:trader.timeframe,cutoff:trader.cutoff,completedCutoff:trader.completedCutoff},
    referenceFrames:(chart.charts||[]).map(frame=>({timeframe:frame.timeframe,provider:frame.provider,symbol:frame.symbol,cutoff:frame.cutoff,completedBars:frame.historyBarCount||frame.contextBarCount,loadedBars:frame.barCount,historyFirst:frame.historyFirst,historyLast:frame.historyLast})),
    outputPair:outputFrames,
    headline:String(markup?.readout?.headline||`${text.match(/(?:^|\n)#{1,3}\s*Status\s*\n\s*\**\b(UNRESOLVED|PROVISIONAL|SUPPORTED)\b/i)?.[1]||'Saved'} Elliott Wave read · ${trader.symbol} ${trader.timeframe}`).slice(0,140),
    text:text.slice(0,60000),markup:markup||null,marked:Boolean(markResult?.result),hidden:false,markupQuality:markResult?.result?.complete?'coverage-checked':markResult?.result?'partial':'unavailable',markError:markResult?.error?.message||'',
    markOutcomes:markResult?.result?.outcomes?.map(view=>({frame:view.frame,status:view.status,error:view.error||'',omissions:view.result?.omissions||[]}))||[]});
  localStorage.setItem(shammyArchiveKey,JSON.stringify(records.slice(0,30)));
  renderShammyArchive();
  $('#quantAgentStatus').textContent=markup&&markResult?.result?`Shammy completed · ${markResult.result.complete?'coverage checked':'partial markup'} · saved to archive`:markup?'Shammy completed · markup needs review · saved to archive':'Shammy completed · no sourced count marks were applied · saved to archive';
}
renderShammyArchive();
$('#openShammyArchive').addEventListener('click',()=>{renderShammyArchive();$('#shammyArchive').showModal();});
$('#closeShammyArchive').addEventListener('click',()=>$('#shammyArchive').close());
$('#shammyArchive').addEventListener('click',event=>{if(event.target===$('#shammyArchive'))$('#shammyArchive').close();});
const codexWidget=createCodexWidget($('#quantCodexHost'),{surface:'quant-lab',conversationKey:cryptoDeskEnabled?'countdesk.crypto-day.chat.v1':quantGameEnabled?'countdesk.range-trader.chat.v1':null,analystName:cryptoDeskEnabled?'Rider':null,applyChartMarkup:cryptoDeskEnabled?null:applyCleoMarkup,applyElliottMarkup:cryptoDeskEnabled?null:applyElliottMarkup,
isElliottMarkupVisible:spec=>{const slot=slots[0];return slot?.shammyDrawingIds?.length&&slot.shammyMarkupSignature===elliottMarkupKey(spec)?slot.shammyMarksVisible===false?'hidden':'visible':false;},
applyMarketReadMarkup:cryptoDeskEnabled?null:applyMarketReadMarkup,collectReadMarket:quantGameEnabled||cryptoDeskEnabled?null:collectReadMarket,onChartAnalysisComplete:cryptoDeskEnabled?null:recordShammyAnalysis,openAnalysisOutputWorkspace:cryptoDeskEnabled?null:openAnalysisOutputWorkspace,
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
    const contextBars=quantGameEnabled?completedBars(slot.bars,'1m',slot.source.snapshotAsOf):slot.bars;
    const scopedVisible=quantGameEnabled?contextBars.filter(bar=>!rangeIsValid||bar.time>=from-(to-from)*0.15&&bar.time<=to):rangeBars;
    const analysisBars=scopedVisible.length?scopedVisible.slice(-320):contextBars.slice(activeChart?-320:-120);
    return {chart:slot.index+1,provider:slot.source.id,sourceLabel:slot.source.label,symbol:slot.source.market,
      timeframe:slot.source.timeframe,cutoff:slot.source.cutoff,completedCutoff:completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf).at(-1)?.time||null,loadedAt:slot.source.loadedAt,
      freshness:'unverified public provider snapshot',barCount:slot.bars.length,contextBarCount:analysisBars.length,
      visibleRange,
      studies:[...slot.premium,...(slot.chart?.indicators?.()||[]).map(item=>item.nativeType).filter(Boolean)],
      drawings:drawings.slice(-80).map(item=>({id:item.id,type:item.type,anchors:item.anchors,
        label:item.text?.value||item.text?.text||''})),
      bars:analysisBars.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}))};
  });
  return {tab:'Quant Lab',...(quantGameEnabled?{game:window.quantGame?.analysisContext()}:{}),activeChart:activeIndex+1,chartCount:charts.length,charts,capturedAt:new Date().toISOString()};
}});
const quantAgentIds=['cleo','shammy','june','batty','taper'];
const quantAgentLabels={cleo:'Cleo',shammy:'Shammy',june:'June',batty:'Batty',taper:'Taper'};
const quantAgentAvatarKey='countdesk.quant-lab.agent-avatars.v1';
const quantAgentAvatarMigrationKey='countdesk.quant-lab.shammy-pixel-default.v1';
const quantAgentPixelAvatarIndex=25;
const quantAgentSpottedAvatarIndex=26;
const quantAgentEmblems=[
  'Double axe','Lute','Sun staff','Harvest sickle','Shield and weapons',
  'Raised fist','Twin flames','Crossed blades','Winged dagger','Flame',
  'Eye and rays','Guiding hand','Gear','UA letters','Seedling'
];
const quantAgentFirstEmblemIndex=27;
const quantAgentAdditionalIconCount=25;
const quantAgentMaxAvatarIndex=quantAgentFirstEmblemIndex+quantAgentEmblems.length+quantAgentAdditionalIconCount-1;
const quantAgentDefaults={cleo:0,shammy:quantAgentPixelAvatarIndex,june:13,batty:20,taper:22};
const quantAgentStatus=$('#quantAgentStatus');
const quantAgentDialog=$('#quantAgentAvatarDialog');
function readQuantAgentAvatars(){
  try{const value=JSON.parse(localStorage.getItem(quantAgentAvatarKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function quantAgentAvatarIndex(agent){
  const value=readQuantAgentAvatars()[agent];
  return Number.isInteger(value)&&value>=0&&value<=quantAgentMaxAvatarIndex?value:quantAgentDefaults[agent];
}
function quantAgentAvatarUrl(index){
  if(index>=quantAgentFirstEmblemIndex)return new URL(`./cleo-avatar-assets/icons/agent-emblems/emblem-${String(index-quantAgentFirstEmblemIndex+1).padStart(2,'0')}.png`,import.meta.url).href;
  const asset=index===quantAgentPixelAvatarIndex?'shammy-pixel-bw.png':index===quantAgentSpottedAvatarIndex?'cat-black-spots-green-eyes.png':`cat-${String(index+1).padStart(2,'0')}.png`;
  return new URL(`./cleo-avatar-assets/icons/${asset}`,import.meta.url).href;
}
function quantAgentAvatarLabel(index){
  if(index>=quantAgentFirstEmblemIndex){
    const emblemIndex=index-quantAgentFirstEmblemIndex;
    return emblemIndex<quantAgentEmblems.length?`${quantAgentEmblems[emblemIndex]} emblem`:`Additional icon ${emblemIndex-quantAgentEmblems.length+1}`;
  }
  if(index===quantAgentPixelAvatarIndex)return 'Black-and-white pixel cat';
  if(index===quantAgentSpottedAvatarIndex)return 'Black-spotted cat with green eyes';
  return `Cat icon ${index+1}`;
}
function renderQuantAgentAvatars(){
  for(const agent of quantAgentIds){
    const button=document.querySelector(`[data-agent-card="${agent}"] .quant-agent-avatar`);
    const image=button?.querySelector('img');
    if(!image)continue;
    const index=quantAgentAvatarIndex(agent);
    image.src=quantAgentAvatarUrl(index);
    image.alt=`${quantAgentLabels[agent]} ${quantAgentAvatarLabel(index)}`;
    button.title=`Analyze with ${quantAgentLabels[agent]}`;
  }
}
function openQuantAgentAvatarPicker(agent){
  $('#quantAgentAvatarTitle').textContent=`Choose ${quantAgentLabels[agent]}'s icon`;
  const choices=$('#quantAgentAvatarChoices');choices.replaceChildren();
  const selected=quantAgentAvatarIndex(agent);
  for(let index=0;index<=quantAgentMaxAvatarIndex;index++){
    const button=document.createElement('button');button.type='button';button.className='quant-agent-avatar-choice';
    const choiceLabel=quantAgentAvatarLabel(index);
    button.setAttribute('aria-label',choiceLabel);button.setAttribute('aria-pressed',String(index===selected));
    if(index===quantAgentPixelAvatarIndex)button.classList.add('is-pixel-cat');
    if(index===quantAgentSpottedAvatarIndex)button.classList.add('is-spotted-cat');
    if(index>=quantAgentFirstEmblemIndex)button.classList.add('is-emblem');
    if(index===selected)button.classList.add('is-selected');
    const image=document.createElement('img');image.src=quantAgentAvatarUrl(index);image.alt='';image.setAttribute('aria-hidden','true');button.append(image);
    button.addEventListener('click',()=>{
      const saved=readQuantAgentAvatars();saved[agent]=index;localStorage.setItem(quantAgentAvatarKey,JSON.stringify(saved));
      renderQuantAgentAvatars();quantAgentDialog.close();
    });
    choices.append(button);
  }
  quantAgentDialog.showModal();
}
try{
  if(localStorage.getItem(quantAgentAvatarMigrationKey)!=='1'){
    const saved=readQuantAgentAvatars();
    if(saved.shammy==null||saved.shammy===6)saved.shammy=quantAgentPixelAvatarIndex;
    localStorage.setItem(quantAgentAvatarKey,JSON.stringify(saved));
    localStorage.setItem(quantAgentAvatarMigrationKey,'1');
  }
}catch{}
renderQuantAgentAvatars();
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-avatar-agent]');
  if(!button)return;
  event.preventDefault();
  openQuantAgentAvatarPicker(button.dataset.avatarAgent);
},true);
$('#closeQuantAgentAvatars').addEventListener('click',()=>quantAgentDialog.close());
quantAgentDialog.addEventListener('click',event=>{if(event.target===quantAgentDialog)quantAgentDialog.close();});

// Taper is a local TypeSafe Jev-backed research agent. It never writes to a SIM
// account or chart order ticket. Monitoring runs only while this page is open.
let taperBusy=false,taperMonitor=false,taperTimer=null,taperLastKey='',taperLastRecord=null,taperLastError='';
let taperReads=0,taperAutoReads=0,taperEstimatedUsd=0;
function updateTaperPanel(){
  if(activePanel!=='taper')return;
  const status=$('#taperStatus'),facts=$('#taperFacts'),monitor=$('#taperMonitor'),read=$('#taperRead'),ticket=$('#taperPaperTicket');
  if(!status||!facts||!monitor||!read||!ticket)return;
  status.textContent=taperBusy?'Reading completed 1m tape and seven-frame context…':taperLastError||
    (taperLastRecord?`Read ${utc(taperLastRecord.source.completedCutoff)} · ${taperLastRecord.source.provider} ${taperLastRecord.source.symbol}`:'Choose Read tape to evaluate the latest completed 1m bar.');
  status.classList.toggle('taper-unknown',Boolean(taperLastError));
  monitor.textContent=taperMonitor?'Stop monitor':'Monitor completed 1m bars';
  read.disabled=taperBusy;monitor.disabled=taperBusy;ticket.hidden=taperLastRecord?.paperGate?.status!=='manual_review'||!quantGameEnabled;ticket.disabled=taperBusy;
  if(!taperLastRecord){facts.textContent='No TypeSafe Jev read yet. Wave Court counts remain chart hypotheses; Taper does not place trades.';return;}
  const answers=Object.fromEntries((taperLastRecord.answers||[]).map(answer=>[answer.name,answer]));
  const field=(name)=>{const answer=answers[name];if(!answer)return 'unavailable';if(answer.type==='refusal')return 'refused';
    if(answer.type==='choice')return `${answer.choice} · model confidence ${Number(answer.confidence||0).toFixed(2)}`;
    if(answer.type==='score')return `${Number(answer.score||0).toFixed(2)} / 2 · confidence ${Number(answer.confidence||0).toFixed(2)}`;
    return 'unavailable';};
  facts.textContent=`Tape state: ${field('tape_state')}\nResearch bias: ${field('research_bias')}\nStructure clarity: ${field('structure_clarity')}\n`+
    `Tokens this read: ${Number(taperLastRecord.usage?.input_tokens||0)} input / ${Number(taperLastRecord.usage?.total_tokens||0)} total\n`+
    `Estimated API cost: $${Number(taperLastRecord.estimatedUsd||0).toFixed(6)} this read · $${taperEstimatedUsd.toFixed(6)} this page (${taperReads} reads)\n`+
    `Decision ID: ${taperLastRecord.decisionId}\n${taperLastRecord.paperGate?.reason||'Paper research only'} · no order submitted. Model confidence is classification confidence, not trade probability.`;
}
function openTaperPanel(){
  panel('taper','Taper · tape reader','<div class="taper-read"><p>Taper reads completed 1-minute BTC, ETH, or SOL tape with seven-frame Wave Court context. The paper game still uses its matching frozen 15-minute liquidity field. A missing Daily or 4H count stays unresolved. No order is submitted.</p><div class="taper-actions"><button id="taperRead" type="button">Read tape now</button><button id="taperMonitor" type="button">Monitor completed 1m bars</button><button id="taperPaperTicket" type="button" hidden>Review SIM ticket</button></div><p id="taperStatus" role="status"></p><div id="taperFacts" class="taper-facts"></div><small>Monitor checks every 30 seconds while this page is visible and calls Jev at most once per new completed 1m bar, up to 30 automatic reads per page. It stops when this tab closes.</small></div>');
  $('#taperRead').addEventListener('click',()=>void runTaper());
  $('#taperPaperTicket').addEventListener('click',()=>{
    try{
      const record=taperLastRecord,slot=slots[activeIndex],game=window.quantGame?.analysisContext();
      const bias=(record?.answers||[]).find(answer=>answer.name==='research_bias')?.choice;
      const chartCutoff=completedBars(slot?.bars||[],'1m',slot?.source?.snapshotAsOf).at(-1)?.time;
      if(record?.paperGate?.status!=='manual_review'||!game?.fieldFresh||game.accountMode!=='sim'||
        game.range?.version!==record.game?.fieldVersion||slot?.source?.id!==record.source?.provider||
        slot?.source?.market!==record.source?.symbol||chartCutoff!==record.source?.completedCutoff||
        game.fieldCutoff!==record.source?.completedCutoff||!game.levels?.length)throw new Error('Read Taper again after the chart and frozen field refresh.');
      if(bias!=='WATCH_LONG'&&bias!=='WATCH_SHORT')throw new Error('No directional watch is available.');
      window.quantGame.reviewPaperTicket(bias==='WATCH_LONG'?'long':'short');
    }catch(error){taperLastError=error.message;updateTaperPanel();}
  });
  $('#taperMonitor').addEventListener('click',()=>{
    taperMonitor=!taperMonitor;
    if(taperTimer)clearInterval(taperTimer);
    taperTimer=taperMonitor?setInterval(()=>{if(document.visibilityState==='visible')void runTaper({auto:true});},30_000):null;
    updateTaperPanel();
    if(taperMonitor)void runTaper({auto:true});
  });
  updateTaperPanel();
}
async function runTaper({auto=false}={}){
  if(taperBusy)return;
  const slot=slots[activeIndex];
  if(!slot?.source){taperLastError='Load a sourced chart first.';updateTaperPanel();return;}
  if(quantGameEnabled&&!gameMarketAllowed(slot.params)){taperLastError='Select BTC, ETH, or SOL on a supported 1m game source.';updateTaperPanel();return;}
  taperBusy=true;taperLastError='';updateTaperPanel();
  try{
    const availability=await fetch('/api/taper/status').then(response=>response.json());
    if(!availability.configured)throw new Error('Set TYPESAFE_API_KEY in count-dashboard/.env and restart Count Desk.');
    const asOf=Date.now(),params={...slot.params},sequence=slot.sequence;
    const oneMinute=completedBars(await fetchBars({...params,timeframe:'1m'},500,null,{researchContext:true}),'1m',asOf);
    if(slot.sequence!==sequence||slot.params.id!==params.id||slot.params.market!==params.market)throw new Error('Chart source changed during Taper read.');
    if(oneMinute.length<40)throw new Error('Taper needs at least 40 completed 1m bars from the selected source.');
    const cutoff=oneMinute.at(-1).time;
    const game=quantGameEnabled?window.quantGame?.analysisContext():null;
    if(quantGameEnabled&&(!game?.range||game.range.provider!==params.id||game.range.symbol!==params.market))throw new Error('Freeze a matching 15m liquidity field before Taper reads this market.');
    const key=`${params.id}|${params.market}|${cutoff}|${game?.range?.version||''}`;
    if(auto&&key===taperLastKey)return;
    if(auto&&taperAutoReads>=30){taperMonitor=false;if(taperTimer)clearInterval(taperTimer);taperTimer=null;throw new Error('The 30-read monitor budget is reached; manual reads remain available.');}
    const read=await waveCourtRead(slot,'1m',oneMinute,asOf,params);
    if(slot.sequence!==sequence||slot.params.id!==params.id||slot.params.market!==params.market)throw new Error('Chart source changed during Taper read.');
    if(game&&window.quantGame?.range()?.version!==game.range.version)throw new Error('Frozen field changed during Taper read.');
    const evidence=taperEvidence(read,oneMinute,{...params,timeframe:'1m',snapshotAsOf:asOf},game);
    const response=await fetch('/api/taper/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
    const record=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(record.error||`Taper service returned ${response.status}`);
    if(game&&window.quantGame?.range()?.version!==game.range.version)record.paperGate={status:'wait',reason:'Frozen field changed during the read; refresh Taper before reviewing a paper entry'};
    taperLastKey=key;taperLastRecord=record;taperReads++;if(auto)taperAutoReads++;taperEstimatedUsd+=Number(record.estimatedUsd||0);
    quantAgentStatus.textContent=`Taper read ${params.market} completed 1m tape · ${utc(cutoff)} · ${quantGameEnabled?'SIM watch only':'research only'}`;
  }catch(error){taperLastError=`Taper paused · ${error.message}`;quantAgentStatus.textContent=taperLastError;}
  finally{taperBusy=false;updateTaperPanel();}
}
document.querySelectorAll('[data-run-taper]').forEach(button=>button.addEventListener('click',()=>{openTaperPanel();void runTaper();}));
function setQuantAgentRunState(running){
  $('#analyzeAllAgents').disabled=running;
  $('#runShammyAnalysis').disabled=running;
  document.querySelectorAll('.quant-agent-run,.quant-agent-avatar,.quant-agent-avatar-edit').forEach(button=>{button.disabled=running;});
}
async function runQuantAgent(agent,layer=1,chartBundle=null){
  const active=slots[0];
  if(!active?.source||!active.bars.length){quantAgentStatus.textContent='Load a chart before requesting an analysis.';return false;}
  if(agent==='shammy')clearVisibleShammyMarks();
  if(agent==='shammy')analysisReturnSlotIndex=activeIndex;
  const journey=agent==='shammy'&&codexWidget.startChartJourney('Shammy');
  try{
    if(!chartBundle){quantAgentStatus.textContent='Loading six analyst reference charts…';chartBundle=await collectReferenceAnalysisBundle(journey?stage=>codexWidget.reportChartStage(stage):()=>{});}
  }catch(error){quantAgentStatus.textContent=`Analysis not started · ${error.message}`;if(journey)codexWidget.failChartJourney(error.message);return false;}
  quantAgentStatus.textContent=`Starting ${quantAgentLabels[agent]} with six reference charts…`;
  const result=await codexWidget.runChartAgent(agent,{layer,chartBundle});
  if(!result.started||result.status==='failed'){quantAgentStatus.textContent=result.error||`${quantAgentLabels[agent]} could not complete.`;if(journey)codexWidget.failChartJourney(quantAgentStatus.textContent);return false;}
  if(agent!=='shammy')quantAgentStatus.textContent=`${quantAgentLabels[agent]} finished · research only`;
  return true;
}
$('#runShammyAnalysis').addEventListener('click',async()=>{setQuantAgentRunState(true);try{await runQuantAgent('shammy');}finally{setQuantAgentRunState(false);}});
document.querySelectorAll('[data-run-agent]').forEach(button=>button.addEventListener('click',async()=>{
  if(button.disabled)return;setQuantAgentRunState(true);
  try{await runQuantAgent(button.dataset.runAgent);}finally{setQuantAgentRunState(false);}
}));
$('#newQuantChat').addEventListener('click',()=>{
  if(!codexWidget.newChat())quantAgentStatus.textContent='Wait for the current analysis to finish or for chat to reconnect.';
});
$('#analyzeAllAgents').addEventListener('click',async()=>{
  const available=['cleo','shammy'];setQuantAgentRunState(true);
  try{
    let chartBundle;
    try{quantAgentStatus.textContent='Loading six analyst reference charts…';chartBundle=await collectReferenceAnalysisBundle();}
    catch(error){quantAgentStatus.textContent=`Analysis not started · ${error.message}`;return;}
    for(let index=0;index<available.length;index++){
      const agent=available[index];quantAgentStatus.textContent=`Analysis ${index+1} of ${available.length} · ${quantAgentLabels[agent]}`;
      const completed=await runQuantAgent(agent,index+1,chartBundle);
      if(!completed)return;
    }
    quantAgentStatus.textContent='Available analyses complete · June and Batty are placeholders';
  }finally{setQuantAgentRunState(false);}
});

const restoredLayout=quantGameEnabled||cryptoDeskEnabled?null:readLayoutState();
if(restoredLayout){
  for(const kind of Object.keys(syncPrefs))syncPrefs[kind]=restoredLayout.sync[kind]===true;
  activeIndex=restoredLayout.activeIndex;
}
for(const kind of Object.keys(syncPrefs))$(`#sync${kind[0].toUpperCase()}${kind.slice(1)}`).checked=syncPrefs[kind];
let initialCharts;
if(cryptoDeskEnabled){$('#provider').value='hyperliquid';$('#market').value='BTC';$('#timeframe').value='1m';initialCharts=[{id:'hyperliquid',market:'BTC',timeframe:'1m'}];}
else if(quantGameEnabled){$('#provider').value='coinbase';$('#market').value='BTC-USD';$('#timeframe').value='1m';initialCharts=[{id:'coinbase',market:'BTC-USD',timeframe:'1m'}];}
else{
  $('#provider').value='binance';$('#market').value='BTCUSDT';$('#timeframe').value='1h';$('#timeframe').disabled=true;
  initialCharts=restoredLayout?.charts?.length?restoredLayout.charts.map(item=>({...item,timeframe:'1h'})):[{id:'binance',market:'BTCUSDT',timeframe:'1h'}];
}
void setLayout(restoredLayout?.count||1,{initial:true,charts:initialCharts});
syncAnalysisOutputPair();

if(quantGameEnabled){window.quantGame=createQuantGame({getSlot:()=>slots[activeIndex],fetchBars,completedBars,loadChart,resizeCharts,reloadAccounts:loadSimAccounts,getPaperAccount:()=>activeAccountId,advancePaper:advanceQuantLabSnapshot,refreshChart:async(slot)=>{const source=slot.source,sequence=slot.sequence,asOf=Date.now(),bars=await fetchBars(slot.params);if(slot.source!==source||slot.sequence!==sequence||!bars.length||bars.at(-1).time<slot.bars.at(-1).time)throw new Error("Chart changed or provider returned no bars");const visible=slot.chart.getVisibleRange(),native=slot.chart.renderer?.renderer,viewport=native?.coords?.getViewport?.();await slot.chart.setMarket({data:bars,...(visible?{visibleRange:visible}:{})});slot.bars=bars;slot.source={...source,cutoff:bars.at(-1).time,snapshotAsOf:asOf,loadedAt:Date.now()};for(const id of slot.premium)await addPremium(slot,id);updateSlotHead(slot);refreshActivePanel();setStatus(`Public chart refreshed ${utc(asOf)} · ${source.market} · 1m · completed cutoff ${utc(completedBars(bars,'1m',asOf).at(-1).time)}`);}});}

// Dedicated crypto desk reuses the existing chart, Codex chat, simulator and journal.
if(cryptoDeskEnabled){
  let pendingDeskDecision=null;
  startCryptoDesk({
    slot:()=>slots[activeIndex],accountId:()=>activeAccountId,resize:resizeCharts,cycle:()=>currentCryptoCycle,reloadAccounts:loadSimAccounts,
    accounts:()=>{traderView='accounts';renderChartTrader();},positions:()=>{traderView='trade';renderChartTrader();},
    ticket:(side,price=null,time=null)=>openChartTicket(side,price,time,null,price==null),pendingDecision:(...args)=>{if(args.length)pendingDeskDecision=args[0];return pendingDeskDecision;},
    fetchBars:(params,limit)=>fetchBars(params,limit,null,{researchContext:true}),
    subscribeQuote:handler=>{const src=slots[activeIndex]?.source,Provider=window.Vela?.[providerSpecs[src?.id]?.className];if(!Provider||!src)return ()=>{};return new Provider().subscribe(src.market,'1m',bar=>{if(Number.isFinite(bar.close))handler({price:bar.close,receivedAt:Date.now(),barTime:bar.time});});},
    clearWave:()=>clearPremium(slots[activeIndex],'wave-court'),waveDraw:()=>drawFor(slots[activeIndex],'wave-court').add,
    rider:async requestText=>{
      const slot=slots[activeIndex],read=window.cryptoDayDesk?.getRead();
      if(!slot?.source||!read?.frames?.every(f=>f.barData?.length))throw new Error('Rider requires all seven completed source frames');
      const frameContext=(f,index)=>{
        const data=f.barData;return {chart:index+1,workspace:'analyst reference',provider:slot.source.id,sourceLabel:slot.source.label,symbol:slot.source.market,timeframe:f.timeframe,cutoff:data.at(-1).time,completedCutoff:data.at(-1).time,
          barCompleteness:'Forming bars excluded from supplied OHLCV',historyFirst:data[0].time,historyLast:data.at(-1).time,historyBarCount:data.length,
          swingCandidateColumns:['time','wickPrice','kind'],swingCandidates:referenceSwingCandidates(data),
          ...(['1d','4h'].includes(f.timeframe)?{historyBarsColumns:['time','open','high','low','close','volume'],historyBars:data.map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume])}:{}),
          bars:data.slice(-240),studies:['Wave Court 1.14'],drawings:[]};
      };
      const charts=read.frames.slice(0,6).map(frameContext),trader=frameContext(read.frames[6],0);
      const chart={tab:'Crypto Day Desk read-only review',workspace:'analyst-reference',activeChart:1,chartCount:6,charts,traderChart:trader,capturedAt:new Date().toISOString(),huntSession:{levels:window.cryptoDayDesk.getState()?.session?.levels,policy:window.cryptoDayDesk.getState()?.session?.policy}};
      return codexWidget.runChartAgent('shammy',{chartBundle:{chart,image:''},requestText:requestText+'\nRead-only review. Wave Court remains the sole chart drawing authority. Discuss the selected hunt levels and report uncertainty; do not request chart layout changes.'});
    },
    agent:async agent=>{setQuantAgentRunState(true);try{return await runQuantAgent(agent);}finally{setQuantAgentRunState(false);}},
    advance:async(oneMinute,src)=>{const active=slots[activeIndex];await advanceQuantLabSnapshot({...active,bars:oneMinute.slice(-500),source:{...src,timeframe:'1m',snapshotAsOf:Date.now()}});await loadScoreboardLedger();},
    changeMarket:async params=>{$('#provider').value=params.id;$('#market').value=params.market;$('#timeframe').disabled=false;$('#timeframe').value=params.timeframe;await loadChart(activeIndex,params);},
    refresh:async()=>{const slot=slots[activeIndex],current=slot.source,seq=slot.sequence;const asof=Date.now(),next=await fetchBars(slot.params,500);if(slot.sequence!==seq||slot.source!==current||!next.length)throw new Error('Chart changed during refresh');const visible=slot.chart.getVisibleRange(),native=slot.chart.renderer?.renderer,viewport=native?.coords?.getViewport?.();await slot.chart.setMarket({data:next,...(visible?{visibleRange:visible}:{})});if(viewport&&viewport.rightOffset>=0)native.applyViewport(viewport);slot.bars=next;slot.source={...current,cutoff:next.at(-1).time,snapshotAsOf:asof,loadedAt:Date.now()};source=slot.source;bars=next;updateSlotHead(slot);$('#sourceCutoff').textContent=`COMPLETED ${utc(completedBars(next,current.timeframe,asof).at(-1)?.time||0)}`;setStatus(`Public polling · ${current.market} · ${current.timeframe} · snapshot ${utc(asof)}`);}
  });
}

if(cryptoDeskEnabled)mountTradingChartSettings({getCharts:()=>[...slots,...referenceCharts].map(slot=>slot.chart),mount:$('.desk-control-main')});


chartTrading=mountChartTrading({
  snapshot:()=>{const slot=slots[activeIndex],completed=slot?.source?completedBars(slot.bars,slot.source.timeframe,slot.source.snapshotAsOf):[];
    return {slot,source:slot?.source,accountId:activeAccountId,accountName:simAccounts.find(a=>a.account_id===activeAccountId)?.name||'SIM',
      orders:quantLabOrders,positions:quantLabPositions,completed,barTime:Math.floor((completed.at(-1)?.time||0)/1000),mark:slot?.bars?.at(-1)?.close,
      policy:window.cryptoDayDesk?.getState()?.policy,tick:window.cryptoDayDesk?.getRead()?.settings?.tick||.01};},
  request:simRequest,refresh:loadQuantLabPositions,toast:showChartTradeToast,
  cancel:cancelQuantLabLimitOrder,ticket:(positionOrSide,price=null,time=null)=>positionOrSide&&typeof positionOrSide==='object'?openChartTicket(positionOrSide.side,null,null,positionOrSide):openChartTicket(positionOrSide,price,time,null,price==null),
  slotForHost:host=>slots.find(s=>s.host===host),activate:index=>activateSlot(index,false),
  studies:async hidden=>{const slot=slots[activeIndex];if(!slot)return;
    if(hidden){slot.chartStudyRestore=[...slot.premium];for(const id of [...slot.premium]){clearPremium(slot,id);slot.premium.delete(id);}slot.chartHiddenHandles=slot.chart.indicators().map(h=>({handle:h,visible:h.visible}));for(const {handle} of slot.chartHiddenHandles)handle.setVisible(false);}
    else{for(const {handle,visible} of slot.chartHiddenHandles||[])handle.setVisible(visible);slot.chartHiddenHandles=[];for(const id of slot.chartStudyRestore||[]){slot.premium.add(id);if(!(cryptoDeskEnabled&&id==='wave-court'))await addPremium(slot,id);}}
    if(cryptoDeskEnabled)await window.cryptoDayDesk?.sync(true);
  }
});

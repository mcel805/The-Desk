import {runSmaBacktest} from './quant-backtest.mjs';
import {completedBars,createSmartFibOverlay,quantPremiumItems,renderLiquidityOverlay} from './quant-premium-overlays.mjs';

const $ = selector => document.querySelector(selector);
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

function readStored(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } }
history = readStored(storageKey, []);
versions = readStored(versionsKey, []);
function save() { try { localStorage.setItem(storageKey, JSON.stringify(history.slice(-24))); localStorage.setItem(versionsKey, JSON.stringify(versions.slice(-50))); } catch {} }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function fmt(value, maximumFractionDigits=2) { return Number(value).toLocaleString(undefined,{maximumFractionDigits}); }
function utc(time) { return new Date(time).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'); }
function runKey() { return JSON.stringify({name:draft.name,fast:draft.fast,slow:draft.slow,feeBps:draft.feeBps,source:source&&{id:source.id,market:source.market,timeframe:source.timeframe,cutoff:source.cutoff}}); }
function addMessage(role, content, error=false) {
  const node = document.createElement('div');
  node.className = `${role === 'user' ? 'user-message' : 'assistant-message'}${error ? ' error' : ''}`;
  if (role !== 'user') { const author=document.createElement('span'); author.className='message-author'; author.textContent='✦ COUNT DESK'; node.append(author); }
  const body=document.createElement('p'); body.textContent=content; node.append(body);
  $('#chatStream').append(node); $('#chatStream').scrollTop=$('#chatStream').scrollHeight;
  return node;
}
for (const message of history) if (message && ['user','assistant'].includes(message.role) && typeof message.content==='string') addMessage(message.role,message.content);
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
  closeContextMenu();renderChartTrader(side);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
}
function renderChartTrader(side='long'){
  const account=simAccounts.find(item=>item.account_id===activeAccountId);
  const supported=Boolean(source&&source.type==='micro futures (stored bars)');
  panel('trader','Chart Trader',`<div class="trader-account-card"><span>ACTIVE SIM ACCOUNT</span><strong>${escapeHtml(account?.name||'No account selected')}</strong><small>${account?`${escapeHtml(account.currency||'USD')} · virtual starting balance ${fmt(account.starting_balance,2)}`:'Create or select an account above to continue.'}</small></div>
  <p class="trader-market"><b>${escapeHtml(source?.market||slots[activeIndex]?.params?.market||'No chart loaded')}</b> · ${escapeHtml(source?.timeframe||slots[activeIndex]?.params?.timeframe||'—')} · ${escapeHtml(source?.label||'public chart source')}</p>
  <p class="trader-boundary">${supported?'This chart source is eligible for the local paper simulator. Orders remain simulated.':`Paper order entry is unavailable for this chart. Quant Lab is showing ${escapeHtml(source?.type||'public crypto data')}; the current simulator requires stored micro-futures bars. No order will be sent.`}</p>
  <div class="trader-ticket"><div class="trader-ticket-head"><strong>Order ticket</strong><span>SIM · PAPER</span></div><label>Side<select id="traderSide"><option value="long" ${side==='long'?'selected':''}>Buy / Long</option><option value="short" ${side==='short'?'selected':''}>Sell / Short</option></select></label><div class="panel-row"><label>Order type<select id="traderType"><option value="market">Market</option><option value="limit">Limit</option></select></label><label>Quantity<input id="traderQty" type="number" min="1" step="1" value="1"></label></div><label>Limit price<input id="traderLimit" type="number" min="0" step="any" placeholder="Only used for limit orders"></label><button id="traderReview" class="trader-submit" type="button" disabled>${supported&&account?'Review paper order':'Unavailable for this chart'}</button><small class="trader-cutoff">Chart cutoff: ${source?escapeHtml(utc(source.cutoff)):'not loaded'}</small></div>
  <div class="trader-list-head"><strong>Orders &amp; positions</strong><button id="traderRefresh" type="button">Refresh</button></div><div id="traderLedger" class="trader-ledger"><p>${account?'Loading account activity…':'Select a SIM account to view its activity.'}</p></div>
  <div class="trader-create"><strong>Simulation accounts</strong><p>Create a virtual account stored on this device. It does not connect to a broker.</p><form id="createSimAccount"><label>Account name<input name="name" maxlength="80" required placeholder="e.g. BTC paper study"></label><label>Starting virtual balance (USD)<input name="starting_balance" type="number" min="1" step="any" value="10000" required></label><button type="submit">Create SIM account</button></form><p id="traderNotice" class="muted" role="status"></p></div>`);
  $('#chartTraderButton').setAttribute('aria-expanded','true');
  $('#traderType').addEventListener('change',()=>{$('#traderLimit').closest('label').hidden=$('#traderType').value!=='limit';});
  $('#traderType').dispatchEvent(new Event('change'));
  $('#traderReview').addEventListener('click',()=>{
    if(!supported||!account)return;
    $('#traderNotice').textContent='Review flow is ready when this chart is backed by stored simulator bars. The current public crypto snapshot cannot be submitted to the micro-futures simulator.';
  });
  $('#traderRefresh').addEventListener('click',()=>void loadTraderLedger());
  $('#createSimAccount').addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{const account=await simRequest('accounts',{method:'POST',body:JSON.stringify({name:form.get('name'),starting_balance:form.get('starting_balance')})});
      simAccounts.push(account);activeAccountId=account.account_id;syncAccountPicker();renderChartTrader(side);
    }catch(error){$('#traderNotice').textContent=error.message;}
    finally{if($('#createSimAccount button'))$('#createSimAccount button').disabled=false;}
  });
  void loadTraderLedger();
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
  return {index,cell,head,host,error,params,chart:null,bars:[],source:null,sequence:0,unsub:[],premium:new Set(),premiumDrawings:new Map(),fib:null,premiumStatus:''};
}
function clearPremium(slot,id){
  if(id==='smart-fib'){slot.fib?.destroy();slot.fib=null;slot.host.onpointerleave=null;}
  for(const drawingId of slot.premiumDrawings.get(id)||[])slot.chart?.drawings?.remove?.(drawingId);
  slot.premiumDrawings.delete(id);
}
function drawFor(slot,id){
  const ids=[];slot.premiumDrawings.set(id,ids);
  return {add:(type,config)=>{const drawing=slot.chart.drawings.add(type,config);if(drawing?.id)ids.push(drawing.id);return drawing;},
    clear:()=>{for(const drawingId of ids)slot.chart.drawings.remove(drawingId);ids.length=0;}};
}
async function addPremium(slot,id){
  if(!slot.chart?.drawings?.supported||typeof slot.chart.drawings.add!=='function')throw new Error('This chart renderer cannot display research drawings.');
  const chartAtStart=slot.chart;
  clearPremium(slot,id);
  const draw=drawFor(slot,id);
  try{
    if(id==='liquidity'){
      const chartBars=completedBars(slot.bars,slot.params.timeframe);
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
    }
    slot.premium.add(id);
  }catch(error){clearPremium(slot,id);throw error;}
}
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
  if(index===activeIndex){$('#loadChart').disabled=true;setStatus(`Chart ${index+1} · loading ${providerSpecs[params.id].label} · ${params.market} · ${params.timeframe}…`);}
  try{
    if(!validParams(params))throw new Error('Enter a valid market and interval.');
    if(!window.Vela?.Vela)throw new Error('Vela browser bundle is unavailable.');
    const nextBars=reuse || await fetchBars(params);
    if(slot.sequence!==sequence || slots[index]!==slot)return;
    if(!nextBars.length)throw new Error('The public provider returned no valid bars. Check the symbol or network.');
    for(const off of slot.unsub)off();slot.unsub=[];
    for(const id of slot.premium)clearPremium(slot,id);
    slot.chart?.destroy();slot.host.replaceChildren();
    const nextChart=new window.Vela.Vela(slot.host,{symbol:params.market,timeframe:params.timeframe,data:nextBars,live:false,theme:'dark',drawings:true,volume:true,currentPriceLine:true,timeScale:{timezone:'UTC'},nativeBackend:'canvas2d',animations:{intro:false}});
    slot.chart=nextChart;
    await nextChart.ready();
    if(slot.sequence!==sequence || slots[index]!==slot){nextChart.destroy();return;}
    await new Promise(resolve=>requestAnimationFrame(resolve));nextChart.resize();
    slot.bars=nextBars;slot.source={...params,label:providerSpecs[params.id].label,type:providerSpecs[params.id].type,cutoff:nextBars.at(-1).time,loadedAt:Date.now()};
    slot.unsub.push(nextChart.renderer.onCrosshairMove(event=>syncCrosshairFrom(index,event)));
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
    toLoad.push(loadSlot(index,params,same?.bars||null));
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
  panel('indicators','Chart studies','<div class="indicator-tabs" role="tablist" aria-label="Chart study categories"><button type="button" role="tab" data-indicator-tab="vela">Vela defaults</button><button type="button" role="tab" data-indicator-tab="premium">Premium</button><button type="button" role="tab" data-indicator-tab="tools">Tools</button></div><p id="indicatorIntro"></p><p id="indicatorStatus" class="indicator-status" role="status" aria-live="polite"></p><div id="indicatorList" class="panel-list" role="tabpanel"></div>');
  for(const button of $('#panelBody').querySelectorAll('[data-indicator-tab]')){
    button.setAttribute('aria-selected',String(button.dataset.indicatorTab===indicatorTab));
    button.addEventListener('click',()=>{indicatorTab=button.dataset.indicatorTab;void renderIndicators();});
  }
  const list=$('#indicatorList');
  if (!chart) { list.textContent='Load a chart first.'; return; }
  const slot=slots[activeIndex];
  $('#indicatorStatus').textContent=slot.premiumStatus;
  if(indicatorTab!=='vela'){
    $('#indicatorIntro').textContent=indicatorTab==='premium'?'Premium research indicators use completed public bars on the selected chart. Levels and convergence are descriptive, with no measured outcomes.':'Interactive chart tools use confirmed swings. Hover the chart after adding Smart Fib to preview its levels.';
    const id=indicatorTab==='premium'?'liquidity':'smart-fib',item=quantPremiumItems[id],active=slot.premium.has(id);
    const card=document.createElement('article');card.className=`card premium-card${active?' is-active':''}`;
    const image=document.createElement('img');image.src=`./tool-belt-assets/${item.image}`;image.alt='';image.className='premium-icon';
    const copy=document.createElement('div');copy.className='premium-copy';
    const title=document.createElement('strong');title.textContent=item.name;
    const detail=document.createElement('small');detail.textContent=item.description;
    const state=document.createElement('span');state.className='premium-state';state.textContent=active?'On selected chart':'Available';
    copy.append(title,detail,state);
    const actions=document.createElement('div');actions.className='premium-actions';
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent=active?'Remove':'Add';
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
    return;
  }
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
    if(!indicators.length)list.textContent='No native studies are available.';
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

function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read screenshot.'));reader.readAsDataURL(file);});}
$('#chatImage').addEventListener('change',()=>{$('#imageName').textContent=$('#chatImage').files[0]?.name||'No screenshot selected';});
$('#newChat').addEventListener('click',()=>{history=[];save();$('#chatStream').replaceChildren();addMessage('assistant','New Quant Lab conversation. Load a chart to include its source and cutoff.');});
for(const button of document.querySelectorAll('[data-prompt]'))button.addEventListener('click',()=>{$('#chatInput').value=button.dataset.prompt;$('#chatInput').focus();});
$('#chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#chatForm').requestSubmit();}});
$('#chatForm').addEventListener('submit',async event=>{
  event.preventDefault();const prompt=$('#chatInput').value.trim();const file=$('#chatImage').files[0];if(!prompt&&!file)return;
  if(file&&file.size>8*1024*1024){addMessage('assistant','Screenshot must be 8 MB or smaller.',true);return;}
  const userText=prompt||'Please describe the attached chart screenshot as a provisional research observation.';
  addMessage('user',userText+(file?`\n[Attached ${file.name}]`:''));history.push({role:'user',content:userText});save();$('#chatInput').value='';$('#sendChat').disabled=true;
  const waiting=addMessage('assistant','Reading chart context…');
  try{
    const recent=bars.slice(-8).map(bar=>({time:utc(bar.time),open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}));
    const context=source?`Chart: ${source.label}; ${source.market}; ${source.timeframe}; loaded ${utc(source.loadedAt)}; last bar ${utc(source.cutoff)}. Public provider snapshot; freshness unverified. Last 8 OHLCV bars: ${JSON.stringify(recent)}. Treat structure as provisional; do not infer fills or broker account state.`:'No chart loaded. Do not infer current prices or chart structure.';
    const messages=history.slice(-23).map(item=>({role:item.role,content:item.content}));
    messages[messages.length-1]={role:'user',content:`${context}\n\nUser request: ${userText}`};
    const attachments=file?[{name:file.name,type:file.type,data:await fileAsDataUrl(file)}]:[];
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',effort:'medium',context:'Quant Lab chart research',view:{tab:'Quant Lab',symbol:source?.market||'',timeframe:source?.timeframe||'',cutoff:source?Math.floor(source.cutoff/1000):null},messages,attachments})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||`Chat request failed (${response.status}).`);
    waiting.remove();const answer=String(result.text||'No answer returned.');addMessage('assistant',answer);history.push({role:'assistant',content:answer});save();$('#chatImage').value='';$('#imageName').textContent='No screenshot selected';
  }catch(error){waiting.remove();addMessage('assistant',error.message,true);}finally{$('#sendChat').disabled=false;}
});

const restoredLayout=readLayoutState();
if(restoredLayout){
  for(const kind of Object.keys(syncPrefs))syncPrefs[kind]=restoredLayout.sync[kind]===true;
  activeIndex=restoredLayout.activeIndex;
}
for(const kind of Object.keys(syncPrefs))$(`#sync${kind[0].toUpperCase()}${kind.slice(1)}`).checked=syncPrefs[kind];
void setLayout(restoredLayout?.count||1,{initial:true,charts:restoredLayout?.charts||[]});

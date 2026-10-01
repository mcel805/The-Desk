const $ = selector => document.querySelector(selector);
import {buildChartContract} from './chart-contract.js';
import {liquidityConvergenceGroups} from './liquidity-convergence.js';
import {renderBiasOverlay,renderStructureZonesOverlay} from './premium-overlays.js';
import {createPaperChartPlanner} from './paper-chart-planner.js?v=paper-cats-20261001';
import {createModularWorkspace} from './modular-workspace.js?v=paper-cats-20261001';
import {resetCandleSpacing,stepCandleSpacing,keepCandleSpacingReadable} from './candle-viewport.js?v=3';
let latestPaperJournalSequence = 0;
async function refreshPaperJournalBadge() {
  const badge = $('#journalUpdateBadge');
  if (!badge) return;
  try {
    const response = await fetch('/api/chart-sim/journal-updates', {cache:'no-store'});
    if (!response.ok) throw new Error('Journal status unavailable');
    const result = await response.json();
    latestPaperJournalSequence = Number(result.latestSequence || 0);
    const total = Number(result.unreadCount || 0) + Number(result.pendingCount || 0);
    badge.hidden = total < 1;
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('has-pending', Number(result.pendingCount || 0) > 0);
    badge.title = Number(result.pendingCount || 0)
      ? `${result.unreadCount || 0} delivered journal updates · ${result.pendingCount} waiting for journal delivery`
      : `${result.unreadCount || 0} new journal update${result.unreadCount === 1 ? '' : 's'} to review`;
    badge.setAttribute('aria-label', badge.title);
  } catch {
    // Keep the last durable count visible during a brief local-service outage.
  }
}
let catalog = [];
const providerCatalogs = new Map();
let modularWorkspace = null;
let velaChart = null;
let velaResizeFrame = 0;
let currentContract = null;
let liveChartBar = null;
let offLiveChartBar = null;
let paperOrders = [];
let paperPositions = [];
let paperAccounts = [];
let paperBusy = false;
let replayBounds = null;
let replayKey = '';
let indicatorTypeMemory = ['volume'];
let indicatorInputMemory = {};
const indicatorStorageKey = 'count-desk-vela-indicators-v1';
const indicatorInputStorageKey = 'count-desk-vela-indicator-inputs-v1';
const beltActiveStorageKey = 'count-desk-toolbelt-active-v1';
const beltSettingsStorageKey = 'count-desk-toolbelt-settings-v1';
const beltTemplatesStorageKey = 'count-desk-toolbelt-templates-v1';
const defaultDataProviderStorageKey = 'count-desk-vela-default-provider-v1';
const candleSkinStorageKey = 'count-desk-vela-candle-skins-v1';
const candleSkinActiveStorageKey = 'count-desk-vela-candle-skin-active-v1';
const candleSkinDefaultVersionKey = 'count-desk-vela-candle-skin-default-version';
const chartDisplayStorageKey = 'count-desk-vela-chart-display-v1';
const previousCandleSkin = Object.freeze({upFill:'#089981',downFill:'#f23645',upWick:'#ffffff',downWick:'#ffffff',upBorder:'#ffffff',downBorder:'#ffffff',wicksVisible:true,bordersVisible:true,bodyVisible:true});
const defaultCandleSkin = Object.freeze({upFill:'#089981',downFill:'#f23645',upWick:'#ffffff',downWick:'#ffffff',upBorder:'#ffffff',downBorder:'#ffffff',wicksVisible:true,bordersVisible:true,bodyVisible:true});
const defaultChartDisplay = Object.freeze({chartType:'candles',scale:'price',log:false,invert:false,timezone:'America/Los_Angeles',vertGrid:'#232a31',horzGrid:'#232a31',fontSize:11,rightMargin:10,vertVisible:false,horzVisible:false,priceLine:true,priceLabels:true});
const chartTickSizes = Object.freeze({'CBOT_MINI:MYM1!':.5,'CME_MINI:MES1!':.25,'CME_MINI:MNQ1!':.25,'NYMEX:MCL1!':.01,'COMEX:MGC1!':.1});
let activeCandleSkin = {...defaultCandleSkin};
let chartDisplaySettings = {...defaultChartDisplay};
let savedCandleSkins = [];
let settingsTarget = null;
let indicatorTemplates = [];
let toolBeltDrawingIds = {};
let toolBeltBarsCache = {key:'', at:0, bars:[]};
let activeChartConnection = null;
let pendingChartConnection = null;
let liquidityHoverChart = null;
let liquidityHoverUnsubscribe = null;
let liquidityHoverGroups = [];
let liquidityPointer = {x:0,y:0};
let liquidityPopupPinned = false;
const chartProviderSpecs = {
  binance:{label:'Binance',prefix:'BINANCE',className:'BinanceProvider'},
  coinbase:{label:'Coinbase Exchange',prefix:'COINBASE',className:'CoinbaseProvider'},
  hyperliquid:{label:'Hyperliquid',prefix:'HYPERLIQUID',className:'HyperliquidProvider'},
};
const timeframeOptions = {
  historical:[['1M','1m'],['2M','2m'],['3M','3m'],['5M','5m'],['15M','15m'],['30M','30m'],['1H','1h'],['4H','4h'],['1D','1d']],
  tickstream:[['1M','1m'],['1H','1h'],['4H','4h'],['1D','1d']],
  provider:[['1M','1m'],['2M','2m'],['3M','3m'],['5M','5m'],['15M','15m'],['30M','30m'],['45M','45m'],['1H','1h'],['2H','2h'],['3H','3h'],['4H','4h'],['6H','6h'],['8H','8h'],['12H','12h'],['1D','1d'],['1W','1w'],['1MO','1mo']],
};
const toolBeltIndicators = [
  {id:'volume-profile',name:'Volume Profile',version:'v1.0.0',image:'volume-profile-sketch.png',colorImage:'volume-profile-color.png',settings:[['bins','Price bins','number',32,8,128],['lookback','Lookback bars','number',160,20,2000],['valueArea','Show value area','checkbox',true]]},
  {id:'fibonacci',name:'Fibonacci',version:'v0.1.0',image:'fibonacci-sketch.png',colorImage:'fibonacci-color.png',settings:[['anchor','Swing anchor','select','Last confirmed swing',['Last confirmed swing','Visible range','Manual']],['levels','Retracement levels','text','0.382, 0.5, 0.618']]},
  {id:'liquidity',name:'Liquidity',version:'001',latestVersion:'001',versions:[{id:'001',label:'001 · HTF convergence',state:'current',summary:'30m / 1h anchors, present internal levels, and compact convergence tags.'},{id:'000',label:'000 · Baseline',state:'archived',summary:'Original chart-timeframe pivots with wick-swept history.'}],image:'liquidity-sketch.png',colorImage:'liquidity-color.png',settings:[['externalPivot','External pivot length','number',14,1,50],['internalPivot','Internal pivot length','number',5,1,50],['showSweeps','Show broken history','checkbox',true],['convergenceAtr','Convergence range (ATR)','number',0.1,0.05,0.2],['showLocalConvergences','Show local timeframe convergences','checkbox',true]]},
  {id:'bias',name:'Bias',version:'v1.0.0',image:'bias-sketch.png',colorImage:'bias-color.png',settings:[['pivotLength','Pivot length','number',5,1,50],['sweepBufferTicks','Sweep buffer (ticks)','number',1,0,100],['acceptanceBufferTicks','Acceptance buffer (ticks)','number',1,0,100],['showSwingLabels','Show swing labels','checkbox',true],['showBreaks','Show BOS / CHOCH','checkbox',true],['priorPeriod','Include higher-timeframe context','checkbox',true]]},
  {id:'structure-zones',name:'Structure Zones',version:'v1.0.0',image:'liquidity-zones-sketch.png',colorImage:'liquidity-zones-color.png',settings:[['pivotLength','Pivot length','number',4,1,50],['originLookback','Origin search (bars)','number',8,1,50],['minDisplacementAtr','Min displacement (ATR)','number',0.8,0,10],['equalToleranceAtr','Equal-level tolerance (ATR)','number',0.12,0,2],['showBreaks','Show BOS / CHoCH','checkbox',true]]},
  {id:'liquidity-zones',name:'Liquidity Zones',version:'v0.1.0',image:'liquidity-zones-sketch.png',colorImage:'liquidity-zones-color.png',settings:[['pivotLength','Pivot length','number',4,1,50],['tolerance','Level tolerance (ATR)','number',0.12,0,2],['confirmClose','Confirm at bar close','checkbox',true]]},
  {id:'daily-bias',name:'Daily Bias',version:'v0.1.0',image:'daily-bias-sketch.png',colorImage:'daily-bias-color.png',settings:[['lookback','Lookback sessions','number',20,1,250],['priorSweep','Use prior-session sweeps','checkbox',true]]},
  {id:'elliott-wave',name:'Elliott Wave',version:'v0.1.0',image:'elliott-wave-sketch.png',colorImage:'elliott-wave-color.png',settings:[['pivotLength','Pivot length','number',5,1,50],['alternates','Show alternate counts','checkbox',true]]},
  {id:'confirmed-swings',name:'Confirmed Swings',version:'v0.1.0',image:'confirmed-swings-sketch.png',colorImage:'confirmed-swings-color.png',settings:[['pivotLength','Pivot length','number',4,1,50],['showLabels','Show pivot labels','checkbox',true]]},
  {id:'confluence',name:'Confluence',version:'v0.1.0',image:'convergence-sketch.png',colorImage:'convergence-color.png',settings:[['minimumLayers','Minimum aligned layers','number',2,1,10],['timeframe','Context timeframe','select','Chart timeframe',['Chart timeframe','1D','4H','1H','30M','15M']]]},
  {id:'premium-discount',name:'Premium / Discount',version:'v0.1.0',image:'premium-discount-sketch.png',colorImage:'premium-discount-color.png',settings:[['anchor','Swing anchor','select','Last confirmed swing',['Last confirmed swing','Visible range']],['equilibrium','Equilibrium (%)','number',50,1,99]]},
];
const indicatorDefinitions = [
  {type:'volume', label:'Volume', note:'native pane', inputs:{}},
  {type:'rsi', label:'RSI', note:'study pane', inputs:{length:14, source:'Close'}},
  {type:'sma', label:'SMA', note:'price overlay', inputs:{length:20, source:'Close'}},
  {type:'ema', label:'EMA', note:'price overlay', inputs:{length:20, source:'Close'}},
  {type:'atr', label:'ATR', note:'study pane', inputs:{length:14}},
  {type:'vpvr', label:'Visible volume profile', note:'price profile', inputs:{}},
];

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function setStatus(message, error = false) {
  const node = $('#velaStatus');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function scheduleVelaResize() {
  if (!velaChart || velaResizeFrame) return;
  velaResizeFrame = requestAnimationFrame(() => {
    velaResizeFrame = 0;
    velaChart?.resize();
  });
}

function velaConfigApi() {
  if (velaChart?.renderer?.applyConfig) return velaChart.renderer;
  if (velaChart?.applyConfig) return velaChart;
  return null;
}

window.addEventListener('resize', scheduleVelaResize);
window.addEventListener('pageshow', scheduleVelaResize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleVelaResize();
});

function applyScreenPaintToChart() {
  if (!velaChart?.setTheme) return;
  const styles = getComputedStyle($('.vela-preview-main'));
  const color = name => styles.getPropertyValue(`--screen-${name}`).trim();
  velaChart.setTheme({
    background:color('bg') || '#151619',
    textColor:color('text') || '#b2b5be',
    gridColor:color('bg') || '#151619',
    borderColor:color('border') || '#2a2b30',
    fontFamily:'sans-serif',
  });
  velaConfigApi()?.applyConfig({grid:{vertLines:{visible:false},horzLines:{visible:false}}});
  applyCandleSkin();
  applyChartDisplaySettings();
}

function applyCandleSkin() {
  const status = $('#velaSkinStatus');
  const configApi = velaConfigApi();
  if (!configApi) {
    if (status) status.textContent = 'Chart renderer is not ready; candle style will apply when the chart loads.';
    return;
  }
  const skin = activeCandleSkin;
  // Vela uses the root candle defaults and also allows a candle-type override.
  // The renderer prefers the override while drawing, so keep both in sync.
  const expected = {upColor:skin.upFill,downColor:skin.downFill,bodyVisible:skin.bodyVisible,borderVisible:skin.bordersVisible,borderUpColor:skin.upBorder,borderDownColor:skin.downBorder,wickVisible:skin.wicksVisible,wickUpColor:skin.upWick,wickDownColor:skin.downWick};
  const candleOverride = {candleUpColor:skin.upFill,candleDownColor:skin.downFill,candleBodyVisible:skin.bodyVisible,candleBorderVisible:skin.bordersVisible,candleBorderUpColor:skin.upBorder,candleBorderDownColor:skin.downBorder,candleWickVisible:skin.wicksVisible,candleWickUpColor:skin.upWick,candleWickDownColor:skin.downWick};
  configApi.applyConfig({candles:expected,chartTypes:{candles:candleOverride}});
  const config = configApi.getConfig?.();
  const applied = config?.candles;
  const appliedOverride = config?.chartTypes?.candles;
  const matches = applied && appliedOverride && Object.entries(expected).every(([key,value]) => applied[key] === value) && Object.entries(candleOverride).every(([key,value]) => appliedOverride[key] === value);
  if (status) {
    const mismatches = [...(applied ? Object.keys(expected).filter(key => applied[key] !== expected[key]) : ['root candle style']),...(appliedOverride ? Object.keys(candleOverride).filter(key => appliedOverride[key] !== candleOverride[key]) : ['candle type style'])];
    status.textContent = matches ? 'Candle style applied to the chart.' : `Chart did not apply: ${mismatches.join(', ')}.`;
    status.dataset.state = matches ? 'applied' : 'pending';
  }
}

function applyChartDisplaySettings() {
  const configApi = velaConfigApi();
  if (!configApi) return;
  const s = chartDisplaySettings;
  // Vela's `series.spacing` is a pitch multiplier, not a candle width. Values
  // above 1 spread candle centers while leaving body width unchanged, making
  // filled candles look like thin wicks. Candle width belongs to the viewport.
  const expected = {priceScale:{mode:s.scale,log:s.log,invert:s.invert,currentPriceLine:s.priceLine,labelsVisible:s.priceLabels},timeScale:{timezone:s.timezone},grid:{vertLines:{visible:s.vertVisible,color:s.vertGrid},horzLines:{visible:s.horzVisible,color:s.horzGrid}},fontSize:Number(s.fontSize),margins:{right:Number(s.rightMargin),top:6,bottom:6},series:{style:s.chartType,spacing:1}};
  configApi.applyConfig(expected);
  const applied = configApi.getConfig?.();
  const matches = applied && applied.series?.style === s.chartType && applied.priceScale?.mode === s.scale && applied.priceScale?.log === s.log && applied.priceScale?.invert === s.invert && applied.priceScale?.currentPriceLine === s.priceLine && applied.priceScale?.labelsVisible === s.priceLabels && applied.timeScale?.timezone === s.timezone && applied.grid?.vertLines?.visible === s.vertVisible && applied.grid?.horzLines?.visible === s.horzVisible && applied.margins?.right === Number(s.rightMargin);
  $('#velaChartSettingsStatus').textContent = matches ? 'Chart display settings applied.' : 'Chart did not confirm every display setting.';
}

function applyReadableCandleViewport(chart = velaChart) {
  stopCandleSpacingGuard?.();
  stopCandleSpacingGuard = null;
  if (!resetCandleSpacing(chart,Number(chartDisplaySettings.rightMargin))) return;
  stopCandleSpacingGuard = keepCandleSpacingReadable(chart);
}

function readChartCustomization() {
  let savedSkin = null;
  try { savedSkin = JSON.parse(localStorage.getItem(candleSkinActiveStorageKey)||'null'); } catch { /* Use the readable default. */ }
  const isPreviousDefault = savedSkin && Object.entries(previousCandleSkin).every(([key,value]) => savedSkin[key] === value);
  activeCandleSkin = {...defaultCandleSkin,...(isPreviousDefault ? {} : savedSkin || {})};
  if (localStorage.getItem(candleSkinDefaultVersionKey) !== 'readable-candles-4') {
    if (!savedSkin || isPreviousDefault) localStorage.setItem(candleSkinActiveStorageKey,JSON.stringify(activeCandleSkin));
    localStorage.setItem(candleSkinDefaultVersionKey,'readable-candles-4');
  }
  try { chartDisplaySettings = {...defaultChartDisplay,...JSON.parse(localStorage.getItem(chartDisplayStorageKey)||'{}')}; } catch { chartDisplaySettings = {...defaultChartDisplay}; }
  try { const parsed=JSON.parse(localStorage.getItem(candleSkinStorageKey)||'[]'); savedCandleSkins=Array.isArray(parsed)?parsed.filter(item=>item&&typeof item.name==='string'&&item.settings&&typeof item.settings==='object'):[]; } catch { savedCandleSkins=[]; }
}

function skinInputs() {
  return {upFill:$('#velaSkinUpFill').value,downFill:$('#velaSkinDownFill').value,upWick:$('#velaSkinUpWick').value,downWick:$('#velaSkinDownWick').value,upBorder:$('#velaSkinUpBorder').value,downBorder:$('#velaSkinDownBorder').value,wicksVisible:$('#velaSkinWicksVisible').checked,bordersVisible:$('#velaSkinBordersVisible').checked,bodyVisible:$('#velaSkinBodyVisible').checked};
}

function loadSkinInputs(settings=activeCandleSkin) {
  $('#velaSkinUpFill').value=settings.upFill; $('#velaSkinDownFill').value=settings.downFill;
  $('#velaSkinUpWick').value=settings.upWick; $('#velaSkinDownWick').value=settings.downWick;
  $('#velaSkinUpBorder').value=settings.upBorder; $('#velaSkinDownBorder').value=settings.downBorder;
  $('#velaSkinWicksVisible').checked=settings.wicksVisible; $('#velaSkinBordersVisible').checked=settings.bordersVisible; $('#velaSkinBodyVisible').checked=settings.bodyVisible;
}

function renderSkinTemplates(selectedId='') {
  const select=$('#velaSkinSelect'); select.replaceChildren(new Option('Current skin',''));
  savedCandleSkins.forEach((skin,index)=>select.add(new Option(skin.name,String(index))));
  select.value=selectedId; $('#velaSkinDelete').disabled=selectedId==='';
}

function readDisplayInputs() {
  return {chartType:$('#velaSettingChartType').value,scale:$('#velaSettingScale').value,log:$('#velaSettingLog').checked,invert:$('#velaSettingInvert').checked,timezone:$('#velaSettingTimezone').value,vertGrid:$('#velaSettingVertGrid').value,horzGrid:$('#velaSettingHorzGrid').value,fontSize:Math.max(8,Math.min(24,Number($('#velaSettingFontSize').value)||11)),rightMargin:Math.max(0,Math.min(30,Number($('#velaSettingRightMargin').value)||0)),vertVisible:$('#velaSettingVertVisible').checked,horzVisible:$('#velaSettingHorzVisible').checked,priceLine:$('#velaSettingPriceLine').checked,priceLabels:$('#velaSettingPriceLabels').checked};
}

function loadDisplayInputs() {
  const s=chartDisplaySettings; $('#velaSettingChartType').value=s.chartType; $('#velaSettingScale').value=s.scale; $('#velaSettingLog').checked=!!s.log; $('#velaSettingInvert').checked=!!s.invert; $('#velaSettingTimezone').value=s.timezone;
  $('#velaSettingVertGrid').value=s.vertGrid; $('#velaSettingHorzGrid').value=s.horzGrid; $('#velaSettingFontSize').value=s.fontSize; $('#velaSettingRightMargin').value=s.rightMargin;
  $('#velaSettingVertVisible').checked=s.vertVisible; $('#velaSettingHorzVisible').checked=s.horzVisible; $('#velaSettingPriceLine').checked=s.priceLine; $('#velaSettingPriceLabels').checked=s.priceLabels;
}

function bindChartCustomization() {
  $('#velaCandleSkinsButton').addEventListener('click',()=>$('#velaCandleSkinsDialog').showModal());
  $('#velaChartSettingsButton').addEventListener('click',()=>$('#velaChartSettingsDialog').showModal());
  $('#velaOpenCandleStyle').addEventListener('click',()=>{ $('#velaChartSettingsDialog').close(); $('#velaCandleSkinsDialog').showModal(); });
  document.querySelectorAll('[data-close-chart-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  const updateCandleSkin=()=>{activeCandleSkin=skinInputs();localStorage.setItem(candleSkinActiveStorageKey,JSON.stringify(activeCandleSkin));applyCandleSkin();};
  $('#velaSkinApply').addEventListener('click',()=>{updateCandleSkin();});
  for (const input of document.querySelectorAll('#velaCandleSkinsForm input')) {
    input.addEventListener('input',updateCandleSkin);
    // Native color wells may commit with `change` after their picker closes.
    input.addEventListener('change',updateCandleSkin);
  }
  $('#velaSkinSelect').addEventListener('change',()=>{const i=Number($('#velaSkinSelect').value);if(Number.isInteger(i)&&savedCandleSkins[i]){activeCandleSkin={...savedCandleSkins[i].settings};loadSkinInputs();localStorage.setItem(candleSkinActiveStorageKey,JSON.stringify(activeCandleSkin));applyCandleSkin();$('#velaSkinName').value=savedCandleSkins[i].name;}$('#velaSkinDelete').disabled=$('#velaSkinSelect').value==='';});
  $('#velaSkinSave').addEventListener('click',()=>{const name=$('#velaSkinName').value.trim();if(!name){$('#velaSkinStatus').textContent='Enter a name to save this candle skin.';$('#velaSkinName').focus();return;}updateCandleSkin();const prior=savedCandleSkins.findIndex(skin=>skin.name.toLowerCase()===name.toLowerCase());const item={name,settings:{...activeCandleSkin}};if(prior>=0)savedCandleSkins[prior]=item;else savedCandleSkins.push(item);localStorage.setItem(candleSkinStorageKey,JSON.stringify(savedCandleSkins));localStorage.setItem(candleSkinActiveStorageKey,JSON.stringify(activeCandleSkin));renderSkinTemplates(String(savedCandleSkins.findIndex(skin=>skin.name===name)));$('#velaSkinStatus').textContent=`“${name}” saved in this browser.`;});
  $('#velaSkinDelete').addEventListener('click',()=>{const i=Number($('#velaSkinSelect').value);if(!Number.isInteger(i)||!savedCandleSkins[i])return;const [removed]=savedCandleSkins.splice(i,1);localStorage.setItem(candleSkinStorageKey,JSON.stringify(savedCandleSkins));renderSkinTemplates();$('#velaSkinName').value='';$('#velaSkinStatus').textContent=`“${removed.name}” deleted.`;});
  $('#velaSkinReset').addEventListener('click',()=>{activeCandleSkin={...defaultCandleSkin};loadSkinInputs();localStorage.setItem(candleSkinActiveStorageKey,JSON.stringify(activeCandleSkin));applyCandleSkin();$('#velaSkinSelect').value='';$('#velaSkinName').value='';$('#velaSkinStatus').textContent='TradingView-style candle colors restored.';});
  $('#velaOpenScreenPaint').addEventListener('click',()=>{
    $('#velaCandleSkinsDialog').close();
    $('#velaChartSettingsDialog').close();
    // Let the dialog button's original click finish bubbling before opening
    // Screen Paint; otherwise its outside-click listener immediately closes it.
    requestAnimationFrame(()=>$('#deskThemeButton')?.click());
  });
  const displayChange=()=>{chartDisplaySettings=readDisplayInputs();localStorage.setItem(chartDisplayStorageKey,JSON.stringify(chartDisplaySettings));applyChartDisplaySettings();};
  document.querySelectorAll('#velaChartSettingsForm input,#velaChartSettingsForm select').forEach(input=>input.addEventListener('change',displayChange));
  $('#velaChartSettingsReset').addEventListener('click',()=>{chartDisplaySettings={...defaultChartDisplay};loadDisplayInputs();localStorage.setItem(chartDisplayStorageKey,JSON.stringify(chartDisplaySettings));applyChartDisplaySettings();resetCandleSpacing(velaChart,Number(chartDisplaySettings.rightMargin));$('#velaChartSettingsStatus').textContent='Chart display and candle size restored to defaults.';});
  $('#velaCandleZoomOut').addEventListener('click',()=>stepCandleSpacing(velaChart,-1));
  $('#velaCandleZoomIn').addEventListener('click',()=>stepCandleSpacing(velaChart,1));
  $('#velaCandleZoomReset').addEventListener('click',()=>resetCandleSpacing(velaChart,Number(chartDisplaySettings.rightMargin)));
  document.addEventListener('keydown',event=>{
    if(event.key!=='0'||!event.target?.closest?.('#velaChart'))return;
    event.preventDefault();event.stopPropagation();
    resetCandleSpacing(velaChart,Number(chartDisplaySettings.rightMargin));
  },true);
  const quickOrderRail=$('#velaQuickOrderRail'), quickOrderToggle=$('#velaQuickOrderToggle');
  const quickOrderCollapseKey='count-desk-quick-paper-shortcuts-collapsed-v1';
  if (quickOrderRail && quickOrderToggle) {
    const setQuickOrderCollapsed=(collapsed,save=true)=>{
      quickOrderRail.classList.toggle('is-collapsed',collapsed);
      quickOrderToggle.setAttribute('aria-expanded',String(!collapsed));
      quickOrderToggle.setAttribute('aria-label',collapsed?'Expand paper trade buttons':'Collapse paper trade buttons');
      quickOrderToggle.title=collapsed?'Expand paper trade buttons':'Collapse paper trade buttons';
      if(save)try{localStorage.setItem(quickOrderCollapseKey,collapsed?'yes':'no');}catch{/* Local preferences are optional. */}
    };
    quickOrderToggle.addEventListener('click',()=>setQuickOrderCollapsed(!quickOrderRail.classList.contains('is-collapsed')));
    try{setQuickOrderCollapsed(localStorage.getItem(quickOrderCollapseKey)==='yes',false);}catch{setQuickOrderCollapsed(false,false);}
  }
  document.querySelectorAll('[data-quick-paper-side]').forEach(button=>button.addEventListener('click',()=>{
    const side=button.dataset.quickPaperSide, symbol=currentContract?.market?.symbol, tick=chartTickSizes[symbol];
    if(!paperChartPlanner.canPlanAtPrice()||!currentContract){$('#velaQuickOrderStatus').textContent='Load a supported stored micro-futures chart to stage a paper limit.';return;}
    const reference=Number(liveChartBar?.close||currentContract.analysis?.lastClose),offset=10;
    if(!Number.isFinite(reference)||reference<=0||!tick){$('#velaQuickOrderStatus').textContent='A confirmed chart close and supported tick size are required.';return;}
    const price=Number((reference+(side==='long'?-1:1)*tick*offset).toFixed(8));
    if(!paperChartPlanner.planAtPrice(price,side)){ $('#velaQuickOrderStatus').textContent='Paper planning is unavailable for this chart.';return; }
    $('#velaQuickOrderStatus').textContent=`Paper ${side==='long'?'buy':'sell'} limit staged at ${formatPrice(price)} (${offset} ticks from confirmed close ${formatPrice(reference)}). Review it in Paper Planner; nothing was sent.`;
  }));
}

readChartCustomization();
loadSkinInputs(); renderSkinTemplates(); loadDisplayInputs(); bindChartCustomization();

window.addEventListener('countdesk:screen-palette-change', event => {
  if (event.detail?.target === 'chart') applyScreenPaintToChart();
});

function fillSymbols() {
  const select = $('#velaSymbol');
  const previous = select.value;
  select.replaceChildren(...catalog.map(item => {
    const option = new Option(item.label || item.symbol,item.symbol);
    if (item.directProvider) option.dataset.directProvider = item.directProvider;
    return option;
  }));
  if (catalog.some(item => item.symbol === previous)) select.value = previous;
  else {
    const preferred = catalog.find(item => item.symbol.includes('MYM')) || catalog[0];
    if (preferred) select.value = preferred.symbol;
  }
}

function selectedMarket() {
  return catalog.find(item => item.symbol === $('#velaSymbol').value);
}

function localDateInput(seconds) {
  const date = new Date(Number(seconds) * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function updateReplayBounds(bars) {
  const input = $('#velaReplayCutoff');
  if (!input || !bars?.length) return;
  const first = Number(bars[0].time);
  const last = Number(bars.at(-1).time);
  if (!replayBounds) replayBounds = {first, last};
  input.min = localDateInput(replayBounds.first);
  input.max = localDateInput(replayBounds.last);
  if (!input.value) input.value = localDateInput(replayBounds.last);
}

function formatPrice(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', {maximumFractionDigits: 2}) : '—';
}

function formatCutoff(contract) {
  return contract?.market?.cutoff ? new Date(Number(contract.market.cutoff) * 1000).toLocaleString() : 'unknown cutoff';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function readStoredObject(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

function storedToolBeltActive() {
  try { const ids = JSON.parse(localStorage.getItem(beltActiveStorageKey) || '[]'); return new Set(Array.isArray(ids) ? ids.filter(id => toolBeltIndicators.some(item => item.id === id)) : []); }
  catch { return new Set(); }
}

function storeToolBeltActive(ids) {
  try { localStorage.setItem(beltActiveStorageKey, JSON.stringify([...ids])); } catch {}
  window.dispatchEvent(new Event('countdesk:chart-context'));
}

function storedToolBeltSettings() { return readStoredObject(beltSettingsStorageKey); }

function defaultSettings(definition) {
  return Object.fromEntries(definition.settings.map(([key,,type,value]) => [key, value]));
}

function effectiveToolBeltSettings(definition) {
  const saved = storedToolBeltSettings()[definition.id] || {};
  const requestedVersion=saved.algorithmVersion || definition.latestVersion || '000';
  const algorithmVersion=definition.versions?.some(version=>version.id===requestedVersion)
    ? requestedVersion
    : definition.latestVersion || '000';
  return {...defaultSettings(definition), ...saved, algorithmVersion};
}

function selectedToolBeltVersion(definition) {
  const settings = effectiveToolBeltSettings(definition);
  return definition.versions?.some(version => version.id === settings.algorithmVersion)
    ? settings.algorithmVersion
    : definition.latestVersion || definition.version;
}

function clearToolBeltDrawings(owner) {
  const owners = owner ? [owner] : Object.keys(toolBeltDrawingIds);
  for (const key of owners) {
    for (const id of toolBeltDrawingIds[key] || []) velaChart?.drawings?.remove?.(id);
    toolBeltDrawingIds[key] = [];
  }
}

function addToolBeltDrawing(type, init, owner = 'liquidity') {
  const drawing = velaChart?.drawings?.add?.(type, init);
  if (drawing?.id) (toolBeltDrawingIds[owner] ||= []).push(drawing.id);
  return drawing;
}

function providerTimeframe(timeframe) {
  return ({'1M':'1','2M':'2','3M':'3','5M':'5','15M':'15','30M':'30','45M':'45','1H':'60','2H':'120','3H':'180','4H':'240','6H':'360','8H':'480','12H':'720','1D':'D','1W':'W','1MO':'M'})[String(timeframe).toUpperCase()] || timeframe;
}

function setTimeframeOptions(mode) {
  const select = $('#velaTimeframe');
  const options = timeframeOptions[mode] || timeframeOptions.historical;
  const previous = select.value;
  select.replaceChildren(...options.map(([value,label]) => new Option(label,value)));
  select.value = options.some(([value]) => value === previous) ? previous : (options.some(([value]) => value === '1H') ? '1H' : options[0][0]);
}

async function activeToolBeltBars(timeframeOverride = null) {
  const context = window.countDeskVelaContext || {};
  const symbol = context.symbol || velaChart?.market?.symbol || currentContract?.market?.symbol;
  const timeframe = timeframeOverride || context.timeframe || $('#velaTimeframe').value;
  if (!velaChart || !symbol || !timeframe) throw new Error('Load a chart with a market and timeframe first.');
  const cutoff = Number(context.cutoff || (currentContract?.market?.symbol === symbol ? currentContract.market.cutoff : 0)) || null;
  const cutoffMs = cutoff ? cutoff * 1000 : Date.now();
  const key = `${context.tab || 'unknown'}|${symbol}|${timeframe}|${cutoff || 'latest'}`;
  if (toolBeltBarsCache.key === key && Date.now() - toolBeltBarsCache.at < 5000) {
    return {symbol,timeframe,source:context.tab || 'active chart',bars:toolBeltBarsCache.bars};
  }
  let bars = [];
  if (currentContract?.market?.symbol === symbol && currentContract.market.timeframe === timeframe) {
    bars = currentContract.bars || [];
  } else if (tickstreamTicker(symbol)) {
    const ticker = tickstreamTicker(symbol);
    const payload = await getJson(`/api/tickstream/bars?symbol=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}`);
    bars = (payload.bars || []).map(bar => ({...bar,time:Number(bar.time) * 1000}));
  } else {
    const resolved = velaChart.data?.resolve?.(symbol);
    const provider = resolved && velaChart.data?.providerInstance?.(resolved.provider);
    if (!provider?.getBars) throw new Error(`The active chart provider for ${symbol} does not expose historical candles to studies.`);
    bars = await provider.getBars(resolved.ticker,providerTimeframe(timeframe),{limit:1200,to:cutoffMs});
  }
  bars = (bars || []).map(bar => ({
    time:Number(bar.time) < 1e12 ? Number(bar.time) * 1000 : Number(bar.time),
    open:Number(bar.open),high:Number(bar.high),low:Number(bar.low),close:Number(bar.close),volume:Number(bar.volume || 0),
  })).filter(bar => Number.isFinite(bar.time) && bar.time <= cutoffMs && [bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)).sort((a,b) => a.time-b.time);
  if (context.tab !== 'Count Desk' && bars.length > 20) bars = bars.slice(0,-1); // Ignore the current provider bar for confirmed structures.
  if (bars.length < 8) throw new Error(`Only ${bars.length} usable ${timeframe} bars are available from ${symbol}; more history is needed.`);
  toolBeltBarsCache = {key,at:Date.now(),bars};
  return {symbol,timeframe,source:context.tab || 'active chart',bars};
}

function confirmedPivots(bars, length) {
  const pivots=[];
  for (let i=length;i<bars.length-length;i++) {
    let high=true,low=true;
    for (let j=i-length;j<=i+length;j++) if (j!==i) {
      if (bars[j].high>=bars[i].high) high=false;
      if (bars[j].low<=bars[i].low) low=false;
    }
    if (high) pivots.push({index:i,time:bars[i].time,price:bars[i].high,side:'HIGH'});
    if (low) pivots.push({index:i,time:bars[i].time,price:bars[i].low,side:'LOW'});
  }
  return pivots.sort((a,b)=>a.index-b.index);
}

async function premiumIndicatorReport(id, symbol, timeframe, source, bars, settings) {
  const context = window.countDeskVelaContext || {};
  const cutoff = Math.floor(bars.at(-1).time / 1000);
  if (context.tab === 'Count Desk' || (context.tab === 'Tickstream' && id === 'bias')) {
    const path = context.tab === 'Tickstream' ? '/api/tickstream/tool-belt/bias' : `/api/tool-belt/${id}`;
    const query = new URLSearchParams({symbol,timeframe,cutoff:String(context.cutoff || cutoff)});
    query.set('pivot_length',String(settings.pivotLength));
    if (id === 'bias') {
      query.set('sweep_buffer_ticks',String(settings.sweepBufferTicks));
      query.set('acceptance_buffer_ticks',String(settings.acceptanceBufferTicks));
    } else {
      query.set('origin_lookback',String(settings.originLookback));
      query.set('min_displacement_atr',String(settings.minDisplacementAtr));
      query.set('equal_tolerance_atr',String(settings.equalToleranceAtr));
    }
    return getJson(`${path}?${query}`);
  }
  const toRows = values => values.slice(-1200).map(bar => ({time:Math.floor(bar.time/1000),
    open:bar.open,high:bar.high,low:bar.low,close:bar.close}));
  let dailyBars = [], weeklyBars = [], unavailable = [];
  if (id === 'bias' && settings.priorPeriod) {
    const frames = await Promise.allSettled(['1D','1W'].map(tf => activeToolBeltBars(tf)));
    dailyBars = frames[0].status === 'fulfilled' ? toRows(frames[0].value.bars) : [];
    weeklyBars = frames[1].status === 'fulfilled' ? toRows(frames[1].value.bars) : [];
    unavailable = ['1D','1W'].filter((_, index) => frames[index].status !== 'fulfilled');
  }
  const response = await fetch('/api/tool-belt/chart-report', {method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({indicatorId:id,symbol,timeframe,source,bars:toRows(bars),dailyBars,weeklyBars,settings})});
  const report = await response.json();
  if (!response.ok) throw new Error(report.error || `Chart study request failed (${response.status})`);
  report.contextUnavailable = unavailable;
  return report;
}

function toolDrawLine(owner,bars,startIndex,price,color,label='',style='solid',width=1,endIndex=bars.length-1,endTimeOverride=null) {
  const start=Math.max(0,Math.min(bars.length-1,startIndex));
  const end=Math.max(start,Math.min(bars.length-1,endIndex));
  if (end<=start || !Number.isFinite(Number(price))) return;
  const endTime=endTimeOverride ?? bars[end].time;
  addToolBeltDrawing('trendline',{paneId:'price',anchors:[{time:bars[start].time,price:Number(price)},{time:endTime,price:Number(price)}],style:{lineColor:color,lineWidth:width,lineStyle:style}},owner);
  if (label) addToolBeltDrawing('text',{paneId:'price',anchors:[{time:endTime,price:Number(price)}],text:{value:label,color,size:'tiny',hAlign:'right',vAlign:'top'},style:{lineColor:color,lineWidth:1,lineStyle:'solid'}},owner);
}

function toolDrawLabel(owner,bar,value,color,size='tiny') {
  addToolBeltDrawing('text',{paneId:'price',anchors:[{time:bar.time,price:bar.price}],text:{value,color,size,hAlign:'center',vAlign:bar.side==='HIGH'?'bottom':'top'},style:{lineColor:color,lineWidth:1,lineStyle:'solid'}},owner);
}

function averageTrueRange(bars,period=14) {
  const rows=bars.slice(-period).map((bar,index)=>Math.max(bar.high-bar.low, index ? Math.abs(bar.high-bars[bars.length-period+index-1].close) : 0, index ? Math.abs(bar.low-bars[bars.length-period+index-1].close) : 0));
  return rows.reduce((sum,value)=>sum+value,0)/Math.max(rows.length,1);
}

const liquidityTimeframeMinutes={'1M':1,'2M':2,'3M':3,'5M':5,'15M':15,'30M':30,'45M':45,'1H':60,'2H':120,'3H':180,'4H':240,'6H':360,'8H':480,'12H':720,'1D':1440,'1W':10080,'1MO':43200};
const liquidityContextTimeframes=['1M','5M','15M','30M','1H'];
const liquidityProbabilityReference='50%'; // Neutral placeholder until the Lab has scored recorded outcomes.

function liquidityLevelsForTimeframe(timeframe,bars,settings) {
  const levels=[
    ...confirmedPivots(bars,Number(settings.externalPivot || 14)).map(point=>({...point,kind:'EXT'})),
    ...confirmedPivots(bars,Number(settings.internalPivot || 5)).map(point=>({...point,kind:'INT'})),
  ].sort((a,b)=>a.index-b.index);
  const atr=bars.length>=15?averageTrueRange(bars,14):0;
  return levels.map(point=>({
    ...point,timeframe,bars,atr,id:`${timeframe}-${point.kind}-${point.side}-${point.time}`,
    confirmedTime:(bars[point.index+(point.kind==='EXT'?Number(settings.externalPivot||14):Number(settings.internalPivot||5))]?.time||0)
      +(liquidityTimeframeMinutes[timeframe]||60)*60000,
    // Keep v000's wick-sweep rule as part of the archived baseline. v001 uses
    // the Pine line lifecycle: a close through the level ends the line.
    sweepIndex:bars.slice(point.index+1).findIndex(bar=>point.side==='HIGH'?bar.high>point.price:bar.low<point.price),
    breakIndex:bars.slice(point.index+1).findIndex(bar=>point.side==='HIGH'?bar.close>point.price:bar.close<point.price),
  }));
}

function liquidityLineColor(level,swept) {
  if(swept) return '#b4b4b4';
  const buySide=level.side==='HIGH';
  if(level.kind==='INT') return buySide?'#ff9800':'#00d5e8';
  return buySide?'#f23645':'#089981';
}

function liquidityBaselineLineColor(level,swept) {
  const buySide=level.side==='HIGH';
  if(level.kind==='INT') return swept?(buySide?'#a66a22':'#248a91'):(buySide?'#ff9800':'#00d5e8');
  return swept?(buySide?'#a8484e':'#287c6b'):(buySide?'#f23645':'#089981');
}

function presentLiquidityLevels(levels) {
  const latestInternal=new Map();
  for(const level of levels){
    if(level.kind!=='INT') continue;
    const key=`${level.timeframe}|${level.side}`;
    const previous=latestInternal.get(key);
    if(!previous||level.time>previous.time) latestInternal.set(key,level);
  }
  return levels.filter(level=>level.kind!=='INT'||latestInternal.get(`${level.timeframe}|${level.side}`)===level);
}

function boundedLiquidityLevels(levels) {
  const selected=[];
  for(const timeframe of new Set(levels.map(level=>level.timeframe))){
    for(const side of ['HIGH','LOW']){
      const scoped=levels.filter(level=>level.timeframe===timeframe&&level.side===side);
      const external=scoped.filter(level=>level.kind==='EXT');
      // A few recent active swing levels preserve useful context without
      // recreating the 40-line pile visible in the previous renderer.
      selected.push(...external.filter(level=>level.breakIndex<0).sort((a,b)=>b.time-a.time).slice(0,3));
      selected.push(...external.filter(level=>level.breakIndex>=0).sort((a,b)=>b.time-a.time).slice(0,2));
      selected.push(...scoped.filter(level=>level.kind==='INT'));
    }
  }
  return selected.sort((a,b)=>a.time-b.time);
}

function renderLiquidityVersion000(owner,chartTimeframe,chartBars,settings) {
  const levels=liquidityLevelsForTimeframe(chartTimeframe,chartBars,settings);
  for(const level of levels){
    const swept=level.sweepIndex>=0;
    if(swept&&settings.showSweeps===false) continue;
    const endIndex=swept?level.index+1+level.sweepIndex:chartBars.length-1;
    toolDrawLine(owner,chartBars,level.index,level.price,liquidityBaselineLineColor(level,swept),`${level.kind} ${level.side==='HIGH'?'BSL':'SSL'}${swept?' · swept':''}`,swept?'dashed':'solid',1,endIndex);
  }
}

function renderLiquidityVersion001(owner,chartTimeframe,chartBars,series,settings) {
  const chartEndTime=chartBars.at(-1)?.time;
  const asOf=chartEndTime+(liquidityTimeframeMinutes[chartTimeframe]||60)*60000;
  const aligned=series.map(item=>({...item,bars:item.bars.filter(bar=>
    bar.time+(liquidityTimeframeMinutes[item.timeframe]||60)*60000<=asOf)}))
    .filter(item=>item.bars.length>=8);
  const allLevels=aligned.flatMap(({timeframe,bars,source})=>liquidityLevelsForTimeframe(timeframe,bars,settings)
    .map(level=>({...level,source,sourceCutoff:bars.at(-1)?.time+(liquidityTimeframeMinutes[timeframe]||60)*60000})));
  const levels=boundedLiquidityLevels(presentLiquidityLevels(allLevels));
  const displayTimeframes=new Set([String(chartTimeframe).toUpperCase(),'30M','1H']);
  const groups=liquidityConvergenceGroups(levels,chartTimeframe,settings,asOf)
    .filter(group=>group.members.some(level=>displayTimeframes.has(level.timeframe)) && group.joinTime<chartEndTime)
    .sort((a,b)=>a.anchor.price-b.anchor.price)
    .map((group,index)=>({...group,tag:`C${index+1}`}));
  const represented=new Set(groups.flatMap(group=>group.members));
  setLiquidityHoverGroups(groups,chartEndTime);
  for(const level of levels){
    if(!displayTimeframes.has(level.timeframe)) continue;
    if(represented.has(level)) continue;
    const swept=level.breakIndex>=0;
    if(swept&&settings.showSweeps===false) continue;
    const endIndex=swept?level.index+1+level.breakIndex:level.bars.length-1;
    const endTime=swept?level.bars[endIndex]?.time:chartEndTime;
    const anchored=level.timeframe==='30M'||level.timeframe==='1H';
    const width=anchored?2:1;
    const style=swept?'dashed':level.kind==='INT'?'dotted':'solid';
    toolDrawLine(owner,level.bars,level.index,level.price,liquidityLineColor(level,swept),'',style,width,endIndex,endTime);
  }
  const recent=chartBars.slice(-150);
  const visibleSpan=Math.max(...recent.map(bar=>bar.high))-Math.min(...recent.map(bar=>bar.low));
  const nearLabel=Math.max(visibleSpan*18/Math.max(180,$('.vela-chart-stage').clientHeight-100),
    ...groups.map(group=>group.tolerance*3));
  for(const [index,group] of groups.entries()){
    const anchor=group.anchor;
    // Before the last constituent confirms, show each original level only up
    // to that moment. The C line begins when the whole cluster was knowable.
    for(const level of group.members){
      if(!displayTimeframes.has(level.timeframe)||level.time>=group.joinTime) continue;
      toolDrawLine(owner,level.bars,level.index,level.price,liquidityLineColor(level,false),'',
        level.kind==='INT'?'dotted':'solid',1,level.bars.length-1,group.joinTime);
    }
    const color=group.contested?'#d8ae84':'#d8c5f0';
    addToolBeltDrawing('trendline',{paneId:'price',anchors:[{time:group.joinTime,price:anchor.price},{time:chartEndTime,price:anchor.price}],
      style:{lineColor:color,lineWidth:3,lineStyle:'solid'}},owner);
    const closeBelow=index>0&&anchor.price-groups[index-1].anchor.price<nearLabel;
    const closeAbove=index<groups.length-1&&groups[index+1].anchor.price-anchor.price<nearLabel;
    const labelTime=closeBelow?chartBars.at(-3)?.time||chartEndTime:chartEndTime;
    addToolBeltDrawing('text',{paneId:'price',anchors:[{time:labelTime,price:anchor.price}],
      text:{value:`${group.tag}${group.contested?'!':''}`,color,size:'small',hAlign:'right',vAlign:closeAbove?'bottom':closeBelow?'top':anchor.side==='HIGH'?'top':'bottom'},
      style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}},owner);
  }
}

function hideLiquidityPopup(force=false) {
  if(liquidityPopupPinned&&!force) return;
  const popup=$('#liquidityConvergencePopup');
  if(popup) popup.hidden=true;
}

function showLiquidityPopup(group,all=false) {
  const popup=$('#liquidityConvergencePopup');
  if(!popup) return;
  const rows=all?liquidityHoverGroups:[group];
  popup.innerHTML=`<p class="liquidity-c-id-note">C IDs run from lower to higher chart price. They are not strength ranks.</p>`+rows.map(item=>{
    const frames=item.timeframes.join(' + ');
    const side=item.anchor.side==='HIGH'?'BSL':'SSL';
    return `<section><strong>${escapeHtml(item.tag)}${item.contested?'!':''} · ${item.members.length} levels · ${escapeHtml(side)} · ${escapeHtml(frames)}</strong>
      <p>${formatPrice(item.low)}–${formatPrice(item.high)} · within ${formatPrice(item.tolerance)} of the anchor. ${item.contested?'Opposing active levels are nearby; read this as contested.':'Several confirmed levels meet here; predictive strength is unmeasured.'}</p>
      <ul>${item.members.map(level=>`<li><b>${escapeHtml(level.timeframe)} ${escapeHtml(level.kind)} ${level.side==='HIGH'?'BSL':'SSL'}</b> · ${formatPrice(level.price)}
        <small>${escapeHtml(level.id)} · pivot ${new Date(level.time).toLocaleString()} · confirmed after close ${new Date(level.confirmedTime).toLocaleString()} · ${escapeHtml(level.source||'chart source')} closed through ${new Date(level.sourceCutoff).toLocaleString()}</small></li>`).join('')}</ul>
      ${item.opposing.length?`<p>Opposing levels nearby: ${item.opposing.map(level=>`${escapeHtml(level.timeframe)} ${formatPrice(level.price)}`).join(', ')}</p>`:''}</section>`;
  }).join('');
  popup.hidden=false;
  const stage=$('.vela-chart-stage').getBoundingClientRect();
  const width=popup.offsetWidth,height=popup.offsetHeight;
  const rightLimit=Math.max(8,stage.width-width-8);
  popup.style.left=`${Math.max(Math.min(58,rightLimit),Math.min(rightLimit,liquidityPointer.x-stage.left+16))}px`;
  popup.style.top=`${Math.max(8,Math.min(stage.height-height-8,liquidityPointer.y-stage.top-22))}px`;
}

function setLiquidityHoverGroups(groups,chartEndTime) {
  liquidityHoverGroups=groups.map(group=>({...group,chartEndTime}));
  const summary=$('#liquidityConvergenceSummary');
  summary.hidden=!groups.length;
  summary.textContent=`${groups.length} C ${groups.length===1?'level':'levels'}`;
  liquidityPopupPinned=false;
  hideLiquidityPopup(true);
  if(liquidityHoverChart===velaChart) return;
  liquidityHoverUnsubscribe?.();
  liquidityHoverChart=velaChart;
  liquidityHoverUnsubscribe=velaChart?.renderer?.onCrosshairMove?.(event=>{
    if(!liquidityHoverGroups.length||event.paneKind==='study'||event.price==null||event.time==null){hideLiquidityPopup();return;}
    const nearest=liquidityHoverGroups.map(group=>({group,distance:Math.abs(event.price-group.anchor.price)}))
      .filter(row=>event.time>=row.group.joinTime && event.time<=row.group.chartEndTime
        && row.distance<=row.group.tolerance*0.25)
      .sort((a,b)=>a.distance-b.distance)[0];
    if(nearest) showLiquidityPopup(nearest.group);
    else hideLiquidityPopup();
  });
}

async function renderUniversalToolBeltIndicator(id) {
  if (!velaChart?.drawings?.supported || typeof velaChart.drawings.add !== 'function') throw new Error('This renderer cannot display chart drawings.');
  const definition=toolBeltIndicators.find(item=>item.id===id);
  if (!definition) throw new Error('Unknown indicator.');
  const {symbol,timeframe,source,bars}=await activeToolBeltBars();
  const owner=id, settings=effectiveToolBeltSettings(definition), last=bars.at(-1), first=bars[0];
  const pivots=confirmedPivots(bars,Math.max(2,Number(settings.pivotLength || settings.externalPivot || 4)));
  clearToolBeltDrawings(owner);
  if (id==='liquidity') {
    const algorithmVersion=selectedToolBeltVersion(definition);
    if(algorithmVersion==='000') { setLiquidityHoverGroups([],last.time); renderLiquidityVersion000(owner,timeframe,bars,settings); }
    else {
      const chartMinutes=liquidityTimeframeMinutes[String(timeframe).toUpperCase()]||60;
      const requiredTimeframes=new Set(['30M','1H',String(timeframe).toUpperCase()]);
      if(chartMinutes<=60) liquidityContextTimeframes.forEach(tf=>requiredTimeframes.add(tf));
      const requested=[...requiredTimeframes];
      const settled=await Promise.allSettled(requested.map(async tf=>({timeframe:tf,...await activeToolBeltBars(tf)})));
      const series=settled.filter(item=>item.status==='fulfilled').map(item=>item.value);
      const available=new Set(series.map(item=>item.timeframe));
      if(!available.has('30M')&&!available.has('1H')) throw new Error('Version 001 needs 30m or 1h source bars for its anchor levels; this chart provider did not return either timeframe.');
      renderLiquidityVersion001(owner,timeframe,bars,series,settings);
      const missing=requested.filter(tf=>!available.has(tf));
      const windowPct=(Number(settings.convergenceAtr)||0.1)*100;
      const asOf=new Date(last.time).toLocaleString();
      if(missing.length) $('#indicatorTemplateStatus').textContent=`Liquidity v001 active · ${symbol} ${timeframe} · ${source} bars · as of ${asOf} · unavailable timeframes: ${missing.join(', ')} · ${liquidityProbabilityReference} placeholder is unmeasured.`;
      else $('#indicatorTemplateStatus').textContent=`Liquidity v001 active · ${symbol} ${timeframe} · ${source} bars · as of ${asOf} · 30m / 1h anchors · ${windowPct.toFixed(0)}% ATR convergence window · ${liquidityProbabilityReference} unmeasured placeholder, not a lab result.`;
    }
  } else if (id==='bias') {
    const report=await premiumIndicatorReport(id,symbol,timeframe,source,bars,settings);
    renderBiasOverlay(report,settings,addToolBeltDrawing,Math.floor(last.time/1000));
    const point=report.points?.at(-1),direction=(settings.priorPeriod?report.overallBias:point?.bias)||'MIXED';
    $('#indicatorTemplateStatus').textContent=`Bias · ${direction} · ${symbol} ${timeframe} · ${source} · closed cutoff ${new Date(report.confirmedCutoff*1000).toLocaleString()} · ${report.contextUnavailable?.length?`context unavailable: ${report.contextUnavailable.join(', ')} · `:''}SHA-256 ${report.dataSnapshotHash||report.inputHash||'unavailable'} · descriptive, unscored.`;
  } else if (id==='structure-zones') {
    const report=await premiumIndicatorReport(id,symbol,timeframe,source,bars,settings);
    renderStructureZonesOverlay(report,settings,addToolBeltDrawing,Math.floor(last.time/1000));
    $('#indicatorTemplateStatus').textContent=`Structure Zones · ${report.structure||'NEUTRAL'} · ${symbol} ${timeframe} · ${source} · closed cutoff ${new Date(report.confirmedCutoff*1000).toLocaleString()} · ${report.itemCounts?.events||0} breaks / ${report.itemCounts?.zones||0} zones / ${report.itemCounts?.pools||0} pools · SHA-256 ${report.inputHash||'unavailable'} · descriptive, unscored.`;
  } else if (id==='fibonacci') {
    const tail=pivots.slice(-2), lo=tail.find(point=>point.side==='LOW'), hi=tail.find(point=>point.side==='HIGH');
    const low=Math.min(...bars.slice(-160).map(bar=>bar.low)), high=Math.max(...bars.slice(-160).map(bar=>bar.high));
    const range=hi&&lo&&hi.index!==lo.index?Math.abs(hi.price-lo.price):high-low, top=hi&&lo?(hi.index>lo.index?hi.price:lo.price):high, bottom=hi&&lo?(hi.index>lo.index?lo.price:hi.price):low;
    if (!(range>0)) throw new Error('Not enough price range to calculate retracements.');
    for(const level of String(settings.levels||'0.382, 0.5, 0.618').split(',').map(Number).filter(x=>x>0&&x<1)) toolDrawLine(owner,bars,Math.min(lo?.index??0,hi?.index??bars.length-1),bottom+range*level,'#e0bd72',`${(level*100).toFixed(1)}%`,'solid');
  } else if (id==='volume-profile') {
    const windowBars=bars.slice(-Math.min(Number(settings.lookback||160),bars.length)), bins=Math.max(8,Math.min(80,Number(settings.bins||32)));
    const low=Math.min(...windowBars.map(bar=>bar.low)),high=Math.max(...windowBars.map(bar=>bar.high)),step=(high-low)/bins;
    if (!(step>0)) throw new Error('Not enough price range for a volume profile.');
    const volumes=Array(bins).fill(0);
    for(const bar of windowBars){const bin=Math.max(0,Math.min(bins-1,Math.floor((bar.close-low)/step)));volumes[bin]+=bar.volume||1;}
    const peak=Math.max(...volumes),poc=volumes.indexOf(peak),start=windowBars[0].time,end=last.time;
    volumes.forEach((volume,index)=>{if(!volume)return;const width=(end-start)*.22*(volume/peak),x=Math.max(start,end-width);const color=index===poc?'#f1c75b':'#6f9ce0';addToolBeltDrawing('box',{paneId:'price',anchors:[{time:x,price:low+(index+1)*step},{time:end,price:low+index*step}],style:{lineColor:`${color}00`,lineWidth:1,lineStyle:'solid',fillColor:`${color}65`}},owner);});
    toolDrawLine(owner,bars,0,low+(poc+.5)*step,'#ffe082','POC','solid',2);
  } else if (id==='liquidity-zones') {
    const atr=averageTrueRange(bars),tolerance=atr*Number(settings.tolerance??.12),candidates=pivots.slice(-40),clusters=[];
    for(const point of candidates){let cluster=clusters.find(item=>Math.abs(item.price-point.price)<=Math.max(tolerance,atr*.025));if(!cluster)clusters.push(cluster={price:point.price,points:[]});cluster.points.push(point);cluster.price=cluster.points.reduce((sum,item)=>sum+item.price,0)/cluster.points.length;}
    for(const cluster of clusters.filter(item=>item.points.length>=2).slice(-12)){const start=cluster.points[0],half=Math.max(tolerance,atr*.025);addToolBeltDrawing('box',{paneId:'price',anchors:[{time:start.time,price:cluster.price+half},{time:last.time,price:cluster.price-half}],style:{lineColor:'#6ea5c8',lineWidth:1,lineStyle:'solid',fillColor:'#4b91ae30'}},owner);}
  } else if (id==='daily-bias') {
    const sessions=new Map();for(const bar of bars){const key=new Date(bar.time).toISOString().slice(0,10);const day=sessions.get(key)||{open:bar.open,close:bar.close,high:bar.high,low:bar.low,time:bar.time};day.close=bar.close;day.high=Math.max(day.high,bar.high);day.low=Math.min(day.low,bar.low);sessions.set(key,day);}
    const days=[...sessions.values()].slice(-Number(settings.lookback||20)),bull=days.filter(day=>day.close>day.open).length,bear=days.filter(day=>day.close<day.open).length,bias=bull>bear?'BULLISH':bear>bull?'BEARISH':'MIXED';
    const color=bias==='BULLISH'?'#089981':bias==='BEARISH'?'#f23645':'#aeb7c2';toolDrawLine(owner,bars,Math.max(0,bars.findIndex(bar=>bar.time>=days[0]?.time)),last.close,color,`DAILY BIAS · ${bias} · ${days.length} sessions`,'solid',2);
  } else if (id==='elliott-wave') {
    const turns=confirmedPivots(bars,Math.max(2,Number(settings.pivotLength||5))).slice(-8),labels=settings.alternates===false?['1','2','3','4','5','A','B','C']:['1','2','3','4','5','A','B','C'];
    turns.forEach((point,index)=>toolDrawLabel(owner,{...point,price:point.price},labels[index%labels.length],point.side==='HIGH'?'#f4bd63':'#75c9dc'));
  } else if (id==='confirmed-swings') {
    const turns=confirmedPivots(bars,Math.max(2,Number(settings.pivotLength||4))).slice(-24),previous={HIGH:null,LOW:null};
    for(const point of turns){const prior=previous[point.side];const label=prior==null?(point.side==='HIGH'?'H':'L'):point.side==='HIGH'?(point.price>prior?'HH':point.price<prior?'LH':'EH'):(point.price>prior?'HL':point.price<prior?'LL':'EL');previous[point.side]=point.price;toolDrawLabel(owner,point,label,point.side==='HIGH'?'#f23645':'#089981');}
  } else if (id==='confluence') {
    const windows=[5,20,50].filter(n=>bars.length>n),directions=windows.map(n=>bars.at(-1).close>=bars.at(-1-n).close?'UP':'DOWN'),up=directions.filter(item=>item==='UP').length,down=directions.length-up,bias=up===down?'MIXED':up>down?'BULLISH':'BEARISH',color=bias==='BULLISH'?'#089981':bias==='BEARISH'?'#f23645':'#aeb7c2';
    toolDrawLine(owner,bars,Math.max(0,bars.length-20),last.close,color,`CONFLUENCE · ${bias} · ${up}/${directions.length} lookbacks aligned`,'solid',2);
  } else if (id==='premium-discount') {
    const windowBars=bars.slice(-160),high=Math.max(...windowBars.map(bar=>bar.high)),low=Math.min(...windowBars.map(bar=>bar.low)),eq=low+(high-low)*Number(settings.equilibrium||50)/100,start=windowBars[0].time,end=last.time;
    if(!(high>low)||end<=start)throw new Error('Not enough confirmed range to map premium and discount.');
    addToolBeltDrawing('box',{paneId:'price',anchors:[{time:start,price:high},{time:end,price:eq}],style:{lineColor:'#ef6c6c55',lineWidth:1,lineStyle:'solid',fillColor:'#ef6c6c20'}},owner);
    addToolBeltDrawing('box',{paneId:'price',anchors:[{time:start,price:eq},{time:end,price:low}],style:{lineColor:'#4dbb9c55',lineWidth:1,lineStyle:'solid',fillColor:'#4dbb9c20'}},owner);
    toolDrawLine(owner,bars,0,eq,'#e6c879',`EQUILIBRIUM · ${settings.equilibrium||50}%`,'dashed');
  }
  const hasDrawings=(toolBeltDrawingIds[owner]||[]).length>0;
  if(!['bias','structure-zones'].includes(id) && !(id==='liquidity'&&selectedToolBeltVersion(definition)==='001')) $('#indicatorTemplateStatus').textContent=`${definition.name} ${id==='liquidity'?`v${selectedToolBeltVersion(definition)}`:''} active on ${symbol} ${timeframe} · ${bars.length} ${source} bars · last confirmed ${new Date(last.time).toLocaleString()} · ${hasDrawings?'OHLCV-derived descriptive overlay; no predictive claim.':'no qualifying structures in this window; settings are active.'}`;
}

async function renderToolBeltIndicator(id) {
  return renderUniversalToolBeltIndicator(id);
}

async function syncToolBeltOverlays() {
  clearToolBeltDrawings();
  setLiquidityHoverGroups([],0);
  toolBeltBarsCache = {key:'',at:0,bars:[]};
  const active=storedToolBeltActive();
  for(const id of active) {
    try { await renderToolBeltIndicator(id); }
    catch(error) { $('#indicatorTemplateStatus').textContent=`${toolBeltIndicators.find(item=>item.id===id)?.name || id} overlay unavailable: ${error.message}`; }
  }
}

function renderToolBeltIndicators() {
  const grid = $('#toolBeltIndicatorGrid');
  if (!grid) return;
  const active = storedToolBeltActive();
  grid.innerHTML = toolBeltIndicators.map(definition => {
    const enabled = active.has(definition.id);
    const version=selectedToolBeltVersion(definition);
    return `<article class="tool-belt-card${enabled ? ' is-active' : ''}" data-indicator-id="${definition.id}"><button class="tool-card-toggle" type="button" data-toggle-tool-belt="${definition.id}" aria-pressed="${enabled}" aria-label="${enabled ? 'Deactivate' : 'Activate'} ${definition.name}"><img src="./tool-belt-assets/${enabled ? definition.colorImage : definition.image}" alt=""><strong>${definition.name}</strong><small>${enabled ? 'ACTIVE · ' : ''}${definition.id==='liquidity'?`v${version}`:definition.version}</small></button><button class="tool-card-gear" type="button" data-open-tool-settings="${definition.id}" aria-label="Settings for ${definition.name}" title="Settings">⚙</button></article>`;
  }).join('');
  const nativeCount = presentNativeTypes().size;
  $('#toolBeltIndicatorSummary').textContent = `${active.size} active indicators · ${nativeCount} support studies on`;
}

function renderIndicatorTemplates() {
  const select = $('#indicatorTemplateSelect');
  if (!select) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(beltTemplatesStorageKey) || '[]');
    indicatorTemplates = Array.isArray(parsed) ? parsed.filter(item => item && typeof item.name === 'string' && item.state) : [];
  } catch { indicatorTemplates = []; }
  const previous = select.value;
  select.replaceChildren(new Option('Choose a saved template', ''), ...indicatorTemplates.map((item, index) => new Option(item.name, String(index))));
  if (indicatorTemplates[Number(previous)]) select.value = previous;
  $('#loadIndicatorTemplate').disabled = !select.value;
}

function currentToolBeltTemplate() {
  return {activeIndicators:[...storedToolBeltActive()],supportStudies:[...storedIndicatorTypes()],supportInputs:storedIndicatorInputs(),indicatorSettings:storedToolBeltSettings()};
}

function saveIndicatorTemplate() {
  const name = $('#indicatorTemplateName').value.trim();
  const status = $('#indicatorTemplateStatus');
  if (!name) { status.textContent = 'Enter a name before saving this template.'; $('#indicatorTemplateName').focus(); return; }
  const existing = indicatorTemplates.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  const item = {name, state:currentToolBeltTemplate(), savedAt:new Date().toISOString()};
  if (existing >= 0) indicatorTemplates[existing] = item; else indicatorTemplates.unshift(item);
  try { localStorage.setItem(beltTemplatesStorageKey, JSON.stringify(indicatorTemplates)); }
  catch { status.textContent = 'Could not save this template in browser storage.'; return; }
  renderIndicatorTemplates();
  $('#indicatorTemplateSelect').value = String(indicatorTemplates.indexOf(item));
  $('#loadIndicatorTemplate').disabled = false;
  status.textContent = `Saved “${name}” on this browser.`;
}

async function loadIndicatorTemplate() {
  const item = indicatorTemplates[Number($('#indicatorTemplateSelect').value)];
  if (!item) return;
  try {
    storeToolBeltActive(new Set((item.state.activeIndicators || []).filter(id => toolBeltIndicators.some(definition => definition.id === id))));
    saveIndicatorTypes(new Set((item.state.supportStudies || ['volume']).filter(id => indicatorDefinitions.some(definition => definition.type === id))));
    localStorage.setItem(indicatorInputStorageKey, JSON.stringify(item.state.supportInputs || {}));
    localStorage.setItem(beltSettingsStorageKey, JSON.stringify(item.state.indicatorSettings || {}));
    await applyStoredIndicators();
    $('#indicatorTemplateStatus').textContent = `Loaded “${item.name}”.`;
  } catch (error) { $('#indicatorTemplateStatus').textContent = `Template could not be loaded: ${error.message}`; }
}

async function restoreIndicatorDefaults() {
  storeToolBeltActive(new Set());
  localStorage.removeItem(beltSettingsStorageKey);
  saveIndicatorTypes(new Set(['volume']));
  localStorage.removeItem(indicatorInputStorageKey);
  indicatorInputMemory = {};
  await applyStoredIndicators();
  $('#indicatorTemplateStatus').textContent = 'Default restored · all Tool Belt cards off · Volume support study on · settings reset.';
}

function openIndicatorSettings(scope, id) {
  const dialog = $('#indicatorSettingsDialog');
  const definition = scope === 'toolbelt'
    ? toolBeltIndicators.find(item => item.id === id)
    : indicatorDefinitions.find(item => item.type === id);
  if (!definition) return;
  settingsTarget = {scope, id, definition};
  const rows = scope === 'toolbelt'
    ? definition.settings
    : Object.hasOwn(definition.inputs, 'length')
      ? [['length','Period','number',definition.inputs.length,2,5000]]
      : [];
  const current = scope === 'toolbelt' ? effectiveToolBeltSettings(definition) : indicatorInputs(definition);
  $('#indicatorSettingsKind').textContent = scope === 'toolbelt' ? 'INDICATOR SETTINGS' : 'TOOL SUPPORT SETTINGS';
  $('#indicatorSettingsTitle').textContent = definition.name || definition.label;
  const versionManager=scope==='toolbelt'&&definition.versions?.length
    ? `<fieldset class="indicator-version-manager"><legend>VERSION HISTORY</legend><div class="indicator-version-section-label">CURRENT · NEWEST FIRST</div>${definition.versions.filter(version=>version.state==='current').map(version=>`<label class="indicator-version-row current"><input type="radio" name="algorithmVersion" value="${version.id}" ${current.algorithmVersion===version.id?'checked':''}><span><strong>v${version.id} · ${escapeHtml(version.label.split('·').slice(1).join('·').trim())}</strong><small>${escapeHtml(version.summary)}</small></span><em>CURRENT</em></label>`).join('')}<div class="indicator-version-section-label archived">ARCHIVED VERSIONS</div>${definition.versions.filter(version=>version.state==='archived').map(version=>`<label class="indicator-version-row"><input type="radio" name="algorithmVersion" value="${version.id}" ${current.algorithmVersion===version.id?'checked':''}><span><strong>v${version.id} · ${escapeHtml(version.label.split('·').slice(1).join('·').trim())}</strong><small>${escapeHtml(version.summary)}</small></span><em>ARCHIVE</em></label>`).join('')}</fieldset>`
    : '';
  const settingsMarkup=rows.length ? rows.map(([key,label,type,defaultValue,min,max]) => {
    const value = current[key] ?? defaultValue;
    if (type === 'checkbox') return `<label>${label}<input type="checkbox" name="${key}" ${value ? 'checked' : ''}></label>`;
    if (type === 'select') return `<label>${label}<select name="${key}">${min.map(option => `<option ${String(option) === String(value) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
    const attrs = type === 'number' ? ` type="number" min="${min}" max="${max}" step="${Number.isInteger(defaultValue) ? '1' : '0.01'}"` : ' type="text"';
    return `<label>${label}<input name="${key}"${attrs} value="${escapeHtml(value)}"></label>`;
  }).join('') : '<p class="indicator-settings-empty">This support study has no editable inputs in the current chart renderer.</p>';
  $('#indicatorSettingsFields').innerHTML = `${versionManager}${settingsMarkup}`;
  $('#indicatorSettingsNote').textContent = scope === 'toolbelt'
    ? definition.id === 'liquidity'
      ? 'Settings are saved in this browser. Liquidity v001 needs 30m or 1h bars; its convergence marks are descriptive and unscored.'
      : 'Settings are saved in this browser. Confirmed chart overlays are descriptive and unscored.'
    : rows.length ? 'Period changes apply to the active native Vela study on the current chart.' : 'The study can be activated or removed; the renderer exposes no settings to change.';
  if (!dialog.open) dialog.showModal();
}

async function saveOpenIndicatorSettings() {
  if (!settingsTarget) return;
  const {scope,id,definition} = settingsTarget;
  const form = $('#indicatorSettingsForm');
  const values = Object.fromEntries(new FormData(form).entries());
  if (scope === 'toolbelt') {
    const settings = storedToolBeltSettings();
    if(definition.versions?.length&&!definition.versions.some(version=>version.id===values.algorithmVersion)){
      $('#indicatorSettingsNote').textContent='Select a listed indicator version.';
      return false;
    }
    for (const [key,,type,defaultValue] of definition.settings) {
      if (type === 'checkbox') values[key] = values[key] === 'on';
      else if (type === 'number') {
        values[key] = Number(values[key]);
        const [, , , , min, max] = definition.settings.find(field => field[0] === key);
        if (!Number.isFinite(values[key]) || values[key] < min || values[key] > max ||
            (Number.isInteger(defaultValue) && !Number.isInteger(values[key]))) {
          $('#indicatorSettingsNote').textContent = `${key} must be between ${min} and ${max}.`;
          return false;
        }
      } else if (type === 'text' && !String(values[key] || '').trim()) {
        $('#indicatorSettingsNote').textContent = `${key} cannot be empty.`;
        return false;
      }
      if (!(key in values)) values[key] = defaultValue;
    }
    settings[id] = values;
    localStorage.setItem(beltSettingsStorageKey, JSON.stringify(settings));
    window.dispatchEvent(new Event('countdesk:chart-context'));
    renderToolBeltIndicators();
    if (storedToolBeltActive().has(id)) {
      try { await renderToolBeltIndicator(id); }
      catch (error) {
        clearToolBeltDrawings(id);
        $('#indicatorSettingsNote').textContent = `${definition.name} saved, but the chart overlay is unavailable: ${error.message}`;
        return false;
      }
    }
    else $('#indicatorTemplateStatus').textContent = `${definition.name} settings saved in this browser.`;
    return true;
  }
  if (Object.hasOwn(definition.inputs, 'length')) {
    const length = Number(values.length);
    if (!Number.isInteger(length) || length < 2 || length > 5000) {
      $('#indicatorSettingsNote').textContent = 'Enter a whole-number period from 2 to 5000.';
      return false;
    }
    saveIndicatorInput(id, length);
    await applyStoredIndicators();
  }
  return true;
}

async function resetOpenIndicatorSettings() {
  if (!settingsTarget) return;
  const {scope,id,definition} = settingsTarget;
  if (scope === 'toolbelt') {
    const settings = storedToolBeltSettings();
    delete settings[id];
    localStorage.setItem(beltSettingsStorageKey, JSON.stringify(settings));
    window.dispatchEvent(new Event('countdesk:chart-context'));
    openIndicatorSettings(scope,id);
    renderToolBeltIndicators();
    $('#indicatorTemplateStatus').textContent = `${definition.name} settings restored to default.`;
    return;
  }
  const values = storedIndicatorInputs();
  delete values[id];
  localStorage.setItem(indicatorInputStorageKey, JSON.stringify(values));
  window.dispatchEvent(new Event('countdesk:chart-context'));
  indicatorInputMemory = values;
  await applyStoredIndicators();
  openIndicatorSettings(scope,id);
}

function storedIndicatorTypes() {
  try {
    const raw = typeof localStorage === 'undefined' ? JSON.stringify(indicatorTypeMemory) : localStorage.getItem(indicatorStorageKey) || '["volume"]';
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(item => indicatorDefinitions.some(def => def.type === item)) : ['volume']);
  } catch {
    return new Set(['volume']);
  }
}

function saveIndicatorTypes(types) {
  indicatorTypeMemory = [...types];
  try { localStorage.setItem(indicatorStorageKey, JSON.stringify(indicatorTypeMemory)); } catch { /* local preview storage can be unavailable */ }
  window.dispatchEvent(new Event('countdesk:chart-context'));
}

function storedIndicatorInputs() {
  try {
    const raw = typeof localStorage === 'undefined' ? JSON.stringify(indicatorInputMemory) : localStorage.getItem(indicatorInputStorageKey) || '{}';
    const parsed = JSON.parse(raw);
    return Object.fromEntries(Object.entries(parsed).filter(([type, value]) => indicatorDefinitions.some(def => def.type === type) && Number.isInteger(Number(value?.length)) && Number(value.length) >= 2 && Number(value.length) <= 5000).map(([type, value]) => [type, {length:Number(value.length)}]));
  } catch {
    return {};
  }
}

function indicatorInputs(def) {
  return {...def.inputs, ...(storedIndicatorInputs()[def.type] || {})};
}

function indicatorDisplayLabel(def) {
  const length = indicatorInputs(def).length;
  return length ? `${def.label} ${length}` : def.label;
}

function saveIndicatorInput(type, length) {
  const values = storedIndicatorInputs();
  values[type] = {length};
  indicatorInputMemory = values;
  try { localStorage.setItem(indicatorInputStorageKey, JSON.stringify(values)); } catch { /* local preview storage can be unavailable */ }
  window.dispatchEvent(new Event('countdesk:chart-context'));
}

function presentNativeTypes() {
  return new Set(typeof velaChart?.presentNativeIndicators === 'function' ? velaChart.presentNativeIndicators() : []);
}

function renderChartLegend(context = currentContract?.market || window.countDeskVelaContext) {
  const legend = $('#velaChartLegend');
  if (!legend) return;
  if (!context?.symbol || !context?.timeframe) {
    legend.innerHTML = '<span class="vela-chart-legend-market">Waiting for chart</span>';
    return;
  }
  const colors = {volume:'#74c6a5',rsi:'#b78cff',sma:'#f2c14e',ema:'#54c9de',atr:'#ff8b72',vpvr:'#77a8ff',liquidity:'#f3b95f',bias:'#b78cff','volume-profile':'#77a8ff',fibonacci:'#e0bd72','liquidity-zones':'#6ea5c8','daily-bias':'#089981','elliott-wave':'#f4bd63','confirmed-swings':'#f23645',confluence:'#b78cff','premium-discount':'#4dbb9c'};
  const present = presentNativeTypes();
  const active = indicatorDefinitions.filter(def => present.has(def.type)).map(def => ({name:indicatorDisplayLabel(def), color:colors[def.type] || '#aebdc5'}));
  const beltActive = storedToolBeltActive();
  for(const id of beltActive) if((toolBeltDrawingIds[id]||[]).length) active.push({name:toolBeltIndicators.find(item=>item.id===id)?.name||id,color:colors[id]||'#aebdc5'});
  const studies = active.length
    ? active.map(item => `<span class="vela-chart-study"><i style="--study-color:${item.color}" aria-hidden="true"></i>${escapeHtml(item.name)}</span>`).join('')
    : '<span class="vela-chart-no-studies">No indicators loaded</span>';
  legend.innerHTML = `<div class="vela-chart-legend-market"><strong>${escapeHtml(context.symbol)}</strong><span>${escapeHtml(context.timeframe)}</span></div><div class="vela-chart-legend-studies" aria-label="Active chart indicators">${studies}</div>`;
}

function activeIndicatorLabels() {
  const present = presentNativeTypes();
  const selected = present.size ? present : storedIndicatorTypes();
  const labels = indicatorDefinitions.filter(def => selected.has(def.type)).map(indicatorDisplayLabel);
  return labels.length ? labels.join(', ') : 'None selected';
}

function renderIndicatorContext(contract = currentContract) {
  renderChartLegend(window.countDeskVelaContext || contract?.market);
  const labels = activeIndicatorLabels();
  $('#cleoIndicators').textContent = labels;
  $('#velaPaperIndicators').textContent = `Studies · ${labels}`;
  window.dispatchEvent(new Event('countdesk:chart-context'));
  if (!contract) return;
  const cutoff = formatCutoff(contract);
  const prompt = `Read this Vela chart with Cleo. The active native studies are ${labels}. The stored-bar cutoff is ${cutoff}. Keep the structural read provisional and give me the preferred path, alternate path, invalidation, and the confirmation that would make a paper setup eligible.`;
  $('#velaAskCleo').href = `./?symbol=${encodeURIComponent(contract.market.symbol)}&timeframe=${encodeURIComponent(contract.market.timeframe)}&cutoff=${encodeURIComponent(contract.market.cutoff || '')}&cleoPrompt=${encodeURIComponent(prompt)}`;
}

async function renderIndicatorRegistry() {
  const list = $('#velaIndicatorList');
  if (!velaChart || typeof velaChart.availableNativeIndicators !== 'function') {
    list.textContent = 'Native indicator registry is unavailable in this renderer build.';
    renderToolBeltIndicators();
    return;
  }
  const available = await velaChart.availableNativeIndicators();
  const details = new Map((available || []).map(item => [item.type, item]));
  const present = presentNativeTypes();
  list.innerHTML = indicatorDefinitions.map(def => {
    const item = details.get(def.type);
    const supported = item?.supported !== false;
    const active = present.has(def.type);
    const state = !supported ? 'UNAVAILABLE' : active ? 'ON' : 'OFF';
    const hasSettings = Object.hasOwn(def.inputs,'length');
    return `<div class="vela-indicator-row ${active ? 'active' : ''}"><button type="button" class="native-study-toggle" data-vela-indicator="${def.type}" ${supported ? '' : 'disabled'} aria-pressed="${active}"><span><b>${indicatorDisplayLabel(def)}</b><small>${def.note}</small></span><strong>${state}</strong></button><button type="button" class="native-study-gear" data-open-native-settings="${def.type}" aria-label="Settings for ${def.label}" title="Settings" ${supported ? '' : 'disabled'}>⚙</button></div>`;
  }).join('');
  renderToolBeltIndicators();
  renderIndicatorContext();
}

async function applyStoredIndicators() {
  if (!velaChart || typeof velaChart.addNativeIndicator !== 'function') return;
  const desired = storedIndicatorTypes();
  const present = presentNativeTypes();
  const handles = velaChart.indicators?.() || [];
  for (const handle of handles) {
    if (handle.nativeType && !desired.has(handle.nativeType)) handle.remove();
  }
  for (const def of indicatorDefinitions) {
    if (!desired.has(def.type)) continue;
    const existing = handles.find(handle => handle.nativeType === def.type);
    if (existing) {
      existing.setInputs?.(indicatorInputs(def));
      continue;
    }
    const handle = velaChart.addNativeIndicator(def.type, {inputs:indicatorInputs(def)});
    handle?.on?.('error', event => setStatus(`${def.label} unavailable: ${event.error?.message || 'indicator error'}`, true));
  }
  await renderIndicatorRegistry();
  await syncToolBeltOverlays();
  renderChartLegend();
}

async function toggleIndicator(type) {
  const desired = storedIndicatorTypes();
  if (desired.has(type)) desired.delete(type); else desired.add(type);
  saveIndicatorTypes(desired);
  await applyStoredIndicators();
}

function renderCleoBriefing(contract) {
  const preferred = contract.overlays.projections.find(item => item.id === 'preferred');
  const alternate = contract.overlays.projections.find(item => item.id === 'alternate');
  const status = contract.analysis.status || 'PROVISIONAL';
  $('#cleoReadStatus').textContent = status.replaceAll('_', ' ');
  $('#cleoPreferred').textContent = preferred ? `${preferred.bias} · ${preferred.status}` : 'Unavailable';
  $('#cleoAlternate').textContent = alternate ? `${alternate.bias} · ${alternate.status}` : 'Unavailable';
  $('#cleoLastClose').textContent = formatPrice(contract.analysis.lastClose);
  $('#cleoCountNodes').textContent = String(contract.analysis.countNodes);
  $('#cleoWarning').textContent = `${contract.analysis.warning} Source: ${contract.analysis.source}. Snapshot ${contract.analysis.snapshot.slice(0, 12)}…`;
  renderIndicatorContext(contract);
}

function tickstreamTicker(symbol) {
  const match = String(symbol || '').toUpperCase().match(/^TICKSTREAM:(NQ|MYM)$/);
  return match?.[1] || '';
}

function selectedTickstreamProbeTicker() {
  const selected = selectedMarket();
  return tickstreamTicker(selected?.symbol)
    || (String(selected?.symbol || '').toUpperCase().includes('MYM') ? 'MYM' : '');
}

function renderTickstreamReadiness(source) {
  const status = source?.state || source?.status || 'unknown';
  const labels = {
    not_connected: ['KEY NEEDED', 'Add the server key to count-dashboard/.env, then restart Count Desk.'],
    connecting: ['CONNECTING · NQ + MYM', 'Opening the server-side streams and loading recent ticks.'],
    connected: [`CONNECTED · ${(source?.symbols || []).join(' + ') || 'NQ + MYM'}`, `${source?.historyState === 'complete' ? 'Seven-day history loaded' : source?.historyState === 'loading' ? 'Seven-day history loading' : source?.historyState?.startsWith('error:') ? 'History backfill stopped; recent stream remains active' : source?.historyState === 'capped' ? 'History backfill reached its request cap' : 'Recent history'}; one-minute stream bars stay in memory.`],
    error: ['STREAM ERROR', source?.message || 'Tickstream connection needs attention.'],
  };
  const [label, note] = labels[status] || ['UNAVAILABLE', 'Tickstream readiness is not confirmed.'];
  $('#velaTickstreamReadiness').textContent = label;
  $('#velaTickstreamReadinessMeta').textContent = note;
  $('#velaTickstreamReadiness').dataset.state = status;
  $('#velaTickstreamProbe').disabled = status === 'not_connected' || !selectedTickstreamProbeTicker();
  $('#velaTickstreamStatus').textContent = source?.message || note;
}

async function refreshTickstreamReadiness() {
  try { renderTickstreamReadiness(await getJson('/api/tickstream/status')); }
  catch (error) { renderTickstreamReadiness({state:'error', message:error.message}); }
}

async function applySavedPlatformSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (['hyperliquid','binance','coinbase','historical'].includes(settings.provider)) {
    $('#velaDefaultProvider').value = settings.provider;
    try { localStorage.setItem(defaultDataProviderStorageKey, settings.provider); } catch {}
  }
  const provider = settings.provider || $('#velaDefaultProvider').value;
  setTimeframeOptions(provider === 'tickstream' ? 'tickstream' : chartProviderSpecs[provider] ? 'provider' : 'historical');
  if (typeof settings.symbol === 'string' && [...$('#velaSymbol').options].some(option => option.value === settings.symbol)) {
    $('#velaSymbol').value = settings.symbol;
  }
  if (typeof settings.timeframe === 'string' && [...$('#velaTimeframe').options].some(option => option.value === settings.timeframe)) {
    $('#velaTimeframe').value = settings.timeframe;
  }
  storeToolBeltActive(new Set((settings.activeIndicators || []).filter(id => toolBeltIndicators.some(def => def.id === id))));
  saveIndicatorTypes(new Set((settings.supportStudies || ['volume']).filter(id => indicatorDefinitions.some(def => def.type === id))));
  try {
    localStorage.setItem(indicatorInputStorageKey, JSON.stringify(settings.supportInputs || {}));
    localStorage.setItem(beltSettingsStorageKey, JSON.stringify(settings.indicatorSettings || {}));
  } catch { /* Existing study state remains usable for this session. */ }
  indicatorInputMemory = settings.supportInputs || {};
  renderToolBeltIndicators();
  await applyStoredIndicators();
}

function renderConnectionManager() {
  const summary = $('#velaConnectionSummary');
  for (const [id, spec] of Object.entries(chartProviderSpecs)) {
    const card = document.querySelector(`[data-provider-card="${id}"]`);
    if (!card) continue;
    const active = activeChartConnection?.id === id;
    const connecting = pendingChartConnection?.id === id;
    card.dataset.state = active ? 'active' : connecting ? 'connecting' : 'inactive';
    const status = card.querySelector('[data-provider-status]');
    if (status) status.textContent = active
      ? `ACTIVE · ${activeChartConnection.symbol}`
      : connecting ? 'CONNECTING' : 'INACTIVE';
    const connect = card.querySelector('[data-connect-provider]');
    if (connect) { connect.textContent = active ? 'Reconnect' : 'Connect'; connect.disabled = connecting; }
  }
  const amp = document.querySelector('[data-provider-card="amp"]');
  if (amp) amp.querySelector('[data-provider-status]').textContent = 'NOT ONBOARDED';
  const robinhood = document.querySelector('[data-provider-card="robinhood"]');
  if (robinhood) robinhood.querySelector('[data-provider-status]').textContent = 'PLANNED';
  if (summary) {
    summary.textContent = activeChartConnection
      ? `${activeChartConnection.label} active · ${activeChartConnection.symbol} · ${activeChartConnection.timeframe} · connected ${new Date(activeChartConnection.connectedAt).toLocaleTimeString()}`
      : pendingChartConnection ? `Connecting to ${pendingChartConnection.label}…`
        : 'No direct provider connection active · historical Count Desk bars remain available.';
  }
  setConnectionButtonState(pendingChartConnection ? 'connecting' : activeChartConnection ? 'connected' : 'disconnected', {
    feed:{message:activeChartConnection ? `${activeChartConnection.label} ${activeChartConnection.symbol}` : ''},
  });
}

function disposeActiveChartConnection() {
  clearInterval(window.countDeskTickstreamStatusTimer);
  offLiveChartBar?.(); offLiveChartBar = null; liveChartBar = null;
  paperChartPlanner.setChart(null, null);
  if (velaChart) { try { velaChart.destroy?.(); } catch {} velaChart = null; }
  $('#velaChart').replaceChildren();
  currentContract = null;
  toolBeltDrawingIds = {};
  toolBeltBarsCache = {key:'', at:0, bars:[]};
  activeChartConnection = null;
  pendingChartConnection = null;
}

function watchLiveChartBar(chart, context) {
  offLiveChartBar?.();
  liveChartBar = null;
  if (!chart?.on) return;
  offLiveChartBar = chart.on('bar', bar => {
    if (![bar?.open,bar?.high,bar?.low,bar?.close,bar?.time].every(value => Number.isFinite(Number(value)))) return;
    liveChartBar = {bar:{...bar},symbol:context.symbol,timeframe:context.timeframe,source:context.source,cutoff:context.cutoff || null};
    modularWorkspace?.renderLadder();
  });
}

function addProviderMarketOption(spec, symbol, ticker) {
  const select = $('#velaSymbol');
  let option = [...select.options].find(item => item.value === symbol);
  if (!option) {
    option = document.createElement('option');
    option.value = symbol;
    select.append(option);
  }
  option.dataset.directProvider = spec.id;
  option.textContent = `${spec.label} · ${ticker}`;
  select.value = symbol;
}

async function refreshProviderCatalog(id) {
  const spec = chartProviderSpecs[id];
  const Provider = window.Vela?.[spec?.className];
  if (!Provider) return;
  const provider = new Provider();
  const symbols = await provider.listSymbols();
  if (!Array.isArray(symbols)) return;
  providerCatalogs.set(id, symbols.map(item => {
    const ticker = String(item.ticker || '').trim();
    if (!ticker) return null;
    const symbol = `${spec.prefix}:${ticker}`;
    return {symbol, providerId:id, ticker, directProvider:id,
      label:`${spec.label} · ${ticker}${item.description ? ` · ${item.description}` : ''}`};
  }).filter(Boolean));
  catalog = catalog.filter(item => !item.providerId).concat(...providerCatalogs.values());
  if (activeChartConnection?.id === id && !catalog.some(item => item.symbol === activeChartConnection.symbol)) {
    const ticker = activeChartConnection.symbol.slice(`${spec.prefix}:`.length);
    catalog.push({symbol:activeChartConnection.symbol,providerId:id,ticker,directProvider:id,
      label:`${spec.label} · ${ticker}`});
  }
  fillSymbols();
  modularWorkspace?.renderWatchlist();
}

function createRegisteredProviderChart(spec, symbol, timeframe) {
  if (!window.Vela?.Vela || !window.Vela?.[spec.className]) throw new Error('The Vela chart or bundled provider is unavailable. Refresh the page and try again.');
  const velaTimeframe = providerTimeframe(timeframe);
  velaChart = new window.Vela.Vela('#velaChart', {
    symbol, timeframe:velaTimeframe, bars:500, live:true, theme:'dark', drawings:true,
    volume:false, currentPriceLine:true, timeScale:{timezone:'America/Los_Angeles'},
    nativeBackend:'canvas2d', animations:{intro:false},
  });
  window.countDeskVelaChart = velaChart;
  velaChart.data.registerProvider(spec.id, new window.Vela[spec.className]());
  watchLiveChartBar(velaChart,{symbol,timeframe,source:spec.label,cutoff:null});
  return velaChart;
}

function confirmConnectionSwitch(next, current) {
  const dialog = $('#velaConnectionSwitchDialog');
  if (!dialog?.showModal) return Promise.resolve(window.confirm(`Current connection: ${current.label} · ACTIVE · ${current.symbol} (${current.timeframe}).\n\nProceed to disconnect it and connect ${next.label} · ${next.symbol}?`));
  $('#velaConnectionSwitchMessage').textContent = `Current connection: ${current.label} · ACTIVE · ${current.symbol} (${current.timeframe}). Proceeding will disconnect this chart source before connecting ${next.label} · ${next.symbol}.`;
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once:true});
  });
}

async function connectChartProvider(id, chosenTicker = '') {
  if (pendingChartConnection) return;
  setWorkspace('chart');
  modularWorkspace?.ensureChart();
  const spec = chartProviderSpecs[id];
  if (!spec) return;
  const field = document.querySelector(`[data-market-for="${id}"]`);
  let ticker = String(chosenTicker || field?.value || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9/_-]+$/.test(ticker)) {
    setStatus('Enter a valid provider market symbol.', true);
    field?.focus();
    return;
  }
  const symbol = `${spec.prefix}:${ticker}`;
  setTimeframeOptions('provider');
  const timeframe = $('#velaTimeframe').value;
  const next = {id, label:spec.label, symbol, timeframe};
  if (activeChartConnection && activeChartConnection.id !== id) {
    pendingChartConnection = next;
    renderConnectionManager();
    const accepted = await confirmConnectionSwitch(next, activeChartConnection);
    if (!accepted) {
      pendingChartConnection = null;
      setTimeframeOptions(activeChartConnection.id === 'tickstream' ? 'tickstream' : 'provider');
      renderConnectionManager();
      return;
    }
  }
  pendingChartConnection = next;
  activeChartConnection = null;
  renderConnectionManager();
  setStatus(`Connecting ${spec.label} ${symbol} · ${timeframe}…`);
  try {
    disposeActiveChartConnection();
    pendingChartConnection = next;
    addProviderMarketOption({...spec,id}, symbol, ticker);
    $('#velaTimeframe').value = timeframe;
    $('#cleoBriefing').hidden = true;
    $('#velaPaperTab').disabled = true;
    $('#velaPaperMarket').textContent = `${symbol} · ${timeframe} · ${spec.label}`;
    $('#velaPaperSource').textContent = 'Paper simulation is disabled for direct public provider data.';
    window.countDeskVelaContext = {tab:spec.label, symbol, timeframe, cutoff:null};
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const chart = createRegisteredProviderChart({...spec,id}, symbol, timeframe);
    await chart.ready();
    await new Promise(resolve => requestAnimationFrame(resolve));
    chart.resize();
    applyScreenPaintToChart();
    activeChartConnection = {...next, connectedAt:Date.now()};
    pendingChartConnection = null;
    renderConnectionManager();
    let catalogError = '';
    try {
      await refreshProviderCatalog(id);
      modularWorkspace?.addToWatchlist(symbol);
    } catch (error) {
      catalogError = ` Asset list unavailable: ${error.message}`;
    }
    await applyStoredIndicators();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    chart.resize();
    $('#velaProvenance').textContent = `${spec.label} public market data · ${symbol} · ${timeframe} · provider connection active; timestamps and history limits follow provider API.`;
    renderChartLegend(window.countDeskVelaContext);
    renderConnectionManager();
    setStatus(`${spec.label} ${symbol} chart active · public market data · no brokerage account connected.${catalogError}`, Boolean(catalogError));
  } catch (error) {
    disposeActiveChartConnection();
    $('#velaPaperTab').disabled = false;
    renderConnectionManager();
    setStatus(`${spec.label} connection failed: ${error.message}`, true);
  }
}

function tickstreamLag(sourceTime) {
  const parsed = Date.parse(sourceTime || '');
  if (!Number.isFinite(parsed)) return 'waiting for source time';
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  return `observed source lag about ${minutes}m`;
}

async function refreshFeedState(market, timeframe) {
  try {
    const [status, sources] = await Promise.all([
      getJson(`/api/feed/status?symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(timeframe)}`),
      getJson(`/api/feed/sources?symbol=${encodeURIComponent(market.symbol)}`),
    ]);
    const tickstream = (sources.sources || []).find(item => item.id === 'tickstream');
    const tickstreamState = await getJson('/api/tickstream/status');
    renderTickstreamReadiness(tickstreamState);
    const ticker = tickstreamTicker(market.symbol);
    const sourceTime = ticker
      ? tickstreamState.lastSourceTimeBySymbol?.[ticker]
      : tickstreamState.lastSourceTime;
    const feedState = $('#velaFeedState');
    const feedMeta = $('#velaFeedMeta');
    if (ticker) {
      if (feedState) feedState.textContent = `Tickstream ${ticker} · DELAYED`;
      if (feedMeta) feedMeta.textContent = `${tickstreamState.message || tickstream?.status || 'Tickstream status available.'} · ${tickstreamLag(sourceTime)} · source ${sourceTime || 'waiting'} · memory-only bars.`;
    } else {
      if (feedState) feedState.textContent = `${status.provider || 'Historical source'} · ${status.mode || 'UNKNOWN'}`;
      if (feedMeta) feedMeta.textContent = `${status.message || 'Source status available.'} Tickstream: ${tickstream?.status || 'unknown'}.`;
    }
    const tickstreamConnected = Boolean(ticker)
      && tickstreamState.state === 'connected'
      && tickstreamState.symbols?.includes(ticker);
    const connected = ticker ? tickstreamConnected : status.status === 'receiving';
    const connecting = ticker
      ? tickstreamState.state === 'connecting'
      : status.status === 'connecting';
    if (activeChartConnection) renderConnectionManager();
    else setConnectionButtonState(connecting ? 'connecting' : connected ? 'connected' : 'disconnected', {feed:status, tickstream:tickstreamState, sources:sources.sources || []});
  } catch (error) {
    const feedState = $('#velaFeedState');
    const feedMeta = $('#velaFeedMeta');
    if (feedState) feedState.textContent = 'Source status unavailable';
    if (feedMeta) feedMeta.textContent = error.message;
    renderTickstreamReadiness({status:'unknown'});
    if (activeChartConnection) renderConnectionManager();
    else setConnectionButtonState('disconnected', {error: error.message});
  }
}

function setConnectionButtonState(state, details = {}) {
  const button = $('#velaConnectionsButton');
  if (!button) return;
  const labels = {
    connected: ['Connected', 'At least one active data connection is receiving data.'],
    connecting: ['Connecting', 'A data connection is still trying to connect.'],
    disconnected: ['Disconnected', 'No active data connection is confirmed.'],
  };
  const [label, summary] = labels[state] || labels.disconnected;
  button.classList.remove('is-checking', 'is-connected', 'is-connecting', 'is-disconnected');
  button.classList.add(`is-${state}`);
  button.setAttribute('aria-label', `Connections status: ${label.toLowerCase()}`);
  const evidence = details.error || details.tickstream?.message || details.feed?.message || '';
  button.title = evidence ? `${summary} ${evidence}` : summary;
}

async function probeTickstream() {
  const ticker = selectedTickstreamProbeTicker();
  const status = $('#velaTickstreamStatus');
  const button = $('#velaTickstreamProbe');
  if (!ticker) {
    status.textContent = 'This asset has no Tickstream pilot mapping.';
    return;
  }
  button.disabled = true;
  try {
    const state = await getJson('/api/tickstream/status');
    renderTickstreamReadiness(state);
    $('#velaSymbol').value = `TICKSTREAM:${ticker}`;
    setTimeframeOptions('tickstream');
    $('#velaTimeframe').value = '1M';
    await loadTickstreamChart();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function tickstreamDataFeed(ticker, timeframe) {
  const getBars = async () => {
    const payload = await getJson(`/api/tickstream/bars?symbol=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}`);
    window.countDeskTickstreamHistoryState = payload.historyState;
    return payload.bars || [];
  };
  return {
    async load() {
      const bars = await getBars();
      if (!bars.length) throw new Error(`Tickstream is connected but no ${ticker} chart ticks have arrived yet.`);
      return bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
    },
    subscribe(_market, onBar) {
      let stopped = false;
      let signature = '';
      const poll = async () => {
        if (stopped) return;
        try {
          const bar = (await getBars()).at(-1);
          if (!bar) return;
          const next = `${bar.time}:${bar.open}:${bar.high}:${bar.low}:${bar.close}:${bar.volume}`;
          if (next !== signature) {
            signature = next;
            onBar({...bar, time:Number(bar.time) * 1000});
          }
        } catch { /* Tickstream reconnect is managed by the server-side SDK. */ }
      };
      void poll();
      const timer = setInterval(poll, 1200);
      return () => { stopped = true; clearInterval(timer); };
    },
  };
}

async function waitForTickstreamBars(ticker, timeframe, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  let chartPayload;
  while (Date.now() < deadline) {
    [state, chartPayload] = await Promise.all([
      getJson('/api/tickstream/status'),
      getJson(`/api/tickstream/bars?symbol=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}`),
    ]);
    renderTickstreamReadiness(state);
    if (!state.configured && state.state === 'not_connected') {
      throw new Error('Set the server-side Tickstream key in count-dashboard/.env, then restart Count Desk.');
    }
    if (state.state === 'error' || chartPayload.state === 'error') {
      throw new Error(state.message || chartPayload.message || 'Tickstream connection failed.');
    }
    if (chartPayload.bars?.length) return {state, chartPayload};
    setStatus(`${state.message || 'Connecting to Tickstream…'} Waiting for the first ${ticker} chart bars.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(state?.message || `Tickstream connected, but no ${ticker} chart bars arrived within 35 seconds.`);
}

async function loadTickstreamChart() {
  paperChartPlanner.setChart(null, null);
  const button = $('#velaTickstreamProbe');
  const ticker = tickstreamTicker($('#velaSymbol').value);
  const timeframe = $('#velaTimeframe').value;
  const velaTimeframe = providerTimeframe(timeframe);
  button.disabled = true;
  try {
    let {state, chartPayload} = await waitForTickstreamBars(ticker, timeframe);
    setStatus(`Tickstream ${ticker} connected · seven-day history ${state.historyState || 'loading'} · loading recent candles…`);
    let data = chartPayload.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
    let fullHistoryLoaded = chartPayload.historyState === 'complete';
    if (velaChart) { try { velaChart.destroy?.(); } catch {} velaChart = null; }
    $('#velaChart').replaceChildren();
    $('#cleoBriefing').hidden = true;
    const feed = tickstreamDataFeed(ticker, timeframe);
    velaChart = new window.Vela.Vela('#velaChart', {
      symbol:ticker, timeframe:velaTimeframe, bars:10080, data, live:true,
      theme:'dark', drawings:true, volume:false, currentPriceLine:true,
      timeScale:{timezone:'America/Los_Angeles'},
      nativeBackend:'canvas2d', animations:{intro:false},
    }, {dataFeed:feed});
    window.countDeskVelaChart = velaChart;
    await velaChart.ready();
    await new Promise(resolve => requestAnimationFrame(resolve));
    velaChart.resize();
    applyScreenPaintToChart();
    const sourceTime = chartPayload.lastSourceTime || state.lastSourceTimeBySymbol?.[ticker] || state.lastSourceTime;
    window.countDeskVelaContext = {tab:'Tickstream', symbol:ticker, timeframe, cutoff:sourceTime ? Math.floor(Date.parse(sourceTime) / 1000) : null};
    watchLiveChartBar(velaChart,{symbol:ticker,timeframe,source:'Tickstream delayed stream',cutoff:window.countDeskVelaContext.cutoff});
    activeChartConnection = {id:'tickstream', label:'Tickstream server stream', symbol:ticker, timeframe, connectedAt:Date.now()};
    pendingChartConnection = null;
    renderConnectionManager();
    await applyStoredIndicators();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    velaChart.resize();
    applyReadableCandleViewport(velaChart);
    $('#velaPaperTab').disabled = true;
    $('#velaPaperMarket').textContent = `${ticker} · ${timeframe} · Tickstream`;
    $('#velaPaperSource').textContent = `Paper simulation is disabled for the streamed ${ticker} instrument.`;
    renderChartLegend(window.countDeskVelaContext);
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const updateState = async () => {
      if (tickstreamTicker($('#velaSymbol').value) !== ticker) return;
      try {
        const latest = await getJson('/api/tickstream/status');
        renderTickstreamReadiness(latest);
        if (latest.historyState === 'complete' && !fullHistoryLoaded && velaChart) {
          const complete = await getJson(`/api/tickstream/bars?symbol=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}`);
          data = complete.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
          await velaChart.setMarket({symbol:ticker, timeframe:velaTimeframe, bars:10080, data});
          await applyStoredIndicators();
          fullHistoryLoaded = true;
        }
        const time = latest.lastSourceTimeBySymbol?.[ticker] || latest.lastSourceTime;
        $('#velaProvenance').textContent = `Tickstream ${ticker} · ${timeframe} bars · up-to-7-day history ${latest.historyState || 'loading'} · ${data.length} candles · ${latest.receivedTicks || 0} ticks received across subscribed symbols · ${tickstreamLag(time)} · source timestamp ${time || 'waiting'}.`;
      } catch {}
    };
    clearInterval(window.countDeskTickstreamStatusTimer);
    window.countDeskTickstreamStatusTimer = setInterval(updateState, 4000);
    $('#velaProvenance').textContent = `Tickstream ${ticker} · ${timeframe} bars · up-to-7-day history ${chartPayload.historyState || state.historyState || 'loading'} · ${data.length} candles · ${state.receivedTicks || 0} ticks received across subscribed symbols · ${tickstreamLag(chartPayload.lastSourceTime)} · source timestamp ${chartPayload.lastSourceTime || 'waiting'}.`;
    setStatus(`Tickstream ${ticker} ${timeframe} chart connected · ${state.state} · delayed, memory-only candles.`);
  } catch (error) {
    $('#velaTickstreamStatus').textContent = error.message;
    const fallback = catalog.find(item => item.symbol.includes('MYM')) || catalog.find(item => item.timeframes?.some(tf => tf.timeframe === '1H'));
    if (!fallback) {
      setStatus(error.message, true);
      return;
    }
    $('#velaSymbol').value = fallback.symbol;
    $('#velaTimeframe').value = fallback.timeframes?.some(tf => tf.timeframe === '1H') ? '1H' : (fallback.timeframes?.[0]?.timeframe || '1H');
    await loadPreview();
    setStatus(`Historical chart loaded · Tickstream unavailable: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function setPaperStatus(message, error = false) {
  const node = $('#velaPaperStatus');
  node.textContent = message;
  node.classList.toggle('error', error);
}

const paperChartPlanner = createPaperChartPlanner({
  stage:$('.vela-chart-stage'),
  onAccountSelect(accountId) {
    $('#velaPaperAccount').value = accountId;
    void refreshPaperPositions().catch(error => setPaperStatus(error.message, true));
  },
  onOpenAccounts() { setWorkspace('paper'); },
  onDiscard() { $('#velaQuickOrderStatus').textContent = 'Paper plan discarded. Nothing was sent.'; },
  async onQueue(payload) {
    const response = await fetch('/api/chart-sim/open', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Paper order could not be queued.');
    setPaperStatus('Paper order queued from chart plan. Fill depends on later confirmed stored bars.');
    await refreshPaperPositions();
  },
});

$('#journalWorkspaceLink').addEventListener('click', event => {
  if (!latestPaperJournalSequence) return;
  event.preventDefault();
  const destination = event.currentTarget.href;
  void fetch('/api/chart-sim/journal-updates/ack', {
    method:'POST', keepalive:true, headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sequence:latestPaperJournalSequence}),
  }).finally(() => { window.location.href = destination; });
});
void refreshPaperJournalBadge();
window.setInterval(refreshPaperJournalBadge, 5000);

function currentPaperBarTime() {
  const last = currentContract?.bars?.at(-1);
  return last ? Math.floor(last.time / 1000) : null;
}

function renderPaperPositions() {
  const activeOrders = paperOrders.filter(item => item.status === 'queued');
  const activePositions = paperPositions.filter(item => item.status !== 'closed');
  const recentClosed = paperPositions.filter(item => item.status === 'closed').slice(0, 2);
  $('#velaPaperPositionCount').textContent = `${activeOrders.length} queued · ${activePositions.length} open`;
  const orderCards = activeOrders.map(order => `<article class="vela-paper-position"><div class="vela-paper-position-top"><b>${escapeHtml(order.side.toUpperCase())} ${order.quantity} · ${escapeHtml(order.order_type || 'market').replace('_','-')}</b><span>QUEUED</span></div><small>${escapeHtml(order.timeframe)} · after ${new Date(Number(order.placed_after_bar_time) * 1000).toLocaleString()}</small><small>${order.limit_price == null ? '' : `Limit ${formatPrice(order.limit_price)} · `}${order.trigger_price == null ? '' : `Trigger ${formatPrice(order.trigger_price)}`}</small><div class="vela-paper-actions"><button type="button" data-vela-paper-advance="${escapeHtml(order.order_id)}">Check next bar</button><button type="button" data-vela-paper-cancel="${escapeHtml(order.order_id)}">Cancel</button></div></article>`).join('');
  const positionCards = [...activePositions, ...recentClosed].map(position => {
    const mark = currentContract && position.status !== 'closed' && position.symbol === currentContract.market.symbol && position.timeframe === currentContract.market.timeframe
      ? (Number(currentContract.analysis.lastClose) - position.entry_price) * (position.side === 'long' ? 1 : -1) * position.quantity * position.multiplier : null;
    const result = position.status === 'closed' ? `Gross ${position.gross_pnl >= 0 ? '+' : ''}$${Number(position.gross_pnl).toFixed(2)}`
      : mark == null ? 'No displayed mark' : `Displayed gross ${mark >= 0 ? '+' : ''}$${mark.toFixed(2)}`;
    const matching = currentContract && position.symbol === currentContract.market.symbol && position.timeframe === currentContract.market.timeframe;
    const actions = position.status === 'open' && matching && currentPaperBarTime() >= position.entry_bar_time
      ? `<button type="button" data-vela-paper-close="${escapeHtml(position.position_id)}">Queue exit</button>${position.stop_price != null || position.target_price != null ? `<button type="button" data-vela-paper-bracket="${escapeHtml(position.position_id)}">Check bracket</button>` : ''}`
      : position.status === 'closing' ? `<button type="button" data-vela-paper-exit="${escapeHtml(position.position_id)}">Check exit</button>` : '';
    return `<article class="vela-paper-position"><div class="vela-paper-position-top"><b>${escapeHtml(position.side.toUpperCase())} ${position.quantity} · ${formatPrice(position.entry_price)}</b><span>${escapeHtml(position.status.toUpperCase())}</span></div><small>${escapeHtml(position.timeframe)} · entry ${new Date(Number(position.entry_bar_time) * 1000).toLocaleString()}</small><small>${escapeHtml(position.entry_source)}</small>${position.stop_price != null || position.target_price != null ? `<small>Bracket · stop ${position.stop_price == null ? '—' : formatPrice(position.stop_price)} · target ${position.target_price == null ? '—' : formatPrice(position.target_price)}</small>` : ''}<strong>${result}</strong><div class="vela-paper-actions">${actions}</div></article>`;
  }).join('');
  $('#velaPaperPositions').innerHTML = orderCards + positionCards || '<p class="vela-paper-empty">No paper positions on this market.</p>';
}

async function refreshPaperPositions() {
  const market = selectedMarket();
  if (!market) return;
  const accountId = $('#velaPaperAccount').value;
  if (!accountId) { paperOrders = []; paperPositions = []; renderPaperPositions(); return; }
  const payload = await getJson(`/api/chart-sim/positions?symbol=${encodeURIComponent(market.symbol)}&account_id=${encodeURIComponent(accountId)}`);
  paperOrders = payload.orders || [];
  paperPositions = payload.positions || [];
  renderPaperPositions();
}

async function refreshPaperAccounts(selectedId = '') {
  const payload = await getJson('/api/chart-sim/accounts');
  paperAccounts = payload.accounts || [];
  const select = $('#velaPaperAccount');
  const previous = selectedId || select.value;
  select.innerHTML = '<option value="">Select simulated account</option>' + paperAccounts.map(account =>
    `<option value="${escapeHtml(account.account_id)}">${escapeHtml(account.name)} · virtual $${Number(account.starting_balance).toLocaleString()}</option>`).join('');
  if (paperAccounts.some(account => account.account_id === previous)) select.value = previous;
  else if (paperAccounts.length) select.value = paperAccounts[0].account_id;
  paperChartPlanner.setAccounts(paperAccounts, select.value);
  await refreshPaperPositions();
}

function updatePaperOrderFields() {
  const type = $('#velaPaperOrderType').value;
  $('#velaPaperLimitField').hidden = !['limit','stop_limit'].includes(type);
  $('#velaPaperTriggerField').hidden = !['stop','stop_limit'].includes(type);
  $('#velaPaperLimit').required = ['limit','stop_limit'].includes(type);
  $('#velaPaperTrigger').required = ['stop','stop_limit'].includes(type);
}

async function paperAction(path, body, successMessage) {
  if (paperBusy) return;
  paperBusy = true;
  try {
    const result = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error || `Request failed (${result.status})`);
    setPaperStatus(payload.message || successMessage);
    await refreshPaperPositions();
  } catch (error) {
    setPaperStatus(error.message, true);
  } finally {
    paperBusy = false;
  }
}

function setWorkspace(view) {
  const paper = view === 'paper';
  $('#modularWorkspace').hidden = paper;
  $('#velaPaperWorkspace').hidden = !paper;
  $('#velaChartTab').classList.toggle('active', !paper);
  $('#velaPaperTab').classList.toggle('active', paper);
  $('#velaChartTab').setAttribute('aria-selected', String(!paper));
  $('#velaPaperTab').setAttribute('aria-selected', String(paper));
  if (paper) {
    if (currentContract) {
      const market = currentContract.market;
      $('#velaPaperMarket').textContent = `${market.symbol} · ${market.timeframe} · last close ${formatPrice(currentContract.analysis.lastClose)}`;
      $('#velaPaperSource').textContent = `${currentContract.analysis.source} · cutoff ${formatCutoff(currentContract)} · confirmed stored bar context`;
    }
    void refreshPaperAccounts().catch(error => setPaperStatus(error.message, true));
  }
}

async function loadPreview() {
  modularWorkspace?.ensureChart();
  if (pendingChartConnection) return;
  const chosenSymbol = $('#velaSymbol').value;
  const directOption = [...$('#velaSymbol').options].find(option => option.value === chosenSymbol && option.dataset.directProvider);
  if (directOption) {
    const spec = chartProviderSpecs[directOption.dataset.directProvider];
    return connectChartProvider(directOption.dataset.directProvider, chosenSymbol.slice(`${spec.prefix}:`.length));
  }
  const market = selectedMarket();
  const streamTicker = tickstreamTicker(market?.symbol);
  setTimeframeOptions(streamTicker ? 'tickstream' : 'historical');
  const timeframe = $('#velaTimeframe').value;
  if (activeChartConnection && (activeChartConnection.id !== (streamTicker ? 'tickstream' : 'historical') || activeChartConnection.symbol !== (streamTicker || market?.symbol))) {
    const next = {label:streamTicker ? 'Tickstream server stream' : 'Count Desk historical data', symbol:streamTicker || market?.symbol || 'selected market', timeframe};
    pendingChartConnection = {id:streamTicker ? 'tickstream' : 'historical', ...next};
    renderConnectionManager();
    const accepted = await confirmConnectionSwitch(next, activeChartConnection);
    if (!accepted) {
      pendingChartConnection = null;
      setTimeframeOptions(activeChartConnection.id === 'tickstream' ? 'tickstream' : activeChartConnection.id === 'historical' ? 'historical' : 'provider');
      renderConnectionManager();
      return;
    }
    disposeActiveChartConnection();
    renderConnectionManager();
  }
  if (streamTicker) return loadTickstreamChart();
  $('#velaPaperTab').disabled = false;
  clearInterval(window.countDeskTickstreamStatusTimer);
  $('#cleoBriefing').hidden = true;
  if (!market) return setStatus('No Count Desk market is available.', true);
  if (!window.Vela?.Vela) return setStatus('Vela browser bundle did not load.', true);
  const button = $('#velaLoad');
  button.disabled = true;
  const nextReplayKey = `${market.symbol}|${timeframe}`;
  if (nextReplayKey !== replayKey) {
    replayKey = nextReplayKey;
    replayBounds = null;
    $('#velaReplayCutoff').value = '';
  }
  setStatus(`Loading ${market.symbol} · ${timeframe} from the local historical store…`);
  try {
    const cutoffInput = $('#velaReplayCutoff').value;
    const cutoff = cutoffInput ? Math.floor(new Date(cutoffInput).getTime() / 1000) : 2147483647;
    if (!Number.isFinite(cutoff)) throw new Error('Choose a valid replay cutoff.');
    const query = `symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(timeframe)}&cutoff=${cutoff}`;
    const payload = await getJson(`/api/counts?${query}`);
    updateReplayBounds(payload.bars);
    const effectiveCutoff = Math.min(cutoff, Number(payload.bars.at(-1)?.time || cutoff));
    const contract = buildChartContract({bars:payload.bars, result:payload, symbol:market.symbol, timeframe});
    contract.market.cutoff = effectiveCutoff;
    currentContract = contract;
    offLiveChartBar?.(); offLiveChartBar = null; liveChartBar = null;
    window.countDeskVelaContext = {tab:'Count Desk', symbol:market.symbol, timeframe, cutoff:effectiveCutoff};
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const data = contract.bars;
    renderCleoBriefing(contract);
    void refreshFeedState(market, timeframe);
    if (velaChart) {
      try { velaChart.destroy?.(); } catch { /* preview reset */ }
      velaChart = null;
    }
    toolBeltDrawingIds = {};
    $('#velaChart').replaceChildren();
    velaChart = new window.Vela.Vela('#velaChart', {
      symbol: market.symbol,
      timeframe: providerTimeframe(timeframe),
      data,
      live: false,
      theme: 'dark',
      drawings: true,
      volume: false,
      currentPriceLine: true,
      timeScale: {timezone: 'America/Los_Angeles'},
      nativeBackend: 'canvas2d',
      animations: {intro: false},
    });
    window.countDeskVelaChart = velaChart;
    await velaChart.ready();
    await new Promise(resolve => requestAnimationFrame(resolve));
    velaChart.resize();
    applyScreenPaintToChart();
    await applyStoredIndicators();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    velaChart.resize();
    paperChartPlanner.setChart(velaChart, contract);
    void refreshPaperAccounts().catch(error => setPaperStatus(error.message, true));
    scheduleVelaResize();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    velaChart?.resize();
    applyReadableCandleViewport(velaChart);
    const first = new Date(Number(payload.bars[0].time) * 1000).toLocaleString();
    const last = new Date(Number(payload.bars.at(-1).time) * 1000).toLocaleString();
    $('#velaProvenance').textContent = `${market.symbol} · ${timeframe} · ${contract.bars.length} stored bars · ${first} → ${last} · cutoff ${last} · source ${contract.analysis.source}`;
    $('#velaPaperMarket').textContent = `${market.symbol} · ${timeframe} · last close ${formatPrice(contract.analysis.lastClose)}`;
    $('#velaPaperSource').textContent = `${contract.analysis.source} · cutoff ${formatCutoff(contract)} · confirmed stored bar context`;
    renderIndicatorContext(contract);
    if ($('#velaPaperWorkspace').hidden === false) await refreshPaperPositions();
    setStatus(`Vela preview ready · ${market.symbol} ${timeframe} · offline historical dataset`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  renderToolBeltIndicators();
  renderIndicatorTemplates();
  renderConnectionManager();
  try {
    const payload = await getJson('/api/symbols');
    catalog = payload.symbols || [];
    catalog.push({symbol:'TICKSTREAM:MYM', label:'MYM · Tickstream Feed'});
    catalog.push({symbol:'TICKSTREAM:NQ', label:'NQ · Tickstream Feed'});
    fillSymbols();
    const params = new URLSearchParams(location.search);
    modularWorkspace.renderWatchlist();
    const savedPlatformSettings = modularWorkspace.savedPlatformSettings();
    const requestedIndicator = params.get('indicator');
    if (['liquidity','bias','structure-zones'].includes(requestedIndicator)) {
      const active = storedToolBeltActive();
      active.add(requestedIndicator);
      storeToolBeltActive(active);
      renderToolBeltIndicators();
    }
    const requestedMarket = catalog.find(item => item.symbol.toUpperCase() === String(params.get('symbol') || '').toUpperCase());
    if (requestedMarket) $('#velaSymbol').value = requestedMarket.symbol;
    let defaultProvider = ['hyperliquid','binance','coinbase','historical'].includes(savedPlatformSettings?.provider) ? savedPlatformSettings.provider : 'hyperliquid';
    try {
      const saved = localStorage.getItem(defaultDataProviderStorageKey);
      if (['hyperliquid','binance','coinbase','historical'].includes(saved)) defaultProvider = saved;
      else localStorage.setItem(defaultDataProviderStorageKey, defaultProvider);
    } catch { /* Private browsing may disable local settings; Hyperliquid remains this-session default. */ }
    $('#velaDefaultProvider').value = defaultProvider;
    if (!params.has('symbol') && !params.has('feed') && !params.has('timeframe') && savedPlatformSettings) {
      await applySavedPlatformSettings(savedPlatformSettings);
    }
    const hasRequestedChart = params.has('feed') || params.has('symbol') || params.has('timeframe');
    if (params.get('feed') === 'tickstream') {
      modularWorkspace.ensureChart();
      $('#velaSymbol').value = `TICKSTREAM:${params.get('ticker') === 'NQ' ? 'NQ' : 'MYM'}`;
      setTimeframeOptions('tickstream');
      $('#velaTimeframe').value = params.get('timeframe') || '1M';
      await loadPreview();
    } else if (params.get('feed') === 'historical' || defaultProvider === 'historical') {
      if (hasRequestedChart) {
        modularWorkspace.ensureChart();
        setTimeframeOptions('historical');
        if (params.has('timeframe')) $('#velaTimeframe').value = params.get('timeframe');
        await loadPreview();
      } else if (modularWorkspace.hasChart()) await modularWorkspace.loadSavedChart();
    } else if (params.has('symbol')) {
      modularWorkspace.ensureChart();
      const requested = catalog.find(item => item.symbol.toUpperCase() === String(params.get('symbol')).toUpperCase());
      if (requested) $('#velaSymbol').value = requested.symbol;
      if (params.has('timeframe')) $('#velaTimeframe').value = params.get('timeframe');
      await loadPreview();
    } else {
      if (modularWorkspace.hasChart()) await modularWorkspace.loadSavedChart();
      else setStatus('Workspace ready · add a chart widget when you are ready to load a source.');
    }
    void refreshTickstreamReadiness();
    clearInterval(window.countDeskConnectionsStatusTimer);
    window.countDeskConnectionsStatusTimer = setInterval(() => {
      const market = selectedMarket();
      if (market) void refreshFeedState(market, $('#velaTimeframe').value);
      else void refreshTickstreamReadiness();
    }, 5000);
    applyWorkspaceHash();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function applyWorkspaceHash() {
  setWorkspace(window.location.hash === '#paper' ? 'paper' : 'chart');
}

$('#velaLoad').addEventListener('click', () => void loadPreview());
$('#velaDefaultProvider').addEventListener('change', event => {
  const provider = event.currentTarget.value;
  if (!['hyperliquid','binance','coinbase','historical'].includes(provider)) return;
  try { localStorage.setItem(defaultDataProviderStorageKey, provider); }
  catch { setStatus('This browser blocked saved settings; the startup default may not persist.', true); return; }
  setStatus(`${chartProviderSpecs[provider]?.label || 'Count Desk historical'} saved as the startup default.`);
  modularWorkspace?.saveCurrentState();
});
$('#modularConnectData').addEventListener('click', () => {
  setWorkspace('chart');
  modularWorkspace?.ensureChart();
  requestAnimationFrame(() => {
    const manager = $('#deskConnections');
    if (!manager) return;
    document.querySelectorAll('.desk-drawer').forEach(drawer => { drawer.hidden = true; });
    manager.hidden = false;
    $('#velaConnectionsButton')?.setAttribute('aria-expanded','true');
  });
});
$('#deskConnections').addEventListener('click', event => {
  const button = event.target.closest('[data-connect-provider]');
  if (button && !button.disabled) void connectChartProvider(button.dataset.connectProvider);
});
$('#velaSymbol').addEventListener('change', () => {
  const symbol = $('#velaSymbol').value;
  const option = [...$('#velaSymbol').options].find(item => item.value === symbol && item.dataset.directProvider);
  if (option) setTimeframeOptions('provider');
  else if (tickstreamTicker(symbol)) {
    setTimeframeOptions('tickstream');
    $('#velaTimeframe').value = '1M';
  } else setTimeframeOptions('historical');
  modularWorkspace?.saveCurrentState();
  void loadPreview();
});
$('#velaTimeframe').addEventListener('change', () => { modularWorkspace?.saveCurrentState(); void loadPreview(); });
$('#velaReplayLatest').addEventListener('click', () => {
  const input = $('#velaReplayCutoff');
  if (replayBounds) input.value = localDateInput(replayBounds.last);
  void loadPreview();
});
$('#velaTickstreamProbe').addEventListener('click', () => void probeTickstream());
$('#velaIndicatorList').addEventListener('click', event => {
  const gear = event.target.closest('[data-open-native-settings]');
  if (gear) return openIndicatorSettings('native',gear.dataset.openNativeSettings);
  const button = event.target.closest('[data-vela-indicator]');
  if (!button || button.disabled) return;
  void toggleIndicator(button.dataset.velaIndicator).catch(error => setStatus(error.message, true));
});
$('#toolBeltIndicatorGrid').addEventListener('click', async event => {
  const gear = event.target.closest('[data-open-tool-settings]');
  if (gear) return openIndicatorSettings('toolbelt',gear.dataset.openToolSettings);
  const button = event.target.closest('[data-toggle-tool-belt]');
  if (!button) return;
  const id = button.dataset.toggleToolBelt;
  const definition = toolBeltIndicators.find(item => item.id === id);
  if (!definition) return;
  const active = storedToolBeltActive();
  if (active.has(id)) {
    active.delete(id);
    storeToolBeltActive(active);
    clearToolBeltDrawings(id);
    if(id==='liquidity') setLiquidityHoverGroups([],0);
    renderToolBeltIndicators();
    renderChartLegend();
    $('#indicatorTemplateStatus').textContent = `${definition.name} deactivated and removed from the chart.`;
    return;
  }
  $('#indicatorTemplateStatus').textContent = `Loading ${definition.name} from the active chart source…`;
  try {
    await renderToolBeltIndicator(id);
    active.add(id);
    storeToolBeltActive(active);
    renderToolBeltIndicators();
    renderChartLegend();
  } catch (error) {
    clearToolBeltDrawings(id);
    $('#indicatorTemplateStatus').textContent = `${definition.name} could not be activated: ${error.message}`;
  }
});
$('#velaChart').addEventListener('pointermove',event=>{liquidityPointer={x:event.clientX,y:event.clientY};});
$('#velaChart').addEventListener('pointerleave',hideLiquidityPopup);
const convergenceSummary=$('#liquidityConvergenceSummary');
convergenceSummary.addEventListener('mouseenter',event=>{
  liquidityPointer={x:event.clientX-335,y:event.clientY+20};
  if(liquidityHoverGroups.length) showLiquidityPopup(null,true);
});
convergenceSummary.addEventListener('mouseleave',hideLiquidityPopup);
convergenceSummary.addEventListener('focus',()=>{
  const box=convergenceSummary.getBoundingClientRect();
  liquidityPointer={x:box.left-335,y:box.bottom+20};
  if(liquidityHoverGroups.length) showLiquidityPopup(null,true);
});
convergenceSummary.addEventListener('blur',hideLiquidityPopup);
convergenceSummary.addEventListener('click',event=>{
  liquidityPopupPinned=!liquidityPopupPinned;
  if(!liquidityPopupPinned){hideLiquidityPopup(true);return;}
  liquidityPointer={x:event.clientX-335,y:event.clientY+20};
  showLiquidityPopup(null,true);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&liquidityPopupPinned){liquidityPopupPinned=false;hideLiquidityPopup(true);}
});
$('#toolSupportToggle').addEventListener('click', () => {
  const panel = $('#toolSupportPanel');
  const opening = panel.hidden;
  panel.hidden = !opening;
  $('#toolSupportToggle').setAttribute('aria-expanded',String(opening));
});
$('#saveIndicatorTemplate').addEventListener('click',saveIndicatorTemplate);
$('#loadIndicatorTemplate').addEventListener('click',() => void loadIndicatorTemplate());
$('#indicatorTemplateSelect').addEventListener('change',() => { $('#loadIndicatorTemplate').disabled = !$('#indicatorTemplateSelect').value; });
$('#restoreIndicatorDefaults').addEventListener('click',() => void restoreIndicatorDefaults());
$('#indicatorSettingsForm').addEventListener('submit',async event => {
  event.preventDefault();
  if (await saveOpenIndicatorSettings()) $('#indicatorSettingsDialog').close();
});
$('#resetIndicatorSettings').addEventListener('click',() => void resetOpenIndicatorSettings());
document.querySelectorAll('[data-close-settings]').forEach(button => button.addEventListener('click',() => $('#indicatorSettingsDialog').close()));
document.querySelector('[data-close-tool-belt]').addEventListener('click',() => {
  $('#deskStudies').hidden = true;
  document.querySelector('[data-drawer="studies"]').setAttribute('aria-expanded','false');
});
$('#velaChartTab').addEventListener('click', () => setWorkspace('chart'));
$('#velaPaperTab').addEventListener('click', () => setWorkspace('paper'));
$('#velaPaperAccount').addEventListener('change', () => {
  paperChartPlanner.setAccounts(paperAccounts, $('#velaPaperAccount').value);
  void refreshPaperPositions().catch(error => setPaperStatus(error.message, true));
});
$('#velaPaperAccountForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (paperBusy) return;
  paperBusy = true;
  try {
    const response = await fetch('/api/chart-sim/accounts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:$('#velaPaperAccountName').value, starting_balance:$('#velaPaperStartingBalance').value})});
    const account = await response.json();
    if (!response.ok) throw new Error(account.error || 'Account creation failed');
    $('#velaPaperAccountName').value = '';
    await refreshPaperAccounts(account.account_id);
    setPaperStatus(`${account.name} created with virtual funds. Journal connection is pending.`);
  } catch (error) { setPaperStatus(error.message, true); }
  finally { paperBusy = false; }
});
$('#velaPaperOrderType').addEventListener('change', updatePaperOrderFields);
updatePaperOrderFields();
window.addEventListener('hashchange', applyWorkspaceHash);
$('#velaBackToChart').addEventListener('click', () => setWorkspace('chart'));
$('#velaPaperPractice').addEventListener('click', () => {
  if (!currentContract) return setPaperStatus('Load a Vela chart first.', true);
  setPaperStatus('Paper context refreshed from the selected Vela chart.');
  void refreshPaperPositions().catch(error => setPaperStatus(error.message, true));
});
$('#velaPaperTicket').addEventListener('submit', event => {
  event.preventDefault();
  if (!currentContract) return setPaperStatus('Load a Vela chart first.', true);
  const barTime = currentPaperBarTime();
  if (!barTime) return setPaperStatus('The selected chart has no confirmed stored bar.', true);
  if (!$('#velaPaperAccount').value) return setPaperStatus('Create or select a simulated account first.', true);
  const optional = selector => $(selector).value.trim() ? Number($(selector).value) : null;
  void paperAction('/api/chart-sim/open', {
    account_id:$('#velaPaperAccount').value, order_type:$('#velaPaperOrderType').value,
    symbol:currentContract.market.symbol, timeframe:currentContract.market.timeframe, bar_time:barTime,
    side:$('#velaPaperSide').value, quantity:$('#velaPaperQuantity').value,
    limit_price:optional('#velaPaperLimit'), trigger_price:optional('#velaPaperTrigger'),
    stop_price:optional('#velaPaperStop'), target_price:optional('#velaPaperTarget'),
  }, 'Paper order queued for the next completed source bar.');
});
const tradeMenu = $('#velaTradeContextMenu');
$('#velaChart').addEventListener('contextmenu', event => {
  if (!currentContract) return;
  event.preventDefault();
  tradeMenu.hidden = false;
  tradeMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 204)}px`;
  tradeMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 250)}px`;
  tradeMenu.querySelector('button')?.focus();
});
tradeMenu.addEventListener('click', event => {
  const button = event.target.closest('[data-paper-side]');
  if (!button) return;
  tradeMenu.hidden = true;
  setWorkspace('chart');
  $('#velaPaperSide').value = button.dataset.paperSide;
  $('#velaPaperOrderType').value = button.dataset.paperType;
  updatePaperOrderFields();
  paperChartPlanner.planFromContext(button.dataset.paperSide, button.dataset.paperType);
});
document.addEventListener('click', event => { if (!tradeMenu.contains(event.target)) tradeMenu.hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') tradeMenu.hidden = true; });
$('#velaPaperPositions').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !currentContract) return;
  if (button.dataset.velaPaperAdvance) return void paperAction('/api/chart-sim/advance', {order_id:button.dataset.velaPaperAdvance}, 'Paper fill checked.');
  if (button.dataset.velaPaperCancel) return void paperAction('/api/chart-sim/cancel', {order_id:button.dataset.velaPaperCancel}, 'Queued paper order cancelled.');
  if (button.dataset.velaPaperClose) return void paperAction('/api/chart-sim/close', {position_id:button.dataset.velaPaperClose, bar_time:currentPaperBarTime()}, 'Paper exit queued for the next completed source bar.');
  if (button.dataset.velaPaperExit) return void paperAction('/api/chart-sim/advance', {position_id:button.dataset.velaPaperExit}, 'Paper exit checked.');
  if (button.dataset.velaPaperBracket) return void paperAction('/api/chart-sim/bracket', {position_id:button.dataset.velaPaperBracket}, 'Paper bracket checked on one completed bar.');
});
// Keep the chart workspace visible while Vela measures its container, then honor a paper deep link.
modularWorkspace = createModularWorkspace({
  chartElement:$('#velaChartWorkspace'),
  getSymbols:() => catalog,
  getIndicators:() => ({selected:storedIndicatorTypes(),rendered:presentNativeTypes()}),
  toggleIndicator,
  selectSymbol:symbol => { $('#velaSymbol').value = symbol; void loadPreview(); },
  capturePlatformSettings:() => ({
    provider:activeChartConnection?.id || (tickstreamTicker($('#velaSymbol').value) ? 'tickstream' : [...$('#velaSymbol').options].find(option => option.value === $('#velaSymbol').value)?.dataset.directProvider || 'historical'),
    symbol:$('#velaSymbol').value,
    timeframe:$('#velaTimeframe').value,
    activeIndicators:[...storedToolBeltActive()],
    indicatorSettings:storedToolBeltSettings(),
    supportStudies:[...storedIndicatorTypes()],
    supportInputs:storedIndicatorInputs(),
  }),
  applyPlatformSettings:applySavedPlatformSettings,
  getLadderContext:() => {
    const bar = currentContract?.bars?.at(-1) || liveChartBar?.bar;
    if (!bar) return null;
    if (!currentContract && liveChartBar) {
      const cutoff = liveChartBar.cutoff ? new Date(liveChartBar.cutoff * 1000).toLocaleString() : 'provider timestamp';
      return {bar,symbol:liveChartBar.symbol,timeframe:liveChartBar.timeframe,source:liveChartBar.source,cutoff,confirmed:false};
    }
    return {
      bar,
      symbol:currentContract.market.symbol,
      timeframe:currentContract.market.timeframe,
      source:currentContract.analysis?.source || currentContract.market.source || 'stored chart source',
      cutoff:formatCutoff(currentContract),
      confirmed:Boolean(currentContract.analysis?.source && currentContract.market.cutoff),
    };
  },
  stagePaperPrice:(price,side) => {
    return paperChartPlanner.planAtPrice(price,side);
  },
  canStagePaperPrice:() => paperChartPlanner.canPlanAtPrice(),
  loadChart:() => {
    const symbol = $('#velaSymbol').value;
    const direct = [...$('#velaSymbol').options].find(option => option.value === symbol && option.dataset.directProvider);
    if (direct || tickstreamTicker(symbol) || $('#velaDefaultProvider').value === 'historical') return loadPreview();
    return connectChartProvider($('#velaDefaultProvider').value);
  },
});
window.countDeskModularWorkspace = modularWorkspace;
setWorkspace('chart');
void init();

const $ = selector => document.querySelector(selector);
import {buildChartContract} from './chart-contract.js';
let catalog = [];
let velaChart = null;
let velaResizeFrame = 0;
let currentContract = null;
let paperOrders = [];
let paperPositions = [];
let paperBusy = false;
let replayBounds = null;
let paperAccounts = [];
let replayKey = '';
let indicatorTypeMemory = ['volume'];
let indicatorInputMemory = {};
const indicatorStorageKey = 'count-desk-vela-indicators-v1';
const indicatorInputStorageKey = 'count-desk-vela-indicator-inputs-v1';
const beltActiveStorageKey = 'count-desk-toolbelt-active-v1';
const beltSettingsStorageKey = 'count-desk-toolbelt-settings-v1';
const beltTemplatesStorageKey = 'count-desk-toolbelt-templates-v1';
let settingsTarget = null;
let indicatorTemplates = [];
let toolBeltDrawingIds = {liquidity:[],bias:[]};
const toolBeltIndicators = [
  {id:'volume-profile',name:'Volume Profile',version:'v1.0.0',image:'volume-profile-sketch.png',colorImage:'volume-profile-color.png',settings:[['bins','Price bins','number',32,8,128],['lookback','Lookback bars','number',160,20,2000],['valueArea','Show value area','checkbox',true]]},
  {id:'fibonacci',name:'Fibonacci',version:'v0.1.0',image:'fibonacci-sketch.png',colorImage:'fibonacci-color.png',settings:[['anchor','Swing anchor','select','Last confirmed swing',['Last confirmed swing','Visible range','Manual']],['levels','Retracement levels','text','0.382, 0.5, 0.618']]},
  {id:'liquidity',name:'Liquidity',version:'v1.0.0',image:'liquidity-sketch.png',colorImage:'liquidity-color.png',settings:[['externalPivot','External pivot length','number',14,1,50],['internalPivot','Internal pivot length','number',5,1,50],['showSweeps','Show swept levels','checkbox',true]]},
  {id:'bias',name:'Bias',version:'v1.0.0',image:'bias-sketch.png',colorImage:'bias-color.png',settings:[['pivotLength','Pivot length','number',5,1,50],['sweepBufferTicks','Sweep buffer (ticks)','number',1,0,100],['acceptanceBufferTicks','Acceptance buffer (ticks)','number',1,0,100],['showSwingLabels','Show swing labels','checkbox',true],['showBreaks','Show BOS / CHOCH','checkbox',true],['priorPeriod','Include higher-timeframe context','checkbox',true]]},
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
  velaChart.applyConfig?.({grid:{vertLines:{visible:false},horzLines:{visible:false}}});
}

window.addEventListener('countdesk:screen-palette-change', event => {
  if (event.detail?.target === 'chart') applyScreenPaintToChart();
});

function fillSymbols() {
  $('#velaSymbol').innerHTML = catalog.map(item => `<option value="${item.symbol}">${item.label || item.symbol}</option>`).join('');
  const preferred = catalog.find(item => item.symbol.includes('MYM')) || catalog[0];
  if (preferred) $('#velaSymbol').value = preferred.symbol;
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
}

function storedToolBeltSettings() { return readStoredObject(beltSettingsStorageKey); }

function defaultSettings(definition) {
  return Object.fromEntries(definition.settings.map(([key,,type,value]) => [key, value]));
}

function effectiveToolBeltSettings(definition) {
  return {...defaultSettings(definition), ...(storedToolBeltSettings()[definition.id] || {})};
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

async function renderLiquidityOnChart() {
  if (!velaChart || !currentContract) throw new Error('Load a historical chart before activating Liquidity.');
  if (!velaChart.drawings?.supported || typeof velaChart.drawings.add !== 'function') {
    throw new Error('This chart renderer cannot display the Liquidity overlay.');
  }
  const definition = toolBeltIndicators.find(item => item.id === 'liquidity');
  const settings = effectiveToolBeltSettings(definition);
  const {symbol, timeframe, cutoff} = currentContract.market;
  const query = new URLSearchParams({
    symbol, timeframe, cutoff:String(cutoff || Math.floor(Date.now() / 1000)),
    external_length:String(settings.externalPivot), internal_length:String(settings.internalPivot),
  });
  const report = await getJson(`/api/tool-belt/liquidity?${query}`);
  clearToolBeltDrawings('liquidity');
  const bars = report.bars || [];
  const firstTime = Number(bars[0]?.time || 0) * 1000;
  const includeSwept = settings.showSweeps !== false;
  const levels = (report.levels || []).filter(level =>
    (includeSwept || !level.broken) &&
    (level.kind !== 'EXT' || Number(level.touchCount) > 0) &&
    (!level.broken || Number(level.brokenTime || 0) * 1000 >= firstTime)
  );
  const latestInternal = new Map();
  for (const level of levels) {
    if (level.kind === 'INT') latestInternal.set(level.side, level.id);
  }
  // Match the supplied Pine chart: retain active levels originating before
  // the visible window, show up to its 180 lines / 20 historical boxes, and
  // size boxes from its delayed, strict-overlap count.
  const visibleLevels = levels.filter(level =>
    level.kind !== 'INT' || latestInternal.get(level.side) === level.id
  ).slice(-180);
  const timeframeSeconds = ({'1M':60,'5M':300,'15M':900,'30M':1800,'1H':3600,'4H':14400,'1D':86400})[String(timeframe).toUpperCase()] || 3600;
  const boxLevelIds = new Set(visibleLevels
    .filter(level => level.kind === 'EXT' && Number(level.touchCount) > 0)
    .slice(-20)
    .map(level => level.id));
  for (const level of visibleLevels) {
    const start = Number(level.pivotTime) * 1000;
    const end = Number(level.brokenTime || report.confirmedCutoff) * 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const isBsl = level.side === 'BSL';
    const color = level.kind === 'INT'
      ? (isBsl ? '#ff9800' : '#00ffff')
      : (isBsl ? '#f23645' : '#089981');
    const lineColor = level.broken ? '#b4b9c0' : color;
    const lineStyle = level.broken ? 'dashed' : 'solid';
    const boundary = Number(isBsl ? level.top : level.bottom);
    if (boxLevelIds.has(level.id) && Number(level.top) > Number(level.bottom)) {
      const zoneEnd = Math.min(end, start + timeframeSeconds * 1000 * Math.max(1, Number(level.touchCount) || 1));
      addToolBeltDrawing('box', {
        paneId:'price',
        anchors:[{time:start,price:Number(level.top)},{time:Math.max(start + 1, zoneEnd),price:Number(level.bottom)}],
      style:{lineColor:`${color}00`,lineWidth:1,lineStyle:'solid',fillColor:`${color}80`},
      });
    }
    if (!Number.isFinite(boundary)) continue;
    addToolBeltDrawing('trendline', {
      paneId:'price',
      anchors:[{time:start,price:boundary},{time:end,price:boundary}],
      style:{lineColor,lineWidth:1,lineStyle},
    });
    addToolBeltDrawing('text', {
      paneId:'price',
      anchors:[{time:start,price:boundary}],
      text:{value:`${level.side} ${level.kind}`,color:lineColor,size:'tiny',hAlign:'left',vAlign:isBsl?'bottom':'top'},
      style:{lineColor,lineWidth:1,lineStyle:'solid'},
    });
  }
  const cutoffText = report.confirmedCutoff
    ? new Date(Number(report.confirmedCutoff) * 1000).toLocaleString()
    : 'unknown cutoff';
  $('#indicatorTemplateStatus').textContent = visibleLevels.length
    ? `Liquidity mapped ${visibleLevels.length} confirmed levels on ${symbol} ${timeframe} · EXT BSL red / SSL teal; INT BSL orange / SSL aqua · compact wick-to-body boxes · fresh lines solid, broken lines grey dashed · closed-bar cutoff ${cutoffText} · source rights not recorded; probability unscored.`
    : `Liquidity active · no confirmed levels match these settings in ${symbol} ${timeframe} through ${cutoffText}.`;
}

async function renderBiasOnChart() {
  if (!velaChart || !currentContract) throw new Error('Load a historical chart before activating Bias.');
  if (!velaChart.drawings?.supported || typeof velaChart.drawings.add !== 'function') {
    throw new Error('This chart renderer cannot display the Bias overlay.');
  }
  const definition = toolBeltIndicators.find(item => item.id === 'bias');
  const settings = effectiveToolBeltSettings(definition);
  const {symbol, timeframe, cutoff} = currentContract.market;
  const query = new URLSearchParams({
    symbol, timeframe, cutoff:String(cutoff || Math.floor(Date.now() / 1000)),
    pivot_length:String(settings.pivotLength),
    sweep_buffer_ticks:String(settings.sweepBufferTicks),
    acceptance_buffer_ticks:String(settings.acceptanceBufferTicks),
  });
  const report = await getJson(`/api/tool-belt/bias?${query}`);
  const points = report.points || [];
  const current = points.at(-1);
  if (!current || report.status !== 'ready') throw new Error(`Bias needs more confirmed ${timeframe} bars to map structure.`);
  clearToolBeltDrawings('bias');
  const bars = report.bars || [];
  const firstTime = Number(bars[0]?.time || 0) * 1000;
  const cutoffTime = Number(report.confirmedCutoff || bars.at(-1)?.time || 0) * 1000;
  const selectedBias = settings.priorPeriod !== false ? report.overallBias : current.bias;
  const biasColor = selectedBias === 'BULLISH' ? '#089981' : selectedBias === 'BEARISH' ? '#f23645' : '#aeb7c2';
  const latestSwingHigh = current.lastSwingHigh;
  const latestSwingLow = current.lastSwingLow;
  for (const [swing, color, tag] of [[latestSwingHigh,'#f23645','LAST HIGH'],[latestSwingLow,'#089981','LAST LOW']]) {
    if (!swing || !Number.isFinite(Number(swing.price))) continue;
    const start = Number(swing.time) * 1000;
    if (!Number.isFinite(start) || cutoffTime <= start) continue;
    addToolBeltDrawing('trendline', {
      paneId:'price',anchors:[{time:start,price:Number(swing.price)},{time:cutoffTime,price:Number(swing.price)}],
      style:{lineColor:color,lineWidth:1,lineStyle:'dashed'},
    },'bias');
    if (settings.showSwingLabels !== false && start >= firstTime) {
      addToolBeltDrawing('text', {
        paneId:'price',anchors:[{time:start,price:Number(swing.price)}],
        text:{value:tag,color,size:'tiny',hAlign:'left',vAlign:tag === 'LAST HIGH' ? 'bottom' : 'top'},
        style:{lineColor:color,lineWidth:1,lineStyle:'solid'},
      },'bias');
    }
  }
  if (settings.showSwingLabels !== false) {
    const priorBySide = {HIGH:null,LOW:null};
    for (const swing of (report.swings || []).filter(item => Number(item.time) * 1000 >= firstTime).slice(-12)) {
      const previous = priorBySide[swing.side];
      const relation = previous == null ? (swing.side === 'HIGH' ? 'H' : 'L')
        : swing.side === 'HIGH' ? (swing.price > previous ? 'HH' : swing.price < previous ? 'LH' : 'EH')
          : (swing.price > previous ? 'HL' : swing.price < previous ? 'LL' : 'EL');
      priorBySide[swing.side] = swing.price;
      const color = swing.side === 'HIGH' ? '#f23645' : '#089981';
      addToolBeltDrawing('text', {
        paneId:'price',anchors:[{time:Number(swing.time) * 1000,price:Number(swing.price)}],
        text:{value:relation,color,size:'tiny',hAlign:'center',vAlign:swing.side === 'HIGH' ? 'bottom' : 'top'},
        style:{lineColor:color,lineWidth:1,lineStyle:'solid'},
      },'bias');
    }
  }
  if (settings.showBreaks !== false) {
    for (const event of (report.events || []).filter(item => Number(item.time) * 1000 >= firstTime).slice(-6)) {
      const color = event.direction === 'BULLISH' ? '#089981' : '#f23645';
      const start = Number(event.levelTime) * 1000;
      const end = Number(event.time) * 1000;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      addToolBeltDrawing('trendline', {
        paneId:'price',anchors:[{time:start,price:Number(event.price)},{time:end,price:Number(event.price)}],
        style:{lineColor:color,lineWidth:2,lineStyle:'solid'},
      },'bias');
      addToolBeltDrawing('text', {
        paneId:'price',anchors:[{time:end,price:Number(event.price)}],
        text:{value:`${event.kind} ${event.direction === 'BULLISH' ? '↑' : '↓'}`,color,size:'tiny',hAlign:'left',vAlign:event.direction === 'BULLISH' ? 'bottom' : 'top'},
        style:{lineColor:color,lineWidth:1,lineStyle:'solid'},
      },'bias');
    }
  }
  const anchorTime = Number(current.time) * 1000;
  addToolBeltDrawing('text', {
    paneId:'price',anchors:[{time:anchorTime,price:Number(current.close)}],
    text:{value:`${selectedBias} BIAS · ${current.phase}${settings.priorPeriod !== false ? ` · ${report.timeframeAlignment}` : ''}`,color:biasColor,size:'small',hAlign:'left',vAlign:'top'},
    style:{lineColor:biasColor,lineWidth:1,lineStyle:'solid'},
  },'bias');
  const higherText = settings.priorPeriod === false ? 'higher-period context hidden' : `${report.higherTimeframe || 'higher timeframe'} ${report.higherStructure?.bias || 'unavailable'} · ${report.timeframeAlignment}`;
  $('#indicatorTemplateStatus').textContent = `Bias ${selectedBias} on ${symbol} ${timeframe} · ${current.phase} · ${higherText} · ${report.swings?.length || 0} confirmed swings · closed-bar cutoff ${new Date(cutoffTime).toLocaleString()} · source rights not recorded; probability unscored.`;
}

async function syncToolBeltOverlays() {
  clearToolBeltDrawings();
  const active = storedToolBeltActive();
  if (active.has('liquidity')) {
    try { await renderLiquidityOnChart(); }
    catch (error) { $('#indicatorTemplateStatus').textContent = `Liquidity overlay unavailable: ${error.message}`; }
  }
  if (active.has('bias')) {
    try { await renderBiasOnChart(); }
    catch (error) { $('#indicatorTemplateStatus').textContent = `Bias overlay unavailable: ${error.message}`; }
  }
}

function renderToolBeltIndicators() {
  const grid = $('#toolBeltIndicatorGrid');
  if (!grid) return;
  const active = storedToolBeltActive();
  grid.innerHTML = toolBeltIndicators.map(definition => {
    const enabled = active.has(definition.id);
    return `<article class="tool-belt-card${enabled ? ' is-active' : ''}" data-indicator-id="${definition.id}"><button class="tool-card-toggle" type="button" data-toggle-tool-belt="${definition.id}" aria-pressed="${enabled}" aria-label="${enabled ? 'Deactivate' : 'Activate'} ${definition.name}"><img src="./tool-belt-assets/${enabled ? definition.colorImage : definition.image}" alt=""><strong>${definition.name}</strong><small>${enabled ? 'ACTIVE' : definition.version}</small></button><button class="tool-card-gear" type="button" data-open-tool-settings="${definition.id}" aria-label="Settings for ${definition.name}" title="Settings">⚙</button></article>`;
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
  $('#indicatorSettingsFields').innerHTML = rows.length ? rows.map(([key,label,type,defaultValue,min,max]) => {
    const value = current[key] ?? defaultValue;
    if (type === 'checkbox') return `<label>${label}<input type="checkbox" name="${key}" ${value ? 'checked' : ''}></label>`;
    if (type === 'select') return `<label>${label}<select name="${key}">${min.map(option => `<option ${String(option) === String(value) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
    const attrs = type === 'number' ? ` type="number" min="${min}" max="${max}" step="${Number.isInteger(defaultValue) ? '1' : '0.01'}"` : ' type="text"';
    return `<label>${label}<input name="${key}"${attrs} value="${escapeHtml(value)}"></label>`;
  }).join('') : '<p class="indicator-settings-empty">This support study has no editable inputs in the current chart renderer.</p>';
  $('#indicatorSettingsNote').textContent = scope === 'toolbelt'
    ? 'Settings are saved with this indicator card in this browser. This research card does not yet provide a plotted Vela overlay.'
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
    for (const [key,,type,defaultValue] of definition.settings) {
      if (type === 'checkbox') values[key] = values[key] === 'on';
      else if (type === 'number') {
        values[key] = Number(values[key]);
        const [, , , , min, max] = definition.settings.find(field => field[0] === key);
        if (!Number.isFinite(values[key]) || values[key] < min || values[key] > max) {
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
    if (id === 'liquidity' && storedToolBeltActive().has(id)) await renderLiquidityOnChart();
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
    openIndicatorSettings(scope,id);
    $('#indicatorTemplateStatus').textContent = `${definition.name} settings restored to default.`;
    return;
  }
  const values = storedIndicatorInputs();
  delete values[id];
  localStorage.setItem(indicatorInputStorageKey, JSON.stringify(values));
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
  const colors = {volume:'#74c6a5',rsi:'#b78cff',sma:'#f2c14e',ema:'#54c9de',atr:'#ff8b72',vpvr:'#77a8ff',liquidity:'#f3b95f',bias:'#b78cff'};
  const present = presentNativeTypes();
  const active = indicatorDefinitions.filter(def => present.has(def.type)).map(def => ({name:indicatorDisplayLabel(def), color:colors[def.type] || '#aebdc5'}));
  const beltActive = storedToolBeltActive();
  if (beltActive.has('liquidity') && (toolBeltDrawingIds.liquidity || []).length) active.push({name:'Liquidity', color:colors.liquidity});
  if (beltActive.has('bias') && (toolBeltDrawingIds.bias || []).length) active.push({name:'Bias', color:colors.bias});
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
  if (String(symbol || '').toUpperCase() === 'TICKSTREAM:NQ') return 'NQ';
  return '';
}

function renderTickstreamReadiness(source) {
  const status = source?.state || source?.status || 'unknown';
  const labels = {
    not_connected: ['KEY NEEDED', 'Add the server key to count-dashboard/.env, then restart Count Desk.'],
    connecting: ['CONNECTING · NQ', 'Opening the server-side stream and loading recent ticks.'],
    connected: ['CONNECTED · NQ', `${source?.historyState === 'complete' ? 'Seven-day history loaded' : source?.historyState === 'loading' ? 'Seven-day history loading' : source?.historyState?.startsWith('error:') ? 'History backfill stopped; recent stream remains active' : source?.historyState === 'capped' ? 'History backfill reached its request cap' : 'Recent history'}; one-minute stream bars stay in memory.`],
    error: ['STREAM ERROR', source?.message || 'Tickstream connection needs attention.'],
  };
  const [label, note] = labels[status] || ['UNAVAILABLE', 'Tickstream readiness is not confirmed.'];
  $('#velaTickstreamReadiness').textContent = label;
  $('#velaTickstreamReadinessMeta').textContent = note;
  $('#velaTickstreamReadiness').dataset.state = status;
  $('#velaTickstreamProbe').disabled = status === 'not_connected' || !tickstreamTicker($('#velaSymbol').value);
  $('#velaTickstreamStatus').textContent = source?.message || note;
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
    $('#velaFeedState').textContent = `${status.provider || 'Historical source'} · ${status.mode || 'UNKNOWN'}`;
    $('#velaFeedMeta').textContent = `${status.message || 'Source status available.'} Tickstream: ${tickstream?.status || 'unknown'}.`;
    const tickstreamState = await getJson('/api/tickstream/status');
    renderTickstreamReadiness(tickstreamState);
    const connected = status.status === 'receiving' || tickstreamState.state === 'connected';
    const connecting = status.status === 'connecting' || tickstreamState.state === 'connecting';
    setConnectionButtonState(connected ? 'connected' : connecting ? 'connecting' : 'disconnected', {
      feed: status,
      tickstream: tickstreamState,
      sources: sources.sources || [],
    });
  } catch (error) {
    $('#velaFeedState').textContent = 'Source status unavailable';
    $('#velaFeedMeta').textContent = error.message;
    renderTickstreamReadiness({status:'unknown'});
    setConnectionButtonState('disconnected', {error: error.message});
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
  const ticker = 'NQ';
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
    $('#velaSymbol').value = 'TICKSTREAM:NQ';
    $('#velaTimeframe').value = '1M';
    await loadTickstreamChart();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function tickstreamDataFeed(timeframe) {
  const getBars = async () => {
    const payload = await getJson(`/api/tickstream/bars?symbol=NQ&timeframe=${encodeURIComponent(timeframe)}`);
    window.countDeskTickstreamHistoryState = payload.historyState;
    return payload.bars || [];
  };
  return {
    async load() {
      const bars = await getBars();
      if (!bars.length) throw new Error('Tickstream is connected but no NQ chart ticks have arrived yet.');
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

async function waitForTickstreamBars(timeframe, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  let chartPayload;
  while (Date.now() < deadline) {
    [state, chartPayload] = await Promise.all([
      getJson('/api/tickstream/status'),
      getJson(`/api/tickstream/bars?symbol=NQ&timeframe=${encodeURIComponent(timeframe)}`),
    ]);
    renderTickstreamReadiness(state);
    if (!state.configured && state.state === 'not_connected') {
      throw new Error('Set the server-side Tickstream key in count-dashboard/.env, then restart Count Desk.');
    }
    if (state.state === 'error' || chartPayload.state === 'error') {
      throw new Error(state.message || chartPayload.message || 'Tickstream connection failed.');
    }
    if (chartPayload.bars?.length) return {state, chartPayload};
    setStatus(`${state.message || 'Connecting to Tickstream…'} Waiting for the first NQ chart bars.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(state?.message || 'Tickstream connected, but no NQ chart bars arrived within 35 seconds.');
}

async function loadTickstreamChart() {
  const button = $('#velaTickstreamProbe');
  const timeframe = $('#velaTimeframe').value;
  const velaTimeframe = ({'1M':'1', '1H':'60', '4H':'240', '1D':'D'})[timeframe] || '1';
  button.disabled = true;
  try {
    let {state, chartPayload} = await waitForTickstreamBars(timeframe);
    setStatus(`Tickstream NQ connected · seven-day history ${state.historyState || 'loading'} · loading recent candles…`);
    let data = chartPayload.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
    let fullHistoryLoaded = chartPayload.historyState === 'complete';
    if (velaChart) { try { velaChart.destroy?.(); } catch {} velaChart = null; }
    $('#velaChart').replaceChildren();
    $('#cleoBriefing').hidden = true;
    const feed = tickstreamDataFeed(timeframe);
    velaChart = new window.Vela.Vela('#velaChart', {
      symbol:'NQ', timeframe:velaTimeframe, bars:10080, data, live:true,
      theme:'dark', drawings:true, volume:false, currentPriceLine:true,
      nativeBackend:'canvas2d', animations:{intro:false},
    }, {dataFeed:feed});
    window.countDeskVelaChart = velaChart;
    await velaChart.ready();
    await new Promise(resolve => requestAnimationFrame(resolve));
    velaChart.resize();
    applyScreenPaintToChart();
    await applyStoredIndicators();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    velaChart.resize();
    $('#velaPaperTab').disabled = true;
    $('#velaPaperMarket').textContent = `NQ · ${timeframe} · Tickstream`;
    $('#velaPaperSource').textContent = 'Paper simulation is disabled for the streamed NQ instrument.';
    window.countDeskVelaContext = {tab:'Tickstream', symbol:'NQ', timeframe, cutoff:state.lastSourceTime ? Math.floor(Date.parse(state.lastSourceTime) / 1000) : null};
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const updateState = async () => {
      if ($('#velaSymbol').value !== 'TICKSTREAM:NQ') return;
      try {
        const latest = await getJson('/api/tickstream/status');
        renderTickstreamReadiness(latest);
        if (latest.historyState === 'complete' && !fullHistoryLoaded && velaChart) {
          const complete = await getJson(`/api/tickstream/bars?symbol=NQ&timeframe=${encodeURIComponent(timeframe)}`);
          data = complete.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
          await velaChart.setMarket({symbol:'NQ', timeframe:velaTimeframe, bars:10080, data});
          await applyStoredIndicators();
          fullHistoryLoaded = true;
        }
        $('#velaProvenance').textContent = `Tickstream NQ · ${timeframe} bars · up-to-7-day history ${latest.historyState || 'loading'} · ${data.length} candles · ${latest.receivedTicks || 0} ticks received · ${tickstreamLag(latest.lastSourceTime)} · source timestamp ${latest.lastSourceTime || 'waiting'}.`;
      } catch {}
    };
    clearInterval(window.countDeskTickstreamStatusTimer);
    window.countDeskTickstreamStatusTimer = setInterval(updateState, 4000);
    $('#velaProvenance').textContent = `Tickstream NQ · ${timeframe} bars · up-to-7-day history ${chartPayload.historyState || state.historyState || 'loading'} · ${data.length} candles · ${state.receivedTicks || 0} ticks received · ${tickstreamLag(state.lastSourceTime)} · source timestamp ${state.lastSourceTime || 'waiting'}.`;
    setStatus(`Tickstream NQ ${timeframe} chart connected · ${state.state} · memory-only candles.`);
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
  $('#velaChartWorkspace').hidden = paper;
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
  const market = selectedMarket();
  const timeframe = $('#velaTimeframe').value;
  if (market?.symbol === 'TICKSTREAM:NQ') return loadTickstreamChart();
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
    window.countDeskVelaContext = {tab:'Count Desk', symbol:market.symbol, timeframe, cutoff:effectiveCutoff};
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const data = contract.bars;
    renderCleoBriefing(contract);
    void refreshFeedState(market, timeframe);
    if (velaChart) {
      try { velaChart.destroy?.(); } catch { /* preview reset */ }
      velaChart = null;
    }
    $('#velaChart').replaceChildren();
    velaChart = new window.Vela.Vela('#velaChart', {
      symbol: market.symbol,
      timeframe: timeframe === '1H' ? '60' : timeframe === '4H' ? '240' : 'D',
      data,
      live: false,
      theme: 'dark',
      drawings: true,
      volume: false,
      currentPriceLine: true,
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
  try {
    const payload = await getJson('/api/symbols');
    catalog = payload.symbols || [];
    catalog.push({symbol:'TICKSTREAM:NQ', label:'NQ · Tickstream Free Feed'});
    fillSymbols();
    if (new URLSearchParams(location.search).get('feed') === 'tickstream') {
      $('#velaSymbol').value = 'TICKSTREAM:NQ';
      $('#velaTimeframe').value = '1M';
    }
    await loadPreview();
    clearInterval(window.countDeskConnectionsStatusTimer);
    window.countDeskConnectionsStatusTimer = setInterval(() => {
      const market = selectedMarket();
      if (market) void refreshFeedState(market, $('#velaTimeframe').value);
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
$('#velaSymbol').addEventListener('change', () => {
  if ($('#velaSymbol').value === 'TICKSTREAM:NQ') $('#velaTimeframe').value = '1M';
  else if ($('#velaTimeframe').value === '1M') $('#velaTimeframe').value = '1H';
  void loadPreview();
});
$('#velaTimeframe').addEventListener('change', () => void loadPreview());
$('#velaSymbol').addEventListener('change', () => {
  if ($('#velaSymbol').value === 'TICKSTREAM:NQ') $('#velaTimeframe').value = '1M';
  void loadPreview();
});
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
  if (!['liquidity','bias'].includes(id)) {
    $('#indicatorTemplateStatus').textContent = `${definition.name} does not have a chart renderer connected yet.`;
    return;
  }
  const active = storedToolBeltActive();
  if (active.has(id)) {
    active.delete(id);
    storeToolBeltActive(active);
    clearToolBeltDrawings(id);
    renderToolBeltIndicators();
    renderChartLegend();
    $('#indicatorTemplateStatus').textContent = `${definition.name} deactivated and removed from the chart.`;
    return;
  }
  $('#indicatorTemplateStatus').textContent = `Loading confirmed ${definition.name} context onto the chart…`;
  try {
    if (id === 'liquidity') await renderLiquidityOnChart();
    else await renderBiasOnChart();
    active.add(id);
    storeToolBeltActive(active);
    renderToolBeltIndicators();
    renderChartLegend();
  } catch (error) {
    clearToolBeltDrawings(id);
    $('#indicatorTemplateStatus').textContent = `${definition.name} could not be activated: ${error.message}`;
  }
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
$('#velaPaperAccount').addEventListener('change', () => void refreshPaperPositions().catch(error => setPaperStatus(error.message, true)));
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
  setWorkspace('paper');
  $('#velaPaperSide').value = button.dataset.paperSide;
  $('#velaPaperOrderType').value = button.dataset.paperType;
  updatePaperOrderFields();
  ($('#velaPaperLimitField').hidden ? $('#velaPaperQuantity') : $('#velaPaperLimit')).focus();
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
setWorkspace('chart');
void init();

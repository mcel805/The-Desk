if (window.location.protocol === 'file:') {
  window.location.replace('http://127.0.0.1:8770/');
}

const $ = (s) => document.querySelector(s);
const LWC = window.LightweightCharts;
const savedLiquidityLineWidth = Number(localStorage.getItem('batty-liquidity-line-width'));
const savedChartInfoVisible = localStorage.getItem('batty-chart-info-visible') === 'true';
const savedMtfSettings = (() => { try { return JSON.parse(localStorage.getItem('batty-mtf-zone-settings') || '{}'); } catch { return {}; } })();
const savedMtfVisible = localStorage.getItem('batty-mtf-zones-visible') === 'true';
const savedToolbarSettings = (() => { try { return JSON.parse(localStorage.getItem('batty-toolbar-settings') || '{}'); } catch { return {}; } })();
const TOOL_TEMPLATE_KEY = 'batty-chart-tool-templates-v1';
const TOOL_LAYER_KEYS = ['price','counts','countPaths','swings','profile','fibs','confluence','projections','bias','drawings','liquidityZones','mtfPremiumDiscount'];
const savedToolTemplateStore = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(TOOL_TEMPLATE_KEY) || '{}');
    const templates = Array.isArray(value.templates) ? value.templates.slice(0,5).filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.visibility && typeof item.visibility === 'object') : [];
    const activeId = templates.some(item => item.id === value.activeId) ? value.activeId : '';
    return {templates, activeId};
  } catch { return {templates:[], activeId:''}; }
})();
const activeToolTemplate = savedToolTemplateStore.templates.find(item => item.id === savedToolTemplateStore.activeId);
const state = {
  catalog: [], result: null, drawings: [], mode: 'pan', selectedId: null,
  draftAnchor: null, draftPointer: null, chart: null, candles: null, markers: null,
  inspectorTab: 'ledger', insightHover: null, insightLocked: null, feedDisclosureManual: false,
  smartHover: null, chartViewKey: null,
  feed: null, feedSources: null, building: false, syncing: false, lastAutoSyncKey: null,
  positionStep:null, positionDraft:null, journal:[],
  mtfZoneBars:[], mtfZoneKey:null, mtfZoneRequestId:0,
  biasContext:{daily:[],weekly:[],key:null,available:false,series:null},
  liquidityLineWidth:Number.isFinite(savedLiquidityLineWidth)&&savedLiquidityLineWidth>=1&&savedLiquidityLineWidth<=4?savedLiquidityLineWidth:1,
  visibility: {price:true, counts:true, countPaths:true, swings:true, profile:true, fibs:true, confluence:true, projections:true, bias:false, liquidityZones:true, drawings:true, mtfPremiumDiscount:savedMtfVisible, ...(activeToolTemplate ? activeToolTemplate.visibility : {})},
  toolTemplates: savedToolTemplateStore.templates,
  activeToolTemplateId: savedToolTemplateStore.activeId,
};

const fmt = (value, digits = 2) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const dateTime = (unix) => new Date(unix * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const dateTimeIso = (value) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function localCutoff(unix) {
  const d = new Date(unix * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function selectedMarket() { return state.catalog.find(x => x.symbol === $('#symbol').value); }
function drawingQuery() { return `symbol=${encodeURIComponent($('#symbol').value)}&timeframe=${encodeURIComponent($('#timeframe').value)}`; }

function initChart() {
  if (!LWC) throw new Error('Interactive chart library did not load.');
  state.chart = LWC.createChart($('#chart'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#0d121a' }, textColor: '#929dad', fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    crosshair: { mode: LWC.CrosshairMode.Normal, vertLine: { color: '#566377', labelBackgroundColor: '#263245' }, horzLine: { color: '#566377', labelBackgroundColor: '#263245' } },
    rightPriceScale: { visible: true, borderVisible: true, borderColor: '#354255', autoScale: true, scaleMargins: { top: .08, bottom: .1 } },
    leftPriceScale: { visible: false },
    timeScale: { visible: true, borderVisible: true, borderColor: '#354255', timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 10 },
    localization: { priceFormatter: price => fmt(price) },
  });
  state.candles = state.chart.addSeries(LWC.CandlestickSeries, {
    upColor: '#63ca9d', downColor: '#ed6d76', borderVisible: false,
    wickUpColor: '#cfd6df', wickDownColor: '#cfd6df', priceLineColor: '#37c9d8',
  });
  state.chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(renderOverlay));
  state.chart.subscribeCrosshairMove(param => {
    if (!state.result || !param.point) {
      if (state.smartHover) { state.smartHover = null; requestAnimationFrame(renderOverlay); }
      return;
    }
    const waveNear = state.result.layers.flatMap(layer => layer.points.map((point, index) => {
      const pixel = pointToPixels(point);
      return {degree: layer.degree, index, point, distance: pixel ? Math.hypot(pixel.x - param.point.x, pixel.y - param.point.y) : Infinity};
    })).filter(item => item.index > 0 && item.distance <= 28).sort((a,b) => a.distance - b.distance)[0];
    const smartKey = waveNear ? `${waveNear.degree}:${waveNear.index}` : null;
    const previousSmartKey = state.smartHover ? `${state.smartHover.degree}:${state.smartHover.index}` : null;
    if (smartKey !== previousSmartKey) {
      state.smartHover = waveNear ? {degree: waveNear.degree, index: waveNear.index} : null;
      requestAnimationFrame(renderOverlay);
    }
    if (state.insightLocked) return;
    const rows = (state.result.analytics.insight?.nextSubwaves || [])
      .filter(row => Number.isFinite(row.sourceTime) && Number.isFinite(row.sourcePrice));
    const near = rows.map(row => {
      const pixel = pointToPixels({time: row.sourceTime, price: row.sourcePrice});
      return {row, distance: pixel ? Math.hypot(pixel.x - param.point.x, pixel.y - param.point.y) : Infinity};
    }).filter(x => x.distance <= 22).sort((a,b) => a.distance - b.distance)[0];
    const next = near?.row.id || null;
    if (next !== state.insightHover) {
      state.insightHover = next;
      updateInsightRowState();
      requestAnimationFrame(renderOverlay);
    }
  });
  new ResizeObserver(() => requestAnimationFrame(renderOverlay)).observe($('#chartShell'));
}

function fillTimeframes() {
  const market = selectedMarket();
  const previous = $('#timeframe').value;
  const timeframes = market?.timeframes || [];
  $('#timeframe').innerHTML = timeframes.map(x => {
    const label = timeframeLabel(x.timeframe);
    const availability = x.available === false ? 'sync data' : `${x.bars} bars`;
    return `<option value="${esc(x.timeframe)}">${esc(label)} · ${availability}</option>`;
  }).join('');
  $('#timeframeButtons').innerHTML = timeframes.map(x => {
    const label = timeframeLabel(x.timeframe);
    const hasData = x.available !== false && Number(x.bars) > 0;
    const title = hasData ? `${label} · ${fmt(x.bars,0)} stored bars` : `${label} · no stored bars yet; select and sync to load data`;
    const button = `<button type="button" data-timeframe="${esc(x.timeframe)}" class="${hasData ? '' : 'no-data'}" title="${esc(title)}" aria-pressed="${x.timeframe === $('#timeframe').value}">${esc(label)}</button>`;
    return button;
  }).join('');
  $('#timeframeButtons').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    if ($('#timeframe').value === button.dataset.timeframe) return;
    $('#timeframe').value = button.dataset.timeframe;
    $('#timeframe').dispatchEvent(new Event('change', {bubbles:true}));
  }));
  const tf = timeframes.find(x => x.timeframe === previous)
    || timeframes.find(x => x.timeframe === '1H')
    || timeframes.find(x => x.available !== false)
    || timeframes[0];
  if (tf) $('#timeframe').value = tf.timeframe;
  if (tf) $('#cutoff').value = localCutoff(tf.last_time || Math.floor(Date.now()/1000));
  syncTimeframeButtons();
  updateLiquidityControls();
  updateTimeframeAvailability();
  fillMtfZoneTimeframes(timeframes);
}

function fillMtfZoneTimeframes(timeframes) {
  const control = $('#mtfZoneTimeframe');
  if (!control) return;
  const previous = control.value || savedMtfSettings.timeframe || $('#timeframe').value;
  control.innerHTML = timeframes.map(item => {
    const available = item.available !== false && Number(item.bars) >= 20;
    const count = item.available === false ? 'no data' : `${item.bars} bars`;
    return `<option value="${esc(item.timeframe)}" ${available ? '' : 'disabled'}>${esc(timeframeLabel(item.timeframe))} · ${count}</option>`;
  }).join('');
  const usable = timeframes.filter(item => item.available !== false && Number(item.bars) >= 20);
  const selected = usable.find(item => item.timeframe === previous)
    || usable.find(item => item.timeframe === $('#timeframe').value)
    || usable.find(item => item.timeframe === '1H')
    || usable[0];
  if (selected) control.value = selected.timeframe;
}

function readMtfZoneSettings() {
  const settings = {
    timeframe:$('#mtfZoneTimeframe').value,
    swingLength:Math.max(10,Math.min(500,Math.round(Number($('#mtfZoneSwingLength').value)||50))),
    premiumColor:$('#mtfPremiumColor').value,
    equilibriumColor:$('#mtfEquilibriumColor').value,
    discountColor:$('#mtfDiscountColor').value,
    highlightColor:$('#mtfHighlightColor').value,
    opacity:Number($('#mtfZoneOpacity').value),
  };
  return settings;
}

function saveMtfZoneSettings() {
  const settings = readMtfZoneSettings();
  $('#mtfZoneSwingLength').value = String(settings.swingLength);
  localStorage.setItem('batty-mtf-zone-settings',JSON.stringify(settings));
  $('#mtfZoneOpacityValue').textContent = `${settings.opacity}%`;
  return settings;
}

function syncAllLayersToggle() {
  const inputs=[...document.querySelectorAll('[data-layer]')];
  const checked=inputs.filter(input=>input.checked).length;
  $('#toggleAll').checked=checked===inputs.length;
  $('#toggleAll').indeterminate=checked>0&&checked<inputs.length;
}

function currentToolTemplateConfig() {
  return {
    visibility: Object.fromEntries(TOOL_LAYER_KEYS.map(key => [key, Boolean(state.visibility[key])])),
    smartSupport: $('#smartSupportEnabled').checked,
    smartFibs: $('#smartFibsEnabled').checked,
  };
}

function persistToolTemplates() {
  localStorage.setItem(TOOL_TEMPLATE_KEY, JSON.stringify({templates:state.toolTemplates, activeId:state.activeToolTemplateId}));
}

function renderToolTemplates() {
  const select = $('#toolTemplateSelect');
  select.innerHTML = `<option value="">Choose a saved template</option>${state.toolTemplates.map(template => `<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('')}`;
  select.value = state.activeToolTemplateId;
  $('#updateToolTemplate').disabled = !state.activeToolTemplateId;
  $('#deleteToolTemplate').disabled = !state.activeToolTemplateId;
  $('#saveToolTemplate').disabled = state.toolTemplates.length >= 5;
  $('#toolTemplateName').disabled = state.toolTemplates.length >= 5;
  if (state.toolTemplates.length >= 5) $('#toolTemplateName').placeholder = '5 of 5 templates saved';
}

function toolTemplateMatches(template) {
  return JSON.stringify(template.visibility) === JSON.stringify(currentToolTemplateConfig().visibility)
    && template.smartSupport === currentToolTemplateConfig().smartSupport
    && template.smartFibs === currentToolTemplateConfig().smartFibs;
}

function updateToolTemplateStatus(message) {
  const active = state.toolTemplates.find(template => template.id === state.activeToolTemplateId);
  $('#toolTemplateStatus').textContent = message || (active
    ? (toolTemplateMatches(active) ? `Startup: ${active.name}` : `Unsaved changes · startup remains ${active.name}`)
    : 'Choose tools, then save a startup template.');
}

function applyToolTemplate(template, {makeActive = true, status} = {}) {
  if (!template) return;
  for (const key of TOOL_LAYER_KEYS) state.visibility[key] = Boolean(template.visibility[key]);
  document.querySelectorAll('[data-layer]').forEach(input => { input.checked = state.visibility[input.dataset.layer]; });
  $('#smartSupportEnabled').checked = Boolean(template.smartSupport);
  $('#smartFibsEnabled').checked = Boolean(template.smartFibs);
  localStorage.setItem('batty-mtf-zones-visible', String(state.visibility.mtfPremiumDiscount));
  if (makeActive) {
    state.activeToolTemplateId = template.id;
    persistToolTemplates();
  }
  syncAllLayersToggle();
  state.candles?.applyOptions({visible:state.visibility.price});
  if (state.markers) state.markers.setMarkers(countMarkers(state.result));
  renderOverlay();
  renderToolTemplates();
  updateToolTemplateStatus(status);
  if ($('#mtfZoneTimeframe').options.length) refreshMtfZoneData().catch(showError);
  else if (!state.visibility.mtfPremiumDiscount) {
    $('#mtfZoneStatus').textContent = 'Off';
    $('#mtfZoneStatus').classList.remove('error');
  }
}

function saveCurrentToolTemplate(updateSelected = false) {
  const active = state.toolTemplates.find(template => template.id === state.activeToolTemplateId);
  if (updateSelected && active) {
    Object.assign(active, currentToolTemplateConfig(), {updatedAt:new Date().toISOString()});
    persistToolTemplates();
    renderToolTemplates();
    updateToolTemplateStatus(`Updated ${active.name} · now the startup template`);
    return;
  }
  const name = $('#toolTemplateName').value.trim();
  if (!name) {
    $('#toolTemplateStatus').textContent = 'Enter a name for this template.';
    $('#toolTemplateName').focus();
    return;
  }
  if (state.toolTemplates.length >= 5) {
    $('#toolTemplateStatus').textContent = 'You can save up to five templates. Update or remove a saved template to continue.';
    return;
  }
  const template = {id:crypto.randomUUID(), name, ...currentToolTemplateConfig(), createdAt:new Date().toISOString()};
  state.toolTemplates.push(template);
  state.activeToolTemplateId = template.id;
  persistToolTemplates();
  $('#toolTemplateName').value = '';
  renderToolTemplates();
  updateToolTemplateStatus(`Saved ${name} · now the startup template`);
}

function initToolTemplates() {
  renderToolTemplates();
  const active = state.toolTemplates.find(template => template.id === state.activeToolTemplateId);
  if (active) applyToolTemplate(active, {makeActive:false, status:`Startup: ${active.name}`});
  else updateToolTemplateStatus();
  $('#toolTemplateSelect').addEventListener('change', event => {
    const template = state.toolTemplates.find(item => item.id === event.target.value);
    if (template) applyToolTemplate(template, {status:`Selected ${template.name} · saved as startup`});
    else {
      state.activeToolTemplateId = '';
      persistToolTemplates();
      renderToolTemplates();
      updateToolTemplateStatus('No startup template selected. Current settings will use the existing browser defaults.');
    }
  });
  $('#saveToolTemplate').addEventListener('click', () => saveCurrentToolTemplate(false));
  $('#updateToolTemplate').addEventListener('click', () => saveCurrentToolTemplate(true));
  $('#deleteToolTemplate').addEventListener('click', () => {
    const template = state.toolTemplates.find(item => item.id === state.activeToolTemplateId);
    if (!template) return;
    if (!window.confirm(`Delete the saved template “${template.name}”?`)) return;
    state.toolTemplates = state.toolTemplates.filter(item => item.id !== template.id);
    state.activeToolTemplateId = '';
    persistToolTemplates();
    renderToolTemplates();
    updateToolTemplateStatus('Template deleted. Current chart settings are unchanged.');
  });
  $('#toolTemplateName').addEventListener('input', () => {
    if ($('#toolTemplateStatus').textContent === 'Enter a name for this template.') updateToolTemplateStatus();
  });
}

function initToolbarDock() {
  const dock = $('#chartToolDock');
  const toggle = $('#toolbarEdgeToggle');
  const accent = /^#[0-9a-f]{6}$/i.test(savedToolbarSettings.accent || '') ? savedToolbarSettings.accent : '#f5d547';
  const closeRows = savedToolbarSettings.closeRows && typeof savedToolbarSettings.closeRows === 'object'
    ? savedToolbarSettings.closeRows : {};
  const prefs = [...dock.querySelectorAll('[data-hide-row]')];
  const savedOpen = savedToolbarSettings.open === true;
  $('#toolbarAccentColor').value = accent;
  dock.style.setProperty('--toolbar-water', accent);

  function apply() {
    const open = dock.dataset.open === 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close toolbar' : 'Open toolbar');
    toggle.querySelector('.toolbar-edge-label').textContent = open ? 'CLOSE' : 'TOOLS';
    toggle.querySelector('.toolbar-edge-chevron').textContent = open ? '›' : '‹';
    for (const pref of prefs) {
      const key = pref.dataset.hideRow;
      const closeWithToolbar = closeRows[key] !== false;
      pref.checked = closeWithToolbar;
      const row = dock.querySelector(`[data-toolbar-row="${key}"]`);
      row.dataset.collapseHidden = String(!open && closeWithToolbar);
    }
    localStorage.setItem('batty-toolbar-settings', JSON.stringify({open, closeRows, accent}));
  }

  dock.dataset.open = String(savedOpen);
  prefs.forEach(pref => pref.addEventListener('change', () => {
    closeRows[pref.dataset.hideRow] = pref.checked;
    apply();
  }));
  toggle.addEventListener('click', () => {
    dock.dataset.open = String(dock.dataset.open !== 'true');
    apply();
  });
  $('#toolbarAccentColor').addEventListener('input', event => {
    dock.style.setProperty('--toolbar-water', event.target.value);
    apply();
  });
  apply();
}

function timeframeLabel(value) { return String(value).replace('M', 'm').replace('H', 'h'); }
function syncTimeframeButtons() {
  $('#timeframeButtons')?.querySelectorAll('button').forEach(button => {
    const active = button.dataset.timeframe === $('#timeframe').value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateTimeframeAvailability() {
  const market = selectedMarket();
  const item = market?.timeframes.find(x => x.timeframe === $('#timeframe').value);
  const hasData = !!item && item.available !== false && Number(item.bars) > 0;
  const selectedSource = state.feedSources?.sources.find(source => source.id === $('#syncProvider').value);
  const feedReady = selectedSource?.status === 'adapter_configured';
  $('#build').disabled = !hasData;
  $('#build').title = hasData ? `Build a count from ${fmt(item.bars,0)} stored bars` : 'Sync this market and interval before building a count.';
  $('#emptySync').disabled = !feedReady || state.syncing;
  $('#emptySync').textContent = feedReady ? 'Sync this interval' : 'Feed not configured';
  $('#emptySync').title = feedReady ? `Load ${timeframeLabel($('#timeframe').value)} bars for this market` : (selectedSource?.useNote || 'Configure an authorized market-data feed first.');
  if (hasData) {
    $('#emptyChart').hidden = true;
    return true;
  }
  const asset = market?.label || $('#symbol').value;
  const interval = timeframeLabel($('#timeframe').value);
  $('#emptyChartTitle').textContent = `No ${interval} bars stored for ${asset}`;
  $('#emptyChartText').textContent = feedReady
    ? 'Sync this dated futures contract and interval to load real bars. The count will build after the sync completes.'
    : (selectedSource?.useNote || 'Connect an authorized market-data feed to load bars for this selection.');
  $('#emptyChart').hidden = false;
  $('#chartTitle').textContent = `${$('#symbol').value} · ${$('#timeframe').value}`;
  $('#range').textContent = 'Waiting for the first data sync';
  $('#chartMessage').textContent = 'No candles are loaded for this selection. Sync the interval to start its count.';
  return false;
}

function clearChartForNoData() {
  state.result = null;
  state.drawings = [];
  state.selectedId = null;
  state.chartViewKey = null;
  state.insightHover = null;
  state.insightLocked = null;
  if (state.candles) state.candles.setData([]);
  if (state.markers) state.markers.setMarkers([]);
  renderOverlay();
  window.countDeskChartContext = {chart:state.chart,candles:state.candles,result:null};
  window.dispatchEvent(new CustomEvent('countdesk:chart',{detail:window.countDeskChartContext}));
}

function updateLiquidityControls(){
  if(!$('#positionTool')) return;
  const supported=new Set(['1M','5M','15M','30M','1H']);
  const selected=selectedMarket()?.timeframes.find(x=>x.timeframe===$('#timeframe').value);
  const active=supported.has($('#timeframe').value)&&$('#symbol').value.toUpperCase().includes('MYM')&&Number(selected?.bars)>=20;
  $('#positionTool').disabled=!active;
  if(!active) $('#positionInstructions').textContent='User level logging is set for MYM on 1M, 5M, 15M, 30M, and 1H bars.';
  else if(!state.positionStep) $('#positionInstructions').textContent='Choose a direction, then click entry, stop, and target on the chart.';
}

async function loadCatalog() {
  const data = await json('/api/symbols');
  const previousSymbol = $('#symbol').value;
  state.catalog = data.symbols;
  $('#symbol').innerHTML = state.catalog.map(x => `<option value="${esc(x.symbol)}">${esc(x.label || x.symbol)}</option>`).join('');
  const preferred = state.catalog.find(x => x.symbol === previousSymbol)
    || state.catalog.find(x => x.symbol === 'CBOT_MINI:MYM1!')
    || state.catalog.find(x => x.timeframes.some(tf => tf.available !== false));
  if (preferred) $('#symbol').value = preferred.symbol;
  fillTimeframes();
  $('#apiState').textContent = 'Historical store connected';
  $('#apiState').className = 'api-state ok';
}

async function refreshFeedStatus() {
  const symbol = $('#symbol').value;
  const timeframe = $('#timeframe').value;
  const [feed, sources] = await Promise.all([
    json(`/api/feed/status?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`),
    json(`/api/feed/sources?symbol=${encodeURIComponent(symbol)}`),
  ]);
  state.feed = feed;
  state.feedSources = sources;
  const providerSelect = $('#syncProvider');
  const selectedBeforeRefresh = providerSelect.value || localStorage.getItem('batty-feed-provider') || 'massive';
  providerSelect.innerHTML = sources.sources.map(source => {
    const stateLabel = source.status === 'adapter_configured' ? 'configured' :
      source.status === 'quote_only' ? 'quote probe only' :
      source.status === 'unavailable' ? 'unavailable' :
      source.status === 'access_required' ? 'API access required' :
      source.status === 'rights_confirmation_required' ? 'rights confirmation required' : 'not connected';
    const disabled = ['unavailable', 'access_required', 'rights_confirmation_required', 'quote_only'].includes(source.status) ? 'disabled' : '';
    return `<option value="${esc(source.id)}" ${disabled}>${esc(source.name)} · ${stateLabel}</option>`;
  }).join('');
  providerSelect.value = sources.sources.some(source => source.id === selectedBeforeRefresh && !['unavailable', 'access_required', 'rights_confirmation_required', 'quote_only'].includes(source.status))
    ? selectedBeforeRefresh : (sources.sources.find(source => source.id === 'massive')?.id || 'licensed');
  const active = feed.status === 'receiving';
  const statusDot = $('.status-dot');
  statusDot.classList.toggle('live', active && feed.mode === 'REALTIME');
  statusDot.classList.toggle('stale', feed.status === 'stale');
  $('#feedState').textContent = active ? `${feed.mode === 'REALTIME' ? 'Real-time' : 'Delayed'} · ${feed.provider}` : 'Historical only';
  $('#feedState').className = active ? `feed-value ${feed.mode === 'REALTIME' ? 'realtime' : 'delayed'}` : 'feed-value';
  const details = active
    ? `${feed.symbol} · ${feed.timeframe} · last bar ${dateTime(feed.lastBarTime)}${feed.message ? ` · ${feed.message}` : ''}`
    : feed.status === 'stale' ? `Last ${feed.mode === 'REALTIME' ? 'real-time' : 'delayed'} update ${dateTime(feed.lastBarTime)} · feed is stale.` : feed.message;
  $('#feedMeta').textContent = details;
  const lastSyncText = feed.lastSyncAt ? dateTimeIso(feed.lastSyncAt) : 'never';
  const dueText = feed.nextSyncAt ? dateTime(feed.nextSyncAt) : 'after first connection';
  $('#syncSchedule').textContent = `Last sync: ${lastSyncText} · Next sync: ${dueText} · ${Math.round((feed.syncIntervalSeconds || sources.syncIntervalSeconds || 300) / 60)} min cadence`;
  const sourceState = id => {
    const source = sources.sources.find(item => item.id === id);
    return source?.status === 'adapter_configured' ? 'configured' :
      source?.status === 'unavailable' ? 'unavailable' :
      source?.status === 'access_required' ? 'API access required' :
      source?.status === 'rights_confirmation_required' ? 'rights confirmation required' : 'not connected';
  };
  $('#providerConnections').textContent = `Live MYM: ${active && feed.mode === 'REALTIME' ? 'receiving' : 'not connected'} · Massive historical: ${sourceState('massive')} · AMP/CQG: ${sourceState('amp_cqg')} · Broker orders: disabled`;
  if($('#liquidityDataStatus')) $('#liquidityDataStatus').textContent=active?`${feed.mode==='REALTIME'?'Real-time':'Delayed'} bars · automatic outcomes enabled`:'Historical bars only · add a licensed feed for automatic outcomes';
  const selectedProvider = providerSelect.value;
  const selectedSource = sources.sources.find(item => item.id === selectedProvider);
  const adapterConfigured = selectedSource?.status === 'adapter_configured';
  const flag = $('#feedConnectionFlag');
  const shortProviderName = (selectedSource?.name || 'Data feed').replace(' Futures Basic', '');
  const flagState = adapterConfigured ? (active && feed.mode === 'REALTIME' ? 'connected' : 'attention') : selectedSource?.status === 'rights_confirmation_required' ? 'attention' : 'disconnected';
  const flagText = adapterConfigured ? `${shortProviderName} configured${active ? ` · ${feed.mode === 'REALTIME' ? 'real-time' : 'historical, not live'} bars` : ' · no fresh bars'}`
    : selectedSource?.status === 'rights_confirmation_required' ? 'Rights check required'
    : selectedSource?.status === 'unavailable' ? 'Feed unavailable' : `${shortProviderName} not connected`;
  flag.className = `feed-flag ${flagState}`;
  flag.querySelector('span').textContent = flagText;
  flag.title = selectedSource?.useNote || flagText;
  if (!state.feedDisclosureManual) $('#feedDetails').open = !adapterConfigured;
  $('#refreshFeed').disabled = state.syncing || !adapterConfigured;
  $('#refreshFeed').title = adapterConfigured
    ? `Fetch bars from ${selectedSource.name}; confirm the provider terms cover this use.`
    : `${selectedSource?.useNote || 'Configure a local adapter first'}`;
  updateTimeframeAvailability();
  if (adapterConfigured && feed.nextSyncAt && feed.nextSyncAt <= Math.floor(Date.now() / 1000) && !state.syncing) {
    const syncKey = `${symbol}|${timeframe}|${selectedProvider}|${feed.nextSyncAt}`;
    if (state.lastAutoSyncKey !== syncKey) {
      state.lastAutoSyncKey = syncKey;
      await syncFeed(true);
    }
  }
  if (active && $('#followLive').checked && state.result &&
      state.result.run.symbol === symbol && state.result.run.timeframe === timeframe &&
      feed.lastBarTime > state.result.summary.lastBar && !state.building) {
    $('#cutoff').value = localCutoff(Math.max(feed.lastBarTime, Math.floor(Date.now() / 1000)));
    await build();
  }
}

async function syncFeed(silent = false) {
  if (state.syncing) return;
  const button = $('#refreshFeed');
  state.syncing = true;
  button.disabled = true;
  button.textContent = 'Syncing…';
  try {
    const result = await json('/api/feed/sync', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({provider: $('#syncProvider').value, symbol: $('#symbol').value, timeframe: $('#timeframe').value}),
    });
    const providerLabel = result.dataProvider || 'Licensed data provider';
    $('#feedMeta').textContent = `${providerLabel} synced ${result.accepted} bars for ${result.symbol} · ${result.timeframe}.`;
    state.lastAutoSyncKey = null;
    const sameSelection = result.symbol === $('#symbol').value && result.timeframe === $('#timeframe').value;
    await loadCatalog();
    await refreshFeedStatus();
    if (sameSelection && (!silent || !state.result)) await build();
  } catch (error) {
    $('#feedMeta').textContent = error.message;
    if (!silent) $('#feedState').textContent = 'Sync unavailable';
  } finally {
    state.syncing = false;
    button.textContent = 'Sync now';
    const selectedSource = state.feedSources?.sources.find(item => item.id === $('#syncProvider').value);
    button.disabled = selectedSource?.status !== 'adapter_configured';
    updateTimeframeAvailability();
  }
}

function tickstreamTicker() {
  const label = selectedMarket()?.label || '';
  const match = label.match(/\b(MES|MNQ|MCL|MGC|MYM)\b/);
  return match ? match[1] : '';
}

async function probeTickstreamQuote() {
  const ticker = tickstreamTicker();
  const status = $('#tickstreamQuoteStatus');
  if (!ticker) {
    status.textContent = 'Select a supported micro-futures market first.';
    return;
  }
  status.textContent = `Requesting delayed ${ticker} quote…`;
  try {
    const quote = await json(`/api/feed/quote?symbol=${encodeURIComponent(ticker)}`);
    const spread = quote.bid != null && quote.ask != null ? ` · bid/ask ${quote.bid} / ${quote.ask}` : '';
    status.textContent = `${quote.provider} · ${quote.symbol} ${quote.price}${spread} · delayed ${quote.delayMinutes}m · received ${dateTimeIso(quote.retrievedAt)}`;
  } catch (error) {
    status.textContent = error.message;
  }
}

function countMarkers(result) {
  const position = p => p.side === 'high' ? 'aboveBar' : 'belowBar';
  const countMarkers = state.visibility.counts ? result.layers.flatMap(layer => layer.points.map(p => ({
    time: p.time, position: position(p), color: p.color, shape: 'circle', text: p.label, size: .35,
  }))) : [];
  const swingMarkers = state.visibility.swings ? result.analytics.confirmedSwings.points.map(p => ({
    time: p.time, position: position(p), color: '#37c9d8', shape: 'square', text: p.side === 'high' ? 'S' : 'S', size: .5,
  })) : [];
  return [...countMarkers, ...swingMarkers].sort((a, b) => a.time - b.time);
}

function applyDefaultChartView(result = state.result) {
  if (!state.chart || !result?.bars?.length) return;
  const bars = result.bars;
  const timeframe = result.run?.timeframe;
  // A full 1-hour history can contain old price extremes that flatten the
  // recent candles. Keep the default close to TradingView's recent-bar view.
  const isHourly = String(timeframe).toUpperCase() === '1H';
  const visibleBars = isHourly ? Math.min(500, bars.length) : bars.length;
  const lastIndex = bars.length - 1;
  state.chart.priceScale('right').applyOptions({autoScale: true});
  state.chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, lastIndex - visibleBars + 1),
    to: lastIndex + 8,
  });
}

function renderChart(result) {
  const chartViewKey = `${result.run.symbol}:${result.run.timeframe}`;
  const shouldFit = state.chartViewKey !== chartViewKey;
  const futureTimes = result.analytics.projections.flatMap(p => p.points.slice(1).map(x => x.time));
  const candleData = result.bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
  [...new Set(futureTimes)].sort((a,b) => a-b).forEach(time => candleData.push({time}));
  state.candles.setData(candleData);
  state.candles.applyOptions({visible: state.visibility.price});
  const markers = countMarkers(result);
  if (state.markers) state.markers.setMarkers(markers);
  else state.markers = LWC.createSeriesMarkers(state.candles, markers);
  if (shouldFit) {
    state.chartViewKey = chartViewKey;
    // Let autoSize finish measuring the chart before applying the initial range.
    requestAnimationFrame(() => {
      if (state.chartViewKey === chartViewKey) applyDefaultChartView(result);
    });
  }
  requestAnimationFrame(renderOverlay);
  setTimeout(renderOverlay, 80);
  $('#chartMessage').textContent = `${result.bars.length} stored bars · ${state.drawings.length} saved drawings · Scroll to zoom, drag to pan.`;
  window.countDeskChartContext = {chart:state.chart,candles:state.candles,result};
  window.dispatchEvent(new CustomEvent('countdesk:chart',{detail:window.countDeskChartContext}));
}

function resetChartView() {
  if (!state.chart || !state.result?.bars?.length) return;
  applyDefaultChartView();
  requestAnimationFrame(renderOverlay);
  $('#chartMessage').textContent = String(state.result.run.timeframe).toUpperCase() === '1H'
    ? 'Default 1-hour view restored · recent candles are fitted to the chart.'
    : 'Default view restored · all loaded price history is visible.';
}

function renderLedger(result) {
  const {run, summary, layers} = result;
  $('#lastClose').textContent = fmt(summary.lastClose);
  $('#barCount').textContent = fmt(summary.barCount, 0);
  $('#nodeCount').textContent = fmt(summary.countNodes, 0);
  $('#runState').textContent = run.status.replaceAll('_', ' ');
  $('#runId').textContent = run.runId;
  $('#parentId').textContent = run.parentCountId;
  $('#algorithm').textContent = run.algorithmVersion;
  $('#snapshot').textContent = run.dataSnapshotHash.slice(0, 18) + '…';
  $('#cutoffReadout').textContent = dateTime(run.cutoff);
  $('#warning').textContent = summary.warning;
  $('#layers').innerHTML = layers.map(layer => `<div class="layer"><b>${esc(layer.degree)}</b><span>${layer.points.length} pivots · window ${layer.window}</span></div>`).join('');
  $('#chartTitle').textContent = `${run.symbol} · ${run.timeframe}`;
  $('#range').textContent = `${dateTime(summary.firstBar)} → ${dateTime(summary.lastBar)}`;
  const a = result.analytics;
  $('#analyticsSummary').innerHTML = [
    ['Confirmed swings', `${a.confirmedSwings.points.length} · window ${a.confirmedSwings.window}`],
    ['Volume profile', `POC ${fmt(a.volumeProfile.poc)} · VA ${fmt(a.volumeProfile.val)}–${fmt(a.volumeProfile.vah)}`],
    ['Fib anchors', a.fibonacci.anchorStart ? `${fmt(a.fibonacci.anchorStart.price)} → ${fmt(a.fibonacci.anchorEnd.price)}` : 'Unresolved'],
    ['Convergences', `${a.confluences.length} scored zones`],
    ['Paths', `${a.projections.length} provisional scenarios`],
  ].map(([name,value]) => `<div class="analytic-row"><b>${name}</b><span>${esc(value)}</span></div>`).join('');
  renderForecast(result);
  renderRatios(result);
  renderAutoCounts(result);
  renderAlternates(result);
}

function renderForecast(result) {
  const target = $('#forecastRows');
  const insight = result.analytics.insight || {};
  const rows = insight.nextSubwaves || [];
  if (!rows.length) {
    target.innerHTML = '<div class="forecast-row"><small>No recent subwave candidate is available.</small></div>';
  } else {
    target.innerHTML = `<div class="next-wave-table">
      <div class="next-wave-head"><span>Wave</span><span>R/R</span><span>Target</span><span>Risk</span><span>Status</span></div>
      ${rows.map(row => `<div class="next-wave-row" role="button" tabindex="0" data-insight-id="${esc(row.id)}" aria-pressed="false" title="Hover to preview the source swing and target area; click to lock the projection">
        <div><b>${esc(row.wave)}</b><small>${esc(row.pattern)} · ${esc(row.degree)} · ${esc(row.direction)}</small></div>
        <span class="stars" aria-label="${row.rrStars} of 3 stars">${'★'.repeat(row.rrStars)}${'☆'.repeat(3-row.rrStars)}</span>
        <span class="metric"><b>${fmt(row.target)}</b><small>${row.targetPct >= 0 ? '+' : ''}${row.targetPct.toFixed(2)}%</small></span>
        <span class="metric risk"><b>${fmt(row.risk)}</b><small>${row.riskPct.toFixed(2)}%</small></span>
        <span class="status-chip ${row.status.toLowerCase()}">${esc(row.status.replaceAll('_',' '))}</span>
      </div>`).join('')}
    </div>`;
  }
  target.querySelectorAll('[data-insight-id]').forEach(row => {
    const id = row.dataset.insightId;
    row.addEventListener('pointerenter', () => { state.insightHover = id; updateInsightRowState(); renderOverlay(); });
    row.addEventListener('pointerleave', () => { if (!state.insightLocked) { state.insightHover = null; updateInsightRowState(); renderOverlay(); } });
    row.addEventListener('focus', () => { state.insightHover = id; updateInsightRowState(); renderOverlay(); });
    row.addEventListener('blur', () => { if (!state.insightLocked) { state.insightHover = null; updateInsightRowState(); renderOverlay(); } });
    row.addEventListener('click', () => {
      state.insightLocked = state.insightLocked === id ? null : id;
      state.insightHover = state.insightLocked;
      updateInsightRowState(); renderOverlay();
    });
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); } });
  });
  updateInsightRowState();
  const termTarget = $('#termForecast');
  const forecast = insight.forecast || {};
  termTarget.innerHTML = ['short','medium','long'].map(key => {
    const item = forecast[key];
    if (!item) return '';
    return `<article class="term-card"><div class="term-card-head"><b>${esc(item.term)}</b><span class="scenario-bias ${item.bias === 'UP' ? 'up' : item.bias === 'DOWN' ? 'down' : ''}">${esc(item.bias)} · ${item.confidence}%</span></div><p>${esc(item.narrative)}</p></article>`;
  }).join('');
}

function updateInsightRowState() {
  document.querySelectorAll('[data-insight-id]').forEach(row => {
    const active = row.dataset.insightId === (state.insightLocked || state.insightHover);
    row.classList.toggle('active', active);
    row.classList.toggle('locked', row.dataset.insightId === state.insightLocked);
    row.setAttribute('aria-pressed', String(row.dataset.insightId === state.insightLocked));
  });
}

function renderRatios(result) {
  const target = $('#ratioRows');
  const rows = result.analytics.insight?.ratios || [];
  target.innerHTML = rows.length ? rows.map(row => `<div class="ratio-row ${row.fit === 'WITHIN_GUIDELINE' ? 'fit' : ''}">
    <b>${esc(row.waves)}</b><span>Price <strong>${row.pricePct.toFixed(0)}%</strong></span><span>Time <strong>${row.timePct.toFixed(0)}%</strong></span><em>${row.fit === 'WITHIN_GUIDELINE' ? 'FIT' : 'OUTSIDE'}</em>
  </div>`).join('') : '<div class="forecast-row"><small>Not enough confirmed legs for a ratio comparison.</small></div>';
}

function renderAutoCounts(result) {
  const target = $('#autoCountRows');
  const rows = result.analytics.insight?.autoCounts || [];
  target.innerHTML = rows.map(row => `<div class="auto-count-row">
    <div><b>${esc(row.degree)}</b><small>window ${row.window} · ${row.pivots} pivots</small></div><span class="confidence-bar"><i style="width:${row.confidence}%"></i></span><strong>${row.confidence}%</strong>
  </div>`).join('') || '<div class="forecast-row"><small>No degree counts are available.</small></div>';
}

function renderAlternates(result) {
  const target = $('#alternateRows');
  const paths = result.analytics.projections.filter(path => path.id !== 'preferred');
  if (!paths.length) {
    target.innerHTML = '<div class="alternate-row"><small>No alternate structural path is available.</small></div>';
    return;
  }
  target.innerHTML = paths.map(path => {
    const last = path.points.at(-1);
    return `<div class="alternate-row">
      <div class="alternate-row-head"><b>${esc(path.label)}</b><span class="scenario-bias ${path.bias === 'UP' ? 'up' : ''}">${esc(path.bias)}</span></div>
      <div class="forecast-target"><span>${esc(path.status)}</span><span>${fmt(last.price)}</span></div>
      <small>${esc(dateTime(last.time))} target · follows the active cutoff</small>
    </div>`;
  }).join('');
}

function setInspectorTab(tab) {
  state.inspectorTab = tab;
  document.querySelectorAll('[data-inspector-tab]').forEach(button => {
    const active = button.dataset.inspectorTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.inspector-panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${tab}`;
    panel.classList.toggle('active', panel.id === `panel-${tab}`);
  });
}

const GUIDE_PATTERNS = {
  impulse: {name:'Impulse (5-3-5-3-5)', rules:['Waves 1 and 5 can be impulses or diagonals.','Wave 3 must be an impulse.','Wave 3 cannot be the shortest of waves 1, 3 and 5.','Wave 2 cannot be a triangle.','Wave 4 does not overlap wave 1 in a standard impulse.'], points:[[0,70],[18,42],[34,58],[57,16],[73,36],[100,0]]},
  diagonal: {name:'Diagonal (3-3-3-3-3)', rules:['A leading diagonal may appear in wave 1 or A.','A contracting ending diagonal commonly appears in wave 5 or C.','Each leg subdivides as a corrective three.','Trend lines converge for a contracting diagonal and diverge for an expanding one.'], points:[[0,70],[20,38],[38,58],[57,25],[77,42],[100,8]]},
  zigzag: {name:'Zigzag (5-3-5)', rules:['Wave A is an impulse or leading diagonal.','Wave B is corrective and usually retraces less than all of A.','Wave C is an impulse or ending diagonal.','A and C move in the same direction.'], points:[[0,5],[34,75],[57,44],[100,100]]},
  flat: {name:'Flat (3-3-5)', rules:['Waves A and B subdivide as corrective threes.','Wave B retraces at least about 90% of wave A in a regular flat.','Wave C subdivides as an impulse or diagonal.','Expanded and running flats allow B to exceed the start of A.'], points:[[0,5],[32,60],[64,10],[100,75]]},
  triangle: {name:'Triangle (3-3-3-3-3)', rules:['Triangles contain five overlapping corrective legs labeled A-B-C-D-E.','They most often appear in wave 4, B, or the final part of a combination.','A triangle is followed by a thrust in the direction of the trend.','The pattern contracts or expands between boundary lines.'], points:[[0,12],[22,82],[43,25],[63,68],[82,38],[100,54]]},
  combination: {name:'Combination (W-X-Y)', rules:['A combination links corrective patterns with an intervening wave X.','Common forms include zigzag-zigzag, flat-zigzag, and flat-triangle.','The structure generally moves sideways and is labeled W-X-Y, or W-X-Y-X-Z.','Do not force a combination when a simpler correction fits.'], points:[[0,18],[24,67],[40,32],[56,58],[74,28],[100,64]]},
};

function renderWaveGuide() {
  const select = $('#guidePattern');
  const key = select.value || 'impulse';
  const pattern = GUIDE_PATTERNS[key];
  const coords = pattern.points.map(([x,y]) => `${x * 2.8 + 8},${y * 1.65 + 9}`).join(' ');
  const labels = pattern.points.map(([x,y],i) => `<text x="${x * 2.8 + 5}" y="${y * 1.65 + (i % 2 ? 26 : -3)}">${i + 1}</text>`).join('');
  $('#guideContent').innerHTML = `<svg class="guide-diagram" viewBox="0 0 300 190" role="img" aria-label="Idealized ${esc(pattern.name)} pattern"><polyline points="${coords}" />${labels}</svg><h3>${esc(pattern.name)}</h3><ul>${pattern.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul><p class="guide-note">Idealized reference only. Real market counts need rule checks, degree context, and an explicit invalidation.</p>`;
}

function pointToPixels(point) {
  const x = state.chart?.timeScale().timeToCoordinate(point.time);
  const y = state.candles?.priceToCoordinate(point.price);
  return x == null || y == null ? null : {x, y};
}

function strokeDash(style) {
  return style.dash === 'dash' ? '7 5' : style.dash === 'dot' ? '2 4' : '';
}

function attachIdentity(node, drawing) {
  node.dataset.id = drawing.id;
  if (drawing.type !== 'text') node.classList.add('manual-drawing');
  if (drawing.id === state.selectedId) node.classList.add('selected');
  return node;
}

function renderOneDrawing(layer, drawing) {
  const pts = drawing.points.map(pointToPixels);
  if (pts.some(x => !x)) return;
  const color = drawing.style.color || '#f4b942';
  const common = { stroke: color, 'stroke-width': drawing.style.width || 2, 'stroke-dasharray': strokeDash(drawing.style) };
  let node;
  if (drawing.type === 'trend') {
    node = svgNode('line', {x1:pts[0].x,y1:pts[0].y,x2:pts[1].x,y2:pts[1].y,...common});
  } else if (drawing.type === 'horizontal') {
    node = svgNode('line', {x1:0,y1:pts[0].y,x2:layer.clientWidth,y2:pts[0].y,...common});
  } else if (drawing.type === 'rectangle') {
    node = svgNode('rect', {x:Math.min(pts[0].x,pts[1].x),y:Math.min(pts[0].y,pts[1].y),width:Math.abs(pts[1].x-pts[0].x),height:Math.abs(pts[1].y-pts[0].y),fill:color,...common});
    node.classList.add('zone');
  } else if (drawing.type === 'text') {
    node = svgNode('text', {x:pts[0].x,y:pts[0].y,fill:color,'data-id':drawing.id,class:`drawing-text${drawing.id === state.selectedId ? ' selected' : ''}`});
    node.textContent = drawing.text || 'Note';
  }
  if (node) layer.append(attachIdentity(node, drawing));
}

function renderBattyPaths(layer) {
  if (!state.result || !state.visibility.countPaths) return;
  for (const degree of state.result.layers) {
    const pixels = degree.points.map(pointToPixels).filter(Boolean);
    if (pixels.length < 2) continue;
    layer.append(svgNode('polyline', {
      points: pixels.map(p => `${p.x},${p.y}`).join(' '),
      stroke: degree.points[0].color, class: 'batty-wave',
    }));
  }
}

function renderProfile(layer) {
  if (!state.result || !state.visibility.profile) return;
  const profile = state.result.analytics.volumeProfile;
  const width = layer.clientWidth;
  profile.bins.forEach(bin => {
    const y1 = state.candles.priceToCoordinate(bin.high), y2 = state.candles.priceToCoordinate(bin.low);
    if (y1 == null || y2 == null) return;
    const barWidth = Math.max(2, 125 * bin.relative);
    layer.append(svgNode('rect', {x:width - 145, y:Math.min(y1,y2), width:barWidth, height:Math.max(1,Math.abs(y2-y1)), class:'profile-bin'}));
  });
  [['POC',profile.poc,'#f4b942'],['VAH',profile.vah,'#7ec8ff'],['VAL',profile.val,'#7ec8ff']].forEach(([label,price,color]) => {
    const y = state.candles.priceToCoordinate(price);
    if (y == null) return;
    layer.append(svgNode('line',{x1:width-160,x2:width,y1:y,y2:y,stroke:color,class:'profile-level'}));
    const text = svgNode('text',{x:width-158,y:y-4,fill:color,class:'profile-label'}); text.textContent = `${label} ${fmt(price)}`; layer.append(text);
  });
}

function renderFib(layer) {
  if (!state.result || !state.visibility.fibs || !state.result.analytics.fibonacci.anchorStart) return;
  const fib = state.result.analytics.fibonacci;
  const xStart = state.chart.timeScale().timeToCoordinate(fib.anchorStart.time);
  if (xStart == null) return;
  const width = layer.clientWidth;
  fib.levels.forEach(level => {
    const y = state.candles.priceToCoordinate(level.price);
    if (y == null) return;
    layer.append(svgNode('line',{x1:xStart,x2:width-55,y1:y,y2:y,class:'fib-line'}));
    const text = svgNode('text',{x:width-52,y:y-3,fill:'#aeb9c8',class:'fib-label'}); text.textContent = `${level.ratio.toFixed(3)} ${fmt(level.price)}`; layer.append(text);
  });
}

function waveToken(label) {
  return String(label || '').replace(/[()?]/g, '').trim().toUpperCase();
}

function smartWaveContext() {
  if (!state.result || !state.smartHover) return null;
  const degree = state.result.layers.find(item => item.degree === state.smartHover.degree);
  const index = state.smartHover.index;
  if (!degree || index < 1 || index >= degree.points.length) return null;
  const point = degree.points[index];
  const prior = degree.points[index - 1];
  const token = waveToken(point.label);
  const isExtension = ['2', '4', 'B'].includes(token);
  if (isExtension) {
    const impulseStart = index >= 2 ? degree.points[index - 2] : point;
    const impulseEnd = degree.points[index - 1];
    return {
      degree: degree.degree, point, token, mode: 'extension',
      origin: point.price, magnitude: Math.abs(impulseEnd.price - impulseStart.price),
      direction: index >= 2
        ? (impulseEnd.price >= impulseStart.price ? 1 : -1)
        : (point.price <= prior.price ? 1 : -1),
    };
  }
  return {
    degree: degree.degree, point, token, mode: 'retracement',
    origin: point.price, magnitude: Math.abs(point.price - prior.price),
    direction: point.price >= prior.price ? 1 : -1,
  };
}

function smartPrice(range, context, ratio) {
  const size = range.top - range.bottom;
  return context.direction > 0
    ? range.top - size * ratio
    : range.bottom + size * ratio;
}

function semanticFibColor(ratio, fallback) {
  if (Math.abs(ratio - .618) < .001) return fallback;
  if (Math.abs(ratio - .786) < .001) return '#f1d45d';
  return null;
}

function renderSmartZone(layer, range, context, xStart, xEnd, ratioA, ratioB, className, label) {
  const first = state.candles.priceToCoordinate(smartPrice(range, context, ratioA));
  const second = state.candles.priceToCoordinate(smartPrice(range, context, ratioB));
  if (first == null || second == null) return;
  const top = Math.min(first, second), height = Math.max(3, Math.abs(second - first));
  layer.append(svgNode('rect', {x:xStart,y:top,width:Math.max(1,xEnd-xStart),height,class:`smart-zone ${className}`}));
  const text = svgNode('text', {x:xStart+7,y:top+13,class:`smart-zone-label ${className}`});
  text.textContent = label;
  layer.append(text);
}

function renderSmartTools(layer) {
  const context = smartWaveContext();
  if (!context) return;
  const showFibs = $('#smartFibsEnabled').checked;
  const showZones = $('#smartSupportEnabled').checked;
  if (!showFibs && !showZones) return;
  const settings = readMtfZoneSettings();
  const range = currentMtfZoneRange();
  const width = layer.clientWidth;
  if (!range) {
    const waiting = svgNode('text', {x:12,y:24,class:'smart-heading'});
    waiting.textContent = 'SMART HOVER · WAITING FOR A CONFIRMED PREMIUM / DISCOUNT SWING';
    layer.append(waiting);
    return;
  }
  const rangeX = chartXForTime(range.leftTime);
  if (rangeX == null) return;
  const xStart = Math.max(0, rangeX);
  const xEnd = Math.max(xStart + 20, width - 58);
  const labelX = Math.max(10, Math.min(xStart + 8, width * .52));
  const defaultColor = $('#smartFibColor').value;
  const lineWidth = Number($('#smartFibWidth').value);
  const ratios = [.618, .786];
  const supportPrice = context.direction > 0 ? range.latestLow.price : range.latestHigh.price;
  const supportLabel = context.direction > 0 ? 'SUPPORT' : 'RESISTANCE';
  const supportY = state.candles.priceToCoordinate(supportPrice);
  const levels = ratios.map(ratio => {
    const price = smartPrice(range, context, ratio);
    return {ratio, price, y:state.candles.priceToCoordinate(price), color:semanticFibColor(ratio, defaultColor)};
  });
  const confluence = showFibs && showZones
    ? levels.find(item => item.y != null && supportY != null && Math.abs(item.y - supportY) <= 4)
    : null;
  const confluenceY = confluence ? (confluence.y + supportY) / 2 : supportY;

  if (showZones) {
    const areaType = context.direction > 0 ? 'DISCOUNT · SUPPORT' : 'PREMIUM · RESISTANCE';
    renderSmartZone(layer, range, context, xStart, xEnd, .5, .618, 'main', `${areaType} · 50–61.8%`);
    renderSmartZone(layer, range, context, xStart, xEnd, .618, .786, 'deep', `${areaType} · 61.8–78.6%`);
  }

  if (showZones && supportY != null) {
    if (!confluence) layer.append(svgNode('line', {x1:xStart,x2:xEnd,y1:supportY,y2:supportY,class:'smart-support-line'}));
    if (!confluence) {
      const text = svgNode('text', {x:labelX,y:supportY-7,class:'smart-support-label'});
      text.textContent = `${supportLabel} ${fmt(supportPrice)}`;
      layer.append(text);
    }
  }

  if (showFibs) levels.forEach(level => {
    const y = level.y;
    if (y == null || level === confluence) return;
    layer.append(svgNode('line', {x1:xStart,x2:xEnd,y1:y,y2:y,stroke:level.color,'stroke-width':lineWidth,class:'smart-fib-line'}));
    const text = svgNode('text', {x:labelX,y:y-7,fill:level.color,class:'smart-fib-label'});
    text.textContent = `${(level.ratio * 100).toFixed(1)}% · ${fmt(level.price)}`;
    layer.append(text);
  });

  if (confluence && supportY != null && showFibs && showZones) {
    layer.append(svgNode('line', {x1:xStart,x2:xEnd,y1:confluenceY,y2:confluenceY,class:'smart-confluence-line'}));
    const text = svgNode('text', {x:labelX,y:confluenceY-7,class:'smart-confluence-label'});
    text.textContent = `${(confluence.ratio * 100).toFixed(1)}% + ${supportLabel} ${fmt(supportPrice)}`;
    layer.append(text);
  }

  const pointPixels = pointToPixels(context.point);
  if (pointPixels) layer.append(svgNode('circle', {cx:pointPixels.x,cy:pointPixels.y,r:7,class:'smart-hover-point'}));
  const heading = svgNode('text', {x:Math.min(xStart + 8, Math.max(8, width - 285)),y:24,class:'smart-heading'});
  heading.textContent = `SMART RETRACEMENT · ${timeframeLabel(settings.timeframe)} SWING · ${context.degree.toUpperCase()} WAVE ${context.token || '?'} · HOVER`;
  layer.append(heading);
}

function renderConfluences(layer) {
  if (!state.result || !state.visibility.confluence) return;
  const width = layer.clientWidth;
  state.result.analytics.confluences.forEach(zone => {
    const y1 = state.candles.priceToCoordinate(zone.price + zone.tolerance), y2 = state.candles.priceToCoordinate(zone.price - zone.tolerance);
    if (y1 == null || y2 == null) return;
    layer.append(svgNode('rect',{x:0,y:Math.min(y1,y2),width:Math.max(0,width-50),height:Math.abs(y2-y1),class:'confluence-zone'}));
    const text = svgNode('text',{x:8,y:Math.min(y1,y2)+12,fill:'#cf9aff',class:'confluence-label'}); text.textContent = `CONVERGENCE ${zone.sources.join(' + ')}`; layer.append(text);
  });
}

function renderProjections(layer) {
  if (!state.result || !state.visibility.projections) return;
  state.result.analytics.projections.forEach(path => {
    const pixels = path.points.map(pointToPixels).filter(Boolean);
    if (pixels.length < 2) return;
    layer.append(svgNode('polyline',{points:pixels.map(p=>`${p.x},${p.y}`).join(' '),stroke:path.color,class:'projection-path'}));
    const last = pixels.at(-1), text = svgNode('text',{x:last.x+5,y:last.y,fill:path.color,class:'projection-label'}); text.textContent = `${path.label} · ${path.bias}`; layer.append(text);
  });
}

function renderDraft(layer) {
  if (!state.draftAnchor || !state.draftPointer) return;
  const a = pointToPixels(state.draftAnchor);
  const b = pointToPixels(state.draftPointer);
  if (!a || !b) return;
  const color = $('#drawColor').value;
  let node;
  if (state.mode === 'trend') node = svgNode('line', {x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':2,class:'draft'});
  if (state.mode === 'rectangle') node = svgNode('rect', {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),stroke:color,fill:color,'fill-opacity':.08,'stroke-width':2,class:'draft'});
  if (node) layer.append(node);
}

function renderOverlay() {
  const layer = $('#drawingLayer');
  layer.replaceChildren();
  renderBattyPaths(layer);
  renderProfile(layer);
  renderFib(layer);
  renderLiquidityZones(layer);
  renderBias(layer);
  renderMtfPremiumDiscount(layer);
  renderSmartTools(layer);
  renderConfluences(layer);
  renderProjections(layer);
  renderInsightTarget(layer);
  if (state.visibility.drawings) state.drawings.forEach(d => renderOneDrawing(layer, d));
  renderJournalPlans(layer);
  renderDraft(layer);
  renderPositionDraft(layer);
  $('#deleteDrawing').disabled = !state.selectedId;
}

async function loadBiasContext(result) {
  const key = `${result.run.symbol}|${result.run.cutoff}`;
  const base = `/api/bars?symbol=${encodeURIComponent(result.run.symbol)}&cutoff=${result.run.cutoff}&timeframe=`;
  const [daily,weekly] = await Promise.allSettled([json(`${base}1D`),json(`${base}1W`)]);
  const dailyBars=daily.status==='fulfilled'?daily.value.bars:[];
  const weeklyBars=weekly.status==='fulfilled'?weekly.value.bars:[];
  state.biasContext={daily:dailyBars,weekly:weeklyBars,key,available:dailyBars.length>1||weeklyBars.length>1,series:null};
  state.biasContext.series=calculateBiasSeries(result,state.biasContext);
}

function calculateBiasSeries(result,context) {
  if(!context.available) return null;
  const bars=result.bars, daily=context.daily, weekly=context.weekly;
  const previousCompleted=(frames,time)=>{
    let lo=0,hi=frames.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=time)lo=mid+1;else hi=mid;}
    const index=lo-2;
    return index>=0?frames[index]:null;
  };
  const symbol=result.run.symbol.toUpperCase();
  const tick=symbol.includes('MYM')?0.25:symbol.includes('MCL')?0.01:symbol.includes('MGC')?0.1:0.01;
  let smoothedAtr=null,previousClose=null,bias=0,lastPdTime=null,reason='Waiting for external sweep';
  const trueRanges=[];
  const points=[];
  for(let i=0;i<bars.length;i++){
    const bar=bars[i],pd=previousCompleted(daily,bar.time),pw=previousCompleted(weekly,bar.time);
    const pdTime=pd?.time??null;
    if(pdTime!==lastPdTime){bias=0;reason='Waiting for external sweep';lastPdTime=pdTime;}
    const tr=Math.max(bar.high-bar.low,previousClose==null?0:Math.abs(bar.high-previousClose),previousClose==null?0:Math.abs(bar.low-previousClose));
    trueRanges.push(tr);
    if(i===9)smoothedAtr=trueRanges.slice(0,10).reduce((sum,value)=>sum+value,0)/10;
    else if(i>9)smoothedAtr=smoothedAtr+(tr-smoothedAtr)/10;
    previousClose=bar.close;
    const pdLowReclaimed=!!pd&&bar.low<=pd.low-tick&&bar.close>pd.low;
    const pdHighRejected=!!pd&&bar.high>=pd.high+tick&&bar.close<pd.high;
    const pdLowAccepted=!!pd&&bar.close<pd.low-tick;
    const pdHighAccepted=!!pd&&bar.close>pd.high+tick;
    const pwLowReclaimed=!!pw&&bar.low<=pw.low-tick&&bar.close>pw.low;
    const pwHighRejected=!!pw&&bar.high>=pw.high+tick&&bar.close<pw.high;
    const pwLowAccepted=!!pw&&bar.close<pw.low-tick;
    const pwHighAccepted=!!pw&&bar.close>pw.high+tick;
    if(pdLowReclaimed||pwLowReclaimed||pdHighAccepted||pwHighAccepted){
      bias=1;
      reason=pdLowReclaimed?'PDL swept + reclaimed':pwLowReclaimed?'PWL swept + reclaimed':pdHighAccepted?'PDH accepted':'PWH accepted';
    }
    if(pdHighRejected||pwHighRejected||pdLowAccepted||pwLowAccepted){
      bias=-1;
      reason=pdHighRejected?'PDH swept + rejected':pwHighRejected?'PWH swept + rejected':pdLowAccepted?'PDL accepted':'PWL accepted';
    }
    points.push({time:bar.time,price:smoothedAtr!=null?(bias===1?bar.close-smoothedAtr:bias===-1?bar.close+smoothedAtr:null):null,bias,reason});
  }
  return points;
}

function renderBias(layer) {
  if(!state.result||!state.visibility.bias) return;
  const points=state.biasContext.series;
  const width=layer.clientWidth;
  if(!points){addBiasBadge(layer,'BIAS · HTF LEVEL DATA UNAVAILABLE','#9aa4b2');return;}
  let segment=[],direction=0;
  const colors={1:'#24c7a0',[-1]:'#ff5968'};
  const flush=()=>{
    if(segment.length<2){segment=[];return;}
    layer.append(svgNode('path',{d:segment.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),fill:'none',stroke:colors[direction],'stroke-width':2.4,'stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke',class:'bias-line'}));
    segment=[];
  };
  for(const point of points){
    if(!point.bias||!Number.isFinite(point.price)){flush();direction=point.bias;continue;}
    const x=state.chart.timeScale().timeToCoordinate(point.time),y=state.candles.priceToCoordinate(point.price);
    if(x==null||y==null||x<0||x>width){flush();direction=point.bias;continue;}
    if(direction&&direction!==point.bias)flush();
    direction=point.bias;segment.push({x,y});
  }
  flush();
  const current=points.at(-1);
  addBiasBadge(layer,current?`BIAS · ${current.bias===1?'BULLISH':'BEARISH'} · ${current.reason}`:'BIAS · NEUTRAL',current?colors[current.bias]:'#8993a1');
}

function addBiasBadge(layer,text,color){
  const group=svgNode('g',{class:'bias-status'});
  const label=svgNode('text',{x:13,y:23,fill:color,'font-size':11,'font-family':'Inter,system-ui,sans-serif','font-weight':700,'letter-spacing':'.04em',class:'bias-badge'});
  label.textContent=text;
  const bg=svgNode('rect',{x:7,y:7,width:Math.min(360,Math.max(170,text.length*6.5)),height:25,rx:4,fill:'#0d121a','fill-opacity':.9,stroke:color,'stroke-opacity':.45});
  group.append(bg,label);layer.append(group);
}

function renderLiquidityZones(layer) {
  if (!state.result || !state.visibility.liquidityZones) return;
  const zones=state.result.analytics.liquidityZones||[];
  const width=layer.clientWidth;
  const colors={BSL:'#ff5968',SSL:'#24c7a0'};
  for(const zone of zones){
    const start=state.chart.timeScale().timeToCoordinate(zone.pivotTime??zone.createdTime);
    const brokenAt=zone.broken&&zone.brokenTime?state.chart.timeScale().timeToCoordinate(zone.brokenTime):null;
    const level=zone.side==='BSL'?Number(zone.top):Number(zone.bottom);
    const y=state.candles.priceToCoordinate(level);
    if(start==null||y==null||start>width-55) continue;
    const x=Math.max(0,start),right=Math.min(width-55,zone.broken?(brokenAt??width-55):width-55);
    if(right<=x) continue;
    const color=zone.broken?'#b7bdc7':colors[zone.side];
    const group=svgNode('g',{class:`liquidity-zone ${zone.broken?'broken':''}`});
    const line=svgNode('line',{x1:x,y1:y,x2:right,y2:y,stroke:color,'stroke-width':state.liquidityLineWidth,'stroke-opacity':zone.broken?0.68:0.9,'stroke-dasharray':zone.broken?'5 4':'','vector-effect':'non-scaling-stroke'});
    group.append(line);layer.append(group);
  }
}

async function refreshMtfZoneData() {
  const status = $('#mtfZoneStatus');
  const requestId = ++state.mtfZoneRequestId;
  const symbol = $('#symbol').value;
  const timeframe = $('#mtfZoneTimeframe').value;
  const cutoff = Math.floor(new Date($('#cutoff').value).getTime() / 1000);
  const key = `${symbol}|${timeframe}|${cutoff}`;
  if (key === state.mtfZoneKey && state.mtfZoneBars.length) {
    status.textContent = `${state.mtfZoneBars.length} ${timeframeLabel(timeframe)} bars`;
    status.classList.remove('error');
    renderOverlay();
    return;
  }
  state.mtfZoneBars=[];
  state.mtfZoneKey=null;
  state.mtfZoneRange=null;
  state.mtfZoneCalcKey=null;
  status.textContent = 'Loading…';
  status.classList.remove('error');
  try {
    let bars;
    if (state.result?.run.symbol === symbol && state.result.run.timeframe === timeframe && state.result.run.cutoff === cutoff) {
      bars = state.result.bars;
    } else {
      const query = `symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&cutoff=${cutoff}`;
      const payload = await json(`/api/bars?${query}`);
      bars = payload.bars;
    }
    if (requestId !== state.mtfZoneRequestId) return;
    state.mtfZoneBars = bars || [];
    state.mtfZoneKey = key;
    status.textContent = `${state.mtfZoneBars.length} ${timeframeLabel(timeframe)} bars`;
    if (state.mtfZoneBars.length < Number($('#mtfZoneSwingLength').value) * 2 + 1) {
      status.textContent = `Need ${Number($('#mtfZoneSwingLength').value) * 2 + 1}+ bars`;
    }
    renderOverlay();
  } catch (error) {
    if (requestId !== state.mtfZoneRequestId) return;
    state.mtfZoneBars = [];
    state.mtfZoneKey = null;
    status.textContent = error.message;
    status.classList.add('error');
    renderOverlay();
  }
}

function calculateMtfZoneRange(bars, swingLength) {
  const length = Math.max(10,Math.min(500,Math.round(swingLength)));
  if (!Array.isArray(bars) || bars.length < length * 2 + 1) return null;
  let latestHigh = null, latestLow = null;
  for (let index = length; index + length < bars.length; index++) {
    const bar = bars[index];
    let pivotHigh = true, pivotLow = true;
    for (let offset = index - length; offset <= index + length; offset++) {
      if (offset === index) continue;
      if (bars[offset].high >= bar.high) pivotHigh = false;
      if (bars[offset].low <= bar.low) pivotLow = false;
      if (!pivotHigh && !pivotLow) break;
    }
    if (pivotHigh) latestHigh = {time:bar.time, price:bar.high};
    if (pivotLow) latestLow = {time:bar.time, price:bar.low};
  }
  if (!latestHigh || !latestLow) return null;
  const leftTime = Math.min(latestHigh.time,latestLow.time);
  const start = bars.findIndex(bar => bar.time >= leftTime);
  if (start < 0) return null;
  let top = -Infinity, bottom = Infinity;
  for (let index = start; index < bars.length; index++) {
    top = Math.max(top,bars[index].high);
    bottom = Math.min(bottom,bars[index].low);
  }
  return Number.isFinite(top) && Number.isFinite(bottom) && top > bottom
    ? {top,bottom,leftTime,latestHigh,latestLow}
    : null;
}

function currentMtfZoneRange() {
  const settings = readMtfZoneSettings();
  const key = `${state.mtfZoneKey}|${settings.swingLength}`;
  if (state.mtfZoneCalcKey !== key) {
    state.mtfZoneRange = calculateMtfZoneRange(state.mtfZoneBars, settings.swingLength);
    state.mtfZoneCalcKey = key;
  }
  return state.mtfZoneRange;
}

function chartXForTime(time) {
  const bars = state.result?.bars || [];
  if (!bars.length) return null;
  let low = 0, high = bars.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (bars[middle].time < time) low = middle + 1;
    else high = middle;
  }
  const after = Math.min(bars.length - 1,low);
  const before = Math.max(0,after - (bars[after]?.time === time ? 0 : 1));
  const beforeDistance = Math.abs(bars[before].time-time);
  const afterDistance = Math.abs(bars[after].time-time);
  const closest = beforeDistance <= afterDistance ? bars[before] : bars[after];
  return state.chart.timeScale().timeToCoordinate(closest.time);
}

function renderMtfPremiumDiscount(layer) {
  if (!state.result || !state.visibility.mtfPremiumDiscount) return;
  const settings = readMtfZoneSettings();
  const range = currentMtfZoneRange();
  if (!range) {
    const required=Number(settings.swingLength)*2+1;
    $('#mtfZoneStatus').textContent=state.mtfZoneBars.length<required?`Need ${required}+ bars`:'No confirmed swing range';
    return;
  }
  const width = layer.clientWidth;
  const xStart = chartXForTime(range.leftTime);
  const xEnd = width - 55;
  if (xStart == null || xEnd <= xStart) return;
  const topY = state.candles.priceToCoordinate(range.top);
  const bottomY = state.candles.priceToCoordinate(range.bottom);
  if (topY == null || bottomY == null) return;
  const alpha = Math.max(0,Math.min(1,1-settings.opacity/100));
  const mid = (range.top+range.bottom)/2;
  const rect = (y1,y2,color,label,labelY,labelX) => {
    const y = Math.min(y1,y2), h = Math.max(1,Math.abs(y2-y1));
    layer.append(svgNode('rect',{x:xStart,y,width:xEnd-xStart,height:h,fill:color,'fill-opacity':alpha,stroke:settings.highlightColor,'stroke-opacity':.76,'stroke-width':1,'vector-effect':'non-scaling-stroke',class:'mtf-zone'}));
    const text = svgNode('text',{x:Math.max(xStart+4,Math.min(xEnd-4,labelX)),y:labelY,'text-anchor':'middle',fill:settings.highlightColor,class:'mtf-zone-label'});
    text.textContent = label;
    layer.append(text);
  };
  const premiumBottom = range.top*.95+range.bottom*.05;
  const equilibriumTop = range.top*.525+range.bottom*.475;
  const equilibriumBottom = range.bottom*.525+range.top*.475;
  const discountTop = range.bottom*.95+range.top*.05;
  const xMiddle = xStart+(xEnd-xStart)*.5;
  rect(topY,state.candles.priceToCoordinate(premiumBottom),settings.premiumColor,'Premium',topY+13,xMiddle);
  rect(state.candles.priceToCoordinate(equilibriumTop),state.candles.priceToCoordinate(equilibriumBottom),settings.equilibriumColor,'Equilibrium',state.candles.priceToCoordinate(mid)+4,xEnd-52);
  rect(state.candles.priceToCoordinate(discountTop),bottomY,settings.discountColor,'Discount',bottomY-4,xMiddle);
}

function renderJournalPlans(layer) {
  if (!state.result) return;
  const width=layer.clientWidth;
  for (const plan of state.journal.filter(x=>x.symbol===state.result.run.symbol&&x.timeframe===state.result.run.timeframe)) {
    const values=[['ENTRY',plan.entry_price,'#55a5ff'],['STOP',plan.stop_price,'#ee6974'],['TARGET',plan.target_price,'#5ed39b']];
    for (const [label,price,color] of values) {
      const y=state.candles.priceToCoordinate(Number(price));
      if(y==null) continue;
      layer.append(svgNode('line',{x1:0,x2:width-55,y1:y,y2:y,stroke:color,'stroke-width':label==='ENTRY'?2:1.5,'stroke-dasharray':label==='ENTRY'?'':'5 4',class:'journal-level'}));
      const text=svgNode('text',{x:8,y:y-5,fill:color,class:'journal-level-label'});
      text.textContent=`${plan.side.toUpperCase()} ${label} ${fmt(price)} · ${plan.status.replaceAll('_',' ')}`;
      layer.append(text);
    }
  }
}

function renderPositionDraft(layer) {
  if(!state.positionDraft?.points?.length) return;
  const width=layer.clientWidth;
  const side=$('#tradeSide').value;
  const points=state.positionDraft.points;
  const entry=points[0];
  const stop=points[1];
  const target=points[2];
  const lines=[['ENTRY',entry,'#55a5ff'],['STOP',stop,'#ee6974'],['TARGET',target,'#5ed39b']];
  for(const [name,point,color] of lines){
    if(!point) continue;
    const y=state.candles.priceToCoordinate(point.price);
    if(y==null) continue;
    layer.append(svgNode('line',{x1:0,x2:width-55,y1:y,y2:y,stroke:color,'stroke-width':name==='ENTRY'?2:1.5,'stroke-dasharray':name==='ENTRY'?'':'5 4',class:'journal-level draft-level'}));
    const text=svgNode('text',{x:8,y:y-5,fill:color,class:'journal-level-label'});text.textContent=`${side.toUpperCase()} ${name} ${fmt(point.price)}`;layer.append(text);
  }
}

async function loadJournal(){
  const symbol=$('#symbol').value;
  const payload=await json(`/api/journal?symbol=${encodeURIComponent(symbol)}`);
  state.journal=payload.items;
  renderJournal();
  renderOverlay();
}

function renderJournal(){
  const rows=state.journal;
  const completed=rows.filter(x=>x.outcome);
  const activated=rows.filter(x=>x.status==='entry_activated');
  const wins=completed.filter(x=>Number(x.pnl_points)>0).length;
  const avgR=completed.length?completed.reduce((sum,x)=>sum+Number(x.r_multiple||0),0)/completed.length:null;
  const grossDollars=completed.reduce((sum,x)=>sum+Number(x.gross_dollars||0),0);
  $('#journalSummary').innerHTML=[
    ['Plans',rows.length,'saved setups'],['Active',activated.length,'awaiting outcome'],
    ['Resolved',completed.length,'target / stop / manual'],['Win rate',completed.length?`${(wins/completed.length*100).toFixed(1)}%`:'—',`${wins} winning outcomes`],
    ['Average R',avgR==null?'—':`${avgR.toFixed(2)}R`,'resolved plans'],['Gross P&L',`$${grossDollars.toFixed(2)}`,'MYM points × $0.50'],
  ].map(([label,value,note])=>`<div class="journal-stat"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`).join('');
  $('#journalRows').innerHTML=rows.length?rows.map(plan=>{
    const context=plan.context||{};
    const chips=[context.bias,context.session,context.divergence,context.fib].filter(x=>x&&x!=='not_recorded'&&x!=='not_checked'&&x!=='unknown').join(' · ');
    const stateLabel=plan.outcome?`${plan.outcome.replaceAll('_',' ')} · ${Number(plan.r_multiple||0).toFixed(2)}R`:plan.status.replaceAll('_',' ');
    const close=plan.status==='entry_activated'?`<button class="journal-close" data-close-trade="${esc(plan.trade_id)}">Close</button>`:'';
    return `<article class="journal-card"><div class="journal-card-head"><div class="journal-market"><strong>${esc(plan.symbol)}</strong><small>${esc(plan.timeframe)} · ${new Date(plan.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></div><span class="journal-${esc(plan.side)}">${esc(plan.side.toUpperCase())}</span><span class="journal-state ${plan.outcome?'resolved':''}">${esc(stateLabel)}</span>${close}</div><div class="journal-card-levels"><span>Entry <b>${fmt(plan.entry_price)}</b></span><span>Stop <b>${fmt(plan.stop_price)}</b></span><span>Target <b>${fmt(plan.target_price)}</b></span></div><div class="journal-card-meta"><b>${esc(plan.title)}</b><small>${esc(chips||'No context tags')} · MFE ${fmt(plan.mfe_points)} / MAE ${fmt(plan.mae_points)} pts${plan.pnl_points==null?'':` · ${Number(plan.pnl_points)>=0?'+':''}${fmt(plan.pnl_points)} pts · $${Number(plan.gross_dollars||0).toFixed(2)}`}</small>${plan.notes?`<details class="journal-notes"><summary>Setup notes</summary>${esc(plan.notes)}</details>`:''}</div></article>`;
  }).join(''):'<div class="journal-empty">No user-suggested levels yet. Choose a direction, activate Position, then click entry, stop, and target on the Count Desk chart.</div>';
  document.querySelectorAll('[data-close-trade]').forEach(button=>button.addEventListener('click',()=>closeJournalTrade(button.dataset.closeTrade).catch(showError)));
}

async function closeJournalTrade(tradeId){
  const current=state.result?.summary?.lastClose;
  const raw=window.prompt('Exit price',current==null?'':String(current));
  if(raw==null) return;
  const price=Number(raw);
  if(!Number.isFinite(price)) throw new Error('Enter a valid exit price.');
  await json('/api/journal/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trade_id:tradeId,exit_price:price})});
  await loadJournal();
}

function resizeChartWorkspace(){
  requestAnimationFrame(()=>{
    const box=$('#chartShell');
    state.chart.resize(box.clientWidth,box.clientHeight);
    renderOverlay();
  });
}

function toggleInspector(){
  const workspace=$('#chartWorkspace');
  const collapsed=workspace.classList.toggle('inspector-collapsed');
  setInspectorVisibility(!collapsed);
  window.setTimeout(resizeChartWorkspace,190);
}

function setInspectorVisibility(visible){
  const button=$('#toggleInspector');
  const workspace=$('#chartWorkspace');
  workspace.classList.toggle('inspector-collapsed',!visible);
  button.setAttribute('aria-pressed',String(visible));
  button.classList.toggle('inspector-collapsed',!visible);
  $('#inspectorCollapsedTag').hidden=visible;
  localStorage.setItem('batty-inspector-visible-v2',String(visible));
}

function toggleChat(){
  const main=$('main');
  const collapsed=main.classList.toggle('chat-collapsed');
  localStorage.setItem('batty-chat-visible',String(!collapsed));
  $('#toggleChat').setAttribute('aria-pressed',String(!collapsed));
  $('#toggleChat').textContent=collapsed?'Show Batty':'Batty';
  window.setTimeout(resizeChartWorkspace,190);
}

function applySavedPanelLayout(){
  const insightsVisible=localStorage.getItem('batty-inspector-visible-v2')==='true';
  const chatVisible=localStorage.getItem('batty-chat-visible')!=='false';
  setInspectorVisibility(insightsVisible);
  $('main').classList.toggle('chat-collapsed',!chatVisible);
  $('#toggleChat').setAttribute('aria-pressed',String(chatVisible));
  $('#toggleChat').textContent=chatVisible?'Batty':'Show Batty';
}

function setChartInfoVisible(visible) {
  $('#chartContext').hidden = !visible;
  const button = $('#toggleChartInfo');
  button.setAttribute('aria-pressed', String(visible));
  button.textContent = visible ? 'ⓘ Hide info' : 'ⓘ Chart info';
  localStorage.setItem('batty-chart-info-visible', String(visible));
}

function toggleExpanded(force){
  const workspace=$('#chartWorkspace');
  const expanded=force ?? !workspace.classList.contains('expanded');
  workspace.classList.toggle('expanded',expanded);
  document.body.classList.toggle('chart-expanded',expanded);
  $('#expandChart').setAttribute('aria-pressed',String(expanded));
  $('#expandChart').textContent=expanded?'Exit full view':'Expand';
  window.setTimeout(resizeChartWorkspace,40);
}

function renderInsightTarget(layer) {
  const id = state.insightLocked || state.insightHover;
  const row = state.result?.analytics.insight?.nextSubwaves?.find(item => item.id === id);
  if (!row) return;
  const source = pointToPixels({time:row.sourceTime,price:row.sourcePrice});
  if (source) layer.append(svgNode('circle',{cx:source.x,cy:source.y,r:8,class:'insight-source'}));
  const y1 = state.candles.priceToCoordinate(row.targetZoneHigh);
  const y2 = state.candles.priceToCoordinate(row.targetZoneLow);
  const x = state.chart.timeScale().timeToCoordinate(row.time);
  if (y1 == null || y2 == null || x == null) return;
  const left = Math.max(0, Math.min(layer.clientWidth - 8, x - 18));
  const width = Math.max(8, Math.min(150, layer.clientWidth - left));
  layer.append(svgNode('rect',{x:left,y:Math.min(y1,y2),width,height:Math.max(5,Math.abs(y2-y1)),class:'insight-target'}));
  const label = svgNode('text',{x:left+5,y:Math.min(y1,y2)-5,class:'insight-target-label'});
  label.textContent = `${row.wave} minimum target ${fmt(row.target)}`;
  layer.append(label);
}

async function loadDrawings() {
  const payload = await json(`/api/drawings?${drawingQuery()}`);
  state.drawings = payload.drawings;
  state.selectedId = null;
  renderOverlay();
}

async function saveDrawing(type, points, text = '') {
  const drawing = await json('/api/drawings', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({symbol:$('#symbol').value,timeframe:$('#timeframe').value,type,points,text,style:{color:$('#drawColor').value,width:2,dash:'solid'}}),
  });
  state.drawings.push(drawing);
  state.selectedId = drawing.id;
  renderOverlay();
  $('#chartMessage').textContent = `Saved ${type} drawing · ${state.drawings.length} drawings on this chart.`;
}

async function removeDrawing(id) {
  if (!id) return;
  await json(`/api/drawings?id=${encodeURIComponent(id)}`, {method:'DELETE'});
  state.drawings = state.drawings.filter(d => d.id !== id);
  state.selectedId = null;
  renderOverlay();
}

function setMode(mode) {
  state.mode = mode;
  state.draftAnchor = null;
  state.draftPointer = null;
  state.selectedId = null;
  document.querySelectorAll('.tool').forEach(x => x.classList.toggle('active', x.dataset.tool === mode));
  const active = mode !== 'pan';
  $('#drawingLayer').classList.toggle('active', active);
  $('#chartShell').classList.toggle('drawing', ['trend','horizontal','rectangle','text','erase','trade'].includes(mode));
  $('#chartShell').classList.toggle('selecting', mode === 'select' || mode === 'erase');
  state.chart.applyOptions({handleScroll: !active, handleScale: !active});
  const labels = {pan:'Pan and zoom',select:'Select a drawing',trend:'Click two anchors',horizontal:'Click a price',rectangle:'Click two corners',text:'Click text location',erase:'Click a drawing to delete it',trade:'Click entry, stop, then target'};
  $('#toolState').textContent = labels[mode]||'Liquidity position tool';
  renderOverlay();
}

function eventPoint(event) {
  const rect = $('#drawingLayer').getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const time = state.chart.timeScale().coordinateToTime(x);
  const price = state.candles.coordinateToPrice(y);
  if (time == null || price == null) return null;
  return {time: Number(time), price};
}

async function overlayClick(event) {
  if (state.mode === 'erase') {
    const id = event.target.dataset.id;
    if (id) await removeDrawing(id);
    return;
  }
  if (state.mode === 'select') {
    state.selectedId = event.target.dataset.id || null;
    renderOverlay();
    return;
  }
  const point = eventPoint(event);
  if (!point || state.mode === 'pan') return;
  if(state.mode==='trade'){
    point.price=Math.round(point.price);
    const points=state.positionDraft?.points||[];
    points.push(point);
    state.positionDraft={points};
    const steps=['Click the entry level on the chart.','Now click the stop level.','Now click the profit target.'];
    if(points.length<3){$('#positionInstructions').textContent=steps[points.length];renderOverlay();return;}
    const [entry,stop,target]=points;
    const side=$('#tradeSide').value;
    if((side==='long'&&!(stop.price<entry.price&&entry.price<target.price))||(side==='short'&&!(target.price<entry.price&&entry.price<stop.price))){
      state.positionDraft={points:[entry]};
      $('#positionInstructions').textContent=side==='long'?'Long needs stop below entry and target above entry. Click the stop again.':'Short needs target below entry and stop above entry. Click the stop again.';
      renderOverlay();return;
    }
    state.positionStep=null;
    $('#tradeDraftSummary').textContent=`${side.toUpperCase()} · ${$('#symbol').value} · ${$('#timeframe').value} · entry ${fmt(entry.price)} · stop ${fmt(stop.price)} · target ${fmt(target.price)}`;
    $('#tradeTitle').value='User suggested level';
    $('#tradeNotes').value='';
    $('#tradeNotesDialog').showModal();
    return;
  }
  if (state.mode === 'horizontal') return saveDrawing('horizontal', [point]);
  if (state.mode === 'text') {
    const value = window.prompt('Chart note');
    if (value?.trim()) await saveDrawing('text', [point], value.trim());
    return;
  }
  if (!state.draftAnchor) {
    state.draftAnchor = point;
    state.draftPointer = point;
    renderOverlay();
  } else {
    const first = state.draftAnchor;
    state.draftAnchor = null;
    state.draftPointer = null;
    await saveDrawing(state.mode, [first, point]);
  }
}

async function build() {
  if (state.building) return;
  state.building = true;
  const button = $('#build');
  button.disabled = true;
  button.textContent = 'Building…';
  try {
    const cutoff = Math.floor(new Date($('#cutoff').value).getTime() / 1000);
    const url = `/api/counts?symbol=${encodeURIComponent($('#symbol').value)}&timeframe=${encodeURIComponent($('#timeframe').value)}&cutoff=${cutoff}`;
    state.result = await json(url);
    await loadBiasContext(state.result);
    state.smartHover = null;
    await loadDrawings();
    await refreshMtfZoneData();
    renderLedger(state.result);
    renderChart(state.result);
    await loadJournal();
  } catch (error) {
    $('#chartMessage').textContent = error.message;
    $('#apiState').textContent = 'Count request failed';
    $('#apiState').className = 'api-state bad';
  } finally {
    button.disabled = false;
    button.textContent = 'Build count';
    state.building = false;
  }
}

$('#symbol').addEventListener('change', () => {
  fillTimeframes();
  if (updateTimeframeAvailability()) build();
  else clearChartForNoData();
  refreshFeedStatus().catch(showError);
});
$('#timeframe').addEventListener('change', () => {
  syncTimeframeButtons();
  const tf = selectedMarket()?.timeframes.find(x => x.timeframe === $('#timeframe').value);
  if (tf?.last_time) $('#cutoff').value = localCutoff(tf.last_time);
  updateLiquidityControls();
  if (updateTimeframeAvailability()) build();
  else clearChartForNoData();
  refreshFeedStatus().catch(showError);
});
$('#build').addEventListener('click', build);
$('#feedDetails > summary').addEventListener('click', () => { state.feedDisclosureManual = true; });
$('#resetChart').addEventListener('click', resetChartView);
$('#chartShell').addEventListener('contextmenu', event => {
  event.preventDefault();
  resetChartView();
});
$('#refreshFeed').addEventListener('click', () => syncFeed(false));
$('#emptySync').addEventListener('click', () => syncFeed(false));
$('#tickstreamQuoteProbe').addEventListener('click', () => probeTickstreamQuote());
$('#syncProvider').addEventListener('change', () => refreshFeedStatus().catch(showError));
$('#toggleInspector').addEventListener('click',toggleInspector);
$('#toggleChat').addEventListener('click',toggleChat);
$('#toggleChartInfo').addEventListener('click', () => setChartInfoVisible($('#chartContext').hidden));
$('#expandChart').addEventListener('click',()=>toggleExpanded());
$('#refreshJournal').addEventListener('click',()=>loadJournal().catch(showError));
$('#positionTool').addEventListener('click',()=>{
  state.positionDraft={points:[]};state.positionStep='entry';setMode('trade');
  $('#cancelPosition').disabled=false;$('#positionTool').classList.add('active');
  $('#positionInstructions').textContent='Click the entry level on the chart.';
});
$('#cancelPosition').addEventListener('click',()=>{
  state.positionDraft=null;state.positionStep=null;setMode('pan');
  $('#cancelPosition').disabled=true;$('#positionTool').classList.remove('active');
  $('#positionInstructions').textContent='Choose a direction, then click entry, stop, and target on the chart.';
});
$('#tradeSide').addEventListener('change',renderOverlay);
$('#discardTrade').addEventListener('click',()=>{ $('#tradeNotesDialog').close();$('#cancelPosition').click(); });
$('#tradeNotesDialog').addEventListener('close',()=>{if(!state.positionDraft?.saved){state.positionDraft=null;setMode('pan');$('#positionTool').classList.remove('active');$('#cancelPosition').disabled=true;renderOverlay();}});
$('#tradeNotesForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const points=state.positionDraft?.points||[];
  if(points.length!==3)return;
  const [entry,stop,target]=points;
  const last=state.result?.summary?.lastBar;
  if(last==null||entry.time>last){showError(new Error('Choose an entry point on a stored price bar.'));return;}
  const context={bias:$('#tradeBias').value,session:$('#tradeSession').value,divergence:$('#tradeDivergence').value,fib:$('#tradeFib').value};
  try{
    await json('/api/journal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      symbol:$('#symbol').value,timeframe:$('#timeframe').value,side:$('#tradeSide').value,
      entry_time:entry.time,entry_price:entry.price,stop_price:stop.price,target_price:target.price,
      tracking_after:last,title:$('#tradeTitle').value,notes:$('#tradeNotes').value,context,
    })});
    state.positionDraft=null;$('#tradeNotesDialog').close();$('#cancelPosition').disabled=true;$('#positionTool').classList.remove('active');
    $('#positionInstructions').textContent='Saved to the journal. Choose a direction and create another setup when ready.';
    setMode('pan');await loadJournal();
  }catch(error){showError(error);}
});
document.querySelectorAll('.tool').forEach(button => button.addEventListener('click', () => setMode(button.dataset.tool)));
document.querySelectorAll('[data-inspector-tab]').forEach(button => button.addEventListener('click', () => setInspectorTab(button.dataset.inspectorTab)));
$('#syncProvider').addEventListener('change', () => {
  localStorage.setItem('batty-feed-provider', $('#syncProvider').value);
  refreshFeedStatus().catch(showError);
});
document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => {
  state.visibility[input.dataset.layer] = input.checked;
  syncAllLayersToggle();
  if (input.dataset.layer === 'mtfPremiumDiscount') {
    localStorage.setItem('batty-mtf-zones-visible',String(input.checked));
    if (!input.checked) { $('#mtfZoneStatus').textContent='Off'; $('#mtfZoneStatus').classList.remove('error'); }
    else refreshMtfZoneData().catch(showError);
  }
  if (input.dataset.layer === 'price') state.candles.applyOptions({visible: input.checked});
  if (input.dataset.layer === 'counts' || input.dataset.layer === 'swings') {
    const markers = countMarkers(state.result);
    if (state.markers) state.markers.setMarkers(markers);
  }
  renderOverlay();
  updateToolTemplateStatus();
}));
$('#toggleAll').addEventListener('change', event => {
  document.querySelectorAll('[data-layer]').forEach(input => { input.checked = event.target.checked; state.visibility[input.dataset.layer] = event.target.checked; });
  syncAllLayersToggle();
  localStorage.setItem('batty-mtf-zones-visible',String(event.target.checked));
  if (event.target.checked) refreshMtfZoneData().catch(showError);
  else { $('#mtfZoneStatus').textContent='Off'; $('#mtfZoneStatus').classList.remove('error'); }
  state.candles.applyOptions({visible: event.target.checked});
  if (state.markers) state.markers.setMarkers(event.target.checked ? countMarkers(state.result) : []);
  renderOverlay();
  updateToolTemplateStatus();
});
$('#drawingLayer').addEventListener('click', event => overlayClick(event).catch(showError));
$('#drawingLayer').addEventListener('mousemove', event => {
  if (state.draftAnchor) { state.draftPointer = eventPoint(event); renderOverlay(); }
});
$('#drawingLayer').addEventListener('dblclick', event => event.preventDefault());
$('#deleteDrawing').addEventListener('click', () => removeDrawing(state.selectedId).catch(showError));
$('#undoDrawing').addEventListener('click', () => removeDrawing(state.drawings.at(-1)?.id).catch(showError));
$('#clearDrawings').addEventListener('click', async () => {
  if (!state.drawings.length || !window.confirm(`Clear ${state.drawings.length} drawings from this chart?`)) return;
  await json(`/api/drawings?id=all&${drawingQuery()}`, {method:'DELETE'});
  state.drawings = []; state.selectedId = null; renderOverlay();
});
$('#drawColor').addEventListener('change', renderOverlay);
['smartSupportEnabled','smartFibsEnabled','smartFibColor'].forEach(id => $(`#${id}`).addEventListener('change', () => {
  renderOverlay();
  updateToolTemplateStatus();
}));
$('#smartFibWidth').addEventListener('input', event => {
  $('#smartFibWidthValue').textContent = `${event.target.value.replace('.0','')}px`;
  renderOverlay();
});
$('#liquidityLineWidth').value = String(state.liquidityLineWidth);
$('#liquidityLineWidthValue').textContent = `${state.liquidityLineWidth}px`;
$('#liquidityLineWidth').addEventListener('input', event => {
  state.liquidityLineWidth=Number(event.target.value);
  $('#liquidityLineWidthValue').textContent = `${state.liquidityLineWidth}px`;
  localStorage.setItem('batty-liquidity-line-width',String(state.liquidityLineWidth));
  renderOverlay();
});
$('#mtfZoneTimeframe').addEventListener('change', () => {
  saveMtfZoneSettings();
  state.mtfZoneKey=null;
  refreshMtfZoneData().catch(showError);
});
$('#mtfZoneSwingLength').addEventListener('change', () => {
  saveMtfZoneSettings();
  state.mtfZoneCalcKey=null;
  if (state.mtfZoneBars.length) renderOverlay();
  else refreshMtfZoneData().catch(showError);
});
['mtfPremiumColor','mtfEquilibriumColor','mtfDiscountColor','mtfHighlightColor'].forEach(id => $(`#${id}`).addEventListener('input', () => {
  saveMtfZoneSettings();
  renderOverlay();
}));
$('#mtfZoneOpacity').addEventListener('input', () => {
  saveMtfZoneSettings();
  renderOverlay();
});

const mtfSettings = {
  ...savedMtfSettings,
  swingLength:Math.max(10,Math.min(500,Math.round(Number(savedMtfSettings.swingLength)||50))),
};
if (mtfSettings.swingLength) $('#mtfZoneSwingLength').value=String(mtfSettings.swingLength);
if (/^#[0-9a-f]{6}$/i.test(mtfSettings.premiumColor||'')) $('#mtfPremiumColor').value=mtfSettings.premiumColor;
if (/^#[0-9a-f]{6}$/i.test(mtfSettings.equilibriumColor||'')) $('#mtfEquilibriumColor').value=mtfSettings.equilibriumColor;
if (/^#[0-9a-f]{6}$/i.test(mtfSettings.discountColor||'')) $('#mtfDiscountColor').value=mtfSettings.discountColor;
if (/^#[0-9a-f]{6}$/i.test(mtfSettings.highlightColor||'')) $('#mtfHighlightColor').value=mtfSettings.highlightColor;
if (Number.isFinite(Number(mtfSettings.opacity))) $('#mtfZoneOpacity').value=String(Math.max(0,Math.min(100,Number(mtfSettings.opacity))));
document.querySelector('[data-layer="mtfPremiumDiscount"]').checked=savedMtfVisible;
$('#mtfZoneOpacityValue').textContent=`${$('#mtfZoneOpacity').value}%`;
syncAllLayersToggle();
initToolbarDock();

const INTELLECT_SEATS = [
  {id:'batty',name:'Batty',tag:'FIRSTMATE',tone:'#57cbd9',step:'Human interface',lead:'Owns intake, task identity, permissions, dispatch, gates, and delivery.',skill:'Firstmate supervisor contract',source:'Firstmate · AGENTS.md',about:'Batty is the single human-facing operator for this loop. Every mandate and decision enters through Firstmate; child tasks and lab outputs return through its ledger.',owns:['Creates the parent mission and records scope','Checks pre-collection rights, cost, retention, and human approval','Dispatches isolated lab tasks and reconciles their results'],handoff:'Routes scoped work to the CFO and trading lab seats.'},
  {id:'cfo',name:'CFO',tag:'EXEC LEAD',tone:'#c2a8ff',step:'Research agenda',lead:'Coordinates the trading research agenda and synthesizes accepted lab outputs.',skill:'Trading CFO role brief',source:'Firstmate workflow · CFO seat',about:'The CFO tracks the parent mission, separate market labs, child task IDs, artifacts, and blockers. Synthesis uses only accepted lab outputs and preserves unresolved decisions.',owns:['Records mission scope and child task IDs in the ledger','Keeps MES, BTC, and ETH work separated by task','Synthesizes accepted research with unresolved decisions visible'],handoff:'Receives the mandate from Firstmate; returns the synthesis to Firstmate.'},
  {id:'scientist',name:'Scientist',tag:'DAILY FORECAST',tone:'#6db6ff',step:'Forecast & method',lead:'Publishes immutable daily level predictions and reviews next-day outcomes.',skill:'Chief Scientist role brief',source:'agents/intellect/chief-scientist.md',about:'The Chief Scientist ranks active liquidity levels on 60m, 30m, 15m, 5m, and 1m, freezes risk-bounded daily forecasts, and measures the next-day results. The 75% objective is a target, not a current performance claim.',owns:['Freeze each daily forecast before the forward window','Record probability, trigger, stop, target, horizon, evidence, and version','Report resolved accuracy and uncertainty separately by timeframe','Propose method changes only as new prospective versions'],handoff:'Receives cited research from the Lead Researcher; sends frozen forecasts for independent review.'},
  {id:'lead-researcher',name:'Lead Researcher',tag:'GLOBAL RESEARCH',tone:'#83c7a7',step:'Research & sourcing',lead:'Finds and evaluates current research across authorized public internet sources and dashboard tools.',skill:'Lead Researcher role brief',source:'agents/intellect/lead-researcher.md',about:'The Lead Researcher searches broadly across public and otherwise authorized sources, follows primary citations, and investigates the dashboard indicators and analysis tools relevant to the Scientist’s frozen question.',owns:['Return direct source links, dates, evidence, limitations, and conflicts','Separate verified facts, source claims, inference, and unknowns','Record indicator definitions, inputs, timeframe behavior, and repaint risks','Flag licensing and retention boundaries before data collection'],handoff:'Delivers a cited evidence packet to the Chief Scientist before the daily forecast cutoff.',fileRole:'lead-researcher'},
  {id:'analyst',name:'Analyst',tag:'EVIDENCE',tone:'#7fe2b1',step:'Evidence packet',lead:'Builds the source-bounded evidence packet from permitted data.',skill:'Trading Analyst role brief',source:'Firstmate workflow · lab seat',about:'The Analyst assembles the input record from approved charts or data. Every observation retains its source, timeframe, and limitation; unavailable facts stay unknown.',owns:['Preserve source identity and evidence timestamps','Separate observations, inferences, and unknowns','Stop if scope or data authority is unclear'],handoff:'Passes the evidence packet to Cleo.'},
  {id:'cleo',name:'Cleo',tag:'CHART ANALYST',tone:'#f0b55b',step:'Chart analysis & coaching',lead:'Reads charts, prepares conditional scenarios, and coaches Mark through trade review.',skill:'Cleo · Chart Analysis & Trading Mentor',source:'The Trader · .agents/skills/cleo/SKILL.md',about:'Cleo reviews charts and conditional trade ideas, teaches Mark’s HTF-level/1m-confirmation approach, journals reported trades from approved evidence, and keeps Elliott Wave analysis provisional. The local specialist handoff does not create a durable Firstmate crew task or provide broker control.',owns:['Read charts from higher timeframe to execution timeframe','Explain Elliott Wave, liquidity, Fibonacci, divergence, S/R and SMC with method limits','Provide wait/conditional scenarios with triggers, invalidations and room checks','Journal each distinct trade while separating verified fills from reported facts','Keep reflection and learning proposals evidence-based and human-reviewed','No live order routing or unverified market/account access'],handoff:'Returns the technical read or journal draft to Batty for attributed delivery.',fileRole:'cleo'},
  {id:'reviewer',name:'Reviewer',tag:'INDEPENDENT',tone:'#f08d9e',step:'Accept / return / block',lead:'Independently checks the evidence, method, rules, and acceptance criteria.',skill:'Independent Reviewer role brief',source:'Firstmate workflow · lab seat',about:'The reviewer evaluates the frozen work independently. The disposition is explicit: accept, return, reject, or block, with evidence tied to the stated acceptance criteria.',owns:['Check source provenance and criteria coverage','Challenge broken Elliott rules or unsupported claims','Record a reasoned disposition and any required return work'],handoff:'Only accepted lab outputs are eligible for CFO synthesis.'},
  {id:'paper',name:'Paper Trader',tag:'PAPER ONLY',tone:'#f2d65d',step:'Hypothetical record',lead:'Records a paper simulation of accepted scenarios.',skill:'Trader / execution role brief',source:'agents/intellect/paper-trader.md',about:'This seat is bounded to paper simulation and hypothetical records. It does not connect to a broker or submit orders.',owns:['Use only scenarios accepted by review','Keep hypothetical triggers and outcomes separate from live markets','Do not place, modify, or cancel any order'],handoff:'Passes paper records to Outcome and Method Review.',fileRole:'paper-trader'},
  {id:'outcome',name:'Outcome',tag:'METHOD REVIEW',tone:'#72c4c8',step:'Measure & learn',lead:'Measures frozen scenarios and reviews method quality after the window closes.',skill:'Outcome and Method Review role brief',source:'Firstmate workflow · lab seat',about:'Outcome review measures the declared scenario window and reports supported, contradicted, unresolved, or not measurable. Candidate lessons require evidence and remain unpromoted until Firstmate review.',owns:['Keep price-action outcomes separate from execution results','Name the first unsupported assumption or rule failure','Return candidate lessons for controlled Firstmate evaluation'],handoff:'Returns artifacts and disposition to the CFO run ledger.'},
];

function avatarSvg(tone, seed=0) {
  const hair=['#252330','#392d29','#31213a','#28343d','#423022','#262b45','#3b2927','#243936'][seed%8];
  const skin=['#dbab83','#e8bf9c','#c98866','#edc39d','#d39a75','#efcfaa','#bd8268','#dba986'][seed%8];
  const rows=['..HHHH..','.HHHHHH.','.HSSSSH.','.SSEESS.','.SSSSSS.','..SSSS..','.AAAAAA.','.AA..AA.'];
  const colors={H:hair,S:skin,E:'#17202a',A:tone};
  const tiles=[];
  rows.forEach((row,y)=>[...row].forEach((cell,x)=>{if(colors[cell])tiles.push(`<rect x="${x*4}" y="${y*4}" width="4" height="4" fill="${colors[cell]}"/>`)}));
  return `<svg class="agent-pixel" viewBox="0 0 32 32" role="img" aria-label="Pixel portrait">${tiles.join('')}</svg>`;
}

function initIntellectRibbon() {
  const roster=$('#agentRoster');
  roster.innerHTML=INTELLECT_SEATS.map((seat,index)=>`<button class="agent-seat" type="button" data-agent-id="${seat.id}" aria-haspopup="dialog" title="Open ${seat.name} role skill"><span>${avatarSvg(seat.tone,index)}</span><span class="agent-seat-copy"><strong>${seat.name}</strong><small>${seat.tag}</small></span></button>`).join('');
  const dialog=$('#agentSkillDialog');
  const content=$('#agentSkillContent');
  roster.addEventListener('click',event=>{
    const button=event.target.closest('[data-agent-id]');
    if(!button)return;
    const seat=INTELLECT_SEATS.find(item=>item.id===button.dataset.agentId);
    if(!seat)return;
    $('#agentSkillGroup').textContent=`${seat.step.toUpperCase()} · WORKFLOW SEAT`;
    $('#agentSkillTitle').textContent=seat.skill;
    content.innerHTML=`<p>${seat.about}</p><div class="skill-source"><strong>Source file</strong><code>${esc(seat.source)}</code></div><p>${esc(seat.lead)}</p><h3>Seat responsibilities</h3><ul>${seat.owns.map(item=>`<li>${esc(item)}</li>`).join('')}</ul><p class="skill-boundary"><strong>Handoff:</strong> ${esc(seat.handoff)}<br><br><strong>Runtime:</strong> This seat is defined in the workflow. No agent has been dispatched from Count Desk; the loop is on standby.</p><details class="skill-file-details" open><summary>Skill file text</summary><pre class="skill-file-text">Loading skill file…</pre></details>`;
    const skillText=content.querySelector('.skill-file-text');
    fetch(`./agent-skills/${encodeURIComponent(seat.fileRole||seat.id)}.md`).then(async response=>{
      if(!response.ok)throw new Error('Skill file unavailable');
      skillText.textContent=await response.text();
    }).catch(error=>{skillText.textContent=`Could not load skill file: ${error.message}`});
    dialog.showModal();
  });
  $('#closeAgentSkill').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
}
initIntellectRibbon();

$('#liquidityLabLink').addEventListener('click', async event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const link = event.currentTarget;
  const originalText = link.textContent;
  link.textContent = 'Starting Lab…';
  link.setAttribute('aria-busy', 'true');
  try {
    const result = await json('/api/liquidity-lab/start', {method:'POST'});
    window.location.assign(result.url);
  } catch (error) {
    $('#apiState').textContent = `Liquidity Lab unavailable: ${error.message}`;
    $('#apiState').className = 'api-state bad';
    link.title = error.message;
    link.textContent = originalText;
    link.removeAttribute('aria-busy');
  }
});

function showError(error) { $('#chartMessage').textContent = error.message; }
document.addEventListener('keydown', event => {
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const keys = {v:'pan',s:'select',t:'trend',h:'horizontal',r:'rectangle',n:'text',e:'erase'};
  if (keys[event.key.toLowerCase()]) setMode(keys[event.key.toLowerCase()]);
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId) removeDrawing(state.selectedId).catch(showError);
  if (event.key === 'Escape') {
    if ($('#chartWorkspace').classList.contains('expanded')) toggleExpanded(false);
    else setMode('pan');
  }
});

try {
  applySavedPanelLayout();
  setChartInfoVisible(savedChartInfoVisible);
  initChart();
  initToolTemplates();
  await loadCatalog();
  await refreshFeedStatus();
  window.setInterval(() => refreshFeedStatus().catch(error => { $('#feedMeta').textContent = error.message; }), 15000);
  $('#guidePattern').innerHTML = Object.entries(GUIDE_PATTERNS).map(([key,pattern]) => `<option value="${key}">${esc(pattern.name)}</option>`).join('');
  $('#guidePattern').addEventListener('change', renderWaveGuide);
  renderWaveGuide();
  await build();
} catch (error) {
  $('#apiState').textContent = 'Historical store unavailable';
  $('#apiState').className = 'api-state bad';
  $('#chartMessage').textContent = error.message;
}

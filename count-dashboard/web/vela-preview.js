const $ = selector => document.querySelector(selector);
import {buildChartContract} from './chart-contract.js';
let catalog = [];
let velaChart = null;
let currentContract = null;
let paperOrders = [];
let paperPositions = [];
let paperBusy = false;
let replayBounds = null;
let replayKey = '';
let indicatorTypeMemory = ['volume'];
let indicatorInputMemory = {};
const indicatorStorageKey = 'count-desk-vela-indicators-v1';
const indicatorInputStorageKey = 'count-desk-vela-indicator-inputs-v1';
const indicatorDefinitions = [
  {type:'volume', label:'Volume', note:'native pane', inputs:{}},
  {type:'sma', label:'SMA', note:'price overlay', inputs:{length:20, source:'Close'}},
  {type:'ema', label:'EMA', note:'price overlay', inputs:{length:20, source:'Close'}},
  {type:'rsi', label:'RSI', note:'study pane', inputs:{length:14, source:'Close'}},
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

function activeIndicatorLabels() {
  const present = presentNativeTypes();
  const selected = present.size ? present : storedIndicatorTypes();
  const labels = indicatorDefinitions.filter(def => selected.has(def.type)).map(indicatorDisplayLabel);
  return labels.length ? labels.join(', ') : 'None selected';
}

function renderIndicatorContext(contract = currentContract) {
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
    $('#velaIndicatorSummary').textContent = 'registry unavailable';
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
    return `<button type="button" class="vela-indicator-row ${active ? 'active' : ''}" data-vela-indicator="${def.type}" ${supported ? '' : 'disabled'} aria-pressed="${active}"><span><b>${indicatorDisplayLabel(def)}</b><small>${def.note}</small></span><strong>${state}</strong></button>`;
  }).join('');
  $('#velaIndicatorSummary').textContent = `${[...present].filter(type => indicatorDefinitions.some(def => def.type === type)).length} active · native registry`;
  renderIndicatorSettings();
  renderIndicatorContext();
}

function renderIndicatorSettings() {
  const select = $('#velaIndicatorSettingType');
  const input = $('#velaIndicatorSettingLength');
  const status = $('#velaIndicatorSettingStatus');
  if (!select || !input || !status) return;
  const periodDefs = indicatorDefinitions.filter(def => Object.hasOwn(def.inputs, 'length'));
  const previous = select.value;
  select.innerHTML = periodDefs.map(def => `<option value="${def.type}">${indicatorDisplayLabel(def).replace(/ \d+$/, '')}</option>`).join('');
  select.value = periodDefs.some(def => def.type === previous) ? previous : (periodDefs[0]?.type || '');
  const selected = indicatorDefinitions.find(def => def.type === select.value);
  const hasPeriod = Boolean(selected);
  input.disabled = !hasPeriod;
  $('#velaIndicatorSettingApply').disabled = !hasPeriod;
  input.value = hasPeriod ? indicatorInputs(selected).length : '';
  status.textContent = hasPeriod ? `Stored period for ${selected.label}. Apply to refresh the chart.` : 'No period input is available for this study.';
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
    renderTickstreamReadiness(await getJson('/api/tickstream/status'));
  } catch (error) {
    $('#velaFeedState').textContent = 'Source status unavailable';
    $('#velaFeedMeta').textContent = error.message;
    renderTickstreamReadiness({status:'unknown'});
  }
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

function tickstreamDataFeed() {
  const getBars = async () => {
    const payload = await getJson('/api/tickstream/bars?symbol=NQ');
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

async function loadTickstreamChart() {
  const button = $('#velaTickstreamProbe');
  button.disabled = true;
  try {
    let state = await getJson('/api/tickstream/status');
    renderTickstreamReadiness(state);
    if (state.state === 'error') throw new Error(state.message);
    setStatus(`Tickstream NQ connected · seven-day history ${state.historyState || 'loading'} · loading recent candles…`);
    const chartPayload = await getJson('/api/tickstream/bars?symbol=NQ');
    if (!chartPayload.bars?.length) throw new Error('Tickstream is connected but has not delivered NQ chart ticks yet.');
    let data = chartPayload.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
    let fullHistoryLoaded = chartPayload.historyState === 'complete';
    if (velaChart) { try { velaChart.destroy?.(); } catch {} velaChart = null; }
    $('#velaChart').replaceChildren();
    $('#cleoBriefing').hidden = true;
    const feed = tickstreamDataFeed();
    velaChart = new window.Vela.Vela('#velaChart', {
      symbol:'NQ', timeframe:'1', bars:10080, data, live:true,
      theme:'dark', drawings:true, volume:false, currentPriceLine:true,
    }, {dataFeed:feed});
    window.countDeskVelaChart = velaChart;
    await velaChart.ready();
    await applyStoredIndicators();
    $('#velaPaperTab').disabled = true;
    $('#velaPaperMarket').textContent = 'NQ · 1M · Tickstream';
    $('#velaPaperSource').textContent = 'Paper simulation is disabled for the streamed NQ instrument.';
    window.countDeskVelaContext = {tab:'Tickstream', symbol:'NQ', timeframe:'1M', cutoff:state.lastSourceTime ? Math.floor(Date.parse(state.lastSourceTime) / 1000) : null};
    window.dispatchEvent(new Event('countdesk:chart-context'));
    const updateState = async () => {
      if ($('#velaSymbol').value !== 'TICKSTREAM:NQ') return;
      try {
        const latest = await getJson('/api/tickstream/status');
        renderTickstreamReadiness(latest);
        if (latest.historyState === 'complete' && !fullHistoryLoaded && velaChart) {
          const complete = await getJson('/api/tickstream/bars?symbol=NQ');
          data = complete.bars.map(bar => ({...bar, time:Number(bar.time) * 1000}));
          await velaChart.setMarket({symbol:'NQ', timeframe:'1', bars:10080, data});
          await applyStoredIndicators();
          fullHistoryLoaded = true;
        }
        $('#velaProvenance').textContent = `Tickstream NQ · up-to-7-day history ${latest.historyState || 'loading'} · ${data.length} one-minute bars · ${latest.receivedTicks || 0} ticks received · ${tickstreamLag(latest.lastSourceTime)} · source timestamp ${latest.lastSourceTime || 'waiting'}.`;
      } catch {}
    };
    clearInterval(window.countDeskTickstreamStatusTimer);
    window.countDeskTickstreamStatusTimer = setInterval(updateState, 4000);
    $('#velaProvenance').textContent = `Tickstream NQ · up-to-7-day history ${chartPayload.historyState || state.historyState || 'loading'} · ${data.length} one-minute bars · ${state.receivedTicks || 0} ticks received · ${tickstreamLag(state.lastSourceTime)} · source timestamp ${state.lastSourceTime || 'waiting'}.`;
    setStatus(`Tickstream NQ chart connected · ${state.state} · memory-only candles.`);
  } catch (error) {
    $('#velaTickstreamStatus').textContent = error.message;
    setStatus(error.message, true);
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
  const orderCards = activeOrders.map(order => `<article class="vela-paper-position"><div class="vela-paper-position-top"><b>${escapeHtml(order.side.toUpperCase())} ${order.quantity}</b><span>QUEUED</span></div><small>${escapeHtml(order.timeframe)} · after ${new Date(Number(order.placed_after_bar_time) * 1000).toLocaleString()}</small><div class="vela-paper-actions"><button type="button" data-vela-paper-advance="${escapeHtml(order.order_id)}">Check next bar</button><button type="button" data-vela-paper-cancel="${escapeHtml(order.order_id)}">Cancel</button></div></article>`).join('');
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
  const payload = await getJson(`/api/chart-sim/positions?symbol=${encodeURIComponent(market.symbol)}`);
  paperOrders = payload.orders || [];
  paperPositions = payload.positions || [];
  renderPaperPositions();
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
    void refreshPaperPositions().catch(error => setPaperStatus(error.message, true));
  }
}

async function loadPreview() {
  const market = selectedMarket();
  const timeframe = $('#velaTimeframe').value;
  if (market?.symbol === 'TICKSTREAM:NQ') return loadTickstreamChart();
  $('#velaPaperTab').disabled = false;
  clearInterval(window.countDeskTickstreamStatusTimer);
  $('#cleoBriefing').hidden = false;
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
    });
    await velaChart.ready();
    await applyStoredIndicators();
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
  const button = event.target.closest('[data-vela-indicator]');
  if (!button || button.disabled) return;
  void toggleIndicator(button.dataset.velaIndicator).catch(error => setStatus(error.message, true));
});
$('#velaIndicatorSettingType').addEventListener('change', renderIndicatorSettings);
async function applyIndicatorSetting() {
  const type = $('#velaIndicatorSettingType').value;
  const length = Number($('#velaIndicatorSettingLength').value);
  const status = $('#velaIndicatorSettingStatus');
  if (!type || !Number.isInteger(length) || length < 2 || length > 5000) {
    status.textContent = 'Enter a whole-number period from 2 to 5000.';
    return;
  }
  saveIndicatorInput(type, length);
  status.textContent = `Saved ${length}. Refreshing ${type.toUpperCase()}…`;
  try { await applyStoredIndicators(); } catch (error) { status.textContent = error.message; }
}
document.addEventListener('click', event => {
  if (event.target.closest('#velaIndicatorSettingApply')) void applyIndicatorSetting();
});
$('#velaChartTab').addEventListener('click', () => setWorkspace('chart'));
$('#velaPaperTab').addEventListener('click', () => setWorkspace('paper'));
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
  const optional = selector => $(selector).value.trim() ? Number($(selector).value) : null;
  void paperAction('/api/chart-sim/open', {
    symbol:currentContract.market.symbol, timeframe:currentContract.market.timeframe, bar_time:barTime,
    side:$('#velaPaperSide').value, quantity:$('#velaPaperQuantity').value,
    stop_price:optional('#velaPaperStop'), target_price:optional('#velaPaperTarget'),
  }, 'Paper order queued for the next completed source bar.');
});
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

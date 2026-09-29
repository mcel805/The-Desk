const $ = selector => document.querySelector(selector);
import {buildChartContract} from './chart-contract.js';
let catalog = [];
let velaChart = null;

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

function formatPrice(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', {maximumFractionDigits: 2}) : '—';
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
}

function tickstreamTicker(symbol) {
  const match = String(symbol || '').match(/(?:^|:)(MES|MNQ|MCL|MGC|MYM)(?:1!|$)/i);
  return match ? match[1].toUpperCase() : '';
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
  } catch (error) {
    $('#velaFeedState').textContent = 'Source status unavailable';
    $('#velaFeedMeta').textContent = error.message;
  }
}

async function probeTickstream() {
  const ticker = tickstreamTicker($('#velaSymbol').value);
  const status = $('#velaTickstreamStatus');
  const button = $('#velaTickstreamProbe');
  if (!ticker) {
    status.textContent = 'This asset has no Tickstream pilot mapping.';
    return;
  }
  button.disabled = true;
  status.textContent = `Requesting delayed ${ticker} quote…`;
  try {
    const quote = await getJson(`/api/feed/quote?symbol=${encodeURIComponent(ticker)}`);
    const spread = quote.bid != null && quote.ask != null ? ` · bid/ask ${quote.bid} / ${quote.ask}` : '';
    status.textContent = `${quote.provider} · ${quote.symbol} ${quote.price}${spread} · delayed ${quote.delayMinutes}m · received ${new Date(quote.retrievedAt).toLocaleTimeString()}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadPreview() {
  const market = selectedMarket();
  const timeframe = $('#velaTimeframe').value;
  if (!market) return setStatus('No Count Desk market is available.', true);
  if (!window.Vela?.Vela) return setStatus('Vela browser bundle did not load.', true);
  const button = $('#velaLoad');
  button.disabled = true;
  setStatus(`Loading ${market.symbol} · ${timeframe} from the local historical store…`);
  try {
    const query = `symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(timeframe)}&cutoff=2147483647`;
    const payload = await getJson(`/api/counts?${query}`);
    const contract = buildChartContract({bars:payload.bars, result:payload, symbol:market.symbol, timeframe});
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
      volume: true,
      currentPriceLine: true,
    });
    await velaChart.ready();
    const first = new Date(Number(payload.bars[0].time) * 1000).toLocaleString();
    const last = new Date(Number(payload.bars.at(-1).time) * 1000).toLocaleString();
    $('#velaProvenance').textContent = `${market.symbol} · ${timeframe} · ${contract.bars.length} stored bars · ${first} → ${last} · source ${contract.analysis.source}`;
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
    fillSymbols();
    await loadPreview();
  } catch (error) {
    setStatus(error.message, true);
  }
}

$('#velaLoad').addEventListener('click', () => void loadPreview());
$('#velaTickstreamProbe').addEventListener('click', () => void probeTickstream());
void init();

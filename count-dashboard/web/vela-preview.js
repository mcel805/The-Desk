const $ = selector => document.querySelector(selector);
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

async function loadPreview() {
  const market = selectedMarket();
  const timeframe = $('#velaTimeframe').value;
  if (!market) return setStatus('No Count Desk market is available.', true);
  if (!window.Vela?.Vela) return setStatus('Vela browser bundle did not load.', true);
  const button = $('#velaLoad');
  button.disabled = true;
  setStatus(`Loading ${market.symbol} · ${timeframe} from the local historical store…`);
  try {
    const payload = await getJson(`/api/bars?symbol=${encodeURIComponent(market.symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=800`);
    const data = payload.bars.map(bar => ({
      time: Number(bar.time) * 1000,
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume || 0),
    }));
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
    $('#velaProvenance').textContent = `${market.symbol} · ${timeframe} · ${payload.bars.length} stored bars · ${first} → ${last} · source ${payload.bars.at(-1).source || 'local store'}`;
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
void init();

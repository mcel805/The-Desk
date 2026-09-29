const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
const formatPrice = value => Number(value).toLocaleString('en-US', {maximumFractionDigits: 4});
const formatDate = seconds => new Date(Number(seconds) * 1000).toLocaleString([], {
  month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
});
const MICRO_SYMBOLS = new Set([
  'CME_MINI:MES1!', 'CME_MINI:MNQ1!', 'NYMEX:MCL1!',
  'COMEX:MGC1!', 'CBOT_MINI:MYM1!'
]);

let context = window.countDeskChartContext || null;
let orders = [];
let positions = [];
let priceLines = [];
let busy = false;

async function api(path, body) {
  const response = await fetch(path, body === undefined ? undefined : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function setStatus(message, error = false) {
  const node = $('#paperTerminalStatus');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function currentSelection() {
  const result = context?.result;
  const bar = result?.bars?.at(-1);
  return result && bar ? {symbol:result.run.symbol, timeframe:result.run.timeframe, bar} : null;
}

function renderSource() {
  const selected = currentSelection();
  const supported = selected && MICRO_SYMBOLS.has(selected.symbol);
  $('#paperOpen').disabled = !supported || busy;
  $('#paperPractice').disabled = !supported || busy || (context?.result?.bars?.length || 0) < 32;
  $('#paperSource').textContent = !selected ? 'No stored bar is selected.' : !supported
    ? 'This paper ticket currently supports the five listed micro futures.'
    : `${selected.symbol} · ${selected.timeframe} · displayed ${formatDate(selected.bar.time)} close ${formatPrice(selected.bar.close)} · latest bar source: ${resultSource()}. Paper fills record their own source.`;
}

function resultSource() {
  return context?.result?.summary?.lastBarSource || 'source unavailable';
}

function clearPriceLines() {
  if (context?.candles) {
    for (const line of priceLines) {
      try { context.candles.removePriceLine(line); } catch { /* chart may have changed */ }
    }
  }
  priceLines = [];
}

function renderPriceLines() {
  clearPriceLines();
  const selected = currentSelection();
  if (!selected || !context?.candles) return;
  for (const position of positions.filter(item => item.status !== 'closed' &&
      item.symbol === selected.symbol && item.timeframe === selected.timeframe).slice(0, 3)) {
    const levels = [
      [position.entry_price, position.side === 'long' ? '#69d8ad' : '#f0ac76', 'PAPER ENTRY'],
      [position.stop_price, '#f27982', 'PAPER STOP'],
      [position.target_price, '#6ca9f3', 'PAPER TARGET'],
    ];
    for (const [price, color, title] of levels) {
      if (price == null) continue;
      priceLines.push(context.candles.createPriceLine({
        price:Number(price), color, lineWidth:title === 'PAPER ENTRY' ? 2 : 1,
        lineStyle:title === 'PAPER ENTRY' ? 0 : 2,
        axisLabelVisible:true, title
      }));
    }
  }
}

function renderPositions() {
  const selected = currentSelection();
  const activeOrders = orders.filter(item => item.status === 'queued');
  const activePositions = positions.filter(item => item.status !== 'closed');
  const recentClosed = positions.filter(item => item.status === 'closed').slice(0, 2);
  $('#paperPositionCount').textContent = `${activeOrders.length} queued · ${activePositions.length} open`;
  const orderCards = activeOrders.map(order => `<article class="paper-position">
    <div class="paper-position-top"><b>${escapeHtml(order.side.toUpperCase())} ${order.quantity}</b><span>QUEUED</span></div>
    <small>${escapeHtml(order.timeframe)} · after ${formatDate(order.placed_after_bar_time)}</small>
    <small>${escapeHtml(order.placed_source)}</small>
    <div class="paper-position-actions"><button type="button" data-paper-advance="${escapeHtml(order.order_id)}">Check next bar</button><button type="button" data-paper-cancel="${escapeHtml(order.order_id)}">Cancel</button></div>
  </article>`).join('');
  const positionCards = [...activePositions, ...recentClosed].map(position => {
    const matchingChart = selected && selected.symbol === position.symbol && selected.timeframe === position.timeframe;
    const mark = matchingChart && selected.bar.time >= position.entry_bar_time && position.status !== 'closed'
      ? (selected.bar.close - position.entry_price) * (position.side === 'long' ? 1 : -1) * position.quantity * position.multiplier : null;
    const result = position.status === 'closed' ? `Gross ${position.gross_pnl >= 0 ? '+' : ''}$${Number(position.gross_pnl).toFixed(2)}`
      : mark == null ? 'No displayed mark' : `Displayed gross ${mark >= 0 ? '+' : ''}$${mark.toFixed(2)}`;
    const bracketAction = position.status === 'open' && matchingChart &&
      (position.stop_price != null || position.target_price != null)
      ? `<button type="button" data-paper-bracket="${escapeHtml(position.position_id)}">Check bracket</button>` : '';
    const action = position.status === 'open' && matchingChart && selected.bar.time >= position.entry_bar_time
      ? `<button type="button" data-paper-close="${escapeHtml(position.position_id)}">Queue exit</button>${bracketAction}`
      : position.status === 'closing'
        ? `<button type="button" data-paper-check-exit="${escapeHtml(position.position_id)}">Check exit</button>` : '';
    return `<article class="paper-position">
      <div class="paper-position-top"><b>${escapeHtml(position.side.toUpperCase())} ${position.quantity} · ${formatPrice(position.entry_price)}</b><span>${escapeHtml(position.status.toUpperCase())}</span></div>
      <small>${escapeHtml(position.timeframe)} · entry bar ${formatDate(position.entry_bar_time)}</small>
      <small>${escapeHtml(position.entry_source)}</small>
      ${position.stop_price != null || position.target_price != null ? `<small>Paper bracket · stop ${position.stop_price == null ? '—' : formatPrice(position.stop_price)} · target ${position.target_price == null ? '—' : formatPrice(position.target_price)}</small>` : ''}
      ${position.exit_reason ? `<small>Exit: ${escapeHtml(position.exit_reason.replaceAll('_', ' '))} · ${formatDate(position.exit_bar_time)}</small>` : ''}
      <strong class="paper-pnl">${result}</strong>
      <div class="paper-position-actions">${action}</div>
    </article>`;
  }).join('');
  $('#paperPositions').innerHTML = orderCards + positionCards || '<p class="paper-empty">No paper positions on this market.</p>';
  renderPriceLines();
}

async function refreshPositions() {
  const symbol = $('#symbol')?.value;
  if (!symbol) return;
  const result = await api(`/api/chart-sim/positions?symbol=${encodeURIComponent(symbol)}`);
  orders = result.orders || [];
  positions = result.positions || [];
  renderPositions();
}

function revealConfirmedBar(result) {
  const seconds = result?.confirmationBarTime;
  if (!seconds) return;
  const date = new Date(seconds * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  $('#cutoff').value = date.toISOString().slice(0, 16);
  $('#build').click();
}

function setCutoffToBar(seconds) {
  const date = new Date(Number(seconds) * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  $('#cutoff').value = date.toISOString().slice(0, 16);
  $('#build').click();
}

async function act(path, body, successText) {
  if (busy) return;
  busy = true;
  renderSource();
  try {
    const result = await api(path, body);
    setStatus(result.message || successText);
    await refreshPositions();
    revealConfirmedBar(result);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    busy = false;
    renderSource();
  }
}

$('#paperTicket').addEventListener('submit', event => {
  event.preventDefault();
  const selected = currentSelection();
  if (!selected) return setStatus('Load a stored micro-futures chart first.', true);
  const optionalNumber = selector => $(selector).value.trim() ? Number($(selector).value) : null;
  void act('/api/chart-sim/open', {
    symbol:selected.symbol, timeframe:selected.timeframe, bar_time:selected.bar.time,
    side:$('#paperSide').value, quantity:$('#paperQuantity').value,
    stop_price:optionalNumber('#paperStop'), target_price:optionalNumber('#paperTarget')
  }, 'Paper order queued for the next completed source bar.');
});

$('#paperPractice').addEventListener('click', () => {
  const bars = context?.result?.bars || [];
  if (bars.length < 32) return setStatus('Load at least 32 stored bars first.', true);
  setCutoffToBar(bars.at(-31).time);
  setStatus('Practice cutoff moved 30 stored bars back. Build the chart, then queue a paper order.');
});

$('#paperPositions').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.paperAdvance) void act('/api/chart-sim/advance', {
    order_id:button.dataset.paperAdvance
  }, 'Paper fill checked.');
  if (button.dataset.paperCancel) void act('/api/chart-sim/cancel', {
    order_id:button.dataset.paperCancel
  }, 'Queued paper order cancelled.');
  if (button.dataset.paperClose) {
    const selected = currentSelection();
    if (!selected) return setStatus('Load a source bar for the exit request.', true);
    void act('/api/chart-sim/close', {
      position_id:button.dataset.paperClose, bar_time:selected.bar.time
    }, 'Paper exit queued for the next completed source bar.');
  }
  if (button.dataset.paperCheckExit) void act('/api/chart-sim/advance', {
    position_id:button.dataset.paperCheckExit
  }, 'Paper exit checked.');
  if (button.dataset.paperBracket) void act('/api/chart-sim/bracket', {
    position_id:button.dataset.paperBracket
  }, 'Paper bracket checked on one completed bar.');
});

function setWorkspace(view) {
  const paper = view === 'paper';
  $('#chartWorkspace').hidden = paper;
  $('#paperWorkspace').hidden = !paper;
  $('#countDeskTab').classList.toggle('active', !paper);
  $('#paperTradingTab').classList.toggle('active', paper);
  $('#countDeskTab').setAttribute('aria-selected', String(!paper));
  $('#paperTradingTab').setAttribute('aria-selected', String(paper));
  if (paper) void refreshPositions().catch(error => setStatus(error.message, true));
}
$('#countDeskTab').addEventListener('click', () => setWorkspace('chart'));
$('#paperTradingTab').addEventListener('click', () => setWorkspace('paper'));
$('#backToCountDesk').addEventListener('click', () => setWorkspace('chart'));
setWorkspace(window.location.hash === '#paperWorkspace' ? 'paper' : 'chart');
window.addEventListener('countdesk:chart', event => {
  clearPriceLines();
  context = event.detail;
  renderSource();
  void refreshPositions().catch(error => setStatus(error.message, true));
});
renderSource();
void refreshPositions().catch(error => setStatus(error.message, true));
window.setInterval(() => {
  if (!document.hidden) void refreshPositions().catch(error => setStatus(error.message, true));
}, 15000);

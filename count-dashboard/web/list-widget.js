// The List uses stored Count Desk bars only. A bar close is never presented as a live quote.
const number = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value, digits = 2) => value == null ? '—' : Number(value).toLocaleString('en-US', {maximumFractionDigits:digits});
const fmtVolume = value => value == null ? '—' : new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const shortSymbol = value => String(value || '').split(':').at(-1);
const symbolMark = value => {
  const code = shortSymbol(value).replace(/[^A-Z]/gi,'').slice(0,2).toUpperCase();
  return code || '•';
};
const dateLabel = epoch => epoch != null && Number.isFinite(Number(epoch)) ? new Date(Number(epoch) * 1000).toLocaleString() : 'unknown';

export function createListWidget(target, {getSymbols, getListSymbols, setListSymbols, getSelectedSymbol, setSelectedSymbol, selectSymbol}) {
  let snapshots = new Map();
  let loading = false;
  let requestVersion = 0;

  function availableTimeframe(item) {
    const available = item.timeframes?.filter(entry => entry.available && entry.bars > 0) || [];
    return available.find(entry => entry.timeframe === '1D') || available.find(entry => entry.timeframe === '1H') || available[0] || null;
  }

  async function fetchSnapshot(item, detail = false) {
    const timeframe = availableTimeframe(item);
    if (!timeframe) return {status:'unavailable'};
    const params = new URLSearchParams({symbol:item.symbol,timeframe:timeframe.timeframe,limit:detail ? '252' : '2'});
    const response = await fetch(`/api/bars?${params}`);
    if (!response.ok) return {status:'unavailable',timeframe};
    const payload = await response.json();
    const bars = Array.isArray(payload.bars) ? payload.bars : [];
    if (!bars.length) return {status:'unavailable',timeframe};
    const latest = bars.at(-1);
    const prior = bars.length > 1 ? bars.at(-2) : null;
    const close = number(latest.close);
    const change = close != null && number(prior?.close) != null ? close - Number(prior.close) : null;
    return {status:'stored',timeframe,bars,latest,close,change,
      percent:change != null && Number(prior.close) !== 0 ? change / Number(prior.close) * 100 : null};
  }

  function numberCell(value, signed = false, digits = 2) {
    if (value == null) return '—';
    return `${signed && value > 0 ? '+' : ''}${fmt(value,digits)}`;
  }

  function rowMarkup(item, selected) {
    const snapshot = snapshots.get(item.symbol);
    const change = snapshot?.change;
    const trend = change == null ? '' : change < 0 ? 'is-down' : change > 0 ? 'is-up' : '';
    const suffix = shortSymbol(item.symbol);
    return `<div class="the-list-row ${selected ? 'is-current' : ''}" data-list-symbol="${escapeHtml(item.symbol)}" role="row" aria-selected="${selected}">
      <button class="the-list-symbol" type="button" data-list-open="${escapeHtml(item.symbol)}" title="${escapeHtml(item.label || suffix)} · select and load chart"><span class="the-list-ribbon" aria-hidden="true"></span><span class="the-list-mark" aria-hidden="true">${escapeHtml(symbolMark(item.symbol))}</span><span class="the-list-ticker">${escapeHtml(suffix)}</span></button>
      <span class="the-list-value">${numberCell(snapshot?.close,false,6)}</span><span class="the-list-value ${trend}">${numberCell(change,true,5)}</span><span class="the-list-value ${trend}">${snapshot?.percent == null ? '—' : `${numberCell(snapshot.percent,true,2)}%`}</span><span class="the-list-value">${fmtVolume(number(snapshot?.latest?.volume))}</span>
    </div>`;
  }

  function rangeMarkup(label, low, high, current) {
    if (low == null || high == null) return `<div class="the-list-range"><div class="the-list-range-labels"><span>—</span><small>${label}</small><span>—</span></div><div class="the-list-range-track"></div></div>`;
    const percent = high === low ? 50 : Math.max(0,Math.min(100,(current-low)/(high-low)*100));
    return `<div class="the-list-range"><div class="the-list-range-labels"><span>${fmt(low,6)}</span><small>${label}</small><span>${fmt(high,6)}</span></div><div class="the-list-range-track"><span style="width:${percent}%"></span><i style="left:${percent}%"></i></div></div>`;
  }

  function historyMarkup(snapshot) {
    const bars = snapshot?.bars || [];
    const values = bars.map(bar => number(bar.close)).filter(value => value != null);
    if (values.length < 2) return '<div class="the-list-history-empty">Stored close history unavailable</div>';
    const minimum = Math.min(...values), maximum = Math.max(...values);
    const points = values.map((value,index) => `${(index/(values.length-1)*100).toFixed(2)},${(72 - (maximum === minimum ? .5 : (value-minimum)/(maximum-minimum))*60).toFixed(2)}`).join(' ');
    const area = `0,72 ${points} 100,72`;
    return `<svg class="the-list-history" viewBox="0 0 100 80" preserveAspectRatio="none" role="img" aria-label="Stored ${escapeHtml(snapshot.timeframe.timeframe)} closes from ${escapeHtml(dateLabel(bars[0].time))} to ${escapeHtml(dateLabel(bars.at(-1).time))}"><path class="the-list-history-grid" d="M0 12H100 M0 42H100 M0 72H100"/><polygon points="${area}"/><polyline points="${points}"/></svg><div class="the-list-history-axis"><span>${escapeHtml(new Date(Number(bars[0].time)*1000).toLocaleDateString([], {month:'short',year:'2-digit'}))}</span><span>${escapeHtml(new Date(Number(bars.at(-1).time)*1000).toLocaleDateString([], {month:'short',year:'2-digit'}))}</span></div>`;
  }

  function detailMarkup(item) {
    if (!item) return '<div class="the-list-empty">Add an instrument to see its details.</div>';
    const snap = snapshots.get(item.symbol);
    const latest = snap?.latest;
    const daily = snap?.timeframe?.timeframe === '1D';
    const closes = daily && snap?.bars?.length > 1 ? snap.bars.slice(-252) : [];
    const lows = closes.map(bar => number(bar.low)).filter(value => value != null);
    const highs = closes.map(bar => number(bar.high)).filter(value => value != null);
    const yearLow = lows.length > 1 ? Math.min(...lows) : null;
    const yearHigh = highs.length > 1 ? Math.max(...highs) : null;
    const rangeLabel = yearLow == null ? '52W RANGE UNAVAILABLE' : closes.at(-1).time - closes[0].time >= 300 * 86400 ? 'STORED 52W RANGE' : 'STORED RANGE';
    const trend = snap?.change == null ? '' : snap.change < 0 ? 'is-down' : 'is-up';
    const source = snap?.timeframe?.source || 'source unavailable';
    return `<section class="the-list-detail" data-list-detail-symbol="${escapeHtml(item.symbol)}" aria-label="${escapeHtml(shortSymbol(item.symbol))} asset details">
      <div class="the-list-detail-head"><span class="the-list-mark" aria-hidden="true">${escapeHtml(symbolMark(item.symbol))}</span><strong>${escapeHtml(shortSymbol(item.symbol))}</strong><button type="button" data-list-remove="${escapeHtml(item.symbol)}" title="Remove from List" aria-label="Remove ${escapeHtml(shortSymbol(item.symbol))} from List">×</button></div>
      <p class="the-list-description">${escapeHtml(item.label || shortSymbol(item.symbol))}</p><p class="the-list-category">${escapeHtml(item.symbol.split(':')[0] || 'Instrument')} · ${snap?.status === 'stored' ? 'Stored history' : 'History unavailable'}</p>
      <div class="the-list-primary"><strong>${numberCell(snap?.close,false,6)}</strong><span class="${trend}">${snap?.change == null ? '—' : `${numberCell(snap.change,true,5)}  ${numberCell(snap.percent,true,2)}%`}</span></div>
      <div class="the-list-source">${snap?.status === 'stored' ? `● Stored ${escapeHtml(snap.timeframe.timeframe)} bar · ${escapeHtml(dateLabel(latest.time))}` : '● Stored prices unavailable'}</div>
      <div class="the-list-provenance" title="${escapeHtml(source)}">Source: ${escapeHtml(source)} · Historical close, not a live quote</div>
      ${rangeMarkup(snap?.status !== 'stored' ? 'DAY RANGE UNAVAILABLE' : daily ? 'LATEST DAY RANGE' : 'BAR RANGE',number(latest?.low),number(latest?.high),snap?.close)}
      ${rangeMarkup(rangeLabel,yearLow,yearHigh,snap?.close)}
      <div class="the-list-section-title">Stored close history</div>${historyMarkup(snap)}
      <div class="the-list-section-title">Contract highlights</div><div class="the-list-fact"><span>Volume · latest bar</span><strong>${fmtVolume(number(latest?.volume))}</strong></div><div class="the-list-fact"><span>Open interest</span><strong>—</strong></div><div class="the-list-fact"><span>Forward curve</span><strong>Unavailable</strong></div>
      <div class="the-list-detail-foot">Research view · ${escapeHtml(snap?.timeframe?.timeframe || 'timeframe unavailable')} · no live market status</div>
    </section>`;
  }

  function render() {
    const catalog = getSymbols();
    const items = getListSymbols().map(symbol => catalog.find(item => item.symbol === symbol)).filter(Boolean);
    let selected = getSelectedSymbol();
    if (!items.some(item => item.symbol === selected)) {
      selected = items[0]?.symbol || '';
      setSelectedSymbol(selected);
    }
    target.innerHTML = `<div class="the-list-toolbar"><span class="the-list-blue-flag" aria-hidden="true"></span><strong>Blue list</strong><button type="button" data-list-add-toggle title="Add instrument" aria-label="Add instrument">＋</button><button type="button" data-list-refresh title="Refresh stored bars" aria-label="Refresh stored bars">▦</button></div>
      <div class="the-list-picker" hidden><select aria-label="Choose instrument to add"><option value="">Add instrument…</option>${catalog.filter(item => !items.includes(item)).map(item => `<option value="${escapeHtml(item.symbol)}">${escapeHtml(item.label || item.symbol)}</option>`).join('')}</select></div>
      <div class="the-list-columns" role="row"><span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span><span>Vol</span></div>
      <div class="the-list-rows" role="table" aria-label="Blue list stored market history">${items.map(item => rowMarkup(item,item.symbol === selected)).join('') || '<p class="the-list-empty">Add an instrument from the catalog.</p>'}</div>
      ${detailMarkup(items.find(item => item.symbol === selected))}
      <div class="the-list-loading" ${loading ? '' : 'hidden'}>Loading stored bars…</div>`;
  }

  async function refresh(force = false) {
    const items = getListSymbols().map(symbol => getSymbols().find(item => item.symbol === symbol)).filter(Boolean);
    const selected = getSelectedSymbol() || items[0]?.symbol;
    const version = ++requestVersion;
    loading = true; render();
    const next = new Map(force ? [] : snapshots);
    await Promise.all(items.map(async item => {
      if (!force && next.has(item.symbol) && (item.symbol !== selected || next.get(item.symbol)?.bars?.length > 2)) return;
      try { next.set(item.symbol,await fetchSnapshot(item,item.symbol === selected)); }
      catch { next.set(item.symbol,{status:'unavailable'}); }
    }));
    if (version !== requestVersion) return;
    snapshots = next; loading = false; render();
  }

  target.addEventListener('click',event => {
    const add = event.target.closest('[data-list-add-toggle]');
    if (add) { const picker = target.querySelector('.the-list-picker'); picker.hidden = !picker.hidden; if (!picker.hidden) picker.querySelector('select').focus(); return; }
    if (event.target.closest('[data-list-refresh]')) { void refresh(true); return; }
    const remove = event.target.closest('[data-list-remove]');
    if (remove) { setListSymbols(getListSymbols().filter(symbol => symbol !== remove.dataset.listRemove)); void refresh(); return; }
    const open = event.target.closest('[data-list-open]');
    if (open) { setSelectedSymbol(open.dataset.listOpen); render(); void refresh(); selectSymbol(open.dataset.listOpen); }
  });
  target.addEventListener('change',event => {
    if (!event.target.matches('.the-list-picker select') || !event.target.value) return;
    setListSymbols([...getListSymbols(),event.target.value]);
    setSelectedSymbol(event.target.value);
    void refresh();
  });
  return {render,refresh};
}

// Visual study only. Vela continues to draw every OHLC body, wick, and time slot.
// These closed-bar events never change prices, chart data, or paper plans.
const STORAGE_KEY = 'count-desk-living-candles-touch-v1';
const RULE_VERSION = 'candle-life-liquidity-touch-v1';

const finiteBar = bar => bar && [bar.time, bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(Number(value)))
  && Number(bar.high) >= Math.max(Number(bar.open), Number(bar.close))
  && Number(bar.low) <= Math.min(Number(bar.open), Number(bar.close));

export function classifyLivingCandles(bars = [], lines = []) {
  const byBar = new Map();
  for (const line of lines) {
    const price = Number(line.price), start = Number(line.startTime), end = Number(line.endTime);
    if (![price,start,end].every(Number.isFinite) || end < start) continue;
    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index], time = Number(bar?.time);
      if (!finiteBar(bar) || time < start || time > end) continue;
      if (Number(bar.low) > price || Number(bar.high) < price) continue;
      const candidate = {kind:'liquidity-touch', index, time, price, lineId:String(line.id || 'unidentified line'),
        lineTimeframe:String(line.timeframe || 'chart'), lineSide:String(line.side || ''),
        lineSource:String(line.source || 'Liquidity indicator'), priority:Number(line.priority) || 0,
        explanation:`Stored bar range touched the plotted ${line.timeframe || 'chart'} liquidity line at ${price}. The time within this bar is unknown.`,
        ruleVersion:RULE_VERSION};
      const prior = byBar.get(index);
      if (!prior || candidate.priority > prior.priority) byBar.set(index,candidate);
      break; // One burst for the first closed-bar contact with each plotted line.
    }
  }
  return [...byBar.values()].sort((a,b)=>a.index-b.index);
}

const labelFor = () => 'Liquidity touch';

export function createLivingCandleLayer({stage, button, inspectorButton, readout}) {
  const layer = document.createElement('div');
  layer.className = 'living-candle-layer';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Candle Life reaction markers');
  stage.append(layer);
  const inspector = document.createElement('aside');
  inspector.id = 'velaLivingInspector';
  inspector.className = 'living-candle-inspector';
  inspector.setAttribute('aria-label', 'Candle Life replay inspector');
  inspector.hidden = true;
  inspector.innerHTML = `<header><div><small>STORED BAR STUDY</small><h2>Candle Life</h2></div><button type="button" data-close aria-label="Close Candle Life inspector">×</button></header>
    <div class="living-inspector-transport"><button type="button" data-step="-1" aria-label="Previous stored bar">←</button><input type="range" min="0" max="0" value="0" aria-label="Scrub stored bars"><button type="button" data-step="1" aria-label="Next stored bar">→</button><button type="button" data-scan>▶ Scan</button></div>
    <div class="living-inspector-jumps"><button type="button" data-event-step="-1">← Reaction</button><button type="button" data-latest>Latest bar</button><button type="button" data-event-step="1">Reaction →</button></div>
    <div class="living-inspector-position" data-field="position">Load stored bars to inspect reactions.</div>
    <div class="living-inspector-event"><small data-field="kind">NO BAR SELECTED</small><strong data-field="time">—</strong><p data-field="explanation">Choose a bar to inspect its rule.</p></div>
    <div class="living-inspector-ohlc"><div><small>OPEN</small><strong data-field="open">—</strong></div><div><small>HIGH</small><strong data-field="high">—</strong></div><div><small>LOW</small><strong data-field="low">—</strong></div><div><small>CLOSE</small><strong data-field="close">—</strong></div></div>
    <dl class="living-inspector-meta"><dt>Instrument</dt><dd data-field="symbol">—</dd><dt>Timeframe</dt><dd data-field="timeframe">—</dd><dt>Source</dt><dd data-field="source">—</dd><dt>Dataset cutoff</dt><dd data-field="cutoff">—</dd><dt>Rule</dt><dd data-field="rule">—</dd><dt>Line</dt><dd data-field="line">—</dd><dt>Touch price</dt><dd data-field="range">—</dd></dl>
    <p class="living-inspector-note">Visual study from stored closed bars and plotted Liquidity lines. The burst sits at the line price on a bar whose high–low range spans it; intrabar touch order is unknown. The full historical chart remains visible while scanning.</p>`;
  stage.append(inspector);
  const field = name => inspector.querySelector(`[data-field="${name}"]`);
  const slider = inspector.querySelector('input[type="range"]');
  const scanButton = inspector.querySelector('[data-scan]');
  let chart = null, bars = [], lines = [], events = [], eventByIndex = new Map(), meta = null;
  let timer = null, scanTimer = null, focusFrame = 0, lastSignature = '';
  let selectedIndex = -1, inspectorOpen = false;
  let enabled = false;
  try { enabled = localStorage.getItem(STORAGE_KEY) === 'on'; } catch { /* session default */ }

  function setReadout(message, detail = '') {
    readout.querySelector('strong').textContent = `Candle Life · ${message}`;
    readout.querySelector('small').textContent = detail;
  }
  function clearEffects() { layer.replaceChildren(); lastSignature = ''; }
  function updateButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `Candle Life visual study ${enabled ? 'on' : 'off'}`);
    button.classList.toggle('is-active', enabled);
    button.textContent = enabled ? '✦ Life ON' : '✦ Life OFF';
    button.title = `Candle Life ${enabled ? 'on' : 'off'} · one burst at a plotted Liquidity line touch.`;
    readout.hidden = !enabled;
  }
  const priceText = value => Number(value).toLocaleString('en-US', {maximumFractionDigits:8});
  const utcText = value => Number.isFinite(Number(value)) ? new Date(Number(value)).toISOString() : 'Unavailable';
  function updateInspectorButton() {
    inspectorButton.disabled = !chart;
    inspectorButton.setAttribute('aria-expanded', String(inspectorOpen));
    inspectorButton.title = chart ? 'Inspect and scan stored candle reactions' : 'Load a Count Desk historical chart first';
  }
  function pauseScan() {
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
    scanButton.textContent = '▶ Scan';
    scanButton.setAttribute('aria-label', 'Auto scan stored bars');
  }
  function renderInspector() {
    if (!chart || selectedIndex < 0 || !bars[selectedIndex]) return;
    const bar = bars[selectedIndex];
    const event = eventByIndex.get(selectedIndex);
    slider.max = String(bars.length - 1);
    slider.value = String(selectedIndex);
    slider.setAttribute('aria-valuetext', `Bar ${selectedIndex + 1} of ${bars.length}, ${utcText(bar.time)}`);
    inspector.querySelector('[data-event-step="-1"]').disabled = !events.some(item => item.index < selectedIndex);
    inspector.querySelector('[data-event-step="1"]').disabled = !events.some(item => item.index > selectedIndex);
    inspector.querySelector('[data-latest]').disabled = selectedIndex === bars.length - 1;
    field('position').textContent = `BAR ${selectedIndex + 1} / ${bars.length} · ${event ? labelFor(event.kind) : 'No marked reaction'}`;
    field('kind').textContent = event ? labelFor(event.kind).toUpperCase() : 'NO MARKED REACTION';
    field('kind').dataset.kind = event?.kind || 'none';
    field('time').textContent = utcText(bar.time);
    field('explanation').textContent = event?.explanation || (lines.length
      ? 'This stored bar has no first contact with a plotted Liquidity line.' : 'Activate the Liquidity indicator to supply plotted lines.');
    for (const key of ['open','high','low','close']) field(key).textContent = priceText(bar[key]);
    field('symbol').textContent = meta.symbol;
    field('timeframe').textContent = meta.timeframe;
    field('source').textContent = meta.source || 'Source unavailable';
    field('cutoff').textContent = meta.cutoff ? utcText(meta.cutoff * 1000) : 'Not supplied';
    field('rule').textContent = event?.ruleVersion || `${RULE_VERSION} · no touch`;
    field('line').textContent = event ? `${event.lineId} · ${event.lineTimeframe} · ${event.lineSource}` : '—';
    field('range').textContent = event ? priceText(event.price) : '—';
  }
  function focusSelectedBar() {
    focusFrame = 0;
    const native = chart?.renderer?.renderer;
    const coords = native?.coords;
    const bar = bars[selectedIndex];
    if (!bar || !coords?.timeToLogical || !native?.applyViewport || !coords.width) return;
    const viewport = coords.getViewport();
    const logical = coords.timeToLogical(bar.time);
    const pitch = coords.pxPerBar();
    if (!Number.isFinite(logical) || !Number.isFinite(pitch) || pitch <= 0) return;
    const rightOffset = logical + coords.width * .35 / pitch - (coords.barCount - 1);
    native.applyViewport({barSpacing:viewport.barSpacing, rightOffset});
    lastSignature = '';
    render();
  }
  function selectBar(index, focus = true) {
    if (!chart || !bars.length) return;
    selectedIndex = Math.max(0, Math.min(bars.length - 1, Math.round(Number(index) || 0)));
    renderInspector();
    lastSignature = '';
    if (focus) {
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(focusSelectedBar);
    } else render();
  }
  function openInspector(index = selectedIndex) {
    if (!chart || !bars.length) return;
    inspectorOpen = true;
    inspector.hidden = false;
    selectedIndex = index < 0 ? bars.length - 1 : index;
    updateInspectorButton();
    selectBar(selectedIndex);
    start();
  }
  function closeInspector() {
    pauseScan();
    inspectorOpen = false;
    inspector.hidden = true;
    updateInspectorButton();
    lastSignature = '';
    start();
  }
  function render() {
    if ((!enabled && !inspectorOpen) || !chart || !stage.isConnected) return;
    const native = chart.renderer?.renderer;
    const coords = native?.coords;
    const pane = native?.scene?.panes?.get?.('price');
    const canvas = native?.dataCanvas;
    if (!coords?.timeToX || !coords?.priceToY || !pane?.scale || !canvas) {
      clearEffects();
      setReadout('Projection unavailable', 'Vela chart geometry is required for this study.');
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const viewport = coords.getViewport();
    const signature = [stageRect.left, stageRect.top, canvasRect.left, canvasRect.top,
      coords.width, coords.height, viewport.barSpacing, viewport.rightOffset,
      pane.bounds.top, pane.bounds.height, pane.scale.min, pane.scale.max,
      pane.scale.log, pane.scale.invert, selectedIndex, inspectorOpen, enabled].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    const visible = (enabled ? events : []).filter(event => !inspectorOpen || event.index <= selectedIndex)
      .map(event => ({...event, x:coords.timeToX(event.time)}))
      .filter(event => Number.isFinite(event.x) && event.x > 5 && event.x < coords.width - 5)
      .slice(-1);
    const nodes = [];
    const rendered = [];
    for (const event of visible) {
      const y = coords.priceToY(event.price, pane.scale, pane.bounds);
      if (!Number.isFinite(y) || y < pane.bounds.top + 5 || y > pane.bounds.top + pane.bounds.height - 5) continue;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `living-candle-effect liquidity-touch${inspectorOpen && event.index === selectedIndex ? ' is-selected' : ''}`;
      node.dataset.lineId = event.lineId;
      node.dataset.barTime = String(event.time);
      node.dataset.touchPrice = String(event.price);
      node.setAttribute('aria-label', `Inspect ${labelFor(event.kind)} at ${utcText(event.time)}`);
      node.title = `${labelFor(event.kind)} · click to inspect`;
      node.style.left = `${canvasRect.left - stageRect.left + event.x}px`;
      node.style.top = `${canvasRect.top - stageRect.top + y}px`;
      node.addEventListener('click', () => openInspector(event.index));
      nodes.push(node);
      rendered.push(event);
    }
    if (inspectorOpen && bars[selectedIndex]) {
      const bar = bars[selectedIndex];
      const x = coords.timeToX(bar.time);
      const y = coords.priceToY(bar.close, pane.scale, pane.bounds);
      if (Number.isFinite(x) && x > 0 && x < coords.width && Number.isFinite(y)) {
        const focus = document.createElement('div');
        focus.className = 'living-candle-focus';
        focus.style.left = `${canvasRect.left - stageRect.left + x}px`;
        focus.style.top = `${canvasRect.top - stageRect.top + pane.bounds.top}px`;
        focus.style.height = `${pane.bounds.height}px`;
        const pin = document.createElement('span');
        pin.style.top = `${y - pane.bounds.top}px`;
        focus.append(pin);
        nodes.push(focus);
      }
    }
    layer.replaceChildren(...nodes);
    const latest = inspectorOpen ? eventByIndex.get(selectedIndex) : rendered.at(-1);
    if (latest) {
      setReadout(labelFor(latest.kind), `${new Date(latest.time).toLocaleString()} · ${latest.explanation} Visual hypothesis.`);
    } else {
      setReadout(!lines.length ? 'Activate Liquidity' : !events.length ? 'No line touches in stored bars'
        : inspectorOpen ? 'No touch on selected bar' : 'Touch outside this view',
        `${meta.symbol} · ${meta.timeframe} · stored closed bars`);
    }
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function start() { stop(); if ((enabled || inspectorOpen) && chart) { render(); timer = setInterval(render, 120); } }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* session only */ }
    updateButton();
    if (!enabled && !inspectorOpen) clearEffects();
    start();
    if (enabled && chart && events.length) {
      selectedIndex = events.at(-1).index;
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(focusSelectedBar);
    }
  });
  inspectorButton.addEventListener('click', () => inspectorOpen ? closeInspector() : openInspector());
  inspector.querySelector('[data-close]').addEventListener('click', closeInspector);
  inspector.querySelectorAll('[data-step]').forEach(control => control.addEventListener('click', () => {
    pauseScan();
    selectBar(selectedIndex + Number(control.dataset.step));
  }));
  inspector.querySelectorAll('[data-event-step]').forEach(control => control.addEventListener('click', () => {
    pauseScan();
    const direction = Number(control.dataset.eventStep);
    const match = direction < 0 ? [...events].reverse().find(item => item.index < selectedIndex)
      : events.find(item => item.index > selectedIndex);
    if (match) selectBar(match.index);
  }));
  inspector.querySelector('[data-latest]').addEventListener('click', () => { pauseScan(); selectBar(bars.length - 1); });
  slider.addEventListener('input', () => { pauseScan(); selectBar(Number(slider.value)); });
  scanButton.addEventListener('click', () => {
    if (scanTimer) { pauseScan(); return; }
    if (selectedIndex >= bars.length - 1) selectBar(0);
    scanButton.textContent = 'Ⅱ Pause';
    scanButton.setAttribute('aria-label', 'Pause stored bar scan');
    scanTimer = setInterval(() => {
      if (selectedIndex >= bars.length - 1) { pauseScan(); return; }
      selectBar(selectedIndex + 1);
    }, 420);
  });
  inspector.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeInspector(); inspectorButton.focus(); }
  });
  updateButton();
  updateInspectorButton();
  setReadout('Waiting for stored bars', 'Visual study uses closed historical candles.');
  return {
    setLiquidityLines(nextLines = []) {
      lines = nextLines.filter(line => line && Number.isFinite(Number(line.price))
        && Number.isFinite(Number(line.startTime)) && Number.isFinite(Number(line.endTime)));
      events = classifyLivingCandles(bars,lines);
      eventByIndex = new Map(events.map(event => [event.index,event]));
      if (chart) { renderInspector(); clearEffects(); start(); }
    },
    setHistoricalChart(nextChart, contract) {
      stop(); pauseScan(); clearEffects();
      chart = nextChart;
      bars = contract.bars || [];
      meta = {symbol:contract.market.symbol, timeframe:contract.market.timeframe,
        source:contract.analysis.source, cutoff:contract.market.cutoff};
      events = classifyLivingCandles(bars,lines);
      eventByIndex = new Map(events.map(event => [event.index, event]));
      selectedIndex = bars.length - 1;
      updateInspectorButton();
      renderInspector();
      readout.title = `${meta.symbol} · ${meta.timeframe} · ${meta.source} · cutoff ${meta.cutoff ? new Date(meta.cutoff * 1000).toLocaleString() : 'unspecified'} · first stored-bar touch of each plotted Liquidity line; intrabar timing unknown.`;
      if (!lines.length) setReadout('Activate Liquidity', 'Candle Life needs a plotted Liquidity line.');
      else if (!events.length) setReadout('No line touches in stored bars', 'No first contact matched the plotted lines.');
      start();
    },
    clear(message = 'Stored replay only') {
      stop(); pauseScan(); clearEffects();
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = 0;
      chart = null; bars = []; lines = []; events = []; eventByIndex.clear(); meta = null;
      selectedIndex = -1; inspectorOpen = false; inspector.hidden = true;
      updateInspectorButton();
      readout.removeAttribute('title');
      setReadout(message, 'Candle Life uses confirmed Count Desk historical bars.');
    },
  };
}

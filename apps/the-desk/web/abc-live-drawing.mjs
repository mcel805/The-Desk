// Presentation only. Confirmed anchors come from Pine; ticks never alter its lifecycle.
const value = (model, title) => model.series?.find(s => s.title === title)?.points.at(-1)?.value;
const finite = Number.isFinite;
const alpha = (color, opacity) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color) ? color.slice(0, 7) + opacity : color;
const TEAL = '#00B8A9', RED = '#F23645', YELLOW = '#FFD94A';

export function abcLiveDrawing(model, bars, {timeframe = '1', id = 'abc', now = Date.now()} = {}) {
 const phase = value(model, 'ABC audit · phase'), inputs = model.inputValues || {};
 if (!value(model, 'ABC drawing · hosted') || ![1, 2, 3, 4].includes(phase) || !bars.length) return model;
 const direction = inputs.reversalSide === 'Long from support' ? 1 : -1;
 const ink = direction === 1 ? (inputs.longColor || TEAL) : (inputs.shortColor || RED);
 const step = Number(timeframe) * 60000, horizon = Math.max(1, Math.min(100, inputs.projectionBars ?? 20));
 const last = bars.at(-1), end = last.time + step * horizon;
 const point = (name, price = `ABC audit · ${name}`) => ({time: value(model, `ABC drawing · ${name} time`), price: value(model, price)});
 const valid = p => finite(p?.time) && finite(p?.price);
 let origin = point('origin', 'ABC drawing · origin');
 const a = point('A'), b = point('B'), c = point('C');
 const armed = value(model, 'ABC drawing · armed time');
 if (!valid(origin)) {const contact = bars.find(bar => bar.time === armed);if (contact) origin = {time: armed, price: contact.open};}
 const lines = [...(model.lines || [])], labels = [...(model.labels || [])];
 const prefix = `${id}:live:${direction}`;
 const line = (key, p, q, color = ink, style = 'solid', width = 2) => {
  if (!valid(p) || !valid(q) || q.time < p.time) return;
  lines.push({id: `${prefix}:${key}`, paneId: 'unrouted', xloc: 'bar_time', x1: p.time, y1: p.price, x2: q.time, y2: q.price, extend: 'none', color, width, style, overlay: true, ...(style === 'dashed' ? {deskDashPattern: [5, 6]} : {})});
 };
 const label = (key, p, text, color = ink, tooltip = '') => {
  if (!valid(p)) return;
  labels.push({id: `${prefix}:${key}`, paneId: 'unrouted', xloc: 'bar_time', x: p.time, y: p.price, yloc: 'price', text, style: 'none', noFill: true, textColor: color, size: 'small', textAlign: 'center', overlay: true, tooltip});
 };
 const extreme = (since, side, include = false) => {
  const eligible = bars.filter(bar => (include ? bar.time >= since : bar.time > since) && bar.time <= now);
  return eligible.reduce((best, bar) => {
   const price = side === 1 ? bar.low : bar.high;
   return !best || side * (price - best.price) < 0 ? {time: bar.time, price} : best;
  }, null);
 };
 let tip, from, leg;
 if (!valid(a)) {
  tip = extreme(armed, direction, true); from = origin; leg = 'A';
 } else if (!valid(b)) {
  if (inputs.showPath !== false) {line('A', origin, a); label('A-label', a, 'A', ink, 'Confirmed A pivot; recognized after right-side candles closed.');}
  tip = extreme(a.time, -direction); from = a; leg = 'B';
 } else {
  if (inputs.showPath !== false) {
   line('A', origin, a); line('B', a, b);
   label('A-label', a, 'A'); label('B-label', b, 'B');
  }
  if (phase === 2) {tip = extreme(b.time, direction); from = b; leg = 'C';}
  else if (inputs.showPath !== false) {line('C', b, c); label('C-label', c, 'C', ink, 'Confirmed C pivot. Closing structure break and retest remain separate.');}
 }
 if (valid(tip) && valid(from)) {
  if (inputs.showPath !== false) {
   line(`developing-${leg}`, from, tip);
   label('developing-label', tip, `${leg} · forming`, ink, 'Observed wick path only. Endpoint can move; no pivot or reversal confirmed.');
  }
  if (inputs.showProjection !== false && (leg !== 'C' || inputs.showCforecast !== false)) {
   const ranges = bars.slice(-14).map(bar => bar.high - bar.low), range = ranges.reduce((sum, n) => sum + n, 0) / Math.max(1, ranges.length);
   const span = Math.max(Math.abs(tip.price - from.price), range);
   const side = leg === 'B' ? -direction : direction;
   const measured = leg === 'C' ? value(model, 'Provisional C level') : leg === 'B' && valid(origin) ? a.price + direction * Math.abs(origin.price - a.price) * .618 : NaN;
   // Once a measured destination is exceeded, show a modest continuation hypothesis.
   const destination = finite(measured) && side * (tip.price - measured) > 0 ? measured : tip.price - side * span * .382;
   const projected = {time: end, price: destination};
   line('forecast', tip, projected, YELLOW, 'dashed', 1);
   label('forecast-label', projected, `${leg}? · projection`, YELLOW, 'Provisional measured-leg / wick-range continuation. No probability or trade signal.');
  }
 }
 const endpoint = phase === 2 ? tip : c;
 if (inputs.showProjection !== false && valid(a) && valid(b) && valid(endpoint) && endpoint.time > a.time) {
  const slope = (endpoint.price - a.price) / (endpoint.time - a.time);
  line('rail-AC', a, {time: end, price: endpoint.price + slope * (end - endpoint.time)}, alpha(ink, '55'), 'dashed', 1);
  line('rail-B', b, {time: end, price: b.price + slope * (end - b.time)}, alpha(ink, '55'), 'dashed', 1);
  if (valid(origin) && Math.abs(origin.price - a.price) > 0 && inputs.showPath !== false) {
   label('ratio-AB', {time: (a.time + b.time) / 2, price: (a.price + b.price) / 2}, (Math.abs(b.price - a.price) / Math.abs(origin.price - a.price)).toFixed(3), alpha(ink, 'BB'), 'Observed B / A price-length ratio.');
  }
 }
 return {...model, lines, labels, abcLive: {phase, leg: leg || 'confirmed', asOf: last.time, provisional: Boolean(leg)}};
}

// Channel detection, wick audits and break endpoints remain owned by Pine.
export function marketGeometryDrawing(model, timeframe = '1') {
 const inputs = model.inputValues || {}, projections = [];
 const lines = (model.lines || []).map(line => {
  const active = line.style === 'solid', rising = line.y2 >= line.y1;
  const custom = inputs.geometryActiveInk && !/^#BECFE6(?:FF)?$/i.test(inputs.geometryActiveInk);
  const ink = custom ? inputs.geometryActiveInk : rising ? RED : TEAL;
  const historical = inputs.geometryBrokenInk && !/^#6C7C94(?:FF)?$/i.test(inputs.geometryBrokenInk) ? inputs.geometryBrokenInk : ink;
  if (active && line.x2 > line.x1) {
   const x2 = line.x2 + Number(timeframe) * 60000 * 20;
   projections.push({...line, id: `${line.id}:projection`, x1: line.x2, y1: line.y2, x2, y2: line.y2 + (line.y2 - line.y1) * (x2 - line.x2) / (line.x2 - line.x1), color: alpha(ink, '55'), width: 1, style: 'dashed', deskDashPattern: [5, 6]});
  }
  return {...line, color: active ? ink : alpha(historical, '44'), width: active ? 2 : 1, ...(active ? {} : {deskDashPattern: [4, 7]})};
 });
 return {...model, lines: [...lines, ...projections]};
}

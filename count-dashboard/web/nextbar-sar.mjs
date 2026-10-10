export function parabolicSar(bars, step = 0.02, maxStep = 0.2) {
  const out = Array(bars.length).fill(null);
  if (bars.length < 2) return out;
  let up = bars[1].close >= bars[0].close;
  let sar = up ? Math.min(bars[0].low, bars[1].low) : Math.max(bars[0].high, bars[1].high);
  let extreme = up ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let af = step;
  out[1] = { value: sar, up, flip: false };
  for (let i = 2; i < bars.length; i++) {
    let next = sar + af * (extreme - sar);
    next = up ? Math.min(next, bars[i - 1].low, bars[i - 2].low) : Math.max(next, bars[i - 1].high, bars[i - 2].high);
    let flip = false;
    if (up && bars[i].low <= next) {
      up = false; flip = true; sar = extreme; extreme = bars[i].low; af = step;
    } else if (!up && bars[i].high >= next) {
      up = true; flip = true; sar = extreme; extreme = bars[i].high; af = step;
    } else {
      sar = next;
      if (up && bars[i].high > extreme) { extreme = bars[i].high; af = Math.min(maxStep, af + step); }
      if (!up && bars[i].low < extreme) { extreme = bars[i].low; af = Math.min(maxStep, af + step); }
    }
    out[i] = { value: sar, up, flip };
  }
  return out;
}

export function simulateSarCross(bars, { startIndex = 0, capital = 500, riskPct = 0.5, maxRiskUsd = 2.5, maxNotional = 500, feeBps = 5, slippageBps = 1, closeAtEnd = false } = {}) {
  const sar = parabolicSar(bars), trades = [];
  const fee = feeBps / 10000, slip = slippageBps / 10000;
  let balance = capital, position = null, signals = 0;
  const fillCost = (price, qty) => price * qty * (fee + slip);
  const close = (price, time, reason) => {
    const direction = position.side === 'LONG' ? 1 : -1;
    const gross = direction * (price - position.entry) * position.qty;
    const costs = fillCost(position.entry, position.qty) + fillCost(price, position.qty);
    const net = gross - costs;
    balance += net;
    trades.push({ side: position.side, entry: position.entry, exit: price, stop: position.stop, qty: position.qty, net, time, reason });
    position = null;
  };
  const open = (side, price, stop, time) => {
    const distance = Math.abs(price - stop);
    if (!Number.isFinite(distance) || distance <= 0 || price <= 0 || balance <= 0 || (side === 'LONG' && stop >= price) || (side === 'SHORT' && stop <= price)) return;
    const qty = Math.floor(Math.min(Math.min(balance * riskPct / 100, maxRiskUsd) / distance, Math.min(maxNotional, balance) / price) * 1e8) / 1e8;
    if (qty <= 0) return;
    position = { side, entry: price, stop, qty, time };
  };
  for (let i = Math.max(2, startIndex + 1); i < bars.length; i++) {
    const signal = sar[i - 1];
    const bar = bars[i];
    if (!signal) continue;
    if (signal.flip) signals++;
    if (position) {
      const long = position.side === 'LONG';
      const stopHit = long ? (bar.open <= position.stop || bar.low <= position.stop) : (bar.open >= position.stop || bar.high >= position.stop);
      if (stopHit) {
        const exit = long ? Math.min(bar.open, position.stop) : Math.max(bar.open, position.stop);
        close(exit, bar.time, 'SAR_STOP');
      } else if (signal.flip && (signal.up !== long)) {
        close(bar.open, bar.time, 'SAR_CROSS');
        open(signal.up ? 'LONG' : 'SHORT', bar.open, signal.value, bar.time);
      } else {
        position.stop = signal.value;
      }
    } else if (signal.flip) {
      open(signal.up ? 'LONG' : 'SHORT', bar.open, signal.value, bar.time);
    }
  }
  let unrealized = 0;
  if (position && bars.length) {
    const last = bars.at(-1), direction = position.side === 'LONG' ? 1 : -1;
    unrealized = direction * (last.close - position.entry) * position.qty - fillCost(position.entry, position.qty) - fillCost(last.close, position.qty);
    if (closeAtEnd) close(last.close, last.time + 60000, 'SESSION_CLOSE');
  }
  return { sar, trades, signals, balance, unrealized: position ? unrealized : 0, netPnl: balance - capital + (position ? unrealized : 0), openPosition: position ? { side: position.side, entry: position.entry, stop: position.stop, qty: position.qty } : null };
}

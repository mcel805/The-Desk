// Close-confirmed long-only SMA crossover. Signals fill at the following bar's open.
export function runSmaBacktest(bars, {fast = 9, slow = 21, feeBps = 0} = {}) {
  if (!Number.isInteger(fast) || !Number.isInteger(slow) || fast < 2 || slow <= fast || slow > 300) {
    throw new Error('Choose whole-number averages with 2 ≤ fast < slow ≤ 300.');
  }
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) throw new Error('Fee must be between 0 and 1,000 basis points per side.');
  const clean = bars.filter(b => [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite) && b.open > 0 && b.close > 0);
  if (clean.length < slow + 3) throw new Error(`Need at least ${slow + 3} valid bars for this study.`);
  const closes = clean.map(b => b.close);
  const prefix = [0];
  for (const close of closes) prefix.push(prefix.at(-1) + close);
  const sma = (end, length) => (prefix[end + 1] - prefix[end + 1 - length]) / length;
  const trades = [];
  let entry = null;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const curve = [];
  for (let i = slow; i < clean.length - 1; i++) {
    const previous = sma(i - 1, fast) - sma(i - 1, slow);
    const current = sma(i, fast) - sma(i, slow);
    const next = clean[i + 1];
    if (!entry && previous <= 0 && current > 0) {
      entry = {time: next.time, price: next.open};
    } else if (entry && previous >= 0 && current < 0) {
      const gross = next.open - entry.price;
      const fee = (entry.price + next.open) * feeBps / 10000;
      const pnl = gross - fee;
      trades.push({entryTime: entry.time, exitTime: next.time, entry: entry.price, exit: next.open, gross, fee, pnl});
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
      curve.push({time:next.time,equity});
      entry = null;
    }
  }
  return {
    bars: clean.length, trades, equity, maxDrawdown, curve,
    wins: trades.filter(t => t.pnl > 0).length,
    losses: trades.filter(t => t.pnl < 0).length,
    breakevens: trades.filter(t => t.pnl === 0).length,
    openPosition: entry ? {entryTime:entry.time,entry:entry.price,lastClose:clean.at(-1).close} : null,
  };
}

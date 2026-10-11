/**
 * Renderer-neutral Count Desk chart contract.
 *
 * Count Desk stores bar times in epoch seconds. Vela consumes epoch
 * milliseconds. Keeping that conversion here prevents each renderer from
 * inventing its own timestamp and provenance rules.
 */
export function normalizeBarsForChart(bars = []) {
  return bars
    .map(bar => ({
      time: Number(bar.time) * 1000,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume || 0),
      reportedVolume: bar.volume == null ? null : Number(bar.volume),
    }))
    .filter(bar => Number.isFinite(bar.time) && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

export function buildChartContract({ bars = [], result = null, symbol = '', timeframe = '' } = {}) {
  const run = result?.run || {};
  const summary = result?.summary || {};
  const analytics = result?.analytics || {};
  return {
    market: {
      symbol: symbol || run.symbol || '',
      timeframe: timeframe || run.timeframe || '',
      cutoff: Number(run.cutoff) || null,
    },
    bars: normalizeBarsForChart(bars),
    overlays: {
      projections: (analytics.projections || []).map(item => ({
        id: item.id, label: item.label, bias: item.bias, status: item.status,
        color: item.color, points: (item.points || []).map(point => ({
          time: Number(point.time) * 1000, price: Number(point.price),
        })),
      })),
      fibonacci: analytics.fibonacci || null,
      volumeProfile: analytics.volumeProfile || null,
      confirmedSwings: analytics.confirmedSwings || null,
    },
    analysis: {
      warning: summary.warning || 'Structural read unavailable.',
      source: summary.lastBarSource || 'source unavailable',
      snapshot: run.dataSnapshotHash || '',
      algorithm: run.algorithmVersion || '',
      status: run.status || 'UNKNOWN',
      countNodes: Number(summary.countNodes) || 0,
      barCount: Number(summary.barCount) || bars.length,
      lastClose: Number(summary.lastClose),
      insight: analytics.insight || null,
    },
  };
}

export const STORAGE_KEY = 'countdesk.trading-chart.candles.v1';
export const DEFAULT_CANDLES = Object.freeze({
  timezone: 'America/Los_Angeles',
  chartFontSize: 12,
  chartTextColor: '#f2f4f8',
  upFill: '#4caf50', downFill: '#f23645',
  upBorder: '#ffffff', downBorder: '#ffffff',
  upWick: '#ffffff', downWick: '#ffffff',
  bodyVisible: true, bordersVisible: true, wicksVisible: true,
});

export function normalizeCandles(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_CANDLES).map(([key, fallback]) => {
    const candidate = input[key];
    if (typeof fallback === 'boolean') return [key, typeof candidate === 'boolean' ? candidate : fallback];
    if (typeof fallback === 'number') return [key, Number.isFinite(candidate) ? Math.max(6, Math.min(32, candidate)) : fallback];
    if (key === 'timezone') {
      if (typeof candidate !== 'string' || !candidate) return [key, fallback];
      try { new Intl.DateTimeFormat('en-US', {timeZone:candidate}).format(); return [key, candidate]; }
      catch { return [key, fallback]; }
    }
    return [key, /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback];
  }));
}

export function loadCandles(storage) {
  try { return normalizeCandles(JSON.parse(storage.getItem(STORAGE_KEY))); }
  catch { return {...DEFAULT_CANDLES}; }
}

export function saveCandles(storage, value) {
  const settings = normalizeCandles(value);
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

export function candleConfig(value) {
  const s = normalizeCandles(value);
  return {
    layout: {fontSize:s.chartFontSize,textColor:s.chartTextColor},
    candles: {
      upColor:s.upFill, downColor:s.downFill, bodyVisible:s.bodyVisible,
      borderVisible:s.bordersVisible, borderUpColor:s.upBorder, borderDownColor:s.downBorder,
      wickVisible:s.wicksVisible, wickUpColor:s.upWick, wickDownColor:s.downWick,
    },
    chartTypes: {candles: {
      candleUpColor:s.upFill, candleDownColor:s.downFill, candleBodyVisible:s.bodyVisible,
      candleBorderVisible:s.bordersVisible, candleBorderUpColor:s.upBorder, candleBorderDownColor:s.downBorder,
      candleWickVisible:s.wicksVisible, candleWickUpColor:s.upWick, candleWickDownColor:s.downWick,
    }},
  };
}

export function applyCandles(chart, settings) {
  const api = chart?.renderer?.applyConfig ? chart.renderer : chart;
  if (!api?.applyConfig || !api?.getConfig) return false;
  const expected = candleConfig(settings);
  api.applyConfig(expected);
  syncVolumeCandles(chart, settings);
  const actual = api.getConfig();
  return Object.entries(expected.candles).every(([k,v]) => actual?.candles?.[k] === v)
    && Object.entries(expected.chartTypes.candles).every(([k,v]) => actual?.chartTypes?.candles?.[k] === v)
    && Object.entries(expected.layout).every(([k,v]) => actual?.layout?.[k] === v);
}

export function syncVolumeCandles(chart, settings) {
  const s=normalizeCandles(settings);
  for (const handle of chart?.indicators?.() || []) {
    if (handle.nativeType !== 'taper-volume') continue;
    const current=handle.inputValues();
    if (current.colorMode === 'Candles' && (current.upColor!==s.upFill || current.downColor!==s.downFill))
      handle.setInputs({upColor:s.upFill,downColor:s.downFill});
  }
}

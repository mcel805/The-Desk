export const STORAGE_KEY = 'countdesk.trading-chart.candles.v1';
export const DEFAULT_CANDLES = Object.freeze({
  upFill: '#4caf50', downFill: '#f23645',
  upBorder: '#ffffff', downBorder: '#ffffff',
  upWick: '#ffffff', downWick: '#ffffff',
  bodyVisible: true, bordersVisible: true, wicksVisible: true,
});

export function normalizeCandles(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_CANDLES).map(([key, fallback]) => [key,
    typeof fallback === 'boolean' ? (typeof input[key] === 'boolean' ? input[key] : fallback)
      : (/^#[0-9a-f]{6}$/i.test(input[key]) ? input[key].toLowerCase() : fallback),
  ]));
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
    && Object.entries(expected.chartTypes.candles).every(([k,v]) => actual?.chartTypes?.candles?.[k] === v);
}

export function syncVolumeCandles(chart, settings) {
  const s=normalizeCandles(settings);
  for (const handle of chart?.indicators?.() || []) {
    if (handle.nativeType !== 'taper-volume') continue;
    const current=handle.inputValues();
    if (current.colorMode !== 'Signals' && (current.upColor!==s.upFill || current.downColor!==s.downFill))
      handle.setInputs({upColor:s.upFill,downColor:s.downFill});
  }
}

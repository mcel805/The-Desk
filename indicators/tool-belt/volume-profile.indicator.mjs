// First Tool Belt indicator file: metadata for the Count Desk's existing
// Volume Profile chart layer. The chart calculation is in
// count-dashboard/indicator_lab.py and is consumed by server.py.
export const volumeProfile = Object.freeze({
  id: 'volume-profile',
  title: 'Volume Profile',
  catalogVersion: '0.2.0',
  calculationVersion: 'volume-profile-range-allocation-v1.0.0',
  status: 'descriptive-unscored',
  chartLayer: 'profile',
  description: 'See where historical volume clustered by price.',
  artwork: '/tool-belt-assets/volume-profile-sketch.png',
  probability: Object.freeze({
    state: 'uncalibrated',
    displayUp: 50,
    displayDown: 50,
    meaning: 'Coin-flip placeholder; no measured directional probability',
  }),
  evaluation: Object.freeze({
    purpose: 'Approximate the distribution of observed OHLCV volume across the last 160 completed bars.',
    output: 'POC and contiguous 70% value area, using uniform volume allocation per bar price range.',
    outcomeDefinition: null,
    dataSource: 'Stored bars, source identity shown at run time',
    timeframe: 'Selected chart timeframe',
    cutoff: 'Last included completed bar',
    resolvedSampleSize: 0,
    reviewed: false,
  }),
});

export function evaluateVolumeProfile() {
  return {
    status: 'descriptive-operational-only',
    calculationEndpoint: '/api/tool-belt/volume-profile',
    reason: 'The profile and causal replay can be checked now. Define an independent directional outcome, authorized source, and frozen study before estimating probability.',
    probability: null,
  };
}

// Keep candle width and center spacing tied to the same Vela viewport pitch.
// This adapter targets the bundled native canvas renderer; it does not alter bars.
export const CANDLE_VIEWPORT = Object.freeze({defaultSpacing:5, minSpacing:3, maxSpacing:24, defaultRightOffset:10});

const clampSpacing = value => Math.max(CANDLE_VIEWPORT.minSpacing,
  Math.min(CANDLE_VIEWPORT.maxSpacing,Number(value) || CANDLE_VIEWPORT.defaultSpacing));

export function candleViewportRenderer(chart) {
  const native = chart?.renderer?.renderer;
  return native?.applyViewport && native?.coords?.getViewport ? native : null;
}

export function setCandleSpacing(chart, spacing, rightOffset) {
  const native = candleViewportRenderer(chart);
  if (!native) return null;
  const current = native.coords.getViewport();
  const next = {barSpacing:clampSpacing(spacing),
    rightOffset:Number.isFinite(Number(rightOffset)) ? Number(rightOffset) : current.rightOffset};
  native.applyViewport(next);
  return native.coords.getViewport();
}

export function resetCandleSpacing(chart, rightOffset = CANDLE_VIEWPORT.defaultRightOffset) {
  return setCandleSpacing(chart,CANDLE_VIEWPORT.defaultSpacing,rightOffset);
}

export function stepCandleSpacing(chart, direction) {
  const native = candleViewportRenderer(chart);
  if (!native) return null;
  const current = native.coords.getViewport();
  return setCandleSpacing(chart,current.barSpacing * (direction > 0 ? 1.25 : .8));
}

export function keepCandleSpacingReadable(chart) {
  const native = candleViewportRenderer(chart);
  if (!native?.onViewportChange) return () => {};
  let frame = 0;
  const off = native.onViewportChange(() => {
    const current = native.coords.getViewport();
    const spacing = clampSpacing(current.barSpacing);
    if (spacing === current.barSpacing || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      setCandleSpacing(chart,spacing);
    });
  });
  return () => { off?.(); if (frame) cancelAnimationFrame(frame); };
}

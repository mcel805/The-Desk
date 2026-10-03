# Professional chart markup and chart-interface overlay

## Purpose

Make Cleo’s chart read legible and useful at a glance. The active chart is the primary visual: Cleo’s marks should be drawn directly over the loaded chart as a separate, evidence-linked overlay layer whenever the chart interface and supported drawing renderer are available. Do not substitute a nearby sketch, standalone diagram, or annotations baked into a screenshot when the active chart can accept native marks.

This is the Count Desk house style, informed by chart-analysis and visualization practice. It is not a universal CMT, exchange, or institutional rulebook, and it does not imply that Cleo has a chart connection in every conversation.

## Before drawing

1. Pin the chart identity: source/venue, symbol and contract or series, chart timeframe, session/timezone when known, chart type/scale when relevant, last complete-bar cutoff, and loaded chart revision.
2. Confirm the relevant evidence is loaded and the renderer supports the intended geometry. Use time/bar and price anchors from that evidence. Do not guess coordinates from memory, interpolate exact prices from screenshot pixels, or carry marks across a source, symbol, contract, interval, replay, cutoff, or chart-revision change.
3. Keep the source candles and user drawings unchanged. Register Cleo’s drawings in a distinct, independently hideable Cleo layer. Never clear or edit user or Tool Belt marks to make room.
4. If the current chat has only a screenshot, an exported image, or text without the active chart renderer, say that native chart overlay is unavailable. A separate annotated artifact can be offered as a labeled fallback, but must not be described as marks applied to the chart interface.

## Choose marks by response type

### Read-only chart review

Use a compact set of sourced marks to show only what supports the read:

- the selected higher-timeframe context area/level when relevant;
- observed, confirmed swing or structure;
- the nearest opposing reference when it changes the read;
- an optional dashed conditional branch and distinct alternate when they materially explain what could change the read.

When the visible chart confirms a sequence of lower highs or higher lows, normally include one native trendline connecting the relevant pivots. A directional read should make that structure visible when the chart supports it; do not use extra horizontal levels as a substitute. A useful compact map often has a key swing reference, the nearest opposing level, and one structure line, provided each adds distinct information.

Do not add an entry, stop, target, trigger, position side, or order-like mark unless the user explicitly requested a paper scenario. A touch or sweep alone is not confirmation.

### Explicit paper plan

Keep the chart marks synchronized with the written plan. Add only sourced anchors that the requested plan needs: selected context area, defined trigger/confirmation, structural invalidation, and nearest opposing obstacle. State cancellation and risk/room checks in the plan card or readout; do not invent a destination just to make the drawing look complete. A plan is hypothetical and does not create or submit an order.

## Professional visual grammar

- Usually use 2–4 marks; never exceed five in a routine read. Prefer three distinct marks when the evidence supports them. Remove non-decision-relevant or redundant marks.
- Keep marks thin and behind the candle series where the renderer permits. Preserve wick and body visibility. Use native horizontal rays for sourced levels, trend lines between confirmed pivots, and a right-extending ray only for a conditional path when supported.
- Prefer short, directly attached labels. Avoid large floating text boxes, decorative patterns, and long prose over price action. Put the explanation in the adjacent Cleo readout or the mark’s “Why this mark?” detail.
- Match the project/user’s confirmed chart color key when available. Do not invent a timeframe palette or call a house convention universal. Pair color with a label, line style, or legend so meaning survives grayscale and color-vision differences.
- Keep roles visually distinct: observed/context marks are solid and restrained; draft marks are visibly provisional; conditional paths are dashed; invalidation is clearly labeled; alternate paths are visually distinct from the primary case. The short text readout carries the meaning—color alone never does.
- On multi-chart layouts, identify each pane’s timeframe. Do not transfer an anchor to a different pane or timeframe without evidence for that chart.

## Evidence and lifecycle

- Bind every mark to its chart identity, cutoff/revision, role, anchor(s), evidence reference(s), and one-sentence reason. Open a small explanation on selection when the interface supports it.
- Show an in-progress layer as `DRAFT`; promote it only after all marks pass source, geometry, and chart-revision validation. Do not leave partial marks appearing final after validation fails.
- When the source or chart revision changes, reject or retire mismatched marks. Restore saved marks only on an exact source/market/timeframe/cutoff match.
- Keep the Cleo visibility control independent. Hiding Cleo’s layer does not delete evidence, alter a plan, or hide user drawings.
- If the renderer cannot place or validate a mark, leave it off the chart, state why, and provide the concise text read. Never imply that an overlay was applied when it was not.

## Chart-first handoff

Lead with a short state label such as `REVIEW`, `WAIT`, or `CONDITIONAL` and one plain-language sentence beside the marked chart. Include the source, timeframe, and cutoff where the user can see them. Keep the primary read and strongest alternate distinguishable. Put method detail and provenance behind a mark explanation or `Why this read?` disclosure when the interface supports it.

## Detailed implementation reference

For the Count Desk/Vela event contract, renderer mapping, validation rules, and lifecycle behavior, see `docs/CLEO-PLAN-CHART-MARKUP-DESIGN.md`. Treat that document as a design specification; a design note does not prove that a particular runtime or renderer is connected or working in the current conversation.

# Elliott chart markup v1

This records the earlier single-chart contract. For the current Shammy seven-view workflow, see [Rider Elliott chart package v2](ELLIOTT-CHART-MARKUP-v2.md).

## Current requirements

- Run only after the user clicks **Elliott analysis** on a loaded Quant Lab chart. The button selects Cleo's Elliott workflow and shares the active chart bars and screenshot.
- Copy provider, symbol, timeframe, and cutoff from that chart exactly. Read only the supplied timeframe panes; the current BTC / Hyperliquid / 1m screenshot does not establish a higher-timeframe count.
- Treat the count as a research hypothesis. Describe the preferred count, strongest materially different alternate, uncertainty, the next condition to watch, and named invalidation only when supported by Elliott hard rules.
- The current Quant Lab integration validates source identity, loaded-bar timestamps, and prices within bar ranges. It does not independently compute Elliott rules or certify the count; every result must disclose that it is model-assisted and provisional.
- Historical wave labels attach to exact loaded pivot bars and prices within each bar's high-low. The UI rejects stale chart identity, unknown bars, invented future coordinates, and out-of-range prices.
- Use the final display grammar from the supplied v6 reference: major `((wave))` in neutral, intermediate `(wave)` in blue, minor `wave` in red; uncertain labels gray with `?`; alternate count purple. Historical display is label-led at pivots; only conditional projections extend rightward as dashed/dotted rays.
- Preserve the original candles. No dashboard overlay, large callout panels, trade instructions, target prices, calibrated probabilities, or claims that a count is validated performance.
- Persist drawings only against the exact chart source and cutoff. They remain editable native chart annotations and can be hidden or cleared with the chart marks controls.

## Output examples

These illustrate presentation only. They are not counts of the BTC chart and their placeholders are not valid drawing anchors.

**On-chart historical labels**

```text
((1))  ((2))  ((3))       major degree, neutral
 (1)    (2)    (3)         intermediate degree, blue
  1      2      3          minor degree, red
  ?2                            unresolved pivot, gray
```

Labels sit at the cited historical pivots. The chart does not draw a long zigzag through old bars.

**Conditional path example**

```text
Preferred: a corrective pullback may be incomplete while the cited swing low holds.
Alternate: a break of that swing low would invalidate the preferred count and favor the alternate.
Watch: the next completed swing relative to the cited pivot.
Chart: dashed amber primary ray; dotted purple alternate ray; gray/red rule reference where applicable.
```

## Response contract

The `chart-markup` code fence is parsed by Quant Lab and is the only source of drawings. Use exact supplied bar times and bar-contained prices for every anchor.

```json
{
  "schema": "cleo.elliott-markup.v1",
  "chart": 1,
  "method": "Provisional Elliott count",
  "source": {
    "provider": "<exact chart provider>",
    "symbol": "<exact chart symbol>",
    "timeframe": "<exact timeframe>",
    "cutoff": "<exact loaded cutoff>"
  },
  "readout": {
    "decision": "PROVISIONAL",
    "headline": "<preferred count and degree>",
    "takeaway": "<source and cutoff qualified summary>",
    "countercase": "<strongest alternate and what supports it>",
    "next": "<condition that changes the count>"
  },
  "primary": {
    "summary": "<count, degree, and rule checks>",
    "pivots": [
      {
        "id": "p1",
        "degree": "minor",
        "wave": "1",
        "time": "<exact loaded bar time>",
        "price": "<price inside that bar>",
        "kind": "low",
        "confidence": "confirmed",
        "evidenceRefs": ["<same exact loaded bar time>"]
      }
    ]
  },
  "alternate": null,
  "projections": [],
  "invalidations": []
}
```

The contract's placeholders are explanatory. The model must replace them with values from the active chart; the validator rejects unresolved placeholders or unsupported anchors.

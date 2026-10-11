# Market geometry redesign · 9 October 2026

Implemented in the local Crypto Day Desk. This is an independent, testable reconstruction of the supplied method. The original numbered charts and proprietary toolbar formulas were not supplied.

## Study of the supplied CL notes

User-supplied 45-page extracted CL study (preserved in the MYM chart workspace): Daniel Roe, Trade The Plan, CL trades August 3–5, 2015, 45 extracted pages.

| Source pages | Lesson | Implementation |
|---|---|---|
| 1, 3–7, 18, 27 | Baseline joins points 1 and 2; widest perpendicular point 3 supplies the parallel. Parent geometry supplies context. | Baseline connects two confirmed same-side wick swings; opposite confirmed swing 3 fixes width. Evidence includes all seven completed frames. |
| 4–6, 8–10, 18, 29–32 | Interpret participation at a geometric area; rejection, weaker return and closing location matter. | Measured volume/range evidence at rails and midpoint; distinguish contact, rejection, follow-through and a lighter higher-low/lower-high return. |
| 8, 20, 28, 40 | A slight throw-over can precede rejection. | Wicks and a single outside close do not retire the channel. Two consecutive outside closes establish a break; a later held retest is a separate event. |
| 12, 15–17, 24–25, 33–35, 43–45 | Opposing geometry plus climax/churn or declining participation can argue for reduced expectations or an exit. | Expose opposing rails, midpoint, accepted break/retest and volume evidence to Jev. Existing paper brackets, risk checks and limit-only orders remain authoritative. This revision does not automatically replace management rules. |
| 3–4, 6, 8–9, 20–21, 34–39 | Parallel rays, split autolines, pitchforks and multiple Fibonacci/VWAP intersections add context. | Deferred: exact split, projection and alternative median formulas cannot be recovered reliably from text alone. Existing Fib context remains available. |

## What changed

1. **Observed anchors.** Point 1 and point 2 sit on actual high/high or low/low wicks, with an established opposing reversal between them. Point 3 is the widest opposing confirmed swing between the pair. Reject the construction if another wick requires a wider rail or the baseline cuts through the intervening swing beyond tolerance.
2. **Confirmation before use.** Default radius: four bars on each side, full 14-bar ATR warm-up, at least 0.75 ATR reaction. Ambiguous outside-bar pivots and gaps cannot establish an anchor. These thresholds are our explicit design choices, not values specified by Roe.
3. **Fixed lines.** A channel becomes usable only after all three confirmations close. Later bars never move its three anchors. Lilac solid segment = 1→2; dashed lilac = projection; magenta parallel begins exactly at 3. The optional dotted midpoint is derived, not an observed swing.
4. **Broad structure first (v2.1).** Search all supplied completed history and every established same-side swing pair. Default display is the broadest valid active channel anchored in visible history plus a recent distinct leg; without a visible-range parent, use the broadest in the loaded frame. Keep up to two retired references, including older parent geometry. Pan/zoom selects existing fixed anchors without refitting. Similar repeated channels are suppressed, while a materially shorter leg may share the parent’s second anchor. Structural selection is not a probability.
5. **Acceptance versus overshoot.** Two consecutive completed closes outside the same rail retire a channel. Gaps reset the consecutive-close count. Retired lines can support a later break/retest interpretation but never become active again by refitting.
6. **Volume at a location.** Report volume and volume-per-range versus the preceding 20 completed bars. At least 1.5× volume and density with below-average range is a stall hypothesis when price rejects a rail. A lighter retest requires a departure before the return; a midpoint contact does not erase the prior edge reaction. Follow-through requires subsequent completed price evidence; gaps make it unavailable. These rolling ratios are not same-time-of-day RVOL and do not identify institutions.
7. **Jev receives evidence.** The v2 package includes actual anchor OHLC, confirmation times, fixed rails, accepted-break state and bounded recent OHLCV. The server verifies 1M OHLCV against supplied completed tape, validates anchor prices and recomputes volume evidence. Jev interprets the supplied measurements; geometry is computed by code. Historical v1 receipts still load.

The existing Elliott counts, liquidity calculations, volume classifications, execution and risk policy remain separate. Pine v1.14 is unchanged; this revision applies to the local JavaScript/Python Day Desk.

## Source audit and validation

The MYM workspace anchor ledger: 45 anchors across 15 channel details on retained Coinbase BTC-USD OHLC. Every anchor matched its exact source wick and OHLC; each confirmation preceded its frame cutoff. The bundle is frozen at 2026-10-10T01:42:00+00:00 for reproducibility, not a claim of current executable prices. Daily had no active channel at that cutoff; six other frames had active constructions.

Automated validation: 11 JavaScript tests, 73 Python tests, and the existing Wave Court assertion suite. Includes exact native drawing endpoints, causal replay/no future refitting, gaps, overshoots, accepted breaks, retests, server evidence checks, volume colors and existing paper order/risk behavior. Runtime preview accepted 28 minute bars, seven geometry frames and 28 typed questions (102,229 bytes). Internal ASCII request-size caps were removed; provider context limits remain provider enforced. No paid inference was run. Runtime chart and midpoint toggle were verified; the new in-session report needs a fresh paper hunt.

[Open Day Desk](http://127.0.0.1:8770/crypto-day.html?strategy=day).

Next validation: inspect 1M and 5M anchors against the candles, then observe a paper hunt through a contact and weaker retest. Limit orders remain the entry method; an unfilled opportunity is allowed to pass.

## Far-left swing correction · v2.1

Removed the 600-bar, four-pair and candidate-retention restrictions. Verified the BTC 1M baseline from the 22:14 UTC low at 82,358.02 to the 00:44 UTC low at 82,458.02, with opposing point 3 at the 23:19 UTC high of 82,616.08 (9–10 October UTC). Native chart zoom reveals the earlier anchor and retains the recent leg. Chart, Taper geometry brief and Jev source evidence share the structural-first selector. No inference or orders were run. Additional validation: 14 JavaScript tests, 9 Python geometry tests, existing Wave Court assertions, syntax checks and an 84-anchor source audit across seven frames.

# 1H / 30M reaction to a fresh 1M long liquidity level

## Authority and unresolved choices

Mark specified this workflow on 2026-09-29. It is a paper/shadow research hypothesis. His requirements are the HTF interaction, a confirmed 1M reversal, a freshly printed 1M long liquidity level as entry, and structure-first stops. His latest clarification supersedes the earlier 35-tick cap: absolute maximum 40 ticks, preferred 30, usual 25–35 (30-tick fallback without usable structure). Cleo's trend-change definition below is proposed for discussion, not accepted or empirically validated.

This is Strategy A (`A_confirmed_reversal`). Mark's separate Strategy B (`B_htf_first_touch`) omits the 1M confirmation by design; see `two-strategy-forward-study.md`. Do not apply A's entry gate to B or count B as A evidence.

Resolve the actual 1M zone class (SSL EXT, SSL INT, SPIKE SSL, or another defined output), installed indicator/version/settings, and entry line or box boundary. Do not choose a midpoint or box edge silently. A long liquidity level is Mark's terminology; a teal SSL label alone does not prove a bullish reversal.

## Staged observation and plan

1. **HTF interaction identified — Step 1.** Maintain separate watch records for selected confirmed 1H and 30M levels: instrument/contract, source, zone bounds/line, origin, availability time, current lifecycle, and cutoff. Mark the first observed test or trade through the selected level; distinguish touch from sweep. If a screenshot shows the interaction only retrospectively, label the interaction time approximate/unknown and record the screenshot detection time separately. Overlapping 1H/30M levels may be confluence for one event, not automatically two trades. A touch alone does not authorize an entry.
2. **1M trend change — proposed test.** Following Step 1, require a completed 1M close above the last confirmed lower high that drove the decline into the reaction. Then require a pullback that establishes a confirmed higher low above the reaction low. Use only swings known at the time; state the swing confirmation rule/settings. A wick through a high, one green candle, or an indicator bias flip is insufficient. This stricter higher-low test is open to discussion with Mark.
3. **Fresh 1M long zone confirmed.** Require a newly available qualifying zone associated with the post-interaction reversal. A pre-existing zone or one originating before Step 1 does not satisfy the fresh-print requirement. Link the zone to the observed reversal structure. If the zone becomes available before Step 2 completes, keep it as a candidate; do not arm an entry until both gates pass. Record pivot/origin time separately from first available confirmation time. If the zone itself marks the proposed higher low, both gates may complete together.
4. **Paper limit plan ready.** Set the hypothetical entry reference to the exact agreed 1M level and evaluate a subsequent return to it. Never backdate a pending limit or fill to the pivot candle. Check whether the zone was already invalidated or consumed before the plan became available; no retroactive first-touch fill. The original HTF line can remain overhead resistance: reclaiming it is context, not a universal extra entry gate. Label a long still below that line as a countertrend reaction and measure room to that first obstacle.

At Step 4, use the relevant confirmed blue structure line for invalidation with any explicitly chosen buffer. Entry-to-stop distance including buffer must be <=40 ticks; preferred stop 30, usual 25–35. If no usable structure exists, apply Mark's 30-tick fallback while labeling structural invalidation unresolved. Do not let the fallback replace Steps 2–3. Verify dollar-risk budget, tick specification, quantity, costs and nearest opposing references when calculating risk/room. A maximum-sized stop is not a target stop distance.

Cancel/reset the candidate if its protected reversal structure fails, the entry zone is invalidated, or new lows change the reaction sequence. Reassess the chosen HTF level's lifecycle after a new extreme; do not invent a fresh setup from the same exhausted level. Source staleness suspends new decisions. Define an expiry and catalyst treatment with the study rather than silently borrowing another experiment's window.

## Reporting and monitoring boundary

Use per-step states: `WATCHING`, `OBSERVED`, `PENDING`, `CONFIRMED`, `PAPER_PLAN_READY`, `INVALIDATED`, `UNKNOWN`, or `STALE`, with supporting evidence/cutoff. The sequence is a plan; a `PAPER_PLAN_READY` label is not an order. Claim a submitted paper order or fill only after a verified, authorized simulator returns that record. Cleo does not operate Mark's brokerage account.

Ongoing monitoring requires a verified sufficiently fresh authorized source, relevant HTF events plus completed 1M bars/zone events, stable contract identity/settings, and a running event consumer. Screenshots, an open browser, or a scheduled heartbeat do not provide bar-level monitoring. If unavailable, state monitoring is inactive and report only supplied snapshots. Do not create a dummy automation over stale bars or imply a background watcher was activated.

The local lab Pine build (`indicators/batty-liquidity/Batty-Clean-Zone-v1.9.6-lab.pine`) inspected on 2026-09-29 defaults to external pivots using `ta.pivotlow(length, length)` with `length=14`, and internal pivots with lookback 5. External zones are drawn back at `n-length`; default 1M pivot confirmation therefore waits for 14 right-side bars, possibly longer for filter eligibility. These are local source facts, not verified chart settings. Record first availability rather than treating the earlier drawn candle as a contemporaneous signal.

Its optional recorder emits on confirmed realtime bar closes and includes pivot time and availability time. The existing lab's fixed 30-tick first-touch trial is a different frozen experiment; it does not implement this staged, structure-first strategy. Verify current runtime/alerts/ingress before proposing activation; do not alter the indicator or expose a service merely to document the method.

## Sources

- Mark's instructions in this conversation, 2026-09-29: required fresh 1M entry level; selected 1H/30M origins; relevant blue structural stops; latest maximum 40 ticks, preferred/fallback 30, usual 25–35.
- TradingView [Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/) and [Alerts](https://www.tradingview.com/pine-script-docs/concepts/alerts/), accessed 2026-09-29: distinguish confirmed versus fluid bars, pivot plotting time, and actual alert availability. These document timing behavior, not strategy performance.

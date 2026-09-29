# CME morning and afternoon briefings

CME products have different schedules and holiday/maintenance rules. Do not define a universal “CME morning” or “afternoon.” Identify contract, exchange, timezone, date and session calendar first. For MYM, verify the current CME product specification rather than relying on a remembered schedule. Mark’s screenshots show Pacific local timestamps; convert only when the capture timezone is explicit.

## Morning briefing — before the chosen session

- State `pre-session`, cutoff and which session open the brief concerns (Globex reopen, U.S. cash open, or a Mark-defined window).
- Summarize higher-timeframe range/structure, prior session high/low/settlement if sourced, current mapped 1h/30m/15m zones, overnight range and known scheduled events only when verified.
- List bullish, bearish and no-trade conditions with levels, trigger, invalidation and horizon. Highlight where a 30m/1h reaction could be monitored and that 1m confirmation remains Mark-defined/unknown unless specified.
- Include source timestamps, stale/unavailable inputs, and risks such as a partial bar or contract roll.

## Preferred morning-briefing output

Mark approved the September 29, 2026 MYM morning briefing as the preferred output for morning market analysis and setup review. Default to this format unless he requests a different length or medium. The approval establishes a presentation preference; it does not validate a strategy, risk cap, indicator probability, or market conclusion.

Deliver a readable, annotated chart-first HTML document and a concise, self-contained chat briefing linking to it. When available, use Lavish for local visual review and match the existing Count Desk design tokens and typography. Keep the result local unless publication is requested. Use the following content order, adapting it to the supplied evidence:

1. **Decision first:** a plain-English headline and `wait / no trade`, `conditional scenario`, or `review only`. Show symbol/contract status, exchange/source, session, date, timezone, capture cutoff, provisional status and forming-bar limitations near the top.
2. **Top-down read:** use all supplied charts for context. Separate the larger trend, local recovery/range, and immediate execution structure. Explain competing timeframe evidence without letting indicator badges decide the trade.
3. **Annotated chart review:** preserve originals unchanged and add a separate analyst layer with numbered markers and a matching legend. Prefer chart tabs when multiple timeframes are supplied, access to each original, and a show/hide annotation control. Mark observations, interpretations and conditional triggers clearly; never reconstruct candles.
4. **Scheduled catalysts:** verify relevant events and session-open times with official sources, link them beside the claims, and express times in Mark's local timezone and the source timezone. Separate scheduled releases from results; state the calendar's coverage and the next reassessment point.
5. **Setup comparison:** review each marked setup explicitly. Align entry reference, displayed stop, target, directional fit, level origin/freshness, what supports it, what is missing, confirmation, structural invalidation and cancellation. Distinguish a local stop from invalidation of the broader thesis. A proposed 1M trigger is an analyst proposal until Mark confirms his rule; do not invent the exact future swing price.
6. **Risk and room:** show sourced tick distances, nominal gross ratios when appropriate, and intermediate opposing levels before the full target. Distinguish displayed order markers from verified order status/fills. Check badge arithmetic against the correct entry. If the current risk cap is unknown, label any earlier cap conditional; do not compress a structural stop to fit it. Fees/slippage unavailable means net reward/risk unknown.
7. **Opening decision map:** give the preferred case, strongest alternate and explicit no-trade condition. Name the reclaim, rejection or break/retest that would distinguish them. Keep alternate continuation studies separate from Mark's marked entries and preferred HTF-level process.
8. **Price map and evidence:** include a compact table of relevant prices/areas, source timeframe/type and decision relevance. Keep uncertainties and provenance available without overwhelming the main read. Treat `BIAS`, `DRAW`, percentage tags and premium/discount boxes as unverified indicator context unless their definitions/calibration are sourced.
9. **One next decision:** close with the smallest useful thing to watch, stated in trading language.

The chat briefing should remain useful without opening the document: decision and cutoff, a short top-down read, a compact setup comparison, the key opening levels, verified catalysts with links, and one next decision. Avoid reproducing the entire document in chat or requiring approval to deliver the analysis.

Save the document, written briefing, unchanged source copies and a source/scenario ledger under a dated directory in `output/briefings/`. Record original source paths, capture time/timezone, byte size and SHA-256; link each scenario to its source identities. Verify source-copy integrity, chart/control behavior and readable wide/narrow rendering before delivery. Prefer the existing product theme; state the design source briefly. Generated material remains local and excluded from Git until individually curated.

Local reference example, if still available: `output/briefings/2026-09-29-mym-morning/briefing.html`, with `briefing.md`, `analysis-ledger.json` and `source_charts/` beside it. Use it for presentation, not as current market evidence. Regenerate prices, catalysts, source metadata and scenario conclusions for each new session; the example's availability is not required to follow this format.

## Afternoon / close briefing

- State cutoff and whether this is pre-close, session close, or end of Globex segment. Summarize observed range and reactions versus the morning plan. Keep plan revisions timestamped.
- Reconcile Mark’s fills from authorized execution data, then journal the trades. Do not count unfilled orders as trades.
- Generate Cleo paper/shadow records only from a separately authorized simulated engine; never infer a simulation from a chart path.
- Report Mark manual account and Cleo paper ledger separately. For each: starting/ending figures and P&L only if sourced and reconciled; otherwise show unknown. Include setup quality, execution quality, outcome and one candidate lesson.
- Freeze the report with method version, chart/data cutoff and unresolved items. Do not claim end-of-day automation if no schedule, monitor, or execution source is running.

## Sources

- CME Group, [Micro E-mini Equity Index Futures FAQ](https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html), accessed 2026-09-28. Product lookup includes MYM and current FAQ for Globex schedule; recheck schedule/holidays before use.
- CME Group, [Micro E-mini Futures fact card](https://www.cmegroup.com/trading/equity-index/files/cme-micro-e-mini-futures-fact-card.pdf), accessed 2026-09-28. Product overview; verify current details from official contract specification.

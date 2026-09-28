# CME morning and afternoon briefings

CME products have different schedules and holiday/maintenance rules. Do not define a universal “CME morning” or “afternoon.” Identify contract, exchange, timezone, date and session calendar first. For MYM, verify the current CME product specification rather than relying on a remembered schedule. Mark’s screenshots show Pacific local timestamps; convert only when the capture timezone is explicit.

## Morning briefing — before the chosen session

- State `pre-session`, cutoff and which session open the brief concerns (Globex reopen, U.S. cash open, or a Mark-defined window).
- Summarize higher-timeframe range/structure, prior session high/low/settlement if sourced, current mapped 1h/30m/15m zones, overnight range and known scheduled events only when verified.
- List bullish, bearish and no-trade conditions with levels, trigger, invalidation and horizon. Highlight where a 30m/1h reaction could be monitored and that 1m confirmation remains Mark-defined/unknown unless specified.
- Include source timestamps, stale/unavailable inputs, and risks such as a partial bar or contract roll.

## Afternoon / close briefing

- State cutoff and whether this is pre-close, session close, or end of Globex segment. Summarize observed range and reactions versus the morning plan. Keep plan revisions timestamped.
- Reconcile Mark’s fills from authorized execution data, then journal the trades. Do not count unfilled orders as trades.
- Generate Cleo paper/shadow records only from a separately authorized simulated engine; never infer a simulation from a chart path.
- Report Mark manual account and Cleo paper ledger separately. For each: starting/ending figures and P&L only if sourced and reconciled; otherwise show unknown. Include setup quality, execution quality, outcome and one candidate lesson.
- Freeze the report with method version, chart/data cutoff and unresolved items. Do not claim end-of-day automation if no schedule, monitor, or execution source is running.

## Sources

- CME Group, [Micro E-mini Equity Index Futures FAQ](https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html), accessed 2026-09-28. Product lookup includes MYM and current FAQ for Globex schedule; recheck schedule/holidays before use.
- CME Group, [Micro E-mini Futures fact card](https://www.cmegroup.com/trading/equity-index/files/cme-micro-e-mini-futures-fact-card.pdf), accessed 2026-09-28. Product overview; verify current details from official contract specification.

# TradingAgents chart team integration

Count Desk exposes `tradingagents` in the chart workspace's Specialist selector, separately from Cleo. Selecting it sends the active chart snapshot and optional screenshot to a read-only project agent. Chart reads use the existing validated chart-markup renderer and retain the selected source, symbol, timeframe, and cutoff.

## Team behavior

The coordinator organizes the read into technical analysis, independent bullish and bearish cases, synthesis, and a risk challenge. When Codex multi-agent delegation is available, it should run those reviews independently and wait for their results. If delegation is unavailable, it must disclose that it completed the roles in one model. The interface does not imply that named roles ran merely because the team is selected.

Count Desk reads the selected local profile and includes its instructions in the current turn. It does not ask the app-server to call a custom agent by name, because that callable-agent list may not include repository profiles.

This is a chart-context adaptation of the role structure in [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents), not execution of that repository's LangGraph package. The upstream framework's standard market workflow uses ticker/date data sources; Count Desk's selected chart bars and image remain the evidence for this chart read. The fork requested by the user is a GitHub fork; local vendoring or running the upstream package is not part of this chart adapter.

All outputs are research hypotheses. The team has no order routing, brokerage account control, background monitoring, or validated trading performance. Missing or conflicting chart evidence must be reported rather than filled from a different source.

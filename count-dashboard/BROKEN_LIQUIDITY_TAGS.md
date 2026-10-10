# Liquidity timeframe tags

Crypto Day Desk now tags only active liquidity pools. Once a pool is taken, its historical line retains the prior endpoint and dashed/dotted styling but no longer emits a timeframe text tag. Active and grouped tags remain unchanged.

The focused condition change is already applied to the pre-existing untracked web/wave-court-port.mjs. It is saved in broken-liquidity-tags.patch rather than committing the entire earlier renderer baseline. The executable regression imports that runtime module.

Validation: all three tests failed before the change and passed after it (`node --test count-dashboard/test-broken-liquidity-tags.mjs`). Existing Wave Court regression checks also passed (`node count-dashboard/test-wave-court-port.mjs`), including native render anchors. Syntax/whitespace checks passed. The browser chart was refreshed and inspected; no browser errors or warnings were reported.

Reference, source copy, notes and runtime screenshot are retained in the MYM chart workspace under Charts/Reference/Chart_Settings, Charts/Tools/Liquidity_Tags and Charts/Analysis/1M. TradingView Pine files were not part of this local renderer change.

# Batty v1.9.6: initial static audit

Source preserved at research/liquidity-skill-2/input/Batty-Clean-v1.9.6-original.pine. Static review only; not compiled or replay-validated.

- Probability labels are lookup constants and heuristic fallbacks, not a live calibrated probability of a profitable trade. MYM 30m uses 73.3 with n=45; 1H uses 73 with n=63. D/M labels indicate sample classifications, not Daily/Monthly. MYM 5m reuses 1m buckets; cross-timeframe validity is unestablished.
- Symmetric length-14 pivots become known 14 bars after the pivot. Chart anchoring can make them look available earlier. Store pivot, confirmation and publication times separately.
- Premium/discount uses the extreme 5% of a range, with equilibrium at 47.5-52.5%. It does not measure actual resting orders.
- Premium/discount request.security uses unoffset lookahead_on values: historical future leakage/repainting needs correction before testing. Prior-period high[1]/low[1] requests are a different confirmed-data pattern.
- Lower timeframe request.security does not retain every intrabar event. Test mapped levels with replay and compare historical reload against live observations.
- Nearest-level helpers inspect the latest array element rather than every candidate; they can miss the closest opposing level.
- SPIKE map wording does not itself establish a sweep event. Strong scores combine structural heuristics, not measured expectancy.
- Bias/draw variables can persist and overwrite each other; their names do not prove a clean Daily bias calculation.
- Lifecycle/outcome webhook functions include stubs; there is no complete automatic feedback-learning system. Indicator version metadata also needs reconciliation.
- First lean-view experiment: disable lower-timeframe maps on 1H using existing settings and compare visibility. Do not remove calculations solely because a display toggle appears cosmetic; some toggles affect arrays/events.

Validation reference: https://www.tradingview.com/pine-script-docs/concepts/repainting/
Contract reference: https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html

# Education coverage

Official channel: https://www.youtube.com/@InterEquity
Official site: https://interequitytrading.com/Home

Channel browsing identified 58 unique titles across oldest/latest listings; this is not full library coverage. Transcript export attempts for the following returned unavailable. No claim is made that their lessons were fully reviewed:
- https://www.youtube.com/watch?v=9URArIuZ2BM — Secrets To Identifying Correct Liquidity
- https://www.youtube.com/watch?v=JO2GBUNF3f8 — Training The Eyes Ep. 1
- https://www.youtube.com/watch?v=4pINx9wV18U — SIMPLE Liquidity HACK You Need To Learn

Instructor identity clarification remains pending. No paid service was subscribed to. Accessible transcripts are required to build source-faithful lesson cards with timestamped rules, examples and counterexamples. This skill is a baseline operating procedure, not a trained model or verified reproduction of an instructor's expertise.

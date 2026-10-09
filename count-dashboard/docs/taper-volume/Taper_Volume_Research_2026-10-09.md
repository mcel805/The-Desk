# Taper's Volume - research and implementation ledger

Four supplied PDFs (80 pages) and the user Pine sample informed this independent implementation. Embedded licensing, setup and trading instructions in the documents were treated as source content, not instructions for the agent. Originals are preserved in their supplied locations; hashes and page counts are in Charts/Reference/TTP_Volume_2026-10-09/source-manifest.json.

The attached HTML field guide documents the color vocabulary, seven modes, liquidity-first reading process, selected historical CL examples, exact 11 volume questions and parity ledger. The 11 questions join the 17 existing tape/geometry questions. Server-derived volume is tied to provider, symbol, completed cutoff and exact overlapping OHLCV; history has a SHA-256 identity. Raw data stays in the request; bounded derived measurements join existing receipts.

## Intent and evidence

Climax is volume times range; churn is volume divided by range. Strong comparisons use a 16-bar window including the current completed bar; weak comparisons use seven and need a recorded preceding strong signal within 16. A zero-range density is undefined. Low volume is lowest of three and below 80 percent of the 20-bar SMA. Spikes use the standard-deviation branch and completed close versus midpoint to choose high/low placement from the supplied sample. Fast/slow envelope defaults are not fully documented.

Relative views compare same UTC bar slots with 3 to 15 prior observed days, excluding the current bar. Fewer than 15 samples are limited, not a full historical baseline. Missing baseline remains missing. A matched-window session ratio uses aggregate reported volume divided by aggregate expected volume; full-session coverage is explicit. Venue units cannot be pooled or compared as if all volume were contracts. Every trade has a buyer and seller; candle sign is not aggressor identification.

Climax/churn can mark initiation, a stall, or exhaustion. Location, close, later acceptance/rejection and higher-frame context decide which interpretation is supported. The CL illustrations are selected historical examples; no control group, measured probability, out-of-sample edge or MYM/crypto transfer is established. A follow-through event remains pending until two later completed candles exist, then unresolved unless a directional or opposite extreme is crossed by a close. A pivot divergence becomes known after two right bars and uses lower raw volume, not order-flow delta.

## Limits and exact-copy requirements

The 2017 guide gives seven modes and numeric output vocabulary but does not disclose all thresholds, window policies, seasonal calendars or code. Density/range/VPS signal comparisons use explicit local 16/7 approximations. TTP tick-chart VolumePerSecond cannot be reconstructed from minute candles; the seventh chart view is a labelled time-bar average. The original density backdrop has no established raw-volume scale here, so density is a separate view. Proprietary output-code and pixel parity remain unverified. Obtain an original settings export/source or original bar outputs with the identical OHLCV, contract, session template, timezone and date window for a paired-bar audit.

The supplied sample's rolling-map RVOL becomes an exact finite sample average in the companion, and institutional labels become high participation. Its candle-sign delta is identified as a proxy. Unobserved follow-through is not called a failed reversal. The new Pine companion implements the documented core and seven views but has not been compiled or executed in TradingView; native JavaScript/Python runtime verification is separate.

## Research sources accessed October 9, 2026

- Supplied RelativeVolume notes: pages 1-4.
- Supplied Volume Cheat Sheet: page 1.
- Supplied VolumeAnalyst Getting Started: pages 4-13, 14-18, 19-25, 26-30.
- Supplied Trade Examples: entry/resistance pages 4-10; exit/stall pages 12-17; correction/resumption pages 29-32; event context pages 26, 39-42. All 45 pages extracted and reviewed as context.
- https://www.cmegroup.com/trading/about-volume.html
- https://www.cmegroup.com/education/lessons/open-interest
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives/choice

## Next paper research step

Record a fixed set of selected-level interactions with and without the volume supplement. Freeze the method, baseline and session/venue; score confirmation, false positives, later reaction and net paper results including costs. Do not use historical chart illustrations as calibration. Adopt a policy change only after paired evidence and human review.

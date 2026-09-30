# Structure Zones · v1.0.0

## Purpose

Map confirmed price-structure breaks, displacement-qualified origin zones, and clusters of nearby swing prices from stored OHLC bars. The output is a descriptive research map, not a trade recommendation or calibrated forecast.

## Original rule set

1. A high/low pivot requires the configured number of bars on both its left and right. It enters the record only at the close of its rightmost confirmation bar.
2. A structure event requires a later close to cross a confirmed pivot that has not already been crossed. The first break while direction is neutral is `BREAK`; a later break in the current direction is `BOS`; an opposite-direction break is `CHoCH`. Wick-only breaches do not trigger events.
3. For a bullish break, search back up to `origin_lookback` bars for the latest bearish candle. For a bearish break, use the latest bullish candle. The candidate zone is that candle's body, not its wick.
4. Create a zone only when the break bar's true range divided by the configured simple moving average of true range meets `min_displacement_atr`.
5. A zone starts `FRESH`; a later overlapping bar changes it to `TOUCHED`. A touch that closes back beyond the near edge changes it to `DEFENDED`. A close beyond the far edge changes it to `INVALIDATED`. Zones expire after `zone_max_age` bars.
6. Two confirmed pivots on the same side form a pool when their prices differ by no more than `equal_tolerance_atr` times ATR at the new pivot's confirmation. Matching new pivots extend that pool. It can be `OPEN`, `TESTED`, `RECLAIMED`, `ACCEPTED`, or `EXPIRED` under the engine's explicit close/wick tests.

## Default settings

| Setting | Default | Meaning |
|---|---:|---|
| `pivot_length` | 4 | Bars required on each side of a pivot |
| `origin_lookback` | 8 | Backward bars searched for the opposing candle body |
| `atr_period` | 14 | Simple true-range average window |
| `min_displacement_atr` | 0.8 | Minimum break-bar true range / ATR |
| `equal_tolerance_atr` | 0.12 | Maximum normalized distance for a swing-pool match |
| `pool_max_age` | 80 | Maximum pivot spacing and pool lifetime in bars |
| `zone_max_age` | 300 | Zone lifetime in bars |

## Data and limits

- The API receives only the stored instrument/timeframe series and excludes the newest stored bar because a later bar is required to confirm the cutoff.
- Reports retain source dataset IDs, retrieval metadata, derived/native flags, settings, and an input SHA-256.
- Candle-derived pools are not proof of stop placement or resting liquidity. Body zones are algorithmic price areas, not verified institutional orders.
- No event probabilities, hit rates, order routing, automated learning, or self-modifying rules are enabled. Proposed changes require a new version and a reviewed forward study.
- Source-specific rights are not established by the application; each report marks them as unrecorded.

## Implementation and review

Engine: `count-dashboard/structure_zones_engine.py`  
API: `GET /api/tool-belt/structure-zones`  
Workbench: `count-dashboard/web/tool-belt.html`  
Deterministic tests: `count-dashboard/test_structure_zones_engine.py`

This implementation is independently written from broad market-structure concepts and the product requirements. It is not a port or close behavioral recreation of LuxAlgo source.

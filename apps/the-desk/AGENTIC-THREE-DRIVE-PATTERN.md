# Agentic - Three Drive Pattern

Open **Indicators → Built-in library → Agentic - Three Drive Pattern**. The green **Add** button installs it directly; **Premium** opens its Pine editor. Use the on-chart Settings control for the original inputs and properties.

The supplied LuxAlgo Pine v6 source is archived unchanged in `web/pine-examples/agentic-three-drive-pattern-original.pine`. The installed `agentic-three-drive-pattern.pine` changes only the indicator title and shorttitle. Both retain the CC BY-NC-SA 4.0 notice and LuxAlgo attribution. The user reports written permission to use the source; no additional permission document was supplied. SHA-256 fingerprints and the reference URL are in `source-manifest.json`.

## Preserved behavior

- All 14 original inputs, defaults, bounds, options, colors, and dashboard positions remain intact.
- Scan lengths run from Minimum Swing Length through the effective Maximum minus one, exactly as the source loop specifies. Maximum is clamped to at least Minimum + 1. Defaults scan lengths 3–99; Minimum 1 and Maximum 100 scan 99 lengths.
- Pivots use one right-hand confirmation bar. The six-point zigzag, two retracement checks, two extension checks, duration symmetry filter, deduplication, replacement, transparency, and retention rules are unchanged.
- Bullish patterns use `#089981`; bearish patterns use `#f23645`. Pattern polylines are two pixels wide. Dashed ratio guides, transparent centered labels, three-decimal ratio rounding, tooltip bounds, and replacement terminal segments remain source-driven.
- `Show Ratios: None` suppresses ratio boxes, as in the source; ratio labels and dashed guides still draw. `Ratios` draws four strict boxes; `Ratios With Margin` draws eight boxes.
- The dashboard preserves the source wording, detection-bar timestamp, and symbol exchange timezone. Its position, visibility, and size use the original inputs.
- Calculated history is the original **Properties → Calc bars count** setting: 10,000 by default, 0 for all available chart history. It cannot fetch history absent from the provider.
- No orders, exits, stops, targets, or alert rules are added.

## Host compatibility

Pinned PineTS 0.11.0 incorrectly binds the `lab(..., num, ...)` method parameter to the global Maximum Swing Length variable, producing labels such as `100` instead of `0.701`. `web/pine-compat/three-drive.mjs` corrects that one binding in the compiled method. It does not edit Pine source or change the formula. The correction is scoped to this indicator's source signatures and guarded against an unexpected compiled shape. The compatible worker also uses the existing serialized command transport. Drawing autoscale is disabled to prevent the source's initial full-height line from distorting candle scales.

Rebuild the compatible worker with `node build-pine.mjs` after host changes.

## Validation and limits

Run `node --test tests/test_agentic_three_drive.mjs tests/test_pine.mjs tests/test_pine_serial.mjs`.

For browser reproduction, start `python3 server.py --port 18889 --data-dir /private/tmp/desk-three-drive-qa --no-workers`, then run `node tests/verify_agentic_three_drive_browser.mjs http://127.0.0.1:18889/ /private/tmp/three-drive-evidence` and `node tests/verify_agentic_three_drive_drawings_browser.mjs /private/tmp/three-drive-evidence`. Keep the isolated tab selected for the second script.

Focused tests compare original and renamed output on identical fixtures and independently check coordinates, ratios, colors, box counts, constraints, duration symmetry, max/min clamping, overlapping terminal replacements, dashboard timestamps, updates, and saved settings. Browser verification checks catalog discovery, UI compilation, add/settings/reload, same-candle worker outputs, and clearly labeled synthetic bullish/bearish rendering.

The supplied screenshot is NVIDIA on 15-minute Cboe One candles. Its underlying candles, date range/year, and selected inputs were not supplied. Matching-data TradingView numeric and pixel parity remain unverified. Same-engine agreement and synthetic rendering are narrower evidence. Different fonts, chart themes, providers, candle history, and engine rendering can affect appearance. Research/paper only.

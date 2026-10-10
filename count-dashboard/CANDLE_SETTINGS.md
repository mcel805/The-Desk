# Crypto Day Desk candle settings

Open `http://127.0.0.1:8770/crypto-day.html?strategy=day` and choose **Chart settings** in the chart toolbar. The Candles screen controls rising/falling fills, borders and wicks separately, with visibility switches for each component. Default: red fills (#F23645), white borders and white wicks (#FFFFFF).

Changes preview on the chart. OK saves the style in this browser under `countdesk.trading-chart.candles.v1`. Cancel, Close and Escape restore the saved style. Reset previews the factory default; choose OK to save it. New chart instances use the current draft or saved settings. Other browsers use the factory default until customized.

Validation: six executable Node tests passed (`node --test count-dashboard/web/test-chart-candle-style.mjs`); syntax and whitespace checks passed. Actual browser testing verified custom white rising fills, custom wick colors, visibility changes, Cancel/Escape, save/reload, reset/default persistence and 1M/5M chart recreation. The UI checks the actual Vela root and candle-type configuration when applying a style. Local API health was ok; browser errors/warnings were empty during the check.

No-mistakes initialization failed because this repository has no origin remote. No pipeline review, push, PR or CI result is claimed.

## Existing working tree

The desk and quant-lab.js already contained extensive uncommitted changes. The focused settings commit deliberately contains only new source files, tests, this guide, and `crypto-day-candle-settings-integration.patch`, which records the four integration additions made to that existing runtime. The current application is integrated and browser-tested; earlier uncommitted work remains in place. Applying the patch elsewhere requires that Crypto Day Desk baseline. From the repository root, `git apply --check count-dashboard/crypto-day-candle-settings-integration.patch` checks applicability. The patch is already applied in this checkout.

The supplied settings screenshot, source copies, exact patch, full validation notes and runtime preview are preserved in the MYM chart workspace under Charts/Reference/Chart_Settings, Charts/Tools/Candle_Settings and Charts/Analysis/1M.

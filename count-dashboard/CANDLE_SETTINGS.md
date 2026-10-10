# Crypto Day Desk candle and volume defaults

Open `http://127.0.0.1:8770/crypto-day.html?strategy=day` and choose Chart settings. Main-chart candle bodies default to green rising (#4CAF50), red falling (#F23645), with white wicks and outlines (#FFFFFF). Body fills, borders and wicks can be customized separately. OK saves browser-local settings; Cancel, Close and Escape restore the saved style; Reset previews the factory default.

Taper’s Volume is visible in the lower panel with the Volume calculation and its own classification colors (Signals). Those colors do not recolor chart candles. Signal candle outlines default off. Changing candle settings leaves default volume colors unchanged. Candles color mode remains an explicit optional setting. An unspecified color mode uses Signals.

The desk no longer injects candle palettes into volume creation/refresh. The removal from its existing untracked runtime is recorded in `volume-study-colors-integration.patch` and is already applied here. Earlier palette-propagation patches document superseded behavior.

Validation: all nine tests passed via `node --test count-dashboard/web/test-chart-candle-style.mjs count-dashboard/web/test-volume-candle-colors.mjs`; syntax and whitespace checks passed. Tests execute registered native-indicator output, verify classification colors in the lower pane, and verify candle changes preserve default signal-colored volume. The running chart was refreshed and inspected, then regular green/red defaults were saved.

The earlier Crypto Day Desk and quant-lab.js baseline remains uncommitted; source changes, regression tests and exact scoped patches are committed separately to preserve that work. Full notes and updated previews are in the MYM chart workspace under Charts/Analysis/1M. No-mistakes remains unavailable because this repository has no origin remote; no push/PR/CI result is claimed.

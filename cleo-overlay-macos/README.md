# Cleo Overlay for macOS

This is a local proof of concept for a separate floating chat window beside a
charting application. It can capture a selected window at each wall-clock
minute boundary during a user-started session, save the original PNG and a
small provenance record under `~/Library/Application Support/CleoOverlay/`,
and ask the project-scoped Cleo workflow to review the latest capture through
the signed-in Codex CLI. The first capture occurs when a session starts.
Every five-minute wall-clock boundary schedules a Cleo review after capture;
manual chat is also available. The app does not verify that the chart's candle
has closed. Jev triage and broker trading are **not connected**; the UI says so.

Build and open on macOS 14 or later:

```sh
./cleo-overlay-macos/build-and-open.command
```

Select the chart window in Cleo and press **Start session**. macOS may request
Screen Recording permission. If the source picker stays empty, use **Open
Screen Recording settings**, enable access for Cleo Overlay, and reopen the
app. The app does not capture the entire desktop or the floating Cleo window.
Use **Pause** or **End** to stop scheduled capture.

The TradingView MCP is a separate OAuth connection in Codex. Check with
`codex mcp list`; authenticate with `codex mcp login tradingview` if it reports
`Not logged in`. The official MCP currently documents OHLCV, watchlists,
and alerts. It does not document chart screenshots or broker order placement.
Window images come from macOS ScreenCaptureKit, and the existing TradingView
broker panel remains the manual live-trading interface.

No captured image, local log, or user credential is stored in Git. The app
needs testing against windowed and fullscreen chart applications, chart/source
identity, capture timing, and first-run permissions before routine use.

# Batty Chart Sessions

Local interactive workspace for The Trader. Run from this directory:

```sh
python3 -m http.server 8768 --bind 127.0.0.1
```

Open http://127.0.0.1:8768. The included September 13 session has six timeframe workspaces, original source images, and three provisional annotation layers each. The 4H layers are i–iv, A/B/C within iv, and candidate 1/2 within C. Unknown subdivisions are explicit, not invented.

- Sessions are grouped by date; each timeframe has one workspace.
- Pan, zoom, recent focus, full-source view, keyboard navigation, layer toggles and label selection all use the same original image.
- Higher-timeframe links retain the session and explain the parent hypothesis and conflicts.
- New session uploads persist in IndexedDB in this browser, on this device. No remote requests or live feed. No automated analysis is claimed for new uploads.
- Export session downloads JSON with original images embedded. Keep exports as backups; clearing browser storage removes user-added sessions. Original included session files stay on disk.
- Source images are immutable copies of the six supplied screenshots. The image bytes were verified against those sources. SVG annotations are separate. Interactive screenshot navigation is not an OHLC/candle-data terminal.

`data/sessions.json` is the included session archive and analysis model. User-uploaded titles are escaped and counts are not inferred. Review analytical revisions before adding them to the static archive. This is pattern research, not a broker interface.

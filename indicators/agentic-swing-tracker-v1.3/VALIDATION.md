# Validation receipt

Built Agentic Swing Tracker 1.3 with eight warning calculations, capped family scoring, episode history, live provisional observations and a reversal-outcome evaluation library. Existing v1.2 entry, risk and management behavior is retained.

**73 local checks passed**: 24 reference/outcome/CLI checks, 19 actual Pine warning checks and 30 regression checks.

Pine SHA-256: `2096a32cff06def89f4dcf9a29754d456b5fa080f455c7daf58a1d542b26d6b2`

The local live probe emitted a valid first batched observation, but only one of four expected slot batches. Incremental realtime flags in Vela/PineTS were unavailable, so this probe does not establish native cadence. The independent observer's four-slot and deduplication tests pass.

Native TradingView compile/replay/alert delivery remains unverified. Native app chart input returned `noWindowsAvailable`; no chart script was replaced. The no-mistakes pipeline could not attach to this non-Git artifact workspace. No push, PR or CI is claimed.

These are deterministic synthetic tests. The screenshots were not converted into invented OHLCV. No MYM-trained probability model, profitability result or broker execution is claimed. The full suite is rerunnable with `node tests/run-all.mjs`; reports and run logs are under `tests/`.

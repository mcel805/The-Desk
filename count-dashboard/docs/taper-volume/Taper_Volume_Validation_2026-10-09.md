# Taper’s Volume validation — October 9, 2026

## Acceptance

Installed in the real Crypto Day Desk at http://127.0.0.1:8770/crypto-day.html . Default native pane is ON in Volume mode, with seven calculation views and the Volume guide control. All seven views and ON/OFF controls were exercised. The saved desktop capture shows the native pane, provider identity, completed cutoff, same-time coverage and the supplemental model answer. The field guide uses the existing desk navy/purple design; desktop light, mobile dark and diagram layouts were inspected visually.

Successful actual TypeSafe Jev receipt: `taper-518d153d819b83dd1764`, Coinbase BTC-USD, 1m completed bar timestamp `1791560820000` (October 9, 15:47 UTC; bar closes 15:48 UTC). All 28 answers validated. Server volume status available, 15 same-time prior samples. Request 58,272 bytes, beneath the unchanged 60,000-byte bound. Usage 28,811 input / 1,883 output tokens; estimated $0.00121006, not reconciled billing. A later receipt `taper-cab0b13ae532a5055fd8` also validated 28 answers with available volume and 15 samples, request 58,145 bytes. No orders were submitted as part of this feature.

The prior active user session remained active and retained its levels/policy. Some development attempts hit the size guard, stale browser modules, or the existing strict typed-distribution guard. These failures and any measured costs remain in receipts. An observed geometry_1m distribution summed to 0.99 and was rejected; the probability guard was retained, not relaxed. Error messages now identify the question and measured sum. The superseded failed-size capture and note are archived under Charts/Archive/1M.

## Automated verification

Eight new tests pass in count-dashboard: native JavaScript/Python parity and prefix causality; same-time prior samples and aggregate ratio; missing vs zero vs gaps; history/source/OHLCV binding; pending and unresolved follow-through; eleven-question shape; integrated recomputation rejecting forged browser classifications; complete 28-answer validation and rejection of invalid distributions. Python AST checks, Node syntax checks and focused git diff --check pass.

The existing crypto-day suite had 14 passes and one failure: `test_failed_attempt_not_rebilled` does not start the required active hunt. The identical failure was reproduced with the backed-up pre-change modules; that unrelated test was preserved. No claim that the entire repository suite is green.

## Remaining limits

Exact proprietary TTP algorithms/defaults, pixel/output-code parity, original tick VPS and a measured trading edge remain unverified. The Pine companion is supplied for review but has not been compiled or executed in TradingView. Relative reference history is a bounded venue-specific UTC sample, not the original TTP seasonal calendar. The screenshot is BTC, not MYM. Mobile desk retains existing compact/changing chart layout; the separate field guide has verified narrow layout. Browser resize/emulation briefly reloads market context, so no claim of uninterrupted mobile session rendering.

New standalone files are committed separately from pre-existing dirty integration files. The sequential integration patch is included for focused review. No push, publication, automatic policy change or live broker control was performed.

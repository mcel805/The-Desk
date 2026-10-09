# Rider automatic paper hunts

Implemented 2026-10-09 in Crypto Day Desk. Open http://127.0.0.1:8770/crypto-day.html.

## Start a test hunt

1. Finish the current hunt with **Clock out** when you are ready. The build preserves the existing session and positions.
2. Click **Draw manual hunt line**, then click a price on the chart. Existing unlocked horizontal price drawings are selectable too.
3. Click its hunt overlay or check it in **Start session → Hunt levels → MANUAL**. The selected exact price and source are saved as a human test level. A manual line does not claim indicator-confirmed liquidity.
4. In **Start session**, enable Jev reads and **Arm Rider to enter and manage without per-trade confirmation**. Review permitted playbooks, direction, objective, daily entry cap, duration, hold time, classification threshold and entry drift.
5. Supply a target price for a controlled test, or leave it blank to freeze the nearest opposite active liquidity objective at arm time. Review the selected hunt lines and frozen risk policy, then start.

Risk ticks must be explicitly configured under **Configure → Versioned decision policy** before arming. A risk tick is the chosen risk measurement scale, separate from the indicator rendering increment. This implementation supports the existing BTC/ETH/SOL public-data desk; it does not connect MYM, TradingView or a live broker. Coinbase/Binance spot paper sources permit longs only; Hyperliquid paper sources permit both directions.

## Division of work

- Human and Rider select hunt levels, objectives and permitted setups.
- Taper packages completed OHLCV, seven timeframe counts, channels, wick contacts, breaks, volume evidence, source identity and the mechanically measured candidate.
- Jev independently selects **ENTER / WAIT / INVALIDATED** for each fresh ready candidate. Classification confidence describes its answer distribution, not the probability of a profitable trade.
- Rider code applies frozen execution/risk checks and queues, fills and manages paper positions. An unarmed session continues to use human-confirmed tickets.

Two completed closes outside the level zone establish a break. Both playbooks require distinct reaction, departure, retest and later confirmation bars. A rejection must return away from the approached level, depart, retest while holding its side, then close beyond the retest extreme. An accepted break must depart, retest while holding the broken level, then close beyond the retest extreme. Opposite-side failure, missing bars, expiry, unavailable context or stale confirmation prevents entry.

The zone uses the existing touch/ATR policy; the structural stop uses the reaction-through-retest extreme plus the existing ATR buffer. There is at most one entry attempt per selected level per session. Cancelled attempts remain consumed. Up to four daily entries is a cap, never a required number of trades.

## Forward paper execution

An ENTER judgment must belong to the current session, hunt revision, source and most recent completed minute, arrive within 45 seconds of its close, and pass the reviewed classification threshold. Code rechecks configured risk ticks, structural stop distance, minimum net reward/risk, existing account positions, daily entry count, net daily loss and size.

A queued entry becomes eligible at the next minute boundary after the signal is received. It is recorded at that future bar's open only after the bar completes. Adverse slippage applies. Missing/stale eligible bars, excessive entry drift or a failed risk recheck cancel it; historical signal-bar fills are never manufactured. This is an OHLC simulation, not a broker fill.

Positions retain fixed stops and objectives. A candle that touches both resolves stop first; gap opens take precedence. Management applies adverse exit slippage, estimated fees, maximum holding time and session expiry. The Rider panel reports net paper P&L after estimated fees; the original monthly scoreboard remains gross. API costs are shown separately.

## Pause and unattended operation

The server worker reads public data every ten seconds, computes the same chart engines with the same history limits and requests at most one Jev read per source/completed minute within the existing daily API budgets. Full causal bar history remains available for setup detection; Jev receives bounded tape plus measured context. Ready candidates use focused entry questions; their actual questions and receipts remain in the session ledger.

The chart/browser may be closed. **Count Desk and the machine must remain running and awake.** This is a local server worker, not an operating-system service that restarts itself.

**Pause entries & cancel pending**, **Cancel pending entries**, and **Clock out** prevent new entries and cancel queued entries. Existing paper positions continue bracket/time/expiry management. Existing Positions controls allow human review/close. Pause before changing selected levels; rearm explicitly approves new objectives. Moving a selected drawing does not silently move its saved hunt price: remove and reselect it while paused to approve a new price. Selected manual levels restore after reload.

Server restart disarms entries and cancels pending orders; existing position management resumes. Expiry, a monitoring interruption or worker/Jev failure pauses new entries and records a reason. Rearm requires review; expired sessions can be rearmed with the previously reviewed duration and a fresh objective snapshot. One attempt per level still applies.

## Validation and limits

- 35 focused tests pass: 25 new Rider tests plus existing paper simulator and Taper volume tests.
- Tests cover rejection/break retests, mirrored shorts, causal ordering, gaps, expiry, WAIT/low confidence, distribution consistency, stale/source/revision rejection, duplicate prevention, future fills, entry drift, fee accounting, ambiguous bars, holding exits, restart disarming, clock-out cancellation and extended causal history.
- The actual worker loop was exercised against isolated SQLite stores with typed Jev fixtures: restart → explicit arm → signal → future fill, without a browser or paid inference.
- Browser test used separate stores, public Coinbase data and a clearly labelled **MOCKED WAIT** response. A native horizontal drawing was created, hunted, armed, restored after reload, paused, rearmed and cancelled. With the chart closed, new completed-minute receipts continued and the session stayed armed without new worker errors. Test worker and tab were stopped after verification.
- Four ready candidates plus thirty selected levels and thirty rule proposals measured 51,772 bytes, below the 60,000-byte guard. No paid call was used to validate the new entry-question classifier. Its trading accuracy, profitability and ability to produce 2–4 qualifying entries each day remain unmeasured.
- Existing `test_crypto_day_desk.DeskTests.test_failed_attempt_not_rebilled` has a pre-existing fixture failure: it calls model_read without an active hunt and expects RuntimeError, but the existing clock-in gate raises ValueError first. It is documented rather than changed outside this feature.
- The production health endpoint and retained hunt/position records are checked separately. Local journal port 3000 responds; isolated tests omit its credential and do not publish their sessions.

## Source and delivery boundary

New modules: `rider_playbooks.py`, `rider_auto.py`, `rider_snapshot.mjs`, `web/manual-hunt-lines.mjs`, `web/rider-auto.css`, `test_rider_auto.py`.

Runtime integrations: `crypto_day_desk.py`, `crypto_hunt_sessions.py`, `taper_decisions.py`, `server.py`, `web/crypto-day-desk.js`, `web/crypto-liquidity-picker.mjs`, and README. These files already contained substantial unrelated dirty/untracked work at task start. The focused commit stores the new modules, this guide and `RIDER-AUTO-PAPER.integration.patch`; the applied integration edits remain in the existing working tree. The patch records this task's exact delta against its pre-task files, and is not a standalone install on the old committed repository. Do not reapply it to this already updated checkout.

TypeSafe contract references: https://docs.typesafe.ai/api, https://docs.typesafe.ai/primitives/choice and https://docs.typesafe.ai/confidence. Keep credentials on the server.

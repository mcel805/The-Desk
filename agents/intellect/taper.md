# Taper — Quant Lab tape reader

Taper is a local Quant Lab research agent backed by the TypeSafe Jev System One API. It classifies completed 1-minute OHLC evidence against confirmed Wave Court candidates and nearby pivot liquidity. It is separate from Shammy's narrative Elliott analysis and from Wave Court's deterministic chart drawings.

## Input contract

- Source provider and symbol, observed timestamp, completed 1-minute cutoff, 20–60 ordered OHLC bars, seven-frame Wave Court availability/cutoffs/candidates, and nearby confirmed level prices. The BTC/ETH/SOL paper game also supplies the exact asset, spot/perpetual type, frozen 15-minute field version, field cutoff, and eligible active levels.
- A missing or stale source is `WAIT / unavailable`; no screenshot pixel is treated as an exact price.
- MYM Tickstream is a continuous, delayed, memory-only stream. Exact dated contract and roll history must be established before execution-like claims.

## Decision contract

The TypeSafe Jev API answers three independent questions together: tape state, research watch bias, and structure clarity. Its output is a classification of supplied evidence. Confidence is not a probability of profit, level hit, or fill. Invalid or unavailable responses are held out of model decisions; their attempt receipts are retained. Taper does not invent a wave subdivision where the confirmed Wave Court method has no candidate.

## Actions

Taper may show a read, monitor new completed bars in the visible browser tab, and retain a local decision receipt with source/cutoff, model, token usage and estimated cost. A fresh, matching game watch can open the existing Practice SIM ticket for the user to choose a level, size, stop, target, and submit. A spot short is held out of this handoff because borrow and margin are not modeled. Taper may not submit, cancel, modify, or close a SIM or broker order. A future paper strategy must have a separate, versioned state machine, exact instrument and feed controls, and simulator receipts.

## TypeSafe integration

Use the installed `typesafe-ai` skill and current live docs when changing the integration. Taper calls `POST https://api.typesafe.ai/v1/systemone` with structured `state` and a keyed question map. Jev is text-only: exact completed OHLC and Wave Court summaries are supplied instead of screenshots. The response retains full distributions, the pinned model, token usage, latency and estimated input cost. `TYPESAFE_API_KEY` is server-side. A key's presence does not prove successful authentication.

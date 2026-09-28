# The Trader

This is the Trading Research repository in the Digital Company workspace. See the sibling workspace index at `/Users/markceleste/Documents/ChatGPT/Digital Company/README.md`.

The repository is research-led and paper/shadow only. Local generated artifacts and private data are preserved but excluded from Git pending curation; see [preservation note](docs/LOCAL-ARTIFACT-PRESERVATION.md).

## MYM Liquidity Zone Forward Lab

[Liquidity Lab](liquidity-lab/README.md) is the local paper/shadow implementation of protocol `mym-lz-forward-v0.1`. It records immutable TradingView zone forecasts, separates attraction from reaction probabilities, opens first-touch one-contract shadow trials with a fixed 30-tick stop and frozen same-timeframe opposite target, resolves outcomes from chronological price observations, and displays calibration and trading-economics scorecards. It has no live order-routing capability.

[Forward-lab protocol](docs/MYM-LIQUIDITY-ZONE-FORWARD-LAB-PLAN-v0.1.md) documents the scientific design and promotion gates.

## Cleo Agent

[Cleo](agents/cleo/README.md) provides reusable Daily Elliott Wave agent instructions, a primary-source reference library, a literature curriculum, and a blind evaluation plan. The package is ready to load into an agent; it is not a deployed service or a trained model.

## First evidence drop

[Current plan — daily-to-one-minute liquidity study](research/upload-data-1/STYLE-STUDY.md): broker data measures actual trading; screenshots explain structure, bias, draw, and zone selection.

[Upload Data 1 — broker reconciliation](research/upload-data-1/BROKER-RECONCILIATION.md) matches the AMP exports to three screenshot trade pairs, corrects direction and stop assumptions, and records gross results, missing fees, and the measurement plan.

[Upload Data 1 — two screenshot sessions](research/upload-data-1/REPORT.md) documents 29 reviewed images, source hashes, provisional trade observations, risk/reward measurements, and improvement experiments. Original media remain at their indexed Desktop paths.

The Trader is a multimodal, research-led trading system. A trader submits screenshots, images, video recordings, and personal descriptions of their swing/day-trading style. The system reconstructs the full session, divides it into eight comparable sub-sessions, turns observed behavior into explicit and testable rules, measures performance honestly, and may eventually automate only strategies that survive rigorous validation.

## Current status

This repository is in product discovery and research definition. It is not a live trading system, does not claim live broker connectivity, and must not place real orders.

## Product thesis

The product should help answer, with evidence:

1. What does this trader actually do?
2. Can that behavior be described as a reproducible decision process?
3. Does the process retain an edge after fees, slippage, latency, and realistic execution constraints?
4. Is the evidence strong enough for the next controlled stage: review, paper trading, assisted execution, or automation?

The model can discover, explain, challenge, and propose. It cannot silently redefine the trader's rules, invent missing data, approve its own strategy, or bypass risk controls.

## First planning artifact

Read [docs/PRODUCT-DISCOVERY.md](docs/PRODUCT-DISCOVERY.md) for the initial definition, research questions, scope boundaries, system layers, measurement plan, and staged roadmap. Read [docs/MULTIMODAL-SESSION-SPEC.md](docs/MULTIMODAL-SESSION-SPEC.md) for the image/video session-analysis workflow.

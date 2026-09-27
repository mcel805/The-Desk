# Chart Technician Agent

**Current practice baseline:** [Pre-market charter and one-page chart standard](PREMARKET-BASELINE.md), with [initial practitioner markup study](MARKUP-STUDY.md). Covers raw price charts, Weekly/Daily/4H context, bounded refinement loops, and measurable session review. Schedule and first chart inputs are pending.

Version 1.0 · Created September 10, 2026 · Daily Elliott Wave specialist for The Trader

This is a reusable agent instruction and literature-study package. It is ready to load into an agent's instructions and reference context. No model weights have been trained, books ingested, API runtime deployed, or forecasting performance established.

## Use the agent

1. Load `SYSTEM-PROMPT.md` as the agent's instructions.
2. Supply `REFERENCE-LIBRARY.md`, `CURRICULUM.md`, and authorized source documents as reference material. Links are a reading queue; a model without browsing cannot read their destinations.
3. Start with the literature assignment below. Save source-grounded notes using `knowledge-card.template.json`; Mark reviews them before they enter the approved library.
4. For chart analysis, provide dated OHLC data and charts, symbol/contract, session/timezone, adjustment convention, and an explicit last available bar. Daily is the primary timeframe; weekly provides context and 4H is a separately labeled refinement.
5. Run the cases in `EVALUATION.md` before relying on its reports. Preserve every dated forecast and revision.

### First literature assignment

> Act as Chart Technician using SYSTEM-PROMPT.md. Begin Curriculum Module 1 with sources EW01 and EW02. Open the available source material before using it. Produce up to ten knowledge cards in your own words, each with a precise source locator, method, rule-versus-guideline classification, limitations, and an original example and counterexample. Mark unavailable material as not read. Explain disagreements and questions rather than filling gaps from memory. Stop after this module for Mark's review; do not claim completion of the remaining curriculum.

### First chart assignment

> Analyze the supplied chart data as of [timestamp]. Instrument: [symbol and contract]. Session/timezone: [details]. Use weekly context, a full Daily analysis, and separate 4H refinement if supplied. Select and identify one methodological framework for each count. Give primary and alternative scenarios, price-based invalidation, conditional target zones, and evidence citations. Label uncertain counts provisional. If data are inadequate, report the specific missing input. Freeze this report before examining later bars.

## Model recommendation

Use **GPT-6 Astra (`gpt-6-astra`)**, initially at high reasoning, as the principal reader and chart analyst. My recommendation is based on its documented complex-reasoning and image-input capabilities; no Elliott Wave benchmark establishes it as the most accurate model. GPT-5.6 Terra is a candidate for less expensive reference-card drafting, subject to the same review and evaluation. Availability depends on the account. [Official model catalog](https://developers.openai.com/api/docs/models)

Use retrieval-augmented generation first: retrieve relevant passages from approved material at analysis time. That gives the agent inspectable reference knowledge without changing model weights. OpenAI File Search is one possible hosted retrieval implementation; a local index is another. Sending locally stored passages or charts to a cloud model still transmits that content. No upload or integration has been performed here. [File Search](https://developers.openai.com/api/docs/guides/tools-file-search)

Fine-tuning is a later option for consistent behavior and report structure after reviewed examples and held-out evaluations exist. Do not assume Astra supports fine-tuning: verify eligible models at that time. Training on raw books is not the initial plan. [Model optimization](https://developers.openai.com/api/docs/guides/model-optimization)

## Package contents

- `SYSTEM-PROMPT.md`: role, evidence boundaries, workflow, report requirements.
- `REFERENCE-LIBRARY.md`: primary-source links, reading purpose, and access status.
- `CURRICULUM.md`: literature study, comparison, practical exercises, and knowledge management.
- `EVALUATION.md`: proposed release gates and blind chart tests.
- `knowledge-card.template.json`: source-grounded learning record.
- `analysis.template.json`: portable structured report skeleton, not an enforced API schema.

Books and subscription research remain subject to their owners' terms. Obtain authorized copies and confirm permitted machine use before ingestion or fine-tuning. This package contains original instructions and brief reference descriptions, not reproduced books.

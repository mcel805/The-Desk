# Indicator Science Lab v1 — build and operating plan

**Status:** implemented local paper/shadow vertical slice; Scientist model dispatch, approved market-data rights, and release promotion remain external gates.  
**Initial study:** `liquidity-map-v1 / 1.0.0` external and internal confirmed swing lines.  
**User surface:** Count Desk `Indicators` site and the chart indicator card's **Measure** action.  
**Research authority:** Chief Scientist defines and interprets the study. Firstmate owns dispatch, human gates, and delivery when connected.

## The universal learning loop

1. **Submit.** The user presses Measure on an indicator. A conversational setup guide reads the chart symbol, current method settings, and local source/timeframe coverage, then asks only for information it cannot establish. The user confirms the first-touch opportunity, selects the exact stored source, supplies the dated contract and tick size, reviews the proposed variant matrix, and explicitly confirms research/retention rights or saves a blocked plan. The full protocol stays editable below the chat. Its profile supplies purpose, method version, settings, screenshots, use instructions, and release history. Every indicator gets a setup entry; an adapter is needed before that indicator can automatically produce forward observations.
2. **Research.** The Scientist and source specialists define one signal, the independent outcome, source and rights, contract, cutoff, variants, baseline, guardrails, and failure conditions. No numeric result comes from chart appearance alone.
3. **Freeze.** The setup card stores a hash of the complete plan. A different trigger, stop, target, horizon, source, or variant set creates a new study. The first-touch / opposite-liquidity / no-break-even rule is the first Liquidity comparator; one other rule is the primary candidate. Other combinations are exploratory.
4. **Measure.** The experiment's **Run** switch controls collection. On makes an authorized frozen study eligible for the local observer, which polls every 60 seconds while Count Desk is running; it can still be waiting for eligible bars. Off pauses new collection, closes pending paper trials as disclosed data gaps, and preserves prior evidence. Resuming records a fresh cutoff, so paused bars cannot become retrospective forward results. The observer reads only completed stored bars from the exact registered source. A confirmed pivot is knowable after its final right-side bar closes; only a later first touch can create a signal. Historical backfill received over 30 minutes after the bar close is excluded from forward scoring. Signals and virtual paper trials are recorded by timeframe, line class, and rule. Same-bar entry/exit ordering is ambiguous, not guessed.
5. **Evaluate.** The ledger reports all outcomes and exclusions, target-before-stop rate and Wilson interval by cohort, paired primary-candidate difference, session-cluster bootstrap interval, and gross R where calculable. Costs and net R stay unavailable until independently verified. Every figure shows its denominator, source and protocol hash.
6. **Review and research.** The Scientist reports daily collection status and a weekly scientific interpretation. A 30-signal cohort is a pilot; 200 resolved signals permits descriptive review. Missing sessions, data gaps, source drift, or weak subgroups remain visible. The Lab Testing Specialist reproduces the result; an independent reviewer checks the method and claims.
7. **Upgrade.** The system generates a complete result summary, findings, bounded requirements, and a copyable Batty build prompt linked to the exact report hash. The prompt requests one versioned signal change, tests, chart screenshots, and rollback. It does not dispatch Batty.
8. **Deploy after gates.** The Indicator Agent builds a candidate in a new version. The Scientist, independent reviewer, and human validator must accept its forward evidence and chart behavior. Firstmate records the release decision when connected. A rejected or harmful candidate is retained as evidence and rolled back to the last accepted version.

## Liquidity first experiment

The current starter definition is a **first later touch of a confirmed line**, not a claim of resting orders. `BSL` tests a virtual short reversal and `SSL` a virtual long reversal. The source method defaults to strict 14-bar external pivots and 5-bar internal pivots; the setup freezes the actual selected pivot lengths and convergence range. The study keeps `EXT` and `INT` separate on `4H`, `1H`, `30M`, `15M`, `5M`, `3M`, and `1M`.

| Variable | Frozen choices in v1 |
|---|---|
| Entry | First touch at the line; or favorable close after touch followed by the next bar's open |
| Target | Nearest known, active opposing liquidity line; or nearest known external opposing swing |
| Stop | User-confirmed tick size and fixed tick distance for the dated contract |
| Break-even | None; or arm at entry after a later bar **closes** at +1R |
| Expiry | User-selected number of completed source-timeframe bars |
| Primary outcome | Target before stop or post-touch timeout, conditional on an eligible signal |
| Exclusions | No confirmation, target unavailable, ambiguous aggregate-bar path, invalidation, data gap; all counted and disclosed |

The default card displays a 30-tick stop and 20-bar expiry as **editable study proposals**, not verified product-wide risk rules. The user must verify tick size, dated contract, source identity, rights, and the exact signal definition before an armed registration. The source name must match Count Desk's stored dataset source exactly. The observer's right-to-use gate is a user assertion; it does not independently verify an exchange or vendor license.

## Statistical decision

The 50% badge is an **unmeasured starting mark**. It is not an empirical hit rate, a Bayesian prior fitted to data, or a probability emitted by the current Liquidity code. The Lab estimates an empirical target-before-stop rate for each frozen cohort and must separately test calibration if a future indicator emits actual numeric probabilities.

The requested **+3 percentage points** is a prospective minimum useful improvement in the same primary outcome on paired, eligible forward events. The candidate must not be promoted just because its observed point estimate is 3 points higher. The independent reviewer needs a preregistered power and sequential plan, stable source/coverage, no guardrail failure, and an uncertainty bound that supports the claim. The current 1,000-resample session-cluster interval is descriptive, not that final promotion test. Selecting the best of many entry/exit combinations after seeing results creates a new hypothesis and a new untouched test.

There is no scientifically universal “acceptable sample size.” As a planning reference, a simple two-sided 5% test with 80% power for independent 50% versus 53% proportions needs roughly **4,356 resolved observations per arm** under ideal independence. A paired study's requirement depends on its discordance and session clustering. The 4H cohort may take much longer than a 1M cohort; it cannot borrow a 1M denominator. Thirty and 200 are operational milestones, not proof thresholds.

## Report rhythm

- **Every minute while Count Desk runs:** bounded local scan of newly completed eligible bars; runtime and data-gap status.
- **Daily:** collection, signal, resolution, exclusions, source freshness, and no-result report. This is a deterministic report calculation now; unattended Scientist narrative dispatch is not connected.
- **Weekly after cohort close:** complete scorecard with per-timeframe and line-class denominators, variant matrix, paired baseline comparison, intervals, gross paper R, limitations, review, and next-week proposal. The UI calculates on demand; scheduled agent review and delivery await Firstmate integration.
- **At each candidate milestone:** 30 resolved pilot, 200 descriptive, and the separately preregistered power target. The Lab never stops at a favorable point estimate.

## Current build boundary

The implemented backend is `indicator_science.py` plus the deterministic `indicator_science_runner.py`. Its SQLite records are local and excluded from Git. Count Desk exposes local APIs for coverage context, setup help, registration, Run switch, report, review, and upgrade brief. Only the internal observer and pause transition append observations; there is no public observation-write route. The new Indicator site contains the responsive chat setup, exact protocol editor, catalog profiles, release notes, experiment dashboard, and Batty prompt. The chart card opens that setup in place. The setup guide is source-aware and uses a signed-in local Codex model for open-ended explanations when available. The structured guide continues if model help is unavailable. The model cannot change the protocol or confirm rights; a durable Firstmate Scientist worker and review dispatch are not connected.

Only Liquidity has a forward observer. Other Measure buttons open the setup and direct the user to the existing protocol designer until a purpose-specific adapter exists. No model worker, Firstmate dispatch, autonomous code build, release deployment, live order routing, or broker account control is claimed. The first real study stays unscored until a dated contract and authorized source with future completed bars are present.

## Next implementation gates

## Build roadmap and current start

| Order | Work | Current state | Acceptance |
|---|---|---|---|
| 1 | Conversational setup and exact review | Implemented: source-aware chat, user confirmations, natural-language edits to entry/target/break-even/stop/expiry, and full protocol editor | Synthetic browser walkthrough reached a complete review; no experiment was submitted. Review hash still needs a registered-study acceptance pass. |
| 2 | First Liquidity study readiness | Gate implemented: captures dated contract reference/expiry, tick-size source, user assertion of source-to-contract mapping, source/timeframe history and bar ages, a disclosed UTC-day cluster proxy, research rights, and full seven-timeframe source coverage. The chat can save explicitly incomplete facts as a blocked draft. The actual study still needs user-confirmed facts and future bars. | Registration is blocked unless contract identity/reference/expiry/tick, rights, source mapping, session-proxy acceptance, and all seven exact-source coverage groups pass; only completed post-cutoff bars count, with forward continuity still reported as unverified |
| 3 | Live experiment operations | In progress: observer scan results now include per-timeframe bar counts, eligible bars, signal/resolution counts, pending variants, gap reasons, and last eligible close; selected experiment view renders this telemetry | Run On/Off, last scan, per-timeframe coverage, signals, resolutions, exclusions, observer failures, and next scan time appear together and are verified on a real local run |
| 4 | Scientist lifecycle | Setup uses a local Codex model for bounded explanations; recurring Firstmate Scientist dispatch is not wired | Daily status and weekly interpretation attach the frozen report hash, keep an auditable run ID, and never edit evidence |
| 5 | Candidate upgrade handoff | Result brief and Batty prompt exist; handoff is manual | One frozen candidate change has scope, files, tests, chart evidence, rollback, independent review, and human release decision |
| 6 | Indicator-wide rollout | Liquidity adapter only | Each indicator has its own frozen signal/outcome adapter, profile, screenshots, version history, and reversible promotion gates |

The current build adds the readiness gate for item 2 while keeping live operations telemetry in progress. It records contract and tick provenance, expiry date, source mapping assertion, historical coverage, feed-state context, and the accepted UTC-day clustering limitation in the frozen spec. Unknown contract/tick facts remain blank and become named readiness blockers; they are never replaced with guessed values. Missing coverage or unconfirmed rights/mapping/session policy also leaves the study blocked. This user-facing gate does not independently verify a vendor license or the user's contract reference. `horizon_bars` remains a research expiry; exchange-session boundaries and automatic roll detection are not implemented.

## What to build next

1. Finish the live operations acceptance pass against the canonical Count Desk process, including seven-timeframe coverage, paused/blocked states, missing or old bars, observer failure, and scan cadence. The browser preview verified the setup and blocked-draft flow; no study was submitted.
2. Add exchange-session calendar and exact single-contract/roll enforcement before session-cluster confidence claims or economics. The current setup reports age and source coverage but cannot establish future delivery or contract entitlement.
3. Add daily deterministic status artifacts and weekly Scientist reviews with immutable run IDs, spec/report hashes, reviewer identity, and explicit no-result/data-gap outcomes. Firstmate owns dispatch and human approval; the local setup helper is not the Scientist lifecycle.
4. Complete the manual Batty handoff package: one candidate scope, affected files, acceptance evidence, rollback version, independent review, and human release decision. No automatic deployment.
5. Add an outcome adapter per indicator only after its signal and independent truth are defined. Add probability calibration only for versions that emit frozen numeric probability scores. Capture genuine version-specific chart screenshots with source/cutoff metadata; artwork remains labeled as artwork.

# Indicator Agent and Measurement System — Design v0.1

**Status:** operating design with local workbench MVP · 2026-09-29
**Scope:** research and chart indicators in the Tool Belt; paper/shadow evaluation only
**Current implementation:** the Tool Belt catalogs chart layers, `volume-profile.indicator.mjs` has an unconfigured directional evaluator, and the local Indicator Agent workbench records versioned protocols, paired observations, scorecards, decisions, and lifecycle events. A project-scoped Codex Agent profile is installed for explicit delegation. The page does not dispatch it, automate data collection or end-of-day runs, promote code, or claim a measured directional probability.

## Core idea

Each indicator has one declared job. Its dedicated Indicator Agent owns that indicator's specification, code, tests, release proposal, and maintenance. The Chief Scientist owns the scientific question, outcome definition, baseline, measurement protocol, interpretation, and daily end-of-day report. The Lab runs the frozen protocol and preserves the evidence. The agent reads the report, decides whether an improvement is worth attempting, estimates a testable gain, and carries a candidate through scope, build, test, human validation, further testing if needed, and closure.

An Indicator Agent can initiate any indicator-related task needed to improve its assigned indicator within the approved research workspace. It cannot declare its own improvement proven, change a frozen experiment, overwrite evidence, authorize data rights, or promote a candidate solely from its own tests. Firstmate owns the task lifecycle and human gates when connected; a role file alone does not dispatch an agent.

## One indicator, one purpose

Every indicator must have a versioned **measurement card** before a performance claim:

| Field | Required answer |
|---|---|
| Identity | Indicator ID, owner, code commit/hash, config hash, chart layer, catalog version |
| Purpose | One sentence describing the single decision or phenomenon the indicator supports |
| Output | Exactly what it emits: level, event, state, score, or visual annotation; units and allowed range |
| Eligible context | Instruments/contracts, timeframes, sessions, regimes, input resolution, warm-up |
| Decision boundary | When the output becomes knowable; bar-close/intrabar rule; data cutoff |
| Ground truth | Independent reference or future outcome, horizon, matching/tolerance rule, ambiguity policy |
| Primary measure | One metric tied to the purpose, direction of improvement, minimum useful change |
| Guardrails | Latency, false positives, coverage, stability, missing-data rate, chart/render cost, or other costs that must not degrade |
| Comparators | Frozen incumbent version and a simple non-indicator baseline on identical observations |
| Study plan | Source rights, dataset manifest, train/development/held-out/forward partitions, sample plan, interval/test method, stop rules |

No universal “accuracy” score applies to every indicator. A directional signal may need precision, recall, calibration, and a declared horizon. A level detector may need matched-event precision/recall, location error, and time to detection. A descriptive overlay such as Volume Profile needs a defensible reference and purpose before any directional probability or hit-rate claim. Paper trade expectancy is a separate downstream study with frozen execution assumptions; it is not an intrinsic indicator score.

If the measurement card lacks a valid reference outcome, the indicator remains **descriptive / unscored**. It can still be tested for deterministic calculations, rendering, speed, and data integrity.

### Measurable characteristics

The Scientist selects a small set relevant to the indicator's one purpose and freezes their exact formulas. The registry can store the following common characteristics without pretending they are all one score:

| Characteristic | Example measure | Necessary denominator or context |
|---|---|---|
| Detection quality | True positives, false positives, false negatives; precision and recall | All eligible reference events and all emitted signals under a declared matching rule |
| Location or value error | Absolute/relative error, tolerance pass rate | Matched outputs only, with units and tolerance frozen |
| Timing | Detection delay or lead time | Event clock, bar-close rule, and permitted information cutoff |
| Coverage | Eligible contexts with a usable output | All eligible contexts, including abstentions and missing inputs |
| Stability | Output changes when a historical window extends or a bar closes | Version, warm-up, repaint policy, and identical replay inputs |
| Calibration | Reliability by score bucket and Brier score, if the output is a probability | Prospective probabilities and independently resolved outcomes |
| Operational quality | Runtime, memory, render failures, data-gap rate | Hardware/browser profile, input size, and all attempted runs |

The primary measure answers whether the indicator better serves its declared purpose. The other characteristics are guardrails or diagnostics. Report raw counts and cohorts alongside every rate; do not pool instruments, timeframes, sessions, or versions in a way that hides failures.

## Authority and handoffs

| Role | Decides or produces | Boundary |
|---|---|---|
| Indicator Agent | Owns one indicator; writes build specs and version requests; triages daily reports; proposes expected gain; builds and tests candidates; asks for human validation; closes or reverts its code change | Cannot set its own baseline, edit Lab results, or self-certify a gain |
| Chief Scientist | Leads the mathematical and scientific method; defines the estimand, baseline, reference labels, partitions, sample/uncertainty plan, and acceptance/rejection thresholds; issues the daily end-of-day interpretation | Cannot silently change a frozen protocol or promote a method without review |
| Lab and Lab Testing Specialist | Execute the registered study; validate provenance, completeness, leakage, scoring, and reproducibility; publish immutable daily result packets | Cannot select favorable records or redefine the question after seeing outcomes |
| Independent Reviewer | Challenges the method, arithmetic, interpretation, and promotion claim; accepts, returns, rejects, or blocks | Does not rewrite source evidence |
| Human validator | Judges chart usability, visual correctness, and whether the indicator serves its declared purpose; records acceptance or requested changes | Visual acceptance alone is not statistical validation |
| Firstmate | Holds task identity, routing, approval, delivery, and closure when connected | A dashboard badge is not proof of dispatch |

The Scientist has final scientific authority on definitions and interpretation. The Indicator Agent has implementation ownership and the initiative to propose and run bounded improvement work. A negative verified result from the Scientist is a binding stop signal for that candidate: remove it from the candidate path, restore the last accepted version in the research/chart environment, and preserve the failed version and evidence. If a finding is still under data-quality review, quarantine the candidate and investigate before calling it a failure.

## Measurement process

1. **Register the question.** The Chief Scientist freezes the measurement card, baseline version, simple comparator, source rights, outcome labels, cohort, cutoffs, exclusion rules, primary measure, guardrails, minimum useful effect, sample target, and uncertainty method before results are viewed.
2. **Capture the evidence.** The Lab saves source identity and rights, instrument and dated contract where relevant, timeframe, session/calendar, raw input hash, indicator/config hashes, output timestamp, decision cutoff, and any human annotation. Missing values stay missing.
3. **Separate data use.** Development data may guide construction; a locked held-out set tests the candidate; untouched forward sessions assess durability. Choose candidate rules only with development data. Version the protocol if the question, labels, thresholds, or partitions change.
4. **Replay on paired observations.** Run incumbent, candidate, and simple baseline on the same eligible records with the same source and cutoff. Enforce causal bar timing and deterministic replay. Log all emitted signals and non-signals so coverage cannot be hidden.
5. **Score daily.** The Lab publishes counts, denominators, missing/ambiguous cases, primary metric, guardrails, paired difference from incumbent, uncertainty interval, cohort breakdowns, and failed checks. The Chief Scientist releases an end-of-day report with a decision: retain, investigate, advance candidate, quarantine, or revert.
6. **Review over the planned horizon.** Do not call a one-day improvement validated. The Scientist assesses repeated days and regimes against the preregistered sample and decision rule; the independent reviewer reproduces the conclusion.
7. **Release or learn.** The Indicator Agent merges/promotes only after required human and scientific gates. A rejected candidate remains documented, and the next hypothesis starts a new experiment/version. Major reproducible advances go to a Lab whitepaper.

The daily report is a measurement record, not an invitation to retune on that same day's held-out outcome. A proposed change enters the next prospective version and evaluation window.

The EOD report identifies the run and source cutoff, lists all attempted and scorable observations, shows `candidate − incumbent` on the same records (with the sign interpreted according to the metric), states an interval and sample limitations, names any guardrail failure, and links the Lab's reproducible ledger. When no authorized data arrived, it reports **not measured** with the cause; it never synthesizes a score.

## Candidate improvement loop

1. **Trigger:** the Indicator Agent reads the Scientist's report or files an observed defect. It may also propose a new hypothesis from authorized research.
2. **Decision memo:** state the problem, mechanism, affected cohort, one primary change, expected gain, estimated range and assumptions, downside/guardrails, effort, and falsification rule. When evidence is insufficient, state “gain unknown; experiment required” rather than inventing a percentage.
3. **Build spec:** identify exact output behavior, inputs, algorithm, config, performance budget, fixtures, migration, rollback commit, and version name. Request experiment/version registration before scoring.
4. **Build and local tests:** implement in an isolated candidate version; verify deterministic outputs, cutoff handling, missing data, unit/integration behavior, and chart rendering.
5. **Lab experiment:** submit the frozen candidate to the paired replay and prospective paper/shadow study. The Lab, not the agent, scores the result.
6. **Human validation:** show the chart behavior, evidence packet, code diff, and measured result. Record approval, rejection, or requested changes; changed code needs fresh tests and, when scientifically material, a new evaluation.
7. **Disposition:** advance, retain incumbent, investigate, or revert. Close the task only with linked specs, hashes, tests, Lab result, Scientist decision, reviewer result, human disposition, and release/rollback state.

“Expected gain” always names a metric and denominator, for example: “hypothesis: improve matched-event recall by 3 percentage points at no more than 1 percentage point loss of precision, tested on the locked cohort.” The range is a planning estimate until measured. Report the measured paired difference and interval separately. Do not turn a visual tier or catalog badge into a performance claim.

## Required tools and records

| Tool or record | Minimum function |
|---|---|
| Indicator registry | One measurement card and current accepted version per indicator; purpose and scoring state visible in Tool Belt |
| Version/experiment ledger | Append-only hypothesis, frozen protocol, candidate hash, runs, decisions, and rollback link |
| Source manifest and quality gate | Rights, provenance, freshness, cutoff, completeness, contract/calendar, data resolution, retention |
| Deterministic replay harness | Same observations for incumbent/candidate/baseline; no look-ahead; emitted/non-emitted output log |
| Reference/label ledger | Independent labels, annotator/adjudication history, uncertainty and ambiguous cases |
| Scorer and report generator | Primary measure, guardrails, paired deltas, intervals, breakdowns, exclusions, daily EOD output |
| Visual review surface | Side-by-side chart examples, version/diff, source boundary, human validation disposition |
| Release/rollback control | Last accepted version, candidate status, promotion gate, revert procedure, audit trail |
| Whitepaper template | Preregistered question, sources, methods, cohort, results, uncertainty, failure modes, replication assets, reviewer decision |

These are design requirements, not claims that the tools already exist. The first implementation should build the registry and measurement card, then the replay/score path for one indicator with an authorized dataset. Automating daily reports comes after the source, schedule, and report delivery path are verified.

## Scientific decision rules

- **Advance:** the predeclared primary measure improves by at least the minimum useful effect, uncertainty and sample rules pass, guardrails hold, and independent/human review is recorded.
- **Retain:** the candidate does not establish enough gain; keep the accepted version and retain the negative result.
- **Investigate:** results conflict, sample is inadequate, or a subgroup failure matters; do not retune the locked cohort.
- **Quarantine:** provenance, rights, label quality, cutoff, leakage, or reproducibility is unresolved. No measured-gain claim.
- **Revert:** a promoted research/chart candidate shows verified negative impact, a guardrail breach, or a correctness defect. The Scientist issues the evidence-backed stop signal; the Indicator Agent restores the last accepted version, reruns smoke/regression checks, and records the incident. Firstmate handles lifecycle and any required human gate.

The Scientist can revise a baseline only prospectively, with a new versioned protocol and a reason. Historic reports continue to reference the baseline under which they were run.

## Whitepaper threshold

The Lab drafts a whitepaper only for a material, reproducible advance after the preregistered evaluation and independent review. It includes the purpose, baseline, exact change, data permissions and provenance, cutoff, exclusions, effect size with interval, subgroup and guardrail results, negative findings, replication instructions, and limits. A whitepaper is a research release; it makes no claim of live trading performance or account control.

## First pilot and open scientific choice

The current Volume Profile catalog item is a useful **unscored** pilot for registry/version plumbing and deterministic rendering checks. Before a performance experiment, the Chief Scientist must choose its one job and an independent reference outcome. Only then can the Lab select an appropriate primary metric and the Indicator Agent propose a measurable improvement. Until that choice, its displayed 50/50 badge remains a placeholder and `evaluateVolumeProfile()` remains `not-configured`.

## Existing repository anchors

- [`indicators/tool-belt/README.md`](../indicators/tool-belt/README.md): current Tool Belt catalog and proposed measurement scaffold.
- [`indicators/tool-belt/volume-profile.indicator.mjs`](../indicators/tool-belt/volume-profile.indicator.mjs): unconfigured first indicator evaluator.
- [`agents/intellect/chief-scientist.md`](../agents/intellect/chief-scientist.md): current Chief Scientist authority and daily/weekly protocol.
- [`docs/CHIEF-SCIENTIST-WEEKLY-EXPERIMENT.md`](CHIEF-SCIENTIST-WEEKLY-EXPERIMENT.md): frozen cohorts, uncertainty, independent review, and Firstmate gate.
- [`agents/intellect/lab-testing-specialist.md`](../agents/intellect/lab-testing-specialist.md): reproducibility and score QA role.

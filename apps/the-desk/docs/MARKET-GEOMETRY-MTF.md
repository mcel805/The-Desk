# Market Geometry MTF

Market Geometry now shows independently calculated **1H, 30M, 15M, 5M and 1M**
channels and swing paths on one Desk chart. Large context and micro reversals have
separate ledgers and drawing quotas. This is a local research indicator; no
account, order, strategy-agent or paid inference integration is involved.

## Feature review scope

The Geometry feature is reviewed from baseline `fbf7ae8` through the current
pipeline head. Its changed paths are `docs/MARKET-GEOMETRY-MTF.md`,
`source-manifest.json`, `tests/launch_market_geometry_fixture.py`,
`tests/test_market_geometry_mtf.mjs`, `tests/test_market_geometry_worker.mjs`,
`tests/verify_market_geometry_mtf_browser.mjs`, `web/app.js`,
`web/market-geometry-{compute,drawing,model,origin,source,thread,upgrade,worker}.mjs`,
`web/pine-editor.mjs`, `web/pine-examples/agentic-market-geometry-mtf.pine`,
`web/pine-runtime.mjs` and `web/pine-state.mjs`. Other inherited workspace paths
are preserved baseline work, not Geometry feature scope.

## Using it

Choose **Indicators → Agentic - Market Geometry → Add**. Its legend settings offer:

- **Context + Micro**: broad structural channels on 1H/30M/15M and local channels
  on 5M/1M, recent parent paths and focused micro history.
- **Big picture**: the three parent frames.
- **Micro detail**: 15M/5M/1M.
- **Inspect**: both local and structural channel families on each enabled frame.
- **Original chart only**: execute the retained Pine channel engine and its
  original display settings. This is the rollback/reference view.

Blue is 1H, violet 30M, amber 15M, cyan 5M and pearl 1M. Default colors adapt to a
light background; individual custom colors persist. Direction is an arrow and
structure state rather than the hue. Solid paths/filled vertices are locked;
dashed working legs and hollow observed tips can move. A working tail uses only
already observed source highs/lows and does not promote a pivot or forecast a
future point. Optional forward projections are
dotted and disabled initially. Completed channel breaches freeze the last valid
wick-safe endpoint; failed reversal attempts remain in the event ledger.

The source/status table lists independent structure directions, availability and
aggregation. Hover table cells for coverage and cutoff. Hover swing anchors for
anchor, known and lock times. Per-frame toggles affect drawing selection only
while the study is running. Vela suspends a hidden study's entire session; it
rebuilds from source snapshots on showing it again. A hidden chart study is not a
background autonomous agent.

## Calculation contract

`market-geometry-model.mjs` owns the deterministic rules. The local channel port
retains the original two-same-side-pivot, every-wick no-cut and parallel-envelope
math. Four bars per side and an eight-bar interval are the initial local profile.
A separate structural profile uses 8/8 pivots, a 32-source-bar interval, 24 pivots
per side and eight bounded recent/older anchors. Each family retains up to 48
channels per source. Broader eligible span is preferred for structural display;
local channels prioritize active geometry and contacts. These settings are
research defaults, not an optimized or profitable configuration.

Raw swing pivots use 2/2 on 1M/5M and 4/4 on parent frames. A more extreme
same-side pivot can replace only the unfinished endpoint. An opposite confirmed
pivot locks that endpoint. `time`, `knownAt` and `lockedAt` are distinct. Equal
extremes use the original rightmost rule. A bar qualifying as both a high and low
records ambiguity rather than an invented intrabar sequence.

A continuation close beyond a locked opposing extreme establishes the protected
swing that preceded it. A later completed same-frame close at least one verified
tick through the protected swing records a shift. A 1M shift does not establish
a 5M or parent-frame shift.

`market-geometry-compute.mjs` processes source bars in close-time order. At equal
close times the micro bar uses only previously published parent geometry.
Appending bars preserves locked pivots and stage detection times. An observed
correction to a previously consumed candle triggers an explicit revision and
rebuild of the available window. The revision appears in the status table. Feed
corrections outside the fetched overlap cannot be independently detected.

Missing intervals end active channel audits and reset the continuous pivot and
structure segment. Old locked vertices remain historical drawings, but cannot
establish fresh post-gap structure. Parent geometry without an adequately current
source at an event is excluded from new micro candidates. Stale/unavailable source
frames remain explicitly identified; unavailable data is never a zero price or
an automatically neutral bias.

## Micro reversal families

**Boundary rejection:** a completed 1M candle contacts a previously known rail
within two ticks and closes at least one tick back on the rejection side.
A completed close beyond the prior bar's high/low marks a forming turn. The
opposing raw pivot known before contact is frozen as the local shift reference.
A close at least one tick through it records the 1M shift. A later candle must
touch within two ticks and close on the new side to record a held retest.

**Channel escape:** the prior close is inside known channel rails, followed by a
completed close at least one tick outside against the channel's slope. A gap
escape is identified as such, not as a rail touch. The opposing pivot known
before escape is frozen. Clearing it can record a shift on the same close.
A retest of the original sloping rail uses its frozen equation at the new time;
that event stays distinct from a horizontal structure-level retest.

Each candidate freezes the contact/escape candle's adverse extreme. A subsequent
completed wick one tick beyond it fails the candidate. Expiry is initially 20
completed 1M bars. Missing minutes terminate a pending attempt as unavailable.
An ended channel is a projected reference only, with a bounded post-break watch;
contact labels disclose whether their rail is projected or audited, its source
frame and the audited cutoff.
The indicator never widens or moves old rails to preserve a story. One attempted
side/family per channel is retained rather than recycling a failed drawing as an
unreported new attempt.

Live chart ticks can update the displayed provisional micro tip. Completed event
state is untouched by these previews. The table exposes independent parent states;
parent progress metadata records each frame's own shift after candidate creation.
Optional stage notifications start only after initial history is loaded, do not
re-emit on refresh and remain suppressed during replay and editor test runs.
No combined confidence score or automatic position authorization is produced.

## Source lifecycle

`market-geometry-source.mjs` requests exact provider/instrument standard candles
through Vela's secondary-series gateway. Source depth starts at 600 bars and is
bounded to 100–1200. It does not substitute the viewing chart's shorter history.
The source-status table reports actual depth; a shallow provider response does
not imply that the full requested history was available.

Coinbase Exchange has native 1M/5M/15M/1H data. The coordinator fetches deeper 15M
components for 30M and only publishes two-component, UTC-aligned, completed 30M
buckets. Native 30M is never inferred from a single half-hour component. That
source is labeled `15M → 30M`; missing components remain partial/unavailable.
Provider pagination/rate limits are handled by the existing data adapter. An
adapter with a shallower limit yields explicitly shorter coverage.

The dedicated module worker owns all numeric states; the main-thread adapter
owns asynchronous data, source identity, generation cancellation and drawing.
Periodic refresh keeps 1M evaluation advancing on a 1H view. Original-mode Pine
runs through the existing compatibility worker. Edited catalog sources execute
their own chart-timeframe Pine rather than having their logic replaced by the
host; catalog origin is carried as bounded study metadata through add, edit,
compile, replacement and persisted restore, so changing the Pine title or
marker does not change ownership. The Desk marks an identified catalog edit as
custom/chart-only, warns that dedicated MTF controls are inactive, and does not
advertise those controls. Unidentified pasted Pine remains generic. Missing
exact-symbol tick metadata blocks MTF decisions. Explicit live sessions use the
current clock; replay and unknown contexts remain bounded by their supplied
cutoff or viewing-chart history.

The Desk supplies the chart-specific replay cutoff; forming replay candles use
their opening timestamp so no unseen intrabar prices enter source confirmations.
Completed replay candles use their close. Source snapshots and events are clipped
to that cutoff. Re-entering/reversing replay rebuilds state; realtime notifications
are suppressed. Removing a study releases its timers, worker, pending results and
records. Other chart studies remain independent.

## Migration and portability

Only the normalized SHA-256 of the exact shipped chart-only Geometry source is
upgraded automatically. Edited sources, IDs, visibility, inputs and other studies
are preserved. The previous source/inputs are retained in the workspace extension
and subsequent study saves; Original mode offers immediate rollback of behavior.
The catalog also loads the new version for newly added studies.

The new `.pine` catalog source declares settings and retains the old executable
channel engine. **The MTF implementation is Desk-hosted JavaScript**, not a native
TradingView port. Exporting the Pine file to another platform runs chart-local
geometry; native multi-frame TradingView parity is not claimed.

## Verification

From `apps/the-desk`:

```sh
node --test tests/test_market_geometry_mtf.mjs tests/test_market_geometry_worker.mjs \
  tests/test_agentic_market_geometry.mjs tests/test_abc_live_drawing.mjs \
  tests/test_pine.mjs tests/test_pine_editor.mjs tests/test_pine_history.mjs \
  tests/test_pine_refresh.mjs
python3 -B tests/launch_market_geometry_fixture.py
# In another terminal, with the synthetic fixture running on its fixed port:
node tests/verify_market_geometry_mtf_browser.mjs /tmp/geometry-mtf-browser
```

The fixture is isolated on `127.0.0.1:18911`, labels its invented data and has no
account/order APIs. Browser acceptance exercises real Vela rendering, module
worker execution, five-frame/view invariance, custom inputs, persistence, settings,
light contrast, outage recovery, Original/MTF switching, replay and removal.

Synthetic tests verify implementation and causal timing. Prediction accuracy,
held-out market results, direct native TradingView parity and live-trade behavior
remain separate, unverified claims. Future ATR/slope-filter challengers are not
silently enabled in this release.

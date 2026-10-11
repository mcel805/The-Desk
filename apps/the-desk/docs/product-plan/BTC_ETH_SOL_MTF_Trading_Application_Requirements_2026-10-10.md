# Trading application requirements register

Draft v1 · October 10, 2026 · **231 proposed requirements** · all acceptance cases unrun.

Approved scope priority: Supercharts and trading workspace first; full platform backlog retained. Read the [implementation plan](BTC_ETH_SOL_MTF_Trading_Application_Plan_2026-10-10.md) and [reuse audit](BTC_ETH_SOL_MTF_Trading_Application_Reuse_Audit_2026-10-10.md) for architecture, evidence and limitations. The [JSON backlog](BTC_ETH_SOL_MTF_Trading_Application_Backlog_2026-10-10.json) contains the same IDs and acceptance text.

This is an implementation specification, not a declaration that all current TradingView items have been exhaustively enumerated or that Vela already supports every item. Phase 0 must create the edition-specific control/tool/study catalog and link it to these requirements. Each family-level item needs individual child tasks wherever the reference has multiple independently testable tools or studies. All items remain required; phases are sequencing, not deletion of scope. A product extension or intentional deviation must be labeled separately.

“Reuse” means extract and validate behind the named module boundary. Existing components have source evidence, not new-app acceptance proof. Listed acceptance criteria are mandatory outcomes; state, failure, persistence and ownership tests in the main plan also apply to every relevant item. Proposed requirements use imperative wording with SHALL intent.

| Phase | Requirements | Delivery |
|---|---:|---|
| 0 | 10 | Baseline and foundations |
| 1 | 88 | Chart workspace |
| 2 | 52 | Trading workspace |
| 3 | 38 | Advanced charts/trading and private read-only accounts |
| 4 | 11 | Scripts, strategies and core parity |
| 5 | 32 | Full platform and gated live-route expansion |

## Register

### COV — Reference baseline and parity governance
Owner: Product and QA. Default implementation: New catalog and comparison fixtures. Dependencies: none.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| COV-001 | **Frozen reference.** Record TradingView product, edition, platform, locale, plan limits, capture date and enabled experiments. | A reproducible reference manifest names these fields and distinguishes web from Desktop. | 0 · New catalog and comparison fixtures |
| COV-002 | **Complete workspace inventory.** Catalog every visible control, menu item, setting, shortcut, chart type, drawing and built-in study in the reference workspace. | Every captured item maps to at least one requirement; missing catalog entries fail coverage. | 0 · New catalog and comparison fixtures |
| COV-003 | **Full platform inventory.** Inventory every requested product family outside charts, including plan-specific and account-specific capabilities. | Each module has child tasks and dependencies; deferred items remain required backlog entries. | 0 · New catalog and comparison fixtures |
| COV-004 | **Interaction capture.** Capture representative empty, populated, editing, submitting, selected, loading, disconnected and error states. | Comparison fixtures include state transitions and inputs, not screenshots alone. | 0 · New catalog and comparison fixtures |
| COV-005 | **Version pinning.** Pin Vela, provider adapters, plugins, engines and build inputs with source/build provenance. | A clean reproducible build and dependency manifest match recorded hashes and versions. | 0 · New catalog and comparison fixtures |
| COV-006 | **Workspace extension spike.** Prove account panel, chart trade overlay, shared draft, persistence and provider extension seams on pinned VelaWorkspace. | A disposable spike demonstrates all seams or records an approved headless-shell fallback. | 0 · New catalog and comparison fixtures |
| COV-007 | **Pine compatibility spike.** Measure runtime coverage, worker integration, strategy semantics and deployment/license obligations. | Representative scripts have numerical and order comparisons; unsupported cases have named gaps. | 0 · New catalog and comparison fixtures |
| COV-008 | **Parity report.** Track implemented, partial, blocked, missing and verified states per reference item with evidence. | Only verified items count as passed; the report reports separate core and whole-platform coverage. | 0 · New catalog and comparison fixtures |
| COV-009 | **Scope changes.** Version the baseline and backlog when reference changes or product deviations are adopted. | No requirement disappears without recorded disposition; extensions are distinguished from strict parity. | 0 · New catalog and comparison fixtures |
| COV-010 | **Data and content dependencies.** Maintain a registry of data, indicator, news, script and icon assets with intended use and source rights. | Each distributable dependency has a recorded license/entitlement decision and release impact. | 0 · New catalog and comparison fixtures |

### UI — TradingView-style application shell
Owner: Frontend and design. Default implementation: Vela workspace plus application chrome. Dependencies: COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| UI-001 | **Chart-first layout.** Use the top toolbar, left drawing rail, chart canvas, right utility rail and bottom trading/research panel. | Reference placement and click paths are compared at desktop test sizes; optional research panels start collapsed. | 1 · Vela workspace plus application chrome |
| UI-002 | **Visual tokens.** Define dark/light backgrounds, borders, typography, spacing, icon sizes and semantic colors from the captured reference. | Approved visual comparisons cover dark/light and every interactive state; our branding and assets are used. | 1 · Vela workspace plus application chrome |
| UI-003 | **Toolbar controls.** Provide symbol, compare, interval, style, indicators, templates, alert, replay, layout, save, settings, capture and Trade actions. | Each control opens its intended functional surface and works on the active chart. | 1 · Vela workspace plus application chrome |
| UI-004 | **Chart trader docking.** Provide docked and floating chart-trader views with persistent width, location and visibility. | Move, resize, collapse and restore retain state without obstructing order controls. | 1 · Vela workspace plus application chrome |
| UI-005 | **Bottom panels.** Provide trading/account manager, journal access, script editor and Strategy Tester with resizable panel height. | Panel switching preserves state; refresh restores size and selected tab. | 1 · Vela workspace plus application chrome |
| UI-006 | **Right utility panels.** Provide watchlists/details, alerts, object tree, data window and supported news/calendar panels. | Opening panels retains chart context and gives a functional empty or unavailable state. | 1 · Vela workspace plus application chrome |
| UI-007 | **Keyboard navigation.** Match reference shortcuts where applicable and support command search and discoverable help. | Keyboard-only users can search markets, add tools, edit settings and place a paper order. | 1 · Vela workspace plus application chrome |
| UI-008 | **Context menus.** Provide chart, price-scale, time-scale, drawing, indicator, order and position menus. | Menus preserve click coordinates and context; Escape closes and restores focus. | 1 · Vela workspace plus application chrome |
| UI-009 | **Window controls.** Provide fullscreen, screenshot, tab/workspace navigation and consistent modal stacking. | Controls work with resized windows and do not lose unsaved drafts. | 1 · Vela workspace plus application chrome |
| UI-010 | **Responsive workspace.** Adapt chart, toolbars, ticket and account tables to narrow screens and touch input. | At 390×844 all primary controls remain reachable without hover or hidden submission actions. | 1 · Vela workspace plus application chrome |
| UI-011 | **Notifications.** Provide placement, fill, cancellation, rejection, account and connection notifications with configurable sounds. | Preferences persist; events match server state and an outcome is never fabricated locally. | 1 · Vela workspace plus application chrome |
| UI-012 | **Accessible states.** Expose focus, selection, disabled reasons, busy states and validation near the responsible control. | Screen-reader and keyboard checks distinguish context, errors and completed actions. | 1 · Vela workspace plus application chrome |

### MKT — Coinbase, Hyperliquid and market data
Owner: Market data backend. Default implementation: Reuse Vela provider adapters; add canonical gateway. Dependencies: COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| MKT-001 | **Coinbase preservation.** Keep Coinbase Exchange spot symbols, candle history and stream/fallback available independently of new private accounts. | BTC-USD, ETH-USD and supported SOL product journeys pass with original venue provenance. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-002 | **Hyperliquid preservation.** Keep Hyperliquid perpetual and supported spot candles and stream/fallback with native market mapping. | BTC/ETH/SOL supported perpetuals and one supported spot market resolve correctly. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-003 | **Instrument identity.** Store provider, venue, native product/coin ID, market type, currencies and stable instrument ID. | Identical asset names from separate venues cannot share bars, positions or order routes. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-004 | **Tradable metadata.** Resolve tick size, quantity step/minimum, min notional, multiplier, session and connector tradability. | Orders validate server-side against metadata; missing fields disable affected execution paths. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-005 | **Qualified symbol search.** Search description, ticker, venue and market type with favorites and recent symbols. | Selecting a result retains provider-qualified identity after refresh and on multiple charts. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-006 | **UTC and interval semantics.** Normalize candle open/close times, session boundaries and interval aliases consistently. | Native and aggregated bars match fixture buckets across DST, weekly and monthly boundaries. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-007 | **History completeness.** Paginate within provider limits and show requested/returned ranges, gaps and the earliest available bar. | Hyperliquid 5,000-candle bound and Coinbase pagination are visible; All never implies nonexistent history. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-008 | **Forming bar state.** Keep provisional candles distinguishable from completed bars for indicators, replay and matching. | A forming update cannot enter a completed-only decision or replay history before its close. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-009 | **Streaming lifecycle.** Support subscribe/unsubscribe, heartbeat, bounded retries and explicit poll fallback. | Repeated switches leave no orphan subscriptions; fallback shows its transport and freshness. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-010 | **Gap recovery.** Detect missing/out-of-order events and rebuild from authoritative snapshots before resuming dependent execution. | Dropped/duplicate stream fixtures recover without duplicate bars or false fills. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-011 | **Correction handling.** Version corrected bars and trigger controlled chart/indicator recomputation. | A correction cannot silently revise recorded fills or a previously frozen research result. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-012 | **Shared subscriptions.** Share feed subscriptions and cached history across chart cells with the same instrument/interval. | Eight-chart layouts avoid redundant subscriptions and retain independent views. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-013 | **Freshness display.** Show source time, received time, age, transport and live/delayed/stale/snapshot/unavailable status. | Disconnect and delayed-feed tests produce correct visible states and server execution policy. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-014 | **Quotes, trades and L2.** Expose bid/ask, last trade, executions, book levels and candles as separate feed capabilities. | No candle-only source is advertised as a complete order book or footprint stream. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-015 | **Provider isolation.** Cancel old requests and prevent late responses from painting after a market change. | Rapid Coinbase-to-Hyperliquid switches never mix bars, overlays, precision or stale account drafts. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-016 | **Rate limits and retention.** Apply bounded requests/backoff, storage policy and provider-specific history/entitlement limits. | Rate-limit and unavailable-history responses are actionable and do not cause unbounded retries. | 1 · Reuse Vela provider adapters; add canonical gateway |
| MKT-017 | **Multi-asset expansion.** Add qualified equity, futures, forex, options and index feeds through the same contract as dependencies permit. | Each asset family passes session, metadata, coverage and entitlement tests before enabled. | 5 · New licensed providers |

### CHT — Chart behavior and settings
Owner: Chart frontend. Default implementation: Vela chart adapter; plugins for missing types. Dependencies: UI, MKT.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| CHT-001 | **Core chart types.** Support candles, hollow candles, bars, line, line with markers, step line, area, HLC area, baseline, high-low and columns where reference requires. | Each type has a golden rendering/data-transform fixture and retained per-type settings. | 1 · Vela chart adapter; plugins for missing types |
| CHT-002 | **Heikin Ashi.** Render transformed candles while keeping the underlying tradable price explicit. | OHLC transforms match fixtures; execution never uses synthetic candle prices. | 1 · Vela chart adapter; plugins for missing types |
| CHT-003 | **Advanced chart types.** Cover Renko, Kagi, line break, point-and-figure, range, tick, volume candles, footprint and other frozen-catalog types. | Every type has source-resolution requirements and a reference comparison; unsupported feeds show a named gap. | 3 · Vela chart adapter; plugins for missing types |
| CHT-004 | **Pan and zoom.** Support wheel, drag, touch, rectangle zoom, reset, auto-fit and jump to latest. | Reference gestures preserve chart anchors and behave correctly around loading and new bars. | 1 · Vela chart adapter; plugins for missing types |
| CHT-005 | **Price scales.** Support linear, log, percentage, indexed-to-100, auto/manual, inverted and left/right scales. | Scale transforms and anchor placement pass comparisons including non-positive-price handling. | 1 · Vela chart adapter; plugins for missing types |
| CHT-006 | **Time navigation.** Provide date ranges, go-to date, custom ranges, bar spacing and future margins. | Navigation retrieves available data and exposes coverage limits instead of fabricating bars. | 1 · Vela chart adapter; plugins for missing types |
| CHT-007 | **Timezone and sessions.** Support selected display zone, exchange zone and instrument sessions with DST-aware labels. | Changing display timezone does not change UTC bar identity, fills or alerts. | 1 · Vela chart adapter; plugins for missing types |
| CHT-008 | **Chart comparison.** Add/remove comparison symbols with independent or normalized scales. | Mixed-provider comparisons keep source metadata and never alter the execution instrument. | 1 · Vela chart adapter; plugins for missing types |
| CHT-009 | **Symbol expressions.** Support reference spread/ratio/formula charts as explicitly synthetic instruments. | Formula values match inputs; synthetic expressions are non-tradable unless a separately supported route exists. | 3 · Vela chart adapter; plugins for missing types |
| CHT-010 | **Pane management.** Create, resize, move, collapse, maximize and remove indicator panes and scales. | Pane configurations and indicator ownership survive layout changes and refresh. | 1 · Vela chart adapter; plugins for missing types |
| CHT-011 | **Crosshair and data readout.** Provide crosshair modes, OHLC/volume/status line, tooltips and data window values. | Values align with the hovered timestamp and indicator instance, including gaps. | 1 · Vela chart adapter; plugins for missing types |
| CHT-012 | **Candle settings.** Customize rising/falling bodies, borders and wicks independently with visibility controls. | Preview, Cancel, OK, reset, reload and new-instance restoration preserve the complete confirmed selection set. | 1 · Vela chart adapter; plugins for missing types |
| CHT-013 | **Canvas settings.** Configure background, grids, separators, watermark, text, margins and crosshair styles. | All controls affect the intended layer and persist without changing data or trade state. | 1 · Vela chart adapter; plugins for missing types |
| CHT-014 | **Trading display settings.** Configure buy/sell controls, order/position/bracket lines, execution markers, labels, P&L and notification mode. | Visibility changes never cancel or modify accepted orders. | 1 · Vela chart adapter; plugins for missing types |
| CHT-015 | **Latest price and countdown.** Show current price, bid/ask where available, bar-close countdown and feed state. | Countdown uses interval/session timing; stale prices never appear as fresh quotations. | 1 · Vela chart adapter; plugins for missing types |
| CHT-016 | **Chart capture and export.** Capture the visible chart and export permitted data with source, timeframe and capture timestamp. | Export matches the selected chart/panes and excludes hidden future replay data. | 1 · Vela chart adapter; plugins for missing types |
| CHT-017 | **Chart events.** Render supported economic, corporate and news marks with timestamp and source. | Unavailable mark sources show a missing capability; no fabricated calendar events. | 5 · Vela chart adapter; plugins for missing types |
| CHT-018 | **Chart layout grid.** Provide every frozen-reference layout, resizable splits and cell maximization. | Shrink/expand restores named cells with their market, settings and overlays. | 1 · Vela chart adapter; plugins for missing types |
| CHT-019 | **Multi-chart synchronization.** Link symbol, interval, viewport, crosshair, style and drawings with explicit groups. | Linked edits reach intended cells only; different-provider instruments cannot inherit invalid drawings or trade routes. | 1 · Vela chart adapter; plugins for missing types |
| CHT-020 | **State-safe chart switching.** Preserve compatible studies/drawings while revalidating their market binding on symbol/interval changes. | Source-bound research does not move to a mismatched instrument or cutoff. | 1 · Vela chart adapter; plugins for missing types |

### DRW — Drawing-tool parity
Owner: Chart frontend. Default implementation: Vela drawing tools; add missing registry tools. Dependencies: CHT.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| DRW-001 | **Complete tool registry.** Inventory each reference drawing, subtype and setting individually, with supported versions and extension tasks. | No missing tool is hidden behind a family-level completion status. | 1 · Vela drawing tools; add missing registry tools |
| DRW-002 | **Lines and channels.** Cover trend/ray/horizontal/vertical lines, parallel/regression/disjoint channels, pitchfork variants and reference line tools. | Anchor, extend, move, scale and style operations match fixture geometry. | 1 · Vela drawing tools; add missing registry tools |
| DRW-003 | **Fibonacci and Gann.** Cover reference retracements, extensions, fans, arcs, channels, time tools, Gann tools and user-defined levels. | Coefficients, labels, coordinate systems and reversed anchors pass numerical comparisons. | 3 · Vela drawing tools; add missing registry tools |
| DRW-004 | **Pattern and Elliott drawings.** Cover manual Elliott impulse/correction forms, harmonic and cyclic/pattern tools in the frozen catalog. | Degrees, labels, points and edit sequences match reference behavior without claiming automatic wave validation. | 3 · Vela drawing tools; add missing registry tools |
| DRW-005 | **Forecast and measurement.** Provide long/short position drawings, price/time ranges, bar count, projection and forecast tools. | Measurement values use instrument metadata; drawings are distinct from submitted orders. | 1 · Vela drawing tools; add missing registry tools |
| DRW-006 | **Shapes and annotations.** Provide brush, path, arrow, rectangle, ellipse, curves, text, notes, callouts and supported icons. | Text/style controls, anchors and resizing persist and are keyboard-accessible. | 1 · Vela drawing tools; add missing registry tools |
| DRW-007 | **Magnet and drawing modes.** Support snapping strength, stay-in-drawing mode and tool favorites. | Snap uses intended OHLC points and repeated drawing mode exits predictably. | 1 · Vela drawing tools; add missing registry tools |
| DRW-008 | **Object tree.** Select, rename, group, reorder, hide, lock and delete objects with per-object context menus. | Tree and canvas state agree; deleting a drawing cannot delete an execution order. | 1 · Vela drawing tools; add missing registry tools |
| DRW-009 | **Drawing templates.** Save reusable tool styles and default settings with confirmed persistence. | New instances load the complete saved inputs; Cancel leaves saved defaults intact. | 1 · Vela drawing tools; add missing registry tools |
| DRW-010 | **Undo and redo.** Provide reversible drawing edits and grouping actions with bounded history. | Undo/redo restores exact anchors and styles; accepted trade commands do not enter drawing undo history. | 1 · Vela drawing tools; add missing registry tools |
| DRW-011 | **Cross-layout synchronization.** Persist drawing relationships across layouts and reloads for the same intended instrument scope. | Linked drawings remain linked after refresh; incompatible symbols reject propagation. | 3 · Application sync layer over Vela drawings |
| DRW-012 | **Source and archive integrity.** Keep supplied originals, generated marks, source/cutoff identity and prior versions in the existing Charts layout. | Saving new markups preserves originals and updates viewer/README links without overwriting history. | 1 · Vela drawing tools; add missing registry tools |

### IND — Indicators and native/custom study catalog
Owner: Studies and frontend. Default implementation: Vela native studies plus reusable plugins. Dependencies: CHT, COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| IND-001 | **Indicator picker.** Provide searchable categories, favorites, recent studies, built-ins, custom scripts and entitled catalogs. | Add/remove actions target only the active chart and show each instance/version. | 1 · Vela native studies plus reusable plugins |
| IND-002 | **Built-in inventory.** Map every reference built-in study and preset to a tested native implementation or missing-plugin task. | Per-study coverage is reported; Vela's catalog size alone never establishes TradingView parity. | 1 · Vela native studies plus reusable plugins |
| IND-003 | **Calculation fixtures.** Define warmup, input source, formula, precision and numerical tolerances for each study. | Outputs match approved OHLCV fixtures and explain intentional deviations. | 1 · Vela native studies plus reusable plugins |
| IND-004 | **Study settings.** Support inputs, style, plots, pane/scale assignment, visibility and interval filters. | Dialog confirmation, Cancel, reload and new-instance behavior pass for all supported inputs. | 1 · Vela native studies plus reusable plugins |
| IND-005 | **Indicator templates.** Save/apply complete named sets with settings, ordering, panes and symbol/interval application options. | Applying a template restores every study field and does not duplicate instances accidentally. | 1 · Vela native studies plus reusable plugins |
| IND-006 | **Multiple instances.** Allow multiple instances with independent inputs, visibility, defaults and instance IDs. | Removing or editing one EMA does not change another EMA instance. | 1 · Vela native studies plus reusable plugins |
| IND-007 | **Legend actions.** Provide hide/show, settings, remove, move-pane, scale and source/output readout actions. | Legend and object tree agree on the selected indicator instance. | 1 · Vela native studies plus reusable plugins |
| IND-008 | **Multi-timeframe semantics.** Run studies with explicit completed/forming rules, session boundaries and data scope. | HTF/LTF alignment and repaint tests prevent future completed values appearing early. | 1 · Vela native studies plus reusable plugins |
| IND-009 | **Volume and profile.** Provide volume and reference volume-profile variants with honest source resolution. | Exact versus estimated profiles are identified; volume conservation tests pass. | 3 · Vela native studies plus reusable plugins |
| IND-010 | **Custom research migration.** Retain Wave Court, Smart Fib, Taper’s Volume and other approved existing plugins as optional studies. | Source identity, cutoff, selections and settings persist; manual trading works with every plugin disabled. | 1 · Vela native studies plus reusable plugins |
| IND-011 | **Pine engine adapter.** Attach a worker-based script engine with declared language/version/function coverage. | Unsupported scripts produce actionable errors; heavy scripts do not block chart interaction. | 4 · Vela script-engine port and compatibility work |
| IND-012 | **Script runtime isolation.** Limit execution resources, stop faulty workers and restrict uncontrolled network/secret access. | Timeout, infinite-loop, malformed-output and restart fixtures preserve the chart and accounts. | 4 · Vela native studies plus reusable plugins |
| IND-013 | **Author/community studies.** Provide catalog/import/entitlement paths for licensed or user-owned external studies. | Protected or paid scripts remain unavailable until an authorized source/implementation is integrated. | 5 · New catalog and entitlement services |
| IND-014 | **Settings migration.** Migrate existing chart/volume defaults through versioned mappings without silently dropping fields. | Before/after state comparison and restoration from backup reproduce all confirmed inputs. | 1 · Vela native studies plus reusable plugins |
| IND-015 | **Failure visibility.** Expose missing history, unavailable trades, unsupported functions and stale study outputs. | A failing overlay cannot display a stale result as a successful fresh computation. | 1 · Vela native studies plus reusable plugins |

### STA — Layouts, templates and durable user state
Owner: Frontend and backend. Default implementation: Vela state adapter plus new persistence service. Dependencies: UI, CHT.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| STA-001 | **Named workspaces.** Create, rename, duplicate, save, load and delete multiple workspaces. | Each workspace restores chart cells, panes, panels, studies, drawings and theme independently. | 1 · Vela state adapter plus new persistence service |
| STA-002 | **Autosave and revisioning.** Save changes with visible status, revisions and conflict handling. | Multi-tab writes cannot silently overwrite newer saved state. | 1 · Vela state adapter plus new persistence service |
| STA-003 | **Layout restoration.** Retain dormant chart-cell state after shrinking a grid or maximizing one chart. | Four-to-two-to-four restores the same identities and settings. | 1 · Vela state adapter plus new persistence service |
| STA-004 | **Server persistence.** Store user state durably with a local cache and explicit offline/queued-save status. | Browser restart and a new browser profile recover server-saved workspaces. | 1 · Vela state adapter plus new persistence service |
| STA-005 | **Schema migrations.** Version persisted state and migrate old Count Desk keys without destroying source data. | Unknown fields and invalid schemas produce recoverable errors; migration is repeatable. | 1 · Vela state adapter plus new persistence service |
| STA-006 | **Import and export.** Export/import complete permitted workspace, drawing and study state with a schema manifest. | Round-trip preserves object IDs and settings; no credential appears in an export. | 1 · Vela state adapter plus new persistence service |
| STA-007 | **Watchlist persistence.** Store named watchlists, sections, flags, sorting and provider-qualified instruments. | Reload and another session recover lists and selections without market ambiguity. | 1 · Vela state adapter plus new persistence service |
| STA-008 | **Favorites and defaults.** Persist intervals, tools, indicator favorites, order presets and confirmed chart defaults. | New chart/ticket instances load the complete saved choices. | 1 · Vela state adapter plus new persistence service |
| STA-009 | **Sharing.** Provide revocable workspace/chart links with declared ownership and allowed visibility. | Private accounts, fills, credentials and restricted market data are excluded unless explicitly shared. | 5 · Vela state adapter plus new persistence service |

### ACC — Account selection and account manager
Owner: Account backend and frontend. Default implementation: Extract account UX; new canonical account service. Dependencies: MKT, COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| ACC-001 | **Durable account identity.** Bind every execution order, fill and position to a durable account ID, owner and route. | Browser labels cannot create order authority; server account checks are mandatory. | 2 · Extract account UX; new canonical account service |
| ACC-002 | **Account modes.** Represent paper, replay, broker-readonly and live separately from manual/agentic operator mode. | Every trade surface shows correct mode and route; disconnected live context cannot submit. | 2 · Extract account UX; new canonical account service |
| ACC-003 | **Established account groups.** Preserve Live - Manual, Simulation - Manual, Simulation - Agentic and Live - Agentic groups where applicable. | Migration maps legacy entries to context-only until backed by durable account/connector state. | 2 · Extract account UX; new canonical account service |
| ACC-004 | **Selection consistency.** Synchronize selected account across header, chart trader, ticket, DOM and account manager. | All views agree; switching accounts clears/revalidates incompatible drafts without moving working orders. | 2 · Extract account UX; new canonical account service |
| ACC-005 | **Multiple paper accounts.** Create named paper accounts with capital, currency, commission, leverage and matching-model settings. | Independent accounts can hold opposite positions without shared cash or order state. | 2 · Extract account UX; new canonical account service |
| ACC-006 | **Account management.** Rename, archive and reset paper accounts through deliberate management workflows. | Reset produces an auditable generation boundary; prior journal records remain attributable and unavailable live resets are disabled. | 2 · Extract account UX; new canonical account service |
| ACC-007 | **Currency handling.** Keep balances and P&L in account currency with explicit conversion source/time where needed. | Mixed quote/base/account-currency calculations reconcile and missing FX rates disable conversions. | 2 · Extract account UX; new canonical account service |
| ACC-008 | **Account summaries.** Display cash/balance, equity, unrealized/realized P&L, margin, buying power and costs. | Values reconcile to the authoritative ledger after fills, exits and restart. | 2 · Extract account UX; new canonical account service |
| ACC-009 | **Account manager tabs.** Provide open positions, working orders, fills/trades, order history and balance/account history. | Sorting/filtering/details and selection are account-scoped and agree with chart overlays. | 2 · Extract account UX; new canonical account service |
| ACC-010 | **Private-account connect UX.** Provide connection, reconnection, permissions, product coverage and disconnect flows separately from market feeds. | Authenticated account identity is verified; public market success cannot light a private connection indicator. | 3 · Extract account UX; new canonical account service |
| ACC-011 | **Team attribution.** Support team/member access and manual/agent attribution without replacing the account as ledger owner. | Unauthorized accounts cannot be listed or modified by guessed identifiers. | 5 · Extract account UX; new canonical account service |
| ACC-012 | **Agent policy boundary.** Store agent identity, allowed accounts/instruments, cadence and bounded paper policy independently of chart settings. | Manual trading does not require an agent; an agent cannot bypass account capabilities or its policy. | 2 · Extract account UX; new canonical account service |

### ORD — Unified ticket, chart trader and order management
Owner: Trading frontend and order backend. Default implementation: Reuse chart-trading concepts; shared command/draft service. Dependencies: ACC, CHT, MKT.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| ORD-001 | **Shared order draft.** Use one canonical projected-order model shared by ticket, chart trader, chart menus and DOM. | Editing any surface updates every other surface; only one active draft per account/instrument context. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-002 | **Market orders.** Support paper buy/sell market orders with quantity and displayed executable quote/model. | An accepted command produces a server event and modeled fill; completed-close mode is explicitly identified. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-003 | **Limit orders.** Support limit entry and amendment with proper tick/quantity validation. | Unreached orders remain working; later events never violate the limit price. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-004 | **Stop-market orders.** Support stop trigger and subsequent market execution with clear trigger/fill distinction. | Trigger, gap and slippage fixtures pass; a stop is not falsely treated as a guaranteed price. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-005 | **Stop-limit orders.** Support independent stop trigger and limit price with sequential lifecycle. | Orders cannot fill as limits before triggering and can remain unfilled after a gap. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-006 | **Sizing calculator.** Support units, notional currency, balance percentage and stop-based cash/percentage risk. | Round-trip conversions use tick, quantity, multiplier and currency metadata and respect minimums. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-007 | **Entry offsets.** Support price and bid/ask tick offsets in ticket and presets. | Offsets use the correct quote side and instrument tick; stale quotes produce a clear error. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-008 | **Bracket calculator.** Support SL/TP by price, ticks, percent and cash/risk-return equivalents. | Conversions agree across ticket, chart and summary and remain correct after quantity edits. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-009 | **Multiple exit levels.** Support multiple paired protective/target levels with assigned quantities and remaining exposure. | Partial entry/exit resizes siblings atomically; total exit quantity never exceeds eligible exposure. | 3 · Reuse chart-trading concepts; shared command/draft service |
| ORD-010 | **Order presets.** Save/load named quantity, type, offset, bracket and time-in-force presets per applicable instrument/account scope. | Presets restore all fields and revalidate unsupported connector capabilities. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-011 | **Time in force.** Support reference time-in-force choices and expiry scheduling where account/venue supports them. | Expiry/cancellation fixtures pass; unsupported choices have visible capability reasons. | 3 · Reuse chart-trading concepts; shared command/draft service |
| ORD-012 | **Chart entry points.** Provide buy/sell buttons, right-click trade actions and price-scale plus actions. | Draft starts at intended cursor price with explicit account/instrument and synchronized ticket. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-013 | **Chart order overlays.** Render projected/working orders, stops, targets, positions and executions with labels and scale markers. | Overlay values come from draft/server state; visibility or drawing deletion cannot cancel an order. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-014 | **Confirm and discard.** Support reference-style confirmation/discard and explicitly configured instant paper editing. | Discard restores server-accepted values; pending edits are distinct from accepted changes. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-015 | **Drag amendments.** Support tick-snapped entry, trigger and bracket dragging with revision checks. | Race with a fill, server rejection or changed revision recovers correctly and never leaves false accepted geometry. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-016 | **Position management.** Close, partially close, reverse and flatten positions through shared account commands. | Net quantities, realized P&L and residual brackets reconcile after each action. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-017 | **Cancel scopes.** Cancel single, symbol/type group or account-wide orders with clear affected scope. | Account isolation and cancel/fill race tests pass; uncertain outcomes are reconciled. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-018 | **Order lifecycle.** Expose draft, submitted, accepted, working, triggered, partial, filled, cancelling, cancelled, expired, rejected and unknown outcomes. | Every transition is valid and visible across chart, tables and event history. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-019 | **Idempotent commands.** Require stable command keys and expected revisions for submit/amend/cancel/close. | Duplicate network retries cannot duplicate orders/fills and stale amendments return a recoverable conflict. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-020 | **Authoritative acknowledgement.** Distinguish locally staged, server-accepted and fill-confirmed states. | Submission timeout is queried by command ID; frontend never invents a fill. | 2 · Reuse chart-trading concepts; shared command/draft service |
| ORD-021 | **Manual policy independence.** Use explicit per-account manual rules rather than implicit Crypto Day Desk session or agent constraints. | A configured manual paper account can trade without clock-in or Jev; adopted limits still enforce server-side. | 2 · Reuse chart-trading concepts; shared command/draft service |

### SIM — Paper matching, accounting and recovery
Owner: Simulation and ledger backend. Default implementation: Extract existing Python rules; extend and reconcile. Dependencies: ORD, ACC, MKT.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| SIM-001 | **Execution model selection.** Version quote/trade, completed-OHLC and replay fill assumptions per account/run. | Historical results retain original model and cannot silently change after an upgrade. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-002 | **Deterministic event clock.** Match orders only on eligible events after submission according to recorded event/server times. | No-lookahead tests reject fills before placement or from future bars. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-003 | **Bid/ask market fills.** Match quote-based buys against ask and sells against bid with configured liquidity/slippage model. | Wide-spread and stale-quote tests produce correct prices or unavailable status. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-004 | **Limit improvement and gaps.** Define eligible touch, price improvement, crossed markets and gapped limit behavior. | Both side fixtures honor limit constraints without favorable invented fills. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-005 | **Stop sequencing.** Trigger stop-market/stop-limit consistently before matching their resulting orders. | Same-event and gap fixtures prove sequence and retained trigger state after restart. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-006 | **OHLC ambiguity.** Record bars with ambiguous stop/target or entry/exit ordering and apply a declared conservative policy. | Ambiguous outcomes are visible; switching policy creates a different run rather than revising prior results. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-007 | **Partial fills.** Model partial quantities, fill IDs, remaining quantity and average entry with explicit liquidity assumptions. | Multiple fills reconcile quantity/cash once; absent L2/queue evidence is identified as modeling. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-008 | **Bracket/OCO lifecycle.** Activate children for filled exposure and resize/cancel atomically as fills/exits occur. | Double-trigger and partial-exit races never overclose or accidentally open a reverse position. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-009 | **Position accounting.** Define netting/lot accounting and track scale-in/out, realized/unrealized P&L and average price. | Long, short, partial and reversal fixtures reconcile to decimal-based ledger values. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-010 | **Commissions and slippage.** Apply configurable per-order, per-unit, fixed or basis-point fees and declared spread/slippage assumptions. | Gross/net P&L and cost breakdown reconcile; observed and modeled costs stay distinguishable. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-011 | **Funding and borrow.** Apply supported perpetual funding and borrowing costs with source/time and explicit unavailable status. | Funding events are idempotent and correct across holding intervals and currency conversions. | 3 · Extract existing Python rules; extend and reconcile |
| SIM-012 | **Margin and buying power.** Reserve/release resources and enforce account leverage, maintenance and liquidation policy. | Insufficient funds, open-order reservations and liquidation fixtures reconcile without negative phantom exposure. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-013 | **Spot constraints.** Enforce spot inventory and short eligibility according to account policy. | Unsupported spot shorts are rejected; educational simulated borrowing is explicitly enabled and labeled. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-014 | **Account isolation.** Keep all matching, ledger, fill and cost records scoped to the correct account/instrument. | Two accounts with identical order sizes cannot read or mutate each other's resources. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-015 | **Durable execution worker.** Continue matching and scheduled expiry without browser tabs or chat windows. | Close browser, create eligible feed events, reopen and recover the same accepted outcomes. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-016 | **Crash and sleep recovery.** Resume from durable cursors, reconcile outstanding orders and report missing market intervals. | Crash-before/after-commit fixtures prevent duplicate fills; slept-through gaps are disclosed. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-017 | **Atomic ledger and outbox.** Commit fills, position/cash changes and journal events in one transaction. | Injected failures cannot create a fill without accounting or lose its journal event. | 2 · Extract existing Python rules; extend and reconcile |
| SIM-018 | **Financial invariants.** Enforce quantity conservation, fee totals, equity identity, reserved funds and replay/demo separation. | Property/scenario tests and account snapshots reconcile after restart and migration. | 2 · Extract existing Python rules; extend and reconcile |

### DOM — Depth of market and order flow
Owner: Market backend and trading frontend. Default implementation: New L2 integration; reuse executed-trade overlays. Dependencies: MKT, ORD, SIM.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| DOM-001 | **Actual order book.** Render provider L2 snapshots/deltas with event age, quantity unit and depth limits. | Book reconstruction tests pass; candle-derived estimates never appear as live book depth. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-002 | **Book recovery.** Handle sequence loss, stale/crossed books, aggregation and resnapshot before actionable display. | Feed gap disables dependent quote actions and resumes only after validated reconstruction. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-003 | **DOM trading controls.** Provide limit/stop ladder clicks, market actions, quantity, centering, flatten/reverse and scoped cancellation. | Each action uses the shared draft/command path with intended side and tick level. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-004 | **Working order ladder marks.** Show account-scoped working orders and positions at their correct levels. | Chart, ladder and account tables agree after amend, partial fill and cancellation. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-005 | **Time and sales.** Render actual executions with venue IDs, time, price, units and correct side semantics. | Deduplication and Coinbase maker/aggressor mapping fixtures pass. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-006 | **Footprint and bubbles.** Retain exact executed-volume overlays only when coverage/reconciliation requirements pass. | Unavailable or partial evidence is reported; no exact per-price data is invented from candles. | 3 · New L2 integration; reuse executed-trade overlays |
| DOM-007 | **Profile and delta semantics.** Distinguish executed volume, bid/ask book liquidity, inferred volume allocation and derived imbalance. | Units/sources/calculation type appear in settings and study details; conservation tests pass. | 3 · New L2 integration; reuse executed-trade overlays |

### ALT — Alerts and notifications
Owner: Alert backend and frontend. Default implementation: New durable evaluator and delivery service. Dependencies: MKT, IND, STA.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| ALT-001 | **Alert conditions.** Support price, cross, drawing, study/script and order-event rules with named inputs and instrument scope. | Each condition has deterministic trigger fixtures and an explicit supported capability. | 3 · New durable evaluator and delivery service |
| ALT-002 | **Alert timing.** Support once, repeated, per-bar and bar-close policies, expiry and forming/completed semantics. | A condition cannot repeatedly fire the same event after retry or restart. | 3 · New durable evaluator and delivery service |
| ALT-003 | **Server-owned evaluation.** Evaluate enabled alerts with versioned rule/script settings outside the browser. | Closing every chart tab does not stop alerts; feed downtime is visible in alert status. | 3 · New durable evaluator and delivery service |
| ALT-004 | **Alert lifecycle.** Create, edit, pause, resume, delete and clone rules with active state and last evaluation time. | Edits produce a version boundary; old and new triggers retain attributable configuration. | 3 · New durable evaluator and delivery service |
| ALT-005 | **Delivery channels.** Provide in-app, desktop/browser, email and webhook channels where configured. | Delivery retries and failures are visible; enabling a channel requires its real configuration. | 3 · New durable evaluator and delivery service |
| ALT-006 | **Durable alert history.** Store trigger ID, rule version, source/cutoff, evaluation time, delivery attempts and outcome. | Reconnect restores history with no duplicate successful delivery. | 3 · New durable evaluator and delivery service |
| ALT-007 | **Webhook boundaries.** Provide signed outbound payloads, bounded retries and validated destination handling. | Webhook alerts do not become live orders without a separately authorized route policy. | 3 · New durable evaluator and delivery service |
| ALT-008 | **Alert snapshots.** Freeze inputs/script versions when rule is created or explicitly updated. | Subsequent chart edits cannot silently change the active server rule. | 3 · New durable evaluator and delivery service |

### RPL — Bar replay and historical trading
Owner: Replay backend and chart frontend. Default implementation: Vela replay plus isolated session/account service. Dependencies: CHT, SIM, STA.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| RPL-001 | **Replay transport.** Provide start-time picker, play, pause, step, speed, step interval, stop and return-to-current. | Controls advance recorded events predictably and expose available history bounds. | 3 · Vela replay plus isolated session/account service |
| RPL-002 | **Shared replay clock.** Synchronize multi-chart bars by historical completion time and underlying session rules. | No higher/lower timeframe shows a completed future bar relative to the shared clock. | 3 · Vela replay plus isolated session/account service |
| RPL-003 | **Replay account isolation.** Trade only in a replay-mode account/session with separate capital, costs and ledger. | Replay commands cannot mutate ongoing paper or broker accounts. | 3 · Vela replay plus isolated session/account service |
| RPL-004 | **Historical order parity.** Use ticket, chart trader, DOM where available and all supported historical order types. | Identical fixtures give identical orders/fills across surfaces and replay speeds. | 3 · Vela replay plus isolated session/account service |
| RPL-005 | **Replay evidence.** Record run configuration, data hashes/revisions, cutoff, fill assumptions and script versions. | A run can be reproduced; lacking tick/L2 history remains a labeled limitation. | 3 · Vela replay plus isolated session/account service |
| RPL-006 | **Replay performance report.** Show trade list, equity, drawdown, gross/net P&L and modeled costs for the session. | Reports reconcile to replay ledger and cannot appear in forward paper totals. | 3 · Vela replay plus isolated session/account service |
| RPL-007 | **Replay result retention.** Provide retained/reopenable replay sessions as an explicit extension to reference session behavior. | Product deviation is recorded; old runs preserve provenance and are never called forward performance. | 3 · Vela replay plus isolated session/account service |
| RPL-008 | **Live/replay transition.** Pause live subscriptions or separate them from replay state; clear historical drafts on mode change. | Returning to current data cannot submit a historical order into a current account. | 3 · Vela replay plus isolated session/account service |

### STR — Script editor and Strategy Tester
Owner: Script runtime and research backend. Default implementation: New editor and tester over selected engine. Dependencies: IND, RPL, COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| STR-001 | **Script editor.** Provide syntax highlighting, completions, diagnostics, run/add-to-chart, formatting, save and version history. | Errors identify source location; valid runs replace the intended instance safely. | 4 · New editor and tester over selected engine |
| STR-002 | **Language coverage.** Publish tested Pine version/function coverage including series types, collections, plots, drawings and tables. | Each supported function has semantic fixtures; unsupported constructs fail visibly. | 4 · New editor and tester over selected engine |
| STR-003 | **Multi-timeframe requests.** Match request.security and lower-timeframe data semantics against approved fixtures. | Session, lookahead, gaps and repaint tests cover cross-symbol and mixed-timeframe scripts. | 4 · New editor and tester over selected engine |
| STR-004 | **Strategy emulator.** Support the frozen-reference entry/exit, pyramiding, sizing, fill timing and commission settings. | Order and fill sequences match representative reference runs; failures remain parity gaps. | 4 · New editor and tester over selected engine |
| STR-005 | **Strategy settings.** Expose capital, currency, leverage/margin, fees, slippage, sessions and intrabar assumptions. | A result records all settings and cannot use synthetic prices as actual fills without explicit modeling. | 4 · New editor and tester over selected engine |
| STR-006 | **Tester reports.** Provide overview, equity/drawdown, performance metrics, trade list, properties and export. | Every metric has a documented formula and reconciles to underlying run trades. | 4 · New editor and tester over selected engine |
| STR-007 | **Deep and intrabar testing.** Support deeper datasets and bar-magnifier/intrabar analysis only with adequate source data. | Coverage and source granularity are shown; unavailable intrabar data cannot improve fills silently. | 4 · New editor and tester over selected engine |
| STR-008 | **Saved strategies.** Create, version, compare, rerun and duplicate strategies and parameter configurations. | Previous results retain exact code/data/settings and separate simulation provenance. | 4 · New editor and tester over selected engine |
| STR-009 | **Optimization and validation.** Provide parameter comparisons and out-of-sample/walk-forward tools as declared extensions. | Training/test boundaries and costs are recorded; optimization cannot rewrite held-out results. | 4 · New editor and tester over selected engine |
| STR-010 | **Script publishing dependency.** Support licensed/user-authored imports and later public/private/invite-only publication workflows. | Publishing cannot expose protected source or account secrets; entitlements are checked. | 5 · New editor and tester over selected engine |

### CON — Private exchange accounts and eventual execution
Owner: Connector backend. Default implementation: New private adapters alongside existing public feeds. Dependencies: ACC, ORD, SIM, COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| CON-001 | **Coinbase private adapter.** Bind Advanced Trade account/portfolio identity and authenticated balances/orders/fills to canonical accounts. | Read-only integration tests prove identity, scopes and product coverage without treating Exchange candles as account data. | 3 · New private adapters alongside existing public feeds |
| CON-002 | **Hyperliquid private adapter.** Resolve wallet, subaccount and applicable vault/environment identities separately from public coin metadata. | Read-only balances/orders/fills reconcile to explicit account and mainnet/testnet context. | 3 · New private adapters alongside existing public feeds |
| CON-003 | **Connector capabilities.** Declare order types, time-in-force, brackets, reduce-only, leverage and data support per account/instrument. | Unsupported controls are disabled with reasons; no venue capability is inferred from paper support. | 3 · New private adapters alongside existing public feeds |
| CON-004 | **Credential storage.** Keep API credentials/signing permissions in protected server/native storage with revocation and redacted logs. | No secret enters browser persistence, exported workspace, chart capture or diagnostic output. | 3 · New private adapters alongside existing public feeds |
| CON-005 | **Private-stream reconciliation.** Combine snapshots and ordered account events; handle reconnects, duplicates and external manual activity. | Orders/fills changed outside the app appear once with correct authoritative IDs. | 3 · New private adapters alongside existing public feeds |
| CON-006 | **Native order routing.** Translate supported commands to venue APIs with idempotency/nonce and expected semantics. | Live route remains disabled until explicit release authorization and end-to-end venue validation. | 5 · New private adapters alongside existing public feeds |
| CON-007 | **Bracket implementation disclosure.** Distinguish native exchange brackets from server-managed children and their outage behavior. | Protection status accurately shows venue-accepted versus pending/synthetic children. | 5 · New private adapters alongside existing public feeds |
| CON-008 | **Execution authority.** Use broker/venue records for real fills, fees and balances with reconciliation alerts. | Quote/chart-derived events cannot masquerade as real fill confirmations. | 5 · New private adapters alongside existing public feeds |
| CON-009 | **Live gate and recovery.** Require verified account/permissions, connector command tests, health/reconciliation and explicit live-mode authorization. | Uncertain outcomes reconcile by venue IDs; no silent paper-to-live promotion occurs. | 5 · New private adapters alongside existing public feeds |

### JRN — Journal, history and exports
Owner: Ledger and journal backend. Default implementation: Reuse outbox and existing journal adapter. Dependencies: SIM, ACC.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| JRN-001 | **Canonical event IDs.** Use stable account/order/fill IDs and provenance across terminal and journal. | Retry sends cannot create duplicate trades or confuse separate accounts. | 2 · Reuse outbox and existing journal adapter |
| JRN-002 | **Complete journal lifecycle.** Deliver account, fill, partial exit, reversal, fee/funding and correction events through a versioned contract. | Journal quantities and net P&L reconcile to terminal ledger, including multi-exit positions. | 2 · Reuse outbox and existing journal adapter |
| JRN-003 | **Durable retry status.** Show queued, retrying, delivered, failed and reconciliation-required states independently from execution success. | Journal outage cannot roll back a committed trade or falsely show delivery. | 2 · Reuse outbox and existing journal adapter |
| JRN-004 | **Historical migration.** Migrate legacy accounts/orders/fills through explicit mapping and preserve old simulated assumptions. | Backfill counts, totals and orphan handling reconcile; originals and rollback backup remain available. | 2 · Reuse outbox and existing journal adapter |
| JRN-005 | **History export.** Export account-scoped orders/fills/cash/history with source, IDs, cost model and timezone metadata. | Export recomputes to displayed balances and does not mix paper/replay/imported/broker records. | 2 · Reuse outbox and existing journal adapter |
| JRN-006 | **Account-based journal navigation.** Open the existing journal filtered to the intended durable account where supported. | A selector/context label cannot redirect records to another brokerage account. | 2 · Reuse outbox and existing journal adapter |

### PLT — Full TradingView-platform backlog
Owner: Product and platform teams. Default implementation: New modules plus data/content dependencies. Dependencies: COV, MKT, ACC, STA.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| PLT-001 | **Stock and ETF screeners.** Provide saved filters, sortable columns, technical/fundamental conditions and chart navigation. | Coverage/entitlements are explicit; results are reproducible from dated data. | 5 · New modules plus data/content dependencies |
| PLT-002 | **Bond screener.** Provide issuer, maturity, yield, rating and reference-catalog filtering with licensed metadata. | Yield/date conventions and instrument coverage match approved fixtures. | 5 · New modules plus data/content dependencies |
| PLT-003 | **Crypto and CEX/DEX screeners.** Screen coins and venue/pool pairs with liquidity, price/volume and network identity. | Markets never collapse distinct pairs, networks or venues into one tradable instrument. | 5 · New modules plus data/content dependencies |
| PLT-004 | **Pine/strategy screener.** Evaluate supported custom studies across watchlists/universes with resource limits. | Results preserve script/input/data versions and disclose unsupported symbols/functions. | 5 · New modules plus data/content dependencies |
| PLT-005 | **Heatmaps.** Provide stock/ETF/crypto maps with grouping, sizing, coloring, drill-down and saved settings. | Aggregate values and missing-data states match the underlying dated universe. | 5 · New modules plus data/content dependencies |
| PLT-006 | **News flow.** Provide symbol/category/source filtering, search and article navigation with licensed content. | Sources, timestamps and entitlements are displayed; stale/absent news is visible. | 5 · New modules plus data/content dependencies |
| PLT-007 | **Calendars.** Provide economic, earnings, dividends, splits and IPO calendars with time zones and symbol filtering. | Events retain source and revision history; missing providers do not generate placeholders as facts. | 5 · New modules plus data/content dependencies |
| PLT-008 | **Symbol details.** Provide profile, technical ratings, financial metrics, markets and supported seasonality panels. | Calculation/source/update time is documented for every metric. | 5 · New modules plus data/content dependencies |
| PLT-009 | **Fundamental graphs.** Provide company financial series and cross-company comparisons with reporting-period semantics. | Fiscal/restated/currency values reconcile to licensed source records. | 5 · New modules plus data/content dependencies |
| PLT-010 | **Yield curves and macro maps.** Provide curve tenors, macro series, region comparisons and reference-catalog interactions. | Date, units, conventions and update frequency are explicit and validated. | 5 · New modules plus data/content dependencies |
| PLT-011 | **Options tools.** Provide chains, expiries, strikes, bid/ask, Greeks and supported strategy analysis. | Licensed options data and model assumptions are visible; unsupported execution remains disabled. | 5 · New modules plus data/content dependencies |
| PLT-012 | **Portfolios.** Track holdings, transactions, currencies, dividends, costs and performance across accounts. | Portfolio totals reconcile to source transactions without pretending imported records are live custody. | 5 · New modules plus data/content dependencies |
| PLT-013 | **Ideas and chart publishing.** Publish permitted chart snapshots, text, linked instruments and follow-up updates. | Visibility, source/content rights and account-data exclusions pass tests. | 5 · New modules plus data/content dependencies |
| PLT-014 | **Community and profiles.** Provide user profiles, follows, feeds, comments, messaging and moderation workflows. | Ownership/access, abuse handling and deletion/reporting operate before public launch. | 5 · New modules plus data/content dependencies |
| PLT-015 | **Script marketplace.** Provide author pages, script discovery, versions, reviews and entitlement-aware subscriptions. | Paid/protected source is not copied; access is enforceable per account/user. | 5 · New modules plus data/content dependencies |
| PLT-016 | **Social and collaboration.** Provide private sharing, team workspaces and collaboration with explicit permissions. | A collaborator cannot read private account data through shared chart state. | 5 · New modules plus data/content dependencies |
| PLT-017 | **Desktop app workflows.** Provide installable desktop experience, tabs, independent windows and OS shortcuts/notifications. | Multi-window restore and updates pass tests; web parity and desktop parity are reported separately. | 5 · New modules plus data/content dependencies |
| PLT-018 | **Mobile applications.** Provide supported mobile navigation, charts, alerts, account selection and trading flows. | Touch, background notification and reconnect tests pass on declared device/OS matrix. | 5 · New modules plus data/content dependencies |
| PLT-019 | **Subscriptions and entitlements.** Model product plans, usage limits, feature/data access and billing when the product is commercialized. | Entitlement checks are server-enforced and do not interrupt protection of accepted orders. | 5 · New modules plus data/content dependencies |
| PLT-020 | **Broker expansion.** Add additional broker/account adapters through the execution capability contract. | Each adapter passes identity, order, reconciliation and coverage acceptance independently. | 5 · New modules plus data/content dependencies |
| PLT-021 | **AI assistance and external tools.** Catalog reference AI assistant/MCP capabilities and add supported chart/research actions with evidence and scoped permissions. | Tool actions validate account/instrument context; research suggestions cannot claim autonomous execution authority. | 5 · New modules plus data/content dependencies |
| PLT-022 | **Public operations.** Provide help/onboarding, service status, support, abuse reporting and publication administration. | A public launch includes operational owners and tested recovery/moderation paths. | 5 · New modules plus data/content dependencies |

### NFR — Reliability, security, accessibility and release
Owner: Engineering and QA. Default implementation: New release harness; reuse meaningful behavioral tests. Dependencies: COV.

| ID | Requirement | Acceptance criteria | Phase / implementation |
|---|---|---|---|
| NFR-001 | **Financial precision.** Use decimal/fixed-point accounting and finite renderer projections with boundary validation. | Rounding, tiny units and large notional cases satisfy exact ledger invariants. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-002 | **Access control.** Enforce account/workspace ownership, team roles and route scope on every server command/query. | Cross-user/account identifier tests reject unauthorized reads and mutations. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-003 | **Secret and log hygiene.** Redact credentials, signing material and sensitive account fields from logs and client artifacts. | Automated scans and failure diagnostics contain no secret values. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-004 | **Concurrency.** Handle simultaneous edits, fills, cancellations, reconnects and duplicate delivery transactionally. | Fault-injected race tests end in one reconciled account/order state. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-005 | **Performance budgets.** Measure chart/interaction performance on declared hardware, data size and network conditions. | Proposed p95 control response below 100 ms and first usable chart below 3 s with responsive providers are measured separately from provider latency. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-006 | **Scale and resource limits.** Bound bars, charts, workers, subscriptions and background computations with clear limits. | 10,000 bars/eight charts stay interactive on baseline hardware; larger limits require their own evidence. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-007 | **Accessibility.** Target WCAG 2.2 AA for chrome and provide keyboard workflows, focus and meaningful chart data alternatives. | Manual assistive-tech and keyboard journey checks pass with touch/hover equivalents. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-008 | **Observability.** Expose health, feed lag, worker cursor, pending commands, outbox lag and reconciliations with redacted diagnostics. | Operations can distinguish market, account, simulator and journal outages independently. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-009 | **Backup and restoration.** Version schema migrations, back up before migration and support documented restore/rollback. | Isolated restore reconciles accounts, orders, workspaces and journal event IDs. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-010 | **Verification matrix.** Test both Coinbase and Hyperliquid, supported account modes, chart layouts and failure states separately. | Passing one provider/view cannot substitute for another provider/account workflow. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-011 | **Runtime acceptance.** Launch the real new app and verify listener, health APIs, intended routes and browser interactions. | Delivery includes exact test URL, startup commands and companion services that remain down. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-012 | **Evidence-based release.** Attach test, visual, numerical and reconciliation evidence to catalog items before marking verified. | Syntax or HTTP success alone cannot close visual/trading requirements. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-013 | **Migration isolation.** Use separate state namespace and paper database during development and preserve the existing desk. | Old runtime and user records remain recoverable; only explicitly mapped data is migrated. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-014 | **Dependency and upgrade policy.** Pin dependencies, preserve required notices and run contract/golden fixtures on upgrades. | No upstream update silently changes fills, indicator outputs or saved settings. | 1 · New release harness; reuse meaningful behavioral tests |
| NFR-015 | **Release rollback.** Use feature flags and a reviewed rollback path for shell, simulator and connector changes. | Rollback preserves accepted orders and history; it cannot imply a cancelled venue order without acknowledgement. | 1 · New release harness; reuse meaningful behavioral tests |

## Completion tracking contract

During implementation, fill `reference_catalog_ids`, `implementation_paths` and `evidence` in the JSON register. Split multi-tool families into child items without changing parent IDs. An implementation owner and an acceptance owner must sign off each release item. Requirements marked blocked remain in denominator when reporting the requested parity target.

Use status values proposed, implementing, partial, blocked, implemented, verified and accepted_deviation. An implemented feature has source/build evidence; a verified feature also has passing relevant runtime/numerical/visual evidence. An accepted deviation records a product decision and does not masquerade as strict reference parity.

Phase-0 exit must resolve catalog counts, exact baseline plan/platform, per-study/tool child tasks, Vela host extension seams, script-engine choice and item-level dependencies. Current generic engineering requirements and full-platform work packages are deliberately broader than observed controls; their proposed behavior is our specification, with current source facts documented in the separate reuse audit.

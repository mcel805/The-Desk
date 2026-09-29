# Count Desk chart platform and futures data — discovery record

Status: single-user prototype decision and remaining roadmap, 2026-09-28. Paper/shadow research only.

## What prompted this record

The user wants TradingView-like chart interaction on the site while owning the
chart architecture, with real-time futures data and a way for users to bring
their own Pine Script indicators. They suggested Lightweight Charts and asked
whether OpenCharts could accelerate the interface. The attached pasted AI
conversation is a list of leads, not evidence that broker API access, Pine
execution, or data redistribution is authorized. The screenshot shows the
current Count Desk, including its Massive status badge.

The user clarified that this proof of concept is for their own futures day
trading, using the indicators already on Count Desk. The trading interface
should occupy most of the dashboard while Batty chat remains on the right.
Simulation comes first; live trading is last. A hosted multi-user version is
outside this prototype scope and would need its own data-rights review.

## Prototype implemented in Count Desk

- The existing Lightweight Charts view remains the rendering core and retains
  the current Count Desk indicators, drawings, counts, and overlays.
- The chart-first layout has a local paper ticket over the chart and the Batty
  chat dock at right. The ticket can be hidden to restore all chart space.
- A separate local paper ledger queues micro-futures entries and exits against
  the selected stored symbol, timeframe, and bar. A request fills at the next
  stored bar's open only after a following bar confirms that fill bar completed.
  The ledger retains source and dataset identity, bar time, and gross P&L.
- Optional stop and target now have manual **Check bracket** evaluation, one
  confirmed stored bar at a time. Same-bar stop/target ambiguity resolves at
  the stop, and gaps fill at the bar open. Practice can start 30 bars before
  the current cutoff. Fees and slippage are not modeled. This remains
  historical/delayed-bar simulation, with no broker account or live route.

The current slice does **not** yet meet full TradingView parity. The next
prototype work should add richer chart replay controls, native indicator settings and
panes, alerts, an order ladder, adjustable brackets, fill cost assumptions,
and a transparent completeness/freshness check for the data source. General
Pine import and any live brokerage integration are later gates.

## Product bar: better trading experience at a fraction of the cost

The user clarified that **the trading experience is the primary success
criterion**, and the recurring cost must be a fraction of their TradingView
setup. The target is a better workflow for this one futures day trader on MYM
and the other Count Desk micro futures, rather than a claim to duplicate every
TradingView market, chart type, community script, or social feature. The current
paper ticket is a functional prototype, **not** evidence that this bar is met.

| Workflow | Current Count Desk | Acceptance target for the next trading slice |
| --- | --- | --- |
| Read the market | Chart-first layout, existing counts and overlays; floating paper ticket can cover candles | Keep the active price area unobstructed during order entry; show dated contract, source, data delay, and last update together |
| Act on a setup | Long/short paper queue from the ticket | Place, adjust, cancel, flatten, and reverse a simulated position from the chart with clear mode and risk; compare clicks and elapsed time against the user's TradingView routine |
| Manage risk | Stop/target reference lines only | Draggable simulated bracket orders, position size and dollar risk preview, deterministic trigger and gap rules, explicit fees/slippage assumptions |
| Practice | Next-completed-bar fill ledger | Bar replay without future leakage, speed control, bookmarks, session selection, and replayable order/indicator state |
| Keep context | Saved Count Desk drawings/templates and Batty dock | Restore the exact chart, indicator settings, drawings, contract, session, and paper state after restart; chat stays available without hiding price |
| Trust the feed | Source stored with bars and paper fills; current provider can be delayed | Prominent stale/missing/corrected-bar state, session and roll handling, and a side-by-side comparison with the same contract in TradingView |

The comparison should be a recorded hands-on run through the user's actual
routine: open MYM, assess the existing indicators, enter a bracket, move the
stop, scale out, flatten, replay the session, and reopen the workspace. Count
steps, time, chart obstruction, errors, and source mismatch. Do not declare the
experience better until the user judges this run better.

### Recurring-cost gate

Record the user's actual TradingView plan, exchange-data charge, broker/data
feed, and any other recurring fees before setting a dollar target. Compare
**incremental** Count Desk cost and **all-in** cost separately; broker/exchange
fees may remain in either workflow. The local chart library avoids a TradingView
platform subscription, but it does not include futures data or broker API
rights. This recurring-bill target does not count the time and expense of
building and maintaining the custom platform; track those separately. A
provider-neutral adapter should make the data path replaceable.

The user confirmed **AMP with CQG** as their current broker/feed. [AMP's
published nonprofessional exchange schedule](https://www.ampfutures.com/trading-info/exchange-data-fees)
lists CQG CBOT Level 1 at $5/month and the four-exchange Level 1 bundle at
$15/month; [AMP says](https://faq.ampfutures.com/hc/en-us/articles/30148100917911-Does-AMP-charge-any-data-subscription-fees)
CQG has no separate monthly feed charge beyond exchange data. These are
published rates, **not** proof of the user's entitlement or of custom API
access. [CQG's WebAPI price sheet](https://partners.cqg.com/marketing-resources/monthly-price-sheet)
says to contact CQG for API pricing and notes additional fees/questionnaire;
[CQG requires conformance testing](https://help.cqg.com/apihelp/Documents/cqgwebapi.htm)
before production API access. Reusing the user's AMP/CQG login in Count Desk
must wait for written permission, an exact incremental quote, and technical
credentials for that use. Never copy a browser/platform session or assume an
existing CQG market-data subscription confers WebAPI access.

The AMP-site follow-up found a narrower answer to the connection-fee question:
[AMP says switching among its supported platforms on the same CQG feed has no
extra fee](https://faq.ampfutures.com/hc/en-us/articles/30243668201879-Are-there-any-fees-for-changing-trading-platforms),
and the standard CQG feed has no separate monthly connection fee. AMP's
[exchange fee schedule](https://www.ampfutures.com/trading-info/exchange-data-fees)
also lists $10/month for an additional CQG user/login, with exchange data
charged per username, and $0.10 per side/contract for the CQG trade route.
[AMP describes CQG data and trading APIs for external apps](https://www.ampfutures.com/trading-platform/cqg-qtrader),
but its supported-platform and fee pages do **not** say that a new Count Desk
app receives API access under the ordinary CQG login at no charge. CQG's own
WebAPI price sheet still says "contact us for pricing." A switch to another
feed can create duplicate exchange-data charges for the same month; that is
separate from the CQG WebAPI question.

AMP's [simultaneous-platform FAQ](https://faq.ampfutures.com/hc/en-us/articles/10798505554199-How-to-activate-a-2nd-CQG-user-to-connect-to-Multiple-Platforms-at-the-same-time)
says a **second CQG user** is needed to use two CQG-compatible platforms at
once, at $10/month plus exchange data for that username. This supports the
user's expectation that their present single login is one platform session at
a time. [CQG's WebAPI logon documentation](https://help.cqg.com/apihelp/Documents/messagelogon.htm)
shows that a second session may either fail with a concurrent-session result
or drop the existing session, depending on client behavior. A safe account
specific test is: when flat with no working orders, record platform A's
connection state, log into platform B using the same AMP/CQG username, record
which session remains active, then log out of B and restore A. No orders are
needed. If platform A is TradingView, inspect its AMP broker connection in the
Trading Panel; a chart can still display TradingView-sourced bars after the
broker connection is lost. A demo-account result would establish only the demo
configuration.
Count Desk has no CQG login or WebAPI connector, so a test between two existing
AMP-supported platforms cannot establish that Count Desk itself has API access.

The user estimates their current bill at **about $16/month for TradingView's
entry paid plan plus roughly $7/month for AMP/CQG MYM data**; they will verify
the data amount. This is a provisional ~$23/month all-in benchmark, with about
$16/month of potential platform savings. If Count Desk could use the already
paid AMP/CQG feed at **zero additional API or platform fee**, the recurring
total would be roughly $7/month, about 30% of today's estimate. That scenario
is conditional: CQG's custom API quote and access terms are the deciding
facts. A $29 delayed or $199 real-time Massive plan would exceed the current
~$23/month estimate before any other costs, so neither is the primary path to
the stated savings target.

As checked on 2026-09-28, [TradingView's pricing page](https://www.tradingview.com/pricing/)
shows Essential starting at $12.95/month when billed annually, and
[TradingView lists CME Group real-time data](https://www.tradingview.com/cme/)
at $9.95/month for eligible nonprofessional subscribers. TradingView also
[supports verification of some broker-paid exchange subscriptions](https://www.tradingview.com/support/solutions/43000479666-how-can-i-get-real-time-data-from-exchanges-that-i-have-already-purchased-with-my-broker/),
so those fees cannot automatically be treated as savings. On the alternative
side, [Massive's current individual futures plans](https://massive.com/pricing?product=futures)
list Basic at $0 with historical data, Starter at $29/month with delayed data,
and Advanced at $199/month with real-time data. Therefore a new Massive
Advanced subscription is **not** a demonstrated low-cost solution compared
with an Essential-level TradingView setup. A broker-feed reuse path may be
cheaper, but API access, entitlements, allowed local display, latency, and
cost remain unverified for the user's actual broker. Do not promise a savings
percentage until that path and the user's estimated bill are verified.

Priority order: (1) make the simulator's chart trading and bracket workflow
excellent on stored data, (2) qualify a low-cost, authorized, timely futures
feed, (3) validate the exact end-to-end workflow and cost against TradingView,
(4) add selective user-owned Pine compatibility where native Count Desk
indicators do not suffice, and (5) consider live brokerage routing only after
the prior gates and a separately approved integration.

For an AMP/CQG inquiry, request written answers to: (a) can a one-user local
Count Desk app receive WebAPI live CBOT/MYM quotes and historical bars under
the current AMP/CQG entitlement, (b) what one-time, monthly, per-user, and
per-message/API charges would apply, (c) what local retention and derived
indicator/simulation use is allowed, (d) whether a data-only scope is available
before trading permissions, and (e) what certification would be required if
live order routing were considered later. Keep account credentials and account
numbers out of that inquiry draft and out of Git.

## Verified current state

- Count Desk already vendors TradingView **Lightweight Charts 5.2.1** and uses
  it for candlesticks, zoom, pan, and crosshair. The toolbar, research overlays,
  templates, and saved drawings are Count Desk code around the library. See
  `count-dashboard/README.md`, `count-dashboard/web/app.js`, and
  `count-dashboard/web/vendor/`.
- The local server has a provider-neutral ingestion seam and a direct Massive
  REST aggregate connector. At the time of review, `/api/health` was OK and
  `/api/feed/status?symbol=CBOT_MINI:MYM1!&timeframe=1H` reported `receiving`,
  provider `Massive (MYMZ6)`, mode `DELAYED`, with a successful sync at
  `2026-09-28T17:50:11.965925+00:00`. This is a dated-contract historical feed,
  not proof of a real-time stream or a continuously rolled contract.
- The app's current feed docs describe Massive Futures Basic as eight-hour
  historical data, a five-minute desk polling cadence, manual dated-contract
  selection, and a local rights acknowledgement for retention and count use.
  That acknowledgement does not establish rights to serve data to other users.

## Recommendation

**Keep Lightweight Charts as the rendering core.** Replacing it would redo
working chart and overlay code without solving the difficult parts: data rights,
symbol/session normalization, indicators, and Pine semantics. Build a stable
Count Desk chart/indicator API around it. Evaluate selected OpenCharts drawing
and indicator code in an isolated spike, but do not adopt its full terminal or
demo account as the site's foundation.

| Option | Fit for Count Desk | Main cost or limit |
| --- | --- | --- |
| Existing Lightweight Charts 5.2.1 | Best base; already integrated, fast, open source, and supports plugins | We own indicator calculations, drawings, layouts, and data integration |
| OpenCharts | Useful reference for richer drawing tools and eight basic indicators; it also uses Lightweight Charts | Current README describes a React crypto paper demo with replayed timestamps, synthetic DOM, local storage, and thin tests. Its repository description advertises a Pine transpiler, but the README does not document one. Verify any specific module before reuse. |
| TradingView Advanced Charts | Rich ready-made chart and indicators if its access terms fit | Separate private library/API, own datafeed still required, and TradingView explicitly says Pine Script is unsupported |
| Apache ECharts / SciTrader | General charting alternatives | Neither removes the futures-data and Pine work. SciTrader depends on a separately licensed SciChart SDK; a switch needs a measured feature/performance reason. |

The target can feel familiar to a TradingView user without claiming complete
TradingView feature parity. Define parity as a feature checklist: multi-pane
indicators, chart types, drawings with editable settings, symbol/timeframe
changes, save/restore, alerts, replay, and accessibility. Mark each as built,
planned, or out of scope.

## Separate chart, data, and scripts

```text
Qualified futures source (dated contracts, entitlement, usage rights)
      -> server-side adapter -> normalized bars + provenance + freshness
      -> Count Desk APIs -> Lightweight Charts + native indicators + drawings
      -> paper research ledger (source/cutoff/version; no order routing)

User-owned Pine source -> private upload/review -> supported-subset adapter
      -> sandboxed indicator calculations -> plotted series/annotations
```

Keep credentials in the server/worker environment. Record exchange, root,
dated contract, provider, source timestamp, retrieval timestamp, session and
timezone, bar completion/correction, roll rule, and data mode. A continuous
symbol must be a documented derived series, never a silent replacement for a
dated contract. Counts and paper outcomes should use a frozen bar snapshot.

## Futures data decision

1. **Use current Massive Basic for historical research.** Massive's current
   futures aggregate documentation lists Basic at eight-hour historical,
   Starter/Developer at ten-minute delayed, and Advanced at real-time. The
   real-time plan alone does not answer hosted redistribution rights.
2. **For a private real-time pilot, qualify two paths:** a Massive real-time
   entitlement and the user's actual AMP data provider (CQG, Rithmic, etc.).
   AMP says feed selection and exchange entitlements are account setup items.
   CQG documents API access but also requires a formal conformance test for
   production WebAPI applications. A brokerage login is not blanket API or
   redistribution permission. IBKR is a separate candidate only if the user's
   account, API permissions, data subscriptions, and terms fit this use.
3. **For a hosted multi-user site, obtain a written commercial/display and
   derived-use path before a feed implementation.** Check direct provider and
   CME/CBOT conditions for per-user entitlements, public display, retention,
   counts/indicators, delayed versus real-time use, and permitted downstream
   access. Do not relay a personal AMP/CQG or IBKR stream to other users.

The attached AI text contains specific prices and categorical brokerage claims
that were not accepted as facts for this decision. Request current written
commercial terms for the actual use case before choosing a vendor.

## Pine Script path

Neither Lightweight Charts nor TradingView's separately licensed Advanced
Charts provides a Pine runtime. A `.pine` upload cannot simply be executed by
the current chart. Treat user-authored Pine as an **import format**, with clear
support levels:

1. Store the user's own source privately with version, author/license claim,
   Pine version, dependencies, and script hash. Accept source only when the
   user owns it or has permission; a protected/invite-only script is not an
   uploadable source just because it appears in their TradingView account.
2. Provide a small, documented compatibility subset for indicators (for
   example inputs, common `ta.*` functions, plots, and alerts as research
   signals). Return explicit unsupported-feature diagnostics for `request.*`,
   strategies, drawing objects, libraries, and other semantics until tested.
3. Execute calculations in an isolated, resource-limited worker on qualified
   bars. User code must not receive credentials, network access, filesystem
   access, account access, or order APIs. Do not run arbitrary uploaded JavaScript
   in the Count Desk origin.
4. Compare indicator outputs against user-supplied TradingView reference charts
   and bar-by-bar values for the same exact contract, source, timeframe, cutoff,
   session, inputs, and Pine version. Label converted results provisional until
   validated; note any differences caused by feed or bar construction.
5. Make native Count Desk indicators the long-term extension contract. Offer
   assisted Pine-to-native translation for complex scripts, with the user's
   review, rather than promising universal Pine execution.

## Proposed sequence and acceptance gates

1. **Freeze the target.** Private single-user Count Desk is selected for this
   proof of concept, using its existing indicators. Maintain a TradingView-like
   feature checklist as the prototype expands.
2. **Qualify data first.** Obtain written rights for MYM/CBOT display, local or
   hosted use, retention, and derived analysis. Test dated MYM 1m history and
   updates through the existing adapter; verify gaps, corrections, session
   boundaries, DST, and contract roll against source records.
3. **Build a native indicator interface.** Start with one simple pane indicator
   and one overlay indicator; verify save/restore, synchronization, and replay
   at a frozen cutoff. Keep Count Desk drawings and research state intact.
4. **Spike OpenCharts selectively.** Inspect license/attribution and port one
   drawing or indicator into a disposable branch. Compare interaction quality,
   maintenance burden, and compatibility with Lightweight Charts 5.2.1.
5. **Prototype Pine import on one owned script.** Publish an explicit support
   matrix and bar-by-bar validation report. Defer general user upload until
   security, ownership, diagnostics, and isolation pass review.

## Primary sources checked on 2026-09-28

- [Lightweight Charts product comparison](https://tradingview.github.io/lightweight-charts/docs/product-comparison)
- [Lightweight Charts plugin development](https://tradingview.github.io/lightweight-charts/docs/plugins/intro)
- [TradingView Advanced Charts custom indicators and Pine limit](https://www.tradingview.com/charting-library-docs/latest/custom_studies/)
- [OpenCharts current repository README](https://github.com/dylanpersonguy/OpenCharts)
- [Massive futures aggregate plan recency](https://massive.com/docs/rest/futures/aggregates?assetClass=futures&license=personal&name=futures_basic)
- [AMP data-feed and exchange setup](https://faq.ampfutures.com/hc/en-us/articles/10798247520919-How-do-I-change-data-feeds-or-add-exchanges)
- [CQG WebAPI access and conformance](https://help.cqg.com/apihelp/Documents/cqgwebapi.htm)
- [CQG market-data use terms](https://www.cqg.com/eula/en)
- [CME Group market-data policy education](https://www.cmegroup.com/market-data/license-data/market-data-policy-education-center.html)
- [TradingView script source and publication rights](https://www.tradingview.com/pine-script-docs/writing/publishing/)

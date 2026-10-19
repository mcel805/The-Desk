# Robinhood accounts and shadow agents

Open **Robinhood & agents** in the Desk header. This workspace has an independent
official Robinhood OAuth connection; no Base wallet is required. The old wallet
drawer remains available. This release provides account reads, chart-linked
native limit previews and explicit shadow evaluations. It exposes no broker submit, cancel, exercise, approval
mutation, or live activation route.

## Connection and account coverage

**Connect Robinhood** opens hosted login/consent, using discovered metadata,
state and PKCE S256. The workspace callback is
`/api/robinhood/workspace/callback`. Complete Robinhood onboarding if prompted.
This application's grant is independent of a chat assistant's connection.

Select any returned account. The eligible MCP account is selected initially;
eligibility comes from provider fields, not nicknames. Overview shows value,
cash, equity/crypto buying power, account type/state, options level, and approval
setting. Other views read positions, all four order families, approvals, and
month-span realized P&L/trade history. Broker-field disclosures retain returned
details with account identifiers masked. Records from advanced-order parents
and ordinary equity orders are not summed into a second fill/P&L ledger.

Each source shows observation time, page count, scope completion, errors,
unavailable tools, and whether more pages exist. **Load next page** uses a
server-held cursor; **Refresh view** restarts the visible sources from page one.
Failed reads retain the previous data and original timestamp with an error
label. Missing tools do not become successful empty histories. Null P&L stays
unavailable. This is not a complete banking/tax ledger or an all-time equity
curve. No broker balance/history is copied into the paper engine.

Pending approvals paginate like order histories. Realized trade rows without a
stable broker ID retain multiplicity even when all exposed fields are identical.
A valid portfolio with null buying power keeps its other account values visible;
shadow affordability checks still require available crypto buying power.

Optional 30-second refresh runs only while the dialog is open and connected,
with one workspace request at a time. It is not a market stream or unattended
strategy worker.

## Agent Studio

Choose the eligible MCP account and set an agent name, observe/shadow mode,
explicit USD spot pair allowlist, owner-defined maximum order notional and
spread, quote-age limit, and optional research notes. Saving creates an
immutable revision and pauses the agent. Concurrent edits require the current
expected revision. Resume enables only explicit shadow evaluations. Disconnect,
OAuth reconnect, and process restart pause agents.

The implemented strategy, **chart-ticket-v1**, is a deterministic policy
evaluator of a human-staged ticket. It is not an LLM, scanner, autonomous
scheduler or broker execution agent. Notes are recorded, not executed. Full
execution exposure/daily-loss budgets and model-based proposals belong to a
later activation stage.

## Chart handoff and shadow journal

1. Select a **Coinbase USD spot chart**, then stage an exact limit ticket.
2. Click **Send chart ticket to shadow agent**, or **Capture current chart
   ticket** in Agent Studio. The handoff freezes instrument, timeframe,
   completed-bar cutoff, quote observation time, side, quantity, limit,
   optional protection prices and source paper account. Chart/account/replay
   changes during capture invalidate it. The button never places a paper order.
3. Choose a saved shadow agent, resume it, and select **Evaluate shadow ticket**.
   The server checks pause/mode, revision, replay, chart freshness/identity,
   allowlist, notional, account eligibility, linked crypto account, fresh
   account-routed broker bid/ask timestamps, spread and crypto buying power.
4. Open **Shadow journal** to inspect the last 100 durable decisions, agent
   revisions, chart intents, quote provenance/routing and reasons. Logical
   request IDs make retries idempotent; changed tickets cannot reuse an ID.

`shadow_eligible` means these configured shadow checks passed. It is not broker
tradability, preview, reservation, order placement, or a fill. No capital is
reserved. Fees, pair/order precision, protective-order validity, and full sell
inventory are not validated. Sell tickets currently record a blocked decision
until available-quantity reconciliation is accepted. Optional protection prices
remain research context. No paper or broker fill is generated.

Hyperliquid perpetuals and futures/MYM are never converted to spot. Native
Robinhood equity/options charts, live controls, multi-leg options, protection
lifecycles, scheduling, LLM proposals and submission/recovery remain future work.
The existing paper chart and DOM route stays independent.

## Local identity and storage

The Desk is a single-user **loopback** application, not an Internet-facing
multi-user authentication service. A 30-day signed random HttpOnly,
SameSite=Lax profile cookie scopes local records. Its API-path restriction,
port-specific name,
exact-Origin checks for POSTs, and the parent server's loopback Host checks
protect the local workspace. This profile is separate from broker consent.

The ignored data directory holds `robinhood-profile.key` and
`robinhood-workspace.sqlite3`, both mode 0600. The key signs cookies and derives
opaque stable account references. SQLite stores masked snapshots, private
pagination checkpoints, configuration revisions, and shadow decisions by local
profile/account. Never commit or share these files. An expired cookie/new
browser profile creates a separate record scope; clearing cookies does not
delete old database records.

OAuth access/refresh tokens stay in process memory. Reconnect after restarting
the server. Disconnect removes this workspace's in-memory grant and pauses
agents but preserves local records. Revoke access in Robinhood to remove the
provider grant. Pause/disconnect do not cancel working broker orders or close
positions. A backend read-tool allowlist narrows the broad OAuth grant; this is
not advertised as a provider-enforced read-only token scope.

## Validation

From `apps/the-desk`, with the wallet-enabled Python environment:

```sh
python -m unittest discover -s tests -p 'test_robinhood*.py' -v
python -m unittest discover -s tests -p 'test_funding*.py' -v
node --test tests/test_robinhood_model.mjs tests/test_trading_model.mjs
```

HTTP tests use ephemeral local ports/private databases and make no broker calls.
Synthetic transport tests exercise pagination, routing identifiers, masking,
null/malformed data, failures retaining old timestamps, account isolation,
revision concurrency, stale/future quotes, replay, idempotency and restart.

For browser acceptance:

```sh
python tests/launch_robinhood_fixture.py --port 18886 --data-dir /tmp/rh-browser-fixture
chrome-devtools-axi open http://127.0.0.1:18886/
```

Pass the contents of `tests/verify_robinhood_browser.js` as the structured
argument to `chrome-devtools-axi eval`. It refuses other ports and requires
synthetic account labels before saving fixture configurations. It exercises
account switching, pagination, paused revision saves, the real chart-ticket
button, shadow evaluation, and the journal. Fixture broker responses and server
quotes are synthetic; Vela's existing direct chart provider may still attempt
public market reads. This does not establish real OAuth, broker data rights,
live orders, fills, or recovery acceptance.

The inherited `test_chart_brackets.mjs` working-order label expectation differs
from the current chart implementation. The same failure was reproduced in the
untouched source checkout; focused Robinhood success does not mean all existing
tests passed.

Reference: [Robinhood external-agent onboarding](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/).

During an evaluation, account, agent, configuration and capture controls are
locked. A returned decision must match the submitted request ID, agent, revision,
account and exact ticket before it can be displayed. Unsaved edits are retained
when clicking the active tab; save/discard is required before pause, agent/account
switching, or another capture. Results include their original decision time.


## Chart account and asset selection

The chart account selector groups Paper, Robinhood, Wallet/exchanges and future
Interactive Brokers. A green dot means this Desk has verified the Robinhood
account within 60 seconds. The Codex connector and the Desk OAuth client are
separate grants; connecting one does not connect the other. Wallet identity is
labeled separately from venue authorization. Binance/Coinbase account routing
and IBKR are unavailable rather than simulated connections.

Selecting Robinhood replaces header cash, portfolio value and buying power with
fresh account-scoped broker snapshots. Missing/stale balances and open P&L are
unavailable; crypto sizing uses crypto buying power, excluding equity margin.
Paper positions, order controls, export and ledger commands cannot operate under
the Robinhood selection. The paper DOM tab is unavailable in the Robinhood
context; chart limits use the native preview. The account workspace opens the
same masked account and blocks account switches while a read is pending.

Robinhood Assets is next to the account selector and in the watch rail. It loads
all supported USD crypto pairs through bounded, advancing pagination and labels
restrictions, halts and quantity/price steps. Stocks and ETFs use search (20
results per query) and account-specific tradability checks, not a claim of an
exhaustive equity catalog. The same selection sets the chart and ticket.
Selection is revalidated after reload. Options/futures are not available in this
ticket; the MCP account's eligibility is independent of other personal accounts.

Matching crypto may use exact-symbol Hyperliquid perpetual reference charts or
Coinbase spot charts, based on provider catalogs. There is no alias mapping
(e.g. PEPE is not kPEPE). Robinhood spot quotes, symbol and spendable power remain
separate. Where neither chart feed lists the pair, the ticket remains available
with Robinhood quotes and an empty historical chart; candles are not invented.
Stocks have Robinhood MCP historicals for 1m, 3m, 5m, 15m, 30m, 1h, 4h and 1D, regular
session, split adjusted, with interpolated/invalid OHLC rows omitted. 3m and 15m aggregate only complete, consecutive source-bar buckets. Initial lookback includes ten calendar days to span closed sessions.

The chart ticket offers a native Robinhood limit preview (GTC; equities regular
hours), checks account eligibility, pair rules and a broker bid/ask no older than
15 seconds, and preserves broker alerts/disclosures. A changed ticket/account/
chart discards a pending review. Attached SL/TP is rejected. No real order,
cancellation or autonomous live strategy is enabled. Agent Studio remains shadow
only. Live acceptance requires the Desk's own OAuth grant and verified broker
review/execution/reconciliation; synthetic tests do not establish this.

Additional executable checks:

```sh
node --test tests/test_account_context.mjs
python3 -B -m unittest discover -s tests -p 'test_robinhood_markets.py'
```

The browser fixture for this increment used port 18889, not the unrelated app
already occupying 18886. Verified account selection, masked identity, green dot,
replacement of paper balances, shared BTC selection and native preview. Its
broker values and previews are explicitly synthetic; chart providers may use
public exchange data.

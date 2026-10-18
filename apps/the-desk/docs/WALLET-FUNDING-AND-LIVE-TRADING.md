# The Desk: Base wallet, funding and connected venues

Plan and implementation status, 12 October 2026.

## Product behavior

The user opens The Desk, clicks **Connect wallet**, selects the default **Ledger · direct USB** connection (no extension), confirms their account address on the device, and signs a one-time Base login message. Rabby and MetaMask remain optional browser-wallet choices. The header becomes a
clickable address that opens **Wallet & funding**. No order is submitted by
connecting. Keys remain in the selected signer; The Desk never asks for a seed phrase. See [direct USB architecture and setup](BASE-HARDWARE-WALLET.md).

The drawer provides three separate account views:

| Account | Where funds reside | Implemented actions | Delivery status |
|---|---|---|---|
| Base wallet | User-controlled address on Base | Signed login, ETH/native USDC balances and receive address | Implemented; user confirmed one real extension login; transfers disabled |
| Hyperliquid | HyperCore spot balances and perpetual collateral | Read-only account snapshots, positions, working orders and fills | Implemented for research context; venue order submission and cancellation are disabled |
| Robinhood | Broker custody | Official OAuth/PKCE login, masked accounts and read-only buying-power data | Public discovery and client registration verified; order writes disabled |
| Paper account | Local simulated ledger | Existing chart/DOM tickets and paper journal | Continues separately |

This makes Base the wallet and funding integration. It does not deploy The Desk
as a smart contract or turn Hyperliquid and Robinhood into Base applications.
No new token, pooled custody vault, or contract deployment is required for this
first implementation. A Base-native trading product beyond wallet funding would
need a named Base venue and its own quote, swap, simulation and settlement adapter.

## Funding and trading flow

1. **Identity:** EIP-6963 discovers multiple extensions without conflicting
   injected providers. EIP-4361-style sign-in binds address, Base chain, origin,
   nonce and five-minute expiry. The server verifies the signature and sets an
   eight-hour HttpOnly SameSite cookie. Logout revokes local sessions; account,
   network and disconnect events invalidate identity and clear transient page
   reviews.
2. **Wallet funding:** Receive shows the connected address and Base native USDC
   contract. ETH pays gas. Read ETH and USDC balances at the same block.
   Base transfers are disabled in this paper runtime. Swap and bridge controls
   open established provider interfaces; they are not embedded swap engines.
3. **Hyperliquid funding:** Open its official deposit/withdraw flow, which
   determines the supported source asset, route, fees and destination. Do not
   reuse a guessed deposit address or assume Base USDC is immediately available
   as HyperCore collateral. The current documentation supports CCTP and multiple
   source chains; the Arbitrum USDC route remains a documented option.
4. **Hyperliquid account view:** Refresh public venue metadata and the wallet's
   collateral, positions, working orders and fills. These values are read-only
   research context; The Desk does not sign, submit or cancel venue orders.
5. **Robinhood connection:** Sign in with the Base wallet first, then click
   **Sign in to Robinhood**. The server discovers the official issuer, registers
   a public OAuth client, generates a state and PKCE S256 verifier, and redirects
   to Robinhood's consent screen. The callback verifies state, wallet session,
   issuer and expiry, exchanges the code server-side and lists MCP capabilities.
   Tokens stay in server memory and never enter page storage or Git.
6. **Robinhood funding:** Fund the eligible account in Robinhood. Brokerage
   buying power and cash-only crypto buying power are separate authoritative
   figures. The chat's Robinhood grant is independent of the Desk app's grant.
7. **Robinhood account:** Account status and portfolio data are read-only in
   this build. Order submission remains disabled while durable broker recovery
   is pending. Use Robinhood's own interface for trading activity.

## Rabby scope and provider limits

The drawer follows Rabby's useful account pattern: address, chain, assets,
receive, swap/bridge links, activity, and disconnect. Rabby/MetaMask still
provide key custody, transaction simulation, wallet security checks and their
full token/NFT/multichain histories. This is not a fork of the Rabby extension or
a claim of full Rabby feature parity. QR receive, embedded swaps/bridges, full
token discovery and receipt polling are subsequent work.

Robinhood's official external-agent tools list equities, options and crypto.
The tool catalog available during implementation has no futures order tool.
Therefore **Robinhood futures are unavailable in The Desk**. Futures can be
traded in Robinhood's interface when the user's account is eligible. Enabling a
future native ticket requires an actual supported provider interface, futures
account approval, contract/tick/expiry metadata, margin, order review, routing
and confirmed fill reconciliation. A futures portfolio value is not routing
authority. Options tools exist, but this implementation does not yet provide a
native options ticket; its contract selector, approval and strategy validation
are separate work.

## Run and configuration

```sh
cd '/Users/markceleste/Documents/ChatGPT/The Trader - a trading company/apps/the-desk'
python3 -m venv .venv
.venv/bin/pip install -r requirements-wallet.txt
npm ci
.venv/bin/python server.py --port 18882 --data-dir /private/tmp/desk-funding-review
```

The launcher uses `DESK_PYTHON_BIN` when configured, then the Desk venv, then the
existing Count Desk venv, then the caller Python. Missing signature dependencies
leave paper routes working and report wallet verification as unavailable.

Hyperliquid account snapshots use the selected testnet or mainnet context for
read-only official API queries. Base transfers and Robinhood order submission
remain disabled. Production serving would require HTTPS, explicit deployed
origin/redirect configuration, persistent encrypted token custody, rate limits,
audit retention and reviewed data rights; the current server deliberately only
accepts loopback origins.

Optional `DESK_ROBINHOOD_CLIENT_ID` must belong to an approved client whose
redirect URI matches the runtime port. Dynamic registration is verified, but
actual user consent/approval may still require provider onboarding. Restarting
the server clears wallet and broker sessions and previews. Disconnecting The
Desk clears its local token; revoke the provider grant in Robinhood to remove
that grant completely.

## Validation and remaining acceptance

The wallet session is separate from the paper engine database and never stores
keys, signatures, access tokens or broker identifiers.

Executable tests cover synthetic wallet identity verification, replay, expiry,
origin and signer rejection, cookie lifecycle, wallet/network changes, exact
ETH/USDC encoding, EIP-6963 coexistence, read-only provider previews, OAuth/PKCE
session binding, account masking, account eligibility, broker alerts, paper-only
write-route rejection, wallet/network scope isolation, and the distinct
Robinhood RHC display versus RHS routing IDs. All financial tests use synthetic
keys or mock provider calls. HTTP tests own an ephemeral server and disposable
data.

The user confirmed a successful real extension connection and signed login.
This is user-reported evidence; separate coverage of both Rabby and MetaMask and
Robinhood's own OAuth consent and account capability response from this app remain
acceptance steps. No funds were moved or live orders placed during this work.

Venue order routing, receipt polling and live-order audit/journal remain outside
this paper research surface. Spot orders, brackets, leverage changes, Robinhood
order recovery, native options and futures remain separate follow-up work.

## Sources verified during implementation

- [RabbyKit provider support](https://rabbykit.rabby.io/)
- [Base funding routes](https://docs.base.org/base-chain/network-information/ecosystem-bridges)
- [Circle native USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Hyperliquid onboarding and funding](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading)
- [Hyperliquid signing guidance](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing)
- [Robinhood external-agent onboarding and capabilities](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/)
- [Robinhood Crypto API](https://robinhood.com/us/en/support/articles/crypto-api/)
- Robinhood public OAuth discovery and dynamic registration were read directly
  at `agent.robinhood.com`; the registered consent URL uses `robinhood.com/oauth`.

Dependency versions: `@nktkas/hyperliquid 0.33.3`, `viem 2.57.4`,
`eth-account 0.13.7`.

## Local validation evidence — 12 October 2026

- `npm run test:wallet`: wallet identity, hardware and pairing checks pass.
- Wallet-enabled Python funding, request-store and HTTP suites: 22 tests pass, with no dependency skips.
- Existing chart-menu, trading-model, DOM and chart-bracket Node checks: 19 pass.
- Chrome: real UI at `http://127.0.0.1:18882/` inspected at desktop and 500 px width; no horizontal drawer overflow. Missing-extension state, disconnected refresh and venue tabs verified.
- Disposable browser fixture at port 18883: synthetic Rabby sign-in, balances and read-only Hyperliquid snapshot verified. Venue actions are disabled in the fixture.
- The no-mistakes pipeline completed on the read-only snapshot before the follow-up. Its browser evidence covers wallet sign-in and restart persistence, but not the subsequently restored order panel. The Hyperliquid-only follow-up passed its separate focused test and synthetic browser checks listed above.
- Official Robinhood OAuth discovery and dynamic registration accepted. The app's user consent, token exchange and actual account catalog still require acceptance.
- Broader Python regression has a pre-existing Lux Journal failure (`pending 8 != 0`), reproduced against the unchanged baseline server; it prevents an all-suite green claim.
- Preview server has workers disabled, so its server quote and companion Lux Journal are unavailable. Client chart data does not establish execution readiness.

The interactive plan uses The Desk's existing design tokens and includes separate
funding walkthroughs, scope and release gates. Dark/light and narrow layouts were
visually inspected. No funds were moved or live orders placed.

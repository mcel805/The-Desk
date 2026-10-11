# IBKR read-only market-data bridge for Count Desk

Status: local adapter scaffold created; no IBKR session, account, market-data entitlement, or production bar stream has been verified.

## Proposed path

Count Desk connects over the local TWS API socket to Trader Workstation (TWS) or IB Gateway that the user has already logged into. The adapter requests one exact dated MNQ or MYM contract, verifies that IBKR reports live market data, requests one minute historical bars with live updates, and posts completed bars through the existing loopback-only Count Desk feed route.

This is market data only. The adapter does not request balances, positions, executions, or orders and does not contain order-placement calls. The user's TWS/IB Gateway remains the authentication surface; no brokerage password is entered into Count Desk or stored by this adapter. Keep TWS's **Read-Only API** setting enabled.

## Requirements to confirm

- IBKR TWS or IB Gateway is installed, signed in, and configured to allow local socket clients.
- The selected futures contract has an active market-data subscription that allows API use. IBKR documents that live data and historical bars require applicable Level 1 streaming data permissions; delayed quotes are 15–20 minutes and do not provide tick data.
- The user's IBKR market-data terms permit local display, the intended indicator/count calculations, and any local bar retention.
- The exact futures expiry is known (`YYYYMM`). This adapter does not use a continuous futures contract or roll contracts automatically.

IBKR documents the socket API as connecting to TWS or IB Gateway, and documents read-only API configuration and default ports. The adapter only permits a localhost connection. Typical defaults are TWS paper `7497`, TWS live `7496`, IB Gateway paper `4002`, and IB Gateway live `4001`; verify the configured port in the running platform.

## Install the official Python API

Download the TWS API from IBKR's official API page, install the Python client from its `source/pythonclient` directory using IBKR's included setup instructions, and confirm that `python3 -c 'import ibapi'` succeeds. Do not install an unofficial wrapper for this adapter.

In TWS or IB Gateway, enable **ActiveX and Socket Clients**, keep **Read-Only API** enabled, and allow localhost connections only. Use a paper-session port for initial connection checks. The adapter does not send trades, even when connected to a live session.

## Configure the local feed

Start Count Desk on loopback with a private `BATTY_FEED_TOKEN`. Then set the following values in the worker's local environment; keep them out of Git and chat:

```sh
BATTY_IBKR_HOST=127.0.0.1 \
BATTY_IBKR_PORT=7497 \
BATTY_IBKR_CLIENT_ID=27 \
BATTY_IBKR_SYMBOL=MYM \
BATTY_IBKR_CONTRACT_MONTH=202612 \
BATTY_IBKR_FEED_URL=http://127.0.0.1:8770 \
BATTY_IBKR_FEED_TOKEN='same-private-token-as-Count-Desk' \
BATTY_IBKR_MARKET_DATA_CONFIRMED=1 \
BATTY_IBKR_LOCAL_USE_RIGHTS_CONFIRMED=1 \
python3 count-dashboard/ibkr_feed_adapter.py
```

Replace the sample contract month with the actual listed expiry you intend to chart. `MYM` resolves to CBOT; `MNQ` resolves to CME. Start with one symbol. Add a second adapter process only after confirming market-data line and username/session limits with IBKR.

The two `CONFIRMED` flags are local operator gates; setting them does not grant a subscription or legal permission. The worker exits if the API does not confirm live data for the contract. It posts only completed one minute bars so partial candles do not advance the paper simulator.

## Known limits

- Count Desk currently displays the source after data reaches its local feed route; the IBKR adapter is a separate process.
- No chart UI has been added for IBKR login or account details. TWS/IB Gateway handles login.
- The adapter requires a dated contract month and performs no expiry roll selection.
- This scaffold has not been tested against a running TWS/IB Gateway session or a funded account with CME market-data API entitlements.
- Before treating incoming bars as production research data, verify the reported contract, timestamp convention, session, data mode, market-data subscription, retention and derived-use rights.

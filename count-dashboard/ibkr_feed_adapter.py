"""Read-only IBKR TWS/IB Gateway market-data bridge for Count Desk.

Connects to a user-authenticated local TWS/IB Gateway socket, requests one exact
dated future, verifies that IBKR reports live market data, then forwards
historical and updating 1-minute bars to Count Desk's loopback feed endpoint.
This module deliberately contains no account, position, or order requests.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SYMBOLS = {
    "MYM": ("CBOT_MINI:MYM1!", "CBOT"),
    "MNQ": ("CME_MINI:MNQ1!", "CME"),
}
LIVE_MARKET_DATA = 1
MAX_WAIT_SECONDS = 20


class IBKRFeedError(RuntimeError):
    """Sanitized setup or connection error suitable for local display."""


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise IBKRFeedError(f"Set {name} in the local environment.")
    return value


def _post(path: str, payload: dict) -> None:
    base = _required("BATTY_IBKR_FEED_URL").rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise IBKRFeedError("The Count Desk feed URL must use local loopback HTTP.")
    token = _required("BATTY_IBKR_FEED_TOKEN")
    request = Request(
        f"{base}{path}",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            if response.status < 200 or response.status >= 300:
                raise IBKRFeedError(f"Count Desk feed returned HTTP {response.status}.")
    except IBKRFeedError:
        raise
    except Exception as exc:
        raise IBKRFeedError(f"Could not reach the local Count Desk feed ({type(exc).__name__}).") from exc


def _bar(bar) -> dict:
    try:
        stamp = int(float(bar.date))
        row = {
            "time": stamp,
            "open": float(bar.open),
            "high": float(bar.high),
            "low": float(bar.low),
            "close": float(bar.close),
            "volume": float(bar.volume),
        }
    except (AttributeError, TypeError, ValueError, OverflowError) as exc:
        raise IBKRFeedError("IBKR returned a bar with an unsupported timestamp or value.") from exc
    if stamp <= 0:
        raise IBKRFeedError("IBKR returned a bar without a valid epoch timestamp.")
    return row


def _load_api():
    try:
        from ibapi.client import EClient
        from ibapi.contract import Contract
        from ibapi.wrapper import EWrapper
    except ImportError as exc:
        raise IBKRFeedError(
            "IBKR's official TWS API Python package is not installed. Install it from the TWS API download."
        ) from exc
    return EClient, EWrapper, Contract


def run() -> None:
    """Run the local read-only feed worker until interrupted or disconnected."""
    for gate in ("BATTY_IBKR_MARKET_DATA_CONFIRMED", "BATTY_IBKR_LOCAL_USE_RIGHTS_CONFIRMED"):
        if os.environ.get(gate, "").strip() != "1":
            raise IBKRFeedError(f"Confirm the applicable IBKR access/data-use terms with {gate}=1 first.")

    symbol = _required("BATTY_IBKR_SYMBOL").upper()
    if symbol not in SYMBOLS:
        raise IBKRFeedError("BATTY_IBKR_SYMBOL must be MYM or MNQ.")
    continuous_symbol, exchange = SYMBOLS[symbol]
    month = _required("BATTY_IBKR_CONTRACT_MONTH")
    if not re.fullmatch(r"\d{6}", month):
        raise IBKRFeedError("BATTY_IBKR_CONTRACT_MONTH must be the exact YYYYMM futures expiry.")

    try:
        port = int(_required("BATTY_IBKR_PORT"))
        client_id = int(os.environ.get("BATTY_IBKR_CLIENT_ID", "27"))
    except ValueError as exc:
        raise IBKRFeedError("IBKR port and client ID must be integers.") from exc
    if not 1 <= port <= 65535 or client_id < 0:
        raise IBKRFeedError("IBKR port or client ID is outside its valid range.")
    host = os.environ.get("BATTY_IBKR_HOST", "127.0.0.1").strip()
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise IBKRFeedError("This adapter only connects to a local TWS or IB Gateway socket.")

    EClient, EWrapper, Contract = _load_api()
    ready = threading.Event()
    contract_ready = threading.Event()
    live_data = threading.Event()
    history_ready = threading.Event()
    stop = threading.Event()
    state: dict = {
        "contract": None, "bars": {}, "forming": None, "error": None,
        "realtime_confirmed": False,
    }
    provider = "IBKR TWS API"
    feed_symbol = continuous_symbol

    class App(EWrapper, EClient):
        def __init__(self):
            EClient.__init__(self, self)

        def nextValidId(self, orderId):
            # The identifier is only a connection-ready signal; no order method is called.
            ready.set()

        def contractDetails(self, reqId, details):
            state["contract"] = details.contract

        def contractDetailsEnd(self, reqId):
            contract_ready.set()

        def marketDataType(self, reqId, marketDataType):
            if reqId == 3:
                state["realtime_confirmed"] = marketDataType == LIVE_MARKET_DATA
                if state["realtime_confirmed"]:
                    live_data.set()
                else:
                    state["error"] = "IBKR did not confirm live market data for this contract."

        def historicalData(self, reqId, bar):
            try:
                row = _bar(bar)
                state["bars"][row["time"]] = row
            except IBKRFeedError as exc:
                state["error"] = str(exc)

        def historicalDataEnd(self, reqId, start, end):
            history_ready.set()
            try:
                ordered = sorted(state["bars"].values(), key=lambda x: x["time"])
                # Keep the newest history row aside because it can still be forming.
                # Count Desk paper checks only completed bars.
                state["forming"] = ordered.pop() if ordered else None
                state["bars"] = {item["time"]: item for item in ordered}
                _send_bars(feed_symbol, provider, ordered)
            except IBKRFeedError as exc:
                state["error"] = str(exc)

        def historicalDataUpdate(self, reqId, bar):
            try:
                row = _bar(bar)
                forming = state["forming"]
                if forming is None:
                    state["forming"] = row
                elif row["time"] > forming["time"]:
                    _send_bars(feed_symbol, provider, [forming])
                    state["bars"][forming["time"]] = forming
                    state["forming"] = row
                elif row["time"] == forming["time"]:
                    state["forming"] = row
            except IBKRFeedError as exc:
                state["error"] = str(exc)

        def error(self, reqId, errorCode, errorString, *args):
            # Do not expose connection details, account data, or request payloads.
            if errorCode in {2104, 2106, 2107, 2108, 2158}:
                return
            state["error"] = f"IBKR API reported error {errorCode}."

        def connectionClosed(self):
            state["error"] = "The local IBKR TWS/IB Gateway connection closed."
            stop.set()

    def heartbeat() -> None:
        while not stop.wait(15):
            try:
                last_time = max(state["bars"], default=0)
                _post("/api/feed/heartbeat", {
                    "provider": provider, "symbol": feed_symbol, "timeframe": "1M",
                    "mode": "REALTIME", "lastBarTime": last_time,
                    "message": f"IBKR live 1-minute bars for {symbol} {month}; read-only.",
                })
            except IBKRFeedError as exc:
                state["error"] = str(exc)
                stop.set()

    def fail_if_error() -> None:
        if state["error"]:
            raise IBKRFeedError(state["error"])

    app = App()
    try:
        app.connect(host, port, client_id)
        threading.Thread(target=app.run, name="countdesk-ibkr-api", daemon=True).start()
        if not ready.wait(MAX_WAIT_SECONDS):
            fail_if_error()
            raise IBKRFeedError("No TWS/IB Gateway API session responded. Check login and socket API settings.")

        requested = Contract()
        requested.secType = "FUT"
        requested.symbol = symbol
        requested.lastTradeDateOrContractMonth = month
        requested.exchange = exchange
        requested.currency = "USD"
        app.reqContractDetails(1, requested)
        if not contract_ready.wait(MAX_WAIT_SECONDS):
            fail_if_error()
            raise IBKRFeedError("IBKR did not resolve the exact futures contract in time.")
        contract = state["contract"]
        if contract is None or str(getattr(contract, "lastTradeDateOrContractMonth", ""))[:6] != month:
            raise IBKRFeedError("IBKR did not return the requested exact contract month.")

        # Request a live quote first so the feed is never mislabeled as real time.
        app.reqMarketDataType(LIVE_MARKET_DATA)
        app.reqMktData(3, contract, "", False, False, [])
        if not live_data.wait(MAX_WAIT_SECONDS):
            fail_if_error()
            raise IBKRFeedError("IBKR has not confirmed live market-data permission for this contract.")

        app.reqHistoricalData(
            4, contract, "", "1 D", "1 min", "TRADES", 0, 2, True, []
        )
        if not history_ready.wait(MAX_WAIT_SECONDS):
            fail_if_error()
            raise IBKRFeedError("IBKR did not finish the initial historical-bar request in time.")

        threading.Thread(target=heartbeat, name="countdesk-ibkr-heartbeat", daemon=True).start()
        while not stop.wait(1):
            fail_if_error()
    finally:
        stop.set()
        try:
            app.cancelHistoricalData(4)
            app.cancelMktData(3)
            app.disconnect()
        except Exception:
            pass


def _send_bars(symbol: str, provider: str, bars: list[dict]) -> None:
    if not bars:
        return
    _post("/api/feed/ingest", {
        "provider": provider,
        "symbol": symbol,
        "timeframe": "1M",
        "mode": "REALTIME",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "message": "IBKR TWS API; live market data confirmed; completed bars; exact dated contract; read-only.",
        "bars": bars,
    })


if __name__ == "__main__":
    try:
        run()
    except IBKRFeedError as exc:
        raise SystemExit(str(exc)) from exc

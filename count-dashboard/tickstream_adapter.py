"""Server-side, memory-only Tickstream feed for Count Desk charts.

The API key stays in this process. Tick data is aggregated to one-minute OHLCV
bars in a bounded in-memory buffer; this module never writes market data or
routes orders.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Any


API_KEY_ENV = "BATTY_TICKSTREAM_API_KEY"
SYMBOLS = ("NQ",)
MAX_BARS = 1_440


class TickstreamError(RuntimeError):
    """Safe user-facing Tickstream error; never includes request URLs or keys."""


def _seconds(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1e14:
        return number / 1_000_000
    if number > 1e11:
        return number / 1_000
    return number


def _ticks(payload: object) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("ticks", payload.get("data", []))
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def normalize_tick(row: dict[str, Any], symbol: str = "NQ") -> dict[str, Any] | None:
    if row.get("type") not in (None, "tick"):
        return None
    ticker = str(row.get("symbol", symbol)).upper()
    if ticker != symbol.upper():
        return None
    stamp = _seconds(row.get("tsu", row.get("timestamp", row.get("ts", row.get("time")))))
    try:
        price = float(row.get("price", row.get("px", row.get("last"))))
    except (TypeError, ValueError):
        return None
    if stamp is None:
        return None
    try:
        size = max(0.0, float(row.get("size", row.get("volume", 0)) or 0))
    except (TypeError, ValueError):
        size = 0.0
    return {"symbol": ticker, "time": stamp, "price": price, "size": size}


class TickstreamFeed:
    """Reconnectable SDK stream with a one-hour REST warm-up and memory bars."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._status: dict[str, Any] = {
            "state": "not_connected", "symbols": [], "lastTickAt": None,
            "lastSourceTime": None, "receivedTicks": 0, "message": "Set the server-side Tickstream key.",
        }
        self._bars: dict[str, dict[int, dict[str, Any]]] = {symbol: {} for symbol in SYMBOLS}
        self._started = False

    @property
    def configured(self) -> bool:
        return bool(os.environ.get(API_KEY_ENV, "").strip())

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True
        if not self.configured:
            return
        threading.Thread(target=self._run, name="countdesk-tickstream", daemon=True).start()

    def _run(self) -> None:
        try:
            from tickstream import Tickstream
        except ImportError:
            with self._lock:
                self._status.update(state="error", message="Install the Tickstream stream dependency and restart Count Desk.")
            return

        client = Tickstream(api_key=os.environ[API_KEY_ENV].strip(), timeout=30, retries=2)
        with self._lock:
            self._status.update(state="connecting", symbols=list(SYMBOLS), message="Connecting to the Tickstream NQ feed.")
        try:
            # Tickstream's documented no-start REST window is the latest hour.
            recent = client.ticks("NQ", limit=10_000)
            for row in _ticks(recent):
                self._push(row, "NQ")
            for frame in client.stream("NQ", reconnect=True, control=True):
                kind = frame.get("type")
                if kind == "welcome":
                    subscribed = [str(item).upper() for item in frame.get("subscribed", [])]
                    state = "connected" if "NQ" in subscribed else "error"
                    message = "NQ stream connected." if state == "connected" else "Tickstream did not confirm the NQ subscription."
                    with self._lock:
                        self._status.update(state=state, symbols=subscribed, message=message)
                elif kind == "error":
                    code = str(frame.get("error", {}).get("code", "feed_error"))[:48]
                    with self._lock:
                        self._status.update(state="error", message=f"Tickstream stream error ({code}).")
                else:
                    self._push(frame, "NQ")
        except Exception as exc:  # sanitize SDK/network exceptions before status exposure
            with self._lock:
                self._status.update(state="error", message=f"Tickstream connection failed ({type(exc).__name__}).")

    def _push(self, row: dict[str, Any], symbol: str) -> None:
        tick = normalize_tick(row, symbol)
        if not tick:
            return
        bucket = int(tick["time"] // 60) * 60
        bars = self._bars[symbol]
        with self._lock:
            bar = bars.get(bucket)
            if bar is None:
                bars[bucket] = {
                    "time": bucket, "open": tick["price"], "high": tick["price"],
                    "low": tick["price"], "close": tick["price"], "volume": tick["size"],
                }
            else:
                bar["high"] = max(bar["high"], tick["price"])
                bar["low"] = min(bar["low"], tick["price"])
                bar["close"] = tick["price"]
                bar["volume"] += tick["size"]
            for old in sorted(bars)[:-MAX_BARS]:
                del bars[old]
            self._status.update(
                lastTickAt=datetime.now(timezone.utc).isoformat(),
                lastSourceTime=datetime.fromtimestamp(tick["time"], timezone.utc).isoformat(),
                receivedTicks=int(self._status.get("receivedTicks", 0)) + 1,
            )
            if self._status.get("state") == "connecting":
                self._status.update(state="connected", symbols=[symbol], message=f"Receiving {symbol} ticks.")

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {**self._status, "configured": self.configured, "mode": "account feed; freshness shown from source timestamps"}

    def bars(self, symbol: str) -> dict[str, Any]:
        ticker = symbol.strip().upper()
        if ticker not in SYMBOLS:
            raise ValueError("Tickstream chart supports the subscribed NQ symbol.")
        self.start()
        with self._lock:
            result = [dict(self._bars[ticker][stamp]) for stamp in sorted(self._bars[ticker])]
            state = {**self._status}
        return {
            "symbol": ticker, "provider": "Tickstream", "state": state["state"],
            "message": state["message"], "lastSourceTime": state["lastSourceTime"],
            "bars": result,
        }


feed = TickstreamFeed()


def config_status() -> str:
    return "stream_configured" if feed.configured else "not_connected"


def fetch_quote(symbol: str) -> dict[str, Any]:
    result = feed.bars(symbol)
    if not result["bars"]:
        raise TickstreamError("Tickstream has not delivered a tick for this symbol yet.")
    bar = result["bars"][-1]
    return {
        "provider": "Tickstream", "source": "tick-stream.xyz", "symbol": symbol.upper(),
        "mode": result["state"], "price": bar["close"], "sourceTimestamp": result["lastSourceTime"],
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
    }

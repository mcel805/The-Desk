"""Server-side, memory-only Tickstream feed for Count Desk charts.

The API key stays in this process. Tick data is aggregated to one-minute OHLCV
bars in a bounded in-memory buffer; this module never writes market data or
routes orders.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo


API_KEY_ENV = "BATTY_TICKSTREAM_API_KEY"
SYMBOLS = ("NQ",)
MAX_BARS = 7 * 24 * 60
HISTORY_PAGE_SIZE = 10_000
MAX_HISTORY_PAGES = 2_048
TIMEFRAME_MINUTES = {"1M": 1, "1H": 60, "4H": 240, "1D": 1_440}
FUTURES_TIMEZONE = ZoneInfo("America/Chicago")


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


def aggregate_bars(bars: list[dict[str, Any]], timeframe: str) -> list[dict[str, Any]]:
    """Aggregate 1m bars on CME session boundaries (17:00 America/Chicago)."""
    interval = timeframe.upper()
    if interval not in TIMEFRAME_MINUTES:
        raise ValueError("Tickstream timeframe must be 1M, 1H, 4H, or 1D.")
    duration = TIMEFRAME_MINUTES[interval]
    if duration == 1:
        return bars

    grouped: dict[tuple[str, int], dict[str, Any]] = {}
    for bar in bars:
        local = datetime.fromtimestamp(int(bar["time"]), FUTURES_TIMEZONE)
        trade_date = local.date() + timedelta(days=1) if local.hour >= 17 else local.date()
        minutes_from_session_open = (local.hour * 60 + local.minute - 17 * 60) % 1_440
        key = (trade_date.isoformat(), minutes_from_session_open // duration)
        target = grouped.get(key)
        if target is None:
            grouped[key] = dict(bar)
        else:
            target["high"] = max(target["high"], bar["high"])
            target["low"] = min(target["low"], bar["low"])
            target["close"] = bar["close"]
            target["volume"] += bar["volume"]
    return sorted(grouped.values(), key=lambda bar: bar["time"])


class TickstreamFeed:
    """Reconnectable SDK stream with recent and seven-day REST history in memory."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._status: dict[str, Any] = {
            "state": "not_connected", "symbols": [], "lastTickAt": None,
            "lastSourceTime": None, "receivedTicks": 0, "message": "Set the server-side Tickstream key.",
        }
        self._latest_source_seconds = 0.0
        self._bars: dict[str, dict[int, dict[str, Any]]] = {symbol: {} for symbol in SYMBOLS}
        self._recent_keys: set[tuple[Any, ...]] = set()
        self._recent_key_order: deque[tuple[Any, ...]] = deque()
        self._history_keys: set[tuple[Any, ...]] = set()
        self._history_state = "idle"
        self._history_pages = 0
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
            # Warm the chart immediately, then fill up to seven days in the background.
            recent = client.ticks("NQ", limit=HISTORY_PAGE_SIZE)
            for row in _ticks(recent):
                self._push(row, "NQ")
            with self._lock:
                self._history_state = "loading"
            threading.Thread(
                target=self._load_history, args=(client,), name="countdesk-tickstream-history", daemon=True
            ).start()
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
                        warning = f"Tickstream reported stream warning ({code})."
                        self._status["streamWarning"] = warning
                        if self._status.get("lastTickAt"):
                            self._status.update(state="connected", message=f"Receiving NQ ticks; {warning}")
                        else:
                            self._status.update(state="connecting", message=warning)
                else:
                    self._push(frame, "NQ")
        except Exception as exc:  # sanitize SDK/network exceptions before status exposure
            with self._lock:
                self._status.update(state="error", message=f"Tickstream connection failed ({type(exc).__name__}).")

    def _load_history(self, client: Any) -> None:
        end = int(time.time())
        start = end - 7 * 24 * 60 * 60
        pending = [(start, end)]
        pages = 0
        capped = False
        try:
            while pending and pages < MAX_HISTORY_PAGES:
                lower, upper = pending.pop(0)
                for attempt in range(4):
                    try:
                        payload = client.ticks("NQ", start=lower, end=upper, limit=HISTORY_PAGE_SIZE)
                        break
                    except Exception:
                        if attempt == 3:
                            raise
                        time.sleep(min(2 ** attempt, 8))
                rows = _ticks(payload)
                for row in rows:
                    self._push(row, "NQ", history=True)
                pages += 1
                with self._lock:
                    self._history_pages = pages
                if isinstance(payload, dict) and payload.get("truncated"):
                    if upper - lower <= 1:
                        capped = True
                        continue
                    middle = (lower + upper) // 2
                    # The shared boundary second is intentional; _history_keys
                    # removes duplicate prints if the API treats both ends inclusive.
                    pending[0:0] = [(lower, middle), (middle, upper)]
            if pending:
                capped = True
            with self._lock:
                self._history_state = "capped" if capped else "complete"
        except Exception as exc:
            with self._lock:
                self._history_state = f"error:{type(exc).__name__}"
        finally:
            with self._lock:
                self._history_keys.clear()

    def _push(self, row: dict[str, Any], symbol: str, *, history: bool = False) -> None:
        tick = normalize_tick(row, symbol)
        if not tick:
            return
        bucket = int(tick["time"] // 60) * 60
        bars = self._bars[symbol]
        with self._lock:
            key = (round(tick["time"] * 1_000_000), tick["price"], tick["size"], str(row.get("side", "")))
            if history:
                if key in self._history_keys:
                    return
                self._history_keys.add(key)
            # Recent ticks overlap the one-hour warm-up and delayed stream. Deduplicate
            # only that rolling overlap; older paged history advances by its last tick.
            if tick["time"] >= time.time() - 3_600:
                if key in self._recent_keys:
                    return
                self._recent_keys.add(key)
                self._recent_key_order.append(key)
                while len(self._recent_key_order) > 100_000:
                    self._recent_keys.discard(self._recent_key_order.popleft())
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
            self._status["lastTickAt"] = datetime.now(timezone.utc).isoformat()
            self._status["receivedTicks"] = int(self._status.get("receivedTicks", 0)) + 1
            if tick["time"] >= self._latest_source_seconds:
                self._latest_source_seconds = tick["time"]
                self._status["lastSourceTime"] = datetime.fromtimestamp(tick["time"], timezone.utc).isoformat()
            if self._status.get("state") in ("connecting", "error"):
                warning = self._status.get("streamWarning")
                suffix = f"; {warning}" if warning else ""
                self._status.update(state="connected", symbols=[symbol], message=f"Receiving {symbol} ticks{suffix}.")

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                **self._status, "configured": self.configured,
                "mode": "account feed; freshness shown from source timestamps",
                "historyState": self._history_state, "historyPages": self._history_pages,
            }

    def bars(self, symbol: str, timeframe: str = "1M") -> dict[str, Any]:
        ticker = symbol.strip().upper()
        if ticker not in SYMBOLS:
            raise ValueError("Tickstream chart supports the subscribed NQ symbol.")
        interval = timeframe.upper()
        if interval not in TIMEFRAME_MINUTES:
            raise ValueError("Tickstream timeframe must be 1M, 1H, 4H, or 1D.")
        self.start()
        with self._lock:
            one_minute = [dict(self._bars[ticker][stamp]) for stamp in sorted(self._bars[ticker])]
            state = {**self._status}
            history_state = self._history_state
        result = aggregate_bars(one_minute, interval)
        return {
            "symbol": ticker, "provider": "Tickstream", "timeframe": interval, "state": state["state"],
            "message": state["message"], "lastSourceTime": state["lastSourceTime"],
            "historyState": history_state, "bars": result,
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

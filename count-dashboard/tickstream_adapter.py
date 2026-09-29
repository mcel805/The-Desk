"""Read-only Tickstream quote adapter for the delayed research pilot.

The API key stays on the server. This module intentionally exposes quote data only;
Tickstream execution endpoints are outside the Count Desk paper/shadow boundary.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


REST_BASE = "https://api.tick-stream.xyz/v1"
API_KEY_ENV = "BATTY_TICKSTREAM_API_KEY"
RIGHTS_ENV = "BATTY_TICKSTREAM_STORAGE_AND_DISPLAY_RIGHTS_CONFIRMED"


class TickstreamError(RuntimeError):
    """A safe, user-facing error from the Tickstream quote request."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def rights_confirmed(environ: dict[str, str] | None = None) -> bool:
    values = environ if environ is not None else os.environ
    return values.get(RIGHTS_ENV, "").strip().lower() in {"1", "true", "yes"}


def config_status(environ: dict[str, str] | None = None) -> str:
    values = environ if environ is not None else os.environ
    if not values.get(API_KEY_ENV, "").strip():
        return "not_connected"
    if not rights_confirmed(values):
        return "rights_confirmation_required"
    return "quote_configured"


def _seconds(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1e14:  # Tickstream tick rows use microseconds.
        return number / 1_000_000
    if number > 1e11:  # Accept millisecond timestamps from compatible gateways.
        return number / 1_000
    return number


def _iso_timestamp(value: object) -> str | None:
    seconds = _seconds(value)
    if seconds is None:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _number(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _latest_tick(payload: object) -> dict:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = None
        for key in ("ticks", "data", "results", "result"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                rows = candidate
                break
            if isinstance(candidate, dict) and isinstance(candidate.get("ticks"), list):
                rows = candidate["ticks"]
                break
        if rows is None:
            rows = [payload]
    else:
        raise TickstreamError("Tickstream returned an invalid tick response.")
    records = [row for row in rows if isinstance(row, dict)]
    if not records:
        raise TickstreamError("Tickstream returned no ticks for this symbol.")
    return max(records, key=lambda row: _seconds(row.get("tsu", row.get("timestamp", row.get("ts", row.get("time"))))) or 0)


def fetch_quote(symbol: str, *, api_key: str | None = None,
                rest_base: str = REST_BASE, opener=urlopen) -> dict:
    """Fetch recent ticks and normalize the newest print without persistence or orders."""
    ticker = str(symbol).strip().upper()
    if not ticker or len(ticker) > 32 or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for char in ticker):
        raise ValueError("Tickstream quote requires a valid provider symbol.")
    key = (api_key or os.environ.get(API_KEY_ENV, "")).strip()
    if not key:
        raise TickstreamError(f"Set {API_KEY_ENV} in the server environment first.")

    request = Request(
        f"{rest_base.rstrip('/')}/ticks?symbol={quote(ticker)}&limit=5",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "BattyCountDesk/1.0",
        },
    )
    try:
        with opener(request, timeout=20) as response:
            if response.status != 200:
                raise TickstreamError(f"Tickstream returned HTTP {response.status}.", response.status)
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise TickstreamError("Tickstream rejected the API key or quote entitlement.", exc.code) from exc
        raise TickstreamError(f"Tickstream returned HTTP {exc.code}.", exc.code) from exc
    except (URLError, TimeoutError) as exc:
        raise TickstreamError("Could not reach Tickstream. Check the network and try again.") from exc
    except json.JSONDecodeError as exc:
        raise TickstreamError("Tickstream returned invalid JSON.") from exc

    record = _latest_tick(payload)
    price = _number(record.get("price", record.get("lastPrice", record.get("last", record.get("px")))))
    if price is None:
        raise TickstreamError("Tickstream tick did not include a price.")
    timestamp = record.get("tsu", record.get("timestamp", record.get("ts", record.get("time"))))
    return {
        "provider": "Tickstream",
        "source": "tick-stream.xyz",
        "symbol": str(record.get("symbol", ticker)).upper(),
        "mode": "DELAYED" if record.get("mode") == "DELAYED" else "TICK SNAPSHOT · FRESHNESS FROM SOURCE TIMESTAMP",
        "delayMinutes": record.get("delayMinutes") if isinstance(record.get("delayMinutes"), (int, float)) else None,
        "price": price,
        "bid": _number(record.get("bid")),
        "ask": _number(record.get("ask")),
        "volume": _number(record.get("volume")),
        "sourceTimestamp": _iso_timestamp(timestamp),
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
    }

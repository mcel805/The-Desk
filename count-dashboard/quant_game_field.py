"""Range-local confirmed liquidity levels and entry eligibility (paper research)."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math

METHOD = "range-liquidity-v2"
MINUTE = 60_000


def milliseconds():
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def validate_bars(raw, start, cutoff):
    if not isinstance(raw, list) or not raw or len(raw) > 500:
        raise ValueError("Supply 1 to 500 range-local completed 1m bars")
    result = []
    prior = 0
    for row in raw:
        if not isinstance(row, dict):
            raise ValueError("Field candles must be objects")
        timestamp = int(row.get("time", 0))
        if timestamp < start or timestamp > cutoff or timestamp % MINUTE or timestamp <= prior:
            raise ValueError("Only ordered completed bars from the active field onward are allowed")
        try:
            values = {key: Decimal(str(row.get(key))) for key in ("open", "high", "low", "close")}
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("Field OHLC is missing or invalid") from exc
        if any(not value.is_finite() or value <= 0 or not math.isfinite(float(value)) for value in values.values()):
            raise ValueError("Field OHLC must be finite and positive")
        if values["high"] < max(values.values()) or values["low"] > min(values.values()):
            raise ValueError("Field OHLC is inconsistent")
        volume = None
        if row.get("volume") is not None:
            try:
                volume = Decimal(str(row["volume"]))
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise ValueError("Field volume is invalid") from exc
            if not volume.is_finite() or volume < 0 or not math.isfinite(float(volume)):
                raise ValueError("Field volume must be finite and nonnegative")
        result.append({"time": timestamp, **{key: float(value) for key, value in values.items()}, "volume": float(volume) if volume is not None else None})
        prior = timestamp
    if result[-1]["time"] != cutoff:
        raise ValueError("Field bars must end at the completed cutoff")
    return result


def levels(bars, field, *, include_expired=False):
    # A gap makes pre-gap levels unavailable: an unseen bar may have broken them.
    segment = bars
    for index in range(1, len(bars)):
        if bars[index]["time"] != bars[index - 1]["time"] + MINUTE:
            segment = bars[index:]
    result = []
    for kind, width in (("EXT", 14), ("INT", 5)):
        for index in range(width, len(segment) - width):
            bar = segment[index]
            for side, key in (("HIGH", "high"), ("LOW", "low")):
                price = bar[key]
                if not field["low"] <= price <= field["high"]:
                    continue
                neighbors = segment[index - width:index] + segment[index + 1:index + width + 1]
                if any(row[key] >= price if side == "HIGH" else row[key] <= price for row in neighbors):
                    continue
                broken = next((row for row in segment[index + width + 1:]
                               if (row["close"] > price if side == "HIGH" else row["close"] < price)), None)
                if broken and not include_expired:
                    continue
                result.append({"id": f"{field['version']}:{kind}:{side}:{bar['time']}", "kind": kind, "side": side,
                               "price": price, "origin_time": bar["time"],
                               "confirmed_time": segment[index + width]["time"] + MINUTE,
                               "status": "expired" if broken else "active", "tradable": not bool(broken),
                               "expired_time": broken["time"] + MINUTE if broken else None,
                               "expiry_reason": "completed close broke level" if broken else None,
                               "timeframe": "1m", "method": METHOD,
                               "zone": "premium" if price > (field["high"] + field["low"]) / 2 else "discount" if price < (field["high"] + field["low"]) / 2 else "equilibrium"})
    return sorted(result, key=lambda row: (row["price"], row["confirmed_time"]))


def entry(field, payload, price):
    if not field or payload.get("field_version") != field["range"]["version"]:
        raise ValueError("Freeze the current 15m battlefield and select one of its liquidity levels")
    source = payload.get("source", payload)
    provider, symbol = source.get("provider"), source.get("symbol")
    if provider != field["source"]["provider"] or symbol != field["source"]["symbol"] or source.get("timeframe") != "1m":
        raise ValueError("The selected liquidity level belongs to a different chart")
    age = milliseconds() - field["source"]["completed_cutoff"] - MINUTE
    if age < 0 or age > 120_000:
        raise ValueError("Field data is stale or forming; refresh before a new entry")
    level = next((item for item in field["levels"] if item["id"] == payload.get("level_id")), None)
    if not level or level.get("status") != "active" or level.get("tradable") is not True:
        raise ValueError("The selected level is unavailable, unconfirmed, broken or outside the battlefield")
    if Decimal(str(price)) != Decimal(str(level["price"])):
        raise ValueError("Entries must use the exact selected liquidity price")
    return {"field_version": field["range"]["version"], "level": level,
            "source": field["source"], "method": METHOD, "checked_at": datetime.now(timezone.utc).isoformat()}

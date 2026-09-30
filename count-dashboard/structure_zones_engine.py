"""Causal Structure Zones research engine.

This is an original OHLC-based implementation. It uses confirmed pivots,
close-through structure events, displacement-qualified origin zones, and
nearby-pivot clusters. It does not infer participant identity or order-book
liquidity from candles.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass


ENGINE_VERSION = "structure-zones-engine-v1.0.0"


@dataclass(frozen=True)
class Bar:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


@dataclass(frozen=True)
class StructureZonesSettings:
    pivot_length: int = 4
    origin_lookback: int = 8
    atr_period: int = 14
    min_displacement_atr: float = 0.8
    equal_tolerance_atr: float = 0.12
    pool_max_age: int = 80
    zone_max_age: int = 300
    max_items: int = 240

    def __post_init__(self) -> None:
        if not 1 <= self.pivot_length <= 50:
            raise ValueError("pivot_length must be between 1 and 50")
        if not 1 <= self.origin_lookback <= 50:
            raise ValueError("origin_lookback must be between 1 and 50")
        if not 2 <= self.atr_period <= 100:
            raise ValueError("atr_period must be between 2 and 100")
        if not 0 <= self.min_displacement_atr <= 10:
            raise ValueError("min_displacement_atr must be between 0 and 10")
        if not 0 <= self.equal_tolerance_atr <= 2:
            raise ValueError("equal_tolerance_atr must be between 0 and 2")
        if not 2 <= self.pool_max_age <= 1000:
            raise ValueError("pool_max_age must be between 2 and 1000")
        if not 2 <= self.zone_max_age <= 5000:
            raise ValueError("zone_max_age must be between 2 and 5000")
        if not 1 <= self.max_items <= 1000:
            raise ValueError("max_items must be between 1 and 1000")


def _pivot(bars: list[Bar], index: int, length: int, side: str) -> bool:
    candidate = bars[index]
    left = bars[index - length:index]
    right = bars[index + 1:index + length + 1]
    if len(left) != length or len(right) != length:
        return False
    if side == "HIGH":
        return candidate.high > max(bar.high for bar in left) and candidate.high >= max(bar.high for bar in right)
    return candidate.low < min(bar.low for bar in left) and candidate.low <= min(bar.low for bar in right)


def _true_ranges(bars: list[Bar]) -> list[float]:
    values: list[float] = []
    previous_close: float | None = None
    for bar in bars:
        values.append(max(bar.high - bar.low,
                          abs(bar.high - previous_close) if previous_close is not None else 0.0,
                          abs(bar.low - previous_close) if previous_close is not None else 0.0))
        previous_close = bar.close
    return values


def _identifier(kind: str, symbol: str, timeframe: str, side: str, time: int) -> str:
    raw = f"{ENGINE_VERSION}|{kind}|{symbol}|{timeframe}|{side}|{time}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16].upper()


def _origin_bar(bars: list[Bar], break_index: int, direction: str, lookback: int) -> int | None:
    start = max(0, break_index - lookback)
    for index in range(break_index - 1, start - 1, -1):
        bar = bars[index]
        if direction == "BULLISH" and bar.close < bar.open:
            return index
        if direction == "BEARISH" and bar.close > bar.open:
            return index
    return None


def build_structure_zones(
    bars: list[Bar], symbol: str, timeframe: str,
    settings: StructureZonesSettings = StructureZonesSettings(),
) -> dict:
    """Build a deterministic structure map from already-closed bars.

    Pivots become knowable only after the configured right-side bars. A break
    requires a later close to cross a confirmed pivot. Origin zones are the
    body range of the nearest prior opposite-colour candle when the break
    candle's true range meets the configured ATR displacement filter.
    """
    minimum = max(settings.pivot_length * 2 + 2, settings.atr_period + 1)
    if len(bars) < minimum:
        return {"engineVersion": ENGINE_VERSION, "status": "insufficient_history", "barsUsed": len(bars),
                "swings": [], "events": [], "zones": [], "pools": []}

    tr = _true_ranges(bars)
    swings: list[dict] = []
    events: list[dict] = []
    zones: list[dict] = []
    pools: list[dict] = []
    structure = "NEUTRAL"
    broken_pivots: set[tuple[str, int]] = set()

    for index, bar in enumerate(bars):
        atr_start = max(0, index - settings.atr_period + 1)
        atr_window = tr[atr_start:index + 1]
        atr = sum(atr_window) / len(atr_window) if len(atr_window) == settings.atr_period else None

        # Existing objects advance before new objects are created so no zone
        # can be touched on the candle that caused its creation.
        for zone in zones:
            if zone["state"] in {"INVALIDATED", "EXPIRED"}:
                continue
            age = index - zone["createdIndex"]
            if age > settings.zone_max_age:
                zone["state"] = "EXPIRED"
                zone["stateTime"] = bar.time
                continue
            if age <= 0:
                continue
            overlap = bar.low <= zone["top"] and bar.high >= zone["bottom"]
            if overlap:
                zone["touchCount"] += 1
                zone["lastTouchTime"] = bar.time
                if zone["firstTouchTime"] is None:
                    zone["firstTouchTime"] = bar.time
                if zone["state"] == "FRESH":
                    zone["state"] = "TOUCHED"
                    zone["stateTime"] = bar.time
            invalidated = (bar.close < zone["bottom"] if zone["direction"] == "BULLISH"
                           else bar.close > zone["top"])
            defended = (overlap and bar.close > zone["top"] if zone["direction"] == "BULLISH"
                        else overlap and bar.close < zone["bottom"])
            if invalidated:
                zone["state"] = "INVALIDATED"
                zone["stateTime"] = bar.time
            elif defended:
                zone["state"] = "DEFENDED"
                zone["stateTime"] = bar.time

        for pool in pools:
            if pool["state"] in {"RECLAIMED", "ACCEPTED", "EXPIRED"} or index <= pool["createdIndex"]:
                continue
            if index - pool["createdIndex"] > settings.pool_max_age:
                pool["state"] = "EXPIRED"
                pool["stateTime"] = bar.time
                continue
            price, tolerance = pool["price"], pool["tolerance"]
            if pool["side"] == "HIGH":
                swept = bar.high > price + tolerance
                accepted = bar.close > price + tolerance
                reclaimed = swept and bar.close <= price
                touched = bar.high >= price - tolerance
            else:
                swept = bar.low < price - tolerance
                accepted = bar.close < price - tolerance
                reclaimed = swept and bar.close >= price
                touched = bar.low <= price + tolerance
            if reclaimed:
                pool["state"] = "RECLAIMED"
                pool["stateTime"] = bar.time
            elif accepted:
                pool["state"] = "ACCEPTED"
                pool["stateTime"] = bar.time
            elif touched and pool["state"] == "OPEN":
                pool["state"] = "TESTED"
                pool["stateTime"] = bar.time

        # A pivot at i - L is first knowable at i, after its right-side bars.
        candidate_index = index - settings.pivot_length
        if candidate_index >= settings.pivot_length:
            candidate = bars[candidate_index]
            for side, value in (("HIGH", candidate.high), ("LOW", candidate.low)):
                if not _pivot(bars, candidate_index, settings.pivot_length, side):
                    continue
                swing = {"side": side, "price": value, "time": candidate.time,
                         "confirmedTime": bar.time, "index": candidate_index,
                         "confirmedIndex": index}
                swings.append(swing)

                if atr is not None and settings.equal_tolerance_atr > 0:
                    tolerance = atr * settings.equal_tolerance_atr
                    match = next((pool for pool in reversed(pools)
                                  if pool["side"] == side and pool["state"] in {"OPEN", "TESTED"}
                                  and candidate_index - pool["lastMemberIndex"] <= settings.pool_max_age
                                  and abs(value - pool["price"]) <= tolerance), None)
                    if match:
                        match["memberTimes"].append(candidate.time)
                        match["memberPrices"].append(value)
                        match["lastMemberIndex"] = candidate_index
                        match["price"] = sum(match["memberPrices"]) / len(match["memberPrices"])
                        match["tolerance"] = max(match["tolerance"], tolerance)
                        match["sequence"] = len(match["memberTimes"])
                        match["state"] = "OPEN"
                    else:
                        prior = next((item for item in reversed(swings[:-1])
                                      if item["side"] == side and candidate_index - item["index"] <= settings.pool_max_age
                                      and abs(value - item["price"]) <= tolerance), None)
                        if prior:
                            pool_id = "SZ-P-" + _identifier("POOL", symbol, timeframe, side, prior["time"])
                            pools.append({"poolId": pool_id, "side": side,
                                          "price": (value + prior["price"]) / 2,
                                          "tolerance": tolerance, "memberTimes": [prior["time"], candidate.time],
                                          "memberPrices": [prior["price"], value],
                                          "firstMemberTime": prior["time"], "lastMemberIndex": candidate_index,
                                          "createdIndex": index, "createdTime": bar.time,
                                          "state": "OPEN", "stateTime": bar.time})

        # Break the latest confirmed, unbroken pivot by a close crossing it.
        prior_close = bars[index - 1].close if index else None
        crossed: list[tuple[dict, str]] = []
        for side, direction in (("HIGH", "BULLISH"), ("LOW", "BEARISH")):
            level = next((item for item in reversed(swings)
                          if item["side"] == side and item["confirmedTime"] < bar.time
                          and (item["side"], item["time"]) not in broken_pivots), None)
            if not level or prior_close is None:
                continue
            crossed_up = side == "HIGH" and prior_close <= level["price"] < bar.close
            crossed_down = side == "LOW" and prior_close >= level["price"] > bar.close
            if crossed_up or crossed_down:
                crossed.append((level, direction))

        for level, direction in crossed:
            kind = "BREAK" if structure == "NEUTRAL" else "BOS" if structure == direction else "CHoCH"
            structure = direction
            broken_pivots.add((level["side"], level["time"]))
            body = abs(bar.close - bar.open)
            displacement = tr[index] / atr if atr else None
            origin_index = _origin_bar(bars, index, direction, settings.origin_lookback)
            zone = None
            if (origin_index is not None and displacement is not None
                    and displacement >= settings.min_displacement_atr and body > 0):
                origin = bars[origin_index]
                bottom, top = sorted((origin.open, origin.close))
                zone_id = "SZ-Z-" + _identifier("ZONE", symbol, timeframe, direction, bar.time)
                zone = {"zoneId": zone_id,
                        "sequence": zone_id[-8:],
                        "side": "DEMAND" if direction == "BULLISH" else "SUPPLY",
                        "direction": direction,
                        "top": top, "bottom": bottom,
                        "originTime": origin.time, "createdTime": bar.time,
                        "createdIndex": index, "sourcePivotTime": level["time"],
                        "structureEvent": kind, "displacementAtr": displacement,
                        "state": "FRESH", "stateTime": bar.time,
                        "firstTouchTime": None, "lastTouchTime": None, "touchCount": 0}
                zones.append(zone)
            event_id = "SZ-E-" + _identifier("EVENT", symbol, timeframe, direction, bar.time)
            zone_reason = "created" if zone else "no opposite-body origin or displacement below filter"
            events.append({"eventId": event_id, "kind": kind, "direction": direction,
                           "time": bar.time, "levelTime": level["time"], "price": level["price"],
                           "displacementAtr": displacement,
                           "originTime": bars[origin_index].time if origin_index is not None else None,
                           "zoneId": zone["zoneId"] if zone else None,
                           "zoneReason": zone_reason})

    item_counts = {"swings": len(swings), "events": len(events), "zones": len(zones), "pools": len(pools)}
    for collection in (swings, events, zones, pools):
        del collection[:-settings.max_items]
    return {"engineVersion": ENGINE_VERSION, "status": "ready", "barsUsed": len(bars),
            "settings": asdict(settings), "structure": structure,
            "itemCounts": item_counts, "maxItemsPerType": settings.max_items,
            "swings": swings, "events": events, "zones": zones, "pools": pools}


def input_hash(bars: list[Bar], symbol: str, timeframe: str,
               settings: StructureZonesSettings) -> str:
    payload = {"engineVersion": ENGINE_VERSION, "symbol": symbol, "timeframe": timeframe,
               "settings": asdict(settings), "bars": [asdict(bar) for bar in bars]}
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()

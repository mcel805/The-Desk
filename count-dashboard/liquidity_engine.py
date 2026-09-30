"""Lean, causal liquidity level engine ported from the supplied Batty Pine source."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


ENGINE_VERSION = "liquidity-engine-v1.0.0"


@dataclass(frozen=True)
class Bar:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


@dataclass(frozen=True)
class LiquiditySettings:
    external_length: int = 14
    internal_length: int = 5
    max_levels: int = 240

    def __post_init__(self) -> None:
        if not 1 <= self.external_length <= 100:
            raise ValueError("external_length must be between 1 and 100")
        if not 1 <= self.internal_length <= 100:
            raise ValueError("internal_length must be between 1 and 100")
        if not 1 <= self.max_levels <= 1000:
            raise ValueError("max_levels must be between 1 and 1000")


def _confirmed_pivot(bars: list[Bar], index: int, window: int, side: str) -> bool:
    """Match confirmed left/right swing semantics used by the desk's pivot code."""
    candidate = bars[index]
    left = bars[index - window:index]
    right = bars[index + 1:index + window + 1]
    if side == "high":
        return candidate.high > max(bar.high for bar in left) and candidate.high >= max(bar.high for bar in right)
    return candidate.low < min(bar.low for bar in left) and candidate.low <= min(bar.low for bar in right)


def _identifier(symbol: str, timeframe: str, kind: str, side: str, bar: Bar) -> str:
    identity = f"{ENGINE_VERSION}|{symbol}|{timeframe}|{kind}|{side}|{bar.time}"
    return hashlib.sha256(identity.encode()).hexdigest()[:16].upper()


def build_liquidity_levels(
    bars: list[Bar], symbol: str, timeframe: str, settings: LiquiditySettings = LiquiditySettings(),
) -> dict:
    """Find causal external wick/body zones and internal swing levels.

    The caller should supply closed bars only. Pivots are made visible at their
    confirmation bar, although their visual anchor is the original pivot bar.
    A level is broken only by a subsequent close beyond its outer boundary.
    """
    external = settings.external_length
    internal = settings.internal_length
    if len(bars) < external * 2 + 2:
        return {"engineVersion": ENGINE_VERSION, "levels": [], "barsUsed": len(bars), "status": "insufficient_history"}

    levels: list[dict] = []
    latest_external_high: tuple[float, float] | None = None  # upper boundary, lower boundary
    latest_external_low: tuple[float, float] | None = None

    for confirmed_index, confirmed_bar in enumerate(bars):
        candidates: list[tuple[str, str, int, float, float]] = []

        ext_index = confirmed_index - external
        if ext_index >= external:
            pivot = bars[ext_index]
            if _confirmed_pivot(bars, ext_index, external, "high"):
                top, bottom = pivot.high, max(pivot.open, pivot.close)
                latest_external_high = (top, bottom)
                candidates.append(("EXT", "BSL", ext_index, top, bottom))
            if _confirmed_pivot(bars, ext_index, external, "low"):
                top, bottom = min(pivot.open, pivot.close), pivot.low
                latest_external_low = (top, bottom)
                candidates.append(("EXT", "SSL", ext_index, top, bottom))

        int_index = confirmed_index - internal
        dealing_range_ready = (latest_external_high is not None and latest_external_low is not None
                               and latest_external_high[0] > latest_external_low[1])
        if int_index >= internal and dealing_range_ready:
            pivot = bars[int_index]
            if (_confirmed_pivot(bars, int_index, internal, "high")
                    and latest_external_low[1] < pivot.high < latest_external_high[0]):
                candidates.append(("INT", "BSL", int_index, pivot.high, pivot.high))
            if (_confirmed_pivot(bars, int_index, internal, "low")
                    and latest_external_low[1] < pivot.low < latest_external_high[0]):
                candidates.append(("INT", "SSL", int_index, pivot.low, pivot.low))

        for kind, side, pivot_index, top, bottom in candidates:
            pivot = bars[pivot_index]
            level_id = _identifier(symbol, timeframe, kind, side, pivot)
            levels.append({
                "id": f"LQ-{kind}-{side}-{level_id}",
                "sequence": level_id[:8],
                "side": side,
                "kind": kind,
                "top": top,
                "bottom": bottom,
                "price": top if side == "BSL" else bottom,
                "pivotTime": pivot.time,
                "confirmedTime": confirmed_bar.time,
                "pivotIndex": pivot_index,
                "confirmedIndex": confirmed_index,
                "broken": False,
                "brokenTime": None,
                "firstTouchTime": None,
                "touchCount": 0,
            })

        # Advance existing levels using only this confirmed bar. A fresh level
        # cannot be broken/touched on its confirmation candle in Pine either.
        for level in levels:
            if level["confirmedIndex"] >= confirmed_index or level["broken"]:
                continue
            if confirmed_bar.low <= level["top"] and confirmed_bar.high >= level["bottom"]:
                level["touchCount"] += 1
                if level["firstTouchTime"] is None:
                    level["firstTouchTime"] = confirmed_bar.time
            crossed = confirmed_bar.close > level["top"] if level["side"] == "BSL" else confirmed_bar.close < level["bottom"]
            if crossed:
                level["broken"] = True
                level["brokenTime"] = confirmed_bar.time

    levels.sort(key=lambda level: (level["confirmedIndex"], level["kind"], level["side"]))
    levels = levels[-settings.max_levels:]
    return {"engineVersion": ENGINE_VERSION, "levels": levels, "barsUsed": len(bars), "status": "ready"}


def input_hash(bars: list[Bar], symbol: str, timeframe: str, settings: LiquiditySettings) -> str:
    payload = {
        "engineVersion": ENGINE_VERSION,
        "symbol": symbol,
        "timeframe": timeframe,
        "settings": settings.__dict__,
        "bars": [[bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume] for bar in bars],
    }
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()

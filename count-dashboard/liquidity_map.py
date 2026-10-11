"""Deterministic confirmed-swing events for the Count Desk liquidity study.

This is the learning/report contract for the chart's swing-price presentation.
The older ``liquidity_engine`` remains a separate external-zone calculation and
must not be labeled or scored as this method.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass

from liquidity_engine import Bar


METHOD_ID = "liquidity-map-v1"
METHOD_VERSION = "1.0.0"
TIMEFRAME_SECONDS = {
    "1M": 60, "2M": 120, "3M": 180, "5M": 300, "15M": 900, "30M": 1800,
    "45M": 2700, "1H": 3600, "2H": 7200, "3H": 10800, "4H": 14400,
    "6H": 21600, "8H": 28800, "12H": 43200, "1D": 86400,
    "1W": 604800, "1MO": 2592000,
}


@dataclass(frozen=True)
class Settings:
    external_length: int = 14
    internal_length: int = 5
    convergence_atr: float = 0.1

    def __post_init__(self) -> None:
        if not 1 <= self.external_length <= 100:
            raise ValueError("external_length must be between 1 and 100")
        if not 1 <= self.internal_length <= 100:
            raise ValueError("internal_length must be between 1 and 100")
        if not 0.01 <= self.convergence_atr <= 2:
            raise ValueError("convergence_atr must be between 0.01 and 2")


def _pivot(bars: list[Bar], index: int, width: int, side: str) -> bool:
    center = bars[index]
    neighbors = bars[index - width:index] + bars[index + 1:index + width + 1]
    if side == "BSL":
        return all(center.high > item.high for item in neighbors)
    return all(center.low < item.low for item in neighbors)


def input_hash(bars: list[Bar], symbol: str, timeframe: str, settings: Settings) -> str:
    payload = {
        "methodId": METHOD_ID,
        "methodVersion": METHOD_VERSION,
        "symbol": symbol,
        "timeframe": timeframe,
        "settings": asdict(settings),
        "bars": [[bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume] for bar in bars],
    }
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _mean_true_range(bars: list[Bar], period: int = 14) -> float:
    if not bars:
        return 0.0
    start = max(0, len(bars) - period)
    values = []
    for index in range(start, len(bars)):
        bar = bars[index]
        previous_close = bars[index - 1].close if index else bar.close
        values.append(max(bar.high - bar.low, abs(bar.high - previous_close), abs(bar.low - previous_close)))
    return sum(values) / len(values)


def build_levels(
    bars: list[Bar], symbol: str, timeframe: str, duration_seconds: int,
    settings: Settings = Settings(),
) -> dict:
    """Map strict confirmed pivots and subsequent close-through events.

    Callers supply completed bars only. A level becomes knowable at the close
    of its final right-side bar; only later bars can break it. ``endTime`` is
    the close time of the break bar, or the last completed bar for active levels.
    """
    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    levels: list[dict] = []
    atr14 = _mean_true_range(bars) if len(bars) >= 15 else 0.0
    for kind, width in (("EXT", settings.external_length), ("INT", settings.internal_length)):
        for pivot_index in range(width, len(bars) - width):
            confirm_index = pivot_index + width
            for side in ("BSL", "SSL"):
                if not _pivot(bars, pivot_index, width, side):
                    continue
                pivot = bars[pivot_index]
                broken_index = next((i for i in range(confirm_index + 1, len(bars))
                    if (bars[i].close > pivot.high if side == "BSL" else bars[i].close < pivot.low)), None)
                price = pivot.high if side == "BSL" else pivot.low
                level_id = f"{METHOD_VERSION}-{kind}-{side}-{symbol}-{timeframe}-{pivot.time}"
                end_index = broken_index if broken_index is not None else len(bars) - 1
                levels.append({
                    "id": f"LQ-{level_id}",
                    "sequence": f"{kind[0]}{side[0]}-{pivot.time}",
                    "methodId": METHOD_ID,
                    "methodVersion": METHOD_VERSION,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "side": side,
                    "kind": kind,
                    "price": price,
                    "atr14": atr14,
                    "convergenceTolerance": atr14 * settings.convergence_atr,
                    "pivotTime": pivot.time,
                    "pivotIndex": pivot_index,
                    "pivotLength": width,
                    "confirmedTime": bars[confirm_index].time + duration_seconds,
                    "confirmedIndex": confirm_index,
                    "broken": broken_index is not None,
                    "brokenTime": bars[broken_index].time + duration_seconds if broken_index is not None else None,
                    "endTime": bars[end_index].time + duration_seconds,
                })

    levels.sort(key=lambda level: (level["confirmedTime"], level["kind"], level["side"]))
    return {
        "methodId": METHOD_ID,
        "methodVersion": METHOD_VERSION,
        "symbol": symbol,
        "timeframe": timeframe,
        "settings": asdict(settings),
        "levels": levels,
        "barsUsed": len(bars),
        "status": "ready" if len(bars) >= 2 * settings.external_length + 1 else "insufficient_history",
    }

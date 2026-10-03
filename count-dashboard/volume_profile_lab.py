"""Deterministic, paper-only indicator measurement primitives.

Volume Profile here allocates each OHLCV bar's reported volume in proportion
to overlap with each price row. It is an approximation, never trade-at-price volume. No
directional probability or trading edge is inferred from this calculation.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Iterable


PROFILE_VERSION = "volume-profile-range-overlap-v1.1.0"


@dataclass(frozen=True)
class ProfileSettings:
    bins: int = 32
    lookback: int = 160
    value_area_fraction: float = 0.70

    def __post_init__(self) -> None:
        if not 8 <= self.bins <= 128:
            raise ValueError("bins must be between 8 and 128")
        if not 20 <= self.lookback <= 2000:
            raise ValueError("lookback must be between 20 and 2000 bars")
        if not 0.50 <= self.value_area_fraction <= 0.90:
            raise ValueError("value area must be between 50% and 90%")

    def as_dict(self) -> dict:
        return {"bins": self.bins, "lookback": self.lookback,
                "valueAreaFraction": self.value_area_fraction}


def _bar_value(bar: object, name: str):
    return bar[name] if isinstance(bar, dict) else getattr(bar, name)


def _input_hash(bars: Iterable[object], settings: ProfileSettings) -> str:
    payload = {
        "version": PROFILE_VERSION,
        "settings": settings.as_dict(),
        "bars": [
            [_bar_value(bar, key) for key in ("time", "open", "high", "low", "close", "volume")]
            for bar in bars
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def build_volume_profile(bars: list[object], settings: ProfileSettings | None = None) -> dict:
    """Build a cutoff-safe OHLCV approximation from the supplied closed bars."""
    settings = settings or ProfileSettings()
    sample = bars[-settings.lookback:]
    if not sample:
        return {"status": "unavailable", "reason": "No stored bars", "bins": [],
                "poc": None, "vah": None, "val": None, "lookbackBars": 0,
                "knownVolumeBars": 0, "missingVolumeBars": 0,
                "calculationVersion": PROFILE_VERSION, "settings": settings.as_dict()}
    if any(_bar_value(sample[i], "time") >= _bar_value(sample[i + 1], "time") for i in range(len(sample) - 1)):
        raise ValueError("bars must have strictly increasing timestamps")
    for bar in sample:
        low, high = float(_bar_value(bar, "low")), float(_bar_value(bar, "high"))
        if not math.isfinite(low) or not math.isfinite(high) or high < low:
            raise ValueError("bar price range is invalid")
    missing = sum(_bar_value(bar, "volume") is None for bar in sample)
    known = [bar for bar in sample if _bar_value(bar, "volume") is not None]
    if any(not math.isfinite(float(_bar_value(bar, "volume"))) or float(_bar_value(bar, "volume")) < 0 for bar in known):
        raise ValueError("bar volume must be finite and nonnegative")
    common = {
        "lookbackBars": len(sample), "knownVolumeBars": len(known),
        "missingVolumeBars": missing, "firstBar": _bar_value(sample[0], "time"),
        "lastBar": _bar_value(sample[-1], "time"),
        "inputHash": _input_hash(sample, settings),
        "calculationVersion": PROFILE_VERSION, "settings": settings.as_dict(),
        "method": "OHLCV bar volume allocated by price-range overlap; estimated, not trade-at-price volume",
        "probability": None,
    }
    total = sum(float(_bar_value(bar, "volume")) for bar in known)
    if not known or total <= 0:
        return {**common, "status": "unavailable", "reason": "No positive observed volume", "bins": [],
                "poc": None, "vah": None, "val": None, "totalObservedVolume": total}
    floor = min(float(_bar_value(bar, "low")) for bar in known)
    ceiling = max(float(_bar_value(bar, "high")) for bar in known)
    step = (ceiling - floor) / settings.bins if ceiling > floor else 1e-9
    volumes = [0.0] * settings.bins
    for bar in known:
        low, high = float(_bar_value(bar, "low")), float(_bar_value(bar, "high"))
        volume = float(_bar_value(bar, "volume"))
        if low == high:
            index = max(0, min(settings.bins - 1, int((low - floor) / step)))
            volumes[index] += volume
            continue
        touched = []
        for index in range(settings.bins):
            row_low = floor + index * step
            row_high = row_low + step
            overlap = max(0.0, min(high, row_high) - max(low, row_low))
            if overlap > 0:
                touched.append((index, overlap))
        weight = sum(overlap for _, overlap in touched)
        if not weight:
            raise ValueError("bar range did not intersect any profile row")
        for index, overlap in touched:
            volumes[index] += volume * overlap / weight
    poc_index = max(range(settings.bins), key=lambda index: volumes[index])
    left = right = poc_index
    captured = volumes[poc_index]
    while captured + max(total * 1e-12, 1e-12) < total * settings.value_area_fraction and (left > 0 or right < settings.bins - 1):
        left_volume = volumes[left - 1] if left > 0 else -1
        right_volume = volumes[right + 1] if right < settings.bins - 1 else -1
        if right_volume > left_volume:
            right += 1
            captured += right_volume
        else:
            left -= 1
            captured += left_volume
    maximum = max(volumes)
    bins = [{
        "price": floor + (index + .5) * step,
        "low": floor + index * step,
        "high": floor + (index + 1) * step,
        "volume": volume,
        "relative": volume / maximum if maximum else 0.0,
    } for index, volume in enumerate(volumes)]
    return {
        **common, "status": "partial" if missing else "ready",
        "reason": f"{missing} of {len(sample)} bars have no volume" if missing else "",
        "bins": bins, "poc": bins[poc_index]["price"],
        "vah": bins[right]["high"], "val": bins[left]["low"],
        "totalObservedVolume": total, "allocatedVolume": sum(volumes),
        "valueAreaCapturedFraction": captured / total,
    }


def replay_profile_quality(bars: list[object], settings: ProfileSettings | None = None) -> dict:
    """Measure data coverage and deterministic output on completed prefixes.

    This reports operational integrity, not predictive performance. Each
    prefix ends at its own cutoff, so no later bar enters an earlier profile.
    """
    settings = settings or ProfileSettings()
    if len(bars) < settings.lookback:
        return {"status": "not_measured", "reason": "Fewer bars than the frozen lookback",
                "windows": 0, "scoredWindows": 0, "probability": None}
    statuses = {"ready": 0, "partial": 0, "unavailable": 0}
    input_hashes = []
    mass_error = 0.0
    for end in range(settings.lookback, len(bars) + 1):
        result = build_volume_profile(bars[end - settings.lookback:end], settings)
        statuses[result["status"]] += 1
        input_hashes.append(result["inputHash"])
        if result["status"] != "unavailable":
            mass_error = max(mass_error, abs(result["allocatedVolume"] - result["totalObservedVolume"]))
    return {"status": "operational_only", "windows": len(input_hashes),
            "readyWindows": statuses["ready"], "partialWindows": statuses["partial"],
            "unavailableWindows": statuses["unavailable"],
            "scoredWindows": 0, "maximumMassError": mass_error,
            "firstInputHash": input_hashes[0], "lastInputHash": input_hashes[-1],
            "probability": None, "metric": "coverage and mass conservation only"}

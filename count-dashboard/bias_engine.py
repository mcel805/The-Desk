"""Confirmed structure and prior-period liquidity context for the Bias indicator."""

from __future__ import annotations

import hashlib
import json
from bisect import bisect_right
from dataclasses import asdict, dataclass


ENGINE_VERSION = "bias-engine-v1.0.0"


@dataclass(frozen=True)
class Bar:
    time: int
    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True)
class BiasSettings:
    pivot_length: int = 5
    sweep_buffer_ticks: int = 1
    acceptance_buffer_ticks: int = 1
    max_points: int = 1800

    def __post_init__(self) -> None:
        if not 1 <= self.pivot_length <= 50:
            raise ValueError("pivot_length must be between 1 and 50")
        if not 0 <= self.sweep_buffer_ticks <= 100:
            raise ValueError("sweep_buffer_ticks must be between 0 and 100")
        if not 0 <= self.acceptance_buffer_ticks <= 100:
            raise ValueError("acceptance_buffer_ticks must be between 0 and 100")
        if not 20 <= self.max_points <= 5000:
            raise ValueError("max_points must be between 20 and 5000")


def _pivot(bars: list[Bar], index: int, length: int, side: str) -> bool:
    candidate = bars[index]
    left, right = bars[index - length:index], bars[index + 1:index + length + 1]
    if side == "high":
        return candidate.high > max(bar.high for bar in left) and candidate.high >= max(bar.high for bar in right)
    return candidate.low < min(bar.low for bar in left) and candidate.low <= min(bar.low for bar in right)


def _tick_size(symbol: str) -> float | None:
    name = symbol.upper()
    if "MYM" in name or "YM" in name:
        return 0.25
    if "MCL" in name or "CL" in name:
        return 0.01
    if "MGC" in name or "GC" in name:
        return 0.1
    return None


def _prior_period(frames: list[Bar], times: list[int], time: int) -> Bar | None:
    """Return the period before the frame containing `time`; never use that frame."""
    containing = bisect_right(times, time) - 1
    prior = containing - 1
    return frames[prior] if prior >= 0 else None


def _structure_summary(bars: list[Bar], length: int) -> dict:
    highs, lows = [], []
    for i in range(length, len(bars) - length):
        if _pivot(bars, i, length, "high"):
            highs.append({"time": bars[i].time, "price": bars[i].high})
        if _pivot(bars, i, length, "low"):
            lows.append({"time": bars[i].time, "price": bars[i].low})
    state = "MIXED"
    if len(highs) >= 2 and len(lows) >= 2:
        if highs[-1]["price"] > highs[-2]["price"] and lows[-1]["price"] > lows[-2]["price"]:
            state = "BULLISH"
        elif highs[-1]["price"] < highs[-2]["price"] and lows[-1]["price"] < lows[-2]["price"]:
            state = "BEARISH"
    return {"status": "ready" if state != "MIXED" else "mixed_or_insufficient", "bias": state,
            "barsUsed": len(bars), "lastHigh": highs[-1] if highs else None,
            "lastLow": lows[-1] if lows else None, "cutoff": bars[-1].time if bars else None}


def build_bias(
    bars: list[Bar], daily: list[Bar], weekly: list[Bar], symbol: str,
    settings: BiasSettings = BiasSettings(), timeframe: str = "",
) -> dict:
    """Calculate closed-bar structure and legacy PD/PW sweep context causally.

    Pivot tags are only introduced after the configured right-hand bars exist.
    Breaks require a later close through an already confirmed pivot. The
    returned directional read is descriptive and has no calibrated score.
    """
    length = settings.pivot_length
    if len(bars) < length * 2 + 5:
        return {"engineVersion": ENGINE_VERSION, "status": "insufficient_history", "barsUsed": len(bars),
                "points": [], "swings": [], "events": [], "tickSize": _tick_size(symbol)}

    tick = _tick_size(symbol)
    sweep_buffer = tick * settings.sweep_buffer_ticks if tick is not None else 0.0
    accept_buffer = tick * settings.acceptance_buffer_ticks if tick is not None else 0.0
    daily_times = [bar.time for bar in daily]
    weekly_times = [bar.time for bar in weekly]
    highs: list[dict] = []
    lows: list[dict] = []
    swings: list[dict] = []
    events: list[dict] = []
    points: list[dict] = []
    active_bos: dict | None = None
    last_legacy_day: int | None = None
    legacy_bias = "MIXED"
    legacy_reason = "Waiting for a prior-period sweep or acceptance"

    for i, bar in enumerate(bars):
        prior_sequence = "MIXED"
        if len(highs) >= 2 and len(lows) >= 2:
            if highs[-1]["price"] > highs[-2]["price"] and lows[-1]["price"] > lows[-2]["price"]:
                prior_sequence = "BULLISH"
            elif highs[-1]["price"] < highs[-2]["price"] and lows[-1]["price"] < lows[-2]["price"]:
                prior_sequence = "BEARISH"
        # Pivots from `i - length` become known only after this bar closes.
        candidate_index = i - length
        if candidate_index >= length:
            candidate = bars[candidate_index]
            for side, bucket in (("high", highs), ("low", lows)):
                if _pivot(bars, candidate_index, length, side):
                    swing = {"time": candidate.time, "confirmedTime": bar.time,
                             "price": candidate.high if side == "high" else candidate.low,
                             "side": side.upper()}
                    bucket.append(swing)
                    swings.append(swing)

        prior_high = highs[-1] if highs else None
        prior_low = lows[-1] if lows else None
        sequence = "MIXED"
        if len(highs) >= 2 and len(lows) >= 2:
            higher_highs = highs[-1]["price"] > highs[-2]["price"]
            higher_lows = lows[-1]["price"] > lows[-2]["price"]
            lower_highs = highs[-1]["price"] < highs[-2]["price"]
            lower_lows = lows[-1]["price"] < lows[-2]["price"]
            if higher_highs and higher_lows:
                sequence = "BULLISH"
            elif lower_highs and lower_lows:
                sequence = "BEARISH"

        # Close-through events can only break pivots confirmed on an earlier bar.
        prior_direction = active_bos["direction"] if active_bos else prior_sequence
        if i and prior_high and prior_high["confirmedTime"] < bar.time:
            if bars[i - 1].close <= prior_high["price"] and bar.close > prior_high["price"] + accept_buffer:
                kind = "CHOCH" if prior_direction == "BEARISH" else "BOS"
                event = {"time": bar.time, "kind": kind, "direction": "BULLISH",
                         "levelTime": prior_high["time"], "price": prior_high["price"],
                         "protectedTime": prior_low["time"] if prior_low else None,
                         "protectedPrice": prior_low["price"] if prior_low else None}
                events.append(event)
                active_bos = event
        if i and prior_low and prior_low["confirmedTime"] < bar.time:
            if bars[i - 1].close >= prior_low["price"] and bar.close < prior_low["price"] - accept_buffer:
                kind = "CHOCH" if prior_direction == "BULLISH" else "BOS"
                event = {"time": bar.time, "kind": kind, "direction": "BEARISH",
                         "levelTime": prior_low["time"], "price": prior_low["price"],
                         "protectedTime": prior_high["time"] if prior_high else None,
                         "protectedPrice": prior_high["price"] if prior_high else None}
                events.append(event)
                active_bos = event

        # The structure sequence leads; a contrary close-through leaves the
        # combined read in transition until confirmed swings catch up.
        if active_bos and sequence not in {"MIXED", active_bos["direction"]}:
            combined = "MIXED"
            phase = "TRANSITION"
        elif sequence in {"BULLISH", "BEARISH"}:
            combined = sequence
            phase = "SWING SEQUENCE"
        elif active_bos:
            combined = active_bos["direction"]
            phase = active_bos["kind"]
        else:
            combined = "MIXED"
            phase = "NO CONFIRMED DIRECTION"

        # Keep the original Pine rules as a separate diagnostic context, not a
        # substitute for the structure read. Bias resets on the daily period.
        pd = _prior_period(daily, daily_times, bar.time)
        pw = _prior_period(weekly, weekly_times, bar.time)
        day_key = pd.time if pd else None
        if day_key != last_legacy_day:
            legacy_bias = "MIXED"
            legacy_reason = "Waiting for a prior-period sweep or acceptance"
            last_legacy_day = day_key
        pd_low_reclaimed = bool(pd and bar.low <= pd.low - sweep_buffer and bar.close > pd.low)
        pd_high_rejected = bool(pd and bar.high >= pd.high + sweep_buffer and bar.close < pd.high)
        pd_low_accepted = bool(pd and bar.close < pd.low - accept_buffer)
        pd_high_accepted = bool(pd and bar.close > pd.high + accept_buffer)
        pw_low_reclaimed = bool(pw and bar.low <= pw.low - sweep_buffer and bar.close > pw.low)
        pw_high_rejected = bool(pw and bar.high >= pw.high + sweep_buffer and bar.close < pw.high)
        pw_low_accepted = bool(pw and bar.close < pw.low - accept_buffer)
        pw_high_accepted = bool(pw and bar.close > pw.high + accept_buffer)
        if pd_low_reclaimed or pw_low_reclaimed or pd_high_accepted or pw_high_accepted:
            legacy_bias = "BULLISH"
            legacy_reason = ("PDL swept + reclaimed" if pd_low_reclaimed else "PWL swept + reclaimed" if pw_low_reclaimed
                            else "PDH accepted" if pd_high_accepted else "PWH accepted")
        if pd_high_rejected or pw_high_rejected or pd_low_accepted or pw_low_accepted:
            legacy_bias = "BEARISH"
            legacy_reason = ("PDH swept + rejected" if pd_high_rejected else "PWH swept + rejected" if pw_high_rejected
                            else "PDL accepted" if pd_low_accepted else "PWL accepted")

        points.append({"time": bar.time, "close": bar.close, "bias": combined,
                       "structure": sequence, "phase": phase,
                       "legacyBias": legacy_bias, "legacyReason": legacy_reason,
                       "lastSwingHigh": prior_high, "lastSwingLow": prior_low,
                       "activeBreak": active_bos})

    tf_rank = {"1M": 0, "2M": 1, "3M": 2, "5M": 3, "15M": 4, "30M": 5, "1H": 6, "4H": 7, "1D": 8, "1W": 9}
    rank = tf_rank.get(timeframe.upper(), 0)
    higher_tf = "1W" if rank == 8 else "1D" if rank < 8 else None
    higher_bars = (weekly if higher_tf == "1W" else daily if higher_tf == "1D" else [])
    higher_summary = _structure_summary(higher_bars[:-1], length) if len(higher_bars) > 1 else {
        "status": "unavailable", "bias": "UNAVAILABLE", "barsUsed": len(higher_bars),
        "lastHigh": None, "lastLow": None, "cutoff": None,
    }
    local = points[-1]["bias"] if points else "MIXED"
    if higher_summary["bias"] in {"BULLISH", "BEARISH"} and local in {"BULLISH", "BEARISH"}:
        alignment = "ALIGNED" if higher_summary["bias"] == local else "CONFLICT"
    elif higher_summary["status"] == "unavailable":
        alignment = "UNAVAILABLE"
    else:
        alignment = "HIGHER TIMEFRAME MIXED"
    overall_bias = "MIXED" if alignment == "CONFLICT" else local
    overall_reason = ("Selected and higher-timeframe structure conflict" if alignment == "CONFLICT"
                      else "Selected-timeframe direction; higher timeframe unavailable" if alignment == "UNAVAILABLE"
                      else "Selected-timeframe direction; higher timeframe mixed" if alignment == "HIGHER TIMEFRAME MIXED"
                      else "Selected and higher-timeframe structure align")
    return {"engineVersion": ENGINE_VERSION, "status": "ready", "barsUsed": len(bars),
            "settings": asdict(settings), "tickSize": tick,
            "sweepBuffer": sweep_buffer, "acceptanceBuffer": accept_buffer,
            "points": points[-settings.max_points:], "swings": swings,
            "events": events, "chartTimeframe": timeframe,
            "higherTimeframe": higher_tf, "higherStructure": higher_summary,
            "timeframeAlignment": alignment, "overallBias": overall_bias,
            "overallReason": overall_reason}


def input_hash(bars: list[Bar], daily: list[Bar], weekly: list[Bar], symbol: str,
              settings: BiasSettings, timeframe: str = "") -> str:
    payload = {"engine": ENGINE_VERSION, "symbol": symbol, "timeframe": timeframe,
               "settings": asdict(settings),
               "bars": [asdict(bar) for bar in bars], "daily": [asdict(bar) for bar in daily],
               "weekly": [asdict(bar) for bar in weekly]}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

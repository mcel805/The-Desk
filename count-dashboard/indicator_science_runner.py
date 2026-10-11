"""Deterministic forward observer for the first Liquidity experiment.

Only completed bars first received within the frozen lag window can create
signals. The worker is a paper study, not an execution or model agent.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

import indicator_science as science
from liquidity_engine import Bar
from liquidity_map import Settings, TIMEFRAME_SECONDS, build_levels, input_hash


def ensure_schema(db: sqlite3.Connection) -> None:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS science_scan_marks (
            experiment_id TEXT NOT NULL, timeframe TEXT NOT NULL,
            bar_time INTEGER NOT NULL, PRIMARY KEY(experiment_id,timeframe)
        );
        CREATE TABLE IF NOT EXISTS science_trials (
            experiment_id TEXT NOT NULL, event_id TEXT NOT NULL, variant_id TEXT NOT NULL,
            timeframe TEXT NOT NULL, level_kind TEXT NOT NULL, session_id TEXT NOT NULL,
            signal_time TEXT NOT NULL, source_id TEXT NOT NULL, source_hash TEXT NOT NULL,
            input_hash TEXT NOT NULL, side TEXT NOT NULL, line_price REAL NOT NULL,
            target_price REAL, entry_price REAL, stop_price REAL, touch_bar_time INTEGER NOT NULL,
            entry_bar_time INTEGER, bars_seen INTEGER NOT NULL DEFAULT 0,
            break_even_armed INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL,
            detail_json TEXT NOT NULL, PRIMARY KEY(experiment_id,event_id,variant_id)
        );
    """)
    db.commit()


def iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds")


def epoch(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def crossed(bar: Bar, price: float) -> bool:
    return bar.low <= price <= bar.high


def favorable(side: str, a: float, b: float) -> bool:
    return a > b if side == "SSL" else a < b


def pick_target(levels: list[dict], side: str, kind: str, entry: float, target_type: str) -> float | None:
    opposite = "BSL" if side == "SSL" else "SSL"
    candidates = [level["price"] for level in levels if level["side"] == opposite and not level["broken"]
                  and (target_type == "opposite_liquidity" or level["kind"] == "EXT")
                  and favorable(side, level["price"], entry)]
    if not candidates:
        return None
    return min(candidates, key=lambda price: abs(price-entry))


def finish(db: sqlite3.Connection, trial: sqlite3.Row, bar: Bar, duration: int,
           outcome: str, gross_r: float | None, detail: dict) -> None:
    observation = {
        "experiment_id": trial["experiment_id"], "event_id": trial["event_id"],
        "variant_id": trial["variant_id"], "timeframe": trial["timeframe"],
        "level_kind": trial["level_kind"], "session_id": trial["session_id"],
        "signal_time": trial["signal_time"], "outcome_time": iso(bar.time + duration),
        "source_id": trial["source_id"], "source_hash": trial["source_hash"],
        "input_hash": trial["input_hash"], "outcome": outcome, "gross_r": gross_r,
        "detail": {**json.loads(trial["detail_json"]), **detail},
    }
    science.ingest(db, {"experiment_id": trial["experiment_id"], "observations": [observation]})
    db.execute("UPDATE science_trials SET state='resolved' WHERE experiment_id=? AND event_id=? AND variant_id=?",
               (trial["experiment_id"], trial["event_id"], trial["variant_id"]))
    db.commit()


def advance_trial(db: sqlite3.Connection, trial: sqlite3.Row, bar: Bar, duration: int,
                  spec: dict) -> None:
    if trial["state"] == "resolved" or bar.time <= trial["touch_bar_time"]:
        return
    _, _, break_even = trial["variant_id"].split(":")
    side = trial["side"]
    entry = trial["entry_price"]
    stop = trial["stop_price"]
    if trial["state"] == "pending_entry":
        entry = bar.open
        stop = entry - spec["stop_ticks"]*spec["tick_size"] if side == "SSL" else entry + spec["stop_ticks"]*spec["tick_size"]
        if trial["target_price"] is None or not favorable(side, trial["target_price"], entry):
            finish(db, trial, bar, duration, "invalidated", None, {"reason": "target_not_favorable_at_confirmation_entry"})
            return
        db.execute("UPDATE science_trials SET entry_price=?,stop_price=?,entry_bar_time=?,state='open' WHERE experiment_id=? AND event_id=? AND variant_id=?",
                   (entry, stop, bar.time, trial["experiment_id"], trial["event_id"], trial["variant_id"]))
        db.commit()
    if entry is None or stop is None or trial["target_price"] is None:
        return
    risk = abs(entry-stop)
    active_stop = entry if trial["break_even_armed"] else stop
    hit_stop = bar.low <= active_stop if side == "SSL" else bar.high >= active_stop
    hit_target = bar.high >= trial["target_price"] if side == "SSL" else bar.low <= trial["target_price"]
    if hit_stop and hit_target:
        finish(db, trial, bar, duration, "ambiguous", None, {"reason": "stop_and_target_in_same_bar"})
        return
    if hit_target:
        finish(db, trial, bar, duration, "target", abs(trial["target_price"]-entry)/risk,
               {"exit_price": trial["target_price"]})
        return
    if hit_stop:
        finish(db, trial, bar, duration, "break_even" if trial["break_even_armed"] else "stop",
               0.0 if trial["break_even_armed"] else -1.0, {"exit_price": active_stop})
        return
    seen = trial["bars_seen"] + 1
    if seen >= spec["horizon_bars"]:
        r = (bar.close-entry)/risk if side == "SSL" else (entry-bar.close)/risk
        finish(db, trial, bar, duration, "timeout", r, {"exit_price": bar.close, "horizon_bars": seen})
        return
    arm = trial["break_even_armed"] or (break_even == "one_r" and
           ((bar.close-entry) >= risk if side == "SSL" else (entry-bar.close) >= risk))
    db.execute("UPDATE science_trials SET bars_seen=?,break_even_armed=? WHERE experiment_id=? AND event_id=? AND variant_id=?",
               (seen, int(arm), trial["experiment_id"], trial["event_id"], trial["variant_id"]))
    db.commit()


def start_signal(db: sqlite3.Connection, exp: dict, levels: list[dict], level: dict,
                 bar: Bar, duration: int, source: sqlite3.Row, prefix: list[Bar]) -> int:
    spec = exp["spec"]
    settings = Settings(spec["external_length"], spec["internal_length"], spec["convergence_atr"])
    event_id = level["id"] + ":" + str(bar.time)
    signal_time = iso(bar.time + duration)
    if epoch(signal_time) <= epoch(exp["frozen_at"]):
        return 0
    rows = []
    for variant in science.variants(spec):
        entry_kind, target_type, _ = variant.split(":")
        entry = level["price"] if entry_kind == "first_touch" else None
        target = pick_target(levels, level["side"], level["kind"], level["price"], target_type)
        stop = (entry - spec["stop_ticks"]*spec["tick_size"] if level["side"] == "SSL"
                else entry + spec["stop_ticks"]*spec["tick_size"]) if entry is not None else None
        state = "open" if entry_kind == "first_touch" else "pending_entry"
        if entry_kind == "confirmed_reversal" and not favorable(level["side"], bar.close, level["price"]):
            state = "no_confirmation"
        if target is None:
            state = "no_target"
        rows.append((exp["id"], event_id, variant, level["timeframe"], level["kind"],
                     signal_time[:10], signal_time, source["source"], source["source_sha256"],
                     input_hash(prefix, level["symbol"], level["timeframe"], settings),
                     level["side"], level["price"], target, entry, stop, bar.time,
                     bar.time if entry is not None else None, 0, 0, state,
                     json.dumps({"level_id": level["id"], "pivot_time": level["pivotTime"],
                                 "confirmed_time": level["confirmedTime"], "signal_bar_time": bar.time,
                                 "entry_rule": entry_kind, "target_rule": target_type,
                                 "source_dataset": source["dataset_id"]}, sort_keys=True)))
    db.executemany("""INSERT OR IGNORE INTO science_trials VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
    db.commit()
    for trial in db.execute("SELECT * FROM science_trials WHERE experiment_id=? AND event_id=? AND state IN ('no_confirmation','no_target')",
                            (exp["id"], event_id)).fetchall():
        finish(db, trial, bar, duration,
               "no_confirmation" if trial["state"] == "no_confirmation" else "invalidated", None,
               {"reason": "reversal_not_confirmed" if trial["state"] == "no_confirmation" else "target_unavailable_at_signal"})
    for trial in db.execute("SELECT * FROM science_trials WHERE experiment_id=? AND event_id=? AND state='open'",
                            (exp["id"], event_id)).fetchall():
        # Entry and exit order inside the touch bar is unknown. Preserve that ambiguity.
        stop_hit = (bar.low <= trial["stop_price"] if trial["side"] == "SSL" else bar.high >= trial["stop_price"])
        target_hit = (bar.high >= trial["target_price"] if trial["side"] == "SSL" else bar.low <= trial["target_price"])
        if stop_hit or target_hit:
            finish(db, trial, bar, duration, "ambiguous", None, {"reason": "entry_bar_path_unknown"})
    return 1


def scan(db: sqlite3.Connection, chart_db: sqlite3.Connection) -> dict:
    ensure_schema(db)
    created = resolved = skipped = 0
    experiment_reports = []
    for exp in science.list_experiments(db)["experiments"]:
        if exp["state"] != "armed":
            continue
        spec = exp["spec"]
        settings = Settings(spec["external_length"], spec["internal_length"], spec["convergence_atr"])
        timeframe_reports = []
        for timeframe in spec["timeframes"]:
            metrics = {"timeframe": timeframe, "completedBarsAvailable": 0, "barsScanned": 0,
                       "eligibleBars": 0, "newSignals": 0, "resolvedVariants": 0,
                       "skippedBars": 0, "gapReasons": {}, "lastEligibleBar": None,
                       "pendingVariants": 0, "state": "waiting_for_data"}
            before_created, before_resolved, before_skipped = created, resolved, skipped
            duration = TIMEFRAME_SECONDS[timeframe]
            source_rows = chart_db.execute("""SELECT b.*,d.source,d.source_sha256,d.imported_at
                FROM bars b JOIN datasets d USING(dataset_id)
                WHERE b.symbol=? AND b.timeframe=? ORDER BY b.time DESC LIMIT 5000""",
                (spec["instrument"], timeframe)).fetchall()[::-1]
            if len(source_rows) < 2:
                metrics["state"] = "no_local_bars"
                timeframe_reports.append(metrics)
                continue
            completed = source_rows[:-1]
            metrics["completedBarsAvailable"] = len(completed)
            mark = db.execute("SELECT bar_time FROM science_scan_marks WHERE experiment_id=? AND timeframe=?",
                              (exp["id"], timeframe)).fetchone()
            cutoff = epoch(science.collection_cutoff(db, exp))
            last = mark[0] if mark else cutoff-duration
            for i, source in enumerate(completed):
                if source["time"] <= last or source["time"] + duration <= cutoff:
                    continue
                metrics["barsScanned"] += 1
                bar = Bar(source["time"], source["open"], source["high"], source["low"], source["close"], source["volume"])
                # A historical backfill imported after the event is context, not a forward signal.
                imported = epoch(source["imported_at"])
                gap_reason = ("source_mismatch" if source["source"] != spec["source_id"] else
                              "late_backfill" if imported > bar.time + duration + 1800 else None)
                if gap_reason:
                    skipped += 1
                    metrics["skippedBars"] += 1
                    metrics["gapReasons"][gap_reason] = metrics["gapReasons"].get(gap_reason, 0) + 1
                    for trial in db.execute("SELECT * FROM science_trials WHERE experiment_id=? AND timeframe=? AND state IN ('open','pending_entry')",
                                            (exp["id"], timeframe)).fetchall():
                        if bar.time > trial["touch_bar_time"]:
                            finish(db, trial, bar, duration, "data_gap", None, {"reason": gap_reason})
                    db.execute("INSERT INTO science_scan_marks VALUES (?,?,?) ON CONFLICT(experiment_id,timeframe) DO UPDATE SET bar_time=excluded.bar_time",
                               (exp["id"], timeframe, bar.time))
                    db.commit()
                    continue
                metrics["eligibleBars"] += 1
                metrics["lastEligibleBar"] = iso(bar.time + duration)
                for trial in db.execute("SELECT * FROM science_trials WHERE experiment_id=? AND timeframe=? AND state IN ('open','pending_entry')",
                                        (exp["id"], timeframe)).fetchall():
                    before = trial["state"]
                    advance_trial(db, trial, bar, duration, spec)
                    after = db.execute("SELECT state FROM science_trials WHERE experiment_id=? AND event_id=? AND variant_id=?",
                                       (exp["id"], trial["event_id"], trial["variant_id"])).fetchone()[0]
                    resolved += int(before != "resolved" and after == "resolved")
                prefix = [Bar(r["time"], r["open"], r["high"], r["low"], r["close"], r["volume"])
                          for r in completed[:i]]
                if len(prefix) >= 2*settings.external_length+1:
                    levels = build_levels(prefix, spec["instrument"], timeframe, duration, settings)["levels"]
                    for level in levels:
                        if level["kind"] not in spec["level_kinds"] or level["confirmedTime"] > bar.time:
                            continue
                        if not crossed(bar, level["price"]):
                            continue
                        if any(crossed(old, level["price"]) for old in prefix[level["confirmedIndex"]+1:]):
                            continue
                        created += start_signal(db, exp, levels, level, bar, duration, source, prefix)
                db.execute("INSERT INTO science_scan_marks VALUES (?,?,?) ON CONFLICT(experiment_id,timeframe) DO UPDATE SET bar_time=excluded.bar_time",
                           (exp["id"], timeframe, bar.time))
                db.commit()
            metrics["newSignals"] = created - before_created
            metrics["resolvedVariants"] = resolved - before_resolved
            metrics["skippedBars"] = skipped - before_skipped
            pending = db.execute("SELECT COUNT(*) FROM science_trials WHERE experiment_id=? AND timeframe=? AND state IN ('open','pending_entry')",
                                 (exp["id"], timeframe)).fetchone()[0]
            metrics["pendingVariants"] = pending
            if metrics["eligibleBars"]:
                metrics["state"] = "scanned"
            elif metrics["barsScanned"]:
                metrics["state"] = "data_gaps_only"
            else:
                metrics["state"] = "waiting_for_forward_bars"
            timeframe_reports.append(metrics)
        experiment_reports.append({"experimentId": exp["id"], "title": spec["title"],
                                   "timeframes": timeframe_reports})
    return {"newSignals": created, "resolvedVariants": resolved, "skippedBars": skipped,
            "mode": "completed_local_bars_only", "time": science.now(),
            "experiments": experiment_reports}

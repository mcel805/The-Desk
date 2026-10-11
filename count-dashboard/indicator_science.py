"""Frozen, local paper research records for indicator signal efficiency.

This ledger accepts source-tagged forward observations. It does not establish
market-data rights, dispatch a model, or promote indicator code.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from liquidity_map import METHOD_ID as LIQUIDITY_METHOD_ID, METHOD_VERSION as LIQUIDITY_METHOD_VERSION

TIMEFRAMES = ("4H", "1H", "30M", "15M", "5M", "3M", "1M")
KINDS = ("EXT", "INT")
ENTRIES = ("first_touch", "confirmed_reversal")
TARGETS = ("opposite_liquidity", "swing_structure")
BREAK_EVENS = ("none", "one_r")
OUTCOMES = ("target", "stop", "break_even", "timeout", "no_touch", "no_confirmation", "ambiguous", "data_gap", "invalidated")
SCORABLE = {"target", "stop", "break_even", "timeout"}
LIQUIDITY_SIGNAL_DEFINITION = ("First touch of a confirmed external or internal liquidity line after the right-side "
                               "pivot bars close. BSL tests a short reversal; SSL tests a long reversal. "
                               "Compare target before stop within a frozen bar horizon.")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def required(value: object, field: str, limit: int = 500) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f"{field} is required (1–{limit} characters)")
    return value.strip()


def timestamp(value: object, field: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
    except ValueError as exc:
        raise ValueError(f"{field} must include a timezone") from exc
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def date_only(value: object, field: str) -> str:
    try:
        parsed = datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{field} must be a date in YYYY-MM-DD format") from exc
    return parsed.isoformat()


def selection(value: object, allowed: tuple[str, ...], field: str) -> list[str]:
    if not isinstance(value, list) or not value or len(value) != len(set(map(str, value))):
        raise ValueError(f"{field} needs one or more unique selections")
    if any(item not in allowed for item in value):
        raise ValueError(f"{field} contains an unsupported selection")
    return [item for item in allowed if item in value]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS experiments (
            id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL, spec_json TEXT NOT NULL,
            spec_hash TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
            frozen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS observations (
            experiment_id TEXT NOT NULL REFERENCES experiments(id), event_id TEXT NOT NULL,
            variant_id TEXT NOT NULL, timeframe TEXT NOT NULL, level_kind TEXT NOT NULL,
            session_id TEXT NOT NULL, signal_time TEXT NOT NULL, outcome_time TEXT NOT NULL,
            source_id TEXT NOT NULL, source_hash TEXT NOT NULL, input_hash TEXT NOT NULL,
            outcome TEXT NOT NULL, gross_r REAL, detail_json TEXT NOT NULL,
            row_hash TEXT NOT NULL, recorded_at TEXT NOT NULL,
            PRIMARY KEY(experiment_id,event_id,variant_id)
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id),
            report_hash TEXT NOT NULL, disposition TEXT NOT NULL, reviewer TEXT NOT NULL,
            rationale TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS science_run_events (
            id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL REFERENCES experiments(id),
            state TEXT NOT NULL, changed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS observations_experiment ON observations(experiment_id,timeframe,level_kind);
    """)
    db.commit()
    return db


def variant_id(entry: str, target: str, break_even: str) -> str:
    return f"{entry}:{target}:{break_even}"


def variants(spec: dict) -> list[str]:
    return [variant_id(entry, target, be) for entry in spec["entries"]
            for target in spec["targets"] for be in spec["break_evens"]]


def setup_context(chart_db: sqlite3.Connection, symbol: str) -> dict:
    """Read only local coverage. Dataset presence never establishes usage rights."""
    symbol = required(symbol, "symbol", 100)
    dataset_columns = {row[1] for row in chart_db.execute("PRAGMA table_info(datasets)")}
    retrieved_expr = "MAX(d.retrieved_at)" if "retrieved_at" in dataset_columns else "NULL"
    rows = chart_db.execute(f"""SELECT d.source,b.timeframe,COUNT(*) AS bars,
        MAX(b.time) AS last_bar_time,MAX(d.imported_at) AS last_imported_at,
        {retrieved_expr} AS last_retrieved_at
        FROM bars b JOIN datasets d USING(dataset_id) WHERE b.symbol=?
        GROUP BY d.source,b.timeframe ORDER BY d.source,b.timeframe""", (symbol,)).fetchall()
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    durations = {"4H": 14400, "1H": 3600, "30M": 1800, "15M": 900,
                 "5M": 300, "3M": 180, "1M": 60}
    sources: dict[str, dict] = {}
    for row in rows:
        if row["timeframe"] not in TIMEFRAMES:
            continue
        source = sources.setdefault(row["source"], {"source_id": row["source"], "timeframes": [], "bars": 0})
        last_bar = int(row["last_bar_time"])
        duration = durations[row["timeframe"]]
        source["timeframes"].append({"timeframe": row["timeframe"], "bars": row["bars"],
                                     "lastBarTime": datetime.fromtimestamp(last_bar, timezone.utc).isoformat(timespec="seconds"),
                                     "lastBarAgeSeconds": max(0, now_epoch - last_bar),
                                     "expectedBarEnd": datetime.fromtimestamp(last_bar + duration, timezone.utc).isoformat(timespec="seconds"),
                                     "barMayBeOpen": last_bar + duration > now_epoch,
                                     "lastImportedAt": row["last_imported_at"],
                                     "lastRetrievedAt": row["last_retrieved_at"]})
        source["bars"] += row["bars"]
    feed_states = {}
    if chart_db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='feed_state'").fetchone():
        feed_states = {row["timeframe"]: {"provider": row["provider"], "mode": row["mode"],
                                          "status": row["status"], "updatedAt": row["updated_at"],
                                          "lastBarTime": row["last_bar_time"], "message": row["message"]}
                       for row in chart_db.execute("SELECT * FROM feed_state WHERE symbol=?", (symbol,))}
    continuous = bool(re.search(r"\d+!$", symbol))
    return {"symbol": symbol, "methodVersion": f"{LIQUIDITY_METHOD_ID} / {LIQUIDITY_METHOD_VERSION}",
            "sources": list(sources.values()), "rightsState": "unverified",
            "contractState": "user_confirmation_required", "tickSizeState": "user_confirmation_required",
            "contractMappingState": "user_confirmation_required" if continuous else "unverified",
            "symbolKind": "continuous_series_alias" if continuous else "symbol_type_unverified",
            "feedStates": feed_states,
            "sessionPolicy": "UTC calendar day proxy; exchange session boundaries are not mapped",
            "rollPolicy": "Single dated contract only; contract expiry must be supplied and no roll is inferred",
            "note": "Bar timestamps and retrieval/import times show local history only. They do not prove the current feed, exact dated-contract mapping, completed future bars, or research rights."}


def create(db: sqlite3.Connection, payload: dict, chart_context: dict | None = None) -> dict:
    indicator_id = required(payload.get("indicator_id"), "indicator_id", 80)
    if indicator_id != "liquidity":
        raise ValueError("Automated signal definitions are currently available for Liquidity only")
    spec = {
        "indicator_id": indicator_id,
        "title": required(payload.get("title"), "title", 160),
        "method_version": required(payload.get("method_version"), "method_version", 100),
        "instrument": required(payload.get("instrument"), "instrument", 100),
        "dated_contract": (required(payload.get("dated_contract"), "dated_contract", 100)
                           if payload.get("dated_contract") else "UNCONFIRMED"),
        "contract_evidence": (required(payload.get("contract_evidence"), "contract_evidence", 500)
                              if payload.get("contract_evidence") else "UNCONFIRMED"),
        "contract_expiry_date": (date_only(payload.get("contract_expiry_date"), "contract_expiry_date")
                                 if payload.get("contract_expiry_date") else None),
        "contract_mapping_confirmed": payload.get("contract_mapping_confirmed") is True,
        "contract_mapping_note": required(payload.get("contract_mapping_note"), "contract_mapping_note", 1000),
        "source_id": required(payload.get("source_id"), "source_id", 200),
        "rights_note": required(payload.get("rights_note"), "rights_note", 1000),
        "rights_confirmed": payload.get("rights_confirmed") is True,
        "tick_size_source": (required(payload.get("tick_size_source"), "tick_size_source", 500)
                             if payload.get("tick_size_source") else "UNCONFIRMED"),
        "session_policy": "utc_calendar_day_proxy",
        "session_policy_confirmed": payload.get("session_policy_confirmed") is True,
        "roll_policy": "single_dated_contract_no_automatic_roll",
        "scientist": required(payload.get("scientist"), "scientist", 120),
        "signal_definition": required(payload.get("signal_definition"), "signal_definition", 1000),
        "timeframes": selection(payload.get("timeframes"), TIMEFRAMES, "timeframes"),
        "level_kinds": selection(payload.get("level_kinds"), KINDS, "level_kinds"),
        "entries": selection(payload.get("entries"), ENTRIES, "entries"),
        "targets": selection(payload.get("targets"), TARGETS, "targets"),
        "break_evens": selection(payload.get("break_evens"), BREAK_EVENS, "break_evens"),
        "report_cadence": "daily_status_weekly_review",
        "baseline_probability": 0.5,
        "minimum_gain": 0.03,
        "primary_outcome": "target_before_stop_within_horizon",
        "baseline_variant": variant_id("first_touch", "opposite_liquidity", "none"),
        "primary_candidate_variant": required(payload.get("primary_candidate_variant"), "primary_candidate_variant", 120),
        "sample_plan": "30 resolved pilot per cohort; 200 resolved per cohort for descriptive review; formal promotion requires a preregistered paired power plan, 95% lower bound above +3 percentage points, coverage and guardrails.",
        "cutoff_rule": "Confirmed pivot becomes knowable only after its final right-side bar closes. First eligible touch must occur on a later completed bar. No future bar can define the signal or target.",
    }
    source_context = next((source for source in (chart_context or {}).get("sources", [])
                           if source["source_id"] == spec["source_id"]), None)
    covered_timeframes = [row["timeframe"] for row in (source_context or {}).get("timeframes", [])]
    missing_timeframes = [timeframe for timeframe in TIMEFRAMES if timeframe not in covered_timeframes]
    spec["source_readiness"] = {
        "source_found_for_symbol": source_context is not None,
        "symbol_kind": (chart_context or {}).get("symbolKind", "unknown"),
        "covered_timeframes": [timeframe for timeframe in TIMEFRAMES if timeframe in covered_timeframes],
        "missing_timeframes": missing_timeframes,
        "observed_coverage": source_context.get("timeframes", []) if source_context else [],
        "future_updates_verified": False,
        "note": "Coverage is historical local storage. Future feed continuity, exact source-to-contract mapping, and rights remain separate gates.",
    }
    if spec["method_version"] != f"{LIQUIDITY_METHOD_ID} / {LIQUIDITY_METHOD_VERSION}":
        raise ValueError("Liquidity study must use the implemented liquidity-map-v1 / 1.0.0 method")
    if (spec["contract_expiry_date"] and
            datetime.strptime(spec["contract_expiry_date"], "%Y-%m-%d").date() <= datetime.now(timezone.utc).date()):
        raise ValueError("The dated contract expiry must be in the future for a forward measurement")
    if spec["signal_definition"] != LIQUIDITY_SIGNAL_DEFINITION:
        raise ValueError("This Liquidity observer requires its implemented first-touch signal definition")
    if spec["timeframes"] != list(TIMEFRAMES) or spec["level_kinds"] != list(KINDS):
        raise ValueError("The first Liquidity study requires all seven timeframes and both line classes")
    for key in ("external_length", "internal_length"):
        try:
            value = int(payload.get(key))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a whole number between 1 and 100") from exc
        if not 1 <= value <= 100:
            raise ValueError(f"{key} must be between 1 and 100")
        spec[key] = value
    try:
        convergence = float(payload.get("convergence_atr"))
    except (TypeError, ValueError) as exc:
        raise ValueError("convergence_atr must be between 0.01 and 2") from exc
    if not math.isfinite(convergence) or not 0.01 <= convergence <= 2:
        raise ValueError("convergence_atr must be between 0.01 and 2")
    spec["convergence_atr"] = convergence
    if spec["baseline_variant"] not in variants(spec):
        raise ValueError("Include first touch, opposite liquidity, and no break-even as the comparator")
    if spec["primary_candidate_variant"] not in variants(spec) or spec["primary_candidate_variant"] == spec["baseline_variant"]:
        raise ValueError("Choose one distinct primary candidate from the frozen variants")
    for key in ("tick_size", "stop_ticks"):
        if key == "tick_size" and payload.get(key) in (None, ""):
            spec[key] = None
            continue
        try:
            value = float(payload.get(key))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a positive number") from exc
        if not math.isfinite(value) or value <= 0 or value > 10000:
            raise ValueError(f"{key} must be a positive number")
        spec[key] = value
    try:
        horizon = int(payload.get("horizon_bars"))
    except (TypeError, ValueError) as exc:
        raise ValueError("horizon_bars must be a whole number") from exc
    if not 1 <= horizon <= 500:
        raise ValueError("horizon_bars must be between 1 and 500")
    spec["horizon_bars"] = horizon
    rights_ready = spec["rights_confirmed"]
    mapping_ready = spec["contract_mapping_confirmed"]
    session_ready = spec["session_policy_confirmed"]
    coverage_ready = source_context is not None and not missing_timeframes
    readiness_blockers = []
    if spec["dated_contract"] == "UNCONFIRMED": readiness_blockers.append("dated_contract_unconfirmed")
    if spec["contract_evidence"] == "UNCONFIRMED": readiness_blockers.append("contract_reference_unconfirmed")
    if not spec["contract_expiry_date"]: readiness_blockers.append("contract_expiry_unconfirmed")
    if spec["tick_size"] is None: readiness_blockers.append("tick_size_unconfirmed")
    if spec["tick_size_source"] == "UNCONFIRMED": readiness_blockers.append("tick_size_reference_unconfirmed")
    if not rights_ready: readiness_blockers.append("source_rights_unconfirmed")
    if not mapping_ready: readiness_blockers.append("contract_mapping_unconfirmed")
    if not coverage_ready: readiness_blockers.append("stored_source_coverage_incomplete")
    if not session_ready: readiness_blockers.append("session_proxy_unconfirmed")
    spec["readiness_blockers"] = readiness_blockers
    item = {"id": uuid.uuid4().hex, "indicator_id": indicator_id,
            "spec_json": json.dumps(spec, sort_keys=True), "spec_hash": digest(spec),
            "state": ("armed" if not readiness_blockers
                      else "blocked_rights" if not rights_ready else "blocked_readiness"),
            "created_at": now(), "frozen_at": now()}
    db.execute("INSERT INTO experiments VALUES (:id,:indicator_id,:spec_json,:spec_hash,:state,:created_at,:frozen_at)", item)
    db.commit()
    return public(item)


def public(row: dict | sqlite3.Row) -> dict:
    item = dict(row)
    item["spec"] = json.loads(item.pop("spec_json"))
    return item


def get(db: sqlite3.Connection, experiment_id: str) -> dict:
    row = db.execute("SELECT * FROM experiments WHERE id=?", (experiment_id,)).fetchone()
    if row is None:
        raise ValueError("Unknown experiment ID")
    item = public(row)
    item["run_started_at"] = collection_cutoff(db, item) if item["state"] == "armed" else None
    return item


def collection_cutoff(db: sqlite3.Connection, experiment: dict) -> str:
    row = db.execute("""SELECT changed_at FROM science_run_events
        WHERE experiment_id=? AND state='armed' ORDER BY changed_at DESC,id DESC LIMIT 1""",
        (experiment["id"],)).fetchone()
    return row[0] if row else experiment["frozen_at"]


def set_running(db: sqlite3.Connection, payload: dict) -> dict:
    experiment_id = required(payload.get("experiment_id"), "experiment_id", 40)
    running = payload.get("running")
    if type(running) is not bool:
        raise ValueError("running must be true or false")
    exp = get(db, experiment_id)
    if exp["state"] in {"blocked_rights", "blocked_readiness"}:
        blockers = ", ".join(exp["spec"].get("readiness_blockers", [])) or "source_rights_unconfirmed"
        raise ValueError(f"This frozen study is blocked: {blockers}. Register a new study after resolving its gates")
    wanted = "armed" if running else "paused"
    if exp["state"] == wanted:
        return exp
    changed_at = now()
    if not running:
        # Pending paper trials cannot be scored across a deliberate observation pause.
        table = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='science_trials'").fetchone()
        if table:
            pending = db.execute("""SELECT * FROM science_trials WHERE experiment_id=?
                AND state IN ('open','pending_entry')""", (experiment_id,)).fetchall()
            for trial in pending:
                ingest(db, {"experiment_id": experiment_id, "observations": [{
                    "event_id": trial["event_id"], "variant_id": trial["variant_id"],
                    "timeframe": trial["timeframe"], "level_kind": trial["level_kind"],
                    "session_id": trial["session_id"], "signal_time": trial["signal_time"],
                    "outcome_time": changed_at, "source_id": trial["source_id"],
                    "source_hash": trial["source_hash"], "input_hash": trial["input_hash"],
                    "outcome": "data_gap", "gross_r": None,
                    "detail": {"reason": "user_paused_experiment"},
                }]})
            db.execute("""UPDATE science_trials SET state='resolved' WHERE experiment_id=?
                AND state IN ('open','pending_entry')""", (experiment_id,))
    db.execute("UPDATE experiments SET state=? WHERE id=?", (wanted, experiment_id))
    db.execute("INSERT INTO science_run_events VALUES (?,?,?,?)",
               (uuid.uuid4().hex, experiment_id, wanted, changed_at))
    db.commit()
    return get(db, experiment_id)


def list_experiments(db: sqlite3.Connection) -> dict:
    rows = [public(row) for row in db.execute("SELECT * FROM experiments ORDER BY created_at DESC,id DESC")]
    for row in rows:
        row["observations"] = db.execute("SELECT COUNT(*) FROM observations WHERE experiment_id=?", (row["id"],)).fetchone()[0]
        row["run_started_at"] = collection_cutoff(db, row) if row["state"] == "armed" else None
    return {"experiments": rows, "agentRuntime": "not_dispatched", "dataMode": "local_paper_research"}


def ingest(db: sqlite3.Connection, payload: dict) -> dict:
    experiment_id = required(payload.get("experiment_id"), "experiment_id", 40)
    exp = get(db, experiment_id)
    if exp["state"] != "armed":
        raise ValueError("Source rights must be confirmed before observations are accepted")
    rows = payload.get("observations")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2000:
        raise ValueError("observations must contain 1–2000 rows")
    spec = exp["spec"]
    prepared = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Each observation must be an object")
        timeframe = required(row.get("timeframe"), "timeframe", 10)
        kind = required(row.get("level_kind"), "level_kind", 10)
        variant = required(row.get("variant_id"), "variant_id", 120)
        if timeframe not in spec["timeframes"] or kind not in spec["level_kinds"] or variant not in variants(spec):
            raise ValueError("Observation is outside the frozen cohort or variant matrix")
        source_id = required(row.get("source_id"), "source_id", 200)
        if source_id != spec["source_id"]:
            raise ValueError("Observation source does not match the frozen source")
        signal_time = timestamp(row.get("signal_time"), "signal_time")
        outcome_time = timestamp(row.get("outcome_time"), "outcome_time")
        outcome = required(row.get("outcome"), "outcome", 30)
        if outcome not in OUTCOMES:
            raise ValueError("Unsupported outcome")
        if signal_time <= exp["frozen_at"] or outcome_time < signal_time or (outcome in SCORABLE and outcome_time == signal_time):
            raise ValueError("Forward signal and later scorable outcome times are required")
        gross_r = row.get("gross_r")
        if gross_r is not None and (type(gross_r) not in (int, float) or not math.isfinite(gross_r)):
            raise ValueError("gross_r must be finite or null")
        hashes = {}
        for key in ("source_hash", "input_hash"):
            value = required(row.get(key), key, 64).lower()
            if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
                raise ValueError(f"{key} must be SHA-256")
            hashes[key] = value
        detail = row.get("detail") or {}
        if not isinstance(detail, dict) or len(json.dumps(detail)) > 6000:
            raise ValueError("detail must be a bounded object")
        item = {"experiment_id": experiment_id,
                "event_id": required(row.get("event_id"), "event_id", 160),
                "variant_id": variant, "timeframe": timeframe, "level_kind": kind,
                "session_id": required(row.get("session_id"), "session_id", 120),
                "signal_time": signal_time, "outcome_time": outcome_time,
                "source_id": source_id, **hashes, "outcome": outcome,
                "gross_r": gross_r, "detail_json": json.dumps(detail, sort_keys=True),
                "recorded_at": now()}
        item["row_hash"] = digest(item)
        prepared.append(item)
    try:
        with db:
            db.executemany("""INSERT INTO observations VALUES (
                :experiment_id,:event_id,:variant_id,:timeframe,:level_kind,
                :session_id,:signal_time,:outcome_time,:source_id,:source_hash,
                :input_hash,:outcome,:gross_r,:detail_json,:row_hash,:recorded_at)""", prepared)
    except sqlite3.IntegrityError as exc:
        raise ValueError("Observation already exists; the evidence ledger is append-only") from exc
    return {"accepted": len(prepared), "rowHashes": [row["row_hash"] for row in prepared]}


def wilson(hits: int, n: int) -> list[float] | None:
    if n == 0:
        return None
    z = 1.959963984540054
    p = hits / n
    d = 1 + z*z/n
    center = (p + z*z/(2*n))/d
    radius = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))/d
    return [max(0, center-radius), min(1, center+radius)]


def report(db: sqlite3.Connection, experiment_id: str) -> dict:
    exp = get(db, experiment_id)
    rows = [dict(row) for row in db.execute("SELECT * FROM observations WHERE experiment_id=? ORDER BY signal_time,event_id,variant_id", (experiment_id,))]
    groups = defaultdict(list)
    for row in rows:
        groups[(row["timeframe"], row["level_kind"], row["variant_id"])].append(row)
    cohorts = []
    for (timeframe, kind, variant), group in sorted(groups.items()):
        counts = {outcome: sum(row["outcome"] == outcome for row in group) for outcome in OUTCOMES}
        n = sum(counts[outcome] for outcome in SCORABLE)
        hits = counts["target"]
        cohorts.append({"timeframe": timeframe, "levelKind": kind, "variantId": variant,
                        "signals": len(group), "resolved": n, "hits": hits,
                        "hitRate": hits/n if n else None, "wilson95": wilson(hits, n),
                        "outcomes": counts, "grossMeanR": sum(row["gross_r"] for row in group if row["gross_r"] is not None)/sum(row["gross_r"] is not None for row in group) if any(row["gross_r"] is not None for row in group) else None,
                        "studyState": "not_measured" if not n else "pilot" if n < 30 else "descriptive" if n < 200 else "review_required"})
    spec = exp["spec"]
    matched = defaultdict(dict)
    for row in rows:
        if row["variant_id"] in {spec["baseline_variant"], spec["primary_candidate_variant"]} and row["outcome"] in SCORABLE:
            matched[(row["timeframe"], row["level_kind"], row["event_id"])][row["variant_id"]] = row
    paired = [(key[0], key[1], a[spec["baseline_variant"]], a[spec["primary_candidate_variant"]])
              for key, a in matched.items() if len(a) == 2]
    def comparison_for(group: list[tuple], label: str) -> dict:
        differences = [(base["session_id"], int(candidate["outcome"] == "target") - int(base["outcome"] == "target"))
                       for _, _, base, candidate in group]
        n = len(differences)
        point = sum(value for _, value in differences)/n if n else None
        by_session = defaultdict(list)
        for session, value in differences:
            by_session[session].append(value)
        interval = None
        if len(by_session) >= 2:
            clusters = list(by_session.values())
            rng = random.Random(int(hashlib.sha256((experiment_id+label).encode()).hexdigest()[:16], 16))
            draws = []
            for _ in range(1000):
                sampled = [value for _ in clusters for value in clusters[rng.randrange(len(clusters))]]
                draws.append(sum(sampled)/len(sampled))
            draws.sort()
            interval = [draws[24], draws[974]]
        return {"pairedResolved": n, "sessions": len(by_session), "pointDifference": point,
                "approximate95": interval,
                "state": "not_measured" if not n else "pilot" if n < 30 else
                "descriptive" if n < 200 else
                "threshold_not_established" if interval is None or interval[0] < spec["minimum_gain"] else
                "candidate_for_independent_review"}
    comparison = {"baselineVariant": spec["baseline_variant"],
                  "candidateVariant": spec["primary_candidate_variant"],
                  **comparison_for(paired, "pooled"),
                  "intervalMethod": "Descriptive session-cluster bootstrap, 1000 resamples; no multiple-comparison or promotion claim",
                  "minimumGain": spec["minimum_gain"]}
    cohort_comparisons = []
    for timeframe in spec["timeframes"]:
        for kind in spec["level_kinds"]:
            cohort = [item for item in paired if item[0] == timeframe and item[1] == kind]
            cohort_comparisons.append({"timeframe": timeframe, "levelKind": kind,
                                       **comparison_for(cohort, f"{timeframe}:{kind}")})
    result = {"experiment": exp, "observations": len(rows), "cohorts": cohorts,
              "primaryComparison": comparison, "cohortComparisons": cohort_comparisons,
              "sourceManifestHash": digest([row["row_hash"] for row in rows]),
              "scientificStatus": "not_measured" if not rows else "descriptive_review_required",
              "limitations": ["50% is an unmeasured display prior, not a verified hit rate.",
                              "Source rights and labels are user asserted until independently checked.",
                              "No agent dispatch, broker fills, or code promotion is implied by this ledger."],
              "generatedAt": now()}
    result["reportHash"] = digest({key: value for key, value in result.items() if key != "generatedAt"})
    return result


def upgrade_brief(db: sqlite3.Connection, experiment_id: str) -> dict:
    result = report(db, experiment_id)
    spec = result["experiment"]["spec"]
    ranked = sorted((c for c in result["cohorts"] if c["hitRate"] is not None),
                    key=lambda c: (c["resolved"], c["signals"]), reverse=True)
    best = ranked[0] if ranked else None
    findings = (f"The largest resolved cohort is {best['timeframe']} {best['levelKind']} {best['variantId']} "
                f"with {best['hits']}/{best['resolved']} target-before-stop outcomes. This is descriptive, not an accepted upgrade."
                if best else "No resolved forward observations. The 50% mark remains an unmeasured prior.")
    requirements = ("Freeze one candidate change and an accepted baseline; compare paired forward events on the same "
                    "source, contract, timeframe, line class, entry, target, break-even rule, and cutoff. "
                    "Report coverage, ambiguities, Wilson intervals, calibrated probabilities, gross and net R when costs are verified. "
                    "Require a preregistered power plan and a 95% lower bound above +3 percentage points before considering promotion. "
                    "Retain the incumbent and rollback path until Scientist, independent reviewer, and human validation accept the evidence.")
    prompt = (f"Batty: draft a candidate upgrade for {spec['indicator_id']} method {spec['method_version']} "
              f"using experiment {experiment_id} and report SHA-256 {result['reportHash']}. "
              f"Hypothesis: {findings} Frozen primary candidate: {spec['primary_candidate_variant']} "
              f"versus {spec['baseline_variant']}. Scope: change one signal rule only. Requirements: {requirements} "
              "Build in a new version, preserve the accepted version, document source/cutoff and repaint behavior, "
              "and return a diff, tests, chart screenshots, and a rollback reference. Do not deploy or claim a gain from this prompt.")
    return {"reportHash": result["reportHash"], "findings": findings,
            "requirements": requirements, "battyPrompt": prompt,
            "recommendation": "collect_forward_evidence" if not best or best["resolved"] < 200 else "independent_review"}


def record_review(db: sqlite3.Connection, payload: dict) -> dict:
    experiment_id = required(payload.get("experiment_id"), "experiment_id", 40)
    result = report(db, experiment_id)
    if required(payload.get("report_hash"), "report_hash", 64) != result["reportHash"]:
        raise ValueError("Report changed; refresh before recording the review")
    disposition = required(payload.get("disposition"), "disposition", 40)
    if disposition not in {"retain", "investigate", "return", "reject", "propose_upgrade"}:
        raise ValueError("Unsupported disposition")
    item = {"id": uuid.uuid4().hex, "experiment_id": experiment_id,
            "report_hash": result["reportHash"], "disposition": disposition,
            "reviewer": required(payload.get("reviewer"), "reviewer", 120),
            "rationale": required(payload.get("rationale"), "rationale", 3000),
            "created_at": now()}
    db.execute("INSERT INTO reviews VALUES (:id,:experiment_id,:report_hash,:disposition,:reviewer,:rationale,:created_at)", item)
    db.commit()
    return {**item, "authorityNote": "Local assertion only; independent identity and promotion are not verified"}

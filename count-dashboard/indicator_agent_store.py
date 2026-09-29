"""Append-only local research ledger for single-purpose indicator experiments.

Inputs and role names are supplied locally. This module cannot verify data rights,
authenticate scientists, dispatch agents, or promote chart code.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

CATALOG = (
    ("volume-profile", "Volume Profile", "Historical volume distribution", "descriptive"),
    ("fibonacci", "Fibonacci", "Retracement levels from selected swings", "unscored"),
    ("liquidity-zones", "Liquidity Zones", "Research zones around swept levels", "unscored"),
    ("daily-bias", "Daily Bias", "Provisional context from prior sweeps", "unscored"),
    ("elliott-wave", "Elliott Wave", "Provisional counts and path structure", "unscored"),
    ("confirmed-swings", "Confirmed Swings", "Confirmed pivots in stored bars", "unscored"),
    ("confluence", "Confluence", "Alignment of chart structures", "unscored"),
    ("premium-discount", "Premium / Discount", "Zones inside a selected swing", "unscored"),
)
IDS = {row[0] for row in CATALOG}
METRICS = {"event": {"precision", "recall", "f1", "accuracy"}, "numeric": {"mae", "rmse"}}
DECISIONS = {"retain", "investigate", "advance_candidate", "quarantine", "revert"}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest(value):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def required(payload, key, limit=500):
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f"{key} is required (1–{limit} characters)")
    return value.strip()


def utc(value, key):
    if not isinstance(value, str):
        raise ValueError(f"{key} must be an ISO timestamp with timezone")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{key} must be an ISO timestamp with timezone") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{key} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS protocols (
            id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL, title TEXT NOT NULL,
            purpose TEXT NOT NULL, output_definition TEXT NOT NULL, metric_type TEXT NOT NULL,
            primary_metric TEXT NOT NULL, outcome_definition TEXT NOT NULL,
            baseline_version TEXT NOT NULL, candidate_version TEXT NOT NULL,
            source_id TEXT NOT NULL, rights_note TEXT NOT NULL, instrument TEXT NOT NULL,
            timeframe TEXT NOT NULL, cutoff_rule TEXT NOT NULL, sample_plan TEXT NOT NULL,
            min_rows INTEGER NOT NULL, min_effect REAL NOT NULL, guardrails TEXT NOT NULL,
            scientist TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
            frozen_at TEXT, protocol_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS observations (
            protocol_id TEXT NOT NULL REFERENCES protocols(id), observation_id TEXT NOT NULL,
            session_id TEXT NOT NULL, source_id TEXT NOT NULL, source_asof TEXT NOT NULL,
            decision_cutoff TEXT NOT NULL, outcome_time TEXT NOT NULL, input_hash TEXT NOT NULL,
            truth REAL NOT NULL, incumbent REAL NOT NULL, candidate REAL NOT NULL,
            recorded_at TEXT NOT NULL, row_hash TEXT NOT NULL,
            PRIMARY KEY(protocol_id, observation_id)
        );
        CREATE TABLE IF NOT EXISTS decisions (
            id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL REFERENCES protocols(id),
            actor TEXT NOT NULL, decision TEXT NOT NULL, rationale TEXT NOT NULL,
            report_hash TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL, protocol_id TEXT,
            title TEXT NOT NULL, hypothesis TEXT NOT NULL, expected_gain TEXT NOT NULL,
            build_spec TEXT NOT NULL, rollback_version TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(protocol_id) REFERENCES protocols(id)
        );
        CREATE TABLE IF NOT EXISTS proposal_events (
            id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES proposals(id),
            stage TEXT NOT NULL, actor TEXT NOT NULL, evidence TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)
    db.commit()
    return db


def catalog(db):
    counts = {row["indicator_id"]: row["n"] for row in db.execute(
        "SELECT indicator_id,COUNT(*) AS n FROM protocols GROUP BY indicator_id")}
    return {"mode": "local_paper_research", "agentRuntime": "not_dispatched", "indicators": [
        {"id": ident, "name": name, "provisionalPurpose": purpose,
         "scoringState": status, "protocolCount": counts.get(ident, 0)}
        for ident, name, purpose, status in CATALOG]}


def create_protocol(db, payload):
    indicator_id = required(payload, "indicator_id", 80)
    if indicator_id not in IDS:
        raise ValueError("Unknown indicator ID")
    kind = required(payload, "metric_type", 20)
    metric = required(payload, "primary_metric", 20)
    if kind not in METRICS or metric not in METRICS[kind]:
        raise ValueError("Choose a supported metric for the measurement type")
    minimum, effect = payload.get("min_rows"), payload.get("min_effect")
    if type(minimum) is not int or not 2 <= minimum <= 1_000_000:
        raise ValueError("min_rows must be an integer between 2 and 1,000,000")
    if type(effect) not in (int, float) or not math.isfinite(effect) or effect < 0:
        raise ValueError("min_effect must be finite and nonnegative")
    fields = {key: required(payload, key, limit) for key, limit in (
        ("title", 160), ("purpose", 500), ("output_definition", 1000),
        ("outcome_definition", 1000), ("baseline_version", 100),
        ("candidate_version", 100), ("source_id", 200), ("rights_note", 1000),
        ("instrument", 100), ("timeframe", 50), ("cutoff_rule", 1000),
        ("sample_plan", 1500), ("guardrails", 1500), ("scientist", 120))}
    if fields["baseline_version"] == fields["candidate_version"]:
        raise ValueError("Baseline and candidate versions must differ")
    item = {"id": uuid.uuid4().hex, "indicator_id": indicator_id, "metric_type": kind,
            "primary_metric": metric, "min_rows": minimum, "min_effect": float(effect), **fields}
    item["protocol_hash"] = digest(item)
    item.update(state="draft", created_at=now(), frozen_at=None)
    db.execute("""INSERT INTO protocols VALUES (
        :id,:indicator_id,:title,:purpose,:output_definition,:metric_type,:primary_metric,
        :outcome_definition,:baseline_version,:candidate_version,:source_id,:rights_note,
        :instrument,:timeframe,:cutoff_rule,:sample_plan,:min_rows,:min_effect,
        :guardrails,:scientist,:state,:created_at,:frozen_at,:protocol_hash)""", item)
    db.commit()
    return item


def list_protocols(db):
    return {"protocols": [dict(row) for row in db.execute(
        "SELECT * FROM protocols ORDER BY created_at DESC,id DESC")]}


def protocol(db, protocol_id):
    row = db.execute("SELECT * FROM protocols WHERE id=?", (protocol_id,)).fetchone()
    if row is None:
        raise ValueError("Unknown protocol ID")
    return dict(row)


def freeze_protocol(db, payload):
    ident = required(payload, "protocol_id", 40)
    scientist = required(payload, "scientist", 120)
    item = protocol(db, ident)
    if item["state"] != "draft":
        raise ValueError("Only a draft protocol can be frozen")
    if scientist != item["scientist"]:
        raise ValueError("Scientist name must match the protocol record")
    frozen_at = now()
    db.execute("UPDATE protocols SET state='frozen',frozen_at=? WHERE id=?", (frozen_at, ident))
    db.commit()
    return {**item, "state": "frozen", "frozen_at": frozen_at,
            "authorityNote": "Local assertion only; no authenticated Scientist dispatch"}


def ingest(db, payload):
    ident = required(payload, "protocol_id", 40)
    item = protocol(db, ident)
    if item["state"] != "frozen":
        raise ValueError("Freeze the protocol before recording observations")
    rows = payload.get("observations")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 5000:
        raise ValueError("observations must contain 1–5000 rows")
    prepared, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Each observation must be an object")
        obs_id = required(row, "observation_id", 120)
        if obs_id in seen:
            raise ValueError(f"Duplicate observation_id in upload: {obs_id}")
        seen.add(obs_id)
        source_id = required(row, "source_id", 200)
        if source_id != item["source_id"]:
            raise ValueError(f"Source mismatch for {obs_id}")
        cutoff = utc(row.get("decision_cutoff"), "decision_cutoff")
        outcome = utc(row.get("outcome_time"), "outcome_time")
        asof = utc(row.get("source_asof"), "source_asof")
        if outcome <= cutoff:
            raise ValueError(f"Outcome must follow cutoff for {obs_id}")
        if asof > cutoff:
            raise ValueError(f"Input source was not available at cutoff for {obs_id}")
        values = [row.get(key) for key in ("truth", "incumbent", "candidate")]
        if item["metric_type"] == "event":
            if any(type(value) is not bool for value in values):
                raise ValueError(f"Event values must be booleans for {obs_id}")
        elif any(type(value) not in (int, float) or not math.isfinite(value) for value in values):
            raise ValueError(f"Numeric values must be finite for {obs_id}")
        source_hash = required(row, "input_hash", 128).lower()
        if len(source_hash) != 64 or any(char not in "0123456789abcdef" for char in source_hash):
            raise ValueError(f"input_hash must be SHA-256 for {obs_id}")
        clean = {"protocol_id": ident, "observation_id": obs_id,
                 "session_id": required(row, "session_id", 120), "source_id": source_id,
                 "source_asof": asof, "decision_cutoff": cutoff, "outcome_time": outcome,
                 "input_hash": source_hash, "truth": float(values[0]),
                 "incumbent": float(values[1]), "candidate": float(values[2]),
                 "recorded_at": now()}
        clean["row_hash"] = digest(clean)
        prepared.append(clean)
    try:
        with db:
            db.executemany("""INSERT INTO observations VALUES (
                :protocol_id,:observation_id,:session_id,:source_id,:source_asof,
                :decision_cutoff,:outcome_time,:input_hash,:truth,:incumbent,
                :candidate,:recorded_at,:row_hash)""", prepared)
    except sqlite3.IntegrityError as exc:
        raise ValueError("An observation ID already exists; records are append-only") from exc
    return {"accepted": len(prepared), "protocol_id": ident,
            "row_hashes": [row["row_hash"] for row in prepared]}


def metric_value(rows, kind, metric, field):
    if not rows:
        return None
    if kind == "numeric":
        errors = [abs(row[field] - row["truth"]) for row in rows]
        return sum(errors) / len(errors) if metric == "mae" else math.sqrt(sum(x*x for x in errors) / len(errors))
    tp = sum(row[field] == 1 and row["truth"] == 1 for row in rows)
    fp = sum(row[field] == 1 and row["truth"] == 0 for row in rows)
    fn = sum(row[field] == 0 and row["truth"] == 1 for row in rows)
    if metric == "precision":
        return tp/(tp+fp) if tp+fp else None
    if metric == "recall":
        return tp/(tp+fn) if tp+fn else None
    if metric == "f1":
        return 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None
    return sum(row[field] == row["truth"] for row in rows)/len(rows)


def improvement(rows, kind, metric):
    base = metric_value(rows, kind, metric, "incumbent")
    candidate = metric_value(rows, kind, metric, "candidate")
    if base is None or candidate is None:
        return None
    return base-candidate if kind == "numeric" else candidate-base


def report(db, protocol_id):
    spec = protocol(db, protocol_id)
    rows = [dict(row) for row in db.execute(
        "SELECT * FROM observations WHERE protocol_id=? ORDER BY decision_cutoff,observation_id", (protocol_id,))]
    kind, metric = spec["metric_type"], spec["primary_metric"]
    sessions, days = defaultdict(list), defaultdict(list)
    for row in rows:
        sessions[row["session_id"]].append(row)
        days[row["decision_cutoff"][:10]].append(row)
    delta = improvement(rows, kind, metric)
    interval = None
    if len(sessions) >= 2 and delta is not None:
        groups = list(sessions.values())
        rng = random.Random(int(hashlib.sha256(protocol_id.encode()).hexdigest()[:16], 16))
        samples = []
        for _ in range(1000):
            sampled = [row for _ in groups for row in groups[rng.randrange(len(groups))]]
            value = improvement(sampled, kind, metric)
            if value is not None:
                samples.append(value)
        if len(samples) >= 100:
            samples.sort()
            interval = [samples[int(.025*(len(samples)-1))], samples[int(.975*(len(samples)-1))]]
    daily = [{"date": day, "rows": len(group),
              "incumbent": metric_value(group, kind, metric, "incumbent"),
              "candidate": metric_value(group, kind, metric, "candidate"),
              "improvement": improvement(group, kind, metric)}
             for day, group in sorted(days.items())]
    decision = db.execute("SELECT * FROM decisions WHERE protocol_id=? ORDER BY created_at DESC,id DESC LIMIT 1", (protocol_id,)).fetchone()
    result = {"protocol": spec, "scorableRows": len(rows), "sessions": len(sessions),
              "primaryMetric": metric, "metricType": kind,
              "incumbent": metric_value(rows, kind, metric, "incumbent"),
              "candidate": metric_value(rows, kind, metric, "candidate"),
              "improvement": delta, "improvementDirection": "positive is better",
              "clusterBootstrap95": interval,
              "intervalMethod": "Descriptive session-cluster bootstrap, 1000 resamples; not a promotion test",
              "minRows": spec["min_rows"], "minEffect": spec["min_effect"], "daily": daily,
              "lastDecision": dict(decision) if decision else None,
              "rowManifestHash": digest([row["row_hash"] for row in rows]),
              "generatedAt": now(),
              "scientificStatus": "not_measured" if not rows else
              "below_preregistered_sample" if len(rows) < spec["min_rows"] else "scientist_review_required",
              "limitations": ["Human-supplied labels and source claims are not independently verified.",
                              "No live market access, broker fills, or automated specialist dispatch."]}
    result["reportHash"] = digest({key: value for key, value in result.items() if key != "generatedAt"})
    return result


def record_decision(db, payload):
    ident = required(payload, "protocol_id", 40)
    spec = protocol(db, ident)
    scientist = required(payload, "scientist", 120)
    if scientist != spec["scientist"]:
        raise ValueError("Scientist name must match the protocol record")
    decision = required(payload, "decision", 40)
    if decision not in DECISIONS:
        raise ValueError("Unknown scientific decision")
    rationale = required(payload, "rationale", 3000)
    current = report(db, ident)
    if decision == "advance_candidate" and (
        current["scientificStatus"] != "scientist_review_required"
        or current["improvement"] is None
        or current["improvement"] < current["minEffect"]
    ):
        raise ValueError("Candidate has not met the registered sample and minimum effect for advancement")
    if required(payload, "report_hash", 64) != current["reportHash"]:
        raise ValueError("Report changed; refresh before recording a decision")
    item = {"id": uuid.uuid4().hex, "protocol_id": ident, "actor": scientist,
            "decision": decision, "rationale": rationale,
            "report_hash": current["reportHash"], "created_at": now()}
    db.execute("INSERT INTO decisions VALUES (:id,:protocol_id,:actor,:decision,:rationale,:report_hash,:created_at)", item)
    db.commit()
    return {**item, "authorityNote": "Local assertion; identity and independent review are not verified"}


def create_proposal(db, payload):
    indicator_id = required(payload, "indicator_id", 80)
    if indicator_id not in IDS:
        raise ValueError("Unknown indicator ID")
    protocol_id = str(payload.get("protocol_id") or "").strip() or None
    if protocol_id and protocol(db, protocol_id)["indicator_id"] != indicator_id:
        raise ValueError("Protocol belongs to another indicator")
    item = {"id": uuid.uuid4().hex, "indicator_id": indicator_id,
            "protocol_id": protocol_id,
            "title": required(payload, "title", 160),
            "hypothesis": required(payload, "hypothesis", 1500),
            "expected_gain": required(payload, "expected_gain", 1000),
            "build_spec": required(payload, "build_spec", 3000),
            "rollback_version": required(payload, "rollback_version", 100),
            "created_at": now()}
    db.execute("""INSERT INTO proposals VALUES
        (:id,:indicator_id,:protocol_id,:title,:hypothesis,:expected_gain,
        :build_spec,:rollback_version,:created_at)""", item)
    db.commit()
    return item


def list_proposals(db):
    items = [dict(row) for row in db.execute("SELECT * FROM proposals ORDER BY created_at DESC,id DESC")]
    for item in items:
        item["events"] = [dict(row) for row in db.execute(
            "SELECT * FROM proposal_events WHERE proposal_id=? ORDER BY created_at,id", (item["id"],))]
    return {"proposals": items}


def record_proposal_event(db, payload):
    proposal_id = required(payload, "proposal_id", 40)
    if not db.execute("SELECT 1 FROM proposals WHERE id=?", (proposal_id,)).fetchone():
        raise ValueError("Unknown proposal ID")
    stage = required(payload, "stage", 40)
    if stage not in {"build", "test", "lab_review", "human_validation", "retest", "close", "revert"}:
        raise ValueError("Unknown proposal stage")
    item = {"id": uuid.uuid4().hex, "proposal_id": proposal_id, "stage": stage,
            "actor": required(payload, "actor", 120),
            "evidence": required(payload, "evidence", 3000), "created_at": now()}
    db.execute("INSERT INTO proposal_events VALUES (:id,:proposal_id,:stage,:actor,:evidence,:created_at)", item)
    db.commit()
    return item

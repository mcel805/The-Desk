#!/usr/bin/env python3
"""Batty MYM/MCL/MGC liquidity-zone forward research lab.

This local-only service records immutable TradingView forecasts, resolves
paper/shadow trials from chronological ticks or bars, and serves a compact
statistical dashboard. It never routes live orders.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import html
import json
import math
import mimetypes
import os
import random
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DEFAULT_DB = ROOT / "data" / "liquidity-lab.sqlite3"
PROTOCOL_PATH = ROOT / "protocol-v0.1.json"
COUNT_DESK_DB = ROOT.parent / "count-dashboard" / "data" / "batty-counts.sqlite3"
MAX_BODY_BYTES = 1_000_000
TERMINAL_ZONE_EVENTS = ("expired", "cancelled", "invalidated")
VALID_TIMEFRAMES = {"60m", "30m", "15m", "5m", "1m"}
VALID_ASSETS = {"MYM", "MCL", "MGC"}
SCIENTIST_STEPS = (
    "preparation", "research", "prediction", "recording",
    "evaluation", "journal", "daily_learning",
)
CHICAGO = ZoneInfo("America/Chicago")


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS protocol_versions (
  protocol_version TEXT PRIMARY KEY,
  protocol_sha256 TEXT NOT NULL,
  protocol_json TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_registry (
  model_id TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  indicator_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  source_sha256 TEXT,
  probability_semantics_json TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  zone_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES model_registry(model_id),
  protocol_version TEXT NOT NULL REFERENCES protocol_versions(protocol_version),
  symbol TEXT NOT NULL,
  contract TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BSL','SSL')),
  zone_class TEXT NOT NULL,
  zone_top REAL NOT NULL,
  zone_bottom REAL NOT NULL,
  pivot_time TEXT NOT NULL,
  available_time TEXT NOT NULL,
  structural_score INTEGER,
  tier TEXT,
  forecast_probability REAL,
  forecast_event TEXT NOT NULL,
  probability_source TEXT,
  probability_samples INTEGER,
  bias TEXT NOT NULL DEFAULT 'neutral',
  atr REAL,
  volume REAL,
  raw_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  CHECK(zone_top >= zone_bottom),
  CHECK(forecast_probability IS NULL OR (forecast_probability >= 0 AND forecast_probability <= 1))
);
CREATE INDEX IF NOT EXISTS zones_lookup ON zones(contract, timeframe, available_time);

CREATE TABLE IF NOT EXISTS zone_events (
  event_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES zones(zone_id),
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  price REAL,
  source TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS zone_events_lookup ON zone_events(zone_id, event_type, event_time);

CREATE TABLE IF NOT EXISTS trials (
  trial_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL UNIQUE REFERENCES zones(zone_id),
  protocol_version TEXT NOT NULL REFERENCES protocol_versions(protocol_version),
  contract TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  entry_time TEXT NOT NULL,
  entry_price REAL NOT NULL,
  stop_price REAL NOT NULL,
  target_zone_id TEXT NOT NULL REFERENCES zones(zone_id),
  target_price REAL NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity = 1),
  executable_status TEXT NOT NULL,
  entry_source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trials_lookup ON trials(contract, timeframe, entry_time);

CREATE TABLE IF NOT EXISTS trial_outcomes (
  trial_id TEXT PRIMARY KEY REFERENCES trials(trial_id),
  outcome TEXT NOT NULL,
  outcome_time TEXT NOT NULL,
  exit_price REAL NOT NULL,
  gross_ticks REAL NOT NULL,
  gross_dollars REAL NOT NULL,
  fees_dollars REAL NOT NULL,
  net_dollars REAL NOT NULL,
  r_multiple REAL NOT NULL,
  resolution_source TEXT NOT NULL,
  ambiguous INTEGER NOT NULL CHECK(ambiguous IN (0,1)),
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_bars (
  contract TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  bar_time TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  source TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  PRIMARY KEY(contract, timeframe, bar_time),
  CHECK(high >= low)
);
CREATE INDEX IF NOT EXISTS bars_order ON market_bars(contract, timeframe, bar_time);

CREATE TABLE IF NOT EXISTS market_ticks (
  tick_id TEXT PRIMARY KEY,
  contract TEXT NOT NULL,
  event_time TEXT NOT NULL,
  price REAL NOT NULL,
  bid REAL,
  ask REAL,
  source TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticks_order ON market_ticks(contract, event_time);

CREATE TABLE IF NOT EXISTS calendar_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  actual_time TEXT,
  raw_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_fills (
  fill_id TEXT PRIMARY KEY,
  trial_id TEXT REFERENCES trials(trial_id),
  broker TEXT NOT NULL,
  contract TEXT NOT NULL,
  order_id TEXT,
  side TEXT NOT NULL CHECK(side IN ('buy','sell')),
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  fill_time TEXT NOT NULL,
  commission REAL,
  raw_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scientist_daily_forecasts (
  forecast_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES zones(zone_id),
  forecast_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scientist_version TEXT NOT NULL,
  hold_probability REAL NOT NULL CHECK(hold_probability >= 0 AND hold_probability <= 1),
  entry_price REAL NOT NULL,
  stop_price REAL NOT NULL,
  target_price REAL NOT NULL,
  target_zone_id TEXT REFERENCES zones(zone_id),
  reward_risk REAL NOT NULL CHECK(reward_risk > 0),
  rationale TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_forecasts_by_time ON scientist_daily_forecasts(forecast_at DESC);
CREATE INDEX IF NOT EXISTS scientist_forecasts_by_zone ON scientist_daily_forecasts(zone_id, forecast_at);

CREATE TABLE IF NOT EXISTS scientist_forecast_outcomes (
  outcome_id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL UNIQUE REFERENCES scientist_daily_forecasts(forecast_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('target','stop','timeout','no_touch','ambiguous','invalidated')),
  outcome_time TEXT NOT NULL,
  exit_price REAL,
  r_multiple REAL,
  resolution_source TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_outcomes_by_time ON scientist_forecast_outcomes(outcome_time DESC);

CREATE TABLE IF NOT EXISTS scientist_daily_runs (
  run_id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,
  asset_code TEXT NOT NULL CHECK(asset_code IN ('MYM','MCL','MGC')),
  contract TEXT NOT NULL,
  session_open TEXT NOT NULL,
  session_close TEXT NOT NULL,
  timezone TEXT NOT NULL,
  method_version TEXT NOT NULL,
  created_by TEXT NOT NULL,
  mandate TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(trade_date, asset_code, contract, method_version)
);
CREATE INDEX IF NOT EXISTS scientist_runs_by_date ON scientist_daily_runs(trade_date DESC, asset_code);

CREATE TABLE IF NOT EXISTS scientist_run_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scientist_daily_runs(run_id),
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(content IS NOT NULL OR source_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS scientist_artifacts_by_run ON scientist_run_artifacts(run_id, step_key, created_at);

CREATE TABLE IF NOT EXISTS scientist_run_step_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scientist_daily_runs(run_id),
  step_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('started','completed','blocked','skipped','reopened')),
  event_time TEXT NOT NULL,
  owner TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifact_id TEXT REFERENCES scientist_run_artifacts(artifact_id),
  detail_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_step_events_by_run ON scientist_run_step_events(run_id, step_key, event_time);

CREATE TABLE IF NOT EXISTS scientist_run_forecasts (
  run_id TEXT NOT NULL REFERENCES scientist_daily_runs(run_id),
  forecast_id TEXT NOT NULL UNIQUE REFERENCES scientist_daily_forecasts(forecast_id),
  linked_at TEXT NOT NULL,
  PRIMARY KEY(run_id, forecast_id)
);

CREATE TABLE IF NOT EXISTS scientist_daily_data_packages (
  package_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scientist_daily_runs(run_id),
  package_version INTEGER NOT NULL,
  package_status TEXT NOT NULL CHECK(package_status IN ('ready','blocked')),
  owner TEXT NOT NULL,
  package_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, package_version)
);
CREATE INDEX IF NOT EXISTS scientist_packages_by_run ON scientist_daily_data_packages(run_id, package_version DESC);

CREATE TABLE IF NOT EXISTS scientist_weekly_reviews (
  review_id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  method_version TEXT NOT NULL,
  review_json TEXT NOT NULL,
  score_snapshot_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_weekly_reviews_by_week ON scientist_weekly_reviews(week_start DESC, method_version, created_at DESC);

CREATE TABLE IF NOT EXISTS scientist_weekly_preregistrations (
  preregistration_id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  method_version TEXT NOT NULL,
  preregistration_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_weekly_preregistrations_by_week ON scientist_weekly_preregistrations(week_start DESC, method_version, created_at DESC);

CREATE TABLE IF NOT EXISTS scientist_trigger_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scientist_daily_runs(run_id),
  trigger_source TEXT NOT NULL CHECK(trigger_source IN ('manual','cron')),
  job_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type IN ('blocked','dispatched','superseded','duplicate','completed','failed')),
  event_time TEXT NOT NULL,
  summary TEXT NOT NULL,
  task_id TEXT,
  detail_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scientist_triggers_by_run ON scientist_trigger_events(run_id, event_time DESC);

CREATE TABLE IF NOT EXISTS scientist_dispatch_locks (
  run_id TEXT PRIMARY KEY REFERENCES scientist_daily_runs(run_id),
  trigger_event_id TEXT NOT NULL,
  lock_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS zones_no_update BEFORE UPDATE ON zones
BEGIN SELECT RAISE(ABORT, 'zones are immutable'); END;
CREATE TRIGGER IF NOT EXISTS zones_no_delete BEFORE DELETE ON zones
BEGIN SELECT RAISE(ABORT, 'zones are immutable'); END;
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON zone_events
BEGIN SELECT RAISE(ABORT, 'zone events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON zone_events
BEGIN SELECT RAISE(ABORT, 'zone events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trials_no_update BEFORE UPDATE ON trials
BEGIN SELECT RAISE(ABORT, 'trials are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trials_no_delete BEFORE DELETE ON trials
BEGIN SELECT RAISE(ABORT, 'trials are immutable'); END;
CREATE TRIGGER IF NOT EXISTS outcomes_no_update BEFORE UPDATE ON trial_outcomes
BEGIN SELECT RAISE(ABORT, 'trial outcomes are immutable'); END;
CREATE TRIGGER IF NOT EXISTS outcomes_no_delete BEFORE DELETE ON trial_outcomes
BEGIN SELECT RAISE(ABORT, 'trial outcomes are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_forecasts_no_update BEFORE UPDATE ON scientist_daily_forecasts
BEGIN SELECT RAISE(ABORT, 'scientist forecasts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_forecasts_no_delete BEFORE DELETE ON scientist_daily_forecasts
BEGIN SELECT RAISE(ABORT, 'scientist forecasts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_outcomes_no_update BEFORE UPDATE ON scientist_forecast_outcomes
BEGIN SELECT RAISE(ABORT, 'scientist forecast outcomes are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_outcomes_no_delete BEFORE DELETE ON scientist_forecast_outcomes
BEGIN SELECT RAISE(ABORT, 'scientist forecast outcomes are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_runs_no_update BEFORE UPDATE ON scientist_daily_runs
BEGIN SELECT RAISE(ABORT, 'scientist daily runs are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_runs_no_delete BEFORE DELETE ON scientist_daily_runs
BEGIN SELECT RAISE(ABORT, 'scientist daily runs are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_step_events_no_update BEFORE UPDATE ON scientist_run_step_events
BEGIN SELECT RAISE(ABORT, 'scientist step events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_step_events_no_delete BEFORE DELETE ON scientist_run_step_events
BEGIN SELECT RAISE(ABORT, 'scientist step events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_packages_no_update BEFORE UPDATE ON scientist_daily_data_packages
BEGIN SELECT RAISE(ABORT, 'scientist data packages are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_packages_no_delete BEFORE DELETE ON scientist_daily_data_packages
BEGIN SELECT RAISE(ABORT, 'scientist data packages are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_weekly_reviews_no_update BEFORE UPDATE ON scientist_weekly_reviews
BEGIN SELECT RAISE(ABORT, 'scientist weekly reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_weekly_reviews_no_delete BEFORE DELETE ON scientist_weekly_reviews
BEGIN SELECT RAISE(ABORT, 'scientist weekly reviews are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_weekly_preregistrations_no_update BEFORE UPDATE ON scientist_weekly_preregistrations
BEGIN SELECT RAISE(ABORT, 'scientist weekly preregistrations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_weekly_preregistrations_no_delete BEFORE DELETE ON scientist_weekly_preregistrations
BEGIN SELECT RAISE(ABORT, 'scientist weekly preregistrations are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_triggers_no_update BEFORE UPDATE ON scientist_trigger_events
BEGIN SELECT RAISE(ABORT, 'scientist trigger events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_triggers_no_delete BEFORE DELETE ON scientist_trigger_events
BEGIN SELECT RAISE(ABORT, 'scientist trigger events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_artifacts_no_update BEFORE UPDATE ON scientist_run_artifacts
BEGIN SELECT RAISE(ABORT, 'scientist artifacts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS scientist_artifacts_no_delete BEFORE DELETE ON scientist_run_artifacts
BEGIN SELECT RAISE(ABORT, 'scientist artifacts are immutable'); END;
"""


@dataclass(frozen=True)
class Economics:
    tick_size: float
    tick_value: float
    stop_ticks: float
    entry_slippage_ticks: float
    stop_slippage_ticks: float
    round_turn_cost: float


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def payload_hash(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def load_protocol() -> dict:
    return json.loads(PROTOCOL_PATH.read_text())


def economics() -> Economics:
    protocol = load_protocol()
    costs = protocol["costs"]
    return Economics(
        tick_size=float(os.getenv("LIQUIDITY_LAB_TICK_SIZE", protocol["tick_size"])),
        tick_value=float(os.getenv("LIQUIDITY_LAB_TICK_VALUE_USD", protocol["tick_value_usd"])),
        stop_ticks=float(os.getenv("LIQUIDITY_LAB_STOP_TICKS", protocol["stop_ticks"])),
        entry_slippage_ticks=float(os.getenv(
            "LIQUIDITY_LAB_ENTRY_SLIPPAGE_TICKS", costs["entry_slippage_ticks_default"]
        )),
        stop_slippage_ticks=float(os.getenv(
            "LIQUIDITY_LAB_STOP_SLIPPAGE_TICKS", costs["stop_slippage_ticks_default"]
        )),
        round_turn_cost=float(os.getenv(
            "LIQUIDITY_LAB_ROUND_TURN_COST_USD", costs["round_turn_commission_usd_default"]
        )),
    )


def parse_time(value: object, field: str) -> str:
    if value is None or value == "":
        raise ValueError(f"{field} is required")
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        raw = float(value)
        if raw > 10_000_000_000:
            raw /= 1000.0
        return datetime.fromtimestamp(raw, timezone.utc).isoformat().replace("+00:00", "Z")
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601 or epoch seconds/milliseconds") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def asset_from_contract(value: object) -> str | None:
    text = str(value or "").upper().replace(" ", "")
    for asset in VALID_ASSETS:
        if text == asset or text.startswith(asset) or f":{asset}" in text:
            return asset
    return None


def regular_session_bounds(trade_date: str) -> tuple[str, str]:
    try:
        trading_day = date.fromisoformat(trade_date)
    except ValueError as exc:
        raise ValueError("trade_date must be YYYY-MM-DD") from exc
    if trading_day.weekday() > 4:
        raise ValueError("trade_date must be a Monday-Friday CME trade date")
    session_open = datetime.combine(trading_day - timedelta(days=1), time(17, 0), CHICAGO)
    session_close = datetime.combine(trading_day, time(16, 0), CHICAGO)
    return (
        session_open.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        session_close.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


def create_scientist_run(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    trade_date = str(payload.get("trade_date") or "").strip()
    asset = str(payload.get("asset_code") or payload.get("asset") or "").upper().strip()
    if asset not in VALID_ASSETS:
        raise ValueError("asset_code must be MYM, MCL, or MGC")
    contract = str(payload.get("contract") or "").upper().strip()
    if not contract:
        raise ValueError("contract is required; use the dated futures contract when known")
    contract_asset = asset_from_contract(contract)
    if contract_asset and contract_asset != asset:
        raise ValueError("contract does not match asset_code")
    default_open, default_close = regular_session_bounds(trade_date)
    session_open = parse_time(payload.get("session_open") or default_open, "session_open")
    session_close = parse_time(payload.get("session_close") or default_close, "session_close")
    open_dt = datetime.fromisoformat(session_open.replace("Z", "+00:00"))
    close_dt = datetime.fromisoformat(session_close.replace("Z", "+00:00"))
    if close_dt <= open_dt:
        raise ValueError("session_close must be after session_open")
    if close_dt - open_dt > timedelta(hours=23):
        raise ValueError("a Scientist run cannot span more than one futures session")
    method_version = str(payload.get("method_version") or "liquidity-loop-v0.3").strip()
    created_by = str(payload.get("created_by") or "user").strip()
    mandate = str(payload.get("mandate") or "Measure which liquidity levels hold within frozen session risk and reward.").strip()
    identity = f"{trade_date}|{asset}|{contract}|{method_version}"
    run_id = "sr-" + hashlib.sha256(identity.encode()).hexdigest()[:20]
    body = {
        "run_id": run_id, "trade_date": trade_date, "asset_code": asset,
        "contract": contract, "session_open": session_open, "session_close": session_close,
        "timezone": "America/Chicago", "method_version": method_version,
        "created_by": created_by, "mandate": mandate,
    }
    inserted = db.execute(
        "INSERT OR IGNORE INTO scientist_daily_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (run_id, trade_date, asset, contract, session_open, session_close,
         "America/Chicago", method_version, created_by, mandate, payload_hash(body), utc_now()),
    ).rowcount
    db.commit()
    return {"created": bool(inserted), "run": scientist_run_detail(db, run_id)}


def weekly_preregistration_for_run(db: sqlite3.Connection, run: sqlite3.Row) -> sqlite3.Row | None:
    trade_day = date.fromisoformat(run["trade_date"])
    week_start = (trade_day - timedelta(days=trade_day.weekday())).isoformat()
    return db.execute(
        "SELECT * FROM scientist_weekly_preregistrations WHERE week_start=? AND method_version=? "
        "ORDER BY created_at DESC LIMIT 1", (week_start, run["method_version"]),
    ).fetchone()


def create_run_artifact(
    db: sqlite3.Connection, run_id: str, step_key: str, title: str,
    content: str | None, source_url: str | None, media_type: str,
) -> str | None:
    content = content.strip() if content else None
    source_url = source_url.strip() if source_url else None
    if not content and not source_url:
        return None
    if source_url and not (source_url.startswith(("http://", "https://", "/"))):
        raise ValueError("output_url must be http(s) or a local absolute route")
    title = title.strip() or f"{step_key.replace('_', ' ').title()} output"
    body = {"run_id": run_id, "step_key": step_key, "title": title,
            "media_type": media_type, "content": content, "source_url": source_url}
    artifact_id = "sa-" + payload_hash(body)[:22]
    db.execute(
        "INSERT OR IGNORE INTO scientist_run_artifacts VALUES (?,?,?,?,?,?,?,?,?)",
        (artifact_id, run_id, step_key, title, media_type, content, source_url,
         payload_hash(body), utc_now()),
    )
    return artifact_id


def append_scientist_step(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    run_id = str(payload.get("run_id") or "").strip()
    run = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run:
        raise ValueError("unknown run_id")
    step_key = str(payload.get("step_key") or "").strip().lower()
    if step_key not in SCIENTIST_STEPS:
        raise ValueError("step_key must be one of " + ", ".join(SCIENTIST_STEPS))
    event_type = str(payload.get("event_type") or "completed").strip().lower()
    if event_type not in {"started", "completed", "blocked", "skipped", "reopened"}:
        raise ValueError("unsupported step event_type")
    summary = str(payload.get("summary") or "").strip()
    if not summary:
        raise ValueError("summary is required")
    owner = str(payload.get("owner") or "Chief Scientist").strip()
    event_time = parse_time(payload.get("event_time") or utc_now(), "event_time")
    detail = payload.get("detail") or {}
    if not isinstance(detail, dict):
        raise ValueError("detail must be a JSON object")
    if step_key == "prediction" and event_type == "completed":
        if not weekly_preregistration_for_run(db, run):
            raise ValueError("prediction cannot be completed before the matching weekly experiment is preregistered")
        package = db.execute(
            "SELECT package_status, package_json FROM scientist_daily_data_packages WHERE run_id=? "
            "ORDER BY package_version DESC LIMIT 1", (run_id,),
        ).fetchone()
        if not package or package["package_status"] != "ready":
            raise ValueError("prediction cannot be completed without a ready specialist data package")
        package_data = json.loads(package["package_json"])
        expected_zones = {
            level["zone_id"] for level in package_data.get("levels", [])
            if level.get("status") == "eligible" and level.get("zone_id")
        }
        override = db.execute(
            "SELECT event_time FROM scientist_run_step_events WHERE run_id=? AND step_key='prediction' "
            "AND event_type='reopened' AND detail_json LIKE '%\"report_override\":true%' "
            "ORDER BY event_time DESC, created_at DESC LIMIT 1", (run_id,),
        ).fetchone()
        forecast_rows = db.execute(
            "SELECT z.zone_id FROM scientist_run_forecasts rf "
            "JOIN scientist_daily_forecasts f USING(forecast_id) JOIN zones z USING(zone_id) "
            "WHERE rf.run_id=? AND (? IS NULL OR rf.linked_at>=?)",
            (run_id, override["event_time"] if override else None, override["event_time"] if override else None),
        ).fetchall()
        forecast_zones = {row["zone_id"] for row in forecast_rows}
        missing_zones = sorted(expected_zones - forecast_zones)
        if missing_zones:
            raise ValueError("prediction is missing forecasts for eligible package levels: " + ", ".join(missing_zones))
        extra_zones = sorted(forecast_zones - expected_zones)
        if extra_zones:
            raise ValueError("prediction contains forecasts outside the frozen eligible inventory: " + ", ".join(extra_zones))
        report = scientist_selection_report(db, run_id, prediction_completion=True)
        if report["status"] not in {"ready", "abstain"}:
            raise ValueError("prediction cannot be completed: " + "; ".join(report["blockers"]))
        if not payload.get("output_document") and not payload.get("output_url"):
            payload["output_title"] = "Paper next-session selection report"
            payload["output_document"] = render_scientist_selection_markdown(report)
        detail["selection_report_sha256"] = report["payload_sha256"]
        detail.setdefault("trigger_source", "manual")
    artifact_id = create_run_artifact(
        db, run_id, step_key, str(payload.get("output_title") or ""),
        str(payload.get("output_document") or "") or None,
        str(payload.get("output_url") or "") or None,
        str(payload.get("media_type") or "text/markdown"),
    )
    if event_type == "completed" and not artifact_id:
        raise ValueError("completed steps require an output document or clickable output URL")
    body = {"run_id": run_id, "step_key": step_key, "event_type": event_type,
            "event_time": event_time, "owner": owner, "summary": summary,
            "artifact_id": artifact_id, "detail": detail}
    event_id = "se-" + secrets.token_hex(12)
    db.execute(
        "INSERT INTO scientist_run_step_events VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (event_id, run_id, step_key, event_type, event_time, owner, summary,
         artifact_id, canonical_json(detail), payload_hash(body), utc_now()),
    )
    db.commit()
    return {"created": True, "run": scientist_run_detail(db, run_id)}


def validate_scientist_data_package(db: sqlite3.Connection, run: sqlite3.Row, package: dict) -> tuple[list[str], dict]:
    if not isinstance(package, dict):
        raise ValueError("package must be a JSON object")
    if package.get("schema_version") != "scientist-daily-data-package-v1":
        raise ValueError("schema_version must be scientist-daily-data-package-v1")
    identity = package.get("run") or {}
    if not isinstance(identity, dict):
        raise ValueError("run must be a JSON object")
    for key in ("trade_date", "asset_code", "contract", "method_version"):
        if str(identity.get(key) or "") != str(run[key]):
            raise ValueError(f"package run.{key} does not match the daily run")
    for key in ("session_open", "session_close"):
        if parse_time(identity.get(key), f"run.{key}") != parse_time(run[key], key):
            raise ValueError(f"package run.{key} does not match the daily run")
    if identity.get("timezone") != run["timezone"]:
        raise ValueError("package timezone does not match the daily run")
    cutoff_at = parse_time(package.get("cutoff_at"), "cutoff_at")
    open_at = parse_time(run["session_open"], "session_open")
    package_created_at = parse_time(package.get("created_at"), "created_at")
    if cutoff_at > open_at:
        raise ValueError("cutoff_at must be at or before the session open")
    if package_created_at > utc_now():
        raise ValueError("created_at cannot be in the future")
    owner = str(package.get("owner") or "").strip()
    if owner not in {"Lead Researcher", "Analyst", "Cleo", "Chief Scientist"}:
        raise ValueError("owner must identify a named research role")
    sources_block = package.get("source_boundary") or {}
    sources = sources_block.get("sources") if isinstance(sources_block, dict) else None
    if not isinstance(sources, list):
        raise ValueError("source_boundary.sources must be a list")
    blockers: list[str] = []
    if not re.search(r"[FGHJKMNQUVXZ](?:\d{2}|\d{4})$", run["contract"].upper()):
        blockers.append("A dated futures contract is required; a root symbol is not enough.")
    if not sources:
        blockers.append("No source records are attached.")
    source_ids: set[str] = set()
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            raise ValueError(f"source_boundary.sources[{index}] must be an object")
        source_id = str(source.get("source_id") or "").strip()
        if not source_id:
            raise ValueError(f"source_boundary.sources[{index}].source_id is required")
        source_ids.add(source_id)
        if not str(source.get("title") or "").strip() or not str(source.get("provider") or "").strip():
            blockers.append(f"Source {source_id} is missing its title or provider.")
        if source.get("rights_status") != "approved":
            blockers.append(f"Source {source_id} does not have approved processing and retention rights.")
        if not str(source.get("retrieved_at") or "").strip():
            blockers.append(f"Source {source_id} is missing its retrieval time.")
        else:
            retrieved_at = parse_time(source["retrieved_at"], f"source {source_id} retrieved_at")
            if retrieved_at > cutoff_at:
                blockers.append(f"Source {source_id} was retrieved after the forecast cutoff.")
        if not str(source.get("permitted_use") or "").strip():
            blockers.append(f"Source {source_id} is missing its permitted-use record.")
    coverage = package.get("timeframe_coverage")
    if not isinstance(coverage, dict):
        raise ValueError("timeframe_coverage must be an object")
    for timeframe in sorted(VALID_TIMEFRAMES):
        row = coverage.get(timeframe)
        if not isinstance(row, dict):
            blockers.append(f"{timeframe} coverage is missing.")
            continue
        if row.get("status") != "fresh" or row.get("fresh") is not True:
            blockers.append(f"{timeframe} evidence is not marked fresh.")
        if row.get("source_id") not in source_ids:
            blockers.append(f"{timeframe} coverage references an unknown source.")
        try:
            if int(row.get("bar_count", 0)) < 1:
                blockers.append(f"{timeframe} coverage has no completed bars.")
        except (TypeError, ValueError):
            blockers.append(f"{timeframe} bar_count is invalid.")
        for timestamp_key in ("first_bar_at", "last_bar_at"):
            if not row.get(timestamp_key):
                blockers.append(f"{timeframe} coverage is missing {timestamp_key}.")
            elif parse_time(row[timestamp_key], f"{timeframe} {timestamp_key}") > cutoff_at:
                blockers.append(f"{timeframe} coverage contains a bar after the forecast cutoff.")
        try:
            if int(row.get("gap_count", 0)) > 0:
                blockers.append(f"{timeframe} coverage contains missing intervals.")
        except (TypeError, ValueError):
            blockers.append(f"{timeframe} gap_count is invalid.")
    calendar = package.get("session_calendar") or {}
    if not isinstance(calendar, dict) or calendar.get("verified") is not True or not calendar.get("source_id"):
        blockers.append("An approved exchange calendar boundary is not verified.")
    elif calendar.get("source_id") not in source_ids:
        blockers.append("The session calendar references an unknown source.")
    else:
        for key in ("session_open", "session_close"):
            if calendar.get(key) and parse_time(calendar[key], f"session_calendar.{key}") != parse_time(run[key], key):
                blockers.append(f"The approved calendar {key} does not match the daily run boundary.")
    risk = package.get("risk_rules") or {}
    if not isinstance(risk, dict) or risk.get("status") != "frozen":
        blockers.append("Asset-specific entry, stop, target, expiry, and session rules are not frozen.")
    elif any(not str(risk.get(key) or "").strip() for key in (
        "entry_rule", "stop_rule", "target_rule", "expiry_rule",
        "session_close_rule", "contract_roll_rule",
    )):
        blockers.append("The frozen risk rules must state entry, stop, target, expiry, session-close, and contract-roll behavior.")
    costs = package.get("cost_assumptions") or {}
    if not isinstance(costs, dict) or costs.get("status") != "verified":
        blockers.append("Commission and slippage assumptions are not verified.")
    else:
        for key in ("round_turn_commission_usd", "entry_slippage_ticks", "exit_slippage_ticks"):
            try:
                if float(costs.get(key)) < 0:
                    raise ValueError
            except (TypeError, ValueError):
                blockers.append(f"Verified costs are missing a valid nonnegative {key}.")
        if costs.get("source_id") not in source_ids:
            blockers.append("Verified costs must cite an approved source record.")
    levels = package.get("levels")
    if not isinstance(levels, list):
        raise ValueError("levels must be a list, including an empty list when no levels qualify")
    if not levels and not str(package.get("empty_inventory_reason") or "").strip():
        blockers.append("An empty level inventory requires an explicit reason.")
    seen_zone_ids: set[str] = set()
    for index, level in enumerate(levels):
        if not isinstance(level, dict):
            raise ValueError(f"levels[{index}] must be an object")
        if level.get("timeframe") not in VALID_TIMEFRAMES:
            raise ValueError(f"levels[{index}].timeframe is unsupported")
        if level.get("status") not in {"eligible", "stale", "touched", "mitigated", "invalidated", "unsupported", "unavailable"}:
            raise ValueError(f"levels[{index}].status is unsupported")
        zone_id = str(level.get("zone_id") or "").strip()
        if level.get("status") == "eligible" and zone_id:
            if zone_id in seen_zone_ids:
                raise ValueError(f"levels contains duplicate eligible zone_id {zone_id}")
            seen_zone_ids.add(zone_id)
        if level.get("source_id") not in source_ids:
            blockers.append(f"Level {zone_id or index + 1} references an unknown source.")
        if not level.get("available_at"):
            blockers.append(f"Level {zone_id or index + 1} is missing its available_at time.")
        elif parse_time(level["available_at"], f"level {zone_id or index + 1} available_at") > cutoff_at:
            blockers.append(f"Level {zone_id or index + 1} became available after the forecast cutoff.")
        if level.get("status") == "eligible":
            if not zone_id:
                blockers.append(f"Eligible level {index + 1} has no zone_id in the Lab ledger.")
            else:
                zone = db.execute("SELECT symbol, timeframe, side, available_time, zone_top, zone_bottom FROM zones WHERE zone_id=?", (zone_id,)).fetchone()
                if (not zone or asset_from_contract(zone["symbol"]) != run["asset_code"]
                        or zone["timeframe"] != level["timeframe"] or zone["side"] != level["side"]):
                    blockers.append(f"Eligible level {zone_id} is not available in the matching asset ledger.")
                elif parse_time(zone["available_time"], f"level {zone_id} ledger availability") > cutoff_at:
                    blockers.append(f"Eligible level {zone_id} entered the Lab ledger after the forecast cutoff.")
                else:
                    try:
                        if float(level.get("price_low")) != float(zone["zone_bottom"]) or float(level.get("price_high")) != float(zone["zone_top"]):
                            blockers.append(f"Eligible level {zone_id} price bounds do not match the immutable Lab level.")
                    except (TypeError, ValueError):
                        blockers.append(f"Eligible level {zone_id} is missing exact price_low/price_high bounds.")
    return blockers, {**package, "owner": owner, "cutoff_at": cutoff_at, "levels": levels}


def create_scientist_data_package(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    run_id = str(payload.get("run_id") or "").strip()
    run = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run:
        raise ValueError("run_id must identify an open Scientist daily run")
    package = payload.get("package")
    blockers, package = validate_scientist_data_package(db, run, package)
    package_status = "ready" if not blockers else "blocked"
    package["status"] = package_status
    package["blockers"] = blockers
    encoded = canonical_json(package)
    sha = hashlib.sha256(encoded.encode()).hexdigest()
    existing = db.execute(
        "SELECT * FROM scientist_daily_data_packages WHERE run_id=? AND payload_sha256=?",
        (run_id, sha),
    ).fetchone()
    if existing:
        return {"created": False, "package": scientist_data_package_row(existing)}
    version = int(db.execute(
        "SELECT COALESCE(MAX(package_version),0)+1 FROM scientist_daily_data_packages WHERE run_id=?",
        (run_id,),
    ).fetchone()[0])
    package_id = "sdp-" + hashlib.sha256(f"{run_id}|{version}|{sha}".encode()).hexdigest()[:20]
    created_at = utc_now()
    db.execute(
        "INSERT INTO scientist_daily_data_packages VALUES (?,?,?,?,?,?,?,?)",
        (package_id, run_id, version, package_status, package["owner"], encoded, sha, created_at),
    )
    db.commit()
    append_scientist_step(db, {
        "run_id": run_id,
        "step_key": "research",
        "event_type": "completed" if package_status == "ready" else "blocked",
        "owner": package["owner"],
        "summary": (
            f"Specialist data package v{version} passed required gates."
            if package_status == "ready" else
            f"Specialist data package v{version} is blocked by {len(blockers)} evidence gate(s)."
        ),
        "output_title": f"Daily specialist data package v{version}",
        "output_document": encoded,
        "detail": {"package_id": package_id, "package_status": package_status,
                   "payload_sha256": sha, "blockers": blockers},
    })
    row = db.execute("SELECT * FROM scientist_daily_data_packages WHERE package_id=?", (package_id,)).fetchone()
    return {"created": True, "package": scientist_data_package_row(row)}


def scientist_data_package_row(row: sqlite3.Row | dict) -> dict:
    item = dict(row)
    item["package"] = json.loads(item.pop("package_json"))
    return item


def scientist_trigger_row(row: sqlite3.Row | dict) -> dict:
    item = dict(row)
    item["detail"] = json.loads(item.pop("detail_json"))
    return item


def request_scientist_trigger(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    run_id = str(payload.get("run_id") or "").strip()
    run = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run:
        raise ValueError("run_id must identify a daily Scientist run")
    source = str(payload.get("trigger_source") or "").strip().lower()
    if source not in {"manual", "cron"}:
        raise ValueError("trigger_source must be manual or cron")
    job_id = str(payload.get("job_id") or ("manual_analysis" if source == "manual" else "")).strip()
    if not job_id:
        raise ValueError("job_id is required for a cron trigger")
    if source == "manual" and job_id != "manual_analysis":
        raise ValueError("manual trigger job_id must be manual_analysis")
    if source == "cron":
        cron_spec = json.loads((ROOT / "scientist-crons.json").read_text(encoding="utf-8"))
        if job_id not in {str(job.get("id") or "") for job in cron_spec.get("jobs", [])}:
            raise ValueError("job_id is not present in scientist-crons.json")
    idempotency_key = str(payload.get("idempotency_key") or "").strip()
    if not idempotency_key:
        raise ValueError("idempotency_key is required")
    existing = db.execute(
        "SELECT * FROM scientist_trigger_events WHERE idempotency_key=?", (idempotency_key,),
    ).fetchone()
    if existing:
        return {"created": False, "event": scientist_trigger_row(existing), "run": scientist_run_detail(db, run_id)}
    force_override = payload.get("force_override") is True
    if force_override and source != "manual":
        raise ValueError("force_override is available only for an explicit manual run")
    event_id = "ste-" + secrets.token_hex(12)
    detail: dict = {"trigger_source": source, "job_id": job_id}
    event_type = "blocked"
    summary = "Manual research is blocked; no specialist or Scientist task was launched."
    task_id = None
    preopen_jobs = {"prepare_next_session", "research_next_session", "freeze_predictions", "open_recording_window"}
    cron_job = None
    if source == "cron" and job_id in preopen_jobs:
        cron_job = next(job for job in cron_spec["jobs"] if job["id"] == job_id)
    elif source == "cron":
        cron_job = next(job for job in cron_spec["jobs"] if job["id"] == job_id)
    if cron_job:
        detail["step"] = cron_job["step"]
        detail["phase"] = cron_job["phase"]
    needs_research_inputs = source == "manual" or (source == "cron" and job_id in preopen_jobs)
    gate_blockers: list[dict[str, str]] = []
    latest_package = None
    if needs_research_inputs:
        if not re.search(r"[FGHJKMNQUVXZ](?:\d{2}|\d{4})$", run["contract"].upper()):
            gate_blockers.append({"code": "dated_contract_required", "message": "Confirm the dated futures contract and roll rule."})
        if not weekly_preregistration_for_run(db, run):
            gate_blockers.append({"code": "weekly_preregistration_required", "message": "Freeze the matching weekly preregistration first."})
        latest_package = db.execute(
            "SELECT package_id,package_status,payload_sha256,package_json FROM scientist_daily_data_packages "
            "WHERE run_id=? ORDER BY package_version DESC LIMIT 1", (run_id,),
        ).fetchone()
        if not latest_package:
            gate_blockers.append({"code": "specialist_data_package_required", "message": "Upload the asset's source-verified daily evidence package."})
        elif latest_package["package_status"] != "ready":
            package_data = json.loads(latest_package["package_json"])
            package_blockers = package_data.get("blockers") or ["The latest daily evidence package is blocked."]
            gate_blockers.extend({"code": "specialist_data_package_blocked", "message": str(message)} for message in package_blockers)
        bridge_url = os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_URL", "").strip()
        bridge_token = os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_TOKEN", "").strip()
        if not bridge_url or not bridge_token:
            gate_blockers.append({"code": "firstmate_dispatch_unavailable", "message": "Configure the Firstmate dispatch bridge and task credentials."})
        elif urlparse(bridge_url).scheme != "https" and urlparse(bridge_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
            gate_blockers.append({"code": "dispatch_endpoint_must_use_https_or_loopback", "message": "Use an HTTPS or loopback Firstmate endpoint."})
        if gate_blockers:
            detail["blocker"] = gate_blockers[0]["code"]
            detail["blockers"] = gate_blockers
            summary = "Manual run blocked: " + " ".join(blocker["message"] for blocker in gate_blockers)
    if source == "manual" or (source == "cron" and job_id in preopen_jobs):
        latest_prediction = db.execute(
            "SELECT event_type,detail_json FROM scientist_run_step_events WHERE run_id=? AND step_key='prediction' "
            "ORDER BY event_time DESC, created_at DESC LIMIT 1", (run_id,),
        ).fetchone()
        if latest_prediction and latest_prediction["event_type"] == "completed" and not force_override:
            completed_detail = json.loads(latest_prediction["detail_json"] or "{}")
            if completed_detail.get("trigger_source") == "manual":
                event_type = "superseded"
                summary = (
                    "Manual request was already completed for this run."
                    if source == "manual" else
                    "Pre-session cron work was superseded by the completed manual prediction for this run."
                )
                detail["superseded_by"] = "manual_prediction_complete"
            else:
                event_type = "superseded"
                summary = (
                    "The prediction is already complete for this run."
                    if source == "manual" else
                    "Pre-session cron work was skipped because the prediction is already complete for this run."
                )
                detail["superseded_by"] = "prediction_complete"
    if event_type != "superseded":
        bridge_url = os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_URL", "").strip()
        bridge_token = os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_TOKEN", "").strip()
        if gate_blockers:
            pass
        elif not bridge_url or not bridge_token:
            detail["blocker"] = "firstmate_dispatch_unavailable"
        elif urlparse(bridge_url).scheme != "https" and urlparse(bridge_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
            detail["blocker"] = "dispatch_endpoint_must_use_https_or_loopback"
            summary = "Firstmate dispatch endpoint is not HTTPS or loopback; dispatch was refused."
        else:
            now = datetime.now(timezone.utc)
            db.execute("DELETE FROM scientist_dispatch_locks WHERE lock_expires_at<=?", (now.isoformat().replace("+00:00", "Z"),))
            lock_until = (now + timedelta(minutes=90)).isoformat().replace("+00:00", "Z")
            acquired = db.execute(
                "INSERT OR IGNORE INTO scientist_dispatch_locks VALUES (?,?,?,?)",
                (run_id, event_id, lock_until, utc_now()),
            ).rowcount
            if not acquired:
                active_lock = db.execute(
                    "SELECT trigger_event_id FROM scientist_dispatch_locks WHERE run_id=?", (run_id,),
                ).fetchone()
                event_type = "duplicate"
                summary = "Another manual or cron task is active for this daily run; no duplicate task was created."
                detail["active_trigger_event_id"] = active_lock["trigger_event_id"] if active_lock else None
            else:
                db.commit()
                if force_override:
                    append_scientist_step(db, {
                        "run_id": run_id, "step_key": "prediction", "event_type": "reopened",
                        "owner": "Batty", "summary": "The user requested a manual rerun. Earlier forecast and report evidence remains in history; this new pass will become the current report revision.",
                        "detail": {"report_override": True, "trigger_source": "manual"},
                    })
            request_body = {
                "protocol": "firstmate-scientist-dispatch-v1",
                "trigger_event_id": event_id, "run_id": run_id,
                "trade_date": run["trade_date"], "asset_code": run["asset_code"],
                "contract": run["contract"], "method_version": run["method_version"],
                "trigger_source": source, "job_id": job_id, "idempotency_key": idempotency_key,
                "data_package_id": latest_package["package_id"] if latest_package else None,
                "data_package_status": latest_package["package_status"] if latest_package else None,
                "data_package_sha256": latest_package["payload_sha256"] if latest_package else None,
                "workflow_scope": "pre_session_analysis" if source == "manual" or cron_job and cron_job["phase"] == "pre_open" else job_id,
                "scheduled_step": cron_job["step"] if cron_job else None,
                "required_roles": ["Lead Researcher", "Research Associate", "Analyst / Data QA", "Cleo", "Junior Scientist", "Chief Scientist", "Lab Testing Specialist", "Outcome / Method Reviewer"],
                "report_revision": "current" if force_override else "initial_or_resume",
                "telemetry_contract": {"step_events": "Report each role's actual started/completed/blocked state through step_event, including runtime_seconds and token_usage only when the runtime provides them."},
                "submission_endpoints": {
                    "data_package": scientist_service_url("/api/v1/scientist-data-package"),
                    "step_event": scientist_service_url("/api/v1/scientist-step"),
                    "forecast": scientist_service_url("/api/v1/scientist-forecast"),
                    "trigger_event": scientist_service_url("/api/v1/scientist-trigger-event"),
                },
                "instruction": "Batty owns this handoff. Record role-specific step events as specialists start, complete, or block work. The Lead Researcher and Research Associate prepare cited evidence; the Analyst validates source identity, rights, cutoff, freshness, contract, gaps, and costs; Cleo inventories all supplied liquidity levels; Junior Scientist executes the frozen daily method; Chief Scientist owns the weekly question and synthesis; Lab Testing Specialist reproduces the score; Outcome/Method Reviewer records the independent disposition. Submit packages and artifacts through the listed endpoints. Include actual token_usage in step-event detail only when supplied by the runtime; omit it when unknown. On a rerun, retain earlier records and treat only forecasts after the latest report_override reopen event as the current revision. Do not invent prices, access rights, calendar facts, or telemetry. Paper/shadow only.",
            }
            if acquired:
                request = urllib.request.Request(
                    bridge_url, data=canonical_json(request_body).encode(), method="POST",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {bridge_token}"},
                )
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        result = json.loads(response.read(MAX_BODY_BYTES).decode())
                    task_id = str(result.get("task_id") or "").strip()
                    if not task_id:
                        detail["blocker"] = "dispatch_response_missing_task_id"
                        summary = "Firstmate bridge responded without a task_id; the run remains blocked."
                    else:
                        event_type = "dispatched"
                        summary = "Firstmate accepted the workflow request; specialist and Scientist completion is pending."
                        detail["data_package_id"] = request_body["data_package_id"]
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
                    detail["blocker"] = "firstmate_dispatch_failed"
                    detail["dispatch_error"] = type(exc).__name__
                    summary = "Firstmate dispatch failed; no analysis completion is recorded."
                if event_type != "dispatched":
                    db.execute("DELETE FROM scientist_dispatch_locks WHERE run_id=? AND trigger_event_id=?", (run_id, event_id))
                    db.commit()
    event_body = {
        "event_id": event_id, "run_id": run_id, "trigger_source": source,
        "job_id": job_id, "idempotency_key": idempotency_key,
        "event_type": event_type, "event_time": utc_now(), "summary": summary,
        "task_id": task_id, "detail": detail,
    }
    db.execute(
        "INSERT INTO scientist_trigger_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (event_id, run_id, source, job_id, idempotency_key, event_type,
         event_body["event_time"], summary, task_id, canonical_json(detail), payload_hash(event_body), utc_now()),
    )
    db.commit()
    row = db.execute("SELECT * FROM scientist_trigger_events WHERE event_id=?", (event_id,)).fetchone()
    return {"created": True, "event": scientist_trigger_row(row), "run": scientist_run_detail(db, run_id)}


def append_scientist_trigger_event(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    trigger_event_id = str(payload.get("trigger_event_id") or "").strip()
    previous = db.execute(
        "SELECT * FROM scientist_trigger_events WHERE event_id=?", (trigger_event_id,),
    ).fetchone()
    if not previous or previous["event_type"] != "dispatched":
        raise ValueError("trigger_event_id must identify a dispatched Firstmate task")
    if str(payload.get("task_id") or "").strip() != str(previous["task_id"] or ""):
        raise ValueError("task_id does not match the dispatched task")
    event_type = str(payload.get("event_type") or "").strip().lower()
    if event_type not in {"completed", "failed"}:
        raise ValueError("event_type must be completed or failed")
    idempotency_key = str(payload.get("idempotency_key") or "").strip()
    if not idempotency_key:
        raise ValueError("idempotency_key is required")
    existing = db.execute(
        "SELECT * FROM scientist_trigger_events WHERE idempotency_key=?", (idempotency_key,),
    ).fetchone()
    if existing:
        return {"created": False, "event": scientist_trigger_row(existing)}
    summary = str(payload.get("summary") or "").strip()
    if not summary:
        raise ValueError("summary is required")
    detail = payload.get("detail") or {}
    if not isinstance(detail, dict):
        raise ValueError("detail must be a JSON object")
    detail["for_trigger_event_id"] = trigger_event_id
    event_id = "ste-" + secrets.token_hex(12)
    event_time = parse_time(payload.get("event_time") or utc_now(), "event_time")
    body = {
        "event_id": event_id, "run_id": previous["run_id"],
        "trigger_source": previous["trigger_source"], "job_id": previous["job_id"],
        "idempotency_key": idempotency_key, "event_type": event_type,
        "event_time": event_time, "summary": summary, "task_id": previous["task_id"],
        "detail": detail,
    }
    db.execute(
        "INSERT INTO scientist_trigger_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (event_id, previous["run_id"], previous["trigger_source"], previous["job_id"],
         idempotency_key, event_type, event_time, summary, previous["task_id"],
         canonical_json(detail), payload_hash(body), utc_now()),
    )
    db.execute(
        "DELETE FROM scientist_dispatch_locks WHERE run_id=? AND trigger_event_id=?",
        (previous["run_id"], trigger_event_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM scientist_trigger_events WHERE event_id=?", (event_id,)).fetchone()
    return {"created": True, "event": scientist_trigger_row(row), "run": scientist_run_detail(db, previous["run_id"])}


def scientist_service_url(path: str) -> str:
    base = os.getenv("LIQUIDITY_LAB_CALLBACK_BASE_URL", "http://127.0.0.1:8041").strip().rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("LIQUIDITY_LAB_CALLBACK_BASE_URL must use HTTPS or loopback")
    return base + path


def normalize_timeframe(value: object) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "60": "60m", "60m": "60m", "1h": "60m",
        "30": "30m", "30m": "30m",
        "15": "15m", "15m": "15m",
        "5": "5m", "5m": "5m",
        "1": "1m", "1m": "1m",
    }
    result = aliases.get(raw)
    if result not in VALID_TIMEFRAMES:
        raise ValueError("timeframe must be one of 60m, 30m, 15m, 5m, or 1m")
    return result


def clean_payload(payload: dict) -> dict:
    clean = dict(payload)
    clean.pop("secret", None)
    clean.pop("webhook_secret", None)
    return clean


def connect(path: Path = DEFAULT_DB) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    protocol = load_protocol()
    now = utc_now()
    protocol_text = canonical_json(protocol)
    db.execute(
        "INSERT OR IGNORE INTO protocol_versions VALUES (?, ?, ?, ?, ?)",
        (
            protocol["protocol_version"], hashlib.sha256(protocol_text.encode()).hexdigest(),
            protocol_text, now, now,
        ),
    )
    db.commit()
    return db


def row_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def probability_event_for(timeframe: str, source: str | None) -> str:
    if source == "fallback" or timeframe == "15m":
        return "fallback_unscored"
    return load_protocol()["probability_semantics"][timeframe]


def normalized_probability(value: object) -> float | None:
    if value is None or value == "":
        return None
    result = float(value)
    if result > 1:
        result /= 100.0
    if not 0 <= result <= 1:
        raise ValueError("probability must be between 0 and 1, or 0 and 100 percent")
    return result


def register_model(db: sqlite3.Connection, payload: dict, available_time: str) -> str:
    indicator = str(payload.get("indicator") or "Batty Clean Zone View")
    indicator_version = str(payload.get("indicator_version") or "v1.9.6")
    model_version = str(payload.get("model_version") or "unversioned")
    source_sha = payload.get("indicator_source_sha256") or payload.get("indicator_base_source_sha256")
    identity = f"{indicator}|{indicator_version}|{model_version}|{source_sha or ''}"
    model_id = "model-" + hashlib.sha256(identity.encode()).hexdigest()[:18]
    semantics = canonical_json(load_protocol()["probability_semantics"])
    db.execute(
        "INSERT OR IGNORE INTO model_registry VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (model_id, indicator, indicator_version, model_version, source_sha, semantics, available_time, utc_now()),
    )
    return model_id


def register_forecast(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    if payload.get("event", "zone_created") != "zone_created":
        raise ValueError("forecast endpoint accepts event=zone_created only")
    zone_id = str(payload.get("zone_id") or "").strip()
    if not zone_id:
        raise ValueError("zone_id is required")
    existing = db.execute("SELECT * FROM zones WHERE zone_id=?", (zone_id,)).fetchone()
    if existing:
        return {"created": False, "zone": dict(existing)}

    timeframe = normalize_timeframe(payload.get("timeframe"))
    side = str(payload.get("side") or "").upper()
    if side not in {"BSL", "SSL"}:
        raise ValueError("side must be BSL or SSL")
    top = float(payload["zone_top"])
    bottom = float(payload["zone_bottom"])
    if top < bottom:
        top, bottom = bottom, top
    available = parse_time(
        payload.get("available_at") or payload.get("available_time") or payload.get("bar_time"),
        "available_at",
    )
    pivot = parse_time(
        payload.get("pivot_time") or payload.get("created_at_bar_time") or available,
        "pivot_time",
    )
    protocol_version = str(payload.get("protocol_version") or load_protocol()["protocol_version"])
    if not db.execute(
        "SELECT 1 FROM protocol_versions WHERE protocol_version=?", (protocol_version,)
    ).fetchone():
        raise ValueError(f"unknown protocol_version: {protocol_version}")
    model_id = register_model(db, payload, available)
    probability_source = str(payload.get("probability_source") or "unknown")
    forecast_event = str(payload.get("forecast_event") or probability_event_for(timeframe, probability_source))
    probability = normalized_probability(payload.get("probability"))
    raw = canonical_json(payload)
    sha = hashlib.sha256(raw.encode()).hexdigest()
    received = utc_now()
    structural_score = payload.get("structural_score")
    if structural_score is not None:
        structural_score = int(structural_score)
        if not 0 <= structural_score <= 10:
            raise ValueError("structural_score must be between 0 and 10")
    symbol = str(payload.get("symbol") or payload.get("contract") or "").strip()
    contract = str(payload.get("contract") or symbol).strip()
    if not symbol or not contract:
        raise ValueError("symbol or contract is required")
    bias = str(payload.get("bias") or "neutral").lower().replace("bias:", "").strip()
    values = (
        zone_id, model_id, protocol_version, symbol, contract, timeframe, side,
        str(payload.get("zone_class") or "unknown"), top, bottom, pivot, available,
        structural_score, payload.get("probability_tier") or payload.get("tier"),
        probability, forecast_event, probability_source,
        int(payload.get("probability_samples") or 0), bias,
        float(payload["atr"]) if payload.get("atr") is not None else None,
        float(payload["volume"]) if payload.get("volume") is not None else None,
        raw, sha, received,
    )
    db.execute(
        "INSERT INTO zones VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values
    )
    append_zone_event(
        db, zone_id, "created", available, payload.get("price"), "forecast_webhook",
        {"forecast_event": forecast_event, "payload_sha256": sha},
    )
    db.commit()
    return {"created": True, "zone": row_dict(db.execute("SELECT * FROM zones WHERE zone_id=?", (zone_id,)).fetchone())}


def create_scientist_forecast(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    run_id = str(payload.get("run_id") or "").strip()
    run = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run:
        raise ValueError("run_id must identify an open Scientist daily run")
    if not weekly_preregistration_for_run(db, run):
        raise ValueError("freeze the matching weekly preregistration before recording daily forecasts")
    zone_id = str(payload.get("zone_id") or "").strip()
    zone = db.execute("SELECT * FROM zones WHERE zone_id=?", (zone_id,)).fetchone()
    if not zone:
        raise ValueError("zone_id must identify an existing liquidity level")
    forecast_at = parse_time(payload.get("forecast_at"), "forecast_at")
    expires_at = parse_time(payload.get("expires_at"), "expires_at")
    now = utc_now()
    if forecast_at > now:
        raise ValueError("forecast_at cannot be in the future")
    if forecast_at < zone["available_time"]:
        raise ValueError("forecast_at must be after the level became available")
    if expires_at <= forecast_at or expires_at <= now:
        raise ValueError("expires_at must be after forecast_at and still in the forward window")
    if expires_at > run["session_close"]:
        raise ValueError("expires_at cannot exceed the futures session close; positions may not carry overnight")
    if forecast_at > run["session_open"]:
        raise ValueError("next-session forecast_at must be at or before the declared session open")
    zone_asset = asset_from_contract(zone["contract"] or zone["symbol"])
    if zone_asset != run["asset_code"]:
        raise ValueError("forecast level asset does not match the Scientist run")
    latest_bar = db.execute(
        "SELECT MAX(bar_time) FROM market_bars WHERE contract=?", (zone["contract"],)
    ).fetchone()[0]
    latest_tick = db.execute(
        "SELECT MAX(event_time) FROM market_ticks WHERE contract=?", (zone["contract"],)
    ).fetchone()[0]
    latest_observation = max((value for value in (latest_bar, latest_tick) if value), default=None)
    if latest_observation and forecast_at < latest_observation:
        raise ValueError("historical forecast rejected: forecast_at predates stored market observations")
    try:
        hold_probability = float(payload.get("hold_probability"))
    except (TypeError, ValueError) as exc:
        raise ValueError("hold_probability must be between 0 and 1") from exc
    if not 0 <= hold_probability <= 1:
        raise ValueError("hold_probability must be between 0 and 1")
    entry = float(payload.get("entry_price"))
    stop = float(payload.get("stop_price"))
    target = float(payload.get("target_price"))
    direction = "short" if zone["side"] == "BSL" else "long"
    if direction == "long" and not stop < entry < target:
        raise ValueError("SSL hold forecast requires stop < entry < target")
    if direction == "short" and not target < entry < stop:
        raise ValueError("BSL hold forecast requires target < entry < stop")
    target_zone_id = str(payload.get("target_zone_id") or "").strip() or None
    if target_zone_id:
        target_zone = db.execute("SELECT * FROM zones WHERE zone_id=?", (target_zone_id,)).fetchone()
        if not target_zone:
            raise ValueError("target_zone_id must identify an existing liquidity level")
        if (target_zone["contract"], target_zone["timeframe"]) != (zone["contract"], zone["timeframe"]):
            raise ValueError("target zone must use the same contract and timeframe")
        if target_zone["side"] == zone["side"]:
            raise ValueError("target zone must be on the opposite side")
        if not target_zone["zone_bottom"] <= target <= target_zone["zone_top"]:
            raise ValueError("target_price must fall inside the frozen target zone")
    risk = abs(entry - stop)
    reward = abs(target - entry)
    if risk <= 0 or reward <= 0:
        raise ValueError("risk and reward distances must be positive")
    tools = payload.get("tools", [])
    sources = payload.get("research_sources", [])
    if not isinstance(tools, (list, dict)) or not isinstance(sources, (list, dict)):
        raise ValueError("tools and research_sources must be JSON lists or objects")
    forecast_id = "sf-" + secrets.token_hex(12)
    body = {
        "forecast_id": forecast_id, "zone_id": zone_id, "forecast_at": forecast_at,
        "expires_at": expires_at, "scientist_version": str(payload.get("scientist_version") or "daily-liquidity-v0.2-draft"),
        "hold_probability": hold_probability, "entry_price": entry, "stop_price": stop,
        "target_price": target, "target_zone_id": target_zone_id, "reward_risk": reward / risk,
        "rationale": str(payload.get("rationale") or "").strip(), "tools": tools,
        "research_sources": sources,
    }
    if not body["rationale"]:
        raise ValueError("rationale is required for the scientific journal")
    sha = payload_hash(body)
    db.execute(
        "INSERT INTO scientist_daily_forecasts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (forecast_id, zone_id, forecast_at, expires_at, body["scientist_version"], hold_probability,
         entry, stop, target, target_zone_id, reward / risk, body["rationale"],
         canonical_json(tools), canonical_json(sources), sha, now),
    )
    db.execute(
        "INSERT INTO scientist_run_forecasts VALUES (?,?,?)",
        (run_id, forecast_id, utc_now()),
    )
    db.commit()
    return {"created": True, "forecast": scientist_forecast_row(db, forecast_id)}


def scientist_forecast_row(db: sqlite3.Connection, forecast_id: str) -> dict | None:
    row = db.execute(
        "SELECT f.*, z.symbol, z.contract, z.timeframe, z.side, z.zone_class, z.zone_top, z.zone_bottom, "
        "o.outcome, o.outcome_time, o.exit_price, o.r_multiple, o.resolution_source "
        "FROM scientist_daily_forecasts f JOIN zones z USING(zone_id) "
        "LEFT JOIN scientist_forecast_outcomes o USING(forecast_id) WHERE f.forecast_id=?",
        (forecast_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["tools"] = json.loads(result.pop("tools_json"))
    result["research_sources"] = json.loads(result.pop("sources_json"))
    return result


def record_scientist_outcome(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    forecast_id = str(payload.get("forecast_id") or "").strip()
    forecast = db.execute(
        "SELECT f.*, z.side, r.session_close FROM scientist_daily_forecasts f "
        "JOIN zones z USING(zone_id) JOIN scientist_run_forecasts rf USING(forecast_id) "
        "JOIN scientist_daily_runs r USING(run_id) WHERE forecast_id=?",
        (forecast_id,),
    ).fetchone()
    if not forecast:
        raise ValueError("unknown forecast_id")
    if db.execute("SELECT 1 FROM scientist_forecast_outcomes WHERE forecast_id=?", (forecast_id,)).fetchone():
        raise ValueError("forecast outcome is already recorded and immutable")
    outcome = str(payload.get("outcome") or "").lower()
    allowed = {"target", "stop", "timeout", "no_touch", "ambiguous", "invalidated"}
    if outcome not in allowed:
        raise ValueError(f"outcome must be one of {', '.join(sorted(allowed))}")
    outcome_time = parse_time(payload.get("outcome_time"), "outcome_time")
    if outcome_time <= forecast["forecast_at"]:
        raise ValueError("outcome_time must be after the frozen forecast")
    if outcome_time > forecast["session_close"]:
        raise ValueError("outcome_time cannot exceed session close; every position must be flat by the close")
    if outcome in {"target", "stop"} and outcome_time > forecast["expires_at"]:
        raise ValueError("target/stop outcome must occur before the frozen expiry")
    if outcome in {"timeout", "no_touch"} and outcome_time < forecast["expires_at"]:
        raise ValueError("timeout/no_touch can only be recorded at or after the frozen expiry")
    exit_price = float(payload["exit_price"]) if payload.get("exit_price") is not None else None
    direction = "short" if forecast["side"] == "BSL" else "long"
    if outcome == "target" and exit_price is not None:
        reached = exit_price >= float(forecast["target_price"]) if direction == "long" else exit_price <= float(forecast["target_price"])
        if not reached:
            raise ValueError("target outcome exit_price does not reach the frozen target")
    if outcome == "stop" and exit_price is not None:
        reached = exit_price <= float(forecast["stop_price"]) if direction == "long" else exit_price >= float(forecast["stop_price"])
        if not reached:
            raise ValueError("stop outcome exit_price does not reach the frozen stop")
    r_multiple = None
    if outcome == "target":
        r_multiple = float(forecast["reward_risk"])
        exit_price = exit_price if exit_price is not None else float(forecast["target_price"])
    elif outcome == "stop":
        r_multiple = -1.0
        exit_price = exit_price if exit_price is not None else float(forecast["stop_price"])
    elif outcome == "timeout":
        if exit_price is None:
            raise ValueError("timeout outcome requires exit_price")
        risk = abs(float(forecast["entry_price"]) - float(forecast["stop_price"]))
        pnl = (float(forecast["entry_price"]) - exit_price) if direction == "short" else (exit_price - float(forecast["entry_price"]))
        r_multiple = pnl / risk
    source = str(payload.get("resolution_source") or "").strip()
    if not source:
        raise ValueError("resolution_source is required")
    detail = payload.get("detail") or {}
    if not isinstance(detail, dict):
        raise ValueError("detail must be a JSON object")
    outcome_id = "sfo-" + secrets.token_hex(12)
    body = {"outcome_id": outcome_id, "forecast_id": forecast_id, "outcome": outcome,
            "outcome_time": outcome_time, "exit_price": exit_price, "r_multiple": r_multiple,
            "resolution_source": source, "detail": detail}
    db.execute(
        "INSERT INTO scientist_forecast_outcomes VALUES (?,?,?,?,?,?,?,?,?,?)",
        (outcome_id, forecast_id, outcome, outcome_time, exit_price, r_multiple,
         source, canonical_json(detail), payload_hash(body), utc_now()),
    )
    db.commit()
    return {"created": True, "forecast": scientist_forecast_row(db, forecast_id)}


def close_scientist_session(db: sqlite3.Connection, incoming: dict) -> dict:
    """Resolve every still-open Scientist forecast at its declared session close."""
    payload = clean_payload(incoming)
    run_id = str(payload.get("run_id") or "").strip()
    run = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run:
        raise ValueError("unknown run_id")
    if parse_time(utc_now(), "current_time") < run["session_close"]:
        raise ValueError("session cannot be forced flat before its declared close")
    source = str(payload.get("resolution_source") or "").strip()
    if not source:
        raise ValueError("resolution_source is required")
    close_prices = payload.get("close_prices") or {}
    if not isinstance(close_prices, dict):
        raise ValueError("close_prices must be a JSON object keyed by forecast_id")
    default_close = payload.get("close_price")
    rows = db.execute(
        "SELECT f.forecast_id, f.zone_id FROM scientist_run_forecasts rf "
        "JOIN scientist_daily_forecasts f USING(forecast_id) "
        "LEFT JOIN scientist_forecast_outcomes o USING(forecast_id) "
        "WHERE rf.run_id=? AND o.forecast_id IS NULL ORDER BY f.forecast_id", (run_id,),
    ).fetchall()
    plan = []
    for row in rows:
        touched = db.execute(
            "SELECT 1 FROM zone_events WHERE zone_id=? AND event_type='touched' "
            "AND event_time<=? LIMIT 1", (row["zone_id"], run["session_close"]),
        ).fetchone() is not None
        close_value = close_prices.get(row["forecast_id"], default_close)
        if touched and close_value is None:
            raise ValueError(f"close price is required for touched forecast {row['forecast_id']}")
        plan.append((row["forecast_id"], "timeout" if touched else "no_touch", close_value))
    results = []
    for forecast_id, outcome, close_value in plan:
        results.append(record_scientist_outcome(db, {
            "forecast_id": forecast_id, "outcome": outcome,
            "outcome_time": run["session_close"],
            "exit_price": float(close_value) if close_value is not None else None,
            "resolution_source": source,
            "detail": {"forced_flat_at_session_close": True, "run_id": run_id},
        })["forecast"])
    return {"run_id": run_id, "session_close": run["session_close"],
            "resolved": len(results), "forecasts": results}


def scientist_run_detail(db: sqlite3.Connection, run_id: str) -> dict | None:
    run_row = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run_row:
        return None
    events = db.execute(
        "SELECT e.*, a.title output_title, a.source_url output_url, a.media_type, "
        "CASE WHEN a.content IS NOT NULL THEN '/api/scientist-artifact?artifact_id='||a.artifact_id ELSE a.source_url END artifact_url "
        "FROM scientist_run_step_events e LEFT JOIN scientist_run_artifacts a USING(artifact_id) "
        "WHERE e.run_id=? ORDER BY e.event_time, e.created_at", (run_id,),
    ).fetchall()
    latest: dict[str, dict] = {}
    history: list[dict] = []
    for row in events:
        item = dict(row)
        item["detail"] = json.loads(item.pop("detail_json"))
        history.append(item)
        latest[item["step_key"]] = item
    steps = []
    for index, key in enumerate(SCIENTIST_STEPS, start=1):
        event = latest.get(key)
        steps.append({
            "sequence": index, "step_key": key,
            "label": key.replace("_", " ").title(),
            "status": event["event_type"] if event else "pending",
            "latest": event,
        })
    forecast_rows = db.execute(
        "SELECT f.forecast_id FROM scientist_run_forecasts rf "
        "JOIN scientist_daily_forecasts f USING(forecast_id) WHERE rf.run_id=? "
        "ORDER BY f.forecast_at", (run_id,),
    ).fetchall()
    package_rows = db.execute(
        "SELECT * FROM scientist_daily_data_packages WHERE run_id=? ORDER BY package_version",
        (run_id,),
    ).fetchall()
    trigger_rows = db.execute(
        "SELECT * FROM scientist_trigger_events WHERE run_id=? ORDER BY event_time, created_at",
        (run_id,),
    ).fetchall()
    completed = sum(step["status"] in {"completed", "skipped"} for step in steps)
    blocked = sum(step["status"] == "blocked" for step in steps)
    result = dict(run_row)
    result.update({
        "steps": steps, "history": history, "completed_steps": completed,
        "blocked_steps": blocked, "total_steps": len(SCIENTIST_STEPS),
        "status": "complete" if completed == len(SCIENTIST_STEPS) else ("blocked" if blocked else "open"),
        "release_url": f"/scientist-release?run_id={quote(run_id)}",
        "forecasts": [scientist_forecast_row(db, row["forecast_id"]) for row in forecast_rows],
        "data_packages": [scientist_data_package_row(row) for row in package_rows],
        "trigger_events": [scientist_trigger_row(row) for row in trigger_rows],
        "selection_report": scientist_selection_report(db, run_id),
        "selection_report_url": f"/scientist-selections?run_id={quote(run_id)}",
    })
    return result


def scientist_selection_report(db: sqlite3.Connection, run_id: str, *, prediction_completion: bool = False) -> dict:
    """Build the current immutable-evidence view of a paper next-session report."""
    run_row = db.execute("SELECT * FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone()
    if not run_row:
        raise ValueError("unknown run_id")
    run = dict(run_row)
    prereg = weekly_preregistration_for_run(db, run_row)
    package_row = db.execute(
        "SELECT * FROM scientist_daily_data_packages WHERE run_id=? ORDER BY package_version DESC LIMIT 1",
        (run_id,),
    ).fetchone()
    blockers: list[str] = []
    package = None
    if not prereg:
        blockers.append("Matching weekly preregistration is missing.")
    if not package_row:
        blockers.append("No specialist data package has been submitted.")
    else:
        package = json.loads(package_row["package_json"])
        if package_row["package_status"] != "ready":
            blockers.extend(package.get("blockers") or ["The latest specialist data package is blocked."])

    override = db.execute(
        "SELECT event_time FROM scientist_run_step_events WHERE run_id=? AND step_key='prediction' "
        "AND event_type='reopened' AND detail_json LIKE '%\"report_override\":true%' "
        "ORDER BY event_time DESC, created_at DESC LIMIT 1", (run_id,),
    ).fetchone()
    forecast_rows = db.execute(
        "SELECT f.forecast_id FROM scientist_run_forecasts rf "
        "JOIN scientist_daily_forecasts f USING(forecast_id) WHERE rf.run_id=? "
        "AND (? IS NULL OR rf.linked_at>=?) ORDER BY f.forecast_at,f.forecast_id",
        (run_id, override["event_time"] if override else None, override["event_time"] if override else None),
    ).fetchall()
    forecasts = [scientist_forecast_row(db, row["forecast_id"]) for row in forecast_rows]
    forecast_by_zone = {item["zone_id"]: item for item in forecasts}
    levels = package.get("levels", []) if package else []
    eligible = [level for level in levels if level.get("status") == "eligible"]
    selections = []
    if package_row and package_row["package_status"] == "ready":
        for level in eligible:
            forecast = forecast_by_zone.get(level.get("zone_id"))
            if not forecast:
                blockers.append(f"No frozen forecast exists for eligible level {level.get('zone_id') or '(missing ID)'}.")
                continue
            direction = "short" if forecast["side"] == "BSL" else "long"
            selections.append({
                "forecast_id": forecast["forecast_id"], "zone_id": forecast["zone_id"],
                "asset_code": run["asset_code"], "contract": run["contract"],
                "timeframe": forecast["timeframe"], "side": forecast["side"], "direction": direction,
                "level_low": forecast["zone_bottom"], "level_high": forecast["zone_top"],
                "hold_probability": forecast["hold_probability"],
                "forecast_at": forecast["forecast_at"], "expires_at": forecast["expires_at"],
                "entry_price": forecast["entry_price"], "stop_price": forecast["stop_price"],
                "target_price": forecast["target_price"], "reward_risk": forecast["reward_risk"],
                "rationale": forecast["rationale"], "source_id": level.get("source_id"),
                "available_at": level.get("available_at"),
            })
    expected_ids = {str(level.get("zone_id")) for level in eligible if level.get("zone_id")}
    extra_ids = sorted(set(forecast_by_zone) - expected_ids)
    if extra_ids:
        blockers.append("Forecasts exist outside the frozen eligible inventory: " + ", ".join(extra_ids))
    prediction_step = db.execute(
        "SELECT event_type FROM scientist_run_step_events WHERE run_id=? AND step_key='prediction' "
        "ORDER BY event_time DESC,created_at DESC LIMIT 1", (run_id,),
    ).fetchone()
    prediction_frozen = prediction_completion or bool(prediction_step and prediction_step["event_type"] == "completed")
    status = "blocked" if blockers else ("abstain" if not eligible else ("ready" if prediction_frozen else "draft"))
    sources = (package or {}).get("source_boundary", {}).get("sources", [])
    preregistration = json.loads(prereg["preregistration_json"]) if prereg else None
    body = {
        "status": status, "run": run,
        "preregistration_id": prereg["preregistration_id"] if prereg else None,
        "preregistration_sha256": prereg["payload_sha256"] if prereg else None,
        "package_id": package_row["package_id"] if package_row else None,
        "package_sha256": package_row["payload_sha256"] if package_row else None,
        "report_revision": "rerun" if override else "initial",
        "cutoff_at": (package or {}).get("cutoff_at"),
        "eligible_candidate_count": len(eligible), "selections": selections,
        "exclusions": [level for level in levels if level.get("status") != "eligible"],
        "sources": sources, "blockers": blockers,
        "abstention_reason": (package or {}).get("empty_inventory_reason") if status == "abstain" else None,
        "paper_only": True,
        "prediction_frozen": prediction_frozen,
    }
    body["payload_sha256"] = payload_hash(body)
    return body


def render_scientist_selection_markdown(report: dict) -> str:
    run = report["run"]
    lines = [
        f"# {run['asset_code']} next-session paper selections — {run['trade_date']}", "",
        f"- Contract: `{run['contract']}`", f"- Method: `{run['method_version']}`",
        f"- Session: {run['session_open']} → {run['session_close']} ({run['timezone']})",
        f"- Forecast cutoff: {report.get('cutoff_at') or 'not recorded'}",
        f"- Report status: **{report['status'].upper()}**",
        f"- Preregistration SHA-256: `{report.get('preregistration_sha256') or 'missing'}`",
        f"- Data package SHA-256: `{report.get('package_sha256') or 'missing'}`", "",
        "## Selections", "",
    ]
    if report["selections"]:
        for item in report["selections"]:
            lines.extend([
                f"### {item['timeframe']} {item['direction'].upper()} · {item['zone_id']}", "",
                f"- Liquidity level: {item['level_low']}–{item['level_high']} ({item['side']})",
                f"- Hold probability: {item['hold_probability']:.1%}",
                f"- Trigger / entry: {item['entry_price']}", f"- Stop: {item['stop_price']}",
                f"- Target: {item['target_price']} · {item['reward_risk']:.2f}R",
                f"- Valid through: {item['expires_at']}",
                f"- Evidence source: `{item.get('source_id') or 'missing'}` · level available {item.get('available_at') or 'unknown'}",
                f"- Rationale / invalidation: {item['rationale']}", "",
            ])
    elif report["status"] == "abstain":
        lines.extend(["**ABSTAIN — no eligible level qualified.**", "", report.get("abstention_reason") or "The frozen inventory contains no eligible levels.", ""])
    elif report["status"] == "draft":
        lines.extend(["Forecasts are recorded, but the prediction step has not been completed and frozen as the current report revision.", ""])
    if report["blockers"]:
        lines.extend(["## Blockers", "", *[f"- {item}" for item in report["blockers"]], ""])
    lines.extend([
        "## Source boundary", "",
        *[f"- `{source.get('source_id')}` — {source.get('title')} ({source.get('provider')}); retrieved {source.get('retrieved_at')}; rights {source.get('rights_status')}" for source in report["sources"]],
        "", "Paper/shadow research only. This report is not an order or a claim of live market access.", "",
    ])
    return "\n".join(lines)


def scientist_runs_data(db: sqlite3.Connection, limit: int = 90) -> dict:
    limit = max(1, min(limit, 500))
    rows = db.execute(
        "SELECT run_id FROM scientist_daily_runs ORDER BY trade_date DESC, asset_code, created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    contracts: dict[str, str] = {}
    local_config = ROOT / "data" / "scientist-scheduler.local.json"
    if local_config.exists():
        try:
            configured = json.loads(local_config.read_text(encoding="utf-8")).get("contracts") or {}
            contracts = {
                asset: str(configured.get(asset) or "").strip().upper()
                for asset in VALID_ASSETS if configured.get(asset)
                and str(configured.get(asset)).strip().upper().startswith(asset)
                and re.search(r"[FGHJKMNQUVXZ](?:\d{2}|\d{4})$", str(configured.get(asset)).strip().upper())
            }
        except (OSError, json.JSONDecodeError, AttributeError):
            contracts = {}
    latest_contracts = db.execute(
        "SELECT r.asset_code,r.contract FROM scientist_daily_runs r JOIN ("
        "SELECT asset_code,MAX(trade_date) latest_date FROM scientist_daily_runs GROUP BY asset_code"
        ") latest ON latest.asset_code=r.asset_code AND latest.latest_date=r.trade_date "
        "GROUP BY r.asset_code ORDER BY r.created_at DESC"
    ).fetchall()
    for row in latest_contracts:
        if row["contract"].upper().startswith(row["asset_code"]) and re.search(r"[FGHJKMNQUVXZ](?:\d{2}|\d{4})$", row["contract"].upper()):
            contracts.setdefault(row["asset_code"], row["contract"])
    return {
        "assets": sorted(VALID_ASSETS), "steps": list(SCIENTIST_STEPS),
        "workflow": {
            "firstmate_dispatch_configured": bool(
                os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_URL", "").strip()
                and os.getenv("LIQUIDITY_LAB_FIRSTMATE_DISPATCH_TOKEN", "").strip()
            ),
            "scheduler_configured": (ROOT / "data" / "scientist-scheduler.local.json").exists(),
            "scheduler_installation": "not_detectable_from_dashboard",
            "cron_runner": "python3 liquidity-lab/scientist_cron.py",
            "contract_defaults": contracts,
        },
        "runs": [scientist_run_detail(db, row["run_id"]) for row in rows],
    }


def scientist_release_html(db: sqlite3.Connection, run_id: str) -> str:
    run = scientist_run_detail(db, run_id)
    if not run:
        raise ValueError("unknown run_id")
    esc = lambda value: html.escape(str(value or ""))
    step_sections = []
    for step in run["steps"]:
        related = [event for event in run["history"] if event["step_key"] == step["step_key"]]
        event_rows = []
        for event in related:
            link = ""
            if event.get("artifact_url"):
                link = f'<a href="{esc(event["artifact_url"])}">{esc(event.get("output_title") or "Open output")}</a>'
            event_rows.append(
                f'<li><time>{esc(event["event_time"])}</time> · <b>{esc(event["event_type"])}</b> · '
                f'{esc(event["owner"])}<p>{esc(event["summary"])}</p>{link}</li>'
            )
        step_sections.append(
            f'<section><h2>{step["sequence"]}. {esc(step["label"])}</h2>'
            f'<span class="status">{esc(step["status"])}</span><ol>{"".join(event_rows) or "<li>No event recorded.</li>"}</ol></section>'
        )
    forecast_rows = []
    for forecast in run["forecasts"]:
        forecast_rows.append(
            f'<tr><td>{esc(forecast["forecast_id"])}</td><td>{esc(forecast["timeframe"])}</td>'
            f'<td>{esc(forecast["side"])}</td><td>{esc(forecast["hold_probability"])}</td>'
            f'<td>{esc(forecast.get("outcome") or "open")}</td><td>{esc(forecast.get("r_multiple"))}</td></tr>'
        )
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(run["asset_code"])} {esc(run["trade_date"])} Scientist release</title><style>:root{{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#050608;color:#f4f6f8}}body{{max-width:980px;margin:auto;padding:32px 20px}}header,section{{border:1px solid #272c34;border-radius:8px;background:#0b0d10;padding:18px;margin:14px 0}}h1{{margin:.2em 0}}h2{{display:inline-block;margin:0 12px 8px 0}}p,li{{color:#aeb7c4;line-height:1.55}}.status{{color:#8fc2ff;font:12px monospace}}a{{color:#71b8ff}}table{{width:100%;border-collapse:collapse}}th,td{{padding:9px;border-bottom:1px solid #272c34;text-align:left;font-size:12px}}code{{color:#a9d4fc}}</style></head><body><header><small>CHIEF SCIENTIST DAILY RELEASE</small><h1>{esc(run["asset_code"])} · {esc(run["trade_date"])}</h1><p><code>{esc(run["run_id"])}</code> · {esc(run["contract"])} · {esc(run["method_version"])}</p><p>Session {esc(run["session_open"])} → {esc(run["session_close"])}. No position may remain open after session close.</p><p>{esc(run["mandate"])}</p></header>{"".join(step_sections)}<section><h2>Frozen forecasts</h2><table><thead><tr><th>ID</th><th>TF</th><th>Side</th><th>Probability</th><th>Outcome</th><th>R</th></tr></thead><tbody>{"".join(forecast_rows) or '<tr><td colspan="6">No forecasts linked.</td></tr>'}</tbody></table></section><section><h2>Audit meaning</h2><p>This release preserves concise evidence, decisions, and rationale recorded by the workflow. It is an audit narrative, not private hidden model reasoning. Forecasts, paper outcomes, and broker-confirmed fills remain separate records.</p></section></body></html>'''


def scientist_selection_html(db: sqlite3.Connection, run_id: str) -> str:
    report = scientist_selection_report(db, run_id)
    esc = lambda value: html.escape(str(value if value is not None else ""))
    selections = []
    for item in report["selections"]:
        selections.append(
            f'<tr><td>{esc(item["asset_code"])}</td><td>{esc(item["contract"])}</td>'
            f'<td>{esc(item["timeframe"])}</td><td>{esc(item["direction"].upper())}</td>'
            f'<td>{esc(item["level_low"])}–{esc(item["level_high"])}</td>'
            f'<td>{esc(item["hold_probability"])}</td><td>{esc(item["entry_price"])}</td>'
            f'<td>{esc(item["stop_price"])}</td><td>{esc(item["target_price"])}</td>'
            f'<td>{esc(item["reward_risk"])}R</td><td>{esc(item["expires_at"])}</td>'
            f'<td>{esc(item["source_id"])}</td></tr>'
            f'<tr><td colspan="12" class="rationale">{esc(item["rationale"])}</td></tr>'
        )
    if report["status"] == "abstain":
        message = f'<p class="abstain">ABSTAIN — {esc(report.get("abstention_reason") or "No eligible levels qualified.")}</p>'
    elif report["status"] == "draft":
        message = '<p class="draft">Draft report. Complete and freeze the prediction step to publish these forecasts as the current selections.</p>'
    elif report["status"] == "blocked":
        message = '<p class="blocked">Report blocked. Resolve the listed evidence or workflow gaps before using these selections.</p>'
    else:
        message = '<p class="ready">Paper selection report ready. This is a research output, not an order.</p>'
    blockers = "".join(f'<li>{esc(item)}</li>' for item in report["blockers"])
    sources = "".join(
        f'<li><code>{esc(source.get("source_id"))}</code> · {esc(source.get("title"))} · '
        f'{esc(source.get("provider"))} · retrieved {esc(source.get("retrieved_at"))} · rights {esc(source.get("rights_status"))}</li>'
        for source in report["sources"]
    ) or "<li>No source records.</li>"
    body = "".join(selections) or '<tr><td colspan="12">No selections recorded.</td></tr>'
    run = report["run"]
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(run["asset_code"])} paper selections</title><style>:root{{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b0f;color:#e8edf3}}body{{max-width:1200px;margin:auto;padding:28px 18px}}header,section{{background:#10151b;border:1px solid #26313d;border-radius:8px;padding:16px;margin:12px 0}}h1{{margin:5px 0}}p,li{{color:#aeb9c6;line-height:1.5}}a{{color:#70cbd2}}.ready{{color:#9addb3}}.blocked{{color:#ff9d8c}}.abstain{{color:#f4cb68}}.draft{{color:#9bcfff}}.hash,code{{font:11px ui-monospace,monospace;color:#9fc9ef;overflow-wrap:anywhere}}table{{width:100%;border-collapse:collapse;display:block;overflow-x:auto}}th,td{{padding:8px;border-bottom:1px solid #26313d;text-align:left;font-size:11px;white-space:nowrap}}.rationale{{white-space:normal;color:#aab6c4}}</style></head><body><header><small>CHIEF SCIENTIST · PAPER / SHADOW ONLY</small><h1>{esc(run["asset_code"])} · {esc(run["trade_date"])} next-session selections</h1><p>{esc(run["contract"])} · {esc(run["session_open"])} → {esc(run["session_close"])} · {esc(run["method_version"])}</p>{message}<p class="hash">Report SHA-256: {esc(report["payload_sha256"])} · Preregistration: {esc(report.get("preregistration_sha256"))} · Data package: {esc(report.get("package_sha256"))}</p></header><section><h2>Selection candidates</h2><table><thead><tr><th>Asset</th><th>Contract</th><th>TF</th><th>Direction</th><th>Liquidity level</th><th>Hold probability</th><th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Expires</th><th>Evidence ID</th></tr></thead><tbody>{body}</tbody></table></section><section><h2>Blockers</h2><ul>{blockers or "<li>None recorded.</li>"}</ul></section><section><h2>Source boundary</h2><p>Forecast cutoff: {esc(report.get("cutoff_at") or "not recorded")}</p><ul>{sources}</ul><p>Selections are paper research hypotheses. Nothing on this page routes an order or confirms live market access.</p></section><p><a href="/scientist-release?run_id={quote(run_id)}">Back to session workflow</a></p></body></html>'''


def scientist_artifact_html(db: sqlite3.Connection, artifact_id: str) -> str:
    row = db.execute("SELECT * FROM scientist_run_artifacts WHERE artifact_id=?", (artifact_id,)).fetchone()
    if not row:
        raise ValueError("unknown artifact_id")
    content = html.escape(row["content"] or "")
    source = html.escape(row["source_url"] or "")
    source_link = f'<p><a href="{source}">Open source output</a></p>' if source else ""
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(row["title"])}</title><style>:root{{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#050608;color:#f4f6f8}}body{{max-width:900px;margin:auto;padding:32px 20px}}pre{{white-space:pre-wrap;line-height:1.6;background:#0b0d10;border:1px solid #272c34;border-radius:8px;padding:18px;color:#c7d0db}}a{{color:#71b8ff}}</style></head><body><small>SCIENTIST OUTPUT · {html.escape(row["step_key"])}</small><h1>{html.escape(row["title"])}</h1>{source_link}<pre>{content}</pre></body></html>'''


CURRENT_REPORT_FORECAST_SQL = """
AND NOT EXISTS (
  SELECT 1 FROM scientist_run_forecasts prior_link
  JOIN scientist_run_step_events override_event ON override_event.run_id=prior_link.run_id
  WHERE prior_link.forecast_id=f.forecast_id AND override_event.step_key='prediction'
    AND override_event.event_type='reopened'
    AND override_event.detail_json LIKE '%\"report_override\":true%'
    AND override_event.event_time>prior_link.linked_at
)
"""


def scientist_journal_data(db: sqlite3.Connection) -> dict:
    timeframes = []
    for timeframe in ["60m", "30m", "15m", "5m", "1m"]:
        rows = db.execute(
            "SELECT f.hold_probability, o.outcome, o.r_multiple FROM scientist_daily_forecasts f "
            "JOIN zones z USING(zone_id) LEFT JOIN scientist_forecast_outcomes o USING(forecast_id) "
            "WHERE z.timeframe=? " + CURRENT_REPORT_FORECAST_SQL, (timeframe,),
        ).fetchall()
        wins = sum(row["outcome"] == "target" for row in rows)
        losses = sum(row["outcome"] in {"stop", "timeout"} for row in rows)
        resolved = wins + losses
        outcomes = {name: sum(row["outcome"] == name for row in rows) for name in ("target", "stop", "timeout", "no_touch", "ambiguous", "invalidated")}
        r_values = [float(row["r_multiple"]) for row in rows if row["r_multiple"] is not None]
        timeframes.append({
            "timeframe": timeframe, "forecasts": len(rows), "resolved": resolved,
            "wins": wins, "losses": losses, "accuracy": wins / resolved if resolved else None,
            "wilson_95": wilson_interval(wins, resolved), "outcomes": outcomes,
            "mean_r": sum(r_values) / len(r_values) if r_values else None,
            "goal": 0.75,
        })
    asset_summaries = []
    for asset in ["MYM", "MCL", "MGC"]:
        rows = db.execute(
            "SELECT o.outcome, o.r_multiple FROM scientist_run_forecasts rf "
            "JOIN scientist_daily_runs r USING(run_id) JOIN scientist_daily_forecasts f USING(forecast_id) "
            "JOIN scientist_forecast_outcomes o USING(forecast_id) "
            "WHERE r.asset_code=? " + CURRENT_REPORT_FORECAST_SQL, (asset,),
        ).fetchall()
        wins = sum(row["outcome"] == "target" for row in rows)
        losses = sum(row["outcome"] in {"stop", "timeout"} for row in rows)
        denominator = wins + losses
        asset_summaries.append({"asset_code": asset, "resolved": denominator, "wins": wins,
                                "losses": losses, "accuracy": wins / denominator if denominator else None})
    records = db.execute(
        "SELECT f.forecast_id FROM scientist_daily_forecasts f WHERE 1=1 "
        + CURRENT_REPORT_FORECAST_SQL
        + " ORDER BY f.forecast_at DESC, f.forecast_id DESC LIMIT 200"
    ).fetchall()
    return {"goal_accuracy": 0.75, "timeframes": timeframes, "assets": asset_summaries,
            "records": [scientist_forecast_row(db, row["forecast_id"]) for row in records]}


def scientist_weekly_data(db: sqlite3.Connection) -> dict:
    """Build descriptive full-week cohorts from immutable daily forecasts/outcomes."""
    rows = db.execute(
        "SELECT r.run_id,r.trade_date,r.asset_code,r.contract,r.method_version,rf.linked_at,z.timeframe,"
        "f.hold_probability,o.outcome,o.r_multiple FROM scientist_daily_runs r "
        "LEFT JOIN scientist_run_forecasts rf USING(run_id) "
        "LEFT JOIN scientist_daily_forecasts f USING(forecast_id) "
        "LEFT JOIN zones z USING(zone_id) LEFT JOIN scientist_forecast_outcomes o USING(forecast_id) "
        "ORDER BY r.trade_date DESC,r.asset_code,z.timeframe"
    ).fetchall()
    override_rows = db.execute(
        "SELECT run_id,event_time,detail_json FROM scientist_run_step_events "
        "WHERE step_key='prediction' AND event_type='reopened' ORDER BY event_time"
    ).fetchall()
    override_at: dict[str, str] = {}
    for event in override_rows:
        if json.loads(event["detail_json"] or "{}").get("report_override") is True:
            override_at[event["run_id"]] = event["event_time"]
    cohorts: dict[tuple[str, str, str, str], list[sqlite3.Row]] = {}
    for row in rows:
        trade_day = date.fromisoformat(row["trade_date"])
        week_start = (trade_day - timedelta(days=trade_day.weekday())).isoformat()
        cohorts.setdefault((week_start, row["asset_code"], row["contract"], row["method_version"]), []).append(row)
    result = []
    disposition_names = ("target", "stop", "timeout", "no_touch", "ambiguous", "invalidated")
    for (week_start, asset, contract, method_version), items in sorted(cohorts.items(), reverse=True):
        forecast_items = [
            item for item in items if item["timeframe"] is not None
            and (item["run_id"] not in override_at or item["linked_at"] >= override_at[item["run_id"]])
        ]
        outcomes = [item["outcome"] for item in forecast_items if item["outcome"]]
        wins = outcomes.count("target")
        misses = outcomes.count("stop") + outcomes.count("timeout")
        touched = wins + misses
        closed = sum(outcome in set(disposition_names) for outcome in outcomes)
        probability_rows = [item for item in forecast_items if item["outcome"] in {"target", "stop", "timeout"}]
        brier = (sum((float(item["hold_probability"]) - (1.0 if item["outcome"] == "target" else 0.0)) ** 2 for item in probability_rows) / len(probability_rows)) if probability_rows else None
        r_values = [float(item["r_multiple"]) for item in forecast_items if item["r_multiple"] is not None]
        days = sorted({item["trade_date"] for item in items})
        forecast_days = {item["trade_date"] for item in forecast_items}
        timeframes = []
        for timeframe in ("60m", "30m", "15m", "5m", "1m"):
            subset = [item for item in forecast_items if item["timeframe"] == timeframe]
            subset_outcomes = [item["outcome"] for item in subset if item["outcome"]]
            sub_wins = subset_outcomes.count("target")
            sub_total = sum(outcome in {"target", "stop", "timeout"} for outcome in subset_outcomes)
            timeframes.append({
                "timeframe": timeframe, "forecasts": len(subset), "resolved_touched": sub_total,
                "targets": sub_wins, "accuracy": sub_wins / sub_total if sub_total else None,
                "wilson_95": wilson_interval(sub_wins, sub_total),
            })
        result.append({
            "week_start": week_start, "week_end": (date.fromisoformat(week_start) + timedelta(days=4)).isoformat(),
            "asset_code": asset, "contract": contract, "method_version": method_version,
            "sessions_tracked": len(days), "sessions_with_forecasts": len(forecast_days),
            "sessions_without_forecasts": len(days) - len(forecast_days), "trade_dates": days,
            "forecasts": len(forecast_items), "closed_forecasts": closed, "unresolved": len(forecast_items) - closed,
            "targets": wins, "misses": misses, "resolved_touched": touched,
            "accuracy": wins / touched if touched else None,
            "wilson_95": wilson_interval(wins, touched),
            "touch_coverage": touched / len(forecast_items) if forecast_items else None,
            "brier_score": brier, "mean_r": sum(r_values) / len(r_values) if r_values else None,
            "dispositions": {name: outcomes.count(name) for name in disposition_names},
            "timeframes": timeframes,
        })
    return {
        "cohorts": result[:36],
        "definition": "target / (target + stop + post-touch timeout); no-touch reported in coverage",
        "validation_status": "descriptive_only",
    }


def scientist_weekly_reviews_data(db: sqlite3.Connection) -> dict:
    rows = db.execute(
        "SELECT * FROM scientist_weekly_reviews ORDER BY week_start DESC,method_version,created_at DESC"
    ).fetchall()
    reviews = []
    for row in rows:
        item = dict(row)
        item["review"] = json.loads(item.pop("review_json"))
        item["score_snapshot"] = json.loads(item.pop("score_snapshot_json"))
        reviews.append(item)
    return {"reviews": reviews}


def scientist_weekly_preregistrations_data(db: sqlite3.Connection) -> dict:
    rows = db.execute(
        "SELECT * FROM scientist_weekly_preregistrations ORDER BY week_start DESC,method_version,created_at DESC"
    ).fetchall()
    preregistrations = []
    for row in rows:
        item = dict(row)
        item["preregistration"] = json.loads(item.pop("preregistration_json"))
        preregistrations.append(item)
    return {"preregistrations": preregistrations}


def append_scientist_weekly_preregistration(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    week_start = str(payload.get("week_start") or "").strip()
    try:
        parsed_week = date.fromisoformat(week_start)
    except ValueError as exc:
        raise ValueError("week_start must be YYYY-MM-DD") from exc
    if parsed_week.weekday() != 0:
        raise ValueError("week_start must be the Monday trade date")
    method_version = str(payload.get("method_version") or "").strip()
    if not method_version:
        raise ValueError("method_version is required")
    forecast_exists = db.execute(
        "SELECT 1 FROM scientist_run_forecasts rf JOIN scientist_daily_runs r USING(run_id) "
        "WHERE r.trade_date>=? AND r.trade_date<=? AND r.method_version=? LIMIT 1",
        (week_start, (parsed_week + timedelta(days=4)).isoformat(), method_version),
    ).fetchone()
    if forecast_exists:
        raise ValueError("preregistration must be frozen before the first linked forecast of this week")
    scheduled_raw = str(payload.get("scheduled_trade_dates") or "")
    scheduled_dates = sorted({item.strip() for item in re.split(r"[\n,]+", scheduled_raw) if item.strip()})
    if not scheduled_dates:
        raise ValueError("at least one approved scheduled trade date is required")
    for trade_date in scheduled_dates:
        try:
            parsed_day = date.fromisoformat(trade_date)
        except ValueError as exc:
            raise ValueError("scheduled_trade_dates must contain YYYY-MM-DD values") from exc
        if parsed_day < parsed_week or parsed_day > parsed_week + timedelta(days=4) or parsed_day.weekday() > 4:
            raise ValueError("scheduled trade dates must be weekdays inside the selected Monday-Friday cohort")
    try:
        min_forecasts = int(payload.get("minimum_eligible_forecasts"))
        min_resolved = int(payload.get("minimum_resolved_touched"))
        min_coverage = float(payload.get("minimum_touch_coverage_percent")) / 100.0
    except (TypeError, ValueError) as exc:
        raise ValueError("minimum sample and touch coverage fields must be numeric") from exc
    if min_forecasts < 1 or min_resolved < 1 or min_resolved > min_forecasts:
        raise ValueError("sample thresholds must be positive and resolved sample cannot exceed eligible sample")
    if not 0 < min_coverage <= 1:
        raise ValueError("minimum touch coverage must be above 0 and at most 100 percent")
    fields = {
        "question": "question", "baseline": "baseline",
        "calendar_source": "calendar_source", "source_boundary": "source_boundary",
        "sequential_plan": "sequential_plan", "decision_rule": "decision_rule",
    }
    preregistration = {key: str(payload.get(key) or "").strip() for key in fields}
    missing = [key for key, value in preregistration.items() if not value]
    if missing:
        raise ValueError("required preregistration fields are missing: " + ", ".join(missing))
    preregistration.update({
        "week_start": week_start, "week_end": (parsed_week + timedelta(days=4)).isoformat(),
        "method_version": method_version, "trade_dates": scheduled_dates,
        "asset_codes": ["MYM", "MCL", "MGC"], "target_accuracy": 0.75,
        "minimum_eligible_forecasts": min_forecasts,
        "minimum_resolved_touched": min_resolved,
        "minimum_touch_coverage": min_coverage,
        "recorded_by": str(payload.get("recorded_by") or "user").strip(),
    })
    created_at = utc_now()
    body = {"preregistration": preregistration, "created_at": created_at}
    prereg_id = "swp-" + secrets.token_hex(12)
    digest = payload_hash(body)
    db.execute(
        "INSERT INTO scientist_weekly_preregistrations VALUES (?,?,?,?,?,?)",
        (prereg_id, week_start, method_version, canonical_json(preregistration), digest, created_at),
    )
    db.commit()
    return {"preregistration_id": prereg_id, "preregistration": preregistration,
            "payload_sha256": digest, "created_at": created_at}


def append_scientist_weekly_review(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    week_start = str(payload.get("week_start") or "").strip()
    try:
        parsed_week = date.fromisoformat(week_start)
    except ValueError as exc:
        raise ValueError("week_start must be YYYY-MM-DD") from exc
    if parsed_week.weekday() != 0:
        raise ValueError("week_start must be the Monday trade date")
    week_end = parsed_week + timedelta(days=4)
    if week_end >= datetime.now(CHICAGO).date():
        raise ValueError("a weekly review can be recorded only after the Friday trade date has closed")
    method_version = str(payload.get("method_version") or "").strip()
    if not method_version:
        raise ValueError("method_version is required")
    required = ("chief_summary", "testing_by", "testing_disposition", "reviewed_by",
                "review_disposition", "proposal", "decision", "firstmate_disposition")
    values = {key: str(payload.get(key) or "").strip() for key in required}
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise ValueError("required weekly review fields are missing: " + ", ".join(missing))
    if values["testing_disposition"] not in {"PASS", "RETURN", "BLOCK"}:
        raise ValueError("testing_disposition must be PASS, RETURN, or BLOCK")
    if values["review_disposition"] not in {"ACCEPT", "RETURN", "REJECT", "BLOCK"}:
        raise ValueError("review_disposition must be ACCEPT, RETURN, REJECT, or BLOCK")
    if values["decision"] not in {"RETAIN", "INVESTIGATE", "PROPOSE_NEW_VERSION", "STOP_STUDY"}:
        raise ValueError("decision is not supported")
    if values["firstmate_disposition"] not in {"PENDING", "SUBMITTED", "APPROVED", "RETURNED", "REJECTED"}:
        raise ValueError("firstmate_disposition is not supported")
    next_method_version = str(payload.get("next_method_version") or "").strip()
    if values["decision"] == "PROPOSE_NEW_VERSION" and not next_method_version:
        raise ValueError("next_method_version is required when proposing a new version")
    scores = [
        row for row in scientist_weekly_data(db)["cohorts"]
        if row["week_start"] == week_start and row["method_version"] == method_version
    ]
    if not scores:
        raise ValueError("no weekly scorecard cohorts match this week and method version")
    if any(row["unresolved"] for row in scores):
        raise ValueError("weekly review is blocked while scorecard forecasts remain unresolved")
    prereg_row = db.execute(
        "SELECT preregistration_id,preregistration_json,payload_sha256 FROM scientist_weekly_preregistrations "
        "WHERE week_start=? AND method_version=? ORDER BY created_at DESC LIMIT 1",
        (week_start, method_version),
    ).fetchone()
    if not prereg_row:
        raise ValueError("weekly review requires a frozen preregistration for the same week and method version")
    prereg = json.loads(prereg_row["preregistration_json"])
    forecast_total = sum(row["forecasts"] for row in scores)
    touched_total = sum(row["resolved_touched"] for row in scores)
    observed_sessions = {
        (row["asset_code"], trade_date)
        for row in scores for trade_date in row["trade_dates"]
    }
    scheduled_sessions = {
        (asset, trade_date)
        for asset in prereg["asset_codes"] for trade_date in prereg["trade_dates"]
    }
    snapshot_assessment = {
        "eligible_forecasts": forecast_total,
        "minimum_eligible_forecasts": prereg["minimum_eligible_forecasts"],
        "eligible_sample_pass": forecast_total >= prereg["minimum_eligible_forecasts"],
        "resolved_touched": touched_total,
        "minimum_resolved_touched": prereg["minimum_resolved_touched"],
        "resolved_sample_pass": touched_total >= prereg["minimum_resolved_touched"],
        "touch_coverage": touched_total / forecast_total if forecast_total else None,
        "minimum_touch_coverage": prereg["minimum_touch_coverage"],
        "coverage_pass": bool(forecast_total and touched_total / forecast_total >= prereg["minimum_touch_coverage"]),
        "scheduled_asset_sessions": len(scheduled_sessions),
        "observed_asset_sessions": len(observed_sessions & scheduled_sessions),
        "missing_asset_sessions": [list(item) for item in sorted(scheduled_sessions - observed_sessions)],
        "target_accuracy": prereg["target_accuracy"],
        "status": "sample_and_coverage_complete" if (
            forecast_total >= prereg["minimum_eligible_forecasts"]
            and touched_total >= prereg["minimum_resolved_touched"]
            and forecast_total and touched_total / forecast_total >= prereg["minimum_touch_coverage"]
            and not (scheduled_sessions - observed_sessions)
        ) else "descriptive_or_incomplete",
    }
    review = {
        **values,
        "week_end": week_end.isoformat(),
        "method_version": method_version,
        "next_method_version": next_method_version or None,
        "preregistration_id": prereg_row["preregistration_id"],
        "preregistration_sha256": prereg_row["payload_sha256"],
        "snapshot_assessment": snapshot_assessment,
        "tested_by": values["testing_by"],
        "reviewed_by": values["reviewed_by"],
        "test_notes": str(payload.get("test_notes") or "").strip(),
        "review_notes": str(payload.get("review_notes") or "").strip(),
        "firstmate_task_id": str(payload.get("firstmate_task_id") or "").strip() or None,
        "recorded_by": str(payload.get("recorded_by") or "user").strip(),
    }
    created_at = utc_now()
    body = {"week_start": week_start, "method_version": method_version,
            "preregistration_id": prereg_row["preregistration_id"],
            "preregistration_sha256": prereg_row["payload_sha256"],
            "review": review, "score_snapshot": scores, "created_at": created_at}
    review_id = "swr-" + secrets.token_hex(12)
    db.execute(
        "INSERT INTO scientist_weekly_reviews VALUES (?,?,?,?,?,?,?)",
        (review_id, week_start, method_version, canonical_json(review),
         canonical_json(scores), payload_hash(body), created_at),
    )
    db.commit()
    return {"review_id": review_id, "week_start": week_start, "method_version": method_version,
            "review": review, "score_snapshot": scores, "payload_sha256": payload_hash(body),
            "created_at": created_at}


def append_zone_event(
    db: sqlite3.Connection, zone_id: str, event_type: str, event_time: str,
    price: float | None, source: str, detail: dict,
) -> dict:
    normalized_time = parse_time(event_time, "event_time")
    body = {
        "zone_id": zone_id, "event_type": event_type, "event_time": normalized_time,
        "price": price, "source": source, "detail": detail,
    }
    sha = payload_hash(body)
    event_id = "ze-" + sha[:22]
    db.execute(
        "INSERT OR IGNORE INTO zone_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (event_id, zone_id, event_type, normalized_time, price, source,
         canonical_json(detail), sha, utc_now()),
    )
    return row_dict(db.execute("SELECT * FROM zone_events WHERE event_id=?", (event_id,)).fetchone())


def zone_is_terminal(db: sqlite3.Connection, zone_id: str) -> bool:
    placeholders = ",".join("?" for _ in TERMINAL_ZONE_EVENTS)
    return db.execute(
        f"SELECT 1 FROM zone_events WHERE zone_id=? AND event_type IN ({placeholders}) LIMIT 1",
        (zone_id, *TERMINAL_ZONE_EVENTS),
    ).fetchone() is not None


def zone_is_touched(db: sqlite3.Connection, zone_id: str) -> bool:
    return db.execute(
        "SELECT 1 FROM zone_events WHERE zone_id=? AND event_type='touched' LIMIT 1", (zone_id,)
    ).fetchone() is not None


def open_zones(db: sqlite3.Connection, contract: str, timeframe: str | None = None) -> list[sqlite3.Row]:
    params: list[object] = [contract]
    tf_clause = ""
    if timeframe:
        tf_clause = " AND z.timeframe=?"
        params.append(timeframe)
    rows = db.execute(
        "SELECT z.* FROM zones z WHERE z.contract=?" + tf_clause +
        " AND NOT EXISTS (SELECT 1 FROM zone_events e WHERE e.zone_id=z.zone_id "
        "AND e.event_type IN ('expired','cancelled','invalidated')) ORDER BY z.available_time",
        params,
    ).fetchall()
    return [row for row in rows if not zone_is_touched(db, row["zone_id"])]


def target_candidates(db: sqlite3.Connection, zone: sqlite3.Row, entry_price: float, event_time: str) -> list[dict]:
    opposite = "SSL" if zone["side"] == "BSL" else "BSL"
    rows = db.execute(
        "SELECT z.* FROM zones z WHERE z.contract=? AND z.timeframe=? AND z.side=? "
        "AND z.available_time<=? AND z.zone_id<>? "
        "AND NOT EXISTS (SELECT 1 FROM zone_events e WHERE e.zone_id=z.zone_id "
        "AND e.event_type IN ('expired','cancelled','invalidated'))",
        (zone["contract"], zone["timeframe"], opposite, event_time, zone["zone_id"]),
    ).fetchall()
    candidates = []
    for row in rows:
        level = row["zone_top"] if zone["side"] == "BSL" else row["zone_bottom"]
        valid = level < entry_price if zone["side"] == "BSL" else level > entry_price
        if valid:
            candidates.append({"zone": row, "price": level, "distance": abs(entry_price - level)})
    return sorted(candidates, key=lambda item: item["distance"])


def active_executable_trial(db: sqlite3.Connection, contract: str) -> sqlite3.Row | None:
    return db.execute(
        "SELECT t.* FROM trials t LEFT JOIN trial_outcomes o ON o.trial_id=t.trial_id "
        "WHERE t.contract=? AND t.executable_status='eligible_first_in' AND o.trial_id IS NULL "
        "ORDER BY t.entry_time LIMIT 1",
        (contract,),
    ).fetchone()


def create_trial(
    db: sqlite3.Connection, zone: sqlite3.Row, event_time: str, entry_price: float,
    entry_source: str,
) -> dict | None:
    existing = db.execute("SELECT * FROM trials WHERE zone_id=?", (zone["zone_id"],)).fetchone()
    if existing:
        return dict(existing)
    candidates = target_candidates(db, zone, entry_price, event_time)
    if not candidates:
        append_zone_event(
            db, zone["zone_id"], "trade_ineligible_no_target", event_time, entry_price,
            entry_source, {"reason": "no active opposite-side target on the same timeframe"},
        )
        return None
    target = candidates[0]
    eco = economics()
    direction = "short" if zone["side"] == "BSL" else "long"
    stop_price = entry_price + eco.stop_ticks * eco.tick_size if direction == "short" else entry_price - eco.stop_ticks * eco.tick_size
    trial_seed = f"{zone['zone_id']}|{event_time}|{entry_price}|{target['zone']['zone_id']}|{target['price']}"
    trial_id = "trial-" + hashlib.sha256(trial_seed.encode()).hexdigest()[:20]
    executable_status = "blocked_existing_position" if active_executable_trial(db, zone["contract"]) else "eligible_first_in"
    db.execute(
        "INSERT INTO trials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
        (
            trial_id, zone["zone_id"], zone["protocol_version"], zone["contract"],
            zone["timeframe"], direction, event_time, entry_price, stop_price,
            target["zone"]["zone_id"], target["price"], executable_status,
            entry_source, utc_now(),
        ),
    )
    return row_dict(db.execute("SELECT * FROM trials WHERE trial_id=?", (trial_id,)).fetchone())


def entry_price_for(zone: sqlite3.Row, bid: float | None = None, ask: float | None = None) -> float:
    eco = economics()
    if zone["side"] == "BSL":
        return float(bid) if bid is not None else zone["zone_bottom"] - eco.entry_slippage_ticks * eco.tick_size
    return float(ask) if ask is not None else zone["zone_top"] + eco.entry_slippage_ticks * eco.tick_size


def touch_zone(
    db: sqlite3.Connection, zone: sqlite3.Row, event_time: str, source: str,
    price: float, bid: float | None = None, ask: float | None = None,
) -> dict:
    if zone_is_touched(db, zone["zone_id"]):
        return {"touched": False, "reason": "already_touched"}
    entry_price = entry_price_for(zone, bid, ask)
    event = append_zone_event(
        db, zone["zone_id"], "touched", event_time, price, source,
        {"entry_price": entry_price, "near_boundary": zone["zone_bottom"] if zone["side"] == "BSL" else zone["zone_top"]},
    )
    trial = create_trial(db, zone, event_time, entry_price, source)
    return {"touched": True, "event": event, "trial": trial}


def tick_hits_zone(zone: sqlite3.Row, price: float) -> bool:
    return price >= zone["zone_bottom"] if zone["side"] == "BSL" else price <= zone["zone_top"]


def gross_ticks(trial: sqlite3.Row, exit_price: float) -> float:
    points = exit_price - trial["entry_price"] if trial["direction"] == "long" else trial["entry_price"] - exit_price
    return points / economics().tick_size


def record_outcome(
    db: sqlite3.Connection, trial: sqlite3.Row, outcome: str, event_time: str,
    exit_price: float, source: str, ambiguous: bool = False, detail: dict | None = None,
) -> dict:
    existing = db.execute("SELECT * FROM trial_outcomes WHERE trial_id=?", (trial["trial_id"],)).fetchone()
    if existing:
        return dict(existing)
    eco = economics()
    ticks = gross_ticks(trial, exit_price)
    gross = ticks * eco.tick_value
    fees = eco.round_turn_cost
    net = gross - fees
    initial_risk = eco.stop_ticks * eco.tick_value
    r_multiple = net / initial_risk if initial_risk else 0.0
    db.execute(
        "INSERT INTO trial_outcomes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            trial["trial_id"], outcome, event_time, exit_price, ticks, gross, fees, net,
            r_multiple, source, int(ambiguous), canonical_json(detail or {}), utc_now(),
        ),
    )
    return row_dict(db.execute("SELECT * FROM trial_outcomes WHERE trial_id=?", (trial["trial_id"],)).fetchone())


def resolve_trial_price(db: sqlite3.Connection, trial: sqlite3.Row, event_time: str, price: float, source: str) -> dict | None:
    if event_time <= trial["entry_time"]:
        return None
    if trial["direction"] == "long":
        if price >= trial["target_price"]:
            return record_outcome(db, trial, "target", event_time, trial["target_price"], source)
        if price <= trial["stop_price"]:
            exit_price = trial["stop_price"] - economics().stop_slippage_ticks * economics().tick_size
            return record_outcome(db, trial, "stop", event_time, exit_price, source)
    else:
        if price <= trial["target_price"]:
            return record_outcome(db, trial, "target", event_time, trial["target_price"], source)
        if price >= trial["stop_price"]:
            exit_price = trial["stop_price"] + economics().stop_slippage_ticks * economics().tick_size
            return record_outcome(db, trial, "stop", event_time, exit_price, source)
    return None


def open_trials(db: sqlite3.Connection, contract: str, timeframe: str | None = None) -> list[sqlite3.Row]:
    params: list[object] = [contract]
    tf_clause = ""
    if timeframe:
        tf_clause = " AND t.timeframe=?"
        params.append(timeframe)
    return db.execute(
        "SELECT t.* FROM trials t LEFT JOIN trial_outcomes o ON o.trial_id=t.trial_id "
        "WHERE t.contract=?" + tf_clause + " AND o.trial_id IS NULL ORDER BY t.entry_time",
        params,
    ).fetchall()


def ingest_tick(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    contract = str(payload.get("contract") or payload.get("symbol") or "").strip()
    if not contract:
        raise ValueError("contract is required")
    event_time = parse_time(payload.get("event_time") or payload.get("time"), "event_time")
    price = float(payload["price"])
    bid = float(payload["bid"]) if payload.get("bid") is not None else None
    ask = float(payload["ask"]) if payload.get("ask") is not None else None
    clean = canonical_json(payload)
    sha = hashlib.sha256(clean.encode()).hexdigest()
    tick_id = str(payload.get("tick_id") or "tick-" + sha[:22])
    inserted = db.execute(
        "INSERT OR IGNORE INTO market_ticks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tick_id, contract, event_time, price, bid, ask, str(payload.get("source") or "tick_feed"), sha, utc_now()),
    ).rowcount
    if not inserted:
        return {"created": False, "tick_id": tick_id, "touched": [], "outcomes": []}
    outcomes = []
    for trial in open_trials(db, contract):
        result = resolve_trial_price(db, trial, event_time, price, "tick")
        if result:
            outcomes.append(result)
    touched = []
    for zone in open_zones(db, contract):
        if event_time >= zone["available_time"] and tick_hits_zone(zone, price):
            touched.append(touch_zone(db, zone, event_time, "tick", price, bid, ask))
    db.commit()
    return {"created": True, "tick_id": tick_id, "touched": touched, "outcomes": outcomes}


def bar_count_since(db: sqlite3.Connection, contract: str, timeframe: str, start_time: str, through: str) -> int:
    return int(db.execute(
        "SELECT COUNT(*) FROM market_bars WHERE contract=? AND timeframe=? AND bar_time>? AND bar_time<=?",
        (contract, timeframe, start_time, through),
    ).fetchone()[0])


def resolve_trial_bar(db: sqlite3.Connection, trial: sqlite3.Row, bar: dict) -> dict | None:
    if bar["bar_time"] <= trial["entry_time"]:
        return None
    hit_target = bar["high"] >= trial["target_price"] if trial["direction"] == "long" else bar["low"] <= trial["target_price"]
    hit_stop = bar["low"] <= trial["stop_price"] if trial["direction"] == "long" else bar["high"] >= trial["stop_price"]
    if hit_target and hit_stop:
        exit_price = trial["stop_price"] - economics().stop_slippage_ticks * economics().tick_size if trial["direction"] == "long" else trial["stop_price"] + economics().stop_slippage_ticks * economics().tick_size
        return record_outcome(
            db, trial, "ambiguous", bar["bar_time"], exit_price, "aggregate_bar",
            True, {"conservative_economic_assumption": "stop_first", "bar": bar},
        )
    if hit_target:
        return record_outcome(db, trial, "target", bar["bar_time"], trial["target_price"], "aggregate_bar")
    if hit_stop:
        exit_price = trial["stop_price"] - economics().stop_slippage_ticks * economics().tick_size if trial["direction"] == "long" else trial["stop_price"] + economics().stop_slippage_ticks * economics().tick_size
        return record_outcome(db, trial, "stop", bar["bar_time"], exit_price, "aggregate_bar")
    expiry = int(load_protocol()["reaction_expiry_bars"])
    if bar_count_since(db, trial["contract"], trial["timeframe"], trial["entry_time"], bar["bar_time"]) >= expiry:
        return record_outcome(
            db, trial, "timeout", bar["bar_time"], bar["close"], "aggregate_bar",
            False, {"expiry_bars": expiry},
        )
    return None


def ingest_bar(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    contract = str(payload.get("contract") or payload.get("symbol") or "").strip()
    if not contract:
        raise ValueError("contract is required")
    timeframe = normalize_timeframe(payload.get("timeframe"))
    bar_time = parse_time(payload.get("bar_time") or payload.get("time"), "bar_time")
    bar = {
        "contract": contract, "timeframe": timeframe, "bar_time": bar_time,
        "open": float(payload["open"]), "high": float(payload["high"]),
        "low": float(payload["low"]), "close": float(payload["close"]),
        "volume": float(payload["volume"]) if payload.get("volume") is not None else None,
    }
    if bar["high"] < bar["low"] or not bar["low"] <= bar["open"] <= bar["high"] or not bar["low"] <= bar["close"] <= bar["high"]:
        raise ValueError("OHLC values are inconsistent")
    sha = payload_hash(payload)
    inserted = db.execute(
        "INSERT OR IGNORE INTO market_bars VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            contract, timeframe, bar_time, bar["open"], bar["high"], bar["low"],
            bar["close"], bar["volume"], str(payload.get("source") or "bar_feed"), sha, utc_now(),
        ),
    ).rowcount
    if not inserted:
        return {"created": False, "bar": bar, "touched": [], "outcomes": [], "expired": []}

    outcomes = []
    for trial in open_trials(db, contract, timeframe):
        result = resolve_trial_bar(db, trial, bar)
        if result:
            outcomes.append(result)

    touched = []
    expired = []
    for zone in open_zones(db, contract, timeframe):
        if bar_time < zone["available_time"]:
            continue
        hit = bar["high"] >= zone["zone_bottom"] if zone["side"] == "BSL" else bar["low"] <= zone["zone_top"]
        if hit:
            result = touch_zone(db, zone, bar_time, "aggregate_bar", bar["close"])
            trial = result.get("trial")
            if trial:
                hit_any_exit = (
                    bar["high"] >= trial["target_price"] or bar["low"] <= trial["stop_price"]
                    if trial["direction"] == "long"
                    else bar["low"] <= trial["target_price"] or bar["high"] >= trial["stop_price"]
                )
                if hit_any_exit:
                    exit_price = trial["stop_price"] - economics().stop_slippage_ticks * economics().tick_size if trial["direction"] == "long" else trial["stop_price"] + economics().stop_slippage_ticks * economics().tick_size
                    outcome = record_outcome(
                        db, trial, "ambiguous", bar_time, exit_price, "aggregate_entry_bar", True,
                        {"reason": "entry and an exit threshold occur in the same aggregate bar", "bar": bar},
                    )
                    outcomes.append(outcome)
            touched.append(result)
            continue
        expiry = int(load_protocol()["attraction_expiry_bars"])
        if bar_count_since(db, contract, timeframe, zone["available_time"], bar_time) >= expiry:
            expired.append(append_zone_event(
                db, zone["zone_id"], "expired", bar_time, bar["close"], "aggregate_bar",
                {"expiry_bars": expiry, "outcome": "untouched"},
            ))
    db.commit()
    return {"created": True, "bar": bar, "touched": touched, "outcomes": outcomes, "expired": expired}


def add_zone_event(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    zone_id = str(payload.get("zone_id") or "")
    if not db.execute("SELECT 1 FROM zones WHERE zone_id=?", (zone_id,)).fetchone():
        raise ValueError("unknown zone_id")
    event_type = str(payload.get("event_type") or "")
    if event_type not in {"cancelled", "invalidated"}:
        raise ValueError("manual zone event must be cancelled or invalidated")
    result = append_zone_event(
        db, zone_id, event_type, payload.get("event_time"),
        float(payload["price"]) if payload.get("price") is not None else None,
        str(payload.get("source") or "manual"), payload.get("detail") or {},
    )
    db.commit()
    return result


def add_calendar_event(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    source = str(payload.get("source") or "").strip()
    source_event_id = str(payload.get("source_event_id") or payload.get("event_id") or "").strip()
    if not source or not source_event_id:
        raise ValueError("source and source_event_id are required")
    event_id = f"{source}:{source_event_id}"
    scheduled = parse_time(payload.get("scheduled_time"), "scheduled_time")
    actual = parse_time(payload["actual_time"], "actual_time") if payload.get("actual_time") else None
    raw = canonical_json(payload)
    sha = hashlib.sha256(raw.encode()).hexdigest()
    db.execute(
        "INSERT OR IGNORE INTO calendar_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            event_id, source, str(payload.get("title") or source_event_id),
            str(payload.get("category") or "scheduled_macro"), scheduled, actual,
            raw, sha, utc_now(),
        ),
    )
    db.commit()
    return row_dict(db.execute("SELECT * FROM calendar_events WHERE event_id=?", (event_id,)).fetchone())


def add_fill(db: sqlite3.Connection, incoming: dict) -> dict:
    payload = clean_payload(incoming)
    broker = str(payload.get("broker") or "").strip()
    contract = str(payload.get("contract") or "").strip()
    side = str(payload.get("side") or "").lower()
    if not broker or not contract or side not in {"buy", "sell"}:
        raise ValueError("broker, contract, and side=buy|sell are required")
    fill_time = parse_time(payload.get("fill_time"), "fill_time")
    raw = canonical_json(payload)
    sha = hashlib.sha256(raw.encode()).hexdigest()
    fill_id = str(payload.get("fill_id") or f"fill-{sha[:22]}")
    trial_id = payload.get("trial_id")
    if trial_id and not db.execute("SELECT 1 FROM trials WHERE trial_id=?", (trial_id,)).fetchone():
        raise ValueError("unknown trial_id")
    db.execute(
        "INSERT OR IGNORE INTO execution_fills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            fill_id, trial_id, broker, contract, payload.get("order_id"), side,
            int(payload.get("quantity") or 1), float(payload["price"]), fill_time,
            float(payload["commission"]) if payload.get("commission") is not None else None,
            raw, sha, utc_now(),
        ),
    )
    db.commit()
    return row_dict(db.execute("SELECT * FROM execution_fills WHERE fill_id=?", (fill_id,)).fetchone())


def percentile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("percentile requires values")
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def day_block_bootstrap(records: list[dict], statistic, iterations: int = 1000) -> list[float] | None:
    groups: dict[str, list[dict]] = {}
    for record in records:
        groups.setdefault(record["day"], []).append(record)
    days = sorted(groups)
    if len(days) < 5:
        return None
    seed = int(hashlib.sha256(canonical_json(records).encode()).hexdigest()[:16], 16)
    rng = random.Random(seed)
    results = []
    for _ in range(iterations):
        sample = []
        for _ in days:
            sample.extend(groups[rng.choice(days)])
        value = statistic(sample)
        if value is not None and math.isfinite(value):
            results.append(float(value))
    if len(results) < iterations * 0.8:
        return None
    return [percentile(results, 0.025), percentile(results, 0.975)]


def brier_skill(records: list[dict]) -> float | None:
    if not records:
        return None
    base_rate = sum(record["y"] for record in records) / len(records)
    base_brier = sum((base_rate - record["y"]) ** 2 for record in records) / len(records)
    if base_brier == 0:
        return None
    score = sum((record["p"] - record["y"]) ** 2 for record in records) / len(records)
    return 1 - score / base_brier


def brier_metrics(records: list[dict]) -> dict | None:
    if not records:
        return None
    n = len(records)
    brier = sum((record["p"] - record["y"]) ** 2 for record in records) / n
    base_rate = sum(record["y"] for record in records) / n
    base_brier = sum((base_rate - record["y"]) ** 2 for record in records) / n
    skill = None if base_brier == 0 else 1 - brier / base_brier
    return {
        "n": n, "brier": brier, "base_rate": base_rate, "base_brier": base_brier,
        "skill": skill, "skill_block_bootstrap_95": day_block_bootstrap(records, brier_skill),
    }


def calibration_bins(records: list[dict]) -> list[dict]:
    result = []
    for lower in [i / 10 for i in range(10)]:
        upper = lower + 0.1
        bucket = [record for record in records if lower <= record["p"] < upper or (upper == 1 and record["p"] == 1)]
        if bucket:
            result.append({
                "lower": lower, "upper": upper, "n": len(bucket),
                "mean_probability": sum(record["p"] for record in bucket) / len(bucket),
                "observed_rate": sum(record["y"] for record in bucket) / len(bucket),
            })
    return result


def scorable_records(db: sqlite3.Connection, event_name: str) -> list[dict]:
    records: list[dict] = []
    if event_name == "attraction":
        rows = db.execute(
            "SELECT z.zone_id, z.forecast_probability, "
            "EXISTS(SELECT 1 FROM zone_events e WHERE e.zone_id=z.zone_id AND e.event_type='touched') touched, "
            "EXISTS(SELECT 1 FROM zone_events e WHERE e.zone_id=z.zone_id AND e.event_type='expired') expired, "
            "COALESCE((SELECT MIN(event_time) FROM zone_events e WHERE e.zone_id=z.zone_id AND e.event_type='touched'), "
            "(SELECT MIN(event_time) FROM zone_events e WHERE e.zone_id=z.zone_id AND e.event_type='expired')) outcome_time "
            "FROM zones z WHERE z.forecast_event='attraction' AND z.forecast_probability IS NOT NULL"
        ).fetchall()
        for row in rows:
            if row["touched"] or row["expired"]:
                records.append({
                    "p": row["forecast_probability"], "y": 1 if row["touched"] else 0,
                    "day": row["outcome_time"][:10],
                })
    elif event_name == "reaction":
        rows = db.execute(
            "SELECT z.forecast_probability, o.outcome, o.outcome_time, o.ambiguous FROM zones z "
            "JOIN trials t ON t.zone_id=z.zone_id JOIN trial_outcomes o ON o.trial_id=t.trial_id "
            "WHERE z.forecast_event='reaction' AND z.forecast_probability IS NOT NULL"
        ).fetchall()
        for row in rows:
            if not row["ambiguous"]:
                records.append({
                    "p": row["forecast_probability"], "y": 1 if row["outcome"] == "target" else 0,
                    "day": row["outcome_time"][:10],
                })
    return records


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> list[float] | None:
    if total <= 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = z * math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return [max(0.0, center - margin), min(1.0, center + margin)]


def timeframe_summary(db: sqlite3.Connection) -> list[dict]:
    result = []
    for timeframe in ["60m", "30m", "15m", "5m", "1m"]:
        zones = int(db.execute("SELECT COUNT(*) FROM zones WHERE timeframe=?", (timeframe,)).fetchone()[0])
        touched = int(db.execute(
            "SELECT COUNT(DISTINCT z.zone_id) FROM zones z JOIN zone_events e ON e.zone_id=z.zone_id "
            "WHERE z.timeframe=? AND e.event_type='touched'", (timeframe,)
        ).fetchone()[0])
        trials = int(db.execute("SELECT COUNT(*) FROM trials WHERE timeframe=?", (timeframe,)).fetchone()[0])
        outcome_rows = db.execute(
            "SELECT o.outcome, COUNT(*) n FROM trials t JOIN trial_outcomes o ON o.trial_id=t.trial_id "
            "WHERE t.timeframe=? GROUP BY o.outcome", (timeframe,)
        ).fetchall()
        outcomes = {row["outcome"]: row["n"] for row in outcome_rows}
        clean_resolved = sum(n for name, n in outcomes.items() if name != "ambiguous")
        target_rate = outcomes.get("target", 0) / clean_resolved if clean_resolved else None
        target_interval = wilson_interval(outcomes.get("target", 0), clean_resolved)
        net = db.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(o.net_dollars),0) net, COALESCE(AVG(o.r_multiple),0) expectancy "
            "FROM trials t JOIN trial_outcomes o ON o.trial_id=t.trial_id "
            "WHERE t.timeframe=? AND o.ambiguous=0", (timeframe,)
        ).fetchone()
        expectancy_records = [
            {"day": row["outcome_time"][:10], "value": row["r_multiple"]}
            for row in db.execute(
                "SELECT o.outcome_time, o.r_multiple FROM trials t JOIN trial_outcomes o ON o.trial_id=t.trial_id "
                "WHERE t.timeframe=? AND o.ambiguous=0", (timeframe,)
            ).fetchall()
        ]
        expectancy_interval = day_block_bootstrap(
            expectancy_records,
            lambda sample: sum(item["value"] for item in sample) / len(sample) if sample else None,
        )
        result.append({
            "timeframe": timeframe, "zones": zones, "touched": touched, "trials": trials,
            "outcomes": outcomes, "clean_resolved": clean_resolved, "target_rate": target_rate,
            "target_rate_wilson_95": target_interval,
            "net_dollars": net["net"], "expectancy_r": net["expectancy"] if net["n"] else None,
            "expectancy_r_day_block_bootstrap_95": expectancy_interval,
        })
    return result


def user_suggested_level_metrics() -> dict:
    empty_rows = [{"timeframe":tf,"plans":0,"resolved":0,"win_rate":None,"avg_r":None,"mfe_points":None,"mae_points":None} for tf in ["1H","30M","15M","5M","1M"]]
    if not COUNT_DESK_DB.exists():
        return {"plans":0,"open":0,"resolved":0,"win_rate":None,"avg_r":None,"net_points":0,"gross_dollars":0,"timeframes":empty_rows,"context_cohorts":[]}
    try:
        source = sqlite3.connect(f"file:{quote(str(COUNT_DESK_DB))}?mode=ro", uri=True, timeout=2)
        source.row_factory = sqlite3.Row
        plans = source.execute("SELECT * FROM trade_journal ORDER BY created_at").fetchall()
    except sqlite3.Error:
        try: source.close()
        except Exception: pass
        return {"plans":0,"open":0,"resolved":0,"win_rate":None,"avg_r":None,"net_points":0,"gross_dollars":0,"timeframes":empty_rows,"context_cohorts":[]}
    records=[]
    for plan in plans:
        events=source.execute("SELECT event_type,detail_json FROM trade_journal_events WHERE trade_id=? ORDER BY event_time,created_at,rowid",(plan["trade_id"],)).fetchall()
        parsed=[(event["event_type"],json.loads(event["detail_json"])) for event in events]
        terminal=next(((kind,detail) for kind,detail in reversed(parsed) if kind in {"target_hit","stop_hit","ambiguous_exit","manual_exit"}),None)
        updates=[detail for kind,detail in parsed if kind in {"bar_update","target_hit","stop_hit","ambiguous_exit","manual_exit"}]
        records.append({
            "timeframe":plan["timeframe"],"side":plan["side"],"outcome":terminal[0] if terminal else None,
            "detail":terminal[1] if terminal else {},
            "mfe":max((float(item.get("mfe_points",0)) for item in updates),default=0),
            "mae":max((float(item.get("mae_points",0)) for item in updates),default=0),
            "context":json.loads(plan["context_json"] or "{}"),
        })
    source.close()
    resolved=[row for row in records if row["outcome"]]
    wins=[row for row in resolved if float(row["detail"].get("pnl_points",0))>0]
    rows=[]
    for timeframe in ["1H","30M","15M","5M","1M"]:
        cohort=[row for row in records if row["timeframe"]==timeframe]
        closed=[row for row in cohort if row["outcome"]]
        cohort_wins=[row for row in closed if float(row["detail"].get("pnl_points",0))>0]
        r_values=[float(row["detail"]["r_multiple"]) for row in closed if row["detail"].get("r_multiple") is not None]
        rows.append({
            "timeframe":timeframe,"plans":len(cohort),"resolved":len(closed),
            "win_rate":len(cohort_wins)/len(closed) if closed else None,
            "avg_r":sum(r_values)/len(r_values) if r_values else None,
            "gross_dollars":sum(float(row["detail"].get("gross_dollars",0)) for row in closed),
            "mfe_points":sum(row["mfe"] for row in cohort)/len(cohort) if cohort else None,
            "mae_points":sum(row["mae"] for row in cohort)/len(cohort) if cohort else None,
        })
    r_values=[float(row["detail"]["r_multiple"]) for row in resolved if row["detail"].get("r_multiple") is not None]
    context_rows=[]
    for dimension in ["side","bias","session","divergence","fib"]:
        values=sorted({str(row[dimension] if dimension=="side" else row["context"].get(dimension,"not_recorded")) for row in records})
        for value in values:
            cohort=[row for row in records if str(row[dimension] if dimension=="side" else row["context"].get(dimension,"not_recorded"))==value]
            closed=[row for row in cohort if row["outcome"]]
            cohort_wins=[row for row in closed if float(row["detail"].get("pnl_points",0))>0]
            r_cohort=[float(row["detail"]["r_multiple"]) for row in closed if row["detail"].get("r_multiple") is not None]
            context_rows.append({
                "dimension":dimension,"value":value,"plans":len(cohort),"resolved":len(closed),
                "win_rate":len(cohort_wins)/len(closed) if closed else None,
                "avg_r":sum(r_cohort)/len(r_cohort) if r_cohort else None,
                "mfe_points":sum(row["mfe"] for row in cohort)/len(cohort) if cohort else None,
                "mae_points":sum(row["mae"] for row in cohort)/len(cohort) if cohort else None,
            })
    return {
        "plans":len(records),"open":len(records)-len(resolved),"resolved":len(resolved),
        "win_rate":len(wins)/len(resolved) if resolved else None,
        "avg_r":sum(r_values)/len(r_values) if r_values else None,
        "net_points":sum(float(row["detail"].get("pnl_points",0)) for row in resolved),
        "gross_dollars":sum(float(row["detail"].get("gross_dollars",0)) for row in resolved),
        "timeframes":rows,"context_cohorts":context_rows,
    }


def dashboard_data(db: sqlite3.Connection) -> dict:
    attraction_records = scorable_records(db, "attraction")
    reaction_records = scorable_records(db, "reaction")
    recent = db.execute(
        "SELECT * FROM ("
        "SELECT e.event_time event_time, e.event_type event_type, e.zone_id zone_id, "
        "z.timeframe timeframe, z.side side, z.zone_class zone_class, e.price price "
        "FROM zone_events e JOIN zones z ON z.zone_id=e.zone_id "
        "UNION ALL "
        "SELECT o.outcome_time event_time, o.outcome event_type, z.zone_id zone_id, "
        "z.timeframe timeframe, z.side side, z.zone_class zone_class, o.exit_price price "
        "FROM trial_outcomes o JOIN trials t ON t.trial_id=o.trial_id JOIN zones z ON z.zone_id=t.zone_id"
        ") ORDER BY event_time DESC LIMIT 30"
    ).fetchall()
    trial_counts = db.execute(
        "SELECT executable_status, COUNT(*) n FROM trials GROUP BY executable_status"
    ).fetchall()
    unresolved = int(db.execute(
        "SELECT COUNT(*) FROM trials t LEFT JOIN trial_outcomes o ON o.trial_id=t.trial_id WHERE o.trial_id IS NULL"
    ).fetchone()[0])
    protocol = load_protocol()
    eco = economics()
    return {
        "generated_at": utc_now(),
        "status": "PAPER / SHADOW ONLY",
        "protocol": protocol,
        "economics": eco.__dict__,
        "costs_confirmed": bool(os.getenv("LIQUIDITY_LAB_ROUND_TURN_COST_USD")),
        "totals": {
            "zones": int(db.execute("SELECT COUNT(*) FROM zones").fetchone()[0]),
            "trials": int(db.execute("SELECT COUNT(*) FROM trials").fetchone()[0]),
            "outcomes": int(db.execute("SELECT COUNT(*) FROM trial_outcomes").fetchone()[0]),
            "unresolved_trials": unresolved,
            "fills": int(db.execute("SELECT COUNT(*) FROM execution_fills").fetchone()[0]),
        },
        "timeframes": timeframe_summary(db),
        "forecast_scores": {
            "attraction": brier_metrics(attraction_records),
            "reaction": brier_metrics(reaction_records),
        },
        "calibration": {
            "attraction": calibration_bins(attraction_records),
            "reaction": calibration_bins(reaction_records),
        },
        "executable_policy": {row["executable_status"]: row["n"] for row in trial_counts},
        "recent_events": [dict(row) for row in recent],
        "user_suggested_levels": user_suggested_level_metrics(),
        "scientist_journal": scientist_journal_data(db),
    }


def scientist_level_rows(db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        "SELECT z.zone_id,z.symbol,z.contract,z.timeframe,z.side,z.zone_class,z.zone_top,z.zone_bottom,"
        "z.available_time,z.structural_score,z.tier,z.forecast_probability "
        "FROM zones z WHERE z.available_time<=? AND NOT EXISTS ("
        "SELECT 1 FROM zone_events e WHERE e.zone_id=z.zone_id AND e.event_type IN ('expired','cancelled','invalidated')"
        ") ORDER BY z.timeframe,z.available_time DESC LIMIT 1000", (utc_now(),),
    ).fetchall()
    return [dict(row) for row in rows]


def list_rows(db: sqlite3.Connection, table: str, limit: int = 200) -> list[dict]:
    allowed = {
        "zones": "received_at", "trials": "created_at", "trial_outcomes": "created_at",
        "calendar_events": "scheduled_time", "execution_fills": "fill_time",
    }
    if table not in allowed:
        raise ValueError("unsupported table")
    limit = max(1, min(limit, 1000))
    rows = db.execute(f"SELECT * FROM {table} ORDER BY {allowed[table]} DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


class LabHandler(SimpleHTTPRequestHandler):
    server_version = "BattyLiquidityLab/0.1"

    def __init__(self, *args, db_path: Path, **kwargs):
        self.db_path = db_path
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, status: int, body: object) -> None:
        data = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_html(self, status: int, body: str) -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("invalid Content-Length") from exc
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("request body must be between 1 byte and 1 MB")
        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            raise ValueError("request body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def authorized(self, payload: dict) -> bool:
        configured = os.getenv("LIQUIDITY_LAB_WEBHOOK_SECRET", "")
        if not configured:
            return self.client_address[0] in {"127.0.0.1", "::1", "localhost"}
        header = self.headers.get("X-Liquidity-Lab-Secret", "")
        auth = self.headers.get("Authorization", "")
        bearer = auth[7:] if auth.startswith("Bearer ") else ""
        body = str(payload.get("secret") or payload.get("webhook_secret") or "")
        return any(hmac.compare_digest(configured, candidate) for candidate in (header, bearer, body))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        db = connect(self.db_path)
        try:
            if parsed.path == "/api/health":
                self.send_json(HTTPStatus.OK, {"ok": True, "service": "liquidity-lab", "version": "liquidity-loop-v0.3", "assets": sorted(VALID_ASSETS), "time": utc_now()})
                return
            if parsed.path == "/api/dashboard":
                self.send_json(HTTPStatus.OK, dashboard_data(db))
                return
            if parsed.path == "/api/scientist-journal":
                self.send_json(HTTPStatus.OK, scientist_journal_data(db))
                return
            if parsed.path == "/api/scientist-weekly":
                self.send_json(HTTPStatus.OK, scientist_weekly_data(db))
                return
            if parsed.path == "/api/scientist-weekly-reviews":
                self.send_json(HTTPStatus.OK, scientist_weekly_reviews_data(db))
                return
            if parsed.path == "/api/scientist-weekly-preregistrations":
                self.send_json(HTTPStatus.OK, scientist_weekly_preregistrations_data(db))
                return
            if parsed.path == "/api/scientist-levels":
                self.send_json(HTTPStatus.OK, {"items": scientist_level_rows(db)})
                return
            if parsed.path == "/api/scientist-runs":
                query = parse_qs(parsed.query)
                self.send_json(HTTPStatus.OK, scientist_runs_data(db, int(query.get("limit", ["90"])[0])))
                return
            if parsed.path == "/scientist-release":
                run_id = parse_qs(parsed.query).get("run_id", [""])[0]
                self.send_html(HTTPStatus.OK, scientist_release_html(db, run_id))
                return
            if parsed.path == "/scientist-selections":
                run_id = parse_qs(parsed.query).get("run_id", [""])[0]
                if not db.execute("SELECT 1 FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone():
                    self.send_error(HTTPStatus.NOT_FOUND, "Unknown Scientist run")
                    return
                self.send_html(HTTPStatus.OK, scientist_selection_html(db, run_id))
                return
            if parsed.path == "/api/scientist-selection-report":
                run_id = parse_qs(parsed.query).get("run_id", [""])[0]
                if not db.execute("SELECT 1 FROM scientist_daily_runs WHERE run_id=?", (run_id,)).fetchone():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "unknown_run_id"})
                    return
                self.send_json(HTTPStatus.OK, scientist_selection_report(db, run_id))
                return
            if parsed.path == "/api/scientist-artifact":
                artifact_id = parse_qs(parsed.query).get("artifact_id", [""])[0]
                self.send_html(HTTPStatus.OK, scientist_artifact_html(db, artifact_id))
                return
            if parsed.path.startswith("/api/"):
                table_map = {
                    "/api/zones": "zones", "/api/trials": "trials", "/api/outcomes": "trial_outcomes",
                    "/api/calendar-events": "calendar_events", "/api/fills": "execution_fills",
                }
                table = table_map.get(parsed.path)
                if table:
                    query = parse_qs(parsed.query)
                    limit = int(query.get("limit", ["200"])[0])
                    self.send_json(HTTPStatus.OK, {"items": list_rows(db, table, limit)})
                    return
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
        finally:
            db.close()
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = self.read_json()
            local_scientist_editor = parsed.path in {
                "/api/v1/scientist-forecast", "/api/v1/scientist-outcome",
                "/api/v1/scientist-run", "/api/v1/scientist-step",
                "/api/v1/scientist-session-close", "/api/v1/scientist-data-package",
                "/api/v1/scientist-trigger", "/api/v1/scientist-trigger-event",
                "/api/v1/scientist-weekly-review",
                "/api/v1/scientist-weekly-preregistration",
            } and self.client_address[0] in {"127.0.0.1", "::1", "localhost"}
            if not self.authorized(payload) and not local_scientist_editor:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            db = connect(self.db_path)
            try:
                routes = {
                    "/api/v1/forecast": register_forecast,
                    "/api/v1/tick": ingest_tick,
                    "/api/v1/bar": ingest_bar,
                    "/api/v1/zone-event": add_zone_event,
                    "/api/v1/calendar-event": add_calendar_event,
                    "/api/v1/fill": add_fill,
                    "/api/v1/scientist-forecast": create_scientist_forecast,
                    "/api/v1/scientist-outcome": record_scientist_outcome,
                    "/api/v1/scientist-run": create_scientist_run,
                    "/api/v1/scientist-step": append_scientist_step,
                    "/api/v1/scientist-session-close": close_scientist_session,
                    "/api/v1/scientist-data-package": create_scientist_data_package,
                    "/api/v1/scientist-trigger": request_scientist_trigger,
                    "/api/v1/scientist-trigger-event": append_scientist_trigger_event,
                    "/api/v1/scientist-weekly-review": append_scientist_weekly_review,
                    "/api/v1/scientist-weekly-preregistration": append_scientist_weekly_preregistration,
                }
                operation = routes.get(parsed.path)
                if not operation:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                    return
                result = operation(db, payload)
                self.send_json(HTTPStatus.OK, {"ok": True, "result": result})
            finally:
                db.close()
        except (KeyError, TypeError, ValueError, sqlite3.IntegrityError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_request", "message": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive boundary
            request_id = secrets.token_hex(6)
            print(f"request {request_id} failed: {exc!r}")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal_error", "request_id": request_id})


def handler_factory(db_path: Path):
    def build(*args, **kwargs):
        return LabHandler(*args, db_path=db_path, **kwargs)
    return build


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8041)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--init-only", action="store_true")
    args = parser.parse_args()
    db = connect(args.db)
    db.close()
    if args.init_only:
        print(f"Initialized {args.db}")
        return
    if args.host not in {"127.0.0.1", "::1", "localhost"} and not os.getenv("LIQUIDITY_LAB_WEBHOOK_SECRET"):
        raise SystemExit("Refusing a non-loopback bind without LIQUIDITY_LAB_WEBHOOK_SECRET")
    server = ThreadingHTTPServer((args.host, args.port), handler_factory(args.db))
    print(f"Batty Liquidity Lab: http://{args.host}:{args.port}")
    print(f"Database: {args.db}")
    print("Status: PAPER / SHADOW ONLY — no live order routing")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Cron tick adapter for Chief Scientist runs.

Install one minute-level cron entry after populating the local scheduler file.
The adapter opens/resumes the same run identity used by the manual dashboard
button, then posts every due job through /api/v1/scientist-trigger.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SPEC_PATH = ROOT / "scientist-crons.json"
DEFAULT_CONFIG = ROOT / "data" / "scientist-scheduler.local.json"
DEFAULT_LOG = ROOT / "data" / "scientist-scheduler.log.jsonl"
ASSETS = ("MYM", "MCL", "MGC")
CHICAGO = ZoneInfo("America/Chicago")
DEFAULT_BASE_URL = "http://127.0.0.1:8041"


def parse_cron_field(value: str, low: int, high: int) -> set[int]:
    result: set[int] = set()
    for chunk in value.split(","):
        if chunk == "*":
            result.update(range(low, high + 1))
        elif "-" in chunk:
            left, right = chunk.split("-", 1)
            result.update(range(int(left), int(right) + 1))
        else:
            result.add(int(chunk))
    return result


def cron_matches(expression: str, moment: datetime) -> bool:
    minute, hour, day, month, weekday = expression.split()
    # Python Monday=0; cron uses Sunday=0.
    cron_weekday = (moment.weekday() + 1) % 7
    return (
        moment.minute in parse_cron_field(minute, 0, 59)
        and moment.hour in parse_cron_field(hour, 0, 23)
        and moment.day in parse_cron_field(day, 1, 31)
        and moment.month in parse_cron_field(month, 1, 12)
        and cron_weekday in parse_cron_field(weekday, 0, 6)
    )


def target_trade_date(moment: datetime, phase: str) -> date:
    if phase == "post_close":
        return moment.date()
    result = moment.date() + timedelta(days=1)
    while result.weekday() >= 5:
        result += timedelta(days=1)
    return result


def append_log(log_path: Path, event: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, sort_keys=True, separators=(",", ":")) + "\n")


def post_json(base_url: str, path: str, body: dict) -> dict:
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=json.dumps(body, separators=(",", ":")).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read(1_000_000).decode())
    if not data.get("ok"):
        raise RuntimeError(data.get("message") or data.get("error") or "Lab request failed")
    return data["result"]


def run_tick(config_path: Path, log_path: Path, base_url: str, moment: datetime) -> list[dict]:
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if not config_path.exists():
        event = {"time": moment.isoformat(), "event": "blocked", "reason": "scheduler_config_missing", "config": str(config_path)}
        append_log(log_path, event)
        return [event]
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("version") != "scientist-scheduler-local-v1":
        raise ValueError("local scheduler config version must be scientist-scheduler-local-v1")
    contracts = config.get("contracts") or {}
    dates = config.get("sessions") or {}
    results: list[dict] = []
    for job in spec.get("jobs", []):
        if not cron_matches(str(job.get("cron") or ""), moment):
            continue
        trade_date = target_trade_date(moment, str(job.get("phase") or ""))
        date_key = trade_date.isoformat()
        session = dates.get(date_key)
        if not isinstance(session, dict) or session.get("approved") is not True:
            event = {
                "time": moment.isoformat(), "event": "blocked", "job_id": job["id"],
                "trade_date": date_key, "reason": "approved_session_calendar_entry_missing",
            }
            append_log(log_path, event)
            results.append(event)
            continue
        source_id = str(session.get("source_id") or "").strip()
        session_open = str(session.get("session_open") or "").strip()
        session_close = str(session.get("session_close") or "").strip()
        if not source_id or not session_open or not session_close:
            event = {
                "time": moment.isoformat(), "event": "blocked", "job_id": job["id"],
                "trade_date": date_key, "reason": "calendar_entry_missing_source_or_boundary",
            }
            append_log(log_path, event)
            results.append(event)
            continue
        for asset in ASSETS:
            contract = str(contracts.get(asset) or "").strip().upper()
            if not contract:
                event = {
                    "time": moment.isoformat(), "event": "blocked", "job_id": job["id"],
                    "trade_date": date_key, "asset": asset, "reason": "dated_contract_missing",
                }
                append_log(log_path, event)
                results.append(event)
                continue
            try:
                run_result = post_json(base_url, "/api/v1/scientist-run", {
                    "trade_date": date_key, "asset_code": asset, "contract": contract,
                    "session_open": session_open, "session_close": session_close,
                    "method_version": str(config.get("method_version") or "liquidity-loop-v0.3"),
                    "created_by": "cron", "mandate": "Scheduled Chief Scientist paper/shadow research run.",
                })
                run = run_result["run"]
                trigger_key = f"cron:{date_key}:{asset}:{contract}:{run['method_version']}:{job['id']}"
                trigger_result = post_json(base_url, "/api/v1/scientist-trigger", {
                    "run_id": run["run_id"], "trigger_source": "cron", "job_id": job["id"],
                    "idempotency_key": trigger_key,
                })
                event = {
                    "time": moment.isoformat(), "event": trigger_result["event"]["event_type"],
                    "job_id": job["id"], "trade_date": date_key, "asset": asset,
                    "run_id": run["run_id"], "summary": trigger_result["event"]["summary"],
                }
            except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, RuntimeError) as exc:
                event = {
                    "time": moment.isoformat(), "event": "blocked", "job_id": job["id"],
                    "trade_date": date_key, "asset": asset, "reason": type(exc).__name__,
                }
            append_log(log_path, event)
            results.append(event)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tick", action="store_true", help="Run all jobs due in the current America/Chicago minute")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Local, gitignored contracts and approved session calendar")
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG, help="Local JSONL scheduler audit log")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()
    if not args.tick:
        parser.error("--tick is required")
    moment = datetime.now(CHICAGO).replace(second=0, microsecond=0)
    try:
        events = run_tick(args.config, args.log, args.base_url, moment)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        event = {"time": moment.isoformat(), "event": "blocked", "reason": type(exc).__name__}
        append_log(args.log, event)
        print(json.dumps(event), file=sys.stderr)
        return 2
    for event in events:
        print(json.dumps(event, sort_keys=True))
    return 0 if all(event["event"] in {"dispatched", "completed", "superseded", "duplicate"} for event in events) else (0 if not events else 2)


if __name__ == "__main__":
    raise SystemExit(main())

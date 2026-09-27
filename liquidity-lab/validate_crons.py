#!/usr/bin/env python3
"""Validate the Chief Scientist cron contract without installing system jobs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


ROOT = Path(__file__).resolve().parent
DEFAULT_SPEC = ROOT / "scientist-crons.json"
ASSETS = {"MYM", "MCL", "MGC"}
STEPS = {"preparation", "research", "prediction", "recording", "evaluation", "journal", "daily_learning"}


def parse_field(value: str, minimum: int, maximum: int, name: str) -> set[int]:
    values: set[int] = set()
    for part in value.split(","):
        if part == "*":
            values.update(range(minimum, maximum + 1))
            continue
        if "-" in part:
            start_text, end_text = part.split("-", 1)
            start, end = int(start_text), int(end_text)
            if start > end:
                raise ValueError(f"{name} range is reversed: {part}")
            values.update(range(start, end + 1))
            continue
        values.add(int(part))
    if not values or min(values) < minimum or max(values) > maximum:
        raise ValueError(f"{name} must stay within {minimum}-{maximum}")
    return values


def parse_cron(expression: str) -> dict[str, set[int]]:
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("cron must contain exactly five fields")
    minute, hour, day, month, weekday = fields
    return {
        "minute": parse_field(minute, 0, 59, "minute"),
        "hour": parse_field(hour, 0, 23, "hour"),
        "day": parse_field(day, 1, 31, "day"),
        "month": parse_field(month, 1, 12, "month"),
        "weekday": parse_field(weekday, 0, 6, "weekday"),
    }


def validate(spec: dict) -> list[str]:
    errors: list[str] = []
    try:
        ZoneInfo(str(spec.get("timezone")))
    except ZoneInfoNotFoundError:
        errors.append("timezone must be a valid IANA timezone")
    if set(spec.get("assets") or []) != ASSETS:
        errors.append("assets must be exactly MYM, MCL, and MGC")
    session = spec.get("session") or {}
    if session.get("open") != "17:00" or session.get("close") != "16:00":
        errors.append("regular session must be 17:00 previous day through 16:00 trade date")
    if session.get("carry_beyond_close") is not False:
        errors.append("carry_beyond_close must be false")
    if session.get("holiday_calendar_required") is not True:
        errors.append("holiday_calendar_required must be true")
    jobs = spec.get("jobs") or []
    ids: set[str] = set()
    offsets: dict[str, int] = {}
    for index, job in enumerate(jobs):
        label = job.get("id") or f"job[{index}]"
        if label in ids:
            errors.append(f"duplicate job id: {label}")
        ids.add(label)
        if job.get("step") not in STEPS:
            errors.append(f"{label}: unknown step")
        if job.get("phase") not in {"pre_open", "post_close"}:
            errors.append(f"{label}: phase must be pre_open or post_close")
        if not str(job.get("action") or "").strip():
            errors.append(f"{label}: action is required")
        try:
            parsed = parse_cron(str(job.get("cron") or ""))
            if len(parsed["minute"]) != 1 or len(parsed["hour"]) != 1:
                errors.append(f"{label}: hour and minute must each resolve to one value")
            else:
                clock_minutes = next(iter(parsed["hour"])) * 60 + next(iter(parsed["minute"]))
                phase = job.get("phase")
                actual_offset = clock_minutes - (17 * 60 if phase == "pre_open" else 16 * 60)
                if actual_offset != int(job.get("expected_offset_minutes")):
                    errors.append(
                        f"{label}: cron time implies offset {actual_offset}, "
                        f"not {job.get('expected_offset_minutes')}"
                    )
                expected_weekdays = set(range(0, 5)) if phase == "pre_open" else set(range(1, 6))
                if parsed["weekday"] != expected_weekdays:
                    errors.append(f"{label}: weekday set does not match {phase} session days")
        except (TypeError, ValueError) as exc:
            errors.append(f"{label}: {exc}")
        try:
            offsets[label] = int(job["expected_offset_minutes"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"{label}: expected_offset_minutes must be an integer")
    required = {
        "prepare_next_session", "research_next_session", "freeze_predictions",
        "open_recording_window", "force_session_flat", "evaluate_session",
        "publish_daily_release", "propose_daily_learning",
    }
    missing = sorted(required - ids)
    if missing:
        errors.append("missing required jobs: " + ", ".join(missing))
    expected = {
        "prepare_next_session": -50, "research_next_session": -40,
        "freeze_predictions": -20, "open_recording_window": -5,
        "force_session_flat": 0, "evaluate_session": 5,
        "publish_daily_release": 15, "propose_daily_learning": 25,
    }
    for job_id, offset in expected.items():
        if job_id in offsets and offsets[job_id] != offset:
            errors.append(f"{job_id}: expected offset {offset}, got {offsets[job_id]}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", nargs="?", type=Path, default=DEFAULT_SPEC)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    try:
        spec = json.loads(args.spec.read_text())
        errors = validate(spec)
    except (OSError, json.JSONDecodeError) as exc:
        errors = [str(exc)]
    result = {"ok": not errors, "spec": str(args.spec), "errors": errors}
    if args.as_json:
        print(json.dumps(result, indent=2))
    elif errors:
        print("Scientist cron validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
    else:
        print(f"Scientist cron contract valid: {args.spec}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

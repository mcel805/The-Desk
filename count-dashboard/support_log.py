"""Bounded, local-only diagnostics for Batty chat turns.

Only an explicit allowlist of fields is written. Message bodies, credentials,
screenshots, attachment contents, and account identifiers are never persisted.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LOG_PATH = Path(__file__).resolve().parent / "data" / "support-events.jsonl"
MAX_LOG_BYTES = 5 * 1024 * 1024
MAX_EVENTS = 500
_LOCK = threading.Lock()


def _event_copy(event: dict[str, Any]) -> dict[str, Any]:
    safe = {
        "requestId": str(event.get("requestId", ""))[:80],
        "timestamp": str(event.get("timestamp", ""))[:40],
        "event": str(event.get("event", "chat_turn"))[:40],
        "method": str(event.get("method", ""))[:12],
        "endpoint": str(event.get("endpoint", ""))[:180],
        "status": str(event.get("status", "unknown"))[:24],
        "httpStatus": int(event["httpStatus"]) if event.get("httpStatus") is not None else None,
        "durationMs": max(0, int(event.get("durationMs", 0))),
        "model": str(event.get("model", ""))[:40],
        "effort": str(event.get("effort", ""))[:16],
        "activeTab": str(event.get("activeTab", ""))[:80],
        "symbol": str(event.get("symbol", ""))[:100],
        "timeframe": str(event.get("timeframe", ""))[:16],
        "attachmentCount": max(0, int(event.get("attachmentCount", 0))),
        "attachmentTypes": [str(value)[:20] for value in event.get("attachmentTypes", [])[:8]],
        "screenshotIncluded": bool(event.get("screenshotIncluded", False)),
        "calls": [str(value)[:100] for value in event.get("calls", [])[:80]],
        "errorCode": str(event.get("errorCode", ""))[:80],
        "error": str(event.get("error", ""))[:500],
    }
    return safe


def write_event(event: dict[str, Any]) -> None:
    """Append one sanitized turn record and rotate the local log when needed."""
    record = _event_copy(event)
    record["timestamp"] = record["timestamp"] or datetime.now(timezone.utc).isoformat()
    encoded = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    with _LOCK:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            size = LOG_PATH.stat().st_size
        except FileNotFoundError:
            size = 0
        if size + len(encoded) > MAX_LOG_BYTES:
            try:
                previous = LOG_PATH.read_bytes().splitlines()[-(MAX_EVENTS // 2):]
            except OSError:
                previous = []
            with LOG_PATH.open("wb") as target:
                target.write(b"\n".join(previous) + (b"\n" if previous else b""))
        with LOG_PATH.open("ab") as target:
            target.write(encoded)
            target.flush()
            os.fsync(target.fileno())


def recent_events(limit: int = 100) -> list[dict[str, Any]]:
    """Return a bounded newest-first view of sanitized events."""
    limit = max(1, min(int(limit), MAX_EVENTS))
    with _LOCK:
        try:
            lines = LOG_PATH.read_bytes().splitlines()[-limit:]
        except FileNotFoundError:
            return []
    events = []
    for line in reversed(lines):
        try:
            item = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(item, dict):
            events.append(_event_copy(item))
    return events

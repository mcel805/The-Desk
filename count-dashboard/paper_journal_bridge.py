"""Durable, retryable delivery from the local paper simulator to LuxAlgo Journal."""
from __future__ import annotations

import json
import os
import sqlite3
from threading import Lock
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

_DISPATCH_LOCK = Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_schema(db: sqlite3.Connection) -> None:
    db.executescript("""
    CREATE TABLE IF NOT EXISTS chart_sim_journal_outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      seen_at TEXT
    );
    CREATE INDEX IF NOT EXISTS chart_sim_journal_outbox_retry
      ON chart_sim_journal_outbox(status,next_attempt_at,sequence);
    """)


def enqueue(db: sqlite3.Connection, event_id: str, event_type: str, payload: dict) -> None:
    stamp = now_iso()
    db.execute("""INSERT OR IGNORE INTO chart_sim_journal_outbox
      (event_id,event_type,payload_json,status,attempts,next_attempt_at,last_error,created_at)
      VALUES (?,?,?,'pending',0,?,'',?)""",
      (event_id, event_type, json.dumps(payload, sort_keys=True), stamp, stamp))


def queue_account(db: sqlite3.Connection, account: sqlite3.Row | dict) -> None:
    row = dict(account)
    account_id = row["account_id"]
    enqueue(db, f"account:{account_id}", "account", {
        "eventId": f"account:{account_id}", "eventType": "account",
        "account": {"id": account_id, "name": row["name"], "currency": row["currency"],
                    "initialBalance": row["starting_balance"]},
    })


def queue_execution(db: sqlite3.Connection, position: sqlite3.Row | dict, leg: str) -> None:
    row = dict(position)
    account = db.execute("SELECT * FROM chart_sim_accounts WHERE account_id=?", (row["account_id"],)).fetchone()
    if not account:
        return
    event_id = f"{row['position_id']}:{leg}"
    is_entry = leg == "entry"
    raw_side = row["side"]
    side = ("buy" if raw_side == "long" else "sell") if is_entry else ("sell" if raw_side == "long" else "buy")
    price = row["entry_price"] if is_entry else row["exit_price"]
    epoch = row["entry_bar_time"] if is_entry else row["exit_bar_time"]
    source = row["entry_source"] if is_entry else row["exit_source"]
    from datetime import datetime, timezone
    executed_at = datetime.fromtimestamp(int(epoch), timezone.utc).isoformat().replace("+00:00", "Z")
    symbol = row["symbol"].split(":")[-1].replace("1!", "").upper()
    payload = {
        "eventId": event_id, "eventType": "execution",
        "account": {"id": account["account_id"], "name": account["name"],
                    "currency": account["currency"], "initialBalance": account["starting_balance"]},
        "execution": {"id": event_id, "symbol": symbol, "side": side,
                      "quantity": row["quantity"], "price": price, "fee": 0,
                      "executedAt": executed_at, "multiplier": row["multiplier"],
                      "assetClass": row.get("asset_class", "crypto" if row.get("provider") else "futures")},
        "provenance": {"positionId": row["position_id"], "source": source,
                       "timeframe": row["timeframe"], "entryDatasetId": row.get("entry_dataset_id", ""),
                       "exitDatasetId": row.get("exit_dataset_id"), "provider": row.get("provider"),
                       "entryBarTime": row.get("entry_bar_time"), "exitBarTime": row.get("exit_bar_time"),
                       "simulation": True},
    }
    enqueue(db, event_id, "trade_opened" if is_entry else "trade_closed", payload)
    if not is_entry:
        # An exit updates the same journal trade. Re-open its inbox item so the
        # completed trade is reviewed once, instead of counting entry and exit
        # fills as two separate notifications.
        db.execute("UPDATE chart_sim_journal_outbox SET seen_at=NULL WHERE event_id=? AND status='delivered'",
                   (f"{row['position_id']}:entry",))


def dispatch_pending(db: sqlite3.Connection, limit: int = 1) -> None:
    if not _DISPATCH_LOCK.acquire(blocking=False):
        return
    try:
        _dispatch_pending(db, limit)
    finally:
        _DISPATCH_LOCK.release()


def _dispatch_pending(db: sqlite3.Connection, limit: int) -> None:
    db.commit()
    rows = db.execute("""SELECT * FROM chart_sim_journal_outbox WHERE status='pending'
      AND next_attempt_at<=? ORDER BY sequence LIMIT ?""", (now_iso(), limit)).fetchall()
    base = os.environ.get("LUX_JOURNAL_URL", "http://127.0.0.1:3000").rstrip("/")
    token = os.environ.get("COUNT_DESK_JOURNAL_BRIDGE_TOKEN", "").strip()
    for event in rows:
        try:
            if not token:
                raise RuntimeError("COUNT_DESK_JOURNAL_BRIDGE_TOKEN is not configured")
            request = Request(base + "/api/integrations/count-desk", data=event["payload_json"].encode(),
                              headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                              method="POST")
            with urlopen(request, timeout=0.75) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"journal returned HTTP {response.status}")
            db.execute("UPDATE chart_sim_journal_outbox SET status='delivered',delivered_at=?,last_error='' WHERE sequence=?",
                       (now_iso(), event["sequence"]))
        except (OSError, HTTPError, URLError, RuntimeError, ValueError) as exc:
            attempts = int(event["attempts"]) + 1
            delay = min(300, 2 ** min(attempts, 8))
            retry = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
            db.execute("""UPDATE chart_sim_journal_outbox SET attempts=?,next_attempt_at=?,last_error=?
              WHERE sequence=?""", (attempts, retry, str(exc)[:500], event["sequence"]))
    db.commit()


def inbox(db: sqlite3.Connection) -> dict:
    rows = db.execute("SELECT * FROM chart_sim_journal_outbox ORDER BY sequence DESC LIMIT 30").fetchall()
    unread = db.execute("""SELECT COUNT(*) FROM chart_sim_journal_outbox
      WHERE event_type='trade_opened' AND status='delivered' AND seen_at IS NULL""").fetchone()[0]
    pending = db.execute("""SELECT COUNT(DISTINCT substr(p.event_id,1,instr(p.event_id,':')-1))
      FROM chart_sim_journal_outbox AS p
      WHERE p.event_type IN ('trade_opened','trade_closed') AND p.status='pending'
        AND NOT EXISTS (
          SELECT 1 FROM chart_sim_journal_outbox AS opened
          WHERE opened.event_id=substr(p.event_id,1,instr(p.event_id,':')-1)||':entry'
            AND opened.event_type='trade_opened' AND opened.status='delivered' AND opened.seen_at IS NULL
        )""").fetchone()[0]
    return {"unreadCount": unread, "pendingCount": pending,
            "latestSequence": max((int(row["sequence"]) for row in rows), default=0),
            "updates": [{"sequence": row["sequence"], "eventId": row["event_id"],
                         "type": row["event_type"], "status": row["status"],
                         "createdAt": row["created_at"], "lastError": row["last_error"]}
                        for row in rows]}


def acknowledge(db: sqlite3.Connection, sequence: int) -> dict:
    if sequence < 0:
        raise ValueError("Update sequence must be non-negative")
    db.execute("""UPDATE chart_sim_journal_outbox SET seen_at=?
      WHERE event_type='trade_opened' AND status='delivered' AND seen_at IS NULL AND sequence<=?""",
               (now_iso(), sequence))
    db.commit()
    return inbox(db)

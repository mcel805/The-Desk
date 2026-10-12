"""Durable, wallet-scoped Hyperliquid order intent and reconciliation state."""

from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path


ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
CLOID_RE = re.compile(r"^0x[0-9a-fA-F]{32}$")
NETWORKS = {"testnet", "mainnet"}
OPEN_STATES = ("reserved", "submitting", "uncertain")


class HyperliquidRequestStore:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS hyperliquid_requests (
                    wallet_address TEXT NOT NULL,
                    network TEXT NOT NULL,
                    client_order_id TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    state TEXT NOT NULL,
                    venue_order_id TEXT,
                    venue_state TEXT,
                    observed TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (wallet_address, network, client_order_id)
                )
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS hyperliquid_requests_open
                ON hyperliquid_requests(wallet_address, network, state)
            """)

    def _db(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _scope(wallet_address, network, client_order_id):
        if not isinstance(wallet_address, str) or not ADDRESS_RE.fullmatch(wallet_address):
            raise ValueError("A valid Hyperliquid wallet address is required.")
        if network not in NETWORKS:
            raise ValueError("Choose testnet or mainnet.")
        if not isinstance(client_order_id, str) or not CLOID_RE.fullmatch(client_order_id):
            raise ValueError("A valid Hyperliquid client order ID is required.")
        return wallet_address.lower(), network, client_order_id.lower()

    @staticmethod
    def _intent(intent):
        if not isinstance(intent, dict):
            raise ValueError("Hyperliquid order intent is required.")
        allowed = {"coin", "side", "quantity", "price", "reduceOnly"}
        if set(intent) - allowed or not all(isinstance(intent.get(key), (str, bool)) for key in intent):
            raise ValueError("Invalid Hyperliquid order intent.")
        if not isinstance(intent.get("coin"), str) or not isinstance(intent.get("side"), str):
            raise ValueError("Invalid Hyperliquid order intent.")
        encoded = json.dumps(intent, separators=(",", ":"), sort_keys=True)
        if len(encoded) > 2000:
            raise ValueError("Hyperliquid order intent is too large.")
        return encoded

    @staticmethod
    def _record(row):
        if row is None:
            return None
        return {
            "walletAddress": row["wallet_address"],
            "network": row["network"],
            "clientOrderId": row["client_order_id"],
            "intent": json.loads(row["intent"]),
            "state": row["state"],
            "venueOrderId": row["venue_order_id"],
            "venueState": row["venue_state"],
            "observed": json.loads(row["observed"]) if row["observed"] else None,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def reserve(self, wallet_address, network, client_order_id, intent):
        wallet_address, network, client_order_id = self._scope(wallet_address, network, client_order_id)
        intent_json = self._intent(intent)
        now = time.time()
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND state IN ('reserved','submitting','uncertain') LIMIT 1",
                (wallet_address, network),
            ).fetchone():
                raise ValueError("Reconcile the existing Hyperliquid request before placing another order.")
            try:
                db.execute(
                    "INSERT INTO hyperliquid_requests(wallet_address,network,client_order_id,intent,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (wallet_address, network, client_order_id, intent_json, "reserved", now, now),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("This Hyperliquid client order ID is already recorded.") from exc
            return self._record(db.execute(
                "SELECT * FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND client_order_id=?",
                (wallet_address, network, client_order_id),
            ).fetchone())

    def _transition(self, wallet_address, network, client_order_id, states, new_state, **fields):
        wallet_address, network, client_order_id = self._scope(wallet_address, network, client_order_id)
        now = time.time()
        columns = ["state=?", "updated_at=?"]
        values = [new_state, now]
        for key in ("venue_order_id", "venue_state", "observed"):
            if key in fields:
                columns.append(key + "=?")
                values.append(json.dumps(fields[key], separators=(",", ":")) if key == "observed" and fields[key] is not None else fields[key])
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND client_order_id=? AND state IN (" + ",".join("?" for _ in states) + ")",
                (wallet_address, network, client_order_id, *states),
            ).fetchone()
            if row is None:
                raise ValueError("Hyperliquid request is missing or no longer allows this transition.")
            db.execute(
                "UPDATE hyperliquid_requests SET " + ",".join(columns) + " WHERE wallet_address=? AND network=? AND client_order_id=?",
                [*values, wallet_address, network, client_order_id],
            )
            return self._record(db.execute(
                "SELECT * FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND client_order_id=?",
                (wallet_address, network, client_order_id),
            ).fetchone())

    def mark_submitting(self, wallet_address, network, client_order_id):
        return self._transition(wallet_address, network, client_order_id, ("reserved",), "submitting")

    def release(self, wallet_address, network, client_order_id):
        return self._transition(wallet_address, network, client_order_id, ("reserved",), "released")

    def uncertain(self, wallet_address, network, client_order_id, observed=None):
        return self._transition(wallet_address, network, client_order_id, ("reserved", "submitting", "uncertain"), "uncertain", observed=observed)

    def acknowledge(self, wallet_address, network, client_order_id, venue_state, venue_order_id=None, observed=None):
        return self._transition(wallet_address, network, client_order_id, ("reserved", "submitting", "uncertain"), "acknowledged", venue_state=venue_state, venue_order_id=str(venue_order_id) if venue_order_id is not None else None, observed=observed)

    def get(self, wallet_address, network, client_order_id):
        wallet_address, network, client_order_id = self._scope(wallet_address, network, client_order_id)
        with self._db() as db:
            return self._record(db.execute(
                "SELECT * FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND client_order_id=?",
                (wallet_address, network, client_order_id),
            ).fetchone())

    def open(self, wallet_address, network):
        wallet_address, network, _ = self._scope(wallet_address, network, "0x" + "0" * 32)
        with self._db() as db:
            return [self._record(row) for row in db.execute(
                "SELECT * FROM hyperliquid_requests WHERE wallet_address=? AND network=? AND state IN ('reserved','submitting','uncertain') ORDER BY created_at",
                (wallet_address, network),
            )]

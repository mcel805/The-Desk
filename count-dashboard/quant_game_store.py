"""Local game observations and Robinhood MCP drafts. This module never routes orders."""
from datetime import datetime, timezone
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path
import hashlib
import json
import secrets
import sqlite3
import quant_game_field

DB_PATH = Path(__file__).resolve().parent / "data" / "quant-game.sqlite3"
ASSETS = {"BTC", "ETH", "SOL"}
MARKETS = {
    "binance": {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"},
    "coinbase": {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"},
    "hyperliquid": {"BTC": "BTC", "ETH": "ETH", "SOL": "SOL"},
}


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
      CREATE TABLE IF NOT EXISTS game_snapshots (name TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS game_records
        (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
    """)
    try:
        with db:
            yield db
    finally:
        db.close()


def number(value, field, positive=False):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field} must be a number")
    if not result.is_finite() or (positive and result <= 0):
        raise ValueError(f"{field} must be a finite positive number")
    return result


def snapshot(db):
    row = db.execute("SELECT body FROM game_snapshots WHERE name='robinhood'").fetchone()
    return json.loads(row[0]) if row else None


def records(db, kind, limit=20):
    return [json.loads(row[0]) for row in db.execute(
        "SELECT body FROM game_records WHERE kind=? ORDER BY created_at DESC LIMIT ?", (kind, limit))]


def field_key(provider, symbol):
    return "field:" + str(provider) + ":" + str(symbol)


def read_field(db, provider, symbol):
    row = db.execute("SELECT body FROM game_snapshots WHERE name=?", (field_key(provider, symbol),)).fetchone()
    return json.loads(row[0]) if row else None


def save_field(payload):
    context = source_context(payload)
    raw = payload.get("range", {})
    high, low = number(raw.get("high"), "Range high", True), number(raw.get("low"), "Range low", True)
    start = int(raw.get("bar_time", 0))
    if high <= low or raw.get("provider") != context["provider"] or raw.get("symbol") != context["symbol"] or not raw.get("version") or start <= 0 or start % 900000:
        raise ValueError("A matching frozen 15m field is required")
    if context["completed_cutoff"] + 60000 > quant_game_field.milliseconds():
        raise ValueError("Field calculation cannot use a forming or future bar")
    bounds = {key: raw[key] for key in ("version", "provider", "symbol", "bar_time", "frozen_at", "method")}
    bounds.update(high=float(high), low=float(low), timeframe="15m")
    bars = quant_game_field.validate_bars(payload.get("bars"), start, context["completed_cutoff"])
    lifecycle = quant_game_field.levels(bars, bounds, include_expired=True)
    body = {"source": context, "range": bounds, "bars": bars,
            "levels": [level for level in lifecycle if level["status"] == "active"],
            "expired_levels": [level for level in lifecycle if level["status"] == "expired"],
            "method": quant_game_field.METHOD, "parameters": {"internal_pivot": 5, "external_pivot": 14},
            "data_scope": "active_range_onward", "updated_at": now(), "evidence": "public OHLC-inferred confirmed swing levels"}
    with connection() as db:
        previous = read_field(db, context["provider"], context["symbol"])
        if previous and previous["range"]["frozen_at"] > bounds["frozen_at"]:
            raise ValueError("A newer battlefield has already replaced this one")
        if previous and previous["range"]["version"] == bounds["version"]:
            if previous["range"] != bounds or context["completed_cutoff"] < previous["source"]["completed_cutoff"]:
                raise ValueError("A frozen field cannot change bounds or move its cutoff backward")
        db.execute("INSERT OR REPLACE INTO game_snapshots VALUES (?,?)", (field_key(context["provider"], context["symbol"]), json.dumps(body)))
    return body


def check_entry(payload, price):
    source = payload.get("source", payload)
    with connection() as db:
        return quant_game_field.entry(read_field(db, source.get("provider"), source.get("symbol")), payload, price)


def state():
    import quant_game_broker
    with connection() as db:
        return {"robinhood": snapshot(db), "drafts": records(db, "draft"),
                "observations": records(db, "observation", 5),
                "mcp": quant_game_broker.status(),
                "execution": {"mode": "read_and_preview", "direct_routing": False,
                              "reason": "Local Codex MCP transport permits account reads and broker previews; order placement is not exposed."}}


def save_snapshot(payload):
    """Import a masked, explicitly dated result of read-only MCP calls, without credentials."""
    account = payload.get("account", {})
    suffix = str(account.get("suffix", ""))
    if len(suffix) != 4 or not suffix.isdigit():
        raise ValueError("Supply a masked account suffix, not a full account number")
    fetched = str(payload.get("fetched_at", ""))
    try:
        datetime.fromisoformat(fetched.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("An MCP fetch timestamp is required")
    currency = str(payload.get("currency", "USD"))
    if currency != "USD":
        raise ValueError("This Robinhood crypto pilot expects broker-native USD")
    pairs = []
    for row in payload.get("pairs", []):
        if row.get("symbol") not in {f"{asset}-USD" for asset in ASSETS}:
            continue
        keys = ("symbol", "id", "tradability", "display_only", "halted", "halted_regions",
                "market_orders_only", "min_order_size", "max_order_size",
                "min_order_quantity_increment", "min_order_price_increment", "min_order_quote_amount")
        pairs.append({key: row[key] for key in keys if key in row})
    quotes = [{key: row[key] for key in ("symbol", "bid_price", "ask_price", "mark_price", "updated_at", "routing") if key in row}
              for row in payload.get("quotes", []) if row.get("symbol") in {f"{asset}USD" for asset in ASSETS}]
    positions = [{"asset": row["asset"], "quantity": str(number(row.get("quantity", 0), "Position quantity"))}
                 for row in payload.get("positions", []) if row.get("asset") in ASSETS]
    bp = payload.get("crypto_buying_power")
    body = {"source": "Robinhood MCP imported read-only snapshot", "fetched_at": fetched,
            "account": {"label": str(account.get("label", "Robinhood"))[:80], "suffix": suffix,
                        "accessible": account.get("accessible") is True, "state": account.get("state")},
            "currency": currency, "crypto_buying_power": str(number(bp, "Crypto buying power")) if bp is not None else None,
            "pairs": pairs, "quotes": quotes, "positions": positions,
            "positions_complete": payload.get("positions_complete") is True, "routing_connected": False}
    with connection() as db:
        db.execute("INSERT OR REPLACE INTO game_snapshots VALUES ('robinhood',?)", (json.dumps(body),))
    return body


def source_context(payload):
    source = payload.get("source", {})
    provider, asset = source.get("provider"), source.get("asset")
    if provider not in MARKETS or asset not in ASSETS or source.get("symbol") != MARKETS[provider][asset]:
        raise ValueError("Select an allowed BTC, ETH or SOL chart on an existing Quant Lab source")
    if source.get("timeframe") != "1m":
        raise ValueError("The game chart must be one minute")
    cutoff = int(source.get("completed_cutoff", 0))
    if cutoff <= 0:
        raise ValueError("A completed chart bar is required")
    result = {"provider": provider, "asset": asset, "symbol": source["symbol"], "timeframe": "1m", "completed_cutoff": cutoff}
    if source.get("snapshot_as_of"):
        result["snapshot_as_of"] = int(source["snapshot_as_of"])
    return result


def save_record(db, kind, body):
    body.update({"id": f"game-{kind}-" + secrets.token_hex(12), "created_at": now()})
    db.execute("INSERT INTO game_records VALUES (?,?,?,?)", (body["id"], kind, body["created_at"], json.dumps(body)))
    return body


def create_draft(payload):
    context = source_context(payload)
    side, order_type = payload.get("side"), payload.get("type")
    if side not in {"buy", "sell"} or order_type not in {"market", "limit"}:
        raise ValueError("Choose a buy or sell market/limit draft")
    asset = context["asset"]
    entry_rule = None
    if side == "buy":
        if order_type != "limit":
            raise ValueError("Game entries are liquidity-level limit drafts; market buys are disabled")
        entry_rule = check_entry(payload, payload.get("limit_price"))
    with connection() as db:
        broker = snapshot(db)
        if not broker or not broker["account"]["accessible"] or broker["account"]["state"] != "active":
            raise ValueError("Import an accessible active Robinhood crypto account snapshot first")
        pair = next((p for p in broker["pairs"] if p["symbol"] == f"{asset}-USD"), None)
        allowed = {"tradable", "buy_only" if side == "buy" else "sell_only"}
        if not pair or pair.get("display_only") or pair.get("tradability") not in allowed or pair.get("halted"):
            raise ValueError("The imported pair is unavailable or restricted; refresh with MCP before a broker preview")
        amount = number(payload.get("amount"), "USD amount" if side == "buy" else "Asset quantity", True)
        args = {"symbol": f"{asset}-USD", "side": side, "type": order_type, "time_in_force": "gtc"}
        if side == "buy":
            bp = broker.get("crypto_buying_power")
            if bp is None or amount > number(bp, "Imported crypto buying power"):
                raise ValueError("Draft amount exceeds the imported crypto buying power or that value is unavailable")
            if pair.get("min_order_quote_amount") and amount < number(pair["min_order_quote_amount"], "Minimum notional"):
                raise ValueError("Draft is below the imported minimum notional")
            args["dollar_amount"] = str(amount)
        else:
            owned = sum(number(p["quantity"], "Owned units") for p in broker["positions"] if p["asset"] == asset)
            if not broker["positions_complete"] or amount > owned:
                raise ValueError("Selling requires confirmed owned units; Robinhood spot sell is not a short position")
            step = number(pair["min_order_quantity_increment"], "Quantity increment", True)
            if amount < number(pair["min_order_size"], "Minimum size", True) or amount % step:
                raise ValueError("Quantity must meet the broker minimum and increment")
            args["quantity"] = str(amount)
        if order_type == "limit":
            if pair.get("market_orders_only"):
                raise ValueError("The imported pair only accepts market orders")
            price = number(payload.get("limit_price"), "Limit price", True)
            step = number(pair["min_order_price_increment"], "Price increment", True)
            if price % step:
                raise ValueError("Limit price must meet the broker price increment")
            args["limit_price"] = str(price)
        body = {"status": "local_draft", "broker": "robinhood_mcp", "account_suffix": broker["account"]["suffix"],
                "source": context, "broker_snapshot_at": broker["fetched_at"], "parameters": args,
                "next_action": "Refresh account, quotes and holdings via MCP, obtain a broker preview, then confirm this specific order with Mark before placement.",
                "submitted": False, "broker_order_id": None, "entry_rule": entry_rule}
        return save_record(db, "draft", body)


def observation(payload):
    context = source_context(payload)
    range_data = payload.get("range", {})
    high, low = number(range_data.get("high"), "Range high", True), number(range_data.get("low"), "Range low", True)
    if high <= low or range_data.get("provider") != context["provider"] or range_data.get("symbol") != context["symbol"]:
        raise ValueError("A frozen matching range with high > low is required")
    image = str(payload.get("image", ""))
    if not image.startswith("data:image/png;base64,") or len(image) > 5_000_000:
        raise ValueError("An app chart PNG of at most 5MB is required")
    cadence = payload.get("cadence")
    if cadence not in {30, 60}:
        raise ValueError("Choose 30s or 60s capture cadence")
    start = int(range_data.get("bar_time", 0))
    bars = quant_game_field.validate_bars(payload.get("bars"), start, context["completed_cutoff"])
    with connection() as db:
        field = read_field(db, context["provider"], context["symbol"])
    if not field or field["range"]["version"] != range_data.get("version"):
        raise ValueError("Capture must reference the current registered battlefield")
    # Keep the PNG locally in the record; account numbers and credentials are never included.
    body = {"source": context, "range": range_data, "cadence": cadence, "captured_at": now(),
            "image": image, "image_hash": hashlib.sha256(image.encode()).hexdigest(), "bars": bars,
            "studies": [str(item)[:100] for item in payload.get("studies", [])[:20]],
            "status": "captured_only", "decision_api_called": False, "data_scope": "active_range_onward",
            "liquidity": {"method": field["method"], "parameters": field["parameters"], "levels": field["levels"],
                          "expired_levels": field.get("expired_levels", []), "visible": payload.get("liquidity_visible") is True}}
    with connection() as db:
        return save_record(db, "observation", body)


def get_route(path):
    if path == "/api/quant-game/state":
        result = state()
        # Avoid sending retained large images with each state refresh.
        for row in result["observations"]:
            row.pop("image", None)
        return result
    raise ValueError("Unknown game route")


def post_route(path, payload):
    if path == "/api/quant-game/mcp-refresh":
        import quant_game_broker
        return quant_game_broker.start(payload)
    routes = {"/api/quant-game/robinhood-snapshot": save_snapshot,
              "/api/quant-game/field": save_field,
              "/api/quant-game/drafts": create_draft, "/api/quant-game/observations": observation}
    if path not in routes:
        raise ValueError("Unknown game route")
    result = routes[path](payload)
    result.pop("image", None)
    return result

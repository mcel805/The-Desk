"""Forward paper limit orders for the liquidity battlefield; no broker routing."""
import json
import secrets
from decimal import Decimal

import quant_game_field
import quant_game_store


def ensure(db):
    db.execute("CREATE TABLE IF NOT EXISTS quant_game_orders (id TEXT PRIMARY KEY, body TEXT NOT NULL)")


def orders(db, account_id="", limit=100):
    ensure(db)
    result = [json.loads(row[0]) for row in db.execute("SELECT body FROM quant_game_orders ORDER BY rowid DESC")]
    selected = [row for row in result if not account_id or row["account_id"] == account_id]
    return selected[:limit] if limit else selected


def save(db, order):
    db.execute("INSERT OR REPLACE INTO quant_game_orders VALUES (?,?)", (order["order_id"], json.dumps(order)))


def queue(db, payload, proof):
    ensure(db)
    if not db.in_transaction:
        db.execute("BEGIN IMMEDIATE")
    request_id = str(payload.get("request_id", ""))
    if not request_id or len(request_id) > 100:
        raise ValueError("A unique paper entry request ID is required")
    for old in orders(db, str(payload["account_id"]), limit=None):
        if old["request_id"] == request_id:
            if old["parameters"] != payload:
                raise ValueError("Paper entry request ID was reused with different parameters")
            return old
    account = db.execute("SELECT starting_balance FROM chart_sim_accounts WHERE account_id=?", (payload["account_id"],)).fetchone()
    closed = db.execute("SELECT COALESCE(SUM(gross_pnl),0) FROM quant_lab_sim_positions WHERE account_id=? AND status='closed'", (payload["account_id"],)).fetchone()[0]
    opened = db.execute("SELECT COALESCE(SUM(quantity*entry_price),0) FROM quant_lab_sim_positions WHERE account_id=? AND status='open'", (payload["account_id"],)).fetchone()[0]
    reserved = sum(Decimal(str(row["parameters"]["quantity"])) * Decimal(str(row["parameters"]["entry_price"]))
                   for row in orders(db, str(payload["account_id"]), limit=None) if row["status"] == "pending")
    notional = Decimal(str(payload["quantity"])) * Decimal(str(payload["entry_price"]))
    available = Decimal(str(account[0])) + Decimal(str(closed)) - Decimal(str(opened)) - reserved
    if notional > available:
        raise ValueError("Paper entry exceeds available virtual cash after open and pending 1x notional reservations")
    order = {"order_id": "game-limit-" + secrets.token_hex(12), "request_id": request_id,
             "account_id": payload["account_id"], "parameters": payload, "entry_rule": proof,
             "status": "pending", "created_at": quant_game_store.now(),
             # A partial placement-minute bar cannot establish a post-placement touch.
             "eligible_from": ((quant_game_field.milliseconds() // 60000) + 1) * 60000,
             "checked_through": proof["source"]["completed_cutoff"], "position_id": None,
             "reserved_notional": str(notional),
             "fill_model": "forward completed OHLC; next full bar; exact level touch; no gap fills; gross of costs"}
    save(db, order)
    db.commit()
    return order


def cancel(db, payload):
    ensure(db)
    if not db.in_transaction:
        db.execute("BEGIN IMMEDIATE")
    row = db.execute("SELECT body FROM quant_game_orders WHERE id=?", (str(payload.get("order_id", "")),)).fetchone()
    if not row:
        raise ValueError("Paper order not found")
    order = json.loads(row[0])
    if order["status"] == "pending":
        order.update(status="cancelled", reason="user cancelled", updated_at=quant_game_store.now())
        save(db, order)
        db.commit()
    return order


def advance(db, payload, open_position, close_position):
    ensure(db)
    filled = []
    cutoff = int(payload.get("completed_cutoff", 0))
    if not cutoff or payload.get("game_range") is not True:
        return filled
    if not db.in_transaction:
        db.execute("BEGIN IMMEDIATE")
    bars = [row for row in payload["bars"] if int(row["time"]) * 1000 <= cutoff]
    for order in orders(db, limit=None):
        args = order["parameters"]
        if order["status"] != "pending" or any(args.get(key) != payload.get(key) for key in ("provider", "symbol", "timeframe")):
            continue
        with quant_game_store.connection() as game_db:
            field = quant_game_store.read_field(game_db, args["provider"], args["symbol"])
        if not field or field["range"]["version"] != order["entry_rule"]["field_version"]:
            order.update(status="cancelled", reason="battlefield replaced", updated_at=quant_game_store.now())
            save(db, order)
            continue
        price = float(args["entry_price"])
        for bar in bars:
            timestamp = int(bar["time"]) * 1000
            if timestamp < order["eligible_from"] or timestamp <= order["checked_through"]:
                continue
            expected = max(order["eligible_from"], order["checked_through"] + 60000)
            if timestamp != expected:
                order.update(status="cancelled", reason="missing bars; first touch cannot be established")
                break
            order["checked_through"] = timestamp
            long = args["side"] == "long"
            if (long and float(bar["open"]) < price) or (not long and float(bar["open"]) > price):
                order.update(status="cancelled", reason="gap or marketable limit; exact liquidity touch unavailable")
                break
            if float(bar["low"]) <= price <= float(bar["high"]):
                position = open_position(db, {**args, "bar_time": int(bar["time"])}, game_fill=True)
                order.update(status="filled", position_id=position["position_id"], fill_bar_time=timestamp, filled_at=quant_game_store.now())
                stop = args.get("stop_price")
                if stop not in (None, "") and (float(bar["low"]) <= float(stop) if long else float(bar["high"]) >= float(stop)):
                    close_position(db, {"position_id": position["position_id"], "exit_price": stop, "bar_time": int(bar["time"])}, allow_same_bar=True)
                    order["same_bar_exit"] = "stop loss; target ordering is not assumed"
                filled.append(position["position_id"])
                break
            level_side = order["entry_rule"]["level"]["side"]
            if (level_side == "HIGH" and float(bar["close"]) > price) or (level_side == "LOW" and float(bar["close"]) < price):
                order.update(status="cancelled", reason="liquidity level broken before entry")
                break
        order["updated_at"] = quant_game_store.now()
        save(db, order)
    db.commit()
    return filled

"""Persistent, versioned chart order amendments. All orders remain paper-only."""
import math


def ensure_schema(db):
    columns = {r['name'] for r in db.execute('PRAGMA table_info(quant_lab_sim_limit_orders)')}
    for key, definition in (
        ('order_type', "TEXT NOT NULL DEFAULT 'limit'"), ('trigger_price', 'REAL'),
        ('triggered_bar_time', 'INTEGER'), ('checked_through_bar_time', 'INTEGER NOT NULL DEFAULT 0'),
        ('revision', 'INTEGER NOT NULL DEFAULT 1'), ('bracket_ready', 'INTEGER NOT NULL DEFAULT 1'),
        ('hunt_session_id', 'TEXT'),
    ):
        if key not in columns:
            db.execute(f'ALTER TABLE quant_lab_sim_limit_orders ADD COLUMN {key} {definition}')
    db.execute('UPDATE quant_lab_sim_limit_orders SET checked_through_bar_time=placed_bar_time WHERE checked_through_bar_time=0')


def number(value, name):
    try:
        value = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(name + ' must be a positive price') from exc
    if not math.isfinite(value) or value <= 0 or value > 1_000_000_000:
        raise ValueError(name + ' must be a positive price')
    return value


def validate_trigger(side, kind, trigger, limit):
    if kind not in ('limit', 'stop_limit'):
        raise ValueError('Entries use Limit or Stop Limit; market stop entries are unavailable')
    if kind == 'stop_limit':
        trigger = number(trigger, 'Stop trigger')
        if side == 'long' and limit < trigger or side == 'short' and limit > trigger:
            raise ValueError('Buy stop-limit price must be at or above its trigger; sell limit at or below')
    return trigger if kind == 'stop_limit' else None


def initialize(db, order, payload, server):
    kind = payload.get('order_type', 'limit')
    trigger = validate_trigger(order['side'], kind, payload.get('trigger_price'), order['limit_price'])
    ready = not payload.get('chart_bracket_draft') or order['stop_price'] is not None and order['target_price'] is not None
    session = None
    if order['account_id'].startswith('crypto-month-'):
        session = server.crypto_day_desk.require_clock_in(order['account_id'], order['provider'], order['symbol'])['id']
    db.execute('UPDATE quant_lab_sim_limit_orders SET order_type=?,trigger_price=?,bracket_ready=?,hunt_session_id=? WHERE order_id=?',
               (kind, trigger, int(ready), session, order['order_id']))
    db.commit()
    return dict(db.execute('SELECT * FROM quant_lab_sim_limit_orders WHERE order_id=?', (order['order_id'],)).fetchone())


def amend(db, payload, server):
    row = db.execute('SELECT * FROM quant_lab_sim_limit_orders WHERE order_id=?', (str(payload.get('order_id', '')),)).fetchone()
    if not row or row['status'] != 'pending':
        raise ValueError('Order has filled or been canceled; refresh the chart')
    if int(payload.get('revision', -1)) != row['revision']:
        raise ValueError('Order changed while editing; refresh the chart and retry')
    cutoff = int(payload.get('current_bar_time', 0))
    if cutoff < row['checked_through_bar_time'] or cutoff < row['placed_bar_time']:
        raise ValueError('Refresh the chart before modifying this order')
    entry = number(payload.get('entry_price', row['limit_price']), 'Limit price')
    quantity = number(payload.get('quantity', row['quantity']), 'Quantity')
    if quantity > 1_000_000:
        raise ValueError('Quantity is out of range')
    def optional(key):
        value = payload.get(key, row[key])
        return None if value in (None, '') else number(value, key)
    stop, target = optional('stop_price'), optional('target_price')
    direction = 1 if row['side'] == 'long' else -1
    if stop is not None and direction * (entry - stop) <= 0:
        raise ValueError('SL must protect the other side of the limit entry')
    if target is not None and direction * (target - entry) <= 0:
        raise ValueError('PT must be beyond the limit entry in the trade direction')
    trigger = validate_trigger(row['side'], row['order_type'], payload.get('trigger_price', row['trigger_price']), entry)
    ready = stop is not None and target is not None
    if row['account_id'].startswith('crypto-month-'):
        session = server.crypto_day_desk.require_clock_in(row['account_id'], row['provider'], row['symbol'])
        if row['hunt_session_id'] and row['hunt_session_id'] != session['id']:
            raise ValueError('This order belongs to an earlier hunt; cancel it and place a new order')
        if ready:
            server.crypto_day_desk.check_paper_risk(row['provider'], row['symbol'], row['side'], entry, stop, target)
    # Amended prices are eligible only on a later completed bar, never historical OHLC.
    db.execute('''UPDATE quant_lab_sim_limit_orders SET limit_price=?,quantity=?,stop_price=?,target_price=?,
        trigger_price=?,bracket_ready=?,checked_through_bar_time=?,revision=revision+1 WHERE order_id=? AND status='pending' AND revision=?''',
        (entry, quantity, stop, target, trigger, int(ready), cutoff, row['order_id'], row['revision']))
    db.commit()
    return dict(db.execute('SELECT * FROM quant_lab_sim_limit_orders WHERE order_id=?', (row['order_id'],)).fetchone())


def eligible_session(order, server):
    if not order['hunt_session_id']:
        return True
    try:
        session = server.crypto_day_desk.require_clock_in(order['account_id'], order['provider'], order['symbol'])
    except ValueError:
        return False
    return session['id'] == order['hunt_session_id']

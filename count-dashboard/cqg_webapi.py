"""Read-only CQG WebAPI time bars for Count Desk.

CQG credentials and client IDs are supplied only through the local environment.
This module deliberately has no order, account, or trading request methods.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
PROTOCOL = ROOT / ".cqg-protocol"
DEMO_URL = "wss://demoapi.cqg.com"
TIMEFRAMES = {
    "1m": (8, 1, 60), "2m": (8, 2, 120), "3m": (8, 3, 180),
    "5m": (8, 5, 300), "15m": (8, 15, 900), "30m": (8, 30, 1800),
    "1H": (7, 1, 3600), "4H": (7, 4, 14400), "1D": (6, 1, 86400),
}
SYMBOL_ENV = {"CBOT_MINI:MYM1!": "BATTY_CQG_MYM_SYMBOL"}


class CQGAccessError(RuntimeError):
    pass


def load_local_env(path: Path = ROOT / ".env") -> None:
    """Load ignored local settings without overriding shell values."""
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (piece.strip() for piece in line.split("=", 1))
        if key.startswith("BATTY_CQG_") and key.replace("_", "").isalnum():
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            os.environ.setdefault(key, value)


def _protocol():
    if not (PROTOCOL / "WebAPI" / "webapi_2_pb2.py").is_file():
        raise CQGAccessError("CQG protocol bindings missing; run python3 count-dashboard/setup_cqg_protocol.py")
    if str(PROTOCOL) not in sys.path:
        sys.path.insert(0, str(PROTOCOL))
    try:
        from WebAPI import webapi_2_pb2
    except ImportError as exc:
        raise CQGAccessError("Install count-dashboard/requirements-cqg.txt") from exc
    return webapi_2_pb2


def _url() -> str:
    url = os.environ.get("BATTY_CQG_WEBSOCKET_URL", DEMO_URL).strip()
    parsed = urlparse(url)
    if parsed.scheme != "wss" or not parsed.hostname or parsed.username or parsed.password:
        raise CQGAccessError("CQG WebAPI URL must be a credential-free wss:// address")
    return url


def _is_demo(url: str) -> bool:
    return urlparse(url).hostname == "demoapi.cqg.com"


def _enabled(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "yes", "true"}


def connect_only() -> str:
    """Check TLS/WebSocket reachability; this does not authenticate."""
    from websockets.sync.client import connect
    url = _url()
    with connect(url, open_timeout=8, close_timeout=3) as websocket:
        websocket.close()
    return urlparse(url).hostname or ""


def _base_millis(iso_time: str) -> int:
    value = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def _receive(websocket, pb, deadline: float, base_ms: int | None = None):
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise CQGAccessError("CQG WebAPI response timed out")
        raw = websocket.recv(timeout=remaining)
        if not isinstance(raw, bytes):
            raise CQGAccessError("CQG WebAPI returned a nonbinary frame")
        message = pb.ServerMsg()
        message.ParseFromString(raw)
        if message.HasField("ping"):
            reply = pb.ClientMsg()
            reply.pong.token = message.ping.token
            reply.pong.ping_utc_time = message.ping.ping_utc_time
            if base_ms is not None:
                reply.pong.pong_utc_time = int(time.time() * 1000) - base_ms
            else:
                reply.pong.pong_utc_time = message.ping.ping_utc_time
            websocket.send(reply.SerializeToString())
        return message


def _credentials() -> tuple[str, str, str]:
    client_id = os.environ.get("BATTY_CQG_CLIENT_APP_ID", "").strip()
    username = os.environ.get("BATTY_CQG_USERNAME", "").strip()
    password = os.environ.get("BATTY_CQG_PASSWORD", "")
    if not client_id or not username or not password:
        raise CQGAccessError("CQG WebAPI client ID and API credentials are required; ordinary platform login is not sufficient")
    return client_id, username, password


def _logon(websocket, pb, deadline: float) -> int:
    client_id, username, password = _credentials()
    request = pb.ClientMsg()
    request.logon.user_name = username
    request.logon.password = password
    request.logon.client_app_id = client_id
    request.logon.private_label = os.environ.get("BATTY_CQG_PRIVATE_LABEL", "").strip() or client_id
    request.logon.client_version = "CountDeskDataOnly/0.1"
    request.logon.protocol_version_major = 2
    request.logon.protocol_version_minor = 230
    # Never evict the user's TradingView / AMP session.
    request.logon.drop_concurrent_session = False
    websocket.send(request.SerializeToString())
    while True:
        response = _receive(websocket, pb, deadline)
        if response.HasField("logon_result"):
            result = response.logon_result
            if result.result_code != 0:
                raise CQGAccessError(f"CQG WebAPI logon rejected (code {result.result_code})")
            return _base_millis(result.base_time)
        if response.HasField("logon_routine_server"):
            raise CQGAccessError("CQG requires a multi-step logon; request API onboarding details from CQG")


def probe_login() -> dict:
    """Authenticate once without requesting symbols, prices, or accounts."""
    from websockets.sync.client import connect
    pb = _protocol()
    url = _url()
    with connect(url, open_timeout=8, close_timeout=3) as websocket:
        _logon(websocket, pb, time.monotonic() + 15)
    return {"authenticated": True, "environment": "CQG DEMO" if _is_demo(url) else "CQG configured endpoint"}


def _resolve(websocket, pb, base_ms: int, symbol: str, deadline: float):
    request = pb.ClientMsg()
    item = request.information_requests.add()
    item.id = 1
    item.symbol_resolution_request.symbol = symbol
    item.symbol_resolution_request.preferred_types = "F"
    websocket.send(request.SerializeToString())
    while True:
        response = _receive(websocket, pb, deadline, base_ms)
        for report in response.information_reports:
            if report.id != 1:
                continue
            if report.status_code >= 100:
                raise CQGAccessError(f"CQG symbol resolution rejected (code {report.status_code})")
            if report.HasField("symbol_resolution_report"):
                resolution = report.symbol_resolution_report
                meta = resolution.contract_metadata
                if resolution.deleted or meta.contract_id <= 0 or not meta.correct_price_scale:
                    raise CQGAccessError("CQG returned an unavailable contract")
                return meta


def _convert_bar(bar, base_ms: int, scale: float) -> dict | None:
    required = ("scaled_open_price", "scaled_high_price", "scaled_low_price", "scaled_close_price")
    if not all(bar.HasField(field) for field in required):
        return None
    row = {
        "time": (base_ms + bar.bar_utc_time) // 1000,
        "open": bar.scaled_open_price * scale,
        "high": bar.scaled_high_price * scale,
        "low": bar.scaled_low_price * scale,
        "close": bar.scaled_close_price * scale,
        "volume": float(Decimal(bar.volume.significand) * (Decimal(10) ** bar.volume.exponent))
        if bar.HasField("volume") else None,
    }
    if row["high"] < max(row["open"], row["close"], row["low"]) or row["low"] > min(row["open"], row["close"], row["high"]):
        raise CQGAccessError("CQG returned an invalid OHLC bar")
    return row


def fetch_bars(chart_symbol: str, timeframe: str, count: int = 500) -> dict:
    """Fetch one exact dated contract; caller must have CQG storage/display rights."""
    if chart_symbol not in SYMBOL_ENV or timeframe not in TIMEFRAMES:
        raise CQGAccessError("Only configured MYM time bars are supported")
    if not 1 <= count <= 5000:
        raise CQGAccessError("CQG bar count must be 1..5000")
    url = _url()
    if _is_demo(url):
        raise CQGAccessError("CQG demo data is isolated from the Count Desk chart database")
    if not _enabled("BATTY_CQG_WEBAPI_ACCESS_APPROVED") or not _enabled("BATTY_CQG_STORAGE_AND_COUNT_RIGHTS_CONFIRMED"):
        raise CQGAccessError("CQG WebAPI access and storage/count rights must be confirmed before chart sync")
    contract_symbol = os.environ.get(SYMBOL_ENV[chart_symbol], "").strip()
    if not contract_symbol or "1!" in contract_symbol:
        raise CQGAccessError("Set BATTY_CQG_MYM_SYMBOL to the exact dated CQG contract")
    from websockets.sync.client import connect
    pb = _protocol()
    unit, unit_number, duration = TIMEFRAMES[timeframe]
    with connect(url, open_timeout=8, close_timeout=3) as websocket:
        deadline = time.monotonic() + 30
        base_ms = _logon(websocket, pb, deadline)
        meta = _resolve(websocket, pb, base_ms, contract_symbol, deadline)
        request = pb.ClientMsg()
        item = request.time_bar_requests.add()
        item.request_id = 2
        item.request_type = 1
        params = item.time_bar_parameters
        params.contract_id = meta.contract_id
        params.bar_unit = unit
        if unit != 6:
            params.unit_number = unit_number
        # Ask for a bounded window, allowing overnight gaps and closed sessions.
        now_ms = int(time.time() * 1000)
        params.from_utc_time = now_ms - base_ms - min(max(count * duration * 4000, 86_400_000), 90 * 86_400_000)
        params.to_utc_time = now_ms - base_ms
        websocket.send(request.SerializeToString())
        rows: dict[int, dict] = {}
        truncated = False
        while True:
            response = _receive(websocket, pb, deadline, base_ms)
            finished = False
            for report in response.time_bar_reports:
                if report.request_id != 2:
                    continue
                if report.status_code != 0:
                    raise CQGAccessError(f"CQG time bars rejected (code {report.status_code})")
                truncated = truncated or report.truncated
                for bar in report.time_bars:
                    row = _convert_bar(bar, base_ms, meta.correct_price_scale)
                    if row and row["time"] + duration <= now_ms // 1000:
                        rows[row["time"]] = row
                finished = report.is_report_complete
            if finished:
                break
    if not rows:
        raise CQGAccessError("CQG returned no complete OHLC bars for this dated contract and interval")
    return {
        "provider": f"AMP / CQG WebAPI {meta.contract_symbol}",
        "symbol": chart_symbol, "timeframe": timeframe, "mode": "DELAYED",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "bars": sorted(rows.values(), key=lambda row: row["time"])[-count:],
        "message": f"CQG dated contract {meta.contract_symbol}; {'history truncated' if truncated else 'historical time bars'}",
    }


def serve_adapter() -> None:
    """Expose the Count Desk feed contract on loopback; no CQG session is opened yet."""
    token = os.environ.get("BATTY_CQG_FEED_ADAPTER_TOKEN", "")
    if len(token) < 20:
        raise CQGAccessError("Set a unique BATTY_CQG_FEED_ADAPTER_TOKEN of at least 20 characters")
    port = int(os.environ.get("BATTY_CQG_ADAPTER_PORT", "8784"))

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/sync":
                self.send_error(404)
                return
            import hmac
            if not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {token}"):
                self.send_error(401)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size <= 0 or size > 4096:
                    raise CQGAccessError("Invalid sync request size")
                payload = json.loads(self.rfile.read(size))
                result = fetch_bars(payload["symbol"], payload["timeframe"], min(int(payload.get("count", 500)), 5000))
                body = json.dumps(result).encode()
                self.send_response(200)
            except (CQGAccessError, KeyError, TypeError, ValueError) as exc:
                body = json.dumps({"error": str(exc)}).encode()
                self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            # Request bodies and credentials never enter a server log.
            pass

    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    load_local_env()
    parser = argparse.ArgumentParser(description="CQG read-only WebAPI connector")
    parser.add_argument("action", choices=["probe-network", "probe-login", "serve"])
    action = parser.parse_args().action
    try:
        if action == "probe-network":
            print(json.dumps({"websocketReachable": True, "host": connect_only(), "authenticated": False}))
        elif action == "probe-login":
            print(json.dumps(probe_login()))
        else:
            serve_adapter()
    except CQGAccessError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)

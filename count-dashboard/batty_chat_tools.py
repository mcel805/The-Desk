#!/usr/bin/env python3
"""Read-only MCP tools for Batty's local dashboard context.

This process is launched only for a single Codex chat turn. It exposes bounded
GET-only reads from the local Count Desk and Liquidity Lab HTTP APIs. It does
not expose files, SQL, mutations, broker actions, or arbitrary network access.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


COUNT_DESK_API = os.environ.get("BATTY_API_BASE", "http://127.0.0.1:8770").rstrip("/")
LIQUIDITY_LAB_API = os.environ.get("BATTY_LIQUIDITY_LAB_API", "http://127.0.0.1:8041").rstrip("/")
ACTIVE_TAB = os.environ.get("BATTY_ACTIVE_TAB", "Count Desk")
ACTIVE_SYMBOL = os.environ.get("BATTY_ACTIVE_SYMBOL", "")
ACTIVE_TIMEFRAME = os.environ.get("BATTY_ACTIVE_TIMEFRAME", "")
ACTIVE_CUTOFF = os.environ.get("BATTY_ACTIVE_CUTOFF", "")
ACTIVE_TEAM_ID = os.environ.get("BATTY_ACTIVE_TEAM_ID", "")
ACTIVE_MEMBER_ID = os.environ.get("BATTY_ACTIVE_MEMBER_ID", "")
ACTIVE_ACCOUNT_ID = os.environ.get("BATTY_ACTIVE_ACCOUNT_ID", "")
ACTIVE_JOURNAL_SYMBOL = os.environ.get("BATTY_ACTIVE_JOURNAL_SYMBOL", "")


def get_json(base: str, path: str, params: dict[str, Any] | None = None) -> dict:
    query = f"?{urlencode(params)}" if params else ""
    request_url = f"{base}{path}{query}"
    with urlopen(request_url, timeout=8) as response:
        value = json.loads(response.read().decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("The dashboard returned an unexpected response shape.")
    return value


def dashboard_overview() -> dict:
    result: dict[str, Any] = {
        "activeTab": ACTIVE_TAB,
        "activeSelection": {
            "symbol": ACTIVE_SYMBOL or None,
            "timeframe": ACTIVE_TIMEFRAME or None,
            "cutoff": ACTIVE_CUTOFF or None,
        },
        "readOnly": True,
        "areas": {},
    }
    try:
        count_overview = get_json(COUNT_DESK_API, "/api/chat/overview")
        result["areas"]["countDesk"] = {
            "available": True,
            **count_overview,
            "activeFeed": get_json(COUNT_DESK_API, "/api/feed/status", {
                "symbol": ACTIVE_SYMBOL, "timeframe": ACTIVE_TIMEFRAME,
            }) if ACTIVE_SYMBOL and ACTIVE_TIMEFRAME else None,
        }
        result["areas"]["tradingJournal"] = {
            "available": True,
            "counts": {
                key: count_overview.get("tableCounts", {}).get(key, 0)
                for key in ("trading_accounts", "execution_imports", "trade_executions",
                            "broker_reported_trades", "paper_trades", "trade_journal")
            },
            "readDetailsOnRequest": True,
        }
    except Exception as exc:
        result["areas"]["countDesk"] = {"available": False, "reason": str(exc)}
        result["areas"]["tradingJournal"] = {"available": False, "reason": str(exc)}
    try:
        result["areas"]["liquidityLab"] = get_json(LIQUIDITY_LAB_API, "/api/dashboard")
        result["areas"]["liquidityLab"]["available"] = True
    except Exception as exc:
        result["areas"]["liquidityLab"] = {"available": False, "reason": str(exc)}
    return result


def read_chart(arguments: dict) -> dict:
    symbol = str(arguments.get("symbol") or ACTIVE_SYMBOL).strip()
    timeframe = str(arguments.get("timeframe") or ACTIVE_TIMEFRAME).strip()
    if not symbol or not timeframe:
        raise ValueError("Choose a symbol and timeframe from the Count Desk first.")
    cutoff_value = arguments.get("cutoff")
    if cutoff_value in (None, ""):
        cutoff_value = ACTIVE_CUTOFF
    params: dict[str, Any] = {"symbol": symbol, "timeframe": timeframe}
    if cutoff_value not in (None, ""):
        params["cutoff"] = cutoff_value
    start_time = arguments.get("start_time")
    end_time = arguments.get("end_time")
    limit = max(1, min(int(arguments.get("limit", 300)), 800))
    params["limit"] = limit
    if start_time not in (None, ""):
        params["start_time"] = int(start_time)
    if end_time not in (None, ""):
        params["end_time"] = int(end_time)
    raw = get_json(COUNT_DESK_API, "/api/bars", params)
    bars = raw.get("bars", [])
    if not isinstance(bars, list):
        raise ValueError("The Count Desk returned invalid bar data.")
    catalog = get_json(COUNT_DESK_API, "/api/symbols").get("symbols", [])
    coverage = next((
        interval for item in catalog if item.get("symbol") == symbol
        for interval in item.get("timeframes", []) if interval.get("timeframe") == timeframe.upper()
    ), None)
    feed = get_json(COUNT_DESK_API, "/api/feed/status", {"symbol": symbol, "timeframe": timeframe})
    drawings = get_json(COUNT_DESK_API, "/api/drawings", {"symbol": symbol, "timeframe": timeframe}).get("drawings", [])
    plans = get_json(COUNT_DESK_API, "/api/journal", {"symbol": symbol, "timeframe": timeframe}).get("items", [])
    return {
        "readOnly": True,
        "symbol": symbol,
        "timeframe": timeframe,
        "sourceAndFreshness": feed,
        "sourceCoverage": coverage,
        "returnedBarCount": len(bars),
        "barRange": {
            "firstReturned": bars[0].get("time") if bars else None,
            "lastReturned": bars[-1].get("time") if bars else None,
        },
        "bars": bars,
        "drawings": drawings,
        "levelJournal": plans,
        "limits": "At most 800 bars are returned per call. Use start_time/end_time windows for older sections.",
    }


def page_list(items: Any, offset: int, limit: int) -> dict:
    if not isinstance(items, list):
        return {"items": items, "total": None, "offset": offset, "limit": limit}
    return {
        "items": items[offset:offset + limit],
        "total": len(items),
        "offset": offset,
        "limit": limit,
        "hasMore": offset + limit < len(items),
    }


def read_trading_journal(arguments: dict) -> dict:
    params = {}
    for key, default in (("team_id", ACTIVE_TEAM_ID), ("member_id", ACTIVE_MEMBER_ID), ("account_id", ACTIVE_ACCOUNT_ID)):
        value = arguments.get(key, default)
        if value not in (None, ""):
            params[key] = str(value)
    payload = get_json(COUNT_DESK_API, "/api/trade-journal", params)
    limit = max(1, min(int(arguments.get("limit", 100)), 250))
    offset = max(0, int(arguments.get("offset", 0)))
    ledger = payload.get("ledger", {})
    journal = get_json(COUNT_DESK_API, "/api/journal", {
        "symbol": str(arguments.get("symbol", ACTIVE_JOURNAL_SYMBOL)),
        "timeframe": str(arguments.get("timeframe", "")),
    }).get("items", [])
    return {
        "readOnly": True,
        "filters": params,
        "workspace": payload.get("workspace", {}),
        "closedTrades": page_list(ledger.get("trades", []), offset, limit),
        "reportedTrades": page_list(ledger.get("reported_trades", []), offset, limit),
        "openPositions": page_list(ledger.get("open_positions", []), offset, limit),
        "paperTrades": page_list(ledger.get("paper_trades", []), offset, limit),
        "countDeskLevelPlans": page_list(journal, offset, limit),
        "note": "Broker imports, paper records, and Count Desk level plans are separate records. Do not treat paper outcomes as broker fills.",
    }


LIQUIDITY_ROUTES = {
    "overview": ("/api/dashboard", False),
    "scientist_journal": ("/api/scientist-journal", False),
    "levels": ("/api/scientist-levels", False),
    "runs": ("/api/scientist-runs", True),
    "zones": ("/api/zones", True),
    "trials": ("/api/trials", True),
    "outcomes": ("/api/outcomes", True),
    "calendar": ("/api/calendar-events", True),
    "fills": ("/api/fills", True),
}


def read_liquidity_lab(arguments: dict) -> dict:
    section = str(arguments.get("section", "overview"))
    if section not in LIQUIDITY_ROUTES:
        raise ValueError(f"Choose a Liquidity Lab section from: {', '.join(LIQUIDITY_ROUTES)}.")
    path, accepts_limit = LIQUIDITY_ROUTES[section]
    limit = max(1, min(int(arguments.get("limit", 100)), 500))
    params = {"limit": limit} if accepts_limit else None
    try:
        result = get_json(LIQUIDITY_LAB_API, path, params)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return {"available": False, "section": section, "reason": str(exc)}
    if section == "levels" and isinstance(result.get("items"), list):
        total = len(result["items"])
        result["items"] = result["items"][:limit]
        result["total"] = total
        result["truncated"] = total > limit
    return {"available": True, "readOnly": True, "section": section, "data": result}


def recent_support_events(arguments: dict) -> dict:
    """Read redacted, bounded chat diagnostics; never exposes prompts or files."""
    limit = max(1, min(int(arguments.get("limit", 20)), 100))
    result = get_json(COUNT_DESK_API, "/api/chat/support-log", {"limit": limit})
    return {
        "readOnly": True,
        "privacy": "Prompts, credentials, screenshots, and file contents are excluded.",
        "events": result.get("events", []),
    }


def read_market_research(arguments: dict) -> dict:
    """Read bounded Market Research indicator events, editions, and source status."""
    raw = get_json(COUNT_DESK_API, "/api/market-research/state")
    product = str(arguments.get("product") or "ALL FUTURES").upper()[:100]
    events = raw.get("events", [])
    if not isinstance(events, list):
        events = []
    relevant = [item for item in events
                if item.get("rights_status") == "approved_internal" and item.get("source_enabled")
                and (product == "ALL FUTURES" or product in item.get("products", []))]
    discoveries = [item for item in (raw.get("discoveries", []) or [])
                   if item.get("rights_status") == "approved_internal"]
    return {
        "readOnly": True,
        "indicator": "market-research",
        "product": product,
        "schedule": raw.get("schedule", {}),
        "sources": (raw.get("sources", []) or [])[:30],
        "reviewedEvents": relevant[:30],
        "recentHeadlineMetadata": discoveries[:30],
        "briefs": (raw.get("briefs", []) or [])[:10],
        "editorialFeedback": (raw.get("editorialFeedback", []) or [])[:50],
        "coverage": "Research registry snapshot; not an exhaustive scan of the financial industry.",
        "rightsRule": "Only sources marked approved_internal may be scanned or used in generated editions.",
        "limits": "Read-only. Headlines are metadata unless separately reviewed. No prices, live order access, or trading authority are provided.",
    }


TOOLS = [
    {
        "name": "dashboard_overview",
        "description": "Read a concise inventory and freshness summary of Count Desk, Trading Journal, and Liquidity Lab data. Read-only.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "read_chart",
        "description": "Read stored OHLC bars, feed freshness, drawings, and level-tracker records for any stored Count Desk symbol/timeframe. Use bounded time windows; read-only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Count Desk symbol; defaults to the active chart."},
                "timeframe": {"type": "string", "description": "Stored timeframe; defaults to the active chart."},
                "cutoff": {"type": ["integer", "string"], "description": "Unix cutoff; defaults to the active chart cutoff."},
                "start_time": {"type": "integer", "description": "Optional inclusive Unix start time."},
                "end_time": {"type": "integer", "description": "Optional inclusive Unix end time."},
                "limit": {"type": "integer", "description": "Maximum 800 bars; default 300."},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "read_trading_journal",
        "description": "Read account/workspace metadata, imported broker executions summarized as trades, reported trades, open positions, paper trades, and Count Desk level plans. Supports team/member/account filters and pagination. Read-only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "team_id": {"type": "string"}, "member_id": {"type": "string"},
                "account_id": {"type": "string"}, "symbol": {"type": "string"},
                "timeframe": {"type": "string"},
                "offset": {"type": "integer", "description": "Pagination offset; default 0."},
                "limit": {"type": "integer", "description": "Records per list; maximum 250, default 100."},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "read_liquidity_lab",
        "description": "Read Liquidity Lab dashboard, scientist journal, levels, runs, zones, trials, outcomes, calendar events, or paper/shadow fills. Read-only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "section": {"type": "string", "enum": list(LIQUIDITY_ROUTES), "description": "Data section; default overview."},
                "limit": {"type": "integer", "description": "Maximum 500 rows for list sections; default 100."},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "recent_support_events",
        "description": "Read recent sanitized Batty chat request diagnostics, including status, latency, model, active dashboard view, attachment type/count, and provider tool names. Does not return user prompts, credentials, screenshots, or file contents. Read-only.",
        "inputSchema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "Number of recent events; maximum 100, default 20."}},
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "read_market_research",
        "description": "Read the bounded Market Research indicator context: source rights and freshness, reviewed events, headline metadata, saved three-clip editions, and configured briefing schedule. Read-only; coverage is not exhaustive.",
        "inputSchema": {"type": "object", "properties": {
            "product": {"type": "string", "description": "Product name or ALL FUTURES."},
            "limit": {"type": "integer", "description": "Reserved for bounded response sizing; maximum 30."}},
            "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
]


def call_tool(name: str, arguments: dict) -> Any:
    if name == "dashboard_overview":
        return dashboard_overview()
    if name == "read_chart":
        return read_chart(arguments)
    if name == "read_trading_journal":
        return read_trading_journal(arguments)
    if name == "read_liquidity_lab":
        return read_liquidity_lab(arguments)
    if name == "recent_support_events":
        return recent_support_events(arguments)
    if name == "read_market_research":
        return read_market_research(arguments)
    raise ValueError(f"Unknown dashboard tool: {name}")


def send(message: dict) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle(message: dict) -> dict | None:
    method = message.get("method")
    request_id = message.get("id")
    if method == "notifications/initialized" or request_id is None:
        return None
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": request_id, "result": {
            "protocolVersion": message.get("params", {}).get("protocolVersion", "2024-11-05"),
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "batty-dashboard-readonly", "version": "1.0.0"},
        }}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = message.get("params") or {}
        try:
            output = call_tool(str(params.get("name", "")), params.get("arguments") or {})
            return {"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False, separators=(",", ":"))}],
                "isError": False,
            }}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": str(exc)}], "isError": True,
            }}
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}}


def main() -> None:
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            response = handle(request)
            if response is not None:
                send(response)
        except Exception as exc:
            request_id = request.get("id") if isinstance(request, dict) else None
            if request_id is not None:
                send({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": str(exc)}})


if __name__ == "__main__":
    main()

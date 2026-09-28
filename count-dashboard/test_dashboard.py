import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import MagicMock
from unittest.mock import patch
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("batty_count_server", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


class DashboardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "test.sqlite3"
        self.db = server.connect(self.path)
        server.seed(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_seeded_catalog_and_derived_timeframes(self):
        items = {x["symbol"]: x for x in server.catalog(self.db)}
        self.assertIn("COINBASE:BTCUSD", items)
        self.assertIn("CBOT_MINI:MYM1!", items)
        mym_rows = items["CBOT_MINI:MYM1!"]["timeframes"]
        mym = {x["timeframe"] for x in mym_rows}
        self.assertEqual(set(server.TIMEFRAME_ORDER), mym)
        self.assertFalse(next(x for x in mym_rows if x["timeframe"] == "1M")["available"])
        self.assertFalse(next(x for x in mym_rows if x["timeframe"] == "2M")["available"])
        self.assertTrue(next(x for x in mym_rows if x["timeframe"] == "1H")["available"])
        for symbol in ("CME_MINI:MES1!", "CME_MINI:MNQ1!", "NYMEX:MCL1!", "COMEX:MGC1!"):
            self.assertEqual(set(server.TIMEFRAME_ORDER), {x["timeframe"] for x in items[symbol]["timeframes"]})
            self.assertTrue(all(not x["available"] for x in items[symbol]["timeframes"]))
        daily = next(x for x in items["CBOT_MINI:MYM1!"]["timeframes"] if x["timeframe"] == "1D")
        self.assertGreaterEqual(daily["bars"], 500)
        self.assertGreaterEqual(daily["last_time"] - daily["first_time"], 700 * 86400)

    def test_chart_sim_waits_for_confirmed_next_bar_and_records_source(self):
        symbol = "CBOT_MINI:MYM1!"
        base = 1_800_000_000

        def ingest(*bars):
            return server.ingest_bars(self.db, {
                "provider": "Permitted paper test feed", "symbol": symbol,
                "timeframe": "1M", "mode": "DELAYED", "bars": list(bars),
            })

        def bar(offset, opening, closing):
            return {"time": base + offset * 60, "open": opening,
                    "high": max(opening, closing) + 1,
                    "low": min(opening, closing) - 1, "close": closing, "volume": 10}

        ingest(bar(0, 100, 100))
        no_levels = server.open_chart_sim_position(self.db, {
            "symbol": symbol, "timeframe": "1M", "side": "short", "quantity": "1",
            "bar_time": base, "stop_price": None, "target_price": None,
        })
        self.assertIsNone(no_levels["stop_price"])
        server.cancel_chart_sim_order(self.db, no_levels["order_id"])
        order = server.open_chart_sim_position(self.db, {
            "symbol": symbol, "timeframe": "1M", "side": "long", "quantity": 1,
            "bar_time": base, "stop_price": 99, "target_price": 105,
        })
        self.assertEqual("queued", server.advance_chart_sim_order(self.db, order["order_id"])["status"])
        ingest(bar(1, 101, 102))
        self.assertEqual([], server.chart_sim_rows(self.db, symbol))
        result = ingest(bar(2, 102, 102))
        self.assertEqual(1, result["paperFills"])
        position = server.chart_sim_rows(self.db, symbol)[0]
        self.assertEqual(101, position["entry_price"])
        self.assertEqual(base + 60, position["entry_bar_time"])
        self.assertIn("Permitted paper test feed", position["entry_source"])
        exit_request = server.close_chart_sim_position(self.db, {
            "position_id": position["position_id"], "bar_time": base + 120,
        })
        self.assertEqual("closing", exit_request["status"])
        ingest(bar(3, 103, 104))
        self.assertEqual("closing", server.chart_sim_rows(self.db, symbol)[0]["status"])
        result = ingest(bar(4, 104, 104))
        self.assertEqual(1, result["paperExits"])
        closed = server.chart_sim_rows(self.db, symbol)[0]
        self.assertEqual("closed", closed["status"])
        self.assertEqual(103, closed["exit_price"])
        self.assertEqual(1.0, closed["gross_pnl"])

    def test_cutoff_excludes_future_bars_and_run_is_cached(self):
        last = self.db.execute("SELECT MAX(time) FROM bars WHERE symbol='COINBASE:BTCUSD' AND timeframe='1D'").fetchone()[0]
        first = server.build_count(self.db, "COINBASE:BTCUSD", "1D", last - 30 * 86400)
        second = server.build_count(self.db, "COINBASE:BTCUSD", "1D", last - 30 * 86400)
        self.assertEqual(first["run"]["runId"], second["run"]["runId"])
        self.assertTrue(all(x["time"] <= first["run"]["cutoff"] for x in first["bars"]))
        stored = self.db.execute("SELECT COUNT(*) FROM count_runs WHERE run_id=?", (first["run"]["runId"],)).fetchone()[0]
        self.assertEqual(1, stored)

    def test_output_is_json_serializable_and_has_three_degrees(self):
        last = self.db.execute("SELECT MAX(time) FROM bars WHERE symbol='COINBASE:BTCUSD' AND timeframe='1D'").fetchone()[0]
        result = server.build_count(self.db, "COINBASE:BTCUSD", "1D", last)
        self.assertEqual(["parent", "middle", "inner"], [x["degree"] for x in result["layers"]])
        self.assertGreaterEqual(len(result["analytics"]["confirmedSwings"]["points"]), 2)
        self.assertEqual(32, len(result["analytics"]["volumeProfile"]["bins"]))
        self.assertEqual(7, len(result["analytics"]["fibonacci"]["levels"]))
        self.assertEqual({"preferred", "alternate"}, {x["id"] for x in result["analytics"]["projections"]})
        json.dumps(result)

    def test_confluences_reference_fib_and_volume_sources(self):
        last = self.db.execute("SELECT MAX(time) FROM bars WHERE symbol='COINBASE:BTCUSD' AND timeframe='1D'").fetchone()[0]
        result = server.build_count(self.db, "COINBASE:BTCUSD", "1D", last)
        for zone in result["analytics"]["confluences"]:
            self.assertTrue(zone["sources"][0].startswith("Fib"))
            self.assertTrue(any(x in {"POC", "VAH", "VAL"} for x in zone["sources"][1:]))
            self.assertGreaterEqual(zone["score"], 2)

    def test_drawings_are_scoped_persisted_and_deleted(self):
        first = server.create_drawing(self.db, {
            "symbol": "CBOT_MINI:MYM1!", "timeframe": "1H", "type": "trend",
            "points": [{"time": 100, "price": 52000}, {"time": 200, "price": 52500}],
            "style": {"color": "#f4b942", "width": 2, "dash": "solid"},
        })
        server.create_drawing(self.db, {
            "symbol": "CBOT_MINI:MYM1!", "timeframe": "4H", "type": "horizontal",
            "points": [{"time": 100, "price": 52100}], "style": {},
        })
        one_hour = server.list_drawings(self.db, "CBOT_MINI:MYM1!", "1H")
        self.assertEqual([first["id"]], [x["id"] for x in one_hour])
        self.assertEqual(1, server.delete_drawing(self.db, first["id"]))
        self.assertEqual([], server.list_drawings(self.db, "CBOT_MINI:MYM1!", "1H"))

    def test_rejects_invalid_drawing_geometry(self):
        with self.assertRaises(ValueError):
            server.create_drawing(self.db, {
                "symbol": "COINBASE:BTCUSD", "timeframe": "1D", "type": "trend",
                "points": [{"time": 100, "price": 10}], "style": {},
            })

    def test_feed_ingest_upserts_bars_and_reports_source_mode(self):
        payload = {
            "provider": "Authorized test adapter", "symbol": "TEST:ABC", "timeframe": "1m",
            "mode": "DELAYED", "message": "Synthetic test only",
            "bars": [
                {"time": 1000, "open": 10, "high": 12, "low": 9, "close": 11, "volume": 20},
                {"time": 1060, "open": 11, "high": 13, "low": 10, "close": 12, "volume": 30},
            ],
        }
        result = server.ingest_bars(self.db, payload)
        self.assertEqual(2, result["accepted"])
        self.assertEqual("DELAYED", result["mode"])
        updated = {**payload, "bars": [{**payload["bars"][1], "close": 12.5, "high": 13.5}]}
        server.ingest_bars(self.db, updated)
        rows = self.db.execute("SELECT time, close FROM bars WHERE symbol='TEST:ABC' AND timeframe='1M' ORDER BY time").fetchall()
        self.assertEqual([(1000, 11.0), (1060, 12.5)], [(row["time"], row["close"]) for row in rows])
        derived = self.db.execute(
            "SELECT open,high,low,close,volume FROM bars WHERE symbol='TEST:ABC' AND timeframe='5M'"
        ).fetchone()
        self.assertEqual((10.0, 13.5, 9.0, 12.5, 50.0), tuple(derived))
        self.assertEqual(["2M", "3M", "5M", "15M", "30M", "1H", "4H"], result["derivedTimeframes"])
        status = server.feed_status(self.db, "TEST:ABC", "1M")
        self.assertEqual("receiving", status["status"])
        self.assertEqual("Authorized test adapter", status["provider"])
        self.assertEqual("DELAYED", status["mode"])
        self.assertEqual(server.FEED_SYNC_INTERVAL_SECONDS, status["syncIntervalSeconds"])
        self.assertEqual(int(server.datetime.fromisoformat(status["updatedAt"]).timestamp()) + server.FEED_SYNC_INTERVAL_SECONDS,
                         status["nextSyncAt"])
        server.heartbeat_feed(self.db, {"provider": "Authorized test adapter", "symbol": "TEST:ABC",
                                       "timeframe": "1m", "mode": "DELAYED"})
        self.assertEqual(1060, server.feed_status(self.db, "TEST:ABC", "1m")["lastBarTime"])

    def test_mcp_sync_requires_loopback_adapter_and_valid_request(self):
        with self.assertRaises(RuntimeError):
            server.sync_from_adapter(self.db, {
                "provider": "licensed", "symbol": "TEST:ABC", "timeframe": "1D"
            })
        with self.assertRaises(ValueError):
            server.sync_from_adapter(self.db, {
                "provider": "tradingview", "symbol": "TEST:ABC", "timeframe": "1D"
            })
        with self.assertRaises(ValueError):
            with patch.dict(os.environ, {"BATTY_MCP_FEED_ADAPTER_URL": "https://example.com"}):
                server.sync_adapter_config()

    def test_provider_registry_exposes_rights_and_market_gates(self):
        self.assertEqual("not_connected", server.provider_source_state("massive"))
        with patch.dict(os.environ, {
            "BATTY_MASSIVE_API_KEY": "test-secret",
            "BATTY_MASSIVE_MYM_TICKER": "MYMZ6",
        }, clear=False):
            self.assertEqual("rights_confirmation_required", server.provider_source_state("massive"))
            self.assertEqual("not_connected", server.provider_source_state("massive", "CME_MINI:MES1!"))
            with self.assertRaisesRegex(RuntimeError, "locked until the plan's storage"):
                server.sync_from_adapter(self.db, {
                    "provider": "massive", "symbol": "CBOT_MINI:MYM1!", "timeframe": "1D"
                })

    def test_massive_direct_sync_normalizes_bars_and_keeps_key_server_side(self):
        payload = {"results": [
            {"window_start": 1_800_000_060_000_000_000, "open": 101, "high": 103,
             "low": 100, "close": 102, "volume": 12},
            {"window_start": 1_800_000_000_000_000_000, "open": 99, "high": 102,
             "low": 98, "close": 101, "volume": 10},
        ]}
        response = MagicMock()
        response.status = 200
        response.read.return_value = json.dumps(payload).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = None
        env = {
            "BATTY_MASSIVE_API_KEY": "test-secret",
            "BATTY_MASSIVE_MYM_TICKER": "MYMZ6",
            "BATTY_MASSIVE_STORAGE_AND_COUNT_RIGHTS_CONFIRMED": "1",
        }
        with patch.dict(os.environ, env, clear=False), patch("urllib.request.urlopen", return_value=response) as open_url:
            result = server.sync_from_massive(self.db, "CBOT_MINI:MYM1!", "1M")
        self.assertEqual(2, result["accepted"])
        self.assertEqual("Massive (MYMZ6)", result["dataProvider"])
        rows = self.db.execute(
            "SELECT time, close FROM bars WHERE symbol='CBOT_MINI:MYM1!' AND timeframe='1M' ORDER BY time"
        ).fetchall()
        self.assertEqual([(1_800_000_000, 101.0), (1_800_000_060, 102.0)], [(x[0], x[1]) for x in rows])
        requested_url = open_url.call_args.args[0].full_url
        self.assertIn("/futures/v1/aggs/MYMZ6?", requested_url)
        self.assertIn("resolution=1min", requested_url)
        self.assertIn("apiKey=test-secret", requested_url)

        with patch.dict(os.environ, {
            "BATTY_MASSIVE_API_KEY": "test-secret",
            "BATTY_MASSIVE_MES_TICKER": "MESZ6",
            "BATTY_MASSIVE_STORAGE_AND_COUNT_RIGHTS_CONFIRMED": "1",
        }, clear=False):
            self.assertEqual("adapter_configured", server.provider_source_state("massive", "CME_MINI:MES1!"))

    def test_massive_supports_mgc_two_minute_contract_bars(self):
        payload = {"results": [
            {"window_start": 1_800_000_120_000_000_000, "open": 2500, "high": 2502,
             "low": 2499, "close": 2501, "volume": 8},
            {"window_start": 1_800_000_000_000_000_000, "open": 2498, "high": 2501,
             "low": 2497, "close": 2500, "volume": 6},
        ]}
        response = MagicMock()
        response.status = 200
        response.read.return_value = json.dumps(payload).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = None
        env = {
            "BATTY_MASSIVE_API_KEY": "test-secret",
            "BATTY_MASSIVE_MGC_TICKER": "MGCZ6",
            "BATTY_MASSIVE_STORAGE_AND_COUNT_RIGHTS_CONFIRMED": "1",
        }
        with patch.dict(os.environ, env, clear=False), patch("urllib.request.urlopen", return_value=response) as open_url:
            result = server.sync_from_massive(self.db, "COMEX:MGC1!", "2M")
        self.assertEqual(2, result["accepted"])
        self.assertEqual("Massive (MGCZ6)", result["dataProvider"])
        requested_url = open_url.call_args.args[0].full_url
        self.assertIn("/futures/v1/aggs/MGCZ6?", requested_url)
        self.assertIn("resolution=2min", requested_url)

    def test_yahoo_automated_feed_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Yahoo Finance automated sync is unavailable"):
            server.sync_from_adapter(self.db, {
                "provider": "yahoo", "symbol": "CBOT_MINI:MYM1!", "timeframe": "1D"
            })

    def test_feed_ingest_rejects_invalid_bar(self):
        with self.assertRaises(ValueError):
            server.ingest_bars(self.db, {
                "provider": "test", "symbol": "TEST:BAD", "timeframe": "1m", "mode": "REALTIME",
                "bars": [{"time": 1, "open": 10, "high": 8, "low": 9, "close": 11}],
            })


if __name__ == "__main__":
    unittest.main()

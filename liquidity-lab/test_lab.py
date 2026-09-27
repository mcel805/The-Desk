from __future__ import annotations

import importlib.util
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("liquidity_lab_server", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


def iso(minutes: int) -> str:
    base = datetime(2026, 9, 26, 16, 0, tzinfo=timezone.utc)
    return (base + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def forecast(
    zone_id: str, side: str, top: float, bottom: float, *, timeframe: str = "5m",
    available: str | None = None, probability: float = 0.74, source: str = "measured",
) -> dict:
    return {
        "event": "zone_created",
        "protocol_version": "mym-lz-forward-v0.1",
        "indicator": "Batty Clean Zone View",
        "indicator_version": "v1.9.6-lab",
        "model_version": "test-model",
        "indicator_source_sha256": "abc123",
        "symbol": "CBOT_MINI:MYMZ2026",
        "contract": "CBOT_MINI:MYMZ2026",
        "timeframe": timeframe,
        "zone_id": zone_id,
        "side": side,
        "zone_class": "external_swing",
        "zone_top": top,
        "zone_bottom": bottom,
        "pivot_time": iso(-10),
        "available_at": available or iso(0),
        "structural_score": 6,
        "probability": probability,
        "probability_samples": 171,
        "probability_source": source,
        "probability_tier": "A",
        "bias": "bullish",
    }


def bar(minutes: int, low: float, high: float, close: float, timeframe: str = "5m") -> dict:
    return {
        "contract": "CBOT_MINI:MYMZ2026",
        "timeframe": timeframe,
        "bar_time": iso(minutes),
        "open": close,
        "high": high,
        "low": low,
        "close": close,
        "volume": 100,
        "source": "test",
    }


class LiquidityLabTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "lab.sqlite3"
        self.db = server.connect(self.path)
        self.old_env = dict(os.environ)
        os.environ["LIQUIDITY_LAB_ENTRY_SLIPPAGE_TICKS"] = "1"
        os.environ["LIQUIDITY_LAB_STOP_SLIPPAGE_TICKS"] = "1"
        os.environ["LIQUIDITY_LAB_ROUND_TURN_COST_USD"] = "0"

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()
        os.environ.clear()
        os.environ.update(self.old_env)

    def add_target_and_bsl(self, suffix: str = "a"):
        server.register_forecast(self.db, forecast(f"ssl-target-{suffix}", "SSL", 101, 100))
        return server.register_forecast(self.db, forecast(f"bsl-entry-{suffix}", "BSL", 151, 150))

    def test_forecast_is_idempotent_and_immutable(self):
        first = server.register_forecast(self.db, forecast("zone-1", "BSL", 151, 150))
        second = server.register_forecast(self.db, forecast("zone-1", "BSL", 151, 150))
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(1, self.db.execute("SELECT COUNT(*) FROM zones").fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE zones SET zone_top=999 WHERE zone_id='zone-1'")

    def test_probability_semantics_are_separate_and_15m_is_unscored(self):
        one = server.register_forecast(self.db, forecast("one", "BSL", 151, 150, timeframe="1m"))["zone"]
        thirty = server.register_forecast(self.db, forecast("thirty", "BSL", 151, 150, timeframe="30m"))["zone"]
        fifteen = server.register_forecast(self.db, forecast("fifteen", "BSL", 151, 150, timeframe="15m", source="fallback"))["zone"]
        self.assertEqual("reaction", one["forecast_event"])
        self.assertEqual("attraction", thirty["forecast_event"])
        self.assertEqual("fallback_unscored", fifteen["forecast_event"])

    def test_first_touch_opens_short_with_fixed_stop_and_frozen_target(self):
        self.add_target_and_bsl()
        result = server.ingest_bar(self.db, bar(5, 140, 150, 145))
        self.assertEqual(1, len(result["touched"]))
        trial = self.db.execute("SELECT * FROM trials WHERE zone_id='bsl-entry-a'").fetchone()
        self.assertEqual("short", trial["direction"])
        self.assertEqual(149, trial["entry_price"])
        self.assertEqual(179, trial["stop_price"])
        self.assertEqual(101, trial["target_price"])
        self.assertEqual("ssl-target-a", trial["target_zone_id"])
        self.assertEqual("eligible_first_in", trial["executable_status"])

    def test_tick_path_resolves_target_and_scores_reaction(self):
        self.add_target_and_bsl("tick")
        touch = server.ingest_tick(self.db, {
            "contract": "CBOT_MINI:MYMZ2026", "event_time": iso(1), "price": 150,
            "bid": 150, "ask": 151, "source": "test",
        })
        self.assertEqual(1, len(touch["touched"]))
        resolved = server.ingest_tick(self.db, {
            "contract": "CBOT_MINI:MYMZ2026", "event_time": iso(2), "price": 101,
            "bid": 100, "ask": 101, "source": "test",
        })
        self.assertEqual("target", resolved["outcomes"][0]["outcome"])
        data = server.dashboard_data(self.db)
        self.assertEqual(1, data["forecast_scores"]["reaction"]["n"])
        self.assertEqual(1.0, data["forecast_scores"]["reaction"]["base_rate"])

    def test_aggregate_bar_with_entry_and_exit_is_ambiguous(self):
        self.add_target_and_bsl("amb")
        result = server.ingest_bar(self.db, bar(5, 95, 180, 145))
        self.assertGreaterEqual(len(result["outcomes"]), 1)
        outcome = self.db.execute(
            "SELECT o.* FROM trial_outcomes o JOIN trials t ON t.trial_id=o.trial_id WHERE t.zone_id='bsl-entry-amb'"
        ).fetchone()
        self.assertEqual("ambiguous", outcome["outcome"])
        self.assertEqual(1, outcome["ambiguous"])
        self.assertLess(outcome["r_multiple"], 0)

    def test_one_contract_policy_blocks_overlapping_executable_trial(self):
        self.add_target_and_bsl("first")
        self.add_target_and_bsl("second")
        server.ingest_tick(self.db, {
            "contract": "CBOT_MINI:MYMZ2026", "event_time": iso(1), "price": 150,
            "bid": 150, "ask": 151,
        })
        rows = self.db.execute("SELECT executable_status FROM trials ORDER BY trial_id").fetchall()
        self.assertEqual(2, len(rows))
        self.assertEqual({"eligible_first_in", "blocked_existing_position"}, {row[0] for row in rows})

    def test_untouched_zone_expires_after_twenty_source_bars(self):
        server.register_forecast(self.db, forecast("far-bsl", "BSL", 301, 300, timeframe="1m"))
        for minute in range(1, 21):
            server.ingest_bar(self.db, bar(minute, 100, 110, 105, timeframe="1m"))
        events = self.db.execute(
            "SELECT event_type FROM zone_events WHERE zone_id='far-bsl' ORDER BY event_time"
        ).fetchall()
        self.assertEqual(["created", "expired"], [row[0] for row in events])

    def test_stop_fill_includes_separate_adverse_slippage(self):
        self.add_target_and_bsl("stop")
        server.ingest_tick(self.db, {
            "contract": "CBOT_MINI:MYMZ2026", "event_time": iso(1), "price": 150,
            "bid": 150, "ask": 151,
        })
        result = server.ingest_tick(self.db, {
            "contract": "CBOT_MINI:MYMZ2026", "event_time": iso(2), "price": 180,
        })
        outcome = result["outcomes"][0]
        self.assertEqual("stop", outcome["outcome"])
        self.assertEqual(181, outcome["exit_price"])
        self.assertEqual(-31, outcome["gross_ticks"])

    def test_daily_run_has_seven_steps_and_completed_step_requires_output(self):
        result = server.create_scientist_run(self.db, {
            "trade_date": "2026-09-28", "asset_code": "MYM", "contract": "MYMZ2026",
            "method_version": "liquidity-loop-v0.3", "created_by": "test",
        })
        run = result["run"]
        self.assertEqual(7, len(run["steps"]))
        self.assertEqual("2026-09-27T22:00:00Z", run["session_open"])
        self.assertEqual("2026-09-28T21:00:00Z", run["session_close"])
        with self.assertRaisesRegex(ValueError, "require an output"):
            server.append_scientist_step(self.db, {
                "run_id": run["run_id"], "step_key": "preparation",
                "event_type": "completed", "summary": "Prepared", "owner": "test",
            })
        updated = server.append_scientist_step(self.db, {
            "run_id": run["run_id"], "step_key": "preparation",
            "event_type": "completed", "summary": "Contract and session verified.",
            "owner": "test", "output_title": "Preparation manifest",
            "output_document": "Eligible levels: none in this fixture.",
        })["run"]
        self.assertEqual("completed", updated["steps"][0]["status"])
        artifact_url = updated["steps"][0]["latest"]["artifact_url"]
        self.assertTrue(artifact_url.startswith("/api/scientist-artifact?artifact_id="))
        release = server.scientist_release_html(self.db, run["run_id"])
        self.assertIn("Contract and session verified", release)
        self.assertIn("Preparation manifest", release)

    def test_scientist_forecast_and_outcome_cannot_cross_session_close(self):
        run = server.create_scientist_run(self.db, {
            "trade_date": "2026-09-28", "asset_code": "MYM", "contract": "MYMZ2026",
            "method_version": "liquidity-loop-v0.3",
        })["run"]
        available = "2026-09-27T20:00:00Z"
        payload = forecast("scientist-zone", "SSL", 101, 100, available=available)
        payload["symbol"] = payload["contract"] = "MYMZ2026"
        server.register_forecast(self.db, payload)
        forecast_at = "2026-09-27T21:50:00Z"
        with mock.patch.object(server, "utc_now", return_value=forecast_at):
            with self.assertRaisesRegex(ValueError, "cannot exceed"):
                server.create_scientist_forecast(self.db, {
                    "run_id": run["run_id"], "zone_id": "scientist-zone",
                    "forecast_at": forecast_at, "expires_at": "2026-09-28T21:00:01Z",
                    "hold_probability": 0.75, "entry_price": 101, "stop_price": 71,
                    "target_price": 131, "rationale": "Fixture",
                })
            created = server.create_scientist_forecast(self.db, {
                "run_id": run["run_id"], "zone_id": "scientist-zone",
                "forecast_at": forecast_at, "expires_at": run["session_close"],
                "hold_probability": 0.75, "entry_price": 101, "stop_price": 71,
                "target_price": 131, "rationale": "Fixture",
            })["forecast"]
        with self.assertRaisesRegex(ValueError, "cannot exceed session close"):
            server.record_scientist_outcome(self.db, {
                "forecast_id": created["forecast_id"], "outcome": "timeout",
                "outcome_time": "2026-09-28T21:00:01Z", "exit_price": 110,
                "resolution_source": "test",
            })
        outcome = server.record_scientist_outcome(self.db, {
            "forecast_id": created["forecast_id"], "outcome": "timeout",
            "outcome_time": run["session_close"], "exit_price": 110,
            "resolution_source": "test",
        })["forecast"]
        self.assertEqual("timeout", outcome["outcome"])

    def test_session_close_resolves_touched_and_untouched_forecasts(self):
        run = server.create_scientist_run(self.db, {
            "trade_date": "2026-09-28", "asset_code": "MYM", "contract": "MYMZ2026",
            "method_version": "liquidity-loop-v0.3",
        })["run"]
        forecast_at = "2026-09-27T21:50:00Z"
        created = []
        for index in (1, 2):
            zone_id = f"close-zone-{index}"
            payload = forecast(zone_id, "SSL", 101 + index, 100 + index, available="2026-09-27T20:00:00Z")
            payload["symbol"] = payload["contract"] = "MYMZ2026"
            server.register_forecast(self.db, payload)
            with mock.patch.object(server, "utc_now", return_value=forecast_at):
                created.append(server.create_scientist_forecast(self.db, {
                    "run_id": run["run_id"], "zone_id": zone_id,
                    "forecast_at": forecast_at, "expires_at": run["session_close"],
                    "hold_probability": 0.75, "entry_price": 101 + index,
                    "stop_price": 71 + index, "target_price": 131 + index,
                    "rationale": "Fixture",
                })["forecast"])
        server.append_zone_event(
            self.db, "close-zone-1", "touched", "2026-09-28T15:00:00Z",
            102, "test", {},
        )
        self.db.commit()
        with mock.patch.object(server, "utc_now", return_value="2026-09-28T21:00:01Z"):
            result = server.close_scientist_session(self.db, {
                "run_id": run["run_id"], "close_price": 110,
                "resolution_source": "approved-test-close",
            })
        self.assertEqual(2, result["resolved"])
        outcomes = {row["forecast_id"]: row["outcome"] for row in result["forecasts"]}
        self.assertEqual("timeout", outcomes[created[0]["forecast_id"]])
        self.assertEqual("no_touch", outcomes[created[1]["forecast_id"]])


if __name__ == "__main__":
    unittest.main()

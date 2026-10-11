import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import indicator_science as science
from indicator_science_runner import ensure_schema, scan


def iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds")


def plan(rights=True):
    return {
        "indicator_id": "liquidity", "title": "Forward liquidity", "method_version": "liquidity-map-v1 / 1.0.0",
        "instrument": "TEST:MYM", "dated_contract": "MYMZ2026", "contract_evidence": "Synthetic test contract specification",
        "contract_expiry_date": "2030-12-31", "contract_mapping_confirmed": True,
        "contract_mapping_note": "Synthetic test mapping", "source_id": "approved-test-feed",
        "rights_note": "Synthetic test source; local research permitted", "rights_confirmed": rights,
        "tick_size_source": "Synthetic test contract specification", "session_policy_confirmed": True,
        "scientist": "Test Scientist", "signal_definition": science.LIQUIDITY_SIGNAL_DEFINITION,
        "timeframes": list(science.TIMEFRAMES), "level_kinds": ["EXT", "INT"],
        "entries": ["first_touch", "confirmed_reversal"],
        "targets": ["opposite_liquidity", "swing_structure"],
        "break_evens": ["none", "one_r"], "tick_size": 1, "stop_ticks": 5,
        "horizon_bars": 5,
        "external_length": 14, "internal_length": 5, "convergence_atr": 0.1,
        "primary_candidate_variant": "confirmed_reversal:opposite_liquidity:none",
    }


def create_plan(db, payload):
    coverage = {"sources": [{"source_id": "approved-test-feed",
                             "timeframes": [{"timeframe": timeframe} for timeframe in science.TIMEFRAMES]}]}
    return science.create(db, payload, coverage)


class IndicatorScienceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.lab = science.connect(Path(self.temp.name)/"science.sqlite3")

    def tearDown(self):
        self.lab.close()
        self.temp.cleanup()

    def test_rights_and_forward_cutoff(self):
        blocked = create_plan(self.lab, plan(False))
        self.assertEqual(blocked["state"], "blocked_rights")
        with self.assertRaisesRegex(ValueError, "source rights"):
            science.set_running(self.lab, {"experiment_id": blocked["id"], "running": True})
        with self.assertRaisesRegex(ValueError, "rights"):
            science.ingest(self.lab, {"experiment_id": blocked["id"], "observations": [{}]})
        armed = create_plan(self.lab, plan())
        old = {"event_id": "e1", "variant_id": "first_touch:opposite_liquidity:none",
               "timeframe": "1M", "level_kind": "EXT", "session_id": "s1",
               "signal_time": "2020-01-01T00:00:00Z", "outcome_time": "2020-01-01T00:01:00Z",
               "source_id": "approved-test-feed", "source_hash": "a"*64,
               "input_hash": "b"*64, "outcome": "target", "gross_r": 1.5}
        with self.assertRaisesRegex(ValueError, "Forward"):
            science.ingest(self.lab, {"experiment_id": armed["id"], "observations": [old]})

    def test_setup_context_reads_coverage_without_claiming_rights(self):
        chart = sqlite3.connect(":memory:")
        chart.row_factory = sqlite3.Row
        chart.executescript("""CREATE TABLE datasets(dataset_id TEXT PRIMARY KEY,source TEXT,imported_at TEXT);
            CREATE TABLE bars(dataset_id TEXT,symbol TEXT,timeframe TEXT,time INTEGER);""")
        chart.execute("INSERT INTO datasets VALUES (?,?,?)", ("d1", "local-test", "2026-10-01T12:00:00+00:00"))
        chart.execute("INSERT INTO bars VALUES (?,?,?,?)", ("d1", "TEST:MYM", "1M", 1_759_323_600))
        result = science.setup_context(chart, "TEST:MYM")
        self.assertEqual(result["sources"][0]["source_id"], "local-test")
        self.assertEqual(result["sources"][0]["timeframes"][0]["bars"], 1)
        self.assertEqual(result["rightsState"], "unverified")
        self.assertEqual(result["contractState"], "user_confirmation_required")
        chart.close()

    def test_run_switch_preserves_frozen_spec_and_resets_cutoff(self):
        exp = create_plan(self.lab, plan())
        frozen_hash = exp["spec_hash"]
        paused = science.set_running(self.lab, {"experiment_id": exp["id"], "running": False})
        self.assertEqual(paused["state"], "paused")
        self.assertIsNone(paused["run_started_at"])
        resumed = science.set_running(self.lab, {"experiment_id": exp["id"], "running": True})
        self.assertEqual(resumed["state"], "armed")
        self.assertEqual(resumed["spec_hash"], frozen_hash)
        self.assertEqual(science.collection_cutoff(self.lab, resumed), resumed["run_started_at"])
        self.assertEqual(self.lab.execute("SELECT COUNT(*) FROM science_run_events WHERE experiment_id=?",
                                          (exp["id"],)).fetchone()[0], 2)

    def test_pause_discloses_pending_trial_as_data_gap(self):
        exp = create_plan(self.lab, plan())
        self.lab.execute("UPDATE experiments SET frozen_at=? WHERE id=?", ("2020-01-01T00:00:00+00:00", exp["id"]))
        ensure_schema(self.lab)
        self.lab.execute("""INSERT INTO science_trials VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            exp["id"], "pending-event", "first_touch:opposite_liquidity:none", "1M", "EXT",
            "2026-10-02", science.now(), "approved-test-feed", "a"*64, "b"*64,
            "SSL", 100, 110, 100, 95, 1, 1, 0, 0, "open", "{}"))
        self.lab.commit()
        science.set_running(self.lab, {"experiment_id": exp["id"], "running": False})
        row = self.lab.execute("SELECT outcome,detail_json FROM observations WHERE experiment_id=?",
                               (exp["id"],)).fetchone()
        self.assertEqual(row["outcome"], "data_gap")
        self.assertIn("user_paused_experiment", row["detail_json"])
        self.assertEqual(self.lab.execute("SELECT state FROM science_trials WHERE experiment_id=?",
                                          (exp["id"],)).fetchone()[0], "resolved")

    def test_completed_bar_scanner_preserves_variants_and_ambiguity(self):
        base = int(datetime(2026, 10, 3, tzinfo=timezone.utc).timestamp())
        chart = sqlite3.connect(":memory:")
        chart.row_factory = sqlite3.Row
        chart.executescript("""
            CREATE TABLE datasets(dataset_id TEXT PRIMARY KEY,source TEXT,source_sha256 TEXT,imported_at TEXT);
            CREATE TABLE bars(dataset_id TEXT,symbol TEXT,timeframe TEXT,time INTEGER,
                open REAL,high REAL,low REAL,close REAL,volume REAL);
        """)
        for i in range(33):
            high, low, close = 101, 99, 100
            if i == 15:
                high, low = 110, 90
            if i == 30:
                high, low, close = 110, 99, 100
            if i == 31:
                high, low, close = 104, 89, 92
            if i == 32:
                high, low, close = 102, 98, 100  # latest bar is unconfirmed
            chart.execute("INSERT INTO datasets VALUES (?,?,?,?)", (f"d{i}", "approved-test-feed", "a"*64, iso(base+i*60+65)))
            chart.execute("INSERT INTO bars VALUES (?,?,?,?,?,?,?,?,?)",
                          (f"d{i}", "TEST:MYM", "1M", base+i*60, 100, high, low, close, 1))
        chart.commit()
        exp = create_plan(self.lab, plan())
        self.lab.execute("UPDATE experiments SET frozen_at=? WHERE id=?", (iso(base+30*60-1), exp["id"]))
        self.lab.commit()
        result = scan(self.lab, chart)
        self.assertGreaterEqual(result["newSignals"], 1)
        score = science.report(self.lab, exp["id"])
        self.assertGreater(score["observations"], 0)
        self.assertGreater(score["primaryComparison"]["pairedResolved"], 0)
        before = score["observations"]
        self.assertEqual(scan(self.lab, chart)["newSignals"], 0)
        self.assertEqual(science.report(self.lab, exp["id"])["observations"], before)
        chart.close()


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

import indicator_agent_store as lab


def protocol_payload():
    return {
        "indicator_id": "liquidity-zones", "title": "Held-out event detection",
        "purpose": "Detect one predeclared sweep event", "output_definition": "Boolean event at bar close",
        "metric_type": "event", "primary_metric": "recall",
        "outcome_definition": "Independent adjudicated sweep label within one session",
        "baseline_version": "v1", "candidate_version": "v2",
        "source_id": "approved-fixture-A", "rights_note": "Synthetic fixture for test only",
        "instrument": "SYNTH", "timeframe": "1M", "cutoff_rule": "Bar close only",
        "sample_plan": "Two untouched sessions; no tuning on these rows",
        "min_rows": 4, "min_effect": 0.1, "guardrails": "No extra false positives",
        "scientist": "Test Scientist",
    }


def observation(ident, session, truth, baseline, candidate):
    return {
        "observation_id": ident, "session_id": session, "source_id": "approved-fixture-A",
        "source_asof": "2026-09-29T14:55:00Z", "decision_cutoff": "2026-09-29T15:00:00Z",
        "outcome_time": "2026-09-29T16:00:00Z", "input_hash": "a" * 64,
        "truth": truth, "incumbent": baseline, "candidate": candidate,
    }


class IndicatorLabTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = lab.connect(Path(self.temp.name) / "indicator.sqlite3")

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_empty_report_and_freeze_gate(self):
        spec = lab.create_protocol(self.db, protocol_payload())
        self.assertEqual(lab.report(self.db, spec["id"])["scientificStatus"], "not_measured")
        with self.assertRaisesRegex(ValueError, "Freeze"):
            lab.ingest(self.db, {"protocol_id": spec["id"], "observations": [observation("a", "s1", True, False, True)]})
        frozen = lab.freeze_protocol(self.db, {"protocol_id": spec["id"], "scientist": "Test Scientist"})
        self.assertEqual(frozen["state"], "frozen")
        with self.assertRaisesRegex(ValueError, "draft"):
            lab.freeze_protocol(self.db, {"protocol_id": spec["id"], "scientist": "Test Scientist"})
        empty = lab.report(self.db, spec["id"])
        with self.assertRaisesRegex(ValueError, "minimum effect"):
            lab.record_decision(self.db, {
                "protocol_id": spec["id"], "scientist": "Test Scientist",
                "decision": "advance_candidate", "rationale": "No evidence exists",
                "report_hash": empty["reportHash"],
            })

    def test_paired_score_and_append_only(self):
        spec = lab.create_protocol(self.db, protocol_payload())
        lab.freeze_protocol(self.db, {"protocol_id": spec["id"], "scientist": "Test Scientist"})
        rows = [
            observation("a", "s1", True, False, True),
            observation("b", "s1", False, False, False),
            observation("c", "s2", True, True, True),
            observation("d", "s2", True, False, True),
        ]
        self.assertEqual(lab.ingest(self.db, {"protocol_id": spec["id"], "observations": rows})["accepted"], 4)
        report = lab.report(self.db, spec["id"])
        self.assertEqual(report["scientificStatus"], "scientist_review_required")
        self.assertAlmostEqual(report["incumbent"], 1 / 3)
        self.assertEqual(report["candidate"], 1.0)
        self.assertAlmostEqual(report["improvement"], 2 / 3)
        self.assertIsNotNone(report["clusterBootstrap95"])
        with self.assertRaisesRegex(ValueError, "append-only"):
            lab.ingest(self.db, {"protocol_id": spec["id"], "observations": rows[:1]})
        self.assertEqual(lab.report(self.db, spec["id"])["scorableRows"], 4)
        decision = lab.record_decision(self.db, {
            "protocol_id": spec["id"], "scientist": "Test Scientist",
            "decision": "investigate", "rationale": "Synthetic score is not a market result",
            "report_hash": report["reportHash"],
        })
        self.assertEqual(decision["decision"], "investigate")
        with self.assertRaisesRegex(ValueError, "Report changed"):
            lab.record_decision(self.db, {
                "protocol_id": spec["id"], "scientist": "Test Scientist",
                "decision": "advance_candidate", "rationale": "Stale decision attempt",
                "report_hash": report["reportHash"],
            })

    def test_reject_lookahead_and_atomic_batch(self):
        spec = lab.create_protocol(self.db, protocol_payload())
        lab.freeze_protocol(self.db, {"protocol_id": spec["id"], "scientist": "Test Scientist"})
        bad = observation("bad", "s1", True, False, True)
        bad["source_asof"] = "2026-09-29T15:01:00Z"
        with self.assertRaisesRegex(ValueError, "not available at cutoff"):
            lab.ingest(self.db, {"protocol_id": spec["id"], "observations": [observation("good", "s1", True, False, True), bad]})
        self.assertEqual(lab.report(self.db, spec["id"])["scorableRows"], 0)

    def test_numeric_error_improvement(self):
        payload = protocol_payload()
        payload.update(metric_type="numeric", primary_metric="mae")
        spec = lab.create_protocol(self.db, payload)
        lab.freeze_protocol(self.db, {"protocol_id": spec["id"], "scientist": "Test Scientist"})
        rows = [observation("a", "s1", 10, 12, 11), observation("b", "s2", 20, 17, 19)]
        lab.ingest(self.db, {"protocol_id": spec["id"], "observations": rows})
        result = lab.report(self.db, spec["id"])
        self.assertEqual(result["incumbent"], 2.5)
        self.assertEqual(result["candidate"], 1)
        self.assertEqual(result["improvement"], 1.5)
        self.assertEqual(result["scientificStatus"], "below_preregistered_sample")


if __name__ == "__main__":
    unittest.main()

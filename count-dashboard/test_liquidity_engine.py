import tempfile
import unittest
from pathlib import Path

import liquidity_engine as engine
import server


def fixture_bars(count=32):
    result = [server.Bar(1000 + index * 60, 6, 7, 5, 6, 100.0) for index in range(count)]
    # Confirmed external swing high and low establish the dealing range.
    if count > 5: result[5] = server.Bar(result[5].time, 18, 20, 17, 19, 100.0)
    if count > 10: result[10] = server.Bar(result[10].time, 3, 4, 2, 2.5, 100.0)
    # Internal high sits inside that range and is then closed through.
    if count > 15: result[15] = server.Bar(result[15].time, 12, 14, 11, 13, 100.0)
    if count > 17: result[17] = server.Bar(result[17].time, 14, 16, 13, 15, 100.0)
    # External BSL boundary is broken by a later close.
    if count > 20: result[20] = server.Bar(result[20].time, 19, 21, 18, 20.5, 100.0)
    return result


class LiquidityEngineTest(unittest.TestCase):
    def test_external_zone_matches_wick_to_body_and_pivot_confirmation(self):
        sample = fixture_bars()
        result = engine.build_liquidity_levels(sample[:-1], "TEST:MYM", "5M", engine.LiquiditySettings(2, 1))
        level = next(item for item in result["levels"] if item["kind"] == "EXT" and item["side"] == "BSL")
        self.assertEqual(20, level["top"])
        self.assertEqual(19, level["bottom"])
        self.assertEqual(sample[5].time, level["pivotTime"])
        self.assertEqual(sample[7].time, level["confirmedTime"])
        self.assertTrue(level["id"].startswith("LQ-EXT-BSL-"))

    def test_internal_level_requires_confirmed_external_range(self):
        sample = fixture_bars()
        result = engine.build_liquidity_levels(sample[:-1], "TEST:MYM", "5M", engine.LiquiditySettings(2, 1))
        level = next(item for item in result["levels"] if item["kind"] == "INT" and item["side"] == "BSL" and item["pivotIndex"] == 15)
        self.assertEqual(14, level["price"])
        self.assertEqual(sample[16].time, level["confirmedTime"])

    def test_closed_break_stops_level_and_retains_touch_history(self):
        sample = fixture_bars()
        result = engine.build_liquidity_levels(sample[:-1], "TEST:MYM", "5M", engine.LiquiditySettings(2, 1))
        internal = next(item for item in result["levels"] if item["kind"] == "INT" and item["side"] == "BSL" and item["pivotIndex"] == 15)
        external = next(item for item in result["levels"] if item["kind"] == "EXT" and item["side"] == "BSL")
        self.assertTrue(internal["broken"])
        self.assertEqual(sample[17].time, internal["brokenTime"])
        self.assertGreaterEqual(internal["touchCount"], 1)
        self.assertTrue(external["broken"])
        self.assertEqual(sample[20].time, external["brokenTime"])

    def test_ids_and_input_hash_are_stable_and_settings_sensitive(self):
        sample = fixture_bars()
        settings = engine.LiquiditySettings(2, 1)
        first = engine.build_liquidity_levels(sample, "TEST:MYM", "5M", settings)
        again = engine.build_liquidity_levels(sample, "TEST:MYM", "5M", settings)
        self.assertEqual([item["id"] for item in first["levels"]], [item["id"] for item in again["levels"]])
        self.assertEqual(engine.input_hash(sample, "TEST:MYM", "5M", settings),
                         engine.input_hash(sample, "TEST:MYM", "5M", settings))
        self.assertNotEqual(engine.input_hash(sample, "TEST:MYM", "5M", settings),
                            engine.input_hash(sample, "TEST:MYM", "5M", engine.LiquiditySettings(3, 1)))

    def test_report_excludes_newest_bar_and_preserves_source_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            with server.connect(Path(folder) / "desk.sqlite3") as db:
                sample = fixture_bars()
                db.execute("INSERT INTO datasets VALUES (?,?,?,?,?,?,?)",
                           ("liquidity-fixture", "Synthetic test fixture", "TEST:MYM", "5M", None, "sha-test", server.utc_now()))
                db.executemany("INSERT INTO bars VALUES (?,?,?,?,?,?,?,?,?,?)", [
                    ("liquidity-fixture", "TEST:MYM", "5M", bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume, 0)
                    for bar in sample
                ])
                report = server.liquidity_engine_report(db, "TEST:MYM", "5M", sample[-1].time,
                                                        engine.LiquiditySettings(2, 1))
        self.assertEqual(sample[-2].time, report["confirmedCutoff"])
        self.assertEqual(sample[-1].time, report["excludedLatestStoredBar"])
        self.assertEqual("Synthetic test fixture", report["sources"][0]["source"])
        self.assertIsNone(report["levels"][0].get("probability"))
        self.assertEqual("liquidity-engine-v1.0.0", report["engineVersion"])

    def test_short_history_is_reported_without_invented_levels(self):
        result = engine.build_liquidity_levels(fixture_bars(8), "TEST", "1M", engine.LiquiditySettings(4, 2))
        self.assertEqual("insufficient_history", result["status"])
        self.assertEqual([], result["levels"])


if __name__ == "__main__":
    unittest.main()

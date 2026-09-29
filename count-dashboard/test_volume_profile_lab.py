import math
import tempfile
import unittest
from pathlib import Path

import volume_profile_lab as lab
import server


def bars(count=24, missing=()):
    return [server.Bar(time=1000 + index * 60, open=100 + index,
                       high=102 + index, low=99 + index, close=101 + index,
                       volume=None if index in missing else float(index + 1))
            for index in range(count)]


class VolumeProfileLabTest(unittest.TestCase):
    def test_missing_volume_is_not_imputed_and_mass_is_conserved(self):
        sample = bars(24, missing=(2, 7, 13))
        result = lab.build_volume_profile(sample)
        self.assertEqual("partial", result["status"])
        self.assertEqual(3, result["missingVolumeBars"])
        expected = sum(bar.volume for bar in sample if bar.volume is not None)
        self.assertEqual(expected, result["totalObservedVolume"])
        self.assertTrue(math.isclose(expected, sum(item["volume"] for item in result["bins"])))
        self.assertLessEqual(result["val"], result["poc"])
        self.assertLessEqual(result["poc"], result["vah"])
        self.assertIsNone(result["probability"])

    def test_no_observed_volume_is_unavailable(self):
        result = lab.build_volume_profile(bars(24, missing=tuple(range(24))))
        self.assertEqual("unavailable", result["status"])
        self.assertEqual([], result["bins"])
        self.assertIsNone(result["poc"])

    def test_missing_volume_bar_cannot_expand_observed_price_range(self):
        sample = bars(24)
        sample[-1] = server.Bar(**{**sample[-1].as_dict(), "high": 1000, "volume": None})
        result = lab.build_volume_profile(sample)
        self.assertEqual("partial", result["status"])
        self.assertLess(result["bins"][-1]["high"], 1000)

    def test_chart_profile_excludes_last_unconfirmed_bar(self):
        sample = bars(25)
        huge = server.Bar(**{**sample[-1].as_dict(), "volume": 1_000_000})
        result = server.volume_profile(sample[:-1] + [huge])
        reference = lab.build_volume_profile(sample[:-1])
        self.assertEqual(reference["inputHash"], result["inputHash"])
        self.assertEqual(sample[-2].time, result["lastBar"])

    def test_missing_volume_does_not_create_profile_confluence(self):
        sample = bars(30, missing=tuple(range(30)))
        analytics = server.structural_analytics(sample)
        self.assertEqual("unavailable", analytics["volumeProfile"]["status"])
        self.assertEqual([], analytics["confluences"])

    def test_replay_uses_each_completed_prefix_and_keeps_probability_unscored(self):
        sample = bars(25)
        settings = lab.ProfileSettings(lookback=20)
        result = lab.replay_profile_quality(sample, settings)
        self.assertEqual(6, result["windows"])
        self.assertEqual(6, result["readyWindows"])
        self.assertEqual(0, result["scoredWindows"])
        self.assertIsNone(result["probability"])
        first = lab.build_volume_profile(sample[:20], settings)
        self.assertEqual(first["inputHash"], result["firstInputHash"])
        changed = sample[:20] + [server.Bar(**{**sample[20].as_dict(), "volume": 9999})] + sample[21:]
        self.assertEqual(result["firstInputHash"], lab.replay_profile_quality(changed, settings)["firstInputHash"])

    def test_report_preserves_source_and_confirmed_cutoff(self):
        with tempfile.TemporaryDirectory() as folder:
            with server.connect(Path(folder) / "lab.sqlite3") as db:
                sample = bars(25)
                db.execute("INSERT INTO datasets VALUES (?,?,?,?,?,?,?)",
                           ("synthetic-fixture", "Synthetic unit test", "TEST:PROFILE", "1M", None, "test-sha", server.utc_now()))
                db.executemany("INSERT INTO bars VALUES (?,?,?,?,?,?,?,?,?,?)", [
                    ("synthetic-fixture", "TEST:PROFILE", "1M", bar.time, bar.open,
                     bar.high, bar.low, bar.close, bar.volume, 0) for bar in sample
                ])
                result = server.volume_profile_report(db, "TEST:PROFILE", "1M", sample[-1].time,
                                                      lab.ProfileSettings(lookback=20), True)
        self.assertEqual(sample[-2].time, result["confirmedCutoff"])
        self.assertEqual("Synthetic unit test", result["sources"][0]["source"])
        self.assertEqual("operational_only", result["replay"]["status"])
        self.assertEqual("not recorded in Count Desk", result["sourceRights"])


if __name__ == "__main__":
    unittest.main()

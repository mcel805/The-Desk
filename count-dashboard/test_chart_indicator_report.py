"""Chart-facing premium study contract tests."""

import unittest

from server import chart_indicator_report


def bars(count=48):
    rows = []
    for index in range(count):
        base = 100 + (index % 8) - 4 + index * 0.03
        rows.append({"time": 1_700_000_000 + index * 300,
                     "open": base, "high": base + 1.5, "low": base - 1.5,
                     "close": base + (0.5 if index % 2 else -0.5)})
    return rows


class ChartIndicatorReportTests(unittest.TestCase):
    def payload(self, indicator="bias"):
        return {"indicatorId": indicator, "symbol": "MYM", "timeframe": "5M",
                "source": "test chart fixture", "bars": bars(), "settings": {"pivotLength": 2}}

    def test_bias_uses_supplied_cutoff_and_settings_in_hash(self):
        payload = self.payload()
        first = chart_indicator_report(payload)
        self.assertEqual(first["confirmedCutoff"], payload["bars"][-1]["time"])
        self.assertEqual(first["indicatorId"], "bias")
        self.assertEqual(first["status"], "ready")
        self.assertEqual(64, len(first["inputHash"]))
        self.assertTrue(all(swing["confirmedTime"] <= first["confirmedCutoff"] for swing in first["swings"]))
        changed = self.payload()
        changed["settings"]["pivotLength"] = 3
        self.assertNotEqual(first["inputHash"], chart_indicator_report(changed)["inputHash"])

    def test_structure_zones_returns_confirmed_research_map(self):
        report = chart_indicator_report(self.payload("structure-zones"))
        self.assertEqual(report["indicatorId"], "structure-zones")
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["confirmedCutoff"], bars()[-1]["time"])
        self.assertIn("zones", report)
        self.assertIn("pools", report)

    def test_rejects_invalid_and_unordered_chart_bars(self):
        payload = self.payload()
        payload["bars"][2]["time"] = payload["bars"][1]["time"]
        with self.assertRaisesRegex(ValueError, "ordered"):
            chart_indicator_report(payload)
        payload = self.payload()
        payload["bars"][3]["high"] = payload["bars"][3]["low"] - 1
        with self.assertRaisesRegex(ValueError, "ordered"):
            chart_indicator_report(payload)

    def test_rejects_unbounded_or_unidentified_input(self):
        payload = self.payload()
        payload["bars"] = bars(2001)
        with self.assertRaisesRegex(ValueError, "at most"):
            chart_indicator_report(payload)
        payload = self.payload()
        payload["source"] = ""
        with self.assertRaisesRegex(ValueError, "source label"):
            chart_indicator_report(payload)


if __name__ == "__main__":
    unittest.main()

"""Static contract tests for the higher-timeframe leadership release.

TradingView compilation and replay remain the authoritative runtime check. These
tests protect the source-level hierarchy contract before that manual test.
"""
import unittest
from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "Batty-Elliot-Wave.pine").read_text()


class MtfLeadershipContract(unittest.TestCase):
    def test_uses_closed_higher_timeframe_values(self):
        self.assertIn("[direction[1], anchor[1], invalidation[1], anchorTime[1], parentId[1]]", SOURCE)
        self.assertIn("lookahead=barmerge.lookahead_on", SOURCE)

    def test_daily_leads_four_hour_and_below(self):
        self.assertIn("bool chartRequiresDailyLeader", SOURCE)
        self.assertIn("bool chartRequiresFourHourLeader", SOURCE)
        self.assertIn("bool mtfHierarchyReady", SOURCE)
        self.assertIn("bool mtfHierarchyAligned", SOURCE)
        self.assertIn('"Daily + 4H lead this chart"', SOURCE)

    def test_conflicts_block_active_paths(self):
        self.assertIn("f_mtfDirectionAllowed(int direction) =>", SOURCE)
        self.assertIn("mtfHierarchyReady and mtfHierarchyAligned and direction == mtfDirection", SOURCE)
        self.assertIn("MTF CONFLICT · forecasts suppressed", SOURCE)
        self.assertIn("bool directionAllowed = f_mtfDirectionAllowed(dir)", SOURCE)

    def test_candidate_tooltip_discloses_gate_and_scope(self):
        self.assertIn("Leadership scope:", SOURCE)
        self.assertIn("BLOCKED — path suppressed", SOURCE)


if __name__ == "__main__":
    unittest.main(verbosity=2)

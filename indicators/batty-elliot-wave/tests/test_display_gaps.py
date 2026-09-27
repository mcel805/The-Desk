"""Display-path regression oracle and Pine source contracts, not Pine execution."""
import unittest
from pathlib import Path

def gap_runs(edges):
    result = []
    for node, left, right in edges:
        if node < 0 and result and result[-1][0] < 0:
            result[-1] = (-1, result[-1][1], right)
        else:
            result.append((node, left, right))
    return result

class DisplayGaps(unittest.TestCase):
    def test_supported_offscreen_root_does_not_consume_recent_gap(self):
        self.assertEqual(gap_runs([(7, 0, 5), (-1, 5, 6), (-1, 6, 7)]),
                         [(7, 0, 5), (-1, 5, 7)])

    def test_separate_gaps_never_cross_supported_segment(self):
        self.assertEqual(gap_runs([(-1, 0, 1), (-1, 1, 2), (8, 2, 5), (-1, 5, 6)]),
                         [(-1, 0, 2), (8, 2, 5), (-1, 5, 6)])

    def test_empty_and_fully_supported(self):
        self.assertEqual(gap_runs([]), [])
        self.assertEqual(gap_runs([(8, 0, 5)]), [(8, 0, 5)])

    def test_pine_fills_each_gap_without_forecast_bypass(self):
        source = (Path(__file__).parents[1] / 'Batty-Elliot-Wave.pine').read_text()
        tree = source.split('f_selectTree(int degree) =>')[1].split('f_drawHistory(')[0]
        self.assertNotIn('HistoryPath display =', tree)
        self.assertIn('HistoryPath resolvedPath =', tree)
        self.assertNotIn('not hasRoot', tree)
        self.assertIn('f_cover(degree, left, right, 0, false, false, true)', tree)
        self.assertIn('array.get(path.ids, at) >= 0', tree)
        self.assertIn('map.get(selectedSupported, id) and', tree)
        self.assertIn('no drawable pattern in display range', source)

    def test_zero_visible_counts_trigger_provisional_geometry_only(self):
        source = (Path(__file__).parents[1] / 'Batty-Elliot-Wave.pine').read_text()
        rebuild = source.split('bool rebuild =', 1)[1]
        self.assertIn('array.get(drawStats, 0) == 0 and showUnresolvedContext and showProvisionalCandidates', rebuild)
        self.assertIn('array<int> fallbackNodes = f_drawAllGeometry(degree)', rebuild)
        self.assertIn('provisional visible fallback', source)
        self.assertIn('var bool usedVisibleFallback = false', source)
        self.assertNotIn('bool usedVisibleFallback = false', rebuild)
        pair = source.split('f_pair(int degree) =>', 1)[1].split('f_rootDegree()', 1)[0]
        self.assertNotIn('fallbackNodes', pair)

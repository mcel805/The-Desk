"""Source regression contracts; these do not compile or execute Pine."""
from pathlib import Path
import unittest

SOURCE = (Path(__file__).parents[1] / 'Batty-Elliot-Wave.pine').read_text()
PAIR = SOURCE.split('f_pair(int degree) =>', 1)[1].split('f_rootDegree()', 1)[0]
TREE = SOURCE.split('f_selectTree(int degree) =>', 1)[1].split('f_drawHistory(', 1)[0]

class SelectedTreeTests(unittest.TestCase):
    def test_no_invalid_lifetime_bypass_or_synthetic_twin(self):
        self.assertIn('if f_alive(c)', PAIR)
        self.assertNotIn('or (not na(c.t1)', PAIR)
        self.assertNotIn('f_recountAlternative(', PAIR)

    def test_children_have_exact_parent_endpoints(self):
        self.assertIn('sa.ts == a.ts and sb.ts == b.ts and sa.p == a.p and sb.p == b.p', TREE)
        self.assertIn('sub.layer < n.layer', TREE)
        self.assertIn('map.get(selectedDepth, id) + 1', TREE)

    def test_forecast_requires_supported_ancestry(self):
        self.assertIn('map.get(selectedSupported, id) and', TREE)
        self.assertIn('map.contains(selectedDepth, id) and inScope', PAIR)
        self.assertIn('map.get(selectedSupported, id)', PAIR)

    def test_identical_price_paths_are_deduplicated(self):
        self.assertIn('prior.nextDir == c.nextDir', PAIR)
        self.assertIn('math.abs(prior.t1 - c.t1) < 1', PAIR)
        self.assertIn('math.abs(prior.inv - c.inv) < 1', PAIR)

    def test_alerts_share_displayed_pair(self):
        self.assertIn('array<Candidate> scenarios = array.copy(livePair)', SOURCE)
        self.assertNotIn('array<Candidate> scenarios = f_scenarios(allChosen)', SOURCE)

    def test_default_render_does_not_restart_forecast_roots(self):
        rebuild = SOURCE.split('bool rebuild =', 1)[1]
        self.assertNotIn('f_drawTree(', rebuild)
        self.assertIn('f_drawHistory(displayPath, degree, false)', rebuild)

if __name__ == '__main__':
    unittest.main()

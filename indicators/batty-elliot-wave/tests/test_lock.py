"""Lock contract tests. Local oracle, not a Pine runtime emulator."""
import unittest
from pathlib import Path


def observe(bars, target=110, invalid=95, direction=1, horizon=3):
    for age, (high, low) in enumerate(bars, 1):
        hit = high >= target if direction == 1 else low <= target
        fail = low <= invalid if direction == 1 else high >= invalid
        if hit or fail or age >= horizon:
            return 'Ambiguous' if hit and fail else 'Target first' if hit else 'Invalidation first' if fail else 'Expired'
    return 'Open'


class LockTests(unittest.TestCase):
    def test_target_first(self):
        self.assertEqual(observe([(111, 99), (112, 90)]), 'Target first')
    def test_failure_stays_failed(self):
        self.assertEqual(observe([(104, 94), (111, 96)]), 'Invalidation first')
    def test_same_bar_order_unknown(self):
        self.assertEqual(observe([(111, 94)]), 'Ambiguous')
    def test_expiry(self):
        self.assertEqual(observe([(104, 98)] * 3), 'Expired')
    def test_short_direction(self):
        self.assertEqual(observe([(101, 89)], 90, 105, -1), 'Target first')
    def test_open(self):
        self.assertEqual(observe([(104, 98)]), 'Open')
    def test_pine_freeze_contract(self):
        source = (Path(__file__).parents[1] / 'Batty-Elliot-Wave.pine').read_text()
        self.assertIn('not lockAttempted and time_close >= lockTime', source)
        self.assertIn('bar_index > fp.issued and fp.state == "Open"', source)
        self.assertIn('fp.anchorTime, fp.origin, fp.issued)', source)
        capture = source.index('array.push(frozen, FrozenPath.new')
        rebuild = source.index('bool rebuild =')
        self.assertLess(capture, rebuild)
        self.assertEqual(source.count('array.push(frozen,'), 1)
        self.assertNotIn('array.clear(frozen)', source)
        self.assertIn('n.layer != chosenDegree', source)
        self.assertIn('prior.key == c.key', source)

if __name__ == '__main__':
    unittest.main()

import unittest

from bias_engine import Bar, BiasSettings, build_bias, input_hash


def bars_from(highs, lows, closes=None, start=100):
    closes = closes or [(high + low) / 2 for high, low in zip(highs, lows)]
    return [Bar(start + i * 10, close, high, low, close)
            for i, (high, low, close) in enumerate(zip(highs, lows, closes))]


class BiasEngineTests(unittest.TestCase):
    def test_swing_sequence_is_only_available_after_right_confirmation(self):
        bars = bars_from(
            [10, 12, 10, 11, 13, 11, 12, 14, 12, 13, 15],
            [8, 9, 7, 9, 10, 8, 10, 11, 9, 11, 12],
        )
        result = build_bias(bars, [], [], "TEST", BiasSettings(pivot_length=1))
        high = next(swing for swing in result["swings"] if swing["time"] == 110)
        self.assertEqual(high["confirmedTime"], 120)
        self.assertEqual(result["points"][0]["bias"], "MIXED")
        self.assertIn(result["points"][-1]["structure"], {"BULLISH", "MIXED"})

    def test_break_requires_close_cross_of_previously_confirmed_swing(self):
        highs = [10, 12, 10, 11, 13, 12, 11, 12, 14, 12, 13]
        lows = [8, 9, 7, 9, 10, 8, 9, 10, 11, 9, 11]
        closes = [9, 11, 9, 10, 12, 11, 10, 11, 13, 11, 15]
        result = build_bias(bars_from(highs, lows, closes), [], [], "TEST", BiasSettings(pivot_length=1))
        bullish = [event for event in result["events"] if event["direction"] == "BULLISH"]
        self.assertTrue(bullish)
        self.assertGreater(bullish[0]["time"], bullish[0]["levelTime"])

    def test_prior_day_sweep_context_uses_previous_period_not_current_period(self):
        daily = [Bar(0, 9, 10, 8, 9), Bar(100, 50, 60, 40, 50)]
        bars = [Bar(110, 8.5, 8.75, 7.5, 8.25), Bar(120, 8.25, 9, 8.1, 8.5),
                Bar(130, 8.5, 9.1, 8.4, 8.8), Bar(140, 8.8, 9, 8.6, 8.7),
                Bar(150, 8.7, 9.2, 8.6, 9), Bar(160, 9, 9.4, 8.8, 9.2),
                Bar(170, 9.2, 9.5, 9, 9.3)]
        result = build_bias(bars, daily, [], "MYM", BiasSettings(pivot_length=1))
        first = result["points"][0]
        self.assertEqual(first["legacyBias"], "BULLISH")
        self.assertEqual(first["legacyReason"], "PDL swept + reclaimed")

    def test_unknown_tick_size_is_explicit_and_uses_zero_tick_buffer(self):
        bars = bars_from([10, 12, 10, 11, 13, 11, 12], [8, 9, 7, 9, 10, 8, 10])
        result = build_bias(bars, [], [], "UNKNOWN", BiasSettings(pivot_length=1))
        self.assertIsNone(result["tickSize"])
        self.assertEqual(result["sweepBuffer"], 0)
        self.assertNotIn("probability", result)

    def test_overall_bias_is_mixed_when_confirmed_higher_timeframe_conflicts(self):
        local = bars_from([10, 12, 10, 11, 13, 11, 12, 14, 12, 13, 15],
                          [8, 9, 7, 9, 10, 8, 10, 11, 9, 11, 12])
        daily = bars_from([10, 14, 12, 13, 11, 12, 10, 11, 9, 10, 8],
                          [8, 10, 7, 9, 6, 8, 5, 7, 4, 6, 3], start=100)
        result = build_bias(local, daily, [], "TEST", BiasSettings(pivot_length=1), "5M")
        self.assertEqual(result["points"][-1]["bias"], "BULLISH")
        self.assertEqual(result["higherStructure"]["bias"], "BEARISH")
        self.assertEqual(result["timeframeAlignment"], "CONFLICT")
        self.assertEqual(result["overallBias"], "MIXED")

    def test_hash_is_stable_and_changes_with_settings(self):
        bars = bars_from([10, 12, 10, 11, 13, 11, 12], [8, 9, 7, 9, 10, 8, 10])
        one = input_hash(bars, [], [], "TEST", BiasSettings(pivot_length=1))
        two = input_hash(bars, [], [], "TEST", BiasSettings(pivot_length=1))
        changed = input_hash(bars, [], [], "TEST", BiasSettings(pivot_length=2))
        self.assertEqual(one, two)
        self.assertNotEqual(one, changed)


if __name__ == "__main__":
    unittest.main()

import unittest

from structure_zones_engine import Bar, StructureZonesSettings, build_structure_zones, input_hash


class StructureZonesEngineTests(unittest.TestCase):
    def test_pivot_is_available_only_after_right_side_confirmation(self):
        bars = [
            Bar(0, 10, 11, 9, 10),
            Bar(1, 10, 12, 8, 9),
            Bar(2, 9, 10, 8.5, 10),
            Bar(3, 10, 11, 9, 10),
        ]
        result = build_structure_zones(
            bars, "TEST", "1M",
            StructureZonesSettings(pivot_length=1, atr_period=2, min_displacement_atr=0),
        )
        pivot = next(item for item in result["swings"] if item["time"] == 1 and item["side"] == "HIGH")
        self.assertEqual(pivot["confirmedTime"], 2)
        self.assertGreater(pivot["confirmedTime"], pivot["time"])

    def test_close_break_creates_zone_and_lifecycle_advances_causally(self):
        bars = [
            Bar(0, 10, 11, 9, 10),
            Bar(1, 10, 12, 8, 9),
            Bar(2, 9, 10, 8.5, 10),
            Bar(3, 10, 11, 9, 10),
            Bar(4, 10, 10.5, 8.5, 9),
            Bar(5, 9, 13.5, 8.8, 13),
            Bar(6, 12.5, 13.2, 9.5, 12.7),
            Bar(7, 10, 10.5, 8, 8.5),
        ]
        settings = StructureZonesSettings(
            pivot_length=1, origin_lookback=3, atr_period=2,
            min_displacement_atr=0.5, equal_tolerance_atr=0,
        )
        result = build_structure_zones(bars, "TEST", "1M", settings)
        event = next(item for item in result["events"] if item["time"] == 5)
        zone = next(item for item in result["zones"] if item["zoneId"] == event["zoneId"])
        self.assertEqual(event["kind"], "BREAK")
        self.assertEqual(zone["state"], "INVALIDATED")
        self.assertEqual(zone["originTime"], 4)
        self.assertEqual(zone["firstTouchTime"], 6)
        self.assertEqual(zone["stateTime"], 7)
        self.assertEqual(result["itemCounts"]["zones"], len(result["zones"]))

    def test_similar_confirmed_highs_form_a_pool_then_wick_reclaim(self):
        bars = [
            Bar(0, 10, 11, 9, 10),
            Bar(1, 10, 12, 9, 10),
            Bar(2, 10, 11, 9, 10),
            Bar(3, 10, 11, 9, 10),
            Bar(4, 10, 12.05, 9, 10),
            Bar(5, 10, 11, 9, 10),
            Bar(6, 10, 12.8, 9.5, 12.0),
        ]
        result = build_structure_zones(
            bars, "TEST", "1M",
            StructureZonesSettings(pivot_length=1, atr_period=2, min_displacement_atr=10,
                                   equal_tolerance_atr=0.1),
        )
        pool = next(item for item in result["pools"] if item["side"] == "HIGH")
        self.assertEqual(pool["memberTimes"], [1, 4])
        self.assertEqual(pool["state"], "RECLAIMED")
        self.assertEqual(pool["stateTime"], 6)

    def test_settings_are_hashed_and_validated(self):
        bars = [Bar(i, 10, 11, 9, 10) for i in range(20)]
        first = input_hash(bars, "TEST", "1M", StructureZonesSettings())
        same = input_hash(bars, "TEST", "1M", StructureZonesSettings())
        changed = input_hash(bars, "TEST", "1M", StructureZonesSettings(pivot_length=5))
        self.assertEqual(first, same)
        self.assertNotEqual(first, changed)
        with self.assertRaises(ValueError):
            StructureZonesSettings(pivot_length=0)


if __name__ == "__main__":
    unittest.main()

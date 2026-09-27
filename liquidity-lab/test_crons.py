from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("validate_crons.py")
SPEC = importlib.util.spec_from_file_location("scientist_cron_validator", MODULE_PATH)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


class ScientistCronValidatorTest(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads(Path(__file__).with_name("scientist-crons.json").read_text())

    def test_canonical_schedule_is_valid(self):
        self.assertEqual([], validator.validate(self.spec))

    def test_detects_close_carry_and_mistimed_flat_job(self):
        self.spec["session"]["carry_beyond_close"] = True
        flat = next(job for job in self.spec["jobs"] if job["id"] == "force_session_flat")
        flat["cron"] = "5 16 * * 1-5"
        errors = validator.validate(self.spec)
        self.assertTrue(any("carry_beyond_close" in error for error in errors))
        self.assertTrue(any("force_session_flat" in error and "offset" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

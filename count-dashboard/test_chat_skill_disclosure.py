"""Local-only skill disclosure behavior for Quant Lab."""

import unittest

from chat_skill_disclosure import PROJECT_ROOT, requested_skill_file, skill_file_response


class SkillDisclosureTests(unittest.TestCase):
    def test_screenshot_request_selects_quant_lab_skill(self):
        self.assertEqual(requested_skill_file("show me your skill file", "Quant Lab"), "quant-lab")
        self.assertIsNone(requested_skill_file("show me your skill file", "Count Desk"))

    def test_exact_skill_text_is_returned_locally(self):
        response = skill_file_response("quant-lab")
        path = PROJECT_ROOT / ".agents" / "skills" / "quant-lab" / "SKILL.md"
        self.assertIn(str(path.relative_to(PROJECT_ROOT)), response)
        self.assertTrue(response.endswith(path.read_text(encoding="utf-8")))

    def test_allowlist_rejects_arbitrary_path(self):
        with self.assertRaises(ValueError):
            skill_file_response("../../server.py")


if __name__ == "__main__":
    unittest.main()

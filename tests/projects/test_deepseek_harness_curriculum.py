import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class DeepSeekHarnessCurriculumTest(unittest.TestCase):
    def test_manifest_points_to_four_language_project_under_docs(self):
        manifest = json.loads((ROOT / "curriculum/projects/docs/deepseek_harness/project.json").read_text())
        self.assertEqual(manifest["supported_languages"], ["zh-Hans", "zh-Hant", "en", "ja"])
        self.assertEqual(manifest["live_verification_state"], "blocked-pending-authorized-access")
        self.assertTrue((ROOT / "curriculum/projects/docs/deepseek_harness/en.json").exists())
        self.assertFalse((ROOT / "lessons/deepseek_harness").exists())


if __name__ == "__main__":
    unittest.main()

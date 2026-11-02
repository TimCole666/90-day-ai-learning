import json
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_DIR = REPO_ROOT / "curriculum" / "projects" / "text_tools"
SUPPORTED_LANGS = ["zh-Hans", "zh-Hant", "en", "ja"]
REQUIRED_SECTIONS = [
    "project_id",
    "title",
    "category",
    "prerequisites",
    "requirements",
    "predictions",
    "worked_examples",
    "exercises",
    "reference_feedback",
    "debugging_cases",
    "independent_mastery_checks",
    "agent_assisted_checks",
    "acceptance_checklist",
]


class TestTextToolsCurriculumFourLanguages(unittest.TestCase):
    """
    Validates that the Text and Data Tools Learning Project provides
    a complete four-language guide across zh-Hans, zh-Hant, en, and ja.
    """

    def test_project_directory_and_metadata_exist(self):
        self.assertTrue(PROJECT_DIR.exists(), f"{PROJECT_DIR} must exist")
        manifest_file = PROJECT_DIR / "project.json"
        self.assertTrue(manifest_file.exists(), f"{manifest_file} must exist")
        meta = json.loads(manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(meta["project_id"], "text_tools")
        self.assertEqual(meta["supported_languages"], SUPPORTED_LANGS)

    def test_all_four_language_editions_exist_and_conform(self):
        for lang in SUPPORTED_LANGS:
            lang_file = PROJECT_DIR / f"{lang}.json"
            self.assertTrue(lang_file.exists(), f"Missing Language Edition file: {lang_file}")
            data = json.loads(lang_file.read_text(encoding="utf-8"))

            for section in REQUIRED_SECTIONS:
                self.assertIn(section, data, f"Language '{lang}' missing required section '{section}'")
                val = data[section]
                if isinstance(val, (str, list, dict)):
                    self.assertTrue(len(val) > 0, f"Section '{section}' in '{lang}' must not be empty")

            # Check that independent mastery is clearly separated from assisted checks
            self.assertGreaterEqual(
                len(data["independent_mastery_checks"]), 2,
                f"Language '{lang}' must define at least 2 independent mastery checks"
            )
            self.assertGreaterEqual(
                len(data["agent_assisted_checks"]), 1,
                f"Language '{lang}' must define at least 1 agent-assisted engineering check"
            )
            self.assertGreaterEqual(
                len(data["debugging_cases"]), 3,
                f"Language '{lang}' must define at least 3 concrete debugging cases"
            )
            self.assertGreaterEqual(
                len(data["acceptance_checklist"]), 5,
                f"Language '{lang}' must define at least 5 acceptance checklist items"
            )


if __name__ == "__main__":
    unittest.main()

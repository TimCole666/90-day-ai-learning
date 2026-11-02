import json
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CURRICULUM_DIR = REPO_ROOT / "curriculum"
DAYS_DIR = CURRICULUM_DIR / "days"
CONTENT_DIR = CURRICULUM_DIR / "content"
MANIFEST_FILE = CURRICULUM_DIR / "manifest.json"
SUPPORTED_LANGS = ["zh-Hans", "zh-Hant", "en", "ja"]
TARGET_DAYS = [31, 32, 33]


class TestAutogradStudyDaysIntegration(unittest.TestCase):
    """
    Validates Study Days 31-33 (Independent Autograd Project)
    against the curriculum specification and public interfaces.
    """

    def test_days_json_structure_and_time_budget(self):
        """Each target study day must sum to exactly 480 active minutes and have valid metadata."""
        for d in TARGET_DAYS:
            day_id = f"day-{d:02d}"
            day_file = DAYS_DIR / f"{day_id}.json"
            self.assertTrue(day_file.exists(), f"Day file missing: {day_file}")

            data = json.loads(day_file.read_text(encoding="utf-8"))
            self.assertEqual(data.get("id"), day_id)
            self.assertEqual(data.get("day_number"), d)
            self.assertEqual(data.get("topic_category"), "mathematics")
            self.assertEqual(data.get("active_minutes"), 480)
            self.assertEqual(data.get("status"), "available", f"{day_id} status should be 'available'")

            activities = data.get("activities", [])
            self.assertGreaterEqual(len(activities), 3, f"{day_id} should have multiple activities")
            total_act_mins = sum(act.get("active_minutes", 0) for act in activities)
            self.assertEqual(
                total_act_mins, 480,
                f"{day_id} activities sum to {total_act_mins} min, expected exactly 480"
            )

            # Check each activity has status available, valid assistance_policy and prerequisites
            for act in activities:
                self.assertEqual(act.get("status"), "available", f"Activity {act.get('id')} status must be available")
                self.assertIn(
                    act.get("assistance_policy"),
                    ["independent", "agent_assisted"],
                    f"Activity {act.get('id')} has invalid assistance policy"
                )

    def test_manifest_marks_days_available(self):
        """Manifest lessons for days 31-33 must be marked available."""
        self.assertTrue(MANIFEST_FILE.exists(), "Manifest file missing")
        manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        lessons = {lesson["id"]: lesson for lesson in manifest.get("lessons", [])}

        for d in TARGET_DAYS:
            les_id = f"les-{d:02d}"
            self.assertIn(les_id, lessons, f"Lesson {les_id} missing from manifest")
            self.assertEqual(
                lessons[les_id].get("status"),
                "available",
                f"Lesson {les_id} status must be 'available'"
            )

    def test_localized_content_exists_for_four_languages(self):
        """All four language editions must exist and define complete activity content."""
        for d in TARGET_DAYS:
            day_id = f"day-{d:02d}"
            day_meta_file = DAYS_DIR / f"{day_id}.json"
            day_meta = json.loads(day_meta_file.read_text(encoding="utf-8"))
            expected_activity_ids = [act["id"] for act in day_meta.get("activities", [])]

            day_content_dir = CONTENT_DIR / day_id
            self.assertTrue(day_content_dir.is_dir(), f"Content dir missing for {day_id}")

            for lang in SUPPORTED_LANGS:
                lang_file = day_content_dir / f"{lang}.json"
                self.assertTrue(lang_file.exists(), f"Missing {lang}.json for {day_id}")

                content = json.loads(lang_file.read_text(encoding="utf-8"))
                self.assertEqual(content.get("language"), lang)
                self.assertTrue(content.get("day_title"), f"Missing day_title in {day_id}/{lang}.json")

                # Verify each activity is localized
                activities = content.get("activities", {})
                for act_id in expected_activity_ids:
                    self.assertIn(act_id, activities, f"Activity {act_id} missing in {day_id}/{lang}.json")
                    act_data = activities[act_id]
                    self.assertTrue(act_data.get("title"), f"Empty title in {act_id} ({lang})")
                    self.assertTrue(act_data.get("objective"), f"Empty objective in {act_id} ({lang})")
                    self.assertTrue(act_data.get("instructions"), f"Empty instructions in {act_id} ({lang})")
                    self.assertTrue(act_data.get("exercise_prompt"), f"Empty exercise_prompt in {act_id} ({lang})")
                    self.assertTrue(act_data.get("hint"), f"Empty hint in {act_id} ({lang})")
                    self.assertTrue(act_data.get("answer"), f"Empty answer in {act_id} ({lang})")
                    self.assertTrue(act_data.get("mastery_criterion"), f"Empty mastery_criterion in {act_id} ({lang})")

    def test_language_editions_have_equivalent_structure_and_review_record(self):
        """Every edition preserves the same activities, quiz shape, and reviewable fields."""
        review_record = CURRICULUM_DIR / "reviews" / "autograd-days-31-33.md"
        self.assertTrue(review_record.exists(), "Substantive review record missing")
        self.assertIn("Lesson 31", review_record.read_text(encoding="utf-8"))
        self.assertIn("Four-language translation review findings", review_record.read_text(encoding="utf-8"))

        required_fields = {
            "title",
            "objective",
            "instructions",
            "exercise_prompt",
            "hint",
            "answer",
            "mastery_criterion",
        }
        for d in TARGET_DAYS:
            day_id = f"day-{d:02d}"
            editions = {
                lang: json.loads(
                    (CONTENT_DIR / day_id / f"{lang}.json").read_text(encoding="utf-8")
                )
                for lang in SUPPORTED_LANGS
            }
            english = editions["en"]
            for lang, edition in editions.items():
                self.assertEqual(set(edition["activities"]), set(english["activities"]), lang)
                self.assertEqual(edition["language"], lang)
                for activity_id in english["activities"]:
                    activity = edition["activities"][activity_id]
                    self.assertTrue(required_fields <= set(activity), f"{day_id}/{lang}/{activity_id}")

                # The published day must retain a runnable CLI seam in every
                # edition, while localized activity instructions may place the
                # shared command in the most relevant activity rather than
                # repeating it in every card.
                edition_instructions = "\n".join(
                    activity["instructions"] for activity in edition["activities"].values()
                )
                self.assertIn("projects/autograd/cli.py", edition_instructions)

            for activity_id in english["activities"]:
                english_quiz = english["activities"][activity_id].get("quiz")
                for lang, edition in editions.items():
                    localized_quiz = edition["activities"][activity_id].get("quiz")
                    if english_quiz is None:
                        self.assertIsNone(localized_quiz, f"Unexpected quiz in {day_id}/{lang}/{activity_id}")
                    else:
                        self.assertEqual(
                            [q["id"] for q in localized_quiz["questions"]],
                            [q["id"] for q in english_quiz["questions"]],
                            f"Quiz questions drifted in {day_id}/{lang}/{activity_id}",
                        )
                        self.assertEqual(
                            [sorted(q["options"]) for q in localized_quiz["questions"]],
                            [sorted(q["options"]) for q in english_quiz["questions"]],
                            f"Quiz options drifted in {day_id}/{lang}/{activity_id}",
                        )

    def test_repeated_backward_requires_explicit_zeroing(self):
        """The documented accumulation policy is observable through a clean process."""
        script = (
            "import json; "
            "from projects.autograd.engine import Value; "
            "x=Value(3.0); y=x*x; y.backward(); first=x.grad; "
            "y.backward(); second=x.grad; y.zero_grad(); cleared=x.grad; "
            "print(json.dumps({'first': first, 'second': second, 'cleared': cleared}))"
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        observed = json.loads(result.stdout)
        self.assertAlmostEqual(observed["first"], 6.0)
        self.assertAlmostEqual(observed["second"], 12.0)
        self.assertAlmostEqual(observed["cleared"], 0.0)

    def test_cli_integration_commands(self):
        """Verify the autograd CLI commands that the study days link to execute cleanly."""
        cli_path = REPO_ROOT / "projects" / "autograd" / "cli.py"
        self.assertTrue(cli_path.exists(), "projects/autograd/cli.py must exist")

        commands = [
            # Day 31: forward and backward on neuron graph
            [sys.executable, str(cli_path), "forward-backward", "--preset", "neuron", "--json"],
            # Day 32: shared-node branch and gradcheck
            [sys.executable, str(cli_path), "forward-backward", "--preset", "shared-node", "--json"],
            [sys.executable, str(cli_path), "gradcheck", "--preset", "complex", "--json"],
            [sys.executable, str(cli_path), "gradcheck", "--preset", "relu-kink", "--json"],
            # Day 33: diagnose overwrite bug & multi-output
            [sys.executable, str(cli_path), "diagnose", "--bug-type", "overwrite-accumulation", "--json"],
            [sys.executable, str(cli_path), "forward-backward", "--preset", "multi-output", "--json"],
        ]

        for cmd in commands:
            res = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"Command failed: {' '.join(cmd)}\nstderr: {res.stderr}")
            data = json.loads(res.stdout)
            self.assertIn("status", data)


if __name__ == "__main__":
    unittest.main()

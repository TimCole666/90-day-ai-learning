"""D4.11: Day 90 must cite the LoRA smoke artifact the current code produces.

The committed artifacts in projects/lora/artifacts are evidence that Day 90
labels verified-local. They must be in the current emitter's format, and every
edition must quote the same numbers the artifact records.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "projects" / "lora" / "artifacts"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
STALE_V1_NUMBERS = ("3.7242", "3.7099", "41.44", "40.85", "0.0143")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class LoraArtifactCitationTests(unittest.TestCase):
    def setUp(self):
        self.eval = load(ARTIFACTS / "eval_results.json")
        self.run = load(ARTIFACTS / "run_artifact.json")

    def test_artifacts_use_current_smoke_format(self):
        self.assertEqual(self.eval["format"], "learning-project-lora-eval-v2")
        self.assertEqual(self.run["format"], "learning-project-lora-smoke-v2")
        self.assertIs(self.eval["smoke"], True)
        self.assertIs(self.eval["downloads_performed"], False)
        self.assertIs(self.eval["merge_verified"], True)
        self.assertIs(self.run["adapter_round_trip_verified"], True)

    def test_artifacts_hold_no_machine_specific_paths(self):
        for name in ("eval_results.json", "run_artifact.json"):
            text = (ARTIFACTS / name).read_text(encoding="utf-8")
            self.assertNotIn("/home/", text, name)
            self.assertNotIn("/tmp/", text, name)

    def test_day90_editions_quote_the_artifact(self):
        e = self.eval
        expected = {
            "loss": f"{e['loss_before']:.4f}→{e['loss_after']:.4f}",
            "perplexity": f"{e['perplexity_before']:.2f}→{e['perplexity_after']:.2f}",
            "loss_delta": f"loss_delta {e['loss_delta']:.4f}",
        }
        for locale in LOCALES:
            acts = load(ROOT / "curriculum" / "content" / "day-90" / f"{locale}.json")["activities"]
            act01 = acts["day-90-act-01"]["instructions"]
            act02 = acts["day-90-act-02"]["answer"]
            with self.subTest(locale=locale):
                self.assertIn(expected["loss"], act01)
                self.assertIn(expected["perplexity"], act01)
                self.assertIn(expected["loss_delta"], act02)
                for stale in STALE_V1_NUMBERS:
                    self.assertNotIn(stale, act01 + act02)

    def test_no_day90_field_cites_stale_numbers_or_broken_commands(self):
        # Scan every string in each Day 90 edition, not only the cited fields.
        for locale in LOCALES:
            text = (ROOT / "curriculum" / "content" / "day-90" / f"{locale}.json").read_text(encoding="utf-8")
            with self.subTest(locale=locale):
                for stale in STALE_V1_NUMBERS:
                    self.assertNotIn(stale, text)
                # The script-path form fails with a relative-import error;
                # the package must be run as a module.
                self.assertNotRegex(text, r"python3? projects/agent_learning/cli\.py")

    def test_reviews_do_not_cite_stale_numbers(self):
        for name in ("study-days-88-90.md", "candidate-regression.md"):
            text = (ROOT / "curriculum" / "reviews" / name).read_text(encoding="utf-8")
            for stale in STALE_V1_NUMBERS:
                self.assertNotIn(stale, text, f"{name}: {stale}")


if __name__ == "__main__":
    unittest.main()

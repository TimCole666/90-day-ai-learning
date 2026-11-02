"""Day 64/72 compared candidates must cite real arXiv papers (verified 2026-11-01)."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = ["curriculum/days/day-64.json", "curriculum/days/day-72.json", "curriculum/sources/registry.json"]
EXPECTED = {
    "https://arxiv.org/abs/2405.09673": "Biderman et al. LoRA Learns Less and Forgets Less",
    "https://arxiv.org/abs/2309.10313": "Zhai et al. Investigating the Catastrophic Forgetting in Multimodal Large Language Models",
}


def candidates(obj):
    if isinstance(obj, dict):
        if "candidate_name" in obj:
            yield obj
        for value in obj.values():
            yield from candidates(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from candidates(value)


class Day64Day72CandidateTest(unittest.TestCase):
    def test_misattributed_ids_are_gone(self):
        for name in FILES:
            text = (ROOT / name).read_text(encoding="utf-8")
            self.assertNotIn("2205.10123", text, name)
            self.assertNotIn("2310.15647", text, name)

    def test_replacements_match_arxiv_titles_and_license(self):
        seen = {}
        for name in FILES:
            for cand in candidates(json.loads((ROOT / name).read_text(encoding="utf-8"))):
                if cand.get("url") in EXPECTED:
                    self.assertEqual(cand["candidate_name"], EXPECTED[cand["url"]], name)
                    self.assertEqual(cand["license"], "CC BY 4.0", name)
                    seen[cand["url"]] = seen.get(cand["url"], 0) + 1
        self.assertEqual(seen, {url: 2 for url in EXPECTED})


if __name__ == "__main__":
    unittest.main()

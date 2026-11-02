"""arXiv-linked sources must name the right paper and the license arXiv shows.

Verified 2026-10-31 against each https://arxiv.org/abs/<id> page (license link
and citation metadata); evidence is recorded in the arxiv-license receipt.
- These papers are CC licensed on arXiv, not under arXiv's non-exclusive
  distribution license: listed in CC_LICENSED below.
- 1810.03993 (Model Cards) and 1803.09010 (Datasheets) are linked on arXiv
  under the non-exclusive license; "ACM Digital Library" is not a license.
- 2410.03859 is "SWE-bench Multimodal"; Multi-SWE-bench is 2504.02605 (CC BY 4.0).
- Four entries carried a title that is not the paper's title.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARXIV = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})")
CC_LICENSED = {
    "1802.05968": "CC BY-NC-SA 4.0",
    "2310.18018": "CC BY-SA 4.0",
    **{a: "CC BY 4.0" for a in (
        "2012.13255", "2201.11903", "2202.03629", "2210.03629", "2211.09110",
        "2303.11366", "2305.14314", "2308.03688", "2308.08747", "2310.06770",
        "2404.05427", "2405.15793", "2406.12045", "2407.16741", "2504.02605")},
}
NON_EXCLUSIVE = {"1810.03993", "1803.09010"}
TITLES = {
    "2212.08061": "On Second Thought, Let's Not Think Step by Step! Bias and Toxicity in Zero-Shot Reasoning",
    "2403.07718": "WorkArena: How Capable Are Web Agents at Solving Common Knowledge Work Tasks?",
    "2305.17144": "Ghost in the Minecraft: Generally Capable Agents for Open-World Environments via Large Language Models with Text-based Knowledge and Memory",
    "2310.18018": "NLP Evaluation in trouble: On the Need to Measure LLM Data Contamination for each Benchmark",
}


def licensed_objects():
    def walk(node, path):
        if isinstance(node, dict):
            if "license" in node:
                links = [node.get(k) for k in ("url", "original_url") if isinstance(node.get(k), str)]
                ids = {m.group(1) for v in links for m in ARXIV.finditer(v)}
                for arxiv_id in ids:
                    yield path, arxiv_id, node
            for value in node.values():
                yield from walk(value, path)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value, path)

    for path in sorted((ROOT / "curriculum").rglob("*.json")):
        yield from walk(json.loads(path.read_text(encoding="utf-8")), path.relative_to(ROOT))


class ArxivSourceIdentityTests(unittest.TestCase):
    def test_license_matches_arxiv_page(self):
        seen = set()
        for path, arxiv_id, node in licensed_objects():
            license_name = node["license"]
            with self.subTest(file=str(path), arxiv=arxiv_id):
                if arxiv_id in CC_LICENSED:
                    seen.add(arxiv_id)
                    self.assertIn(CC_LICENSED[arxiv_id], license_name)
                    self.assertNotIn("non-exclusive", license_name.lower())
                    if "share-alike" in CC_LICENSED[arxiv_id].lower() or "-SA" in CC_LICENSED[arxiv_id]:
                        if "license_restrictions" in node:
                            self.assertIn("share-alike", node["license_restrictions"])
                elif arxiv_id in NON_EXCLUSIVE and "permission_basis" in node:
                    seen.add(arxiv_id)
                    self.assertIn("non-exclusive", license_name.lower())
                    self.assertNotIn("ACM", license_name)
        self.assertEqual(seen, set(CC_LICENSED) | NON_EXCLUSIVE)

    def test_multi_swe_bench_points_at_its_own_paper(self):
        count = 0
        for path, arxiv_id, node in licensed_objects():
            if node.get("candidate_name", "").startswith("Multi-SWE-bench"):
                count += 1
                with self.subTest(file=str(path)):
                    self.assertEqual(node["url"], "https://arxiv.org/abs/2504.02605")
        self.assertGreaterEqual(count, 7)

    def test_titles_match_arxiv(self):
        seen = set()
        for path, arxiv_id, node in licensed_objects():
            if arxiv_id in TITLES:
                seen.add(arxiv_id)
                with self.subTest(file=str(path), arxiv=arxiv_id):
                    self.assertIn(TITLES[arxiv_id], node.get("title") or node["candidate_name"])
        self.assertEqual(seen, set(TITLES))


if __name__ == "__main__":
    unittest.main()

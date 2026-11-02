"""The scored source-comparison matrix (curriculum/sources/comparison-matrix.json).

The matrix records attributed internal scoring of public candidates per topic
block. Internal acceptance and independent review are separate states: an expert
is not a prerequisite, and no expert certification may be fabricated. Structural
tests preserve evidence and disclosure; they do not establish teaching quality.
"""

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "curriculum" / "sources" / "comparison-matrix.json"
REGISTRY_PATH = ROOT / "curriculum" / "sources" / "registry.json"
RENDERED_PATH = ROOT / "curriculum" / "reviews" / "source-quality-matrix.md"
RENDERER = ROOT / "scripts" / "render_source_matrix.py"

CRITERIA = ["pedagogical_quality", "coverage", "clarity", "exercises", "currency",
            "accessibility", "relevance"]
ASSESSED_BY = ("Claude (author assessment, not independent); "
               "ChatGPT (internal re-assessment, not independent)")
APPROVAL_KEYS = re.compile(r"approv|sign.?off|reviewer|reviewed_by|accepted_by|certif", re.I)
PROMOTIONAL = re.compile(
    r"\b(authoritative\w*|canonical|definitive\w*|seminal|landmark|renowned|superb|"
    r"outstanding|excellent|industry[- ]standard|de facto|gold[- ]standard|"
    r"best[- ]in[- ]class|world[- ]class|objectively best|the best)\b", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def keys(node):
    if isinstance(node, dict):
        for k, v in node.items():
            yield k
            yield from keys(v)
    elif isinstance(node, list):
        for v in node:
            yield from keys(v)


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def cited_ids(first, last):
    ids = set()
    for n in range(first, last + 1):
        day = load(ROOT / "curriculum" / "days" / f"day-{n:02d}.json")
        for act in day["activities"]:
            ids |= {c["id"] for c in act.get("source_resources", [])}
    return ids


class SourceQualityMatrixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matrix = load(MATRIX_PATH)
        cls.registry = {s["id"] for s in load(REGISTRY_PATH)["sources"]}

    def test_internal_acceptance_does_not_fabricate_independent_review(self):
        self.assertEqual(self.matrix["assessed_by"], ASSESSED_BY)
        self.assertEqual(self.matrix["independent_review"]["status"], "not_performed")
        self.assertIn("not a prerequisite", self.matrix["independent_review"]["note"])
        internal = self.matrix["internal_review"]
        self.assertIn(internal["status"], {"in_progress", "passed", "needs_work"})
        self.assertEqual(internal["evidence"], "curriculum/reviews/source-selection-review.md")
        self.assertEqual(self.matrix["criteria"], CRITERIA)
        self.assertIn("licensing", self.matrix["licensing_policy"].lower())

    def test_no_approval_or_reviewer_is_recorded(self):
        found = [k for k in keys(self.matrix) if APPROVAL_KEYS.search(k)]
        self.assertEqual(found, [])
        self.assertEqual(set(self.matrix["independent_review"]), {"status", "note"})

    def test_blocks_cover_all_ninety_days_once(self):
        blocks = self.matrix["blocks"]
        self.assertGreaterEqual(len(blocks), 10)
        self.assertLessEqual(len(blocks), 14)
        expected = 1
        for block in blocks:
            with self.subTest(block=block["id"]):
                self.assertEqual(block["days"][0], expected)
                self.assertGreaterEqual(block["days"][1], block["days"][0])
                expected = block["days"][1] + 1
        self.assertEqual(expected, 91)

    def test_each_block_scores_at_least_three_candidates_on_every_criterion(self):
        for block in self.matrix["blocks"]:
            cands = block["candidates"]
            with self.subTest(block=block["id"]):
                self.assertGreaterEqual(len(cands), 3)
                self.assertEqual(len({c["url"] for c in cands}), len(cands))
            for cand in cands:
                where = f"{block['id']}/{cand['name']}"
                with self.subTest(candidate=where):
                    # http is allowed only where the publisher offers no https and says so.
                    self.assertTrue(cand["url"].startswith("https://")
                                    or "http only" in cand["licensing_note"])
                    self.assertEqual(list(cand["scores"]), CRITERIA)
                    for crit, entry in cand["scores"].items():
                        self.assertIn(entry["score"], range(1, 6), f"{where} {crit}")
                        self.assertGreaterEqual(len(entry["evidence"]), 8, f"{where} {crit}")
                    # Licensing is recorded beside the scores, never as a score.
                    self.assertNotIn("licensing", cand["scores"])
                    self.assertTrue(cand["license"].strip())
                    self.assertGreaterEqual(len(cand["licensing_note"]), 8)

    def test_selected_sources_exist_are_scored_and_are_cited_in_the_block(self):
        for block in self.matrix["blocks"]:
            scored = {rid for c in block["candidates"] for rid in c.get("registry_ids", [])}
            cited = cited_ids(*block["days"])
            with self.subTest(block=block["id"]):
                self.assertTrue(block["selected"])
                self.assertGreater(len(block["selection_rationale"]), 60)
            for sid in block["selected"] + block.get("supporting_sources", []):
                with self.subTest(block=block["id"], source=sid):
                    self.assertIn(sid, self.registry)
                    self.assertIn(sid, cited, "selected source is not cited in the block's days")
            for sid in block["selected"]:
                with self.subTest(block=block["id"], selected=sid):
                    self.assertIn(sid, scored, "a selected source must be one of the scored candidates")

    def test_matrix_text_makes_no_promotional_or_final_quality_claim(self):
        hits = [s for s in strings(self.matrix) if PROMOTIONAL.search(s)]
        self.assertEqual(hits, [])

    def test_rendered_review_matches_the_matrix(self):
        out = subprocess.run([sys.executable, str(RENDERER), "--check"], cwd=ROOT,
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        text = RENDERED_PATH.read_text(encoding="utf-8")
        self.assertIn("Strict source-quality requirement: **partially satisfied; expert review pending.**", text)
        self.assertIn("not_performed", text)
        self.assertIn("Internal review limitations", text)
        self.assertIn(ASSESSED_BY, text)


if __name__ == "__main__":
    unittest.main()

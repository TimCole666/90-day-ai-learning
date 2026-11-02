"""Source-fidelity spot checks (curriculum/reviews/source-fidelity-spot-checks.md).

One course claim per topic block of the comparison matrix is checked against the
cited source text. The checks are the course author's own reading, not an expert
review, so the page must say that and must not record any approval. Locator
errors found by a check must also be fixed in the data.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC_PATH = ROOT / "curriculum" / "reviews" / "source-fidelity-spot-checks.md"
MATRIX_PATH = ROOT / "curriculum" / "sources" / "comparison-matrix.json"
DAYS = ROOT / "curriculum" / "days"

VERDICTS = {"agrees", "partly agrees", "disagrees"}
FIELDS = ["Course claim", "Source locator", "Source text checked", "Verdict", "Notes"]
LANGS = ["en", "ja", "zh-Hans", "zh-Hant"]
CONTENT = ROOT / "curriculum" / "content"
FIX_REVISION = "2026.11.01-rev4"
APPROVAL = re.compile(r"\b(approved|signed off|certified|validated by|reviewed by)\b", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sections(text):
    """Map '## <block id>: ...' headings to their bodies."""
    parts = re.split(r"^## (b\d\d-[a-z0-9-]+):[^\n]*\n", text, flags=re.M)
    return dict(zip(parts[1::2], parts[2::2]))


def field(body, name):
    m = re.search(rf"^- \*\*{re.escape(name)}:\*\* (.+)$", body, flags=re.M)
    return m.group(1).strip() if m else None


def cards(source_id):
    for path in sorted(DAYS.glob("day-*.json")):
        for act in load(path)["activities"]:
            for card in act.get("source_resources", []):
                if card["id"] == source_id:
                    yield act["id"], card


class SourceFidelitySpotChecksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.sections = sections(cls.text)
        cls.blocks = [b["id"] for b in load(MATRIX_PATH)["blocks"]]

    def test_page_discloses_internal_scope_without_requiring_expert_review(self):
        head = self.text.split("\n## ", 1)[0]
        self.assertIn("internal", head.lower())
        self.assertIn("not independent", head)
        self.assertIn("not an acceptance prerequisite", head)
        self.assertEqual(APPROVAL.findall(self.text), [])

    def test_one_section_per_matrix_block_in_order(self):
        self.assertEqual(list(self.sections), self.blocks)

    def test_every_check_records_claim_locator_text_and_a_fixed_verdict(self):
        for block, body in self.sections.items():
            for name in FIELDS:
                with self.subTest(block=block, field=name):
                    value = field(body, name)
                    self.assertIsNotNone(value)
                    if name != "Verdict":  # checked against VERDICTS below
                        self.assertGreaterEqual(len(value), 8)
            with self.subTest(block=block, check="verdict"):
                self.assertIn(field(body, "Verdict"), VERDICTS)
            with self.subTest(block=block, check="claim cites an activity"):
                self.assertRegex(field(body, "Course claim"), r"day-\d\d-act-\d\d")
            if field(body, "Verdict") != "agrees":
                with self.subTest(block=block, check="non-agreeing check is resolved"):
                    self.assertIsNotNone(field(body, "Resolution"))

    def test_openstax_chain_rule_locator_names_the_box_that_exists(self):
        # The 3.6 page labels the general rule "Rule: The Chain Rule"; its only
        # numbered theorem is 3.10 (trigonometric functions). "Theorem 3.8" is not there.
        for act, card in cards("openstax-calculus-1"):
            with self.subTest(activity=act):
                self.assertNotIn("Theorem 3.8", card.get("relevant_timestamp") or "")

    def test_taubench_locator_includes_the_section_that_defines_pass_k(self):
        # pass^k is defined in Section 3; Sections 4.2 and 5 only use it.
        found = list(cards("yao-taubench-2024"))
        self.assertTrue(found)
        for act, card in found:
            with self.subTest(activity=act):
                self.assertIn("Section 3", card.get("relevant_timestamp") or "")



def activity(day, act_id, lang):
    return load(CONTENT / f"day-{day:02d}" / f"{lang}.json")["activities"][act_id]


def ledger_activity(day, act_id):
    return next(a for a in load(DAYS / f"day-{day:02d}.json")["activities"] if a["id"] == act_id)


class FidelityCorrectionsTest(unittest.TestCase):
    """Regression checks for the two claims the spot checks found unsupported."""

    def test_day46_no_longer_claims_llms_exclusively_use_pre_ln(self):
        # Old wording per edition: "exclusively", "もっぱら", "一致选用", "一致選用".
        banned = re.compile(r"exclusively|もっぱら|一致选用|一致選用|all modern")
        for lang in LANGS:
            act = activity(46, "day-46-act-03", lang)
            text = " ".join(v for v in act.values() if isinstance(v, str))
            with self.subTest(lang=lang):
                self.assertIsNone(banned.search(text))
                for name in ("GPT-2", "Llama 2", "Xiong"):
                    self.assertIn(name, act["objective"] + act["instructions"])

    def test_day46_cites_the_sources_for_its_claims(self):
        act = ledger_activity(46, "day-46-act-03")
        ids = {c["id"] for c in act["source_resources"]}
        self.assertTrue({"vaswani-attention-2017", "xiong-pre-ln-2020", "radford-gpt2-2019",
                         "touvron-llama2-2023"} <= ids)
        self.assertEqual(act["content_revision"], FIX_REVISION)

    def test_day64_initialization_follows_the_paper_and_the_taught_code(self):
        for lang in LANGS:
            text = activity(64, "day-64-act-02", lang)["instructions"]
            with self.subTest(lang=lang):
                self.assertNotIn("N(0, 1/r)", text)
                # Paper: unspecified random Gaussian for A, zero for B (Section 4.1).
                self.assertIn("4.1", text)
                # Taught code (act-04) and PEFT default: kaiming_uniform_(a=sqrt(5)).
                self.assertIn("kaiming_uniform_", text)
                self.assertIn("init_lora_weights", text)
                self.assertIn("1/r", text)
        self.assertEqual(ledger_activity(64, "day-64-act-02")["content_revision"], FIX_REVISION)

    def test_day64_learning_objective_distinguishes_paper_from_implementation(self):
        # The paper uses Gaussian A, but the implementation taught here uses
        # Kaiming uniform. Objectives must not teach Gaussian as the only choice.
        for lang in LANGS:
            objective = activity(64, "day-64-act-02", lang)["objective"]
            with self.subTest(lang=lang):
                self.assertIn("Kaiming", objective)
                self.assertIn("LoRA", objective)
                self.assertIn("B", objective)


if __name__ == "__main__":
    unittest.main()

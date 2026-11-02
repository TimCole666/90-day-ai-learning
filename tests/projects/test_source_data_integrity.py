"""Source data integrity across the registry, ledger cards and content-file cards.

The registry (curriculum/sources/registry.json) is the single record of a source's
identity and rights. Ledger cards (curriculum/days/day-NN.json) and content-file
cards (curriculum/content/day-NN/<lang>.json) carry inline copies that may tailor
activity-specific fields (relevant_timestamp, locator_url, selection_rationale, ...),
but the identity and rights fields must agree with the registry everywhere.
"""

import json
import re
import unittest
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "curriculum" / "sources" / "registry.json"
DAY_PATHS = sorted((ROOT / "curriculum" / "days").glob("day-*.json"))
CONTENT_PATHS = sorted((ROOT / "curriculum" / "content").glob("day-*/*.json"))

IDENTITY = ("title", "author", "original_url", "license", "license_restrictions", "reuse_category")
# Translated editions may localize the human-readable title and author only.
LOCALIZABLE = {"title", "author"}
TRANSLATED_LANGS = {"ja", "zh-Hans", "zh-Hant"}
# Course content links to sources or explains them in its own words; nothing is
# reproduced, quoted or translated from a source.
PROVENANCE = {"linking", "original_explanation"}
LOCATOR_STATUSES = {"whole_source_reference", "pending_verification"}

# Promotional or unverifiable quality claims. The course may say what a source
# covers and why it was chosen, not that it is the best or the authority.
PROMOTIONAL = re.compile(
    r"\b(authoritative\w*|canonical|definitive\w*|seminal|landmark|renowned|superb|"
    r"outstanding|excellent|industry[- ]standard|de facto|gold[- ]standard|"
    r"state[- ]of[- ]the[- ]art|classic|best[- ]in[- ]class|world[- ]class|"
    r"unparalleled|unmatched|unrivaled|peerless|premier|foremost|top[- ]tier|"
    r"best on the internet|globally recognized)\b",
    re.I,
)
CLAIM_FIELDS = ("selection_rationale", "comparison_rationale", "permission_basis",
                "known_availability_limitations", "safe_fallback", "prerequisites",
                "relevant_timestamp", "status")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def ledger_cards():
    for path in DAY_PATHS:
        for act in load(path)["activities"]:
            for card in act.get("source_resources", []):
                yield f"{path.stem}/{act['id']}", card


def content_cards():
    for path in CONTENT_PATHS:
        lang = path.stem
        for act_id, act in load(path).get("activities", {}).items():
            if isinstance(act, dict):
                for card in act.get("source_resources") or []:
                    yield lang, f"{path.parent.name}/{lang}/{act_id}", card


def bare_url(url):
    parts = urlsplit(url)
    return f"{parts.netloc.lower()}{parts.path.rstrip('/')}"


class SourceDataIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = load(REGISTRY_PATH)
        cls.registry = {s["id"]: s for s in cls.doc["sources"]}

    def test_no_two_registry_entries_share_a_url(self):
        by_url = defaultdict(list)
        for s in self.doc["sources"]:
            by_url[bare_url(s["original_url"])].append(s["id"])
        self.assertEqual({u: ids for u, ids in by_url.items() if len(ids) > 1}, {})

    def test_merged_ids_point_to_live_entries_and_are_no_longer_cited(self):
        merged = self.doc.get("merged_ids", {})
        self.assertTrue(merged, "registry must record which duplicate ids were merged")
        cited = {c["id"] for _, c in ledger_cards()} | {c["id"] for _, _, c in content_cards()}
        for old, new in merged.items():
            with self.subTest(old=old):
                self.assertNotIn(old, self.registry)
                self.assertIn(new, self.registry)
                self.assertNotIn(old, cited)

    def test_ledger_cards_match_registry_identity(self):
        for where, card in ledger_cards():
            for key in IDENTITY:
                with self.subTest(where=where, source=card["id"], field=key):
                    self.assertEqual(card.get(key), self.registry[card["id"]].get(key))

    def test_content_cards_match_registry_identity(self):
        for lang, where, card in content_cards():
            self.assertIn(card["id"], self.registry, where)
            for key in IDENTITY:
                if lang in TRANSLATED_LANGS and key in LOCALIZABLE:
                    continue
                with self.subTest(where=where, source=card["id"], field=key):
                    self.assertEqual(card.get(key), self.registry[card["id"]].get(key))

    def test_localized_titles_keep_the_original_name_visible(self):
        # A localized author must still show the registry author so attribution is traceable.
        for lang, where, card in content_cards():
            if lang in TRANSLATED_LANGS and card.get("author") != self.registry[card["id"]]["author"]:
                with self.subTest(where=where):
                    self.assertIn(self.registry[card["id"]]["author"], card["author"])

    def test_source_claim_fields_contain_no_promotional_superlatives(self):
        def claims(card):
            for key in CLAIM_FIELDS:
                if isinstance(card.get(key), str):
                    yield key, card[key]
            for cand in card.get("compared_candidates", []):
                for key in CLAIM_FIELDS:
                    if isinstance(cand.get(key), str):
                        yield f"candidate.{key}", cand[key]

        everything = [("registry", s) for s in self.doc["sources"]]
        everything += list(ledger_cards()) + [(w, c) for _, w, c in content_cards()]
        hits = [(where, card["id"], key, m.group(0))
                for where, card in everything
                for key, text in claims(card)
                for m in [PROMOTIONAL.search(text)] if m]
        self.assertEqual(hits, [])

    def test_selection_process_does_not_overclaim_uniform_scoring(self):
        text = json.dumps(self.doc["selection_process"])
        self.assertNotIn("Every candidate is evaluated against the same rubric", text)
        self.assertIn("comparison-matrix.json", text)

    def test_every_registry_entry_is_cited_or_its_disuse_is_justified(self):
        cited = {c["id"] for _, c in ledger_cards()}
        unused = {u["id"]: u for u in self.doc.get("unused_entries", [])}
        for sid in self.registry:
            if sid not in cited:
                with self.subTest(source=sid):
                    self.assertIn(sid, unused, "uncited registry entry needs a justification")
                    self.assertGreater(len(unused[sid].get("justification", "")), 40)
        for sid in unused:
            with self.subTest(listed=sid):
                self.assertIn(sid, self.registry)
                self.assertNotIn(sid, cited, "a cited entry must not be listed as unused")

    def test_cited_sources_are_linked_or_explained_never_reproduced(self):
        for where, card in ledger_cards():
            with self.subTest(where=where, source=card["id"]):
                self.assertIn(card["reuse_category"], PROVENANCE)
        for s in self.doc["sources"]:
            with self.subTest(source=s["id"]):
                self.assertIn(s["reuse_category"], PROVENANCE)

    def test_every_ledger_card_has_a_locator_or_an_explicit_status(self):
        for where, card in ledger_cards():
            with self.subTest(where=where, source=card["id"]):
                has_locator = bool((card.get("relevant_timestamp") or "").strip())
                self.assertTrue(has_locator or card.get("locator_status") in LOCATOR_STATUSES,
                                "add a verified locator or an explicit locator_status")
                if has_locator:
                    self.assertNotIn("locator_status", card)

    def test_locator_urls_deep_link_into_the_registered_source(self):
        cards = list(ledger_cards()) + [(w, c) for _, w, c in content_cards()]
        for where, card in cards:
            url = card.get("locator_url")
            if url is None:
                continue
            with self.subTest(where=where, source=card["id"]):
                self.assertTrue(url.startswith("https://"))
                self.assertEqual(urlsplit(url).netloc, urlsplit(card["original_url"]).netloc)
                self.assertNotEqual(url, card["original_url"])
                self.assertTrue((card.get("relevant_timestamp") or "").strip(),
                                "a locator_url needs the human-readable section text")


if __name__ == "__main__":
    unittest.main()

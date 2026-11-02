"""D4.7: every source id cited on a Study Day must have a registry entry.

Day cards may tailor activity-specific fields (relevant_timestamp, selection_rationale,
safe_fallback, ...), but the identity and rights fields must agree with the registry.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "curriculum" / "sources" / "registry.json"
DAYS = sorted((ROOT / "curriculum" / "days").glob("day-*.json"))
REQUIRED = {"id", "title", "author", "original_url", "license", "license_restrictions",
            "reuse_category", "source_type", "permission_basis",
            "known_availability_limitations", "selection_rationale", "safe_fallback"}
# The seven ids found missing in the stop review; their rights fields must match.
ADDED = {"py-docs-builtins-ticket26", "git-scm-book-diffs", "py-tutorial-control-flow",
         "text-tools-project", "py-docs-numeric-ops", "griewank-walther-autodiff",
         "pytorch-gradcheck-docs"}
RIGHTS = ("title", "author", "original_url", "license", "license_restrictions", "reuse_category")


class RegistryCoversDaySourcesTest(unittest.TestCase):
    def setUp(self):
        self.registry = {s["id"]: s for s in json.loads(REGISTRY.read_text(encoding="utf-8"))["sources"]}

    def _day_cards(self):
        for path in DAYS:
            for act in json.loads(path.read_text(encoding="utf-8"))["activities"]:
                for card in act.get("source_resources", []):
                    yield act["id"], card

    def test_every_day_source_id_is_registered(self):
        missing = sorted({card["id"] for _, card in self._day_cards()} - set(self.registry))
        self.assertEqual(missing, [])

    def test_added_entries_are_complete_and_match_day_rights(self):
        for sid in ADDED:
            self.assertIn(sid, self.registry)
            entry = self.registry[sid]
            self.assertEqual(REQUIRED - {k for k, v in entry.items() if v not in (None, "")}, set(), sid)
        for act_id, card in self._day_cards():
            if card["id"] in ADDED:
                for key in RIGHTS:
                    with self.subTest(activity=act_id, source=card["id"], field=key):
                        self.assertEqual(card.get(key), self.registry[card["id"]].get(key))

    def test_registry_ids_are_unique(self):
        ids = [s["id"] for s in json.loads(REGISTRY.read_text(encoding="utf-8"))["sources"]]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()

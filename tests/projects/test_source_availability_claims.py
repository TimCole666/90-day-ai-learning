"""Source cards must state availability limits and must not claim third-party code is vendored.

projects/autograd/ is an original engine; it contains no micrograd code, so a card
calling it a "local clone" of micrograd misstates provenance.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "curriculum" / "sources" / "registry.json"


def cards(node):
    if isinstance(node, dict):
        if "original_url" in node and "id" in node:
            yield node
        for value in node.values():
            yield from cards(value)
    elif isinstance(node, list):
        for value in node:
            yield from cards(value)


class SourceAvailabilityClaimTests(unittest.TestCase):
    def test_every_registry_source_states_availability_limits(self):
        sources = json.loads(REGISTRY.read_text(encoding="utf-8"))["sources"]
        missing = [s["id"] for s in sources if not s.get("known_availability_limitations")]
        self.assertEqual(missing, [])

    def test_no_card_claims_a_local_clone_of_micrograd(self):
        files = [REGISTRY, *sorted((ROOT / "curriculum" / "days").glob("day-*.json"))]
        for path in files:
            for card in cards(json.loads(path.read_text(encoding="utf-8"))):
                if card["id"] != "karpathy-micrograd":
                    continue
                with self.subTest(file=path.name):
                    self.assertNotIn("clone", card.get("known_availability_limitations", "").lower())


if __name__ == "__main__":
    unittest.main()

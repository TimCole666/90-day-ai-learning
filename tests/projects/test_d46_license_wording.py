"""D4.6: license and rationale wording must match what the sources actually show.

Evidence: /tmp/learn-session-20261031-resume/blocked-source-research/receipt.json
and the stop-review owner items for these sources.
"""

import glob
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
FILES = sorted(glob.glob(str(ROOT / "curriculum/days/*.json"))) + [
    str(ROOT / "curriculum/sources/registry.json")
]

CANONICAL_URLS = {
    "anthropic-tool-use-docs": "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview",
    "openai-function-calling-guide": "https://developers.openai.com/api/docs/guides/function-calling",
}

# Wording that the sources do not support.
UNSUPPORTED_LICENSES = {
    "anthropic-tool-use-docs": "Open Documentation License",
    "openai-function-calling-guide": "Open Documentation License",
    "temporal-durable-execution": "MIT (Temporal)",
    "efron-bootstrap-1979": "Open Access",
    "broder-minhash-1997": "Open Access",
    "nist-sematech-ehandbook": "Public Domain",
}


def _dicts(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _dicts(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _dicts(v)


def _all_dicts():
    for path in FILES:
        with open(path, encoding="utf-8") as fh:
            for d in _dicts(json.load(fh)):
                yield pathlib.Path(path).name, d


class D46LicenseWordingTest(unittest.TestCase):
    def test_source_licenses_are_supported(self):
        seen = set()
        for name, d in _all_dicts():
            sid = d.get("id")
            if sid in UNSUPPORTED_LICENSES:
                seen.add(sid)
                self.assertNotIn(UNSUPPORTED_LICENSES[sid], d["license"], f"{name}:{sid}")
                self.assertNotIn("Freely available on Project Euclid", d.get("known_availability_limitations", ""), f"{name}:{sid}")
                self.assertNotIn("public domain", d.get("permission_basis", "").lower(), f"{name}:{sid}")
        self.assertEqual(seen, set(UNSUPPORTED_LICENSES))

    def test_vendor_docs_use_canonical_urls(self):
        for name, d in _all_dicts():
            sid = d.get("id")
            if sid in CANONICAL_URLS:
                self.assertEqual(d["original_url"], CANONICAL_URLS[sid], f"{name}:{sid}")

    def test_copies_of_each_source_match_registry(self):
        with open(FILES[-1], encoding="utf-8") as fh:
            registry = {s["id"]: s for s in json.load(fh)["sources"]}
        for name, d in _all_dicts():
            sid = d.get("id")
            if sid in UNSUPPORTED_LICENSES and "license" in d:
                for key in ("license", "license_restrictions", "original_url",
                            "known_availability_limitations", "permission_basis"):
                    self.assertEqual(d.get(key), registry[sid].get(key), f"{name}:{sid}:{key}")

    def test_candidate_wording(self):
        counts = {"pashler": 0, "spdx": 0, "shaikh": 0, "gitm": 0, "nist": 0}
        for name, d in _all_dicts():
            cand = d.get("candidate_name", "")
            url = d.get("url", "")
            if cand.startswith("Pashler et al."):
                counts["pashler"] += 1
                self.assertIn("SAGE", d["license"], name)
            elif cand == "SPDX License List":
                counts["spdx"] += 1
                self.assertNotEqual(d["license"], "CC-BY-3.0", name)
            elif url == "https://arxiv.org/abs/2212.08061":
                counts["shaikh"] += 1
                self.assertNotIn("ethical dilemmas", d["comparison_rationale"], name)
                self.assertIn("toxic", d["comparison_rationale"], name)
            elif url == "https://arxiv.org/abs/2305.17144":
                counts["gitm"] += 1
                self.assertNotIn("reinforcement agent", d["comparison_rationale"], name)
                self.assertIn("LLM", d["comparison_rationale"], name)
            elif cand.startswith("NIST/SEMATECH"):
                counts["nist"] += 1
                self.assertNotIn("Public Domain", d["license"], name)
        for key, n in counts.items():
            self.assertGreater(n, 0, key)


if __name__ == "__main__":
    unittest.main()

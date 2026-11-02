"""GitHub-hosted sources must carry the license their repository declares.

Verified 2026-10-31 against the GitHub REST API (repos/<owner>/<repo> and
repos/<owner>/<repo>/license) and raw.githubusercontent.com; evidence is
recorded in the github-license-sweep receipt:
- huggingface/lighteval: LICENSE is the MIT License.
- NVIDIA/Megatron-LM: LICENSE is a BSD 3-clause grant ("Applied BSD" is not a
  license name).
- meta-llama/llama: LICENSE is the Llama 2 Community License Agreement.
- Significant-Gravitas/AutoGPT: MIT outside autogpt_platform/, Polyform Shield
  License inside it.
- openai/gpt-2: LICENSE is titled "Modified MIT License".
- openai/openai-python: chatml.md no longer exists on main (404) and main is
  Apache-2.0; the file survives at tag v0.28.1, where the repo was MIT.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = {
    "https://github.com/huggingface/lighteval": "MIT",
    "https://github.com/NVIDIA/Megatron-LM": "BSD-3-Clause",
    "https://github.com/meta-llama/llama": "Llama 2 Community License",
    "https://github.com/openai/gpt-2": "Modified MIT License",
}
AUTOGPT = "https://github.com/Significant-Gravitas/AutoGPT"
CHATML_ID = "openai-chatml-format"
CHATML_URL = "https://github.com/openai/openai-python/blob/v0.28.1/chatml.md"


def objects(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from objects(value)
    elif isinstance(node, list):
        for value in node:
            yield from objects(value)


def curriculum():
    for path in sorted((ROOT / "curriculum").rglob("*.json")):
        for node in objects(json.loads(path.read_text(encoding="utf-8"))):
            yield path.relative_to(ROOT), node


class GitHubSourceLicenseTests(unittest.TestCase):
    def test_compared_candidates_match_repository_license(self):
        seen = {url: 0 for url in [*CANDIDATES, AUTOGPT]}
        for path, node in curriculum():
            url = node.get("url")
            if "candidate_name" not in node or url not in seen:
                continue
            seen[url] += 1
            with self.subTest(file=str(path), url=url):
                if url == AUTOGPT:
                    self.assertIn("MIT", node["license"])
                    self.assertIn("Polyform Shield", node["license"])
                else:
                    self.assertEqual(node["license"], CANDIDATES[url])
        for url, count in seen.items():
            self.assertGreater(count, 0, url)

    def test_chatml_card_points_at_a_live_mit_revision(self):
        count = 0
        for path, node in curriculum():
            if node.get("id") != CHATML_ID or "license" not in node:
                continue
            count += 1
            with self.subTest(file=str(path)):
                self.assertEqual(node["original_url"], CHATML_URL)
                self.assertEqual(node["license"], "MIT")
                self.assertIn("v0.28.1", node["version_or_verification_date"])
                self.assertIn("main", node["known_availability_limitations"])
        self.assertGreaterEqual(count, 3)


if __name__ == "__main__":
    unittest.main()

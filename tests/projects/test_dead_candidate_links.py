"""Compared candidates must not point at the three dead doc URLs (verified 2026-11-01)."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEAD = [
    "docs.vllm.ai/en/latest/models/chat_templates.html",
    "nemotoolkit/nlp/nemo_megatron.html",
    "platform.openai.com/docs/assistants/tools",
]
# url -> (candidate_name, license, number of copies across day files + registry)
EXPECTED = {
    "https://docs.vllm.ai/en/latest/serving/online_serving/#chat-template": (
        "vLLM Online Serving: Chat Template", "Apache 2.0", 4),
    "https://docs.nvidia.com/nemo/megatron-bridge/latest/apidocs/bridge/bridge.data.collators.sft.html": (
        "NVIDIA NeMo Megatron Bridge SFT Collator", "Apache 2.0", 3),
    "https://developers.openai.com/api/docs/guides/tools": (
        "OpenAI Responses API Built-in Tools", "Proprietary Documentation", 4),
}
FILES = [
    "curriculum/days/day-61.json",
    "curriculum/days/day-62.json",
    "curriculum/days/day-74.json",
    "curriculum/days/day-75.json",
    "curriculum/sources/registry.json",
]


def candidates(obj):
    if isinstance(obj, dict):
        if "candidate_name" in obj:
            yield obj
        for value in obj.values():
            yield from candidates(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from candidates(value)


class DeadCandidateLinkTest(unittest.TestCase):
    def test_dead_urls_are_gone_everywhere(self):
        for path in (ROOT / "curriculum").rglob("*.json"):
            text = path.read_text(encoding="utf-8")
            for dead in DEAD:
                self.assertNotIn(dead, text, str(path))

    def test_replacements_have_expected_name_license_and_copies(self):
        seen = {}
        for name in FILES:
            for cand in candidates(json.loads((ROOT / name).read_text(encoding="utf-8"))):
                if cand.get("url") in EXPECTED:
                    want_name, want_license, _ = EXPECTED[cand["url"]]
                    self.assertEqual(cand["candidate_name"], want_name, name)
                    self.assertEqual(cand["license"], want_license, name)
                    self.assertEqual(cand["status"], "compared_alternative", name)
                    seen[cand["url"]] = seen.get(cand["url"], 0) + 1
        self.assertEqual(seen, {url: count for url, (_, _, count) in EXPECTED.items()})


if __name__ == "__main__":
    unittest.main()

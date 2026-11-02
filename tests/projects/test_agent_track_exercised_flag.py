"""An Agent Tool Track that is not verified must not claim it was exercised.

/api/tracks serves curriculum/agent-tracks/registry.json as-is, so a stale
"unexercised": false on a pending track tells learners a live run happened.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "curriculum" / "agent-tracks" / "registry.json"


class AgentTrackExercisedFlagTests(unittest.TestCase):
    def test_unverified_tracks_are_marked_unexercised(self):
        tracks = json.loads(REGISTRY.read_text(encoding="utf-8"))["tracks"]
        self.assertEqual(len(tracks), 4)
        for track in tracks:
            with self.subTest(track=track["id"]):
                self.assertIsInstance(track["unexercised"], bool)
                if track["verification_state"] != "verified":
                    self.assertTrue(track["unexercised"])


if __name__ == "__main__":
    unittest.main()

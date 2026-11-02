"""Day 68 act-01 must point at a training command that exists and writes the
telemetry the activity tells the learner to check.
"""

import json
import re
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"


def act01(locale: str) -> dict:
    path = ROOT / "curriculum" / "content" / "day-68" / f"{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))["activities"]["day-68-act-01"]


def training_command(answer: str) -> list[str]:
    # The tmux payload: everything inside the single quotes, before the tee pipe.
    match = re.search(r"tmux new-session -d -s lora_train '([^']+)'", answer)
    assert match, answer
    return shlex.split(match.group(1).split("2>&1")[0])


class Day68TelemetryTests(unittest.TestCase):
    def test_every_locale_uses_the_same_existing_command(self):
        commands = {locale: training_command(act01(locale)["answer"]) for locale in LOCALES}
        self.assertEqual(len({tuple(c) for c in commands.values()}), 1, commands)
        command = commands["en"]
        self.assertTrue((ROOT / command[1]).is_file(), command)
        for locale in LOCALES:
            text = json.dumps(act01(locale), ensure_ascii=False)
            self.assertNotIn("train_lora.py", text, locale)
            self.assertIn("telemetry.jsonl", act01(locale)["answer"], locale)

    @unittest.skipUnless(VENV_PYTHON.exists(), "needs the project .venv with torch")
    def test_command_writes_the_fields_the_hint_names(self):
        command = training_command(act01("en")["answer"])
        with tempfile.TemporaryDirectory() as tmp:
            work_dir = Path(tmp) / "run"
            args = command[1:]
            args[args.index("--work-dir") + 1] = str(work_dir)
            args[args.index("--max-iters") + 1] = "3"
            result = subprocess.run([str(VENV_PYTHON), *args], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = [json.loads(line) for line in (work_dir / "telemetry.jsonl").read_text().splitlines()]
        self.assertEqual([row["step"] for row in rows], [1, 2, 3])
        for field in ("step", "train_loss", "lr"):  # named in the en hint
            self.assertIn(field, act01("en")["hint"])
            self.assertTrue(all(field in row for row in rows), field)


if __name__ == "__main__":
    unittest.main()

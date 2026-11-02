"""Day 12 content repairs: execute every embedded snippet in all four locales.

Covers audit findings D10-12-02..06: the missing-file fixture lives inside its own
TemporaryDirectory (decoy-cwd safe), unittest.main() vs discovery is described
correctly, act-01 demonstrates assertRaises, every activity ships a complete
runnable reference, ja/zh labels are localized with the assisted/independent
boundary intact, and act-03 treats the exception class as a clue, not a verdict.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-12"
DESCRIPTOR = ROOT / "curriculum" / "days" / "day-12.json"
LANGS = ("en", "ja", "zh-Hans", "zh-Hant")
A1, A2, A3, A4 = (f"day-12-act-0{i}" for i in range(1, 5))
FILE_RE = re.compile(r"^# file: (\S+)\n(.*?)\n# end file$", re.M | re.S)
TIME_RE = re.compile(r"in \d+\.\d+s")


def load(lang):
    return json.loads((CONTENT / f"{lang}.json").read_text(encoding="utf-8"))


def files_in(text):
    return [(name, code + "\n") for name, code in FILE_RE.findall(text)]


def one_file(text, name, index=0):
    matches = [code for n, code in files_in(text) if n == name]
    if len(matches) <= index:
        raise AssertionError(f"{name} block #{index} not found")
    return matches[index]


def interpreters():
    found = [sys.executable]
    other = shutil.which("python3")
    if other and os.path.realpath(other) != os.path.realpath(sys.executable):
        found.append(other)
    return found


def clean_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["NO_COLOR"] = "1"
    return env


def run(argv, cwd):
    proc = subprocess.run(argv, cwd=cwd, env=clean_env(), capture_output=True,
                          text=True, encoding="utf-8", timeout=60)
    return proc.returncode, proc.stdout + proc.stderr


def norm(text):
    return TIME_RE.sub("in Ts", text).rstrip("\n")


def write_files(directory, pairs):
    for name, code in pairs:
        (Path(directory) / name).write_text(code, encoding="utf-8")


class Day12ContentRepairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = {lang: load(lang) for lang in LANGS}
        cls.descriptor = json.loads(DESCRIPTOR.read_text(encoding="utf-8"))

    def act(self, lang, act_id):
        return self.content[lang]["activities"][act_id]

    def assertTranscript(self, text, command, output, msg):
        """The text must show `$ command` immediately followed by the real output."""
        self.assertIn(norm(f"$ {command}\n{output}"), norm(text), msg)

    def tmp(self):
        d = tempfile.mkdtemp(prefix="day12-")
        self.addCleanup(shutil.rmtree, d, True)
        return d

    # ---------- structure / invariants ----------
    def test_structure_and_policy_boundary_unchanged(self):
        en = self.content["en"]
        policies = {a["id"]: a["assistance_policy"] for a in self.descriptor["activities"]}
        self.assertEqual(policies, {A1: "agent_assisted", A2: "agent_assisted",
                                    A3: "agent_assisted", A4: "independent"})
        for lang in LANGS:
            data = self.content[lang]
            self.assertEqual(list(data), list(en), lang)
            self.assertEqual(list(data["common"]), list(en["common"]), lang)
            self.assertEqual(list(data["activities"]), [A1, A2, A3, A4], lang)
            for act_id in data["activities"]:
                self.assertEqual(list(data["activities"][act_id]),
                                 list(en["activities"][act_id]), f"{lang}/{act_id}")

    def test_localized_prerequisites_and_policy_labels(self):
        en = self.content["en"]
        cjk = re.compile(r"[぀-ヿ一-鿿]")
        for lang in ("ja", "zh-Hans", "zh-Hant"):
            for act_id in (A1, A2, A3, A4):
                act, en_act = self.act(lang, act_id), en["activities"][act_id]
                for field in ("prerequisites", "assistance_policy_label"):
                    self.assertNotEqual(act[field], en_act[field], f"{lang}/{act_id}/{field}")
                    self.assertRegex(act[field], cjk, f"{lang}/{act_id}/{field}")
                label = act["assistance_policy_label"]
                if act_id == A4:
                    self.assertRegex(label, r"独立|獨立", label)
                    self.assertIn("AI", label)
                else:
                    self.assertRegex(label, r"支援|协助|協助", label)
                    self.assertNotRegex(label, r"独立|獨立|閉卷|闭卷", label)
        self.assertIn("no AI", en["activities"][A4]["assistance_policy_label"])

    # ---------- code parity ----------
    def test_code_and_transcripts_identical_across_locales(self):
        for act_id in (A1, A2, A3, A4):
            for field in ("exercise_prompt", "answer"):
                en_text = self.act("en", act_id)[field]
                en_files = files_in(en_text)
                en_cmds = [l for l in en_text.splitlines() if l.startswith("$ ")]
                for lang in LANGS[1:]:
                    text = self.act(lang, act_id)[field]
                    self.assertEqual(files_in(text), en_files, f"{lang}/{act_id}/{field}")
                    self.assertEqual([l for l in text.splitlines() if l.startswith("$ ")],
                                     en_cmds, f"{lang}/{act_id}/{field}")
        for act_id in (A1, A2, A3, A4):
            self.assertTrue(files_in(self.act("en", act_id)["answer"]), f"{act_id} answer has no code")

    # ---------- act-01 (D10-12-03, D10-12-04) ----------
    def test_act01_reference_runs_with_assert_raises(self):
        for lang in LANGS:
            act = self.act(lang, A1)
            self.assertIn("assertRaises", act["exercise_prompt"], lang)
            self.assertIn("Ran 4 tests", act["mastery_criterion"], lang)
            files = files_in(act["answer"])
            self.assertEqual([n for n, _ in files], ["counter.py", "test_counter.py"], lang)
            self.assertIn("assertRaises(TypeError)", dict(files)["test_counter.py"])
            for py in interpreters():
                with self.subTest(lang=lang, py=py):
                    d = self.tmp()
                    write_files(d, files)
                    code, out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 0, out)
                    self.assertIn("Ran 4 tests", out)
                    self.assertTranscript(act["answer"], "python -m unittest -v", out, lang)
                    for line in out.splitlines():
                        if line.endswith("... ok"):
                            self.assertIn(line, act["exercise_prompt"], lang)
                    # unittest.main() runs only this file, not sibling test_*.py modules.
                    write_files(d, [("test_sibling.py", "import unittest\n\n\nclass S(unittest.TestCase):\n"
                                     "    def test_sibling(self):\n        pass\n")])
                    code, out = run([py, "test_counter.py", "-v"], d)
                    self.assertEqual(code, 0, out)
                    self.assertNotIn("test_sibling", out)
                    self.assertTranscript(act["answer"], "python test_counter.py -v", out, lang)
                    code, out = run([py, "-m", "unittest", "discover", "-v"], d)
                    self.assertIn("Ran 5 tests", out)

    def test_act01_instructions_do_not_claim_main_discovers(self):
        en = self.act("en", A1)["instructions"]
        self.assertNotIn("unittest.main() inside the file, or python -m unittest", en)
        self.assertIn("unittest.main() does not discover sibling test_*.py modules", en)
        for lang, marker in (("ja", "発見しない"), ("zh-Hans", "不会发现"), ("zh-Hant", "不會發現")):
            self.assertIn(marker, self.act(lang, A1)["instructions"], lang)

    # ---------- act-02 (D10-12-02, D10-12-04) ----------
    def test_act02_suite_is_isolated_from_decoy_cwd(self):
        for lang in LANGS:
            act = self.act(lang, A2)
            tests = one_file(act["exercise_prompt"], "test_scores.py")
            self.assertNotIn('summarize_scores("does-not-exist.txt")', tests)
            self.assertIn('Path(d) / "does-not-exist.txt"', tests)
            scores = one_file(act["answer"], "scores.py")
            for py in interpreters():
                with self.subTest(lang=lang, py=py):
                    d = self.tmp()
                    write_files(d, [("scores.py", scores), ("test_scores.py", tests)])
                    code, out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 0, out)
                    self.assertTranscript(act["answer"], "python -m unittest -v", out, lang)
                    # Decoy in the suite directory, exactly as the answer shows.
                    self.assertIn('$ echo "ana,1" > does-not-exist.txt', act["answer"])
                    (Path(d) / "does-not-exist.txt").write_text("ana,1\n", encoding="utf-8")
                    code, decoy_out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 0, decoy_out)
                    self.assertEqual(norm(decoy_out), norm(out))
                    # Decoy in an unrelated cwd: discovery started from elsewhere.
                    other = self.tmp()
                    (Path(other) / "does-not-exist.txt").write_text("ana,1\n", encoding="utf-8")
                    code, far_out = run([py, "-m", "unittest", "discover", "-s", d, "-t", d, "-v"], other)
                    self.assertEqual(code, 0, far_out)
                    self.assertIn("Ran 3 tests", far_out)

    # ---------- act-03 (D10-12-06, D10-12-04) ----------
    def test_act03_buggy_fails_and_fix_passes(self):
        for lang in LANGS:
            act = self.act(lang, A3)
            buggy = one_file(act["exercise_prompt"], "total.py")
            tests = one_file(act["exercise_prompt"], "test_total.py")
            fixed = one_file(act["answer"], "total.py")
            diff = [(a, b) for a, b in zip(buggy.splitlines(), fixed.splitlines()) if a != b]
            self.assertEqual(len(buggy.splitlines()), len(fixed.splitlines()))
            self.assertEqual(diff, [("        lines = f.readlines()[1:]", "        lines = f.readlines()")])
            for py in interpreters():
                with self.subTest(lang=lang, py=py):
                    d = self.tmp()
                    (Path(d) / "does-not-exist.txt").write_text("decoy\n", encoding="utf-8")
                    write_files(d, [("total.py", buggy), ("test_total.py", tests)])
                    code, out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 1, out)
                    excerpt = act["answer"].split("$ python -m unittest -v\n", 1)[1]
                    excerpt = excerpt.split("FAILED (failures=1)", 1)[0] + "FAILED (failures=1)"
                    pos = 0
                    actual = norm(out)
                    for line in norm(excerpt).splitlines():
                        if line.strip() in ("", "..."):
                            continue
                        found = actual.find(line, pos)
                        self.assertNotEqual(found, -1, f"{lang}: {line!r} not in order in\n{out}")
                        pos = found + len(line)
                    write_files(d, [("total.py", fixed)])
                    code, out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 0, out)
                    self.assertTranscript(act["answer"], "python -m unittest -v", out, lang)

    def test_act03_exception_class_is_a_clue_not_a_verdict(self):
        en = self.act("en", A3)["instructions"]
        self.assertNotIn("Rule out the environment only", en)
        self.assertIn("a clue, not a verdict", en)
        self.assertIn("never rules the environment out", en)
        markers = {"ja": ("手がかり", "除外することは決してできない"),
                   "zh-Hans": ("线索", "永远不能排除环境"),
                   "zh-Hant": ("線索", "永遠不能排除環境")}
        for lang, needles in markers.items():
            text = self.act(lang, A3)["instructions"]
            for needle in needles:
                self.assertIn(needle, text, lang)
            self.assertNotIn("ときだけ環境を先に疑う", text)
            self.assertNotIn("时才先怀疑环境", text)
            self.assertNotIn("時才先懷疑環境", text)

    # ---------- act-04 (D10-12-04) ----------
    def test_act04_capstone_reference_is_complete_and_repeatable(self):
        a2_tests = one_file(self.act("en", A2)["exercise_prompt"], "test_scores.py")
        for lang in LANGS:
            act = self.act(lang, A4)
            files = files_in(act["answer"])
            self.assertEqual([n for n, _ in files], ["scores.py", "test_scores.py", "requirements.txt"], lang)
            self.assertEqual(dict(files)["test_scores.py"], a2_tests)
            self.assertIn(one_file(self.act(lang, A2)["answer"], "scores.py").rstrip("\n"),
                          dict(files)["scores.py"])
            cli_cmds = [l[2:] for l in act["answer"].splitlines()
                        if l.startswith("$ ") and l != "$ python -m unittest -v"]
            self.assertEqual(len(cli_cmds), 5, cli_cmds)
            for py in interpreters():
                with self.subTest(lang=lang, py=py):
                    d = self.tmp()
                    write_files(d, files)
                    self.assertEqual(sorted(os.listdir(d)), ["requirements.txt", "scores.py", "test_scores.py"])
                    code, out = run([py, "-m", "unittest", "-v"], d)
                    self.assertEqual(code, 0, out)
                    self.assertTranscript(act["answer"], "python -m unittest -v", out, lang)
                    bindir = self.tmp()
                    os.symlink(py, Path(bindir) / "python")
                    transcript = []
                    for cmd in cli_cmds:
                        env = clean_env()
                        env["PATH"] = bindir + os.pathsep + env.get("PATH", "")
                        proc = subprocess.run(["bash", "-c", "{ " + cmd + "; } 2>&1"], cwd=d, env=env,
                                              capture_output=True, text=True, timeout=60)
                        transcript.append(f"$ {cmd}\n{proc.stdout}")
                    self.assertIn("".join(transcript).rstrip("\n"), act["answer"], lang)
                    proc = subprocess.run([py, "scores.py"], cwd=d, env=clean_env(),
                                          capture_output=True, text=True, timeout=60)
                    self.assertEqual(proc.returncode, 2)
                    self.assertNotIn("Traceback", proc.stderr)


if __name__ == "__main__":
    unittest.main()

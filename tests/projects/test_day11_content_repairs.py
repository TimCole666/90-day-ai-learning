"""Day 11 content repairs: executable references, controlled venv fixtures, locale parity.

Every fenced code block in the Day 11 content is extracted from the four locale
editions, executed in fresh temporary directories, and compared with the output
the content claims. ``python3`` inside shell snippets is pinned to a shim that
execs a concrete interpreter, so each scenario runs once per available
interpreter (the test runner's own Python and, if different, the ``python3`` on
PATH). Stdlib only; no network; no third-party packages.
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
CONTENT = ROOT / "curriculum" / "content" / "day-11"
DESCRIPTOR = ROOT / "curriculum" / "days" / "day-11.json"
LANGS = ["en", "ja", "zh-Hans", "zh-Hant"]
FENCE = re.compile(r"```([a-z0-9_-]*)\n(.*?)\n```", re.S)
SETUP_PREFIX = 'work=$(mktemp -d) &&\ncd "$work" &&\n'
MNF = "ModuleNotFoundError: No module named 'day11_helper'"


def load(lang):
    return json.loads((CONTENT / f"{lang}.json").read_text(encoding="utf-8"))


def blocks(text, kind=None):
    found = FENCE.findall(text)
    return [code for lang, code in found if kind is None or lang == kind]


def interpreters():
    # Keep un-resolved paths so a venv interpreter still honors its pyvenv.cfg.
    result = [sys.executable]
    other = shutil.which("python3")
    if other and os.path.realpath(other) != os.path.realpath(sys.executable):
        result.append(other)
    return result


class Sandbox:
    """A fresh work directory plus a PATH whose python3 is a chosen interpreter."""

    def __init__(self, interpreter):
        self.interpreter = interpreter
        self._root = tempfile.mkdtemp(prefix="day11-")
        self.work = os.path.realpath(os.path.join(self._root, "work"))
        os.mkdir(self.work)
        self.scripts = os.path.join(self._root, "scripts")
        os.mkdir(self.scripts)
        shim_dir = os.path.join(self._root, "shim")
        os.mkdir(shim_dir)
        shim = os.path.join(shim_dir, "python3")
        with open(shim, "w", encoding="utf-8") as fh:
            fh.write(f'#!/bin/sh\nexec "{interpreter}" "$@"\n')
        os.chmod(shim, 0o755)
        self.env = {
            "PATH": f"{shim_dir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": self._root,
            "LANG": "C.UTF-8",
            "work": self.work,
            "PYTHONDONTWRITEBYTECODE": "1",
        }

    def close(self):
        shutil.rmtree(self._root, ignore_errors=True)

    def bash(self, code):
        if code.startswith(SETUP_PREFIX):
            code = code[len(SETUP_PREFIX):]
        return subprocess.run(["bash", "-c", code], cwd=self.work, env=self.env,
                              capture_output=True, text=True, timeout=120)

    def python(self, code, name="snippet.py"):
        path = os.path.join(self.scripts, name)
        Path(path).write_text(code + "\n", encoding="utf-8")
        return subprocess.run([self.interpreter, path], cwd=self.work, env=self.env,
                              capture_output=True, text=True, timeout=60)


def last_line(text):
    lines = [line for line in text.strip().splitlines() if line.strip()]
    return lines[-1] if lines else ""


class StructureAndLocaleTests(unittest.TestCase):
    def setUp(self):
        self.data = {lang: load(lang) for lang in LANGS}
        self.descriptor = json.loads(DESCRIPTOR.read_text(encoding="utf-8"))

    def test_activity_keys_and_field_sets_match_across_locales(self):
        en = self.data["en"]
        for lang in LANGS:
            content = self.data[lang]
            self.assertEqual(list(content), list(en))
            self.assertEqual(list(content["common"]), list(en["common"]))
            self.assertEqual(list(content["activities"]), [a["id"] for a in self.descriptor["activities"]])
            for act_id, act in content["activities"].items():
                self.assertEqual(list(act), list(en["activities"][act_id]), f"{lang}/{act_id}")

    def test_code_blocks_identical_across_locales(self):
        en = self.data["en"]["activities"]
        for lang in LANGS[1:]:
            for act_id, act in self.data[lang]["activities"].items():
                for field, value in act.items():
                    self.assertEqual(FENCE.findall(value), FENCE.findall(en[act_id][field]),
                                     f"{lang}/{act_id}/{field} code blocks differ from en")

    def test_code_blocks_render_safely(self):
        # server.cjs splits paragraphs on blank lines and applies inline-code/bold
        # regexes afterwards, so fenced code must avoid blank lines, backticks and '**'.
        for lang in LANGS:
            for act_id, act in self.data[lang]["activities"].items():
                for field, value in act.items():
                    for code in blocks(value):
                        self.assertNotIn("\n\n", code, f"{lang}/{act_id}/{field}")
                        self.assertNotIn("`", code)
                        self.assertNotIn("**", code)

    def test_answers_do_not_repeat_prompts(self):
        for lang in LANGS:
            for act_id, act in self.data[lang]["activities"].items():
                self.assertNotEqual(act["answer"].strip(), act["exercise_prompt"].strip(), f"{lang}/{act_id}")
                self.assertTrue(blocks(act["answer"], "text"), f"{lang}/{act_id} answer lacks observed output")

    def test_localized_labels_are_not_english_and_keep_policy_boundary(self):
        policy = {a["id"]: a["assistance_policy"] for a in self.descriptor["activities"]}
        self.assertEqual(policy["day-11-act-04"], "independent")
        en = self.data["en"]["activities"]
        for act_id, act in en.items():
            if policy[act_id] == "independent":
                self.assertRegex(act["assistance_policy_label"], r"Independent.*no AI assistance")
            else:
                self.assertRegex(act["assistance_policy_label"], r"^Assistance allowed")
        cjk = re.compile(r"[぀-ヿ一-鿿]")
        for lang in LANGS[1:]:
            for act_id, act in self.data[lang]["activities"].items():
                for field in ("prerequisites", "assistance_policy_label"):
                    value = act[field]
                    self.assertNotEqual(value, en[act_id][field], f"{lang}/{act_id}/{field} is English")
                    self.assertRegex(value, cjk, f"{lang}/{act_id}/{field}")
                    self.assertNotRegex(value, r"[A-Za-z]{4,}", f"{lang}/{act_id}/{field} has English prose")
                label = act["assistance_policy_label"]
                if policy[act_id] == "independent":
                    self.assertRegex(label, r"独立|獨立")
                    self.assertRegex(label, r"AI\s*(支援|辅助|輔助)\s*(なし)|(无|無)\s*AI")
                else:
                    self.assertRegex(label, r"支援|辅助|輔助")
                    self.assertNotRegex(label, r"独立|獨立|闭卷|閉卷|AI 支援なし|无 AI|無 AI")

    def test_environment_tasks_use_controlled_fixtures(self):
        for lang in LANGS:
            acts = self.data[lang]["activities"]
            for act_id in ("day-11-act-03", "day-11-act-04"):
                text = json.dumps(acts[act_id], ensure_ascii=False)
                self.assertIn("mktemp -d", text)
                self.assertIn("--without-pip", text)
                self.assertNotIn("import packaging", text)
                self.assertNotIn("No module named 'packaging'", text)
                self.assertNotIn("pip list", text)
                self.assertNotIn("pip show", text)

    def test_act01_answer_contains_with_rewrite(self):
        for lang in LANGS:
            answer = self.data[lang]["activities"]["day-11-act-01"]["answer"]
            code = "\n".join(blocks(answer, "python"))
            self.assertIn('with open(path, encoding="utf-8") as f:', code)
            self.assertNotIn("f.close()", code)


class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.acts = load("en")["activities"]

    def each_interpreter(self, scenario):
        for interp in interpreters():
            with self.subTest(interpreter=interp):
                box = Sandbox(interp)
                try:
                    scenario(box)
                finally:
                    box.close()

    def test_act01_try_clauses_with_rewrite_and_bare_except(self):
        act = self.acts["day-11-act-01"]
        (try_code,) = blocks(act["exercise_prompt"], "python")
        self.assertIn("printf 'hi\\n' > notes.txt", act["exercise_prompt"])
        with_code, bare_code = blocks(act["answer"], "python")
        out_absent, out_present, with_present, with_absent, bare_out = blocks(act["answer"], "text")

        def scenario(box):
            r = box.python(try_code, "try_version.py")
            self.assertEqual((r.returncode, r.stdout), (0, out_absent + "\n"), r.stderr)
            r = box.python(with_code, "with_version.py")
            self.assertEqual((r.returncode, r.stdout), (0, with_absent + "\n"), r.stderr)
            self.assertEqual(box.bash("printf 'hi\\n' > notes.txt").returncode, 0)
            r = box.python(try_code, "try_version.py")
            self.assertEqual((r.returncode, r.stdout), (0, out_present + "\n"), r.stderr)
            r = box.python(with_code, "with_version.py")
            self.assertEqual((r.returncode, r.stdout), (0, with_present + "\n"), r.stderr)
            r = box.python(bare_code, "bare.py")
            self.assertEqual((r.returncode, r.stdout, r.stderr), (0, bare_out + "\n", ""))

        self.each_interpreter(scenario)

    def test_act02_traceback_fix_and_hierarchy(self):
        act = self.acts["day-11-act-02"]
        (setup,) = blocks(act["exercise_prompt"], "bash")
        (crash,) = blocks(act["exercise_prompt"], "python")
        fixed, mro = blocks(act["answer"], "python")
        crash_last, fixed_out, mro_out = blocks(act["answer"], "text")

        def scenario(box):
            self.assertEqual(box.bash(setup).returncode, 0)
            self.assertEqual(Path(box.work, "scores.csv").read_text(), "ana,7\nbo,x9\ncy,5\n")
            Path(box.work, "clinic.py").write_text(crash + "\n", encoding="utf-8")
            r = box.bash("python3 clinic.py")
            self.assertEqual(r.returncode, 1)
            self.assertEqual(last_line(r.stderr), crash_last)
            self.assertIn('clinic.py", line 5', r.stderr)
            self.assertIn("total += int(raw)", r.stderr)
            Path(box.work, "clinic.py").write_text(fixed + "\n", encoding="utf-8")
            r = box.bash("python3 clinic.py")
            self.assertEqual((r.returncode, r.stdout), (0, fixed_out + "\n"), r.stderr)
            r = box.python(mro, "mro.py")
            self.assertEqual((r.returncode, r.stdout), (0, mro_out + "\n"), r.stderr)

        self.each_interpreter(scenario)

    def test_act03_controlled_venv_drill(self):
        act = self.acts["day-11-act-03"]
        (setup,) = blocks(act["instructions"], "bash")
        self.assertTrue(setup.startswith(SETUP_PREFIX))
        exe, import_venv, install, import_sys, isolation, pip, req = blocks(act["exercise_prompt"], "bash")
        mnf1, install_out, mnf2, isolation_out, req_out = blocks(act["answer"], "text")
        self.assertEqual((mnf1, mnf2), (MNF, MNF))
        hint_cmd = re.search(r"`(\.venv/bin/python -c \"import importlib\.util;[^`]*)`", act["hint"]).group(1)

        def scenario(box):
            r = box.bash(setup)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = box.bash(exe)
            self.assertEqual(r.returncode, 0, r.stderr)
            first, second = r.stdout.splitlines()
            self.assertEqual(second, f"{box.work}/.venv/bin/python")
            self.assertFalse(first.startswith(box.work))
            self.assertNotEqual(first, second)
            r = box.bash(import_venv)
            self.assertEqual((r.returncode, last_line(r.stderr)), (1, MNF))
            r = box.bash(hint_cmd)
            self.assertEqual((r.returncode, r.stdout), (0, "None\n"), r.stderr)
            r = box.bash(install)
            self.assertEqual((r.returncode, r.stdout), (0, install_out + "\n"), r.stderr)
            r = box.bash(import_sys)
            self.assertEqual((r.returncode, last_line(r.stderr)), (1, MNF))
            r = box.bash(isolation)
            self.assertEqual((r.returncode, r.stdout), (0, isolation_out + "\n"), r.stderr)
            r = box.bash(pip)
            self.assertEqual(r.returncode, 1)
            self.assertTrue(r.stderr.strip().endswith("No module named pip"), r.stderr)
            r = box.bash(req)
            self.assertEqual((r.returncode, r.stdout), (0, req_out + "\n"), r.stderr)

        self.each_interpreter(scenario)

    def test_act04_wrong_environment_fixture_and_file_task(self):
        act = self.acts["day-11-act-04"]
        (setup,) = blocks(act["instructions"], "bash")
        self.assertTrue(setup.startswith(SETUP_PREFIX))
        good, bad, evidence, fix = blocks(act["answer"], "bash")
        (read_code,) = blocks(act["answer"], "python")
        good_out, mnf, fix_out, read_out = blocks(act["answer"], "text")
        self.assertEqual(mnf, MNF)

        def scenario(box):
            r = box.bash(setup)
            self.assertEqual(r.returncode, 0, r.stderr)
            report_before = Path(box.work, "report.py").read_bytes()
            r = box.bash(good)
            self.assertEqual((r.returncode, r.stdout), (0, good_out + "\n"), r.stderr)
            r = box.bash(bad)
            self.assertEqual((r.returncode, last_line(r.stderr)), (1, MNF))
            r = box.bash(evidence)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.splitlines(),
                             [f"{box.work}/good/bin/python", "True", f"{box.work}/.venv/bin/python", "False"])
            r = box.bash(fix)
            self.assertEqual((r.returncode, r.stdout), (0, fix_out + "\n"), r.stderr)
            self.assertEqual(Path(box.work, "report.py").read_bytes(), report_before)
            r = box.python(read_code, "read_text.py")
            self.assertEqual((r.returncode, r.stdout), (0, read_out + "\n"), r.stderr)

        self.each_interpreter(scenario)


if __name__ == "__main__":
    unittest.main()

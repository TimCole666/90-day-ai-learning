import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLI_PATH = REPO_ROOT / "projects" / "text_tools" / "cli.py"
GUIDE_DIR = REPO_ROOT / "curriculum" / "projects" / "text_tools"
SUPPORTED_LANGS = ["en", "ja", "zh-Hans", "zh-Hant"]

sys.path.insert(0, str(REPO_ROOT))
from projects.text_tools.core import analyze_text, compute_splits  # noqa: E402


def run_cli(args, cwd):
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["LC_ALL"] = "C"
    return subprocess.run(
        [sys.executable, str(CLI_PATH)] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        env=env,
    )


def run_guide_command(command, tmpdir):
    """Execute a stored guide command verbatim under bash.

    TMPDIR is pinned to the invocation-owned tmpdir so the command's own
    mktemp calls stay inside the fixture; cwd is the repo root because the
    stored commands intentionally capture LEARN="$PWD" / use repo-relative
    project paths. Evidence scope: bash on this host only.
    """
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["LC_ALL"] = "C"
    env["TMPDIR"] = str(tmpdir)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return subprocess.run(
        ["bash", "-c", command],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        env=env,
    )


class TestCollisionSafety(unittest.TestCase):
    """Input/output path collisions must fail before any artifact write."""

    def test_input_equal_to_artifact_path_is_rejected_and_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            out = td / "out"
            out.mkdir()
            src = out / "train.txt"
            payload = b"one\ntwo\nthree\n"
            src.write_bytes(payload)
            res = run_cli(
                ["--input", str(src), "--split", "--output-dir", str(out)], cwd=str(td)
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("Refusing", res.stderr)
            self.assertEqual(src.read_bytes(), payload)
            self.assertFalse((out / "manifest.json").exists())

    def test_hardlink_alias_is_rejected_and_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            out = td / "out"
            out.mkdir()
            src = td / "input.txt"
            payload = b"alpha\nbeta\n"
            src.write_bytes(payload)
            os.link(src, out / "val.txt")
            res = run_cli(
                ["--input", str(src), "--split", "--output-dir", str(out)], cwd=str(td)
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("Refusing", res.stderr)
            self.assertEqual(src.read_bytes(), payload)

    def test_symlink_alias_is_rejected_and_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            out = td / "out"
            out.mkdir()
            src = td / "input.txt"
            payload = b"alpha\nbeta\n"
            src.write_bytes(payload)
            try:
                os.symlink(src, out / "test.txt")
            except OSError:
                self.skipTest("symlinks not supported on this platform")
            res = run_cli(
                ["--input", str(src), "--split", "--output-dir", str(out)], cwd=str(td)
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("Refusing", res.stderr)
            self.assertEqual(src.read_bytes(), payload)

    def test_input_inside_output_dir_with_non_artifact_name_succeeds(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            out = td / "out"
            out.mkdir()
            src = out / "corpus.txt"
            src.write_bytes(b"x\ny\nz\n")
            res = run_cli(
                ["--input", str(src), "--split", "--output-dir", str(out)], cwd=str(td)
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertTrue((out / "manifest.json").exists())


class TestOriginalByteProvenance(unittest.TestCase):
    """source_sha256 must identify the original bytes, not re-encoded text."""

    def test_crlf_source_hash_is_raw_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "crlf.txt"
            raw = b"a\r\nb\r\n"
            src.write_bytes(raw)
            out = td / "out"
            res = run_cli(
                ["--input", str(src), "--split", "--output-dir", str(out)], cwd=str(td)
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(m["source_sha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(m["source_size_bytes"], len(raw))
            normalized = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
            self.assertEqual(
                m["decoded_text_sha256"],
                hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
            )
            self.assertNotEqual(m["source_sha256"], m["decoded_text_sha256"])
            self.assertEqual(m["input_decoding"]["encoding"], "utf-8")
            self.assertEqual(m["input_decoding"]["errors"], "strict")
            self.assertIn("newline", m["input_decoding"]["newline_normalization"])

    def test_latin1_source_hash_is_raw_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "latin1.txt"
            raw = "café\n".encode("latin-1")
            src.write_bytes(raw)
            out = td / "out"
            res = run_cli(
                [
                    "--input", str(src), "--split", "--output-dir", str(out),
                    "--encoding", "latin-1",
                ],
                cwd=str(td),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(m["source_sha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(m["source_size_bytes"], len(raw))
            self.assertEqual(m["input_decoding"]["encoding"], "latin-1")

    def test_replacement_decoding_recorded(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "corrupt.txt"
            src.write_bytes(b"ok line \xff bad\n")
            out = td / "out"
            res = run_cli(
                [
                    "--input", str(src), "--split", "--output-dir", str(out),
                    "--errors", "replace",
                ],
                cwd=str(td),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(m["input_decoding"]["errors"], "replace")
            stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
            self.assertIn("\ufffd", stats["char_frequencies"])

    def test_stats_and_artifacts_describe_one_snapshot(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "in.txt"
            src.write_text("the cat sat on the mat\n", encoding="utf-8")
            out = td / "out"
            res = run_cli(
                [
                    "--input", str(src), "--stats", "--json",
                    "--split", "--output-dir", str(out),
                ],
                cwd=str(td),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            printed = json.loads(res.stdout)
            on_disk = json.loads((out / "stats.json").read_text(encoding="utf-8"))
            self.assertEqual(printed, on_disk)


class TestRatioValidation(unittest.TestCase):
    """Non-finite, negative, and out-of-range ratios are rejected; zero-weight
    partitions never absorb records."""

    def test_200k_witness_rejected(self):
        lines = ["x"] * 200000
        with self.assertRaises(ValueError):
            compute_splits(lines, 0.0, 1.000004, 0.0, seed=42)

    def test_out_of_range_and_non_finite_rejected(self):
        for ratios in [
            (1.2, 0.0, 0.0),
            (-0.1, 0.6, 0.5),
            (float("nan"), 0.5, 0.5),
            (0.5, float("inf"), 0.5),
            (0.5, -float("inf"), 0.5),
        ]:
            with self.assertRaises(ValueError, msg=f"ratios {ratios} must be rejected"):
                compute_splits(["a", "b"], *ratios, seed=1)

    def test_bad_sum_still_rejected(self):
        with self.assertRaises(ValueError):
            compute_splits(["a", "b"], 0.9, 0.2, 0.1, seed=1)

    def test_zero_weight_partition_gets_no_records(self):
        r = compute_splits(["a", "b", "c", "d", "e"], 0.5, 0.5, 0.0, seed=7)
        self.assertEqual(r["counts"]["test"], 0)
        self.assertEqual(r["counts"]["total"], 5)
        self.assertEqual(r["counts"]["train"] + r["counts"]["val"], 5)

    def test_seed7_counts_and_normalized_ratios(self):
        r = compute_splits(["a", "b", "c", "d", "e"], 0.6, 0.2, 0.2, seed=7)
        self.assertEqual(
            (r["counts"]["train"], r["counts"]["val"], r["counts"]["test"]), (3, 1, 1)
        )
        self.assertAlmostEqual(sum(r["normalized_ratios"].values()), 1.0)
        self.assertIn("normalized_ratios", r)

    def test_cli_rejects_out_of_range_ratio(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "in.txt"
            src.write_text("a\nb\n", encoding="utf-8")
            res = run_cli(
                [
                    "--input", str(src), "--split", "--output-dir", str(td / "o"),
                    "--train-ratio", "1.5", "--val-ratio", "0", "--test-ratio", "0",
                ],
                cwd=str(td),
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("range", res.stderr)
            self.assertFalse((td / "o" / "train.txt").exists())

    def test_empty_input_counts(self):
        r = compute_splits([], 0.8, 0.1, 0.1, seed=42)
        self.assertEqual(r["counts"]["total"], 0)


class TestGuideRealDataAndClaims(unittest.TestCase):
    """Guide numbers and claims must match the real bundled data and behavior."""

    def test_names_vocab_size_is_unique_not_total(self):
        raw = (REPO_ROOT / "data" / "names.txt").read_bytes()
        text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        stats = analyze_text(text)
        self.assertEqual(stats["total_tokens"], 32033)
        self.assertEqual(stats["vocab_size"], 29494)
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            summary = g["worked_examples"][0]["expected_output_summary"]
            self.assertIn("29494", summary, lang)
            self.assertNotIn("vocab_size=32033", summary, lang)

    def test_guide_commands_use_invocation_owned_paths(self):
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            for we in g["worked_examples"]:
                self.assertNotIn("--output-dir /tmp/", we["command"], lang)
                self.assertNotIn("--input /tmp/", we["command"], lang)
            self.assertIn("mktemp", g["worked_examples"][1]["command"], lang)
            self.assertIn("mktemp", g["worked_examples"][2]["command"], lang)
            self.assertIn("printf", g["worked_examples"][2]["command"], lang)

    def test_guide_worked_example_commands_actually_run(self):
        # Execute the ACTUAL stored commands verbatim (bash, private TMPDIR).
        # Evidence scope: bash on this host only -- not zsh/Windows/dash.
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            split_cmd = g["worked_examples"][1]["command"]
            corrupt_cmd = g["worked_examples"][2]["command"]
            with tempfile.TemporaryDirectory() as td:
                td = Path(td)

                # Example 2: absolute-path CLI invocation from an unrelated cwd.
                res = run_guide_command(split_cmd, td)
                self.assertEqual(res.returncode, 0, f"{lang}: {res.stderr[-400:]}")
                art_dirs = list(td.rglob("artifacts"))
                self.assertEqual(len(art_dirs), 1, lang)
                for name in (
                    "train.txt", "val.txt", "test.txt",
                    "stats.json", "vocab.json", "manifest.json",
                ):
                    self.assertIn(name, res.stdout, f"{lang}: ls missing {name}")
                    self.assertTrue((art_dirs[0] / name).exists(), name)
                stats = json.loads((art_dirs[0] / "stats.json").read_text())
                self.assertEqual(stats["total_tokens"], 32033)

                # Example 3: stored recipe writes a literal 0xFF byte, then
                # --errors replace succeeds.
                res = run_guide_command(corrupt_cmd, td)
                self.assertEqual(res.returncode, 0, f"{lang}: {res.stderr[-400:]}")
                self.assertIn("Total Tokens", res.stdout)
                corrupt = list(td.rglob("corrupt.txt"))
                self.assertTrue(corrupt, lang)
                self.assertIn(b"\xff", corrupt[-1].read_bytes())

                # Separately labeled strict variant: same stored command with
                # --errors strict must fail non-zero with a diagnostic.
                strict_cmd = corrupt_cmd.replace("--errors replace", "--errors strict")
                self.assertNotEqual(strict_cmd, corrupt_cmd)
                strict = run_guide_command(strict_cmd, td)
                self.assertNotEqual(strict.returncode, 0, f"{lang}: strict unexpectedly passed")
                self.assertTrue(
                    "UnicodeDecodeError" in strict.stderr
                    or "Failed to decode" in strict.stderr,
                    f"{lang}: strict failure must be descriptive: {strict.stderr[-200:]}",
                )

    def test_guide_success_vs_failure_separation(self):
        # requirements[4] must not demand errors for valid empty/unicode input.
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            req4 = g["requirements"][4]
            self.assertTrue(
                any(
                    marker in req4
                    for marker in ["exit 0", "終了コード 0", "退出码 0", "結束碼 0"]
                ),
                f"{lang} req4 must distinguish success cases",
            )

    def test_index_vs_content_distinction_present(self):
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            chk4 = g["acceptance_checklist"][3]["label"]
            marker = {
                "en": "indic",
                "ja": "インデックス",
                "zh-Hans": "索引",
                "zh-Hant": "索引",
            }[lang]
            self.assertIn(marker, chk4.lower() if lang == "en" else chk4, lang)
            self.assertIn("424", g["debugging_cases"][0]["root_cause"], lang)

    def test_emoji_byte_claim_corrected(self):
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            crit = g["independent_mastery_checks"][2]["criteria"]
            self.assertIn("25", crit, lang)  # family ZWJ sequence bytes
            self.assertNotIn(
                "4 bytes for emojis" if lang == "en" else "\x00", crit
            )

    def test_ind01_criterion_matches_public_interface(self):
        # compute_splits returns LIST-valued indices: `train & val` raises
        # TypeError; the guide criterion must wrap them in set(). Real
        # public-interface regression, not only a marker check.
        res = compute_splits(["a", "b", "c", "d", "e"], 0.6, 0.2, 0.2, seed=7)
        train_idx, val_idx = res["train_indices"], res["val_indices"]
        self.assertIsInstance(train_idx, list)
        with self.assertRaises(TypeError):
            train_idx & val_idx  # noqa: B015 -- the documented pitfall
        self.assertEqual(len(set(train_idx) & set(val_idx)), 0)
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            crit = g["independent_mastery_checks"][0]["criteria"]
            self.assertIn(
                "set(train_indices) & set(val_indices)", crit,
                f"{lang} ind-01 must use set() on the list-valued result",
            )
            self.assertNotIn("train_indices & val_indices)", crit, lang)

    def test_agent01_allows_honest_no_defect_path(self):
        markers = {
            "en": "no defect was found",
            "ja": "欠陥が見つからなかった",
            "zh-Hans": "未发现缺陷",
            "zh-Hant": "未發現缺陷",
        }
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            crit = g["agent_assisted_checks"][0]["criteria"]
            self.assertIn(markers[lang], crit, lang)

    def test_ratio_normalization_text_is_float_honest(self):
        # Parent witness: (.500002, .5, 0) is accepted and rescaled; the weights
        # sum to 1.0000000000000002 -- the recorded text must not claim bit-
        # exactness.
        res = compute_splits(
            ["x"] * 5, 0.500002, 0.5, 0.0, seed=1
        )
        weights_sum = sum(res["normalized_ratios"].values())
        self.assertNotEqual(weights_sum, 1.0)
        self.assertAlmostEqual(weights_sum, 1.0)
        text = res["ratio_normalization"]
        self.assertIn("floating-point precision", text)
        self.assertNotIn("exactly 1.0", text)

    def test_guide_examples_run_consecutively_same_shell(self):
        # Regression for the same-shell failure: Example2 must not leak its
        # cwd change into the caller's shell, or Example3 fails with exit 2.
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            we1 = g["worked_examples"][1]["command"]
            we2 = g["worked_examples"][2]["command"]
            self.assertTrue(we1.lstrip().startswith("("), f"{lang}: Example2 must be a contained subshell")
            with tempfile.TemporaryDirectory() as td:
                env = dict(os.environ, TMPDIR=td, LC_ALL="C",
                           PYTHONDONTWRITEBYTECODE="1")
                res = subprocess.run(
                    ["bash", "-c", we1 + "\n" + we2],
                    cwd=str(REPO_ROOT), capture_output=True, text=True, env=env)
                self.assertEqual(res.returncode, 0,
                                 f"{lang} consecutive run failed: {res.stderr[-300:]}")
                self.assertIn("manifest.json", res.stdout)
                self.assertIn("Total Tokens", res.stdout)

    def test_chk02_bounded_reproducibility(self):
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            lab = g["acceptance_checklist"][2]["label"]
            for marker in {
                "en": ["input bytes", "ratios", "seed", "decoding", "platform"],
                "ja": ["入力バイト", "比率", "シード", "デコード", "プラットフォーム"],
                "zh-Hans": ["输入字节", "比例", "种子", "解码", "平台"],
                "zh-Hant": ["輸入位元組", "比例", "種子", "解碼", "平台"],
            }[lang]:
                self.assertIn(marker, lab, f"{lang} chk-02 missing '{marker}'")

    def test_chk04_missing_files_and_ja_parity(self):
        g_en = json.loads((GUIDE_DIR / "en.json").read_text(encoding="utf-8"))
        self.assertIn("missing files", g_en["acceptance_checklist"][4]["label"])
        for lang, marker in [("ja", "存在しないファイル"),
                             ("zh-Hans", "缺失文件"), ("zh-Hant", "缺失檔案")]:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            self.assertIn(marker, g["acceptance_checklist"][4]["label"], lang)
        g_ja = json.loads((GUIDE_DIR / "ja.json").read_text(encoding="utf-8"))
        self.assertIn("比率", g_ja["exercises"][2]["prompt"])
        self.assertIn("--errors strict|replace|ignore", g_ja["exercises"][3]["prompt"])

    def test_guide_ids_preserved(self):
        for lang in SUPPORTED_LANGS:
            g = json.loads((GUIDE_DIR / f"{lang}.json").read_text(encoding="utf-8"))
            self.assertEqual(g["project_id"], "text_tools")
            self.assertEqual(
                [d["case_id"] for d in g["debugging_cases"]],
                ["debug-01", "debug-02", "debug-03", "debug-04"],
            )
            self.assertEqual(
                [c["check_id"] for c in g["independent_mastery_checks"]],
                ["ind-01", "ind-02", "ind-03"],
            )
            self.assertEqual(
                [c["check_id"] for c in g["agent_assisted_checks"]],
                ["agent-01", "agent-02"],
            )
            self.assertEqual(
                [c["id"] for c in g["acceptance_checklist"]],
                ["chk-01", "chk-02", "chk-03", "chk-04", "chk-05", "chk-06"],
            )
            self.assertEqual(
                [p["id"] for p in g["predictions"]],
                ["pred-01", "pred-02", "pred-03"],
            )


class TestDay13CurriculumAlignment(unittest.TestCase):
    """Day 13 content must reflect the sealed-report and workspace requirements."""

    def test_act04_sealed_unaided_report(self):
        for lang in SUPPORTED_LANGS:
            c = json.loads(
                (REPO_ROOT / "curriculum" / "content" / "day-13" / f"{lang}.json")
                .read_text(encoding="utf-8")
            )
            a4 = c["activities"]["day-13-act-04"]
            blob = a4["assistance_policy_label"] + a4["instructions"] + a4["mastery_criterion"]
            markers = {
                "en": ["seal", "unaided", "unassessed"],
                "ja": ["確定", "無支援", "非評価"],
                "zh-Hans": ["封存", "无协助", "不计评估"],
                "zh-Hant": ["封存", "無協助", "不計評估"],
            }[lang]
            for mk in markers:
                self.assertIn(mk, blob, f"{lang} missing '{mk}'")

    def test_act02_both_routes_aligned_with_real_contract(self):
        # The analyze_text route's canonical witness must match the real
        # implementation exactly, and both routes must be prompted+answered.
        witness = analyze_text("a a\n\u732b\U0001f642")
        self.assertEqual(witness["total_chars"], 6)
        self.assertEqual(witness["total_tokens"], 3)
        self.assertEqual(witness["vocab_size"], 2)
        self.assertEqual(witness["char_vocab_size"], 5)
        self.assertEqual(witness["token_frequencies"], {"a": 2, "\u732b\U0001f642": 1})
        self.assertEqual(witness["min_token_length"], 1)
        self.assertEqual(witness["max_token_length"], 2)
        self.assertAlmostEqual(witness["avg_token_length"], 4 / 3, places=3)
        for lang in SUPPORTED_LANGS:
            c = json.loads(
                (REPO_ROOT / "curriculum" / "content" / "day-13" / f"{lang}.json")
                .read_text(encoding="utf-8"))
            a2 = c["activities"]["day-13-act-02"]
            blob = a2["exercise_prompt"] + a2["answer"]
            self.assertIn("analyze_text", blob, lang)
            self.assertIn("compute_splits", blob, lang)
            self.assertIn("total_chars=6", a2["answer"], lang)
            self.assertIn("total_tokens=3", a2["answer"], lang)
            self.assertIn("1.3333", a2["answer"], lang)
            self.assertIn("\u732b\U0001f642", blob, lang)
            for key in ("char_frequencies", "char_distribution", "min_token_length"):
                self.assertIn(key, a2["exercise_prompt"], f"{lang}:{key}")

    def test_day15_act04_sealed_handoff_contract(self):
        for lang in SUPPORTED_LANGS:
            c = json.loads(
                (REPO_ROOT / "curriculum" / "content" / "day-15" / f"{lang}.json")
                .read_text(encoding="utf-8"))
            a4 = c["activities"]["day-15-act-04"]
            blob = a4["assistance_policy_label"] + a4["instructions"] + a4["mastery_criterion"]
            markers = {
                "en": ["preserv", "unaided", "unassessed", "BEFORE"],
                "ja": ["保存", "無支援", "非評価", "前に"],
                "zh-Hans": ["保存", "无协助", "不计评估", "之前"],
                "zh-Hant": ["保存", "無協助", "不計評估", "之前"],
            }[lang]
            for mk in markers:
                self.assertIn(mk, blob, f"{lang} day-15-act-04 missing '{mk}'")

    def test_day15_common_labels_localized(self):
        for lang in ["ja", "zh-Hans", "zh-Hant"]:
            c = json.loads(
                (REPO_ROOT / "curriculum" / "content" / "day-15" / f"{lang}.json")
                .read_text(encoding="utf-8"))
            self.assertNotEqual(c["time_budget_label"], "480 active minutes (breaks and unattended runtime excluded)")
            self.assertNotEqual(c["category_label"], "Self-Directed Learning & Python")
            self.assertIn("480", c["time_budget_label"], lang)
            self.assertIn("Python", c["category_label"], lang)

    def test_act01_private_workspace_invocation(self):
        for lang in SUPPORTED_LANGS:
            c = json.loads(
                (REPO_ROOT / "curriculum" / "content" / "day-13" / f"{lang}.json")
                .read_text(encoding="utf-8")
            )
            instr = c["activities"]["day-13-act-01"]["instructions"]
            self.assertIn("mktemp", instr, lang)
            self.assertIn("--split", instr, lang)
            self.assertIn("--output-dir", instr, lang)

    def test_ledger_revisions_and_identities(self):
        d = json.loads((REPO_ROOT / "curriculum" / "days" / "day-13.json").read_text())
        self.assertEqual(len(d["activities"]), 4)
        # act-02 (both-route alignment) and act-03 (bounded reproducibility)
        # changed in this batch; act-01/act-04 stay at rev2.
        want_rev = ["2026.10.30-rev2", "2026.10.30-rev3",
                    "2026.10.30-rev3", "2026.10.30-rev2"]
        for act, rev in zip(d["activities"], want_rev):
            self.assertEqual(act["content_revision"], rev, act["id"])
            self.assertEqual(act["active_minutes"], 120)
        self.assertEqual(
            [a["assistance_policy"] for a in d["activities"]],
            ["agent_assisted", "independent", "agent_assisted", "independent"],
        )
        self.assertNotIn("quiz", json.dumps(d))

    def test_day15_reference_revision_justified(self):
        d = json.loads((REPO_ROOT / "curriculum" / "days" / "day-15.json").read_text())
        # act-01/act-02 (bounded reproducibility answers) and act-04 (sealed
        # handoff contract) changed; act-03 stays at rev2.
        want_rev = ["2026.10.30-rev3", "2026.10.30-rev3",
                    "2026.10.30-rev2", "2026.10.30-rev3"]
        for act, rev in zip(d["activities"], want_rev):
            self.assertEqual(act["content_revision"], rev, act["id"])


if __name__ == "__main__":
    unittest.main()

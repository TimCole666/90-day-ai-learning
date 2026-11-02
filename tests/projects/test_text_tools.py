import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CLI_PATH = REPO_ROOT / "projects" / "text_tools" / "cli.py"


class TestTextToolsCLIProcessIsolation(unittest.TestCase):
    """
    Process-isolated tests for the Text and Data Tools CLI.
    Tests execute python projects/text_tools/cli.py via subprocess
    from a clean, unrelated temporary working directory.
    """

    def run_cli(self, args, cwd=None):
        if cwd is None:
            temp_dir = tempfile.TemporaryDirectory()
            work_dir = temp_dir.name
        else:
            temp_dir = None
            work_dir = cwd

        cmd = [sys.executable, str(CLI_PATH)] + args
        result = subprocess.run(
            cmd,
            cwd=work_dir,
            capture_output=True,
            text=True,
        )
        if temp_dir:
            temp_dir.cleanup()
        return result

    def test_cli_stats_json_output(self):
        """Slice 1: Compute corpus statistics via CLI with process isolation."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_file = temp_path / "sample.txt"
            # Known-good sample text:
            # 6 words total, 5 unique tokens ('the' occurs twice), 23 total chars
            sample_text = "the cat sat on the mat\n"
            input_file.write_text(sample_text, encoding="utf-8")

            # Run from an unrelated working directory
            with tempfile.TemporaryDirectory() as unrelated_cwd:
                result = self.run_cli(["--input", str(input_file), "--stats", "--json"], cwd=unrelated_cwd)

            self.assertEqual(result.returncode, 0, f"CLI failed with stderr: {result.stderr}")
            stats = json.loads(result.stdout)

            # Independent assertions against known ground truth
            self.assertEqual(stats["total_chars"], 23)
            self.assertEqual(stats["total_tokens"], 6)
            self.assertEqual(stats["vocab_size"], 5)
            self.assertEqual(stats["token_frequencies"]["the"], 2)
            self.assertEqual(stats["token_frequencies"]["cat"], 1)
            self.assertEqual(stats["char_frequencies"]["t"], 5)
            self.assertEqual(stats["char_frequencies"][" "], 5)
            self.assertEqual(stats["char_frequencies"]["a"], 3)

    def test_split_preserves_non_lf_record_content(self):
        """Only LF separates records; other Unicode separators stay in their record."""
        sys.path.insert(0, str(REPO_ROOT))
        from projects.text_tools.core import generate_artifacts

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_file = temp_path / "separators.txt"
            input_file.write_text("chapter one\fpage two\nsecond line\n", encoding="utf-8")
            out_dir = temp_path / "out"

            result = generate_artifacts(
                input_file, out_dir, train_ratio=1.0, val_ratio=0.0, test_ratio=0.0, seed=0
            )

            self.assertEqual(result["manifest"]["total_lines"], 2)
            self.assertEqual(
                (out_dir / "train.txt").read_text(encoding="utf-8"),
                "chapter one\fpage two\nsecond line\n",
            )

    def test_stats_permission_error_fails_without_traceback(self):
        """An unreadable existing input should produce a concise CLI error."""
        sys.path.insert(0, str(REPO_ROOT))
        from projects.text_tools import cli as text_tools_cli

        with tempfile.TemporaryDirectory() as temp_dir:
            input_file = Path(temp_dir) / "unreadable.txt"
            input_file.write_text("secret\n", encoding="utf-8")
            stderr = io.StringIO()
            with patch("builtins.open", side_effect=PermissionError(13, "Permission denied")), redirect_stderr(stderr):
                result = text_tools_cli.main(["--input", str(input_file), "--stats"])

            self.assertEqual(result, 1)
            self.assertIn("Failed to read", stderr.getvalue())
            self.assertNotIn("Traceback", stderr.getvalue())

    def test_cli_deterministic_splitting_and_artifacts(self):
        """Slice 2: Deterministic reproducible train/val/test splits, manifest provenance, and no leakage."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_file = temp_path / "corpus.txt"
            # 20 distinct records/lines to split 80/10/10 (16 train, 2 val, 2 test)
            lines = [f"line_{i:02d}: token_{i} sample text" for i in range(20)]
            input_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

            out_dir_1 = temp_path / "out1"
            out_dir_2 = temp_path / "out2"
            out_dir_diff_seed = temp_path / "out_diff"

            # Run 1: seed 42
            with tempfile.TemporaryDirectory() as cwd1:
                res1 = self.run_cli(
                    [
                        "--input", str(input_file),
                        "--split",
                        "--output-dir", str(out_dir_1),
                        "--train-ratio", "0.8",
                        "--val-ratio", "0.1",
                        "--test-ratio", "0.1",
                        "--seed", "42",
                    ],
                    cwd=cwd1,
                )
            self.assertEqual(res1.returncode, 0, f"Run 1 failed: {res1.stderr}")

            # Run 2: seed 42 (must be byte-for-byte identical)
            with tempfile.TemporaryDirectory() as cwd2:
                res2 = self.run_cli(
                    [
                        "--input", str(input_file),
                        "--split",
                        "--output-dir", str(out_dir_2),
                        "--train-ratio", "0.8",
                        "--val-ratio", "0.1",
                        "--test-ratio", "0.1",
                        "--seed", "42",
                    ],
                    cwd=cwd2,
                )
            self.assertEqual(res2.returncode, 0, f"Run 2 failed: {res2.stderr}")

            # Run 3: different seed 99
            with tempfile.TemporaryDirectory() as cwd3:
                res3 = self.run_cli(
                    [
                        "--input", str(input_file),
                        "--split",
                        "--output-dir", str(out_dir_diff_seed),
                        "--train-ratio", "0.8",
                        "--val-ratio", "0.1",
                        "--test-ratio", "0.1",
                        "--seed", "99",
                    ],
                    cwd=cwd3,
                )
            self.assertEqual(res3.returncode, 0, f"Run 3 failed: {res3.stderr}")

            # Verify generated files exist
            for expected_file in ["train.txt", "val.txt", "test.txt", "manifest.json", "stats.json", "vocab.json"]:
                self.assertTrue((out_dir_1 / expected_file).exists(), f"Missing file {expected_file}")

            train_1 = (out_dir_1 / "train.txt").read_text(encoding="utf-8").strip().split("\n")
            val_1 = (out_dir_1 / "val.txt").read_text(encoding="utf-8").strip().split("\n")
            test_1 = (out_dir_1 / "test.txt").read_text(encoding="utf-8").strip().split("\n")

            # Check split counts match 80 / 10 / 10 ratio for 20 lines
            self.assertEqual(len(train_1), 16)
            self.assertEqual(len(val_1), 2)
            self.assertEqual(len(test_1), 2)

            # Check NO LEAKAGE (zero intersection among train, val, and test)
            set_train = set(train_1)
            set_val = set(val_1)
            set_test = set(test_1)
            self.assertEqual(len(set_train & set_val), 0, "Data leakage between train and val!")
            self.assertEqual(len(set_train & set_test), 0, "Data leakage between train and test!")
            self.assertEqual(len(set_val & set_test), 0, "Data leakage between val and test!")
            self.assertEqual(set_train | set_val | set_test, set(lines))

            # Check Deterministic Reproducibility: out_dir_1 and out_dir_2 have identical contents
            self.assertEqual(
                (out_dir_1 / "train.txt").read_bytes(),
                (out_dir_2 / "train.txt").read_bytes(),
            )
            self.assertEqual(
                (out_dir_1 / "val.txt").read_bytes(),
                (out_dir_2 / "val.txt").read_bytes(),
            )
            self.assertEqual(
                (out_dir_1 / "test.txt").read_bytes(),
                (out_dir_2 / "test.txt").read_bytes(),
            )

            # Check that different seed produces different train split ordering or content
            train_diff = (out_dir_diff_seed / "train.txt").read_text(encoding="utf-8").strip().split("\n")
            self.assertNotEqual(train_1, train_diff, "Different seed should produce different split ordering!")

            # Check Manifest provenance
            manifest = json.loads((out_dir_1 / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["seed"], 42)
            self.assertEqual(manifest["split_counts"]["train"], 16)
            self.assertEqual(manifest["split_counts"]["val"], 2)
            self.assertEqual(manifest["split_counts"]["test"], 2)
            self.assertIn("source_sha256", manifest)
            self.assertIn("split_sha256", manifest)
            self.assertTrue(manifest["leakage_check"]["no_leakage_verified"])
            self.assertIn("python_version", manifest["environment"])

    def test_edge_case_output_directory_is_file_fails_cleanly_without_overwrite(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_file = temp_path / "valid.txt"
            input_file.write_text("sample line 1\nsample line 2\n", encoding="utf-8")
            output_file = temp_path / "occupied"
            original = b"do not overwrite this file\n"
            output_file.write_bytes(original)

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                result = self.run_cli(
                    ["--input", str(input_file), "--split", "--output-dir", str(output_file)],
                    cwd=unrelated_cwd,
                )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Error:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertEqual(output_file.read_bytes(), original)

    def test_split_rejects_directory_destination_before_writing(self):
        for blocked_name in ("val.txt", "manifest.json"):
            for existing_train in (False, True):
                with (
                    self.subTest(blocked_name=blocked_name, existing_train=existing_train),
                    tempfile.TemporaryDirectory() as temp_dir,
                ):
                        temp_path = Path(temp_dir)
                        input_file = temp_path / "valid.txt"
                        original_input = b"sample line 1\nsample line 2\n"
                        input_file.write_bytes(original_input)
                        output_dir = temp_path / "output"
                        output_dir.mkdir()
                        blocked_path = output_dir / blocked_name
                        blocked_path.mkdir()
                        (blocked_path / "keep.txt").write_bytes(b"keep directory contents\n")
                        if existing_train:
                            (output_dir / "train.txt").write_bytes(b"keep existing train\n")

                        with tempfile.TemporaryDirectory() as unrelated_cwd:
                            result = self.run_cli(
                                ["--input", str(input_file), "--split",
                                 "--output-dir", str(output_dir)],
                                cwd=unrelated_cwd,
                            )

                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn("Error:", result.stderr)
                        self.assertNotIn("Traceback", result.stderr)
                        self.assertEqual(input_file.read_bytes(), original_input)
                        self.assertEqual(
                            {p.name for p in output_dir.iterdir()},
                            {blocked_name, "train.txt"} if existing_train else {blocked_name},
                        )
                        self.assertEqual(
                            (blocked_path / "keep.txt").read_bytes(),
                            b"keep directory contents\n",
                        )
                        if existing_train:
                            self.assertEqual(
                                (output_dir / "train.txt").read_bytes(),
                                b"keep existing train\n",
                            )

    def test_edge_case_missing_file(self):
        """Slice 3: Missing file produces descriptive error and non-zero exit code."""
        with tempfile.TemporaryDirectory() as unrelated_cwd:
            result = self.run_cli(["--input", "definitely_non_existent_file.txt", "--stats"], cwd=unrelated_cwd)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not exist", result.stderr)

    def test_edge_case_unknown_encoding_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            input_file = Path(temp_dir) / "sample.txt"
            input_file.write_text("sample text\n", encoding="utf-8")

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                result = self.run_cli(
                    ["--input", str(input_file), "--stats", "--json",
                     "--encoding", "not-a-real-codec"],
                    cwd=unrelated_cwd,
                )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Failed to decode", result.stderr)
            self.assertIn("not-a-real-codec", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_edge_case_empty_input(self):
        """Slice 3: Empty input file produces zero-valued stats and valid empty artifacts without crashing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            empty_file = temp_path / "empty.txt"
            empty_file.write_text("", encoding="utf-8")
            out_dir = temp_path / "empty_out"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                result_stats = self.run_cli(
                    ["--input", str(empty_file), "--stats", "--json"], cwd=unrelated_cwd
                )
                result_split = self.run_cli(
                    ["--input", str(empty_file), "--split", "--output-dir", str(out_dir)],
                    cwd=unrelated_cwd,
                )

            self.assertEqual(result_stats.returncode, 0)
            stats = json.loads(result_stats.stdout)
            self.assertEqual(stats["total_chars"], 0)
            self.assertEqual(stats["total_tokens"], 0)
            self.assertEqual(stats["vocab_size"], 0)
            self.assertEqual(stats["avg_token_length"], 0.0)

            self.assertEqual(result_split.returncode, 0)
            self.assertTrue((out_dir / "train.txt").exists())
            self.assertEqual((out_dir / "train.txt").read_text(), "")
            manifest = json.loads((out_dir / "manifest.json").read_text())
            self.assertEqual(manifest["total_lines"], 0)
            self.assertEqual(manifest["split_counts"]["train"], 0)

    def test_edge_case_repeated_values(self):
        """Slice 3: Repeated values handle frequency counting and splitting gracefully."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            repeated_file = temp_path / "repeated.txt"
            # 10 lines of the identical word "echo"
            repeated_file.write_text("\n".join(["echo"] * 10) + "\n", encoding="utf-8")
            out_dir = temp_path / "repeated_out"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                res = self.run_cli(
                    [
                        "--input", str(repeated_file),
                        "--stats", "--json",
                        "--split", "--output-dir", str(out_dir),
                        "--seed", "42",
                    ],
                    cwd=unrelated_cwd,
                )

            self.assertEqual(res.returncode, 0)
            stats = json.loads(res.stdout)
            self.assertEqual(stats["vocab_size"], 1)
            self.assertEqual(stats["token_frequencies"]["echo"], 10)
            self.assertEqual(stats["char_frequencies"]["e"], 10)
            self.assertTrue((out_dir / "train.txt").exists())

    def test_edge_case_unicode_multilingual(self):
        """Slice 3: Unicode text in Simplified Chinese, Traditional Chinese, Japanese, emojis, and accents."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            unicode_file = temp_path / "multilingual.txt"
            text_lines = [
                "自然语言处理",        # zh-Hans
                "自然語言處理",        # zh-Hant
                "自然言語処理",        # ja
                "Machine Learning 🚀", # en + emoji
                "café résumé",         # accents
            ]
            unicode_file.write_text("\n".join(text_lines) + "\n", encoding="utf-8")
            out_dir = temp_path / "unicode_out"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                res = self.run_cli(
                    [
                        "--input", str(unicode_file),
                        "--stats", "--json",
                        "--split", "--output-dir", str(out_dir),
                        "--train-ratio", "0.6",
                        "--val-ratio", "0.2",
                        "--test-ratio", "0.2",
                    ],
                    cwd=unrelated_cwd,
                )

            self.assertEqual(res.returncode, 0, f"Failed: {res.stderr}")
            stats = json.loads(res.stdout)
            self.assertIn("自然语言处理", stats["token_frequencies"])
            self.assertIn("自然語言處理", stats["token_frequencies"])
            self.assertIn("自然言語処理", stats["token_frequencies"])
            self.assertIn("🚀", stats["token_frequencies"])

            # Verify UTF-8 files written without corruption
            train_text = (out_dir / "train.txt").read_text(encoding="utf-8")
            self.assertTrue(len(train_text) > 0)
            manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["total_lines"], 5)

    def test_edge_case_malformed_encoding(self):
        """Slice 3: Malformed encoding fails cleanly under strict, or recovers under replace."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            corrupt_file = temp_path / "corrupt.txt"
            # Invalid UTF-8 bytes
            corrupt_file.write_bytes(b"Valid prefix \xff\xfe invalid continuation")

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                # Default strict mode fails with error message
                res_strict = self.run_cli(
                    ["--input", str(corrupt_file), "--stats"], cwd=unrelated_cwd
                )
                # Recover mode with --errors replace succeeds
                res_replace = self.run_cli(
                    ["--input", str(corrupt_file), "--stats", "--json", "--errors", "replace"],
                    cwd=unrelated_cwd,
                )

            self.assertNotEqual(res_strict.returncode, 0)
            self.assertIn("Failed to decode", res_strict.stderr)

            self.assertEqual(res_replace.returncode, 0)
            stats = json.loads(res_replace.stdout)
            self.assertIn("\ufffd", stats["char_frequencies"])

    def test_edge_case_invalid_split_ratios(self):
        """Slice 3: Invalid split ratios that do not sum to 1.0 produce non-zero exit code and error."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_file = temp_path / "valid.txt"
            input_file.write_text("sample line 1\nsample line 2\n", encoding="utf-8")
            out_dir = temp_path / "out"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                res = self.run_cli(
                    [
                        "--input", str(input_file),
                        "--split", "--output-dir", str(out_dir),
                        "--train-ratio", "0.9",
                        "--val-ratio", "0.2",
                        "--test-ratio", "0.1",
                    ],
                    cwd=unrelated_cwd,
                )

            self.assertNotEqual(res.returncode, 0)
            self.assertIn("ratios must sum to 1.0", res.stderr)

    def test_real_corpus_names_stats_and_splits(self):
        """Slice 4: Verify real legally usable corpus data/names.txt with deterministic splitting."""
        names_file = REPO_ROOT / "data" / "names.txt"
        self.assertTrue(names_file.exists(), "data/names.txt must exist")

        with tempfile.TemporaryDirectory() as temp_dir:
            out_dir = Path(temp_dir) / "names_artifacts"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                res = self.run_cli(
                    [
                        "--input", str(names_file),
                        "--stats", "--json",
                        "--split", "--output-dir", str(out_dir),
                        "--train-ratio", "0.8",
                        "--val-ratio", "0.1",
                        "--test-ratio", "0.1",
                        "--seed", "42",
                    ],
                    cwd=unrelated_cwd,
                )

            self.assertEqual(res.returncode, 0, f"Processing names.txt failed: {res.stderr}")
            stats = json.loads(res.stdout)

            # data/names.txt has exactly 32,033 names
            self.assertEqual(stats["total_tokens"], 32033)
            # All 26 English letters present + newline characters
            self.assertGreaterEqual(stats["char_vocab_size"], 26)
            # Most common letter in names is 'a' or 'e'
            most_common_char = next(iter(stats["char_frequencies"]))
            self.assertIn(most_common_char, ["a", "e"])

            # Verify generated split artifacts
            manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["total_lines"], 32033)
            self.assertEqual(manifest["split_counts"]["train"], 25626)
            self.assertEqual(manifest["split_counts"]["val"], 3203)
            self.assertEqual(manifest["split_counts"]["test"], 3204)
            self.assertTrue(manifest["leakage_check"]["no_leakage_verified"])

            # Verify split files
            train_lines = (out_dir / "train.txt").read_text(encoding="utf-8").strip().split("\n")
            val_lines = (out_dir / "val.txt").read_text(encoding="utf-8").strip().split("\n")
            test_lines = (out_dir / "test.txt").read_text(encoding="utf-8").strip().split("\n")

            self.assertEqual(len(train_lines), 25626)
            self.assertEqual(len(val_lines), 3203)
            self.assertEqual(len(test_lines), 3204)

            # Check disjoint index allocation: verify zero leakage across split index records
            self.assertEqual(manifest["leakage_check"]["overlap_indices_count"], 0)

    def test_real_corpus_tinyshakespeare(self):
        """Slice 4: Verify real legally usable corpus data/tinyshakespeare.txt."""
        corpus_file = REPO_ROOT / "data" / "tinyshakespeare.txt"
        self.assertTrue(corpus_file.exists(), "data/tinyshakespeare.txt must exist")

        with tempfile.TemporaryDirectory() as temp_dir:
            out_dir = Path(temp_dir) / "shakespeare_artifacts"

            with tempfile.TemporaryDirectory() as unrelated_cwd:
                res = self.run_cli(
                    [
                        "--input", str(corpus_file),
                        "--stats", "--json",
                        "--split", "--output-dir", str(out_dir),
                        "--train-ratio", "0.9",
                        "--val-ratio", "0.05",
                        "--test-ratio", "0.05",
                        "--seed", "1337",
                    ],
                    cwd=unrelated_cwd,
                )

            self.assertEqual(res.returncode, 0, f"Processing tinyshakespeare.txt failed: {res.stderr}")
            stats = json.loads(res.stdout)

            # TinyShakespeare has over 1MB of text (>1,000,000 chars and >200,000 tokens)
            self.assertGreater(stats["total_chars"], 1000000)
            self.assertGreater(stats["total_tokens"], 200000)
            self.assertEqual(stats["char_vocab_size"], 65)  # 65 unique characters in TinyShakespeare

            manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertTrue(manifest["leakage_check"]["no_leakage_verified"])
            self.assertTrue((out_dir / "train.txt").exists())
            self.assertTrue((out_dir / "val.txt").exists())
            self.assertTrue((out_dir / "test.txt").exists())


if __name__ == "__main__":
    unittest.main()

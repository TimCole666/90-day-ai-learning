"""The local-verification CLI reports evidence; it cannot certify deployment."""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / 'scripts/verify_local.py'


class LocalVerificationCLITest(unittest.TestCase):
    def test_selected_check_is_executed_but_not_a_complete_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'package.json').write_text('{"name":"verification-fixture"}')
            (root / 'scripts/audit_curriculum.py').write_text("print('fixture-audit-ran')\n")
            output = root / 'runs/verification'
            result = subprocess.run([
                sys.executable, str(CLI), '--root', str(root), '--suite', 'audit',
                '--output', str(output), '--python', sys.executable,
            ], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            receipt = json.loads((output / 'latest.json').read_text())
            self.assertEqual(receipt['status'], 'partial')
            self.assertFalse(receipt['complete'])
            self.assertTrue(receipt['fresh'])
            self.assertEqual(receipt['course_readiness'], 'not_established_by_local_checks')
            self.assertEqual(receipt['suites'][0]['name'], 'audit')
            self.assertEqual(receipt['suites'][0]['status'], 'passed')
            log = Path(receipt['suites'][0]['commands'][0]['log'])
            self.assertIn('fixture-audit-ran', log.read_text())
            self.assertTrue(receipt['external_requirements'])
            self.assertTrue(receipt['runtime']['python']['version'])
            self.assertTrue(receipt['runtime']['node']['version'])
            check = [sys.executable, str(CLI), '--root', str(root),
                     '--check-receipt', str(output / 'latest.json')]
            fresh = subprocess.run(check, capture_output=True, text=True, timeout=30)
            self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
            self.assertFalse(json.loads(fresh.stdout)['complete'])
            original_log = log.read_text()
            log.write_text('tampered log')
            tampered = subprocess.run(check, capture_output=True, text=True, timeout=30)
            self.assertEqual(tampered.returncode, 1)
            self.assertFalse(json.loads(tampered.stdout)['logs_valid'])
            log.write_text(original_log)
            (root / 'package.json').write_text('{"changed_after_run":true}')
            stale = subprocess.run(check, capture_output=True, text=True, timeout=30)
            self.assertEqual(stale.returncode, 1)
            self.assertFalse(json.loads(stale.stdout)['fresh'])

    def run_fixture(self, program, *, extra=(), environment=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'package.json').write_text('{}')
            (root / 'scripts/audit_curriculum.py').write_text(program)
            output = root / 'runs/verification'
            result = subprocess.run([
                sys.executable, str(CLI), '--root', str(root), '--suite', 'audit',
                '--output', str(output), '--python', sys.executable, *extra,
            ], capture_output=True, text=True, timeout=30, env=environment)
            return result, json.loads((output / 'latest.json').read_text())

    def test_changed_release_archive_invalidates_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'package.json').write_text('{}')
            (root / 'scripts/audit_curriculum.py').write_text("print('fixture-audit')\n")
            output = root / 'runs/verification'
            result = subprocess.run([
                sys.executable, str(CLI), '--root', str(root), '--suite', 'audit',
                '--output', str(output), '--python', sys.executable,
            ], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            archive = root / 'dist/fixture.tar.gz'
            archive.parent.mkdir()
            archive.write_bytes(b'known-artifact')
            digest = hashlib.sha256(b'known-artifact').hexdigest()
            (archive.parent / 'package-manifest.json').write_text(json.dumps({
                'archive': archive.name, 'sha256': digest, 'included_files_count': 1,
            }))
            saved = output / 'latest.json'
            receipt = json.loads(saved.read_text())
            receipt['release_artifact'] = {'sha256': digest, 'verified': True}
            saved.write_text(json.dumps(receipt))
            command = [sys.executable, str(CLI), '--root', str(root),
                       '--check-receipt', str(saved)]
            checked = subprocess.run(command, capture_output=True, text=True, timeout=30)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            archive.write_bytes(b'changed-artifact')
            altered = subprocess.run(command, capture_output=True, text=True, timeout=30)
            self.assertEqual(altered.returncode, 1)
            self.assertFalse(json.loads(altered.stdout)['artifact_valid'])

    def test_empty_test_suite_is_not_a_pass(self):
        result, receipt = self.run_fixture(
            "print('audit only')\n", extra=('--suite', 'browser'))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(receipt['suites'][-1]['name'], 'browser')
        self.assertEqual(receipt['suites'][-1]['status'], 'failed')
        self.assertEqual(receipt['suites'][-1]['commands'], [])

    def test_zero_collected_python_tests_are_not_a_pass(self):
        result, receipt = self.run_fixture(
            "from pathlib import Path\nPath('tests/unit').mkdir(parents=True)\n",
            extra=('--suite', 'python-unit'))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(receipt['suites'][-1]['commands'][0]['tests_run'], 0)
        self.assertEqual(receipt['suites'][-1]['commands'][0]['status'], 'incomplete')

    def test_skipped_python_tests_are_recorded_but_not_passed(self):
        test_program = (
            "import unittest\nclass T(unittest.TestCase):\n"
            " @unittest.skip('missing prerequisite')\n def test_missing(self): pass\n"
        )
        setup = (
            "from pathlib import Path\np=Path('tests/unit'); p.mkdir(parents=True)\n"
            f"(p/'test_fixture.py').write_text({test_program!r})\n"
        )
        result, receipt = self.run_fixture(setup, extra=('--suite', 'python-unit'))
        self.assertEqual(result.returncode, 1)
        command = receipt['suites'][-1]['commands'][0]
        self.assertEqual(command['tests_run'], 1)
        self.assertEqual(command['tests_skipped'], 1)
        self.assertEqual(command['status'], 'incomplete')

    def test_failed_command_cannot_be_reported_as_success(self):
        result, receipt = self.run_fixture('raise SystemExit(3)\n')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual(receipt['suites'][0]['commands'][0]['exit_code'], 3)

    def test_changed_inputs_invalidate_passing_results(self):
        result, receipt = self.run_fixture(
            "from pathlib import Path\nPath('package.json').write_text('{\"changed\":true}')\n")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(receipt['fresh'])
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual(receipt['suites'][0]['status'], 'passed')

    def test_production_paths_and_credentials_are_not_inherited(self):
        result, receipt = self.run_fixture(
            'import os\nassert not any(os.environ.get(key) for key in '
            "['DB_PATH', 'DATA_DIR', 'CONFIG_PATH', 'GOOGLE_CLIENT_SECRET', 'DEEPSEEK_API_KEY'])\n",
            environment={**os.environ, 'DB_PATH': '/never-touch/production.db',
                         'DATA_DIR': '/never-touch', 'CONFIG_PATH': '/never-touch/config',
                         'GOOGLE_CLIENT_SECRET': 'sentinel', 'DEEPSEEK_API_KEY': 'sentinel'},
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(receipt['suites'][0]['status'], 'passed')

    def test_output_cannot_shadow_inputs_or_delivery_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'checkout'
            root.mkdir()
            (root / 'package.json').write_text('{}')
            for output in (root.parent, root / 'dist', root / '.pi', root / 'scripts'):
                with self.subTest(output=str(output)):
                    result = subprocess.run([
                        sys.executable, str(CLI), '--root', str(root), '--suite', 'audit',
                        '--output', str(output),
                    ], capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                    self.assertIn('--output', result.stderr)

    def test_timeout_is_recorded_as_failure(self):
        result, receipt = self.run_fixture(
            'import time\ntime.sleep(10)\n', extra=('--timeout', '0.2'))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(receipt['suites'][0]['commands'][0]['status'], 'timed_out')
        self.assertEqual(receipt['status'], 'failed')


if __name__ == '__main__':
    unittest.main()

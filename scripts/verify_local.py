#!/usr/bin/env python3
"""Run local acceptance checks without claiming deployment or human review."""

import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SUITES = (
    'audit', 'ledger', 'rights', 'matrix', 'python-unit', 'python-projects',
    'python-engineering', 'cjs', 'packaging', 'browser',
)
EXTERNAL_REQUIREMENTS = [
    'Owner-authorized VPS, DNS, TLS and actual deployment acceptance.',
    'Live Google/GitHub OAuth, account isolation and recovery at the real origin.',
    'Approved real GPU pretraining/LoRA and live agent-track execution evidence.',
    'Native-language review and publication/legal approval are not automated checks.',
    'Strict source quality: partially satisfied; expert review pending.',
]
SCOPES = (
    'server.cjs', 'package.json', 'config.production.json', 'lib', 'scripts',
    'tests', 'projects', 'lab', 'curriculum', 'assets', 'lessons', 'docs',
    'LICENSE', 'LICENSE-CC-BY-SA-4.0', 'NOTICE', 'GLOSSARY.md', 'AGENTS.md',
    '.scratch/90-day-ai-learning',
)
EXCLUDED_DIRS = {
    '.git', '.pi', '.venv', '.ruff_cache', '__pycache__', 'node_modules',
    'archive', 'runs', 'dist', 'data', '.worktrees', 'learning-records',
}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(root, output):
    """Bind evidence to relevant files without reading credentials or archives."""
    entries = []
    for scope in SCOPES:
        target = root / scope
        if target.is_symlink():
            candidates = [target]
        elif target.is_dir():
            candidates = []
            for base, directories, files in os.walk(target, followlinks=False):
                directories[:] = sorted(d for d in directories if d not in EXCLUDED_DIRS
                                        and not (Path(base) / d).is_symlink())
                candidates.extend(Path(base) / name for name in sorted(files))
        else:
            candidates = [target] if target.exists() else []
        for path in candidates:
            if output == path or output in path.parents:
                continue
            if path.name.startswith('.env') or path.suffix in {'.db', '.pyc', '.pt', '.tmp'}:
                continue
            if path.name.endswith(('-wal', '-shm', '-journal')):
                continue
            if path.is_symlink():
                digest = hashlib.sha256(('symlink:' + os.readlink(path)).encode()).hexdigest()
            elif path.is_file():
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            else:
                continue
            entries.append({'path': path.relative_to(root).as_posix(), 'sha256': digest})
    entries.sort(key=lambda entry: entry['path'])
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()
    return {'sha256': digest, 'file_count': len(entries), 'files': entries}


def verification_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(('127.0.0.1', 0))
        return str(probe.getsockname()[1])


def command_plan(root, python, node):
    def files(folder):
        return [[node, str(path.relative_to(root))]
                for path in sorted((root / folder).glob('test_*.cjs'))]

    return {
        'audit': [[python, 'scripts/audit_curriculum.py']],
        'ledger': [[python, 'scripts/audit_calendar_ledger.py']],
        'rights': [[node, 'scripts/validate_source_rights.cjs']],
        'matrix': [[python, 'scripts/render_source_matrix.py', '--check']],
        'python-unit': [[python, '-m', 'unittest', 'discover', '-s', 'tests/unit', '-p', 'test_*.py']],
        'python-projects': [[python, '-m', 'unittest', 'discover', '-s', 'tests/projects', '-p', 'test_*.py']],
        'python-engineering': [[python, '-m', 'unittest', 'discover', '-s', 'tests/engineering', '-p', 'test_*.py']],
        'cjs': files('tests/unit'),
        'packaging': files('tests/packaging'),
        'browser': files('tests/browser'),
    }


def execute(command, root, env, logfile, timeout):
    started = time.monotonic()
    with logfile.open('w', encoding='utf-8') as log:
        try:
            process = subprocess.Popen(command, cwd=root, env=env, stdout=log,
                                       stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as error:
            log.write(f'Prerequisite unavailable: {error.__class__.__name__}\n')
            return {'argv': command, 'status': 'blocked', 'exit_code': None,
                    'log': str(logfile), 'seconds': 0}
        try:
            code = process.wait(timeout=timeout)
            status = 'passed' if code == 0 else 'failed'
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            status = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'timed_out'
            code = process.returncode
            log.write(f'\nVerification {status}; per-command limit {timeout}s.\n')
    text = logfile.read_text(encoding='utf-8', errors='replace')
    counts = re.findall(r'Ran (\d+) tests? in', text) if 'unittest' in command else []
    skipped = re.findall(r'OK \(skipped=(\d+)\)', text) if 'unittest' in command else []
    tests_run = int(counts[-1]) if counts else None
    tests_skipped = int(skipped[-1]) if skipped else 0
    if 'unittest' in command and (tests_run == 0 or (code == 0 and (tests_run is None or tests_skipped))):
        status = 'incomplete'
    return {'argv': command, 'status': status, 'exit_code': code,
            'log': str(logfile), 'log_sha256': hashlib.sha256(logfile.read_bytes()).hexdigest(),
            'tests_run': tests_run, 'tests_skipped': tests_skipped,
            'seconds': round(time.monotonic() - started, 3)}


def runtime_identity(python, node, root, env):
    result = {}
    for name, executable in (('python', python), ('node', node)):
        try:
            probe = subprocess.run([executable, '--version'], cwd=root, env=env,
                                   capture_output=True, text=True, timeout=15, check=False)
            result[name] = {'executable': executable, 'available': probe.returncode == 0,
                            'version': (probe.stdout or probe.stderr).strip()[:120]}
        except (OSError, subprocess.TimeoutExpired):
            result[name] = {'executable': executable, 'available': False, 'version': None}
    return result


def release_identity(root):
    try:
        manifest = json.loads((root / 'dist/package-manifest.json').read_text())
        archive = root / 'dist' / manifest['archive']
        if archive.resolve().parent != (root / 'dist').resolve():
            return {'verified': False}
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        return {'archive': str(archive), 'sha256': digest,
                'verified': digest == manifest['sha256'],
                'included_files_count': manifest['included_files_count']}
    except (OSError, ValueError, KeyError, TypeError):
        return {'verified': False}


def check_receipt(receipt_path, root):
    try:
        receipt = json.loads(receipt_path.read_text())
        fresh = (Path(receipt['root']).resolve() == root
                 and fingerprint(root, Path(receipt['output']))['sha256']
                 == receipt['source_after']['sha256'])
        commands = [command for suite in receipt['suites'] for command in suite['commands']]
        logs_valid = bool(commands) and all(
            hashlib.sha256(Path(command['log']).read_bytes()).hexdigest()
            == command.get('log_sha256') for command in commands)
        healthy = receipt['status'] in {'passed', 'partial'}
        artifact = receipt.get('release_artifact')
        artifact_valid = (not artifact or (release_identity(root).get('verified')
                          and release_identity(root).get('sha256') == artifact['sha256']))
        result = {'fresh': fresh, 'logs_valid': logs_valid, 'artifact_valid': artifact_valid,
                  'complete': receipt['complete'], 'recorded_status': receipt['status'],
                  'course_readiness': 'not_established_by_local_checks'}
        print(json.dumps(result))
        return 0 if fresh and logs_valid and artifact_valid and healthy else 1
    except (OSError, ValueError, TypeError, KeyError):
        print(json.dumps({'fresh': False, 'error': 'invalid_or_unavailable_receipt'}))
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, help='Receipt directory (default: runs/local-verification).')
    parser.add_argument('--suite', action='append', choices=SUITES, help='Subset only; never a full pass.')
    parser.add_argument('--python', help='Python interpreter; defaults to project .venv or current Python.')
    parser.add_argument('--timeout', type=float, default=600, help='Maximum seconds per command (positive).')
    parser.add_argument('--list', action='store_true', help='Print suites without running checks.')
    parser.add_argument('--check-receipt', type=Path,
                        help='Check saved source/log freshness only, not production readiness.')
    args = parser.parse_args()
    if args.list:
        print('\n'.join(SUITES))
        return 0
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    root = args.root.resolve()
    if not (root / 'package.json').is_file():
        parser.error('--root must contain package.json')
    if args.check_receipt:
        return check_receipt(args.check_receipt, root)
    output = (args.output or root / 'runs/local-verification').resolve()
    # A receipt directory must never overwrite application or protected files.
    if output == root or output in root.parents or any(
        output == root / scope or root / scope in output.parents
        for scope in (*SCOPES, '.pi', 'archive', '.git', '.venv', 'data', 'dist')
    ):
        parser.error('--output must be outside source/protected directories; use runs/')
    run_dir = output / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    run_dir.mkdir(parents=True, exist_ok=False)
    python = args.python or str(root / '.venv/bin/python' if (root / '.venv/bin/python').exists() else sys.executable)
    node = shutil.which('node') or 'node'
    # Allowlist execution prerequisites only: never let verification inherit
    # production DB/config paths, identity adapters, or paid-provider credentials.
    permitted = {'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ',
                 'NODE_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'SYSTEMROOT'}
    env = {key: value for key, value in os.environ.items() if key in permitted}
    env['PORT'] = verification_port()
    # Never print environment values. Keep browser execution sequential and use
    # the installed local/global Playwright, without installing any dependency.
    if not env.get('NODE_PATH') and shutil.which('npm'):
        npm = subprocess.run(['npm', 'root', '-g'], env=env, capture_output=True,
                             text=True, timeout=30, check=False)
        if npm.returncode == 0:
            env['NODE_PATH'] = npm.stdout.strip()
    selected = list(dict.fromkeys(args.suite or SUITES))
    before = fingerprint(root, output)
    receipt = {
        'schema_version': 1, 'started_at': utc_now(), 'status': 'running',
        'complete': False, 'fresh': False, 'root': str(root), 'output': str(output),
        'course_readiness': 'not_established_by_local_checks',
        'external_requirements': EXTERNAL_REQUIREMENTS,
        'runtime': runtime_identity(python, node, root, env),
        'source_before': before, 'suites': [],
    }
    plan = command_plan(root, python, node)
    for name in selected:
        commands = plan[name]
        print(f'[{name}] running {len(commands)} command(s)', flush=True)
        results = []
        for index, command in enumerate(commands, start=1):
            results.append(execute(command, root, env, run_dir / f'{name}-{index:03}.log', args.timeout))
            if results[-1]['status'] == 'interrupted':
                break
        status = 'passed' if results and all(r['status'] == 'passed' for r in results) else 'failed'
        receipt['suites'].append({'name': name, 'status': status, 'commands': results})
        print(f'[{name}] {status}', flush=True)
        (run_dir / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        if any(result['status'] == 'interrupted' for result in results):
            break
    after = fingerprint(root, output)
    receipt['source_after'] = after
    receipt['fresh'] = before['sha256'] == after['sha256']
    receipt['complete'] = ({suite['name'] for suite in receipt['suites']} == set(SUITES)
                           and all(suite['commands'] and len(suite['commands']) == len(plan[suite['name']])
                                   for suite in receipt['suites']))
    passed = all(suite['status'] == 'passed' for suite in receipt['suites'])
    if any(suite['name'] == 'packaging' and suite['status'] == 'passed'
           for suite in receipt['suites']):
        receipt['release_artifact'] = release_identity(root)
        passed = passed and receipt['release_artifact']['verified']
    receipt['status'] = ('passed' if receipt['complete'] else 'partial') if passed and receipt['fresh'] else 'failed'
    receipt['finished_at'] = utc_now()
    text = json.dumps(receipt, indent=2) + '\n'
    (run_dir / 'receipt.json').write_text(text)
    temporary = output / '.latest.json.tmp'
    temporary.write_text(text)
    temporary.replace(output / 'latest.json')
    print(f"Local verification: {receipt['status']}; unchanged inputs: {receipt['fresh']}.")
    print(f'Receipt: {run_dir / "receipt.json"}')
    print('This is not production acceptance, human review, or proof of teaching superiority.')
    return 0 if passed and receipt['fresh'] else 1


if __name__ == '__main__':
    raise SystemExit(main())

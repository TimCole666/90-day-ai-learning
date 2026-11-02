"""Run the deterministic disposable-project red/green and diff-review check."""
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(*args, cwd):
    return subprocess.run(args, cwd=cwd, text=True, capture_output=True)


def main():
    with tempfile.TemporaryDirectory(prefix="claude-code-fixture-") as directory:
        worktree = Path(directory)
        ignore_cache = shutil.ignore_patterns("__pycache__", "*.pyc")
        shutil.copytree(ROOT / "src", worktree / "src", ignore=ignore_cache)
        shutil.copytree(ROOT / "tests", worktree / "tests", ignore=ignore_cache)
        init = run("git", "init", "-q", cwd=worktree)
        if init.returncode:
            raise SystemExit(init.stderr)
        run("git", "add", ".", cwd=worktree)
        committed = run("git", "commit", "-qm", "fixture baseline", cwd=worktree)
        if committed.returncode:
            raise SystemExit(committed.stderr)

        red = run("python3", "-m", "unittest", "discover", "-s", "tests", "-v", cwd=worktree)
        if red.returncode == 0:
            raise SystemExit("expected the deliberate initial failure")
        print("deliberate failure: exit=1")

        source = worktree / "src" / "greeter.py"
        source.write_text(source.read_text().replace("hello,", "Hello,"))
        green = run("python3", "-m", "unittest", "discover", "-s", "tests", "-v", cwd=worktree)
        if green.returncode:
            raise SystemExit(green.stdout + green.stderr)
        diff_check = run("git", "diff", "--check", cwd=worktree)
        diff = run("git", "diff", "--name-only", cwd=worktree)
        if diff_check.returncode or diff.stdout.strip().splitlines() != ["src/greeter.py"]:
            raise SystemExit("diff review failed: only src/greeter.py may change")
        print("corrected result: exit=0")
        print("reviewed diff: src/greeter.py only")


if __name__ == "__main__":
    main()

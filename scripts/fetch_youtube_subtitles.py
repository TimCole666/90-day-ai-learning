#!/usr/bin/env python3
"""Fetch YouTube metadata and English subtitles without downloading video.

Manual English subtitles are requested first; automatic English subtitles are
requested only when no manual English subtitle was written. Each video gets a
60-second total wall-clock budget. The first two videos act as network probes;
when both fail at the network level, later videos are recorded as blocked
without another request.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = ROOT / "reference" / "youtube-subtitles"
DEFAULT_VIDEO_IDS = (
    "VMj-3S1tku0",
    "PaCmpygFfXo",
    "TCH_1BHY58I",
    "P6sfmUTpUmc",
    "q8SA3rM6ckI",
    "t3YJ5hKiMQ0",
    "kCc8FmEb1nY",
    "zduSFxRajkE",
)
SUBTITLE_SUFFIXES = {".srt", ".vtt", ".srv1", ".srv2", ".srv3", ".ttml"}
NETWORK_MARKERS = (
    "timed out",
    "timeout",
    "connection refused",
    "connection reset",
    "connection error",
    "network is unreachable",
    "temporary failure in name resolution",
    "name or service not known",
    "unable to download webpage",
    "sign in to confirm",
    "not a bot",
    "http error 403",
    "http error 429",
    "http error 451",
    "proxy error",
    "tls",
    "certificate verify failed",
    "remote end closed connection",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_environment() -> dict[str, str]:
    """Avoid accidentally inheriting a browser credential or configured proxy."""
    env = os.environ.copy()
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ):
        env.pop(key, None)
    return env


def subtitle_files(video_dir: Path, video_id: str) -> list[str]:
    files = []
    for path in sorted(video_dir.glob(f"{video_id}.*")):
        if path.is_file() and path.suffix.lower() in SUBTITLE_SUFFIXES:
            files.append(path.name)
    return files


def metadata_files(video_dir: Path, video_id: str) -> list[str]:
    return sorted(
        path.name
        for path in video_dir.glob(f"{video_id}.info.json")
        if path.is_file()
    )


def command(video_id: str, output_root: Path, automatic: bool) -> list[str]:
    output_template = str(output_root / video_id / "%(id)s.%(ext)s")
    flags = [
        "/usr/bin/yt-dlp",
        "--ignore-config",
        "--no-cookies",
        "--no-cookies-from-browser",
        "--proxy",
        "",
        "--no-playlist",
        "--skip-download",
        "--write-info-json",
        "--sub-langs",
        "en.*",
        "--sub-format",
        "vtt/srt/best",
        "--socket-timeout",
        "60",
        "--retries",
        "0",
        "--extractor-retries",
        "1",
        "--no-overwrites",
        "--output",
        output_template,
    ]
    flags.append("--write-auto-subs" if automatic else "--write-subs")
    flags.extend(("--", f"https://www.youtube.com/watch?v={video_id}"))
    return flags


def output_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return str(value) if value else ""


def run_attempt(
    video_id: str, output_root: Path, automatic: bool, deadline: float
) -> dict:
    kind = "automatic" if automatic else "manual"
    remaining = max(0.1, deadline - time.monotonic())
    try:
        completed = subprocess.run(
            command(video_id, output_root, automatic),
            capture_output=True,
            text=True,
            timeout=remaining,
            env=clean_environment(),
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        output = "\n".join(
            part
            for part in (output_text(error.stdout), output_text(error.stderr))
            if part
        )

        return {
            "kind": kind,
            "returncode": None,
            "timed_out": True,
            "network_error": True,
            "detail": output[-2000:],
        }

    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    lowered = output.lower()
    network_error = completed.returncode != 0 and any(
        marker in lowered for marker in NETWORK_MARKERS
    )
    return {
        "kind": kind,
        "returncode": completed.returncode,
        "timed_out": False,
        "network_error": network_error,
        "detail": output[-2000:],
    }


def fetch_one(video_id: str, output_root: Path) -> dict:
    video_dir = output_root / video_id
    video_dir.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 60
    attempts = []

    manual_before = set(subtitle_files(video_dir, video_id))
    manual = run_attempt(video_id, output_root, automatic=False, deadline=deadline)
    attempts.append(manual)
    manual_after = set(subtitle_files(video_dir, video_id))
    manual_files = sorted(manual_after - manual_before) or sorted(manual_after)
    if manual_files:
        status = "downloaded_manual"
        source_kind = "manual"
        files = manual_files
    elif time.monotonic() < deadline:
        automatic_before = set(subtitle_files(video_dir, video_id))
        automatic = run_attempt(video_id, output_root, automatic=True, deadline=deadline)
        attempts.append(automatic)
        automatic_after = set(subtitle_files(video_dir, video_id))
        automatic_files = sorted(automatic_after - automatic_before) or sorted(
            automatic_after
        )
        if automatic_files:
            status = "downloaded_automatic"
            source_kind = "automatic"
            files = automatic_files
        elif any(attempt["timed_out"] for attempt in attempts) and not any(
            attempt["returncode"] == 0 for attempt in attempts
        ):
            status = "timeout"
            source_kind = None
            files = []
        elif all(
            attempt["returncode"] not in (0, None)
            and (attempt["network_error"] or attempt["timed_out"])
            for attempt in attempts
        ):
            status = "network_error"
            source_kind = None
            files = []
        elif any(attempt["returncode"] == 0 for attempt in attempts):
            status = "no_english_subtitles"
            source_kind = None
            files = []
        elif any(attempt["returncode"] not in (0, None) for attempt in attempts):
            status = "failed"
            source_kind = None
            files = []
        else:
            status = "info_only"
            source_kind = None
            files = []
    else:
        status = "timeout"
        source_kind = None
        files = []

    return {
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "checked_at": utc_now(),
        "status": status,
        "subtitle_source": source_kind,
        "files": files,
        "metadata_files": metadata_files(video_dir, video_id),
        "attempts": attempts,
    }


def is_network_probe_failure(record: dict) -> bool:
    return record["status"] in {"network_error", "timeout"}


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "video_ids",
        nargs="*",
        help="YouTube IDs; defaults to the eight IDs in Karpathy's official README",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=DEFAULT_OUTPUT_ROOT,
        help="Subtitle output directory",
    )
    parser.add_argument(
        "--probe-count",
        type=int,
        default=2,
        help="Network probes before the remaining IDs may be marked blocked",
    )
    args = parser.parse_args()
    video_ids = tuple(args.video_ids) or DEFAULT_VIDEO_IDS
    if args.probe_count < 0:
        parser.error("--probe-count must be non-negative")

    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    records = []
    probe_failures = 0
    gate_open = args.probe_count == 0
    for index, video_id in enumerate(video_ids):
        if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
            record = {
                "video_id": video_id,
                "checked_at": utc_now(),
                "status": "invalid_id",
                "subtitle_source": None,
                "files": [],
                "metadata_files": [],
                "attempts": [],
                "detail": "Not a plausible YouTube video ID; no request made.",
            }
        elif not gate_open and index >= args.probe_count and probe_failures >= args.probe_count:
            record = {
                "video_id": video_id,
                "video_url": f"https://www.youtube.com/watch?v={video_id}",
                "checked_at": utc_now(),
                "status": "blocked",
                "subtitle_source": None,
                "files": [],
                "metadata_files": metadata_files(output_root / video_id, video_id),
                "attempts": [],
                "detail": "Skipped after all network probes failed; YouTube was treated as blocked.",
            }
        else:
            record = fetch_one(video_id, output_root)
            if index < args.probe_count and is_network_probe_failure(record):
                probe_failures += 1
            if index + 1 >= args.probe_count and probe_failures < args.probe_count:
                gate_open = True
        write_json(output_root / video_id / "status.json", record)
        records.append(record)
        print(f"{video_id}: {record['status']}", file=sys.stderr)

    manifest = {
        "checked_at": utc_now(),
        "source": "https://raw.githubusercontent.com/karpathy/nn-zero-to-hero/master/README.md",
        "tool": "/usr/bin/yt-dlp",
        "policy": {
            "metadata": True,
            "english_subtitles_only": True,
            "manual_before_automatic": True,
            "video_download": False,
            "cookies_or_credentials": False,
            "per_video_timeout_seconds": 60,
            "network_probe_count": args.probe_count,
        },
        "records": records,
    }
    write_json(output_root / "manifest.json", manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Audit the 90-day Curriculum Calendar & Active-Time Ledger artifact."""
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRICULUM_DIR = ROOT / "curriculum"
MANIFEST_FILE = CURRICULUM_DIR / "manifest.json"
DAYS_DIR = CURRICULUM_DIR / "days"

VALID_STATUSES = {"planned", "available", "reviewed", "accepted"}
TARGET_CONTENT_DAYS = set(range(1, 91))
REQUIRED_AVAILABLE_DAYS = tuple(range(1, 91))
SUPPORTED_LANGUAGES = {"zh-Hans", "zh-Hant", "en", "ja"}
REVIEW_RECORDS = {
    CURRICULUM_DIR / "reviews" / "study-days-01-03.md",
    CURRICULUM_DIR / "reviews" / "study-days-04-06.md",
    CURRICULUM_DIR / "reviews" / "study-days-07-09.md",
    CURRICULUM_DIR / "reviews" / "study-days-73-75.md",
    CURRICULUM_DIR / "reviews" / "study-days-76-78.md",
    CURRICULUM_DIR / "reviews" / "study-days-67-69.md",
    CURRICULUM_DIR / "reviews" / "study-days-64-66.md",
    CURRICULUM_DIR / "reviews" / "study-days-70-72.md",
    CURRICULUM_DIR / "reviews" / "study-days-58-60.md",
    CURRICULUM_DIR / "reviews" / "study-days-55-57.md",
    CURRICULUM_DIR / "reviews" / "study-days-61-63.md",
    CURRICULUM_DIR / "reviews" / "study-days-52-54.md",
    CURRICULUM_DIR / "reviews" / "study-days-46-48.md",
    CURRICULUM_DIR / "reviews" / "study-days-49-51.md",
    CURRICULUM_DIR / "reviews" / "study-days-10-12.md",
    CURRICULUM_DIR / "reviews" / "functions-limits-days-16-18.md",
    CURRICULUM_DIR / "reviews" / "study-days-13-15.md",
    CURRICULUM_DIR / "reviews" / "study-days-19-21.md",
    CURRICULUM_DIR / "reviews" / "study-days-22-24.md",
    CURRICULUM_DIR / "reviews" / "study-days-25-27.md",
    CURRICULUM_DIR / "reviews" / "study-days-28-30.md",
    CURRICULUM_DIR / "reviews" / "study-days-34-36.md",
    CURRICULUM_DIR / "reviews" / "study-days-40-42.md",
    CURRICULUM_DIR / "reviews" / "study-days-43-45.md",
    CURRICULUM_DIR / "reviews" / "autograd-days-31-33.md",
    CURRICULUM_DIR / "reviews" / "study-days-37-39.md",
    CURRICULUM_DIR / "reviews" / "study-days-79-81.md",
    CURRICULUM_DIR / "reviews" / "study-days-82-84.md",
    CURRICULUM_DIR / "reviews" / "study-days-85-87.md",
    CURRICULUM_DIR / "reviews" / "study-days-88-90.md",
}
REQUIRED_CONTENT_FIELDS = {
    "title",
    "objective",
    "instructions",
    "exercise_prompt",
    "hint",
    "answer",
    "mastery_criterion",
}

def audit_ledger():
    errors = []

    if not MANIFEST_FILE.exists():
        errors.append("Manifest file missing: curriculum/manifest.json")
        return errors

    try:
        manifest = json.loads(MANIFEST_FILE.read_text())
    except Exception as e:
        errors.append(f"Cannot parse manifest: {e}")
        return errors

    # Check totals
    if manifest.get("total_days") != 90:
        errors.append(f"Expected 90 total_days, got {manifest.get('total_days')}")
    if manifest.get("total_active_minutes") != 43200:
        errors.append(f"Expected 43200 total_active_minutes, got {manifest.get('total_active_minutes')}")

    cat_mins = manifest.get("category_minutes", {})
    expected_cat_mins = {
        "self-directed-learning-and-python": 10800,
        "mathematics": 8640,
        "models-and-training": 17280,
        "agents": 6480
    }
    for cat, expected in expected_cat_mins.items():
        if cat_mins.get(cat) != expected:
            errors.append(f"Category {cat} minutes expected {expected}, got {cat_mins.get(cat)}")

    if sum(cat_mins.values()) != 43200:
        errors.append(f"Sum of category minutes ({sum(cat_mins.values())}) != 43200")

    # Check Lessons independence
    lessons = manifest.get("lessons", [])
    if not isinstance(lessons, list) or len(lessons) == 0:
        errors.append("Manifest lessons list missing or empty")
    for les in lessons:
        if les.get("status") not in VALID_STATUSES:
            errors.append(f"Invalid status in lesson {les.get('id')}: {les.get('status')}")

    # Check 30 blocks
    blocks = manifest.get("blocks", [])
    if len(blocks) != 30:
        errors.append(f"Expected 30 blocks, got {len(blocks)}")
    for b_idx, block in enumerate(blocks, 1):
        if block.get("block_number") != b_idx:
            errors.append(f"Block number mismatch: {block.get('block_number')} vs {b_idx}")
        if block.get("start_day") != (b_idx - 1) * 3 + 1:
            errors.append(f"Block {b_idx} start day mismatch")
        if block.get("end_day") != (b_idx - 1) * 3 + 3:
            errors.append(f"Block {b_idx} end day mismatch")
        ticket = block.get("ticket_number")
        if not (25 <= ticket <= 54):
            errors.append(f"Block {b_idx} ticket {ticket} outside 25..54 range")

    # Check days
    day_files = sorted(DAYS_DIR.glob("day-*.json"))
    if len(day_files) != 90:
        errors.append(f"Expected 90 day files in {DAYS_DIR}, got {len(day_files)}")

    day_ids = set()
    activity_ids = set()
    graph = defaultdict(list)
    cat_tallies = defaultdict(int)
    total_minutes = 0
    review_days_count = 0
    weekly_review_days = set(manifest.get("weekly_review_days") or [])

    for i in range(1, 91):
        day_id = f"day-{i:02d}"
        file_path = DAYS_DIR / f"{day_id}.json"
        if not file_path.exists():
            errors.append(f"Missing day file: {file_path}")
            continue

        try:
            day_data = json.loads(file_path.read_text())
        except Exception as e:
            errors.append(f"Failed to parse {day_id}: {e}")
            continue

        day_ids.add(day_id)
        if day_data.get("id") != day_id:
            errors.append(f"File {file_path} id mismatch: {day_data.get('id')} vs {day_id}")
        if day_data.get("day_number") != i:
            errors.append(f"{day_id} day_number mismatch: {day_data.get('day_number')} vs {i}")
        if day_data.get("active_minutes") != 480:
            errors.append(f"{day_id} active_minutes is {day_data.get('active_minutes')}, expected 480")

        status = day_data.get("status")
        if status not in VALID_STATUSES:
            errors.append(f"{day_id} has invalid status: {status}")
        if i in REQUIRED_AVAILABLE_DAYS:
            if status not in ("available", "reviewed", "accepted"):
                errors.append(f"Day {i:02d} status should be available/reviewed/accepted, got {status}")
        else:
            if status != "planned":
                errors.append(f"{day_id} status must be planned so unfinished content cannot appear ready")

        # is_review_day marks exactly the manifest's weekly review slots; any
        # drift between the flag and weekly_review_days makes the rendered
        # calendar badges disagree with the declared schedule.
        if day_data.get("is_review_day") != (i in weekly_review_days):
            errors.append(
                f"{day_id} is_review_day={day_data.get('is_review_day')} but "
                f"manifest.weekly_review_days membership is {i in weekly_review_days}"
            )
        if day_data.get("is_review_day"):
            review_days_count += 1

        # Prerequisites
        prereqs = day_data.get("prerequisites", [])
        graph[day_id] = prereqs

        # Target Study Days also have a complete four-language Language Edition.
        if i in TARGET_CONTENT_DAYS:
            content_dir = CURRICULUM_DIR / "content" / day_id
            if not content_dir.is_dir():
                errors.append(f"Missing localized content directory: {content_dir}")
            else:
                expected_activity_ids = {act.get("id") for act in day_data.get("activities", [])}
                for language in sorted(SUPPORTED_LANGUAGES):
                    content_file = content_dir / f"{language}.json"
                    if not content_file.exists():
                        errors.append(f"Missing {language} edition for {day_id}")
                        continue
                    try:
                        content = json.loads(content_file.read_text())
                    except Exception as e:
                        errors.append(f"Failed to parse {content_file}: {e}")
                        continue
                    if content.get("language") != language:
                        errors.append(f"{content_file} language field mismatch")
                    activities = content.get("activities", {})
                    if set(activities) != expected_activity_ids:
                        errors.append(f"{content_file} activity IDs do not match {day_id}")
                    for activity_id, activity in activities.items():
                        missing = REQUIRED_CONTENT_FIELDS - set(activity)
                        if missing:
                            errors.append(
                                f"{content_file} {activity_id} missing fields: {sorted(missing)}"
                            )

        # Activities check
        acts = day_data.get("activities", [])
        day_minutes = 0
        for act in acts:
            act_id = act.get("id")
            if not act_id:
                errors.append(f"{day_id} activity missing id")
                continue
            if act_id in activity_ids:
                errors.append(f"Duplicate activity id detected: {act_id}")
            activity_ids.add(act_id)

            mins = act.get("active_minutes", 0)
            day_minutes += mins
            cat = act.get("category") or day_data.get("topic_category")
            cat_tallies[cat] += mins

            if act.get("status") not in VALID_STATUSES:
                errors.append(f"Activity {act_id} has invalid status: {act.get('status')}")

        if day_minutes != 480:
            errors.append(f"{day_id} activities sum to {day_minutes}, expected 480")
        total_minutes += day_minutes

    if total_minutes != 43200:
        errors.append(f"Total calculated minutes is {total_minutes}, expected 43200")

    for review_record in REVIEW_RECORDS:
        if not review_record.exists():
            errors.append(f"Missing substantive review record: {review_record}")

    for cat, expected in expected_cat_mins.items():
        if cat_tallies[cat] != expected:
            errors.append(f"Category activity minutes mismatch for {cat}: got {cat_tallies[cat]}, expected {expected}")

    if review_days_count < 12:
        errors.append(f"Found only {review_days_count} review days; expected at least 12 weekly review days")

    # DAG check (Kahn's algorithm)
    in_degrees = dict.fromkeys(day_ids, 0)
    outgoing = defaultdict(list)
    for day_id, prereqs in graph.items():
        for p in prereqs:
            if isinstance(p, str) and p.startswith("day-"):
                if p not in day_ids:
                    errors.append(f"Dangling reference: {day_id} depends on non-existent {p}")
                else:
                    outgoing[p].append(day_id)
                    in_degrees[day_id] += 1

    queue = deque([d for d, deg in in_degrees.items() if deg == 0])
    visited = 0
    while queue:
        curr = queue.popleft()
        visited += 1
        for nxt in outgoing[curr]:
            in_degrees[nxt] -= 1
            if in_degrees[nxt] == 0:
                queue.append(nxt)

    if visited != len(day_ids):
        errors.append(f"Cycle detected in prerequisite DAG: visited {visited}/{len(day_ids)} nodes")

    return errors

def main():
    errors = audit_ledger()
    if errors:
        print(f"FAILED with {len(errors)} error(s):")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)
    else:
        print("PASS: Curriculum Calendar & Time Ledger audited successfully (90 days, 43,200 min, DAG valid, no cycles, no dangling refs).")
        sys.exit(0)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Render curriculum/sources/comparison-matrix.json as a Markdown review page.

Usage: python3 scripts/render_source_matrix.py [--check]
--check exits 1 if curriculum/reviews/source-quality-matrix.md is out of date.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "curriculum" / "sources" / "comparison-matrix.json"
OUT = ROOT / "curriculum" / "reviews" / "source-quality-matrix.md"
SHORT = {"pedagogical_quality": "Ped", "coverage": "Cov", "clarity": "Clr", "exercises": "Ex",
         "currency": "Cur", "accessibility": "Acc", "relevance": "Rel"}


def cell(text):
    return text.replace("|", "\\|").replace("\n", " ")


def render(m):
    lines = [
        "# Source quality matrix",
        "",
        f"Strict source-quality requirement: **{m['requirement_status']}**",
        "",
        f"Internal selection review: **{m['internal_review']['status']}**. "
        f"Assessed {m['assessed_on']} by {m['assessed_by']}.",
        "",
        f"Evidence: `{m['internal_review']['evidence']}`.",
        "",
        f"Independent subject-matter review: **{m['independent_review']['status']}**.",
        "",
        f"> {m['independent_review']['note']}",
        "",
        "Generated from `curriculum/sources/comparison-matrix.json` by `scripts/render_source_matrix.py`; "
        "edit the JSON, not this page.",
        "",
        "## Method",
        "",
        m["method"],
        "",
        "Scale: " + "; ".join(f"{k} = {v}" for k, v in m["scale"].items()) + ".",
        "",
        "| Column | Criterion | Question |",
        "|---|---|---|",
    ]
    for c in m["criteria"]:
        lines.append(f"| {SHORT[c]} | {c} | {cell(m['criteria_definitions'][c])} |")
    lines += ["", "## Licensing", "", m["licensing_policy"], ""]
    if m["internal_review"].get("remaining_gaps"):
        lines += ["## Internal review limitations", ""]
        lines += [f"- {gap}" for gap in m["internal_review"]["remaining_gaps"]]
        lines.append("")
    for b in m["blocks"]:
        first, last = b["days"]
        lines += [f"## {b['title']} (Days {first}-{last})", "",
                  "| Candidate | " + " | ".join(SHORT[c] for c in m["criteria"]) + " | License |",
                  "|---|" + "---|" * len(m["criteria"]) + "---|"]
        for c in b["candidates"]:
            mark = " (selected)" if set(c.get("registry_ids", [])) & set(b["selected"]) else ""
            scores = " | ".join(str(c["scores"][k]["score"]) for k in m["criteria"])
            lines.append(f"| [{cell(c['name'])}]({c['url']}){mark} | {scores} | {cell(c['license'])} |")
        lines += ["", f"**Selected:** {', '.join(f'`{s}`' for s in b['selected'])}"]
        if b.get("teaching_sources"):
            lines.append(f"<br>**Teaching:** {', '.join(f'`{s}`' for s in b['teaching_sources'])}")
        if b.get("definition_sources"):
            lines.append(f"<br>**Definition/API reference:** {', '.join(f'`{s}`' for s in b['definition_sources'])}")
        if b.get("supporting_sources"):
            lines.append(f"<br>**Also cited:** {', '.join(f'`{s}`' for s in b['supporting_sources'])}")
        lines += ["", f"**Rationale:** {b['selection_rationale']}", "", "<details><summary>Evidence notes</summary>", ""]
        for c in b["candidates"]:
            lines.append(f"- **{c['name']}**: licensing: {c['licensing_note']}")
            for k in m["criteria"]:
                e = c["scores"][k]
                lines.append(f"  - {k} {e['score']}: {e['evidence']}")
        lines += ["", "</details>", ""]
    return "\n".join(lines).rstrip() + "\n"


def main():
    text = render(json.loads(SRC.read_text(encoding="utf-8")))
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT.relative_to(ROOT)} is out of date; run scripts/render_source_matrix.py")
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

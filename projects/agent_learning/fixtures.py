from pathlib import Path

NOTES = {
    "alpha.txt": "Alpha is the first item.\n",
    "beta.txt": "Beta is the second item.\n",
}


def create_fixture(workspace: Path) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    notes = workspace / "notes"
    notes.mkdir(exist_ok=True)
    for name, content in NOTES.items():
        (notes / name).write_text(content, encoding="utf-8")


def expected_report() -> str:
    return "Alpha is the first item.\nBeta is the second item.\n"

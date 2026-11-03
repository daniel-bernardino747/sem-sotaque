# Copyright (C) 2026 DB Software Solutions LTDA
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Measure a rendered résumé against the page rules.

    python scripts/measure-resume.py <selection.json> <resume.pdf> [--json]

Reads the Selection and its PDF and reports:

- the page count and how far down the usable area (1cm margins) page 1 reaches
  — the target is 97–100% on exactly one page;
- for every group, its bullets and how many lines each takes — at least three
  bullets in an Experience group, none past three lines, at most two at three;
- orphans: a line whose last rendered line holds one or two words.

The lines are read with `pdftotext -layout`, which is how an ATS sees them;
pypdf is used only for the baseline.

Without `--json`, prints a human report and exits 1 when a rule is broken.
With `--json`, prints one JSON object on stdout (the shape `src/render/index.ts`
reads: pages, fill, groups, orphans, problems) and exits 0 whatever the
problems — a broken rule is data for the pipeline, not a failure to measure.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader

CM = 28.35
STACK_LABELS = ("Tech stack", "Techs & frameworks", "Tecnologias", "Built with")
EXPERIENCE = ("experience", "experiência")


def fill(pdf: Path) -> tuple[int, float]:
    reader = PdfReader(str(pdf))
    page = reader.pages[0]
    height = float(page.mediabox.height)
    baselines: list[float] = []

    def visit(text, cm, tm, _font, _size):
        if text.strip():
            baselines.append(tm[5] * cm[3] + cm[5])

    page.extract_text(visitor_text=visit)
    return len(reader.pages), 100 * (height - CM - min(baselines)) / (height - 2 * CM)


def bullets(pdf: Path) -> list[list[str]]:
    """Each bullet of the PDF, in order, as its rendered lines."""
    text = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
        capture_output=True, check=True,
    ).stdout.decode("utf-8")
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("•"):
            current = [line.lstrip("• ").strip()]
            blocks.append(current)
        elif current is not None and line and raw[:1].isspace():
            current.append(re.sub(r"\s{3,}", " ", line))
        else:
            current = None
    return blocks


def measure(selection: dict, pdf: Path) -> dict:
    pages, reach = fill(pdf)
    rendered = bullets(pdf)
    problems: list[str] = []
    orphans: list[dict] = []
    groups: list[dict] = []

    if pages != 1:
        problems.append(f"{pages} pages — the résumé is one page")
    elif reach < 97:
        problems.append(f"page filled to {reach:.1f}% — aim for 97–100%")

    entries = [
        entry
        for section in selection["sections"]
        for group in section["groups"]
        for entry in group.get("entries", [])
    ]
    if len(entries) != len(rendered):
        problems.append(
            f"{len(entries)} entries in the Selection but {len(rendered)} bullets in the PDF "
            "(page 2 is not read) — line counts may be off"
        )

    index = 0
    for section in selection["sections"]:
        for group in section["groups"]:
            name = (group.get("heading") or {}).get("organisation", section["title"])
            counts: list[int] = []
            for entry in group.get("entries", []):
                lines = rendered[index] if index < len(rendered) else []
                index += 1
                if lines and len(lines) > 1 and len(lines[-1].split()) <= 2:
                    orphans.append({"group": name, "source": entry["source"], "line": lines[-1]})
                    problems.append(f'{name}: orphan "{lines[-1]}" ({entry["source"]})')
                if entry.get("label") in STACK_LABELS:
                    continue
                counts.append(len(lines))
                if len(lines) > 3:
                    problems.append(f"{name}: a bullet takes {len(lines)} lines ({entry['source']})")
            if not counts:
                continue
            groups.append({"section": section["title"], "group": name, "lines": counts})
            three = sum(1 for n in counts if n == 3)
            if three > 2:
                problems.append(f"{name}: {three} bullets take three lines — at most two")
            if section["title"].lower() in EXPERIENCE and len(counts) < 3:
                problems.append(f"{name}: {len(counts)} bullet(s) — an Experience group holds at least three")

    return {
        "pages": pages,
        "fill": round(reach, 1),
        "groups": groups,
        "orphans": orphans,
        "problems": problems,
    }


def main() -> int:
    args = sys.argv[1:]
    as_json = "--json" in args
    paths = [arg for arg in args if arg != "--json"]
    if len(paths) != 2:
        print(__doc__)
        return 2
    selection_path, pdf = Path(paths[0]), Path(paths[1])
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    result = measure(selection, pdf)
    sys.stdout.reconfigure(encoding="utf-8")

    if as_json:
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0

    print(f"{pdf}: {result['pages']} page(s), page 1 filled to {result['fill']:.1f}%")
    for group in result["groups"]:
        print(f"  [{group['section']}] {group['group']}: {len(group['lines'])} bullet(s), lines {group['lines']}")
    for problem in result["problems"]:
        print(f"  ✗ {problem}")
    print("OK" if not result["problems"] else f"{len(result['problems'])} problem(s)")
    return 1 if result["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())

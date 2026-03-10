#!/usr/bin/env python3
"""
Create a numbered handover folder under .leftover with template context files.
"""

from __future__ import annotations

import argparse
from pathlib import Path

TEMPLATES = {
    "summary.md": """# Summary\nGoal:\nCurrent status:\nKey outcomes:\n\n# Key Context\n-\n""",
    "work_done.md": """# Work Done\n-\n\n# Notes\n-\n""",
    "decisions.md": """# Decisions\n- Decision:\n  Rationale:\n  Tradeoffs:\n""",
    "next_steps.md": """# Next Steps\n1.\n\n# Blockers / Open Questions\n-\n""",
    "commands.md": """# Commands\n- Command:\n  Purpose:\n  Notable output:\n""",
    "files_touched.md": """# Files Touched\n- Path:\n  Change:\n""",
}


def next_index(leftover_dir: Path) -> int:
    numeric = []
    for child in leftover_dir.iterdir():
        if child.is_dir() and child.name.isdigit():
            numeric.append(int(child.name))
    return max(numeric, default=0) + 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Initialize a .leftover/<n>/ handover package with template files."
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Root directory where .leftover/ should be created (default: current directory).",
    )
    parser.add_argument(
        "--index",
        type=int,
        default=None,
        help="Optional explicit folder number to create.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    leftover_dir = root / ".leftover"
    leftover_dir.mkdir(parents=True, exist_ok=True)

    index = args.index if args.index is not None else next_index(leftover_dir)
    target_dir = leftover_dir / str(index)

    if target_dir.exists():
        print(f"[ERROR] Target already exists: {target_dir}")
        return 1

    target_dir.mkdir()

    for filename, content in TEMPLATES.items():
        (target_dir / filename).write_text(content)

    print(f"[OK] Created handover package: {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

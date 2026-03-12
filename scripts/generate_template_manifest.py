#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = REPO_ROOT / "templates"
MANIFEST_PATH = TEMPLATES_DIR / "index.json"


def main() -> None:
    template_files = sorted(
        path.name
        for path in TEMPLATES_DIR.glob("*.json")
        if path.name != MANIFEST_PATH.name and path.is_file()
    )

    MANIFEST_PATH.write_text(json.dumps(template_files, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

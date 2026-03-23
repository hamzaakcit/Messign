#!/usr/bin/env python3
"""Convert .avif files in dora_references/ to .png for ComfyUI / Pillow workflows."""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import pillow_avif  # noqa: F401 — registers AVIF with Pillow when installed
except ImportError:
    pillow_avif = None  # type: ignore[assignment, misc]

from PIL import Image


def convert_to_png(folder_path: str | Path) -> None:
    folder = Path(folder_path)
    if not folder.is_dir():
        print(f"Not a folder: {folder}", file=sys.stderr)
        sys.exit(1)
    if pillow_avif is None:
        print(
            "Install: pip install pillow pillow-avif-plugin",
            file=sys.stderr,
        )
        sys.exit(1)

    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".avif":
            continue
        try:
            with Image.open(path) as img:
                rgb_img = img.convert("RGB")
                out_path = path.with_suffix(".png")
                rgb_img.save(out_path, "PNG")
                print(f"Converted: {path.name} -> {out_path.name}")
        except Exception as e:
            print(f"Failed to convert {path.name}: {e}", file=sys.stderr)


if __name__ == "__main__":
    default = Path(__file__).resolve().parent / "dora_references"
    target = sys.argv[1] if len(sys.argv) > 1 else str(default)
    convert_to_png(target)

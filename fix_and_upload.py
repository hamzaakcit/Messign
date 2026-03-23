#!/usr/bin/env python3
"""
Strateji 2 — sıfır hata: dora_references içindeki AVIF'leri PNG'ye çevir, AVIF'leri sil,
ardından generate_dora.py ile ComfyUI'a yükle ve kuyruğa al.

  pip install -r requirements-dora.txt
  python3 fix_and_upload.py
  python3 fix_and_upload.py "Dora over Istanbul at sunset"

Sadece dönüştürme (ComfyUI çağrısı yok):

  python3 fix_and_upload.py --sanitize-only
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent


def sanitize_dora_assets(folder: Path) -> int:
    """Tüm .avif dosyalarını .png yap ve orijinal .avif'leri sil. Dönüştürülen dosya sayısı."""
    try:
        import pillow_avif  # noqa: F401
    except ImportError:
        print(
            "Gerekli: pip install pillow pillow-avif-plugin",
            file=sys.stderr,
        )
        sys.exit(1)
    from PIL import Image

    count = 0
    if not folder.is_dir():
        print(f"Klasör yok: {folder}", file=sys.stderr)
        sys.exit(1)

    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".avif":
            continue
        out_path = path.with_suffix(".png")
        with Image.open(path) as img:
            img.convert("RGB").save(out_path, "PNG")
        path.unlink()
        print(f"Converted and removed AVIF: {path.name} -> {out_path.name}")
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AVIF -> PNG + sil, sonra ComfyUI generate_dora pipeline."
    )
    parser.add_argument(
        "--folder",
        type=Path,
        default=_SCRIPT_DIR / "dora_references",
        help="Referans klasörü (varsayılan: ./dora_references)",
    )
    parser.add_argument(
        "--sanitize-only",
        action="store_true",
        help="Sadece AVIF dönüştür/sil; ComfyUI çağırma",
    )
    parser.add_argument(
        "prompt",
        nargs="*",
        help="İsteğe bağlı pozitif prompt (generate_dora)",
    )
    args = parser.parse_args()

    folder = args.folder.resolve()
    n = sanitize_dora_assets(folder)
    if n == 0:
        print("No .avif files found (PNG/JPEG unchanged).")

    if args.sanitize_only:
        return

    # Script dizininde generate_dora.py olsun diye (cwd farklı olsa bile)
    if str(_SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(_SCRIPT_DIR))
    from generate_dora import run_dora_pipeline

    prompt = " ".join(args.prompt).strip() or None
    run_dora_pipeline(prompt)


if __name__ == "__main__":
    main()

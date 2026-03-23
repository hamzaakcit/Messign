"""
ComfyUI custom node package (no visible nodes).

Purpose: import pillow_avif at startup so PIL.Image.open() recognizes .avif
in Load Image and elsewhere.

Install in container (required):
  pip install pillow-avif-plugin

Deploy:
  Copy this folder next to your other custom nodes, e.g.
  /app/comfyui/custom_nodes/pillow_avif_bootstrap/

Restart ComfyUI after pip install + copy.
"""

from __future__ import annotations

import sys

try:
    import pillow_avif  # noqa: F401
except ImportError:
    print(
        "[pillow_avif_bootstrap] Missing package. Run: pip install pillow-avif-plugin",
        file=sys.stderr,
    )

NODE_CLASS_MAPPINGS: dict = {}

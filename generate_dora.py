#!/usr/bin/env python3
"""
ComfyUI: upload all images from dora_references/, patch workflow_api.json, queue /prompt.

Setup:
  pip install -r requirements-dora.txt
  cp workflow_api.example.json workflow_api.json   # then replace with your exported API graph
  Add only PNG or JPEG under dora_references/ (universal pipeline: convert .avif first — see dora_references/README.md)

Env (optional):
  COMFY_BASE_URL     default http://127.0.0.1:8188
  DORA_REF_DIR       default ./dora_references
  WORKFLOW_PATH      default ./workflow_api.json
  CLIP_POSITIVE_NODE default 6
  CLIP_NEGATIVE_NODE default 7 (set empty to skip)
  DORA_IMAGE_NODE_IDS  comma-separated LoadImage node ids, e.g. 10 or 10,11,12
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install dependencies: pip install -r requirements-dora.txt", file=sys.stderr)
    raise

# --- ComfyUI ---
COMFY_BASE_URL = os.environ.get("COMFY_BASE_URL", "http://127.0.0.1:8188").rstrip("/")

# --- Paths (relative to cwd or script dir) ---
_SCRIPT_DIR = Path(__file__).resolve().parent
DORA_REF_DIR = Path(os.environ.get("DORA_REF_DIR", _SCRIPT_DIR / "dora_references"))
WORKFLOW_PATH = Path(os.environ.get("WORKFLOW_PATH", _SCRIPT_DIR / "workflow_api.json"))

# --- Workflow node ids (string keys as in ComfyUI API export) ---
CLIP_POSITIVE_NODE = os.environ.get("CLIP_POSITIVE_NODE", "6")
CLIP_NEGATIVE_NODE = os.environ.get("CLIP_NEGATIVE_NODE", "7")
# One or more LoadImage (or similar) nodes: first uploaded file -> first id, etc.
DORA_IMAGE_NODE_IDS = [
    x.strip()
    for x in os.environ.get("DORA_IMAGE_NODE_IDS", "10").split(",")
    if x.strip()
]

# Brand-aligned defaults (override by editing or passing prompt to run_dora_pipeline)
DEFAULT_POSITIVE_PROMPT = (
    "Dora the red paper plane, folded origami structure, matte red paper texture, "
    "dark futuristic visor, glowing blue digital eyes, 3D render, high quality"
)
DEFAULT_NEGATIVE_PROMPT = (
    "(human, girl, person, lady:1.6), (face, skin, hair, hands:1.4), "
    "low quality, blurry, watermark, text"
)


def _prompt_dict(workflow: dict) -> dict:
    inner = workflow.get("prompt")
    if isinstance(inner, dict):
        return inner
    return workflow


def upload_reference_images(folder: Path) -> list[str]:
    """Upload only PNG/JPEG — formats ComfyUI Load Image handles reliably. Sorted order."""
    if not folder.is_dir():
        raise FileNotFoundError(f"Reference folder not found: {folder}")

    names: list[str] = []
    exts = {".png", ".jpg", ".jpeg"}
    files = sorted(
        p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in exts
    )
    if not files:
        raise FileNotFoundError(
            f"No PNG/JPEG in {folder}. Convert .avif first: "
            "python3 convert_refs.py or mogrify -format png dora_references/*.avif"
        )

    upload_url = f"{COMFY_BASE_URL}/upload/image"
    for path in files:
        suf = path.suffix.lower()
        mime = "image/png" if suf == ".png" else "image/jpeg"
        with path.open("rb") as f:
            resp = requests.post(
                upload_url,
                files={"image": (path.name, f, mime)},
                timeout=120,
            )
        resp.raise_for_status()
        data = resp.json()
        uploaded = data.get("name")
        if not uploaded:
            raise RuntimeError(f"Unexpected upload response: {data}")
        names.append(uploaded)

    return names


def patch_workflow(
    workflow: dict,
    *,
    refs: list[str],
    positive_prompt: str,
    negative_prompt: str | None = None,
) -> None:
    """Inject prompts and reference image filenames into API workflow dict."""
    p = _prompt_dict(workflow)

    if CLIP_POSITIVE_NODE in p:
        p[CLIP_POSITIVE_NODE]["inputs"]["text"] = positive_prompt

    if negative_prompt and CLIP_NEGATIVE_NODE and CLIP_NEGATIVE_NODE in p:
        p[CLIP_NEGATIVE_NODE]["inputs"]["text"] = negative_prompt

    for i, node_id in enumerate(DORA_IMAGE_NODE_IDS):
        if i >= len(refs):
            break
        if node_id not in p:
            raise KeyError(
                f"Node {node_id} not in workflow. Set DORA_IMAGE_NODE_IDS to match your graph."
            )
        p[node_id].setdefault("inputs", {})["image"] = refs[i]

    # If only one LoadImage node but many refs, keep primary = first; log the rest.
    if len(refs) > len(DORA_IMAGE_NODE_IDS):
        print(
            f"Note: {len(refs)} images uploaded but only {len(DORA_IMAGE_NODE_IDS)} "
            f"image node id(s) configured. Extra refs: {refs[len(DORA_IMAGE_NODE_IDS):]!r}",
            file=sys.stderr,
        )


def queue_prompt(workflow: dict) -> dict:
    """POST /prompt with `prompt` + client_id."""
    url = f"{COMFY_BASE_URL}/prompt"
    body = {
        "prompt": _prompt_dict(workflow),
        "client_id": str(uuid.uuid4()),
    }
    resp = requests.post(url, json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def run_dora_pipeline(prompt: str | None = None, *, negative_prompt: str | None = None) -> None:
    positive = prompt if prompt is not None else DEFAULT_POSITIVE_PROMPT
    negative = negative_prompt if negative_prompt is not None else DEFAULT_NEGATIVE_PROMPT

    refs = upload_reference_images(DORA_REF_DIR)
    print(f"Uploaded {len(refs)} reference image(s): {refs}")

    if not WORKFLOW_PATH.is_file():
        raise FileNotFoundError(
            f"Missing {WORKFLOW_PATH}. Export API format from ComfyUI or copy "
            f"workflow_api.example.json to workflow_api.json and edit."
        )

    with WORKFLOW_PATH.open(encoding="utf-8") as f:
        workflow = json.load(f)

    patch_workflow(workflow, refs=refs, positive_prompt=positive, negative_prompt=negative)

    out = queue_prompt(workflow)
    print(f"Queued. ComfyUI response: {out}")
    print(f"Dora pipeline started with {len(refs)} reference image(s).")


if __name__ == "__main__":
    user_prompt = " ".join(sys.argv[1:]).strip() or None
    run_dora_pipeline(user_prompt)

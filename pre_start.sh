#!/usr/bin/env bash
# Strateji 3 — RunPod / bulut sağlayıcı "startup" veya Docker ENTRYPOINT öncesi.
# ComfyUI ile aynı Python ortamında çalıştırın (ör. conda activate sonra ./pre_start.sh).

set -euo pipefail
pip install --no-cache-dir "pillow-avif-plugin>=1.4.0"

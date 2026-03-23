# Dora reference images

Place **3–5** images of the red paper-plane character (Dora) here.

## Formats for `generate_dora.py`

The automation script uploads **only** **`.png`**, **`.jpg`**, **`.jpeg`** (most stable with ComfyUI tensors).

If you have **AVIF** files:

```bash
# Option A — ImageMagick (if installed: brew install imagemagick)
mogrify -format png dora_references/*.avif

# Option B — Python (Pillow + pillow-avif-plugin)
python3 convert_refs.py
```

Suggested filenames (optional):

- `dora_front.png`
- `dora_side.png`
- `dora_top.png`

Then run `generate_dora.py` from the repo root (see script docstring).

**Tek adım (AVIF temizle + ComfyUI kuyruk):** `python3 fix_and_upload.py` — önce tüm `.avif` dosyalarını PNG yapıp siler, sonra `generate_dora` çalıştırır.

## Cloud ComfyUI (AVIF in the UI)

For loading `.avif` directly on the server, install `pillow-avif-plugin` permanently — see `requirements-comfyui-cloud.txt` and `scripts/comfyui-entrypoint.example.sh` in the repo root.

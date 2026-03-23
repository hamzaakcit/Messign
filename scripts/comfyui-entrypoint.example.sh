#!/usr/bin/env sh
# Kalıcı bulut kurulumu: imaj veya volume üzerindeki ComfyUI kökünde bu dosyayı
# entrypoint olarak kullanın (ör. Dockerfile CMD veya docker-compose command).
#
# Örnek Dockerfile son satırları:
#   COPY scripts/comfyui-entrypoint.example.sh /app/comfyui/entrypoint.sh
#   RUN chmod +x /app/comfyui/entrypoint.sh
#   WORKDIR /app/comfyui
#   CMD ["/app/comfyui/entrypoint.sh"]
#
# İsteğe bağlı: önce requirements-comfyui-extras.txt veya comfyui_container_pip_extras.txt

set -e
cd /app/comfyui 2>/dev/null || cd "$(dirname "$0")/.." || true

# Konteyner her açılışında AVIF desteği (sunucu tarafı Load Image için)
pip install --no-cache-dir "pillow-avif-plugin>=1.4.0" || true

exec python main.py --listen 0.0.0.0 --port "${COMFY_PORT:-8188}" "$@"

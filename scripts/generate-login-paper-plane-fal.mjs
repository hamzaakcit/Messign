/**
 * Builds `client/public/login/plane-base.png` for the login welcome panel.
 *
 * - **Fal (optional):** If `FAL_KEY` / `FAL_AI_API_KEY` / `FALAI_API_KEY` is set (e.g. in `server/.env`),
 *   calls Fal image generation, strips the white background, exports a **512×512** transparent PNG.
 * - **No key:** Renders a **crisp vector** paper plane as SVG → PNG at 512×512 (transparent, no white box).
 *
 * The UI always loads this single asset; run this script after changing Fal prompts or the fallback art.
 *
 * Usage (repo root): `npm run generate:login-plane`
 *
 * **Optional looping video (cinema left wing):** place compressed assets in `client/public/login/` as
 * `paperplane-loop.webm` and/or `paperplane-loop.mp4`. Generate offline (e.g. Fal video models or your
 * toolchain); **never** call Fal from the browser with API keys. If files are missing, the login page
 * falls back to `plane-base.png` + motion.
 *
 * Requires: `sharp` (root devDependency), `@fal-ai/client` (optional, from server or root node_modules).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'client/public/login');
const OUT_BASE = path.join(OUT_DIR, 'plane-base.png');

/** Display export — large enough to stay sharp on retina + scaled UI. */
const EXPORT_PX = 512;

const require = createRequire(import.meta.url);
const FAL_MODEL = process.env.FAL_IMAGE_MODEL?.trim() || 'fal-ai/flux/dev';

function getFalApiKey() {
  const k =
    process.env.FAL_KEY?.trim() ||
    process.env.FAL_AI_API_KEY?.trim() ||
    process.env.FALAI_API_KEY?.trim() ||
    '';
  return k.length > 0 ? k : undefined;
}

function loadServerEnv() {
  const envPath = path.join(ROOT, 'server/.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function removeNearWhitePng(input, threshold = 246) {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    return sharp(input).png().toBuffer();
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Vector fallback — transparent background only (no white plate). */
function buildFallbackSvgXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="wing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="55%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
    <linearGradient id="fold" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#s)" fill="none">
    <path d="M8 32 L56 12 L48 32 L56 52 Z" fill="url(#wing)" stroke="url(#fold)" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M8 32 L44 32" stroke="url(#fold)" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>
    <path d="M12 30 L50 14 L46 30 Z" fill="white" fill-opacity="0.22"/>
    <path d="M14 34 L46 34 L52 48 Z" fill="#0f172a" fill-opacity="0.12"/>
  </g>
</svg>`;
}

function resolveFalModule() {
  const candidates = [
    path.join(ROOT, 'node_modules/@fal-ai/client'),
    path.join(ROOT, 'server/node_modules/@fal-ai/client'),
  ];
  for (const p of candidates) {
    try {
      return require(p);
    } catch {
      /* not installed */
    }
  }
  return null;
}

async function fetchFalPngBuffer() {
  const key = getFalApiKey();
  if (!key) return null;

  const falMod = resolveFalModule();
  if (!falMod) {
    console.warn('[login-plane] @fal-ai/client not found — install deps or use vector fallback');
    return null;
  }
  const { fal } = falMod;
  fal.config({ credentials: key });

  const prompt =
    'Single blue origami paper airplane, folded craft paper, clean edges, soft studio light, ' +
    '3/4 view nose pointing right, centered, isolated on pure white background, product photo, ' +
    'sharp focus, high resolution, no text, no people, no hands';

  const negative =
    'text, watermark, logo, multiple objects, hands, face, cartoon, clipart, blurry, lowres, noise';

  const input = {
    prompt: prompt.slice(0, 4000),
    image_size: 'square_hd',
    num_images: 1,
    output_format: 'png',
    enable_safety_checker: true,
    negative_prompt: negative.slice(0, 2000),
  };

  console.log('[login-plane] Fal', FAL_MODEL, '…');
  const result = await fal.subscribe(FAL_MODEL, { input, logs: false });
  const url = result.data?.images?.[0]?.url;
  if (!url || typeof url !== 'string') {
    throw new Error('Fal returned no image URL');
  }
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Fal image download failed: ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

/**
 * Normalize to EXPORT_P×EXPORT_P transparent PNG for the SPA.
 */
async function toDisplayPng(buffer) {
  const trimmed = await removeNearWhitePng(buffer, 245);
  return sharp(trimmed)
    .ensureAlpha()
    .resize(EXPORT_PX, EXPORT_PX, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function fallbackVectorToPngBuffer() {
  const svg = buildFallbackSvgXml();
  return sharp(Buffer.from(svg, 'utf8')).resize(EXPORT_PX, EXPORT_PX).png().toBuffer();
}

async function main() {
  loadServerEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  /** @type {Buffer | undefined} */
  let display;
  let sourceLabel = 'vector';

  try {
    const raw = await fetchFalPngBuffer();
    if (raw) {
      display = await toDisplayPng(raw);
      sourceLabel = 'fal';
    }
  } catch (e) {
    console.warn('[login-plane] Fal failed:', e instanceof Error ? e.message : e);
  }

  if (!display) {
    console.log('[login-plane] Using built-in vector art (set FAL_KEY + run again for AI texture)');
    display = await fallbackVectorToPngBuffer();
  }

  await fs.promises.writeFile(OUT_BASE, display);
  console.log('[login-plane] Wrote', OUT_BASE, `(${EXPORT_PX}×${EXPORT_PX}, ${sourceLabel})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

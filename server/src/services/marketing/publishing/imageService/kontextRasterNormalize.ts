/**
 * Fal Kontext and Flux T2I often return PNG with an alpha channel. Browsers composite that over dark
 * marketing UIs as a near-black “empty” square. Flatten onto white and emit JPEG for predictable previews.
 */
import sharp from 'sharp';

/**
 * Converts Kontext raster bytes to opaque JPEG (flattens alpha when present).
 * Falls back to the original buffer if Sharp fails.
 */
export async function flattenKontextToOpaqueJpeg(buffer: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(buffer).metadata();
    const pipeline = meta.hasAlpha
      ? sharp(buffer).flatten({ background: { r: 255, g: 255, b: 255 } })
      : sharp(buffer);
    return await pipeline.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[kontextRasterNormalize] sharp pipeline failed, using raw buffer', msg);
    return buffer;
  }
}

/**
 * Instagram feed: Fal returns PNG (often RGBA). We must never upload alpha PNG for feed stills — transparent
 * pixels composite as black on dark marketing chrome. Uses multiple Sharp strategies and **never** falls
 * back to returning the raw buffer (unlike {@link flattenKontextToOpaqueJpeg}).
 */
export async function flattenInstagramFeedToOpaqueJpeg(buffer: Buffer): Promise<Buffer> {
  const attempts: Array<() => Promise<Buffer>> = [
    async () => {
      const meta = await sharp(buffer).metadata();
      let p = sharp(buffer).rotate();
      if (meta.hasAlpha) {
        p = p.flatten({ background: { r: 255, g: 255, b: 255 } });
      }
      return p.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    },
    async () =>
      sharp(buffer)
        .rotate()
        .ensureAlpha()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer(),
    async () =>
      sharp(buffer)
        .rotate()
        .toColorspace('srgb')
        .ensureAlpha()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer(),
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const out = await attempts[i]();
      if (out.length >= 2 && out[0] === 0xff && out[1] === 0xd8) {
        return out;
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[kontextRasterNormalize] instagram_feed flatten attempt ${i + 1} failed`, {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  throw new Error(
    `instagram_feed: could not convert Fal raster to opaque JPEG: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/**
 * Mean RGB brightness (0–255) on a small resize — detects Fal “black frame” outputs.
 * Measures the **original** raster (decode → resize → optional alpha flatten → sRGB `stats()`).
 * Do not re-encode to JPEG first; a lossy round-trip before stats can yield channel means of 0
 * for some Fal PNG/JPEG payloads while `getRasterDimensions` still reports a full grid (e.g. 1056²).
 */
export async function estimateRgbMeanLuminance(buffer: Buffer): Promise<number | null> {
  try {
    const meta = await sharp(buffer).metadata();
    let img = sharp(buffer).rotate().resize(128, 128, { fit: 'inside' });
    if (meta.hasAlpha) {
      img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
    }
    const stats = await img.toColorspace('srgb').stats();
    const ch = stats.channels;
    const n = Math.min(3, ch.length);
    if (n < 1) return null;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ch[i]!.mean;
    return sum / n;
  } catch {
    return null;
  }
}

/**
 * Decoded pixel dimensions for Fal / OpenAI quality checks.
 */
export async function getRasterDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

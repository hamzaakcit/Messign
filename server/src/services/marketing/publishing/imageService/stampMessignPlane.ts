/**
 * Places an attached logo file on a finished still.
 * The image model does not paint the brand. The file the shop uploaded is the mark.
 */

import sharp from 'sharp';

/**
 * Draws the logo in the top-right corner, on a small white plate.
 * A still under 64px on a side is returned unchanged.
 */
export async function stampBrandLogo(image: Buffer, logo: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) return image;

  const markW = Math.round(width * 0.32);
  const markH = Math.round(height * 0.16);
  const margin = Math.round(Math.min(width, height) * 0.04);
  const resized = await sharp(logo)
    .resize(markW, markH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();
  const rw = resizedMeta.width ?? markW;
  const rh = resizedMeta.height ?? markH;
  const platePad = Math.max(8, Math.round(rh * 0.18));
  const plateW = rw + platePad * 2;
  const plateH = rh + platePad * 2;
  const left = Math.max(0, width - margin - plateW);
  const top = Math.max(0, margin);
  const radius = Math.round(Math.min(plateW, plateH) * 0.18);
  const platePng = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" rx="${radius}" fill="white" fill-opacity="0.94"/></svg>`,
    ),
  )
    .png()
    .toBuffer();

  return sharp(image)
    .composite([
      { input: platePng, left, top },
      { input: resized, left: left + platePad, top: top + platePad },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

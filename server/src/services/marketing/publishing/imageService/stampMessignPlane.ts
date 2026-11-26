/**
 * Places the Messign name, its line, and an attached logo on a finished still.
 * The image model does not paint letters. These are set in Inter, so they stay sharp.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

function fontUrl(fileName: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const local = join(dir, 'fonts', fileName);
  if (!existsSync(local)) {
    throw new Error(`Missing font file ${fileName}`);
  }
  return pathToFileURL(local).href;
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The second line under Messign. The brand itself uses its tagline. Another Messign product uses that product's name.
 */
export function messignLockupSubtitle(product: string | null | undefined): string {
  const name = (product ?? '').trim();
  if (!name || name.toLocaleLowerCase('en') === 'messign') return 'The engagement platform';
  return name.slice(0, 42);
}

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

/**
 * Draws a sharp sign on the lower part of a Messign still: the logo file, the name Messign, and one short line.
 * A still under 64px on a side is returned unchanged.
 */
export async function stampMessignLockup(
  image: Buffer,
  input: { logo?: Buffer | null; subtitle?: string | null },
): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) return image;

  const short = Math.min(width, height);
  const titleSize = Math.max(28, Math.round(short * 0.072));
  const subtitle = (input.subtitle ?? '').trim();
  const subtitleSize = subtitle ? Math.max(16, Math.round(short * 0.028)) : 0;
  const gap = Math.round(titleSize * 0.18);
  const pad = Math.round(titleSize * 0.42);
  const logoBox = input.logo ? Math.round(titleSize * 1.15) : 0;
  const inner =
    (logoBox ? logoBox + gap : 0) + titleSize + (subtitleSize ? gap + subtitleSize : 0);
  const cardH = pad * 2 + inner;
  const cardW = Math.round(width * 0.86);
  const left = Math.max(0, Math.round((width - cardW) / 2));
  const top = Math.max(0, height - Math.round(short * 0.045) - cardH);
  const radius = Math.round(Math.min(cardW, cardH) * 0.08);
  const titleY = pad + (logoBox ? logoBox + gap : 0) + Math.round(titleSize * 0.82);
  const subtitleY = titleY + gap + Math.round(subtitleSize * 0.9);
  const semi = fontUrl('Inter-SemiBold.otf');
  const regular = fontUrl('Inter-Regular.otf');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
    <style>
      @font-face { font-family: 'MessignLock'; src: url('${semi}'); font-weight: 600; }
      @font-face { font-family: 'MessignLockText'; src: url('${regular}'); font-weight: 400; }
    </style>
    <rect width="${cardW}" height="${cardH}" rx="${radius}" fill="white"/>
    <text x="${Math.round(cardW / 2)}" y="${titleY}" text-anchor="middle" font-family="MessignLock" font-size="${titleSize}" font-weight="600" fill="#111111">Messign</text>
    ${
      subtitle
        ? `<text x="${Math.round(cardW / 2)}" y="${subtitleY}" text-anchor="middle" font-family="MessignLockText" font-size="${subtitleSize}" fill="#3a3a3a">${xmlText(subtitle)}</text>`
        : ''
    }
  </svg>`;
  let card = await sharp(Buffer.from(svg)).png().toBuffer();
  if (input.logo && logoBox > 0) {
    const logoPng = await sharp(input.logo)
      .resize(logoBox, logoBox, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoPng).metadata();
    const lw = logoMeta.width ?? logoBox;
    const lh = logoMeta.height ?? logoBox;
    card = await sharp(card)
      .composite([
        {
          input: logoPng,
          left: Math.max(0, Math.round((cardW - lw) / 2)),
          top: Math.max(0, pad + Math.round((logoBox - lh) / 2)),
        },
      ])
      .png()
      .toBuffer();
  }

  return sharp(image)
    .composite([{ input: card, left, top }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

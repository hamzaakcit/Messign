/**
 * Renders assets/branding/dora-pilot-logo.svg to a 1024×1024 transparent PNG
 * for ComfyUI / influencer reference use. Run from repo root: npm run render:dora-logo
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'assets/branding/dora-pilot-logo.svg');
const outPath = path.join(root, 'assets/branding/dora-pilot-logo.png');

const SIZE = 1024;

const svg = fs.readFileSync(svgPath);

await sharp(svg, { density: 300 })
  .resize(SIZE, SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    position: 'center',
  })
  .png()
  .toFile(outPath);

console.log(`Wrote ${outPath} (${SIZE}×${SIZE}, transparent)`);

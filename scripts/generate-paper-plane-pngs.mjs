/**
 * One-off rasterizer: builds static SVGs (theme-tinted paper plane) and writes PNGs
 * to client/public/marketing/overlay/paper-plane/*.png
 * Run from repo root: node scripts/generate-paper-plane-pngs.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../client/public/marketing/overlay/paper-plane');

const THEMES = {
  executive: {
    paper: '#E2E8F0',
    paperLight: '#F8FAFC',
    paperDark: '#CBD5E1',
    foldLine: '#94A3B8',
    accent: '#2563EB',
    shadow: '#64748B',
  },
  startup: {
    paper: '#E0E7FF',
    paperLight: '#EEF2FF',
    paperDark: '#C7D2FE',
    foldLine: '#A5B4FC',
    accent: '#6366F1',
    shadow: '#7C85F5',
  },
  luxury: {
    paper: '#FEF3C7',
    paperLight: '#FFFBEB',
    paperDark: '#F3E3A4',
    foldLine: '#D6C9A8',
    accent: '#B8860B',
    shadow: '#A07808',
  },
  minimal: {
    paper: '#F3F4F6',
    paperLight: '#FFFFFF',
    paperDark: '#E5E7EB',
    foldLine: '#D1D5DB',
    accent: '#9CA3AF',
    shadow: '#9CA3AF',
  },
  bold: {
    paper: '#FEE2E2',
    paperLight: '#FFFFFF',
    paperDark: '#FECACA',
    foldLine: '#FCA5A5',
    accent: '#DC2626',
    shadow: '#B91C1C',
  },
  nature: {
    paper: '#ECFCCB',
    paperLight: '#F7FEE7',
    paperDark: '#D9F99D',
    foldLine: '#BBF7D0',
    accent: '#16A34A',
    shadow: '#15803D',
  },
  tech: {
    paper: '#EDE9FE',
    paperLight: '#F5F3FF',
    paperDark: '#DDD6FE',
    foldLine: '#C4B5FD',
    accent: '#A855F7',
    shadow: '#7C3AED',
  },
  warm: {
    paper: '#FEF3C7',
    paperLight: '#FFFBEB',
    paperDark: '#FDE68A',
    foldLine: '#FDBA74',
    accent: '#D97706',
    shadow: '#B45309',
  },
};

function buildStaticSvg(theme, c) {
  const id = `pp-${theme}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">
<defs>
  <linearGradient id="${id}-wto" x1="0%" y1="15%" x2="95%" y2="85%">
    <stop offset="0%" stop-color="${c.paperLight}"/>
    <stop offset="35%" stop-color="${c.paper}"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="${id}-wti" x1="0%" y1="40%" x2="80%" y2="60%">
    <stop offset="0%" stop-color="${c.paper}" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.65"/>
  </linearGradient>
  <linearGradient id="${id}-wbo" x1="10%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${c.paperDark}" stop-opacity="0.6"/>
    <stop offset="50%" stop-color="${c.shadow}" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="${c.foldLine}" stop-opacity="0.3"/>
  </linearGradient>
  <linearGradient id="${id}-wbi" x1="0%" y1="60%" x2="80%" y2="40%">
    <stop offset="0%" stop-color="${c.shadow}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${c.paperDark}" stop-opacity="0.5"/>
  </linearGradient>
  <linearGradient id="${id}-nose" x1="0%" y1="50%" x2="100%" y2="50%">
    <stop offset="0%" stop-color="${c.paperLight}"/>
    <stop offset="100%" stop-color="${c.paper}" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="${id}-ao" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="${c.shadow}" stop-opacity="0.3"/>
    <stop offset="50%" stop-color="${c.shadow}" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="${c.shadow}" stop-opacity="0.25"/>
  </linearGradient>
  <linearGradient id="${id}-spec" x1="5%" y1="0%" x2="50%" y2="100%">
    <stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
    <stop offset="30%" stop-color="#fff" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="${id}-edge" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.04"/>
  </linearGradient>
  <filter id="${id}-sh" x="-12%" y="-12%" width="135%" height="145%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="blr"/>
    <feOffset in="blr" dx="2" dy="4" result="off"/>
    <feFlood flood-color="#000" flood-opacity="0.2" result="clr"/>
    <feComposite in="clr" in2="off" operator="in" result="shadow"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<g filter="url(#${id}-sh)" transform="translate(12,24)">
  <g>
    <g transform="translate(0,0)">
      <polygon points="18,128 450,35 300,124" fill="url(#${id}-wto)" stroke="${c.foldLine}" stroke-width="0.5" stroke-linejoin="round"/>
      <polygon points="18,128 300,128 450,35" fill="url(#${id}-wti)" opacity="0.5" stroke="none"/>
      <polygon points="18,128 300,128 450,35" fill="url(#${id}-spec)" opacity="0.55"/>
      <polygon points="410,58 450,35 450,65 430,82" fill="${c.paperLight}" opacity="0.3" stroke="${c.foldLine}" stroke-width="0.2"/>
      <polygon points="340,85 380,68 300,125" fill="${c.paperLight}" opacity="0.08"/>
    </g>
    <g transform="translate(0,0)">
      <polygon points="18,138 300,138 450,225" fill="url(#${id}-wbo)" stroke="${c.foldLine}" stroke-width="0.5" stroke-linejoin="round"/>
      <polygon points="18,138 300,142 450,225" fill="url(#${id}-wbi)" opacity="0.4" stroke="none"/>
      <polygon points="410,200 450,225 450,195 430,178" fill="${c.paper}" opacity="0.18" stroke="${c.foldLine}" stroke-width="0.2"/>
      <polygon points="340,175 380,192 300,140" fill="${c.shadow}" opacity="0.06"/>
    </g>
    <polygon points="18,125 55,125 55,140 18,140" fill="url(#${id}-nose)" stroke="none"/>
    <polygon points="18,122 28,116 28,150 18,144" fill="${c.paperLight}" opacity="0.45"/>
    <polygon points="28,116 18,122 18,133 28,133" fill="${c.paperLight}" opacity="0.6"/>
    <polygon points="28,150 18,144 18,138 28,138" fill="${c.paper}" opacity="0.3"/>
  </g>
  <rect x="18" y="126" width="432" height="12" fill="url(#${id}-ao)" rx="1" opacity="0.65"/>
  <line x1="18" y1="132" x2="450" y2="132" stroke="${c.foldLine}" stroke-width="1.5" opacity="0.5"/>
  <line x1="18" y1="132" x2="300" y2="132" stroke="${c.accent}" stroke-width="1" opacity="0.25"/>
  <line x1="18" y1="128" x2="450" y2="35" stroke="${c.paperLight}" stroke-width="0.6" opacity="0.18"/>
  <line x1="18" y1="138" x2="450" y2="225" stroke="${c.foldLine}" stroke-width="0.6" opacity="0.1"/>
  <line x1="160" y1="80" x2="300" y2="127" stroke="${c.foldLine}" stroke-width="0.4" opacity="0.1"/>
  <line x1="300" y1="80" x2="300" y2="127" stroke="${c.foldLine}" stroke-width="0.3" opacity="0.06"/>
  <line x1="160" y1="180" x2="300" y2="139" stroke="${c.foldLine}" stroke-width="0.3" opacity="0.07"/>
  <line x1="300" y1="180" x2="300" y2="139" stroke="${c.foldLine}" stroke-width="0.2" opacity="0.04"/>
  <line x1="18" y1="128" x2="450" y2="35" stroke="url(#${id}-edge)" stroke-width="1.2"/>
  <line x1="18" y1="138" x2="450" y2="225" stroke="url(#${id}-edge)" stroke-width="0.8"/>
</g>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const theme of Object.keys(THEMES)) {
    const c = THEMES[theme];
    const svg = buildStaticSvg(theme, c);
    const outPath = path.join(OUT_DIR, `${theme}.png`);
    await sharp(Buffer.from(svg, 'utf8'))
      .resize(192, 120, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log('Wrote', outPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Headless Playwright script that mounts the DoraPilot3D canvas and saves
 * high-resolution PNG exports suitable for email hero images and Instagram.
 *
 * Usage (from repo root):
 *   npx playwright test scripts/export-dora-3d.mjs
 *
 * Or run directly if @playwright/test is available:
 *   node scripts/export-dora-3d.mjs
 *
 * Prerequisites: the client dev server must be running (`npm run dev:client`).
 * The script navigates to a lightweight page that mounts the 3D canvas.
 */
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'client', 'public', 'branding');

const DEV_URL = process.env.DEV_URL || 'http://localhost:5173';
const SIZES = [
  { name: 'square', w: 1080, h: 1080 },
  { name: 'portrait', w: 1080, h: 1350 },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const { name, w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });

    const html = `
      <!DOCTYPE html>
      <html><head>
        <style>body{margin:0;background:transparent;overflow:hidden}</style>
      </head><body>
        <div id="root" style="width:${w}px;height:${h}px"></div>
        <script type="module">
          import React from '${DEV_URL}/node_modules/.vite/deps/react.js';
          import ReactDOM from '${DEV_URL}/node_modules/.vite/deps/react-dom_client.js';
          // Dynamic import so Vite HMR resolves modules
          const { DoraPilot3D } = await import('${DEV_URL}/src/components/dora/pilot/DoraPilot3D.tsx');
          const root = ReactDOM.createRoot(document.getElementById('root'));
          root.render(React.createElement(DoraPilot3D, { width: ${w}, height: ${h} }));
          // Signal readiness after the first frame renders
          setTimeout(() => { window.__DORA_READY = true; }, 3000);
        <\/script>
      </body></html>`;

    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__DORA_READY === true, { timeout: 15000 });

    const canvas = page.locator('canvas');
    const buffer = await canvas.screenshot({ type: 'png', omitBackground: true });
    const outPath = path.join(outDir, `dora-pilot-3d-${name}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Wrote ${outPath} (${w}×${h})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { defineConfig, devices } from '@playwright/test';

/**
 * UX-09: smoke test for the marketing screens, with the API mocked. It needs only the Vite client (no server, no
 * database, no login), so it runs the same on a laptop and in CI.
 *
 *   npx playwright test -c playwright.marketing.config.ts
 */
export default defineConfig({
  testDir: './e2e-marketing',
  timeout: 60_000,
  // The dev client compiles each screen on first use, which can take several seconds.
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3300',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --port 3300 --strictPort',
    cwd: 'client',
    url: 'http://localhost:3300',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { VITE_PRODUCT_SURFACE: 'workspace' },
  },
});

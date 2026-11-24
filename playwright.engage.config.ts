import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the engage surface (WP-19): their own stack beside the usual dev servers, so neither the running
 * app nor its database is touched.
 *
 *   ENGAGE_E2E_ADMIN_URL=postgresql://me@localhost:5544/engagee2e?host=/tmp/pgs npx playwright test -c playwright.engage.config.ts
 *
 * ENGAGE_E2E_ADMIN_URL: a throwaway local database (migrated and seeded on every run). API on 3201 (engage surface,
 * SEND_MODE sandbox, mock email account), client on 3200 (VITE_PRODUCT_SURFACE=engage). All secrets here are test
 * values generated for this run.
 */
const adminUrl = process.env.ENGAGE_E2E_ADMIN_URL ?? '';
const seedFile = 'e2e-engage/.auth/seed.json';
const engageUrl = (() => {
  if (!adminUrl) return '';
  const u = new URL(adminUrl);
  u.username = 'messign_engage';
  u.password = 'engage-test-only';
  return u.toString();
})();
const testSecret = (label: string) => `e2e-${label}-not-a-real-secret-0123456789abcdef`;

export default defineConfig({
  testDir: './e2e-engage',
  timeout: 60_000,
  // The dev client compiles each screen on first use, which can take several seconds.
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3200',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Seed first (migrations, tenant, simulated carts), then the API.
      command: 'npx tsx src/scripts/engageE2eSeed.ts && npx tsx src/index.ts',
      cwd: 'server',
      url: 'http://127.0.0.1:3201/api/health',
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        ENGAGE_E2E_ADMIN_URL: adminUrl,
        ENGAGE_E2E_SEED_FILE: `../${seedFile}`,
        PORT: '3201',
        NODE_ENV: 'development',
        PRODUCT_SURFACE: 'engage',
        DATABASE_URL: adminUrl,
        DATABASE_PUBLIC_URL: '',
        PGBOUNCER_URL: '',
        ENGAGE_DATABASE_URL: engageUrl,
        ENABLE_PG_BOSS: 'false',
        SEND_MODE: 'sandbox',
        JWT_SECRET: testSecret('jwt'),
        JWT_REFRESH_SECRET: testSecret('refresh'),
        ENGAGE_MASTER_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
        ENGAGE_MASTER_KEY_ID: 'e2e',
        ENGAGE_PUBLIC_APP_URL: 'https://app.example.com',
        ENGAGE_PUBLIC_API_URL: 'https://api.example.com',
        REDIS_URL: '',
      },
    },
    {
      command: 'npx vite --port 3200 --strictPort',
      cwd: 'client',
      url: 'http://localhost:3200',
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_PRODUCT_SURFACE: 'engage', DEV_API_PROXY_TARGET: 'http://127.0.0.1:3201' },
    },
  ],
});

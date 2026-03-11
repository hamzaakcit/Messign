import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'alex.chen@messign.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '030319941.Aa';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@messign.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
}

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@messign.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 15000 });
  await expect(page.locator('text=Dashboard').or(page.locator('text=Executive')).first()).toBeVisible({ timeout: 10000 });
});

test('logout flow', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

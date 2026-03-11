import { Page, expect } from '@playwright/test';

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'alex.chen@messign.com';
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '030319941.Aa';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@messign.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 15000 });
}

import { Page, expect } from '@playwright/test';

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'alex.chen@messign.com';
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'test123';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(TEST_EMAIL);
  await page.getByTestId('login-password').fill(TEST_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 15000 });
}

import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@messign.com').fill(process.env.E2E_TEST_EMAIL || 'alex.chen@messign.com');
  await page.getByPlaceholder('Enter your password').fill(process.env.E2E_TEST_PASSWORD || '030319941.Aa');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 20000 });
  // Dismiss onboarding overlay so it doesn't block subsequent tests or cause a11y failures
  await page.waitForLoadState('networkidle');
  const skipBtn = page.getByRole('button', { name: 'Skip' });
  try {
    await skipBtn.click({ timeout: 3000 });
  } catch {
    // Onboarding may already be dismissed
  }
  // Ensure onboarding is skipped for all tests using this storage state
  await page.evaluate(() => localStorage.setItem('onboarding_completed', 'true'));
  await page.context().storageState({ path: authFile });
});

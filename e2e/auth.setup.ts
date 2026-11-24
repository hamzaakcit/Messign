import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup.setTimeout(60_000);
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  // The login form is on screen while dev sign-in runs. Use it when it is still there.
  const email = page.getByTestId('login-email');
  const signedIn = page.waitForURL(/\/(dashboard|executive)?$/, { timeout: 25000 }).then(() => 'in' as const);
  const form = email.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'form' as const);
  const which = await Promise.race([signedIn, form]).catch(() => 'form' as const);
  if (which === 'form') {
    const emailBox = page.getByTestId('login-email');
    if (await emailBox.isVisible().catch(() => false)) {
      await emailBox.fill(process.env.E2E_TEST_EMAIL || 'alex.chen@messign.com').catch(() => undefined);
      await page.getByTestId('login-password').fill(process.env.E2E_TEST_PASSWORD || 'test123').catch(() => undefined);
      const submit = page.getByTestId('login-submit');
      if (await submit.isEnabled().catch(() => false)) {
        await submit.click().catch(() => undefined);
      }
    }
    await expect(page).toHaveURL(/\/(dashboard|executive)?$/, { timeout: 20000 });
  }
  const skipBtn = page.getByRole('button', { name: 'Skip' });
  try {
    await skipBtn.click({ timeout: 3000 });
  } catch {
    // Onboarding may already be dismissed
  }
  await page.evaluate(() => localStorage.setItem('onboarding_completed', 'true'));
  await page.context().storageState({ path: authFile });
});

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/executive');
    await expect(page).toHaveURL(/\/(dashboard|executive)/);
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.getByTestId('nav-finance').click();
    await expect(page).toHaveURL(/\/finance/);

    await page.getByTestId('nav-crm').click();
    await expect(page).toHaveURL(/\/crm/);

    await page.getByTestId('nav-support').click();
    await expect(page).toHaveURL(/\/support/);

    await page.getByTestId('onboarding-dora-nav').click();
    await expect(page).toHaveURL(/\/dora/);

    await page.getByTestId('nav-time').click();
    await expect(page).toHaveURL(/\/time/);
  });

  test('Cmd+K search opens and navigates', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const searchInput = page.getByTestId('command-surface-input');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('dora');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dora/, { timeout: 5000 });
  });

  test('Floating timer widget is visible', async ({ page }) => {
    await page.goto('/time');
    await expect(page).toHaveURL(/\/time/);
    await expect(page.getByTestId('timer-start')).toBeVisible({ timeout: 10000 });
  });
});

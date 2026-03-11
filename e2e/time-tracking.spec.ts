import { test, expect } from '@playwright/test';

test.describe('Time tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/time');
  });

  test('timer widget is visible on time page', async ({ page }) => {
    await expect(page).toHaveURL(/\/time/);
    await expect(page.getByTestId('timer-start')).toBeVisible({ timeout: 15000 });
  });
});

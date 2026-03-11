import { test, expect } from '@playwright/test';

test.describe('Executive dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/executive');
  });

  test('admin sees KPIs, chart, activity feed', async ({ page }) => {
    await expect(page).toHaveURL(/\/executive/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('executive-kpis')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('executive-chart')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('executive-activity')).toBeVisible({ timeout: 10000 });
  });
});

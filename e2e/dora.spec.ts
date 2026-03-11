import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Dora', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('navigate to Dora, type query, send, verify response', async ({ page }) => {
    await page.goto('/dora');
    await expect(page).toHaveURL(/\/dora/);

    await page.getByTestId('dora-input').fill('What is Messign?');
    await page.getByTestId('dora-send').click();

    await expect(page.locator('[data-testid="dora-input"], [role="textbox"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/Messign|messign|response|answer/i').first()).toBeVisible({ timeout: 30000 });
  });
});

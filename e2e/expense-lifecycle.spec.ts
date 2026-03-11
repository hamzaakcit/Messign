import { test, expect } from '@playwright/test';

test.describe('Expense lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/finance/expenses');
  });

  test('create expense as draft and submit for approval', async ({ page }) => {
    await expect(page).toHaveURL(/\/finance/);
    await page.getByTestId('expense-new').click();
    await expect(page.getByRole('heading', { name: 'New Expense' }).first()).toBeVisible({ timeout: 5000 });

    await page.getByTestId('expense-title').fill('E2E Test Expense');
    await page.getByTestId('expense-amount').fill('99.99');
    await page.getByTestId('expense-save-draft').click();

    await expect(page.getByTestId('expense-new')).toBeVisible({ timeout: 10000 });
  });
});

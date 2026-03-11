import { test, expect } from '@playwright/test';

test.describe('Ticket lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/support');
  });

  test('create ticket and verify in list', async ({ page }) => {
    await expect(page).toHaveURL(/\/support/);

    await page.getByTestId('support-new-ticket').click();
    await expect(page.getByTestId('ticket-subject')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('ticket-subject').fill('E2E Test Ticket');
    await page.locator('input[name="reporterEmail"]').fill('alex.chen@messign.com');
    await page.getByRole('button', { name: 'Create Ticket' }).click();

    await expect(page.getByTestId('support-new-ticket')).toBeVisible({ timeout: 10000 });
  });
});

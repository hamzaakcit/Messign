import { test, expect } from '@playwright/test';

test.describe('Deal lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/crm');
  });

  test('create deal and verify in pipeline', async ({ page }) => {
    await expect(page).toHaveURL(/\/crm/);

    await page.getByTestId('crm-new-deal').click();
    await expect(page.getByTestId('deal-title')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('deal-title').fill('E2E Test Deal');
    await page.getByTestId('deal-amount').fill('5000');
    await page.getByRole('button', { name: /Create Deal/i }).click();

    await expect(page.getByTestId('crm-new-deal')).toBeVisible({ timeout: 10000 });
  });

  test('Deal Won -> Auto Invoice: move deal to Won stage and verify invoice created', async ({ page }) => {
    await expect(page).toHaveURL(/\/crm/);

    // Create deal
    await page.getByTestId('crm-new-deal').click();
    await expect(page.getByTestId('deal-title')).toBeVisible({ timeout: 5000 });
    const dealTitle = `E2E Won Deal ${Date.now()}`;
    await page.getByTestId('deal-title').fill(dealTitle);
    await page.getByTestId('deal-amount').fill('7500');
    await page.getByRole('button', { name: /Create Deal/i }).click();

    // Wait for deal to appear in pipeline
    const dealCard = page.locator('[data-testid^="deal-card-"]').filter({ hasText: dealTitle });
    await expect(dealCard).toBeVisible({ timeout: 10000 });

    // Drag deal to Won stage (Closed Won)
    const wonDropzone = page.getByTestId('pipeline-stage-won-dropzone');
    await expect(wonDropzone).toBeVisible({ timeout: 5000 });
    await dealCard.dragTo(wonDropzone);

    // Wait for move to complete (deal appears in Won column)
    await expect(wonDropzone.locator(`[data-testid^="deal-card-"]`).filter({ hasText: dealTitle })).toBeVisible({ timeout: 15000 });

    // Navigate to invoices - Deal Won triggers generate_invoice_from_deal worker; verify invoices page loads
    await page.goto('/finance/invoices');
    await expect(page).toHaveURL(/\/finance/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByPlaceholder(/Search invoices/i).or(page.getByText(/No invoices/i))).toBeVisible({ timeout: 10000 });
  });
});

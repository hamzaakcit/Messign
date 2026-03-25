import { test, expect } from '@playwright/test';

test.describe('Recruitment lifecycle', () => {
  test('candidates page shows tenant KPI labels', async ({ page }) => {
    await page.goto('/recruitment/candidates');
    await expect(page.getByText(/candidate pool/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/with resume/i)).toBeVisible({ timeout: 5000 });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/recruitment/pipeline');
  });

  test('pipeline loads and shows stages', async ({ page }) => {
    await expect(page).toHaveURL(/\/recruitment/);

    // Pipeline stages should be visible
    await expect(page.getByTestId('recruitment-stage-hired')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('recruitment-stage-offer')).toBeVisible({ timeout: 5000 });
  });

  test('Hired -> Auto HR Record: move application from Offer to Hired and verify employee created', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/\/recruitment/);

    // Wait for pipeline to load (may show "No open jobs" or jobs)
    await page.waitForLoadState('networkidle');

    // Find application in Offer stage (E2E Candidate from seed)
    const offerStage = page.getByTestId('recruitment-stage-offer');
    const applicationCard = offerStage.locator('[data-testid^="application-card-"]').filter({ hasText: 'E2E' });

    // Skip if no applications in offer (e.g. seed not run)
    const count = await applicationCard.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const hiredDropzone = page.getByTestId('recruitment-stage-hired');
    await expect(hiredDropzone).toBeVisible({ timeout: 5000 });

    await applicationCard.first().dragTo(hiredDropzone);

    // Wait for move to complete - application appears in Hired column
    await expect(
      hiredDropzone.locator('[data-testid^="application-card-"]').filter({ hasText: 'E2E' })
    ).toBeVisible({ timeout: 15000 });

    // Verify HR record: new employee appears in Team Directory (createEmployeeFromHire inserts into reimbursement_users + performance_team_members)
    await page.goto('/team');
    await expect(page).toHaveURL(/\/team/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/E2E Candidate|E2E/)).toBeVisible({ timeout: 10000 });
  });
});

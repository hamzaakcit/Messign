import { readFileSync } from 'fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * WP-20 acceptance, in a browser, on the Lucy page: a journey is created and activated entirely in the UI. A tenant admin
 * writes a template, builds a segment and counts it, builds an event-triggered journey in the form (wait, then the email),
 * saves it as a draft, approves it and activates it, and the journey list shows it running. Every step happens in a
 * section or a panel of the same page.
 */
interface Seed { email: string; password: string }
const seed = (): Seed => JSON.parse(readFileSync('e2e-engage/.auth/seed.json', 'utf8')) as Seed;
const suffix = Date.now().toString(36);

async function signIn(page: Page): Promise<void> {
  const s = seed();
  await page.goto('/login');
  await page.getByTestId('login-email').fill(s.email);
  await page.getByTestId('login-password').fill(s.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/marketing$/, { timeout: 30_000 });
}

/** The panel over the Lucy page. */
const panel = (page: Page) => page.getByTestId('hub-panel');

/** Closes the panel, as a person would (Escape). */
async function closePanel(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
}

test('create a template, a segment and a journey in the UI, then approve and activate the journey', async ({ page }) => {
  await signIn(page);

  // Template, in a panel over the page.
  await page.getByTestId('hub-tab-templates').click();
  await page.getByTestId('hub-new-template').click();
  await page.getByLabel('Template name').fill(`Welcome ${suffix}`);
  await page.getByLabel('Template key').fill(`welcome-${suffix}`);
  await page.getByLabel('Subject').fill('Welcome, {{first_name | default: "friend"}}');
  await page.getByTestId('save-template').click();
  await expect(panel(page).getByTestId('engage-template')).toBeVisible();
  await panel(page).getByTestId('preview-1').click();
  await expect(panel(page).getByText('Subject: Welcome, Ayşe')).toBeVisible();
  await closePanel(page);

  // Segment: counted against the seeded customers before it is saved.
  await page.getByTestId('hub-tab-segments').click();
  await page.getByTestId('hub-new-segment').click();
  await page.getByLabel('Segment name').fill(`Lapsed ${suffix}`);
  await page.getByLabel('Segment key').fill(`lapsed-${suffix}`);
  await page.getByTestId('count-segment').click();
  await expect(page.getByTestId('segment-count')).toContainText('match now');
  await page.getByTestId('save-segment').click();
  await expect(panel(page).getByTestId('engage-segment')).toBeVisible();
  await closePanel(page);

  // Journey, built in the form.
  await page.getByTestId('hub-tab-journeys').click();
  await page.getByTestId('hub-new-journey').click();
  await page.getByLabel('Journey name').fill(`Welcome series ${suffix}`);
  await page.getByLabel('Journey key').fill(`welcome-series-${suffix}`);
  await page.getByLabel('Trigger event').fill(`signed_up_${suffix.replace(/[^a-z0-9]/g, '')}`);
  await page.getByRole('button', { name: 'Add exit event' }).click();
  await page.getByLabel('Step 1 minutes').fill('30');
  await page.getByTestId('add-message').click();
  await page.getByTestId('step-1-template').selectOption(`welcome-${suffix}`);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('The journey is valid.')).toBeVisible();
  await page.getByTestId('save-journey').click();

  // Approve and activate in the journey's panel.
  await expect(panel(page).getByTestId('version-1').getByTestId('status-draft')).toBeVisible();
  await panel(page).getByTestId('approve-1').click();
  await expect(panel(page).getByTestId('version-1').getByTestId('status-approved')).toBeVisible();
  await panel(page).getByTestId('activate-1').click();
  await expect(panel(page).getByTestId('version-1').getByTestId('status-active')).toBeVisible();
  await expect(panel(page).getByText(/Wait 30 minutes/)).toBeVisible();
  await expect(panel(page).getByText(new RegExp(`Send email "welcome-${suffix}"`))).toBeVisible();

  await closePanel(page);
  const row = page.getByTestId('hub-journeys').getByRole('row', { name: new RegExp(`Welcome series ${suffix}`) });
  await expect(row.getByTestId('status-active')).toBeVisible();
});

test('a refused save shows the server\'s reasons next to the form, on the same page', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('hub-tab-journeys').click();
  await page.getByTestId('hub-new-journey').click();
  await page.getByLabel('Journey name').fill('Broken');
  await page.getByLabel('Journey key').fill(`broken-${suffix}`);
  await page.getByLabel('Step 1 minutes').fill('soon');
  await page.getByTestId('save-journey').click();
  await expect(panel(page).getByTestId('issues')).toContainText('steps[0].minutes');
  await expect(page).toHaveURL(/\/marketing$/);
});

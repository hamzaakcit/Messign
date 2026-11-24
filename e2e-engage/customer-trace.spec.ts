import { readFileSync } from 'fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Engage, end to end in a browser (WP-19 acceptance, on the Lucy page): a tenant admin signs in, finds a customer in the
 * Customers section and sees each message traced to its send-gate decision and to the consent in force when it was taken.
 * The data is real pipeline output (scripts/engageE2eSeed.ts): simulated carts, the cart journey, the gate and a mock account.
 */
interface Seed { email: string; password: string; sentCustomer: string; blockedCustomer: string }
const seed = (): Seed => JSON.parse(readFileSync('e2e-engage/.auth/seed.json', 'utf8')) as Seed;

async function signIn(page: Page, s: Seed): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(s.email);
  await page.getByTestId('login-password').fill(s.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/marketing$/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 2_000 }).catch(() => undefined);
}

/** Opens a customer in the panel over the Lucy page. */
async function openCustomer(page: Page, externalId: string): Promise<void> {
  await page.getByLabel('Search customers').fill(externalId);
  await page.getByRole('cell', { name: externalId, exact: true }).click();
  await expect(page.getByRole('heading', { name: externalId })).toBeVisible();
}

test('sign in, open a customer, and trace a sent and a blocked message to the gate decision and the consent in force', async ({ page }) => {
  const s = seed();
  await signIn(page, s);

  // The engage page is the Lucy page: its hub opens on Customers, and the frozen Company-OS modules are nowhere.
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Marketing' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Finance' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Customers' })).toHaveCount(0);
  await expect(page.getByTestId('engage-hub')).toBeVisible();
  await expect(page.getByTestId('hub-customers')).toBeVisible();

  // A customer whose reminder went out: allowed by the gate, with the consent grant in force.
  await openCustomer(page, s.sentCustomer);
  const sent = page.getByTestId('trail-message').first();
  await expect(sent).toContainText(/Journey cart-abandonment, step reminder-[12]/);
  const allow = sent.getByTestId('gate-decision').first();
  await expect(allow).toContainText('allow');
  await expect(allow.getByTestId('consent-in-force')).toContainText('Consent in force: granted (import');
  await expect(page.getByTestId('trail-enrollment').first()).toContainText('Sepet terk');

  // A customer without consent: the gate blocked the message and the trail says no consent was in force.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hub-panel')).toHaveCount(0);
  await openCustomer(page, s.blockedCustomer);
  const blocked = page.getByTestId('trail-message').first();
  await expect(blocked).toContainText('blocked');
  const deny = blocked.getByTestId('gate-decision').first();
  await expect(deny).toContainText('deny');
  await expect(deny).toContainText('no marketing consent');
  await expect(deny.getByTestId('consent-in-force')).toContainText('Consent in force: none recorded at that time');
});

test('an old customer link lands on the Lucy page, not on a separate screen', async ({ page }) => {
  const s = seed();
  await signIn(page, s);
  await page.goto('/customers/00000000-0000-4000-8000-000000000000');
  await expect(page).toHaveURL(/\/marketing$/);
  await expect(page.getByTestId('engage-hub')).toBeVisible();
});

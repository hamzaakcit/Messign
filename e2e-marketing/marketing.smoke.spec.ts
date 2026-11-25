import { expect, test, type Page } from '@playwright/test';
import { installApi, signIn } from './mockApi';

/**
 * UX-09: every primary action on the kept marketing screens, with the API mocked (see mockApi.ts). The screens are the
 * offer list, New offer, the offer detail, the calendar, Builder (email designs) and Shop settings. The tests click what a
 * person clicks and check what the page then shows and which writes it made. A page error or an unmocked marketing
 * call fails the test, so a control that points at nothing cannot hide.
 */
test.beforeEach(async ({ page }) => { await signIn(page); });

/** The Dora offer card in the page (the sidebar has a Dora button too). */
const dora = (page: Page) => page.locator('#main-content').getByRole('button', { name: /^Dora/ });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('offers: the list, its status filters, and opening an offer', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.goto('/marketing');

  await expect(dora(page)).toBeVisible();

  // Filters: "In review" has nothing yet; "In progress" brings the drafts back.
  await page.getByRole('button', { name: 'In review' }).click();
  await expect(page.getByText('No offers in this view.')).toBeVisible();
  await page.getByRole('button', { name: 'In progress' }).click();
  await expect(dora(page)).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();

  // Opening an offer shows its one primary action.
  await dora(page).click();
  await expect(page.getByRole('heading', { name: /Dora/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Looks good' })).toBeEnabled();

  expect(errors).toEqual([]);
  expect(mock.unmocked).toEqual([]);
});

test('offer detail: Looks good sends the post to review, then a manager approves it', async ({ page }) => {
  const mock = await installApi(page);
  await page.goto('/marketing?contentId=offer-dora');

  await page.getByRole('button', { name: 'Looks good' }).click();
  await expect.poll(() => mock.writes).toContain('PUT /marketing/content/ig-dora');
  expect(mock.rows.get('ig-dora')?.status).toBe('in_review');
  const detail = page.getByTestId('offer-detail');
  await expect(detail.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();

  await detail.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(() => mock.rows.get('ig-dora')?.status).toBe('approved');
  await expect(detail.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
});

test('offer detail: Write caption has the model write the caption, and then Looks good is ready', async ({ page }) => {
  const mock = await installApi(page);
  const post = mock.rows.get('ig-dora');
  if (post) post.body = '';
  await page.goto('/marketing?contentId=offer-dora');

  const detail = page.getByTestId('offer-detail');
  await expect(detail.getByText('No caption yet.')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Looks good' })).toBeDisabled();

  await detail.getByRole('button', { name: 'Write caption' }).click();
  await expect(detail.getByText('A caption written by the model.')).toBeVisible();
  expect(mock.writes).toContain('POST /marketing/content/ig-dora/caption');
  await expect(detail.getByRole('button', { name: 'Rewrite caption' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Looks good' })).toBeEnabled();
});

test('campaigns: a name typed on New offer groups the offers, and the list filters by it', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.goto('/marketing/offer/new');
  const main = page.locator('#main-content');

  // No create-campaign step: the name is a field on the offer.
  await expect.poll(() => main.locator('#offer-product option').count()).toBeGreaterThan(1); // the placeholder plus the shop's products
  const options = await main.locator('#offer-product option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
  await main.locator('#offer-product').selectOption(options[0]);
  await main.locator('#offer-campaign').fill('Smoke week');
  await main.getByRole('button', { name: 'Next' }).click(); // Picture
  await main.getByRole('button', { name: 'Next' }).click(); // Words
  await main.locator('#offer-topic').fill('Smoke test drop');
  await main.getByRole('button', { name: 'Next' }).click(); // Preview
  await main.getByRole('button', { name: 'Next' }).click(); // Looks good
  await expect(main.getByText('Campaign: Smoke week')).toBeVisible();
  await main.getByRole('button', { name: 'Looks good' }).click();
  await expect(page).toHaveURL(/\/marketing$/);

  expect(mock.writes).toContain('POST /marketing/campaigns');
  expect([...mock.campaigns.values()].map((c) => c.name)).toEqual(['Smoke week']);
  const grouped = [...mock.rows.values()].filter((r) => r.campaign_name === 'Smoke week');
  expect(grouped.length).toBeGreaterThanOrEqual(2); // the offer and its post

  // Close the new offer; the list reloads and offers a campaign filter.
  await expect(page.getByTestId('offer-detail')).toBeVisible(); // the panel loads lazily: wait to see it before closing it
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('offer-detail')).toHaveCount(0);
  const list = main.locator('ul > li');
  await expect(main.getByLabel('Campaign')).toBeVisible();
  const before = await list.count();
  expect(before).toBeGreaterThan(1);
  await main.getByLabel('Campaign').selectOption({ label: 'Smoke week' });
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText('Smoke week');
  await main.getByLabel('Campaign').selectOption({ label: 'All campaigns' });
  await expect(list).toHaveCount(before);
  expect(errors).toEqual([]);
  expect(mock.unmocked).toEqual([]);
});

test('campaigns: the offer view names an offer under a campaign, and the post moves with it', async ({ page }) => {
  const mock = await installApi(page);
  await page.goto('/marketing?contentId=offer-dora');
  const detail = page.getByTestId('offer-detail');
  await detail.getByLabel('Campaign').fill('Launch week');
  await detail.getByLabel('Campaign').press('Enter');
  await expect.poll(() => mock.rows.get('offer-dora')?.campaign_name).toBe('Launch week');
  expect(mock.rows.get('ig-dora')?.campaign_name).toBe('Launch week');
  expect(mock.rows.get('em-dora')?.campaign_name).toBe('Launch week');
  expect(mock.writes).toContain('POST /marketing/campaigns');

  // Emptying the field takes the offer out of the campaign again.
  await detail.getByLabel('Campaign').fill('');
  await detail.getByLabel('Campaign').press('Enter');
  await expect.poll(() => mock.rows.get('offer-dora')?.campaign_id).toBeNull();
  expect(mock.rows.get('ig-dora')?.campaign_id).toBeNull();
});

test('offer detail: the ⋯ menu lists the post and the email, and Escape closes only the menu', async ({ page }) => {
  await installApi(page);
  await page.goto('/marketing?contentId=offer-dora');
  await page.getByRole('button', { name: /More actions|⋯|Offer actions/ }).first().click();
  await expect(page.getByRole('menuitem', { name: 'Open Instagram post' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open email' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Open Instagram post' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Looks good' })).toBeVisible();
});

test('new offer: five steps, a product drop needs a product, and Looks good saves a draft without posting', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.goto('/marketing/offer/new');
  const main = page.locator('#main-content');

  // A product drop cannot leave the first step without a product.
  await main.getByRole('button', { name: 'Next' }).click();
  await expect(main.getByText(/Pick a product from this org/)).toBeVisible();

  const options = await main.locator('#offer-product option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
  expect(options.length).toBeGreaterThan(0);
  await main.locator('#offer-product').selectOption(options[0]);
  await main.getByRole('button', { name: 'Next' }).click(); // Picture
  await main.getByRole('button', { name: 'Next' }).click(); // Words
  await main.locator('#offer-topic').fill('Smoke test drop');
  await main.getByRole('button', { name: 'Next' }).click(); // Preview
  await main.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(main.locator('#offer-topic')).toHaveValue('Smoke test drop');
  await main.getByRole('button', { name: 'Next' }).click(); // Preview
  await main.getByRole('button', { name: 'Next' }).click(); // Looks good
  await expect(main.getByText('It does not schedule or post.')).toBeVisible();

  await main.getByRole('button', { name: 'Looks good' }).click();
  await expect(page).toHaveURL(/\/marketing$/);
  expect(mock.writes.filter((w) => w === 'POST /marketing/content').length).toBeGreaterThanOrEqual(2);
  expect(mock.writes.some((w) => /publish|schedule/.test(w))).toBe(false);
  expect([...mock.rows.values()].every((r) => r.status === 'draft' || r.status === 'approved' || r.status === 'in_review')).toBe(true);
  expect(errors).toEqual([]);
  expect(mock.unmocked).toEqual([]);
});

test('calendar: an approved post waits in the tray and is scheduled by dragging it onto a day', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00'));
  await page.goto('/marketing/calendar');

  const tray = page.getByTestId('ready-tray');
  await expect(tray.getByText('Window post')).toBeVisible();
  // Only what can go out: not a LinkedIn post, not an Instagram post with no picture.
  await expect(tray.getByText('Old LinkedIn post')).toHaveCount(0);
  await expect(tray.getByText('Caption without a picture')).toHaveCount(0);
  await expect(page.getByTestId('live-send-warning')).toHaveCount(0);
  // No create-on-click: the calendar only schedules.
  await expect(page.getByRole('dialog', { name: /New Content/i })).toHaveCount(0);

  // Drag and drop as the page sees it: dragstart on the post, then dragover and drop on the day.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await tray.getByRole('button', { name: /Window post/ }).dispatchEvent('dragstart', { dataTransfer: transfer });
  const day = page.getByTestId('day-2026-11-20');
  await day.dispatchEvent('dragover', { dataTransfer: transfer });
  await day.dispatchEvent('drop', { dataTransfer: transfer });
  await expect.poll(() => mock.writes).toContain('POST /marketing/content/ig-ready/schedule');
  expect(mock.rows.get('ig-ready')?.status).toBe('scheduled');
  await expect(tray.getByText('Nothing approved yet.')).toBeVisible();
  expect(errors).toEqual([]);
  expect(mock.unmocked).toEqual([]);
});

test('calendar: when live sending is on the page says so', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/marketing/content/instagram-publish-mode', (route) => route.fulfill({ json: { mode: 'live' } }));
  await page.goto('/marketing/calendar');
  await expect(page.getByTestId('live-send-warning')).toContainText('Live sending is on');
});

test('builder: email designs are listed, and New email opens its form and closes again', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.goto('/marketing/builder');

  await expect(page.getByText('Spring newsletter')).toBeVisible();
  await page.getByRole('button', { name: 'New email' }).click();
  await expect(page.getByRole('heading', { name: 'New email', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();

  // Creating without a design is refused with a reason, and nothing is written.
  const form = page.locator('form');
  await form.locator('input').nth(0).fill('Smoke email');
  await form.locator('input').nth(1).fill('Smoke subject');
  await page.getByRole('button', { name: 'Create email' }).click();
  await expect(page.getByText(/Apply HTML & design/)).toBeVisible();
  expect(mock.writes.filter((w) => w.includes('/emails'))).toEqual([]);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'New email', level: 2 })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('shop settings: opened from More, with content setup for each shop and the brand profiles', async ({ page }) => {
  const errors = watchErrors(page);
  const mock = await installApi(page);
  await page.goto('/marketing');
  await expect(dora(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Brands' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Shop settings' }).click();

  await expect(page).toHaveURL(/\/marketing\/shop$/);
  await expect(page.getByRole('heading', { name: 'Shop settings' })).toBeVisible();
  await expect(page.getByText('Content setup')).toBeVisible();
  for (const shop of ['Messign', 'Lilyana', 'Kitapyurdu']) {
    await expect(page.getByRole('article').filter({ hasText: shop }).first()).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Brand profiles' })).toBeVisible();

  // The same page is a tab on the other marketing screens.
  await page.getByRole('button', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/\/marketing\/calendar$/);
  await page.getByRole('button', { name: 'Shop settings' }).click();
  await expect(page).toHaveURL(/\/marketing\/shop$/);
  expect(errors).toEqual([]);
  expect(mock.unmocked).toEqual([]);
});

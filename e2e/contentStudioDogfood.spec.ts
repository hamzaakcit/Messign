import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Ten-minute content-studio script, with image generation mocked.
 * Messign product drop, florist occasion, bookstore cart email.
 */

interface StoredRow {
  id: string;
  title: string;
  channel: string | null;
  content_type: string;
  status: string;
  body: string | null;
  parent_content_id: string | null;
  tags: string[];
  image_url: string | null;
  image_prompt: string | null;
  user_brief: string | null;
}

function installContentMocks(page: Page, rows: Map<string, StoredRow>, calls: { instagram: number; email: number; regen: number }): Promise<void> {
  let seq = 0;
  return page.route('**/api/marketing/content**', async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('instagram-publish-mode')) {
      await route.fulfill({ json: { mode: 'mock' } });
      return;
    }
    if (url.includes('instagram-connection')) {
      await route.fulfill({ json: { connected: false, accountId: null, username: null } });
      return;
    }
    if (url.includes('/regenerate-image')) {
      calls.regen += 1;
      await route.fulfill({ json: { success: true, image_url: 'https://cdn.example/mock-cover.jpg', error: null } });
      return;
    }
    if (method === 'POST' && url.includes('/journey-email')) {
      calls.email += 1;
      const parent = url.match(/\/content\/([^/]+)\/journey-email/)?.[1] ?? null;
      const row: StoredRow = {
        id: `email-${++seq}`,
        title: 'Journey subject',
        channel: 'email',
        content_type: 'email',
        status: 'draft',
        body: 'SUBJECT: Journey subject\n\nThe offer brief, not the Instagram caption.',
        parent_content_id: parent,
        tags: ['journey_email'],
        image_url: null,
        image_prompt: null,
        user_brief: 'offer brief',
      };
      rows.set(row.id, row);
      await route.fulfill({ status: 201, json: row });
      return;
    }
    if (method === 'POST' && /\/api\/marketing\/content\/?(\?|$)/.test(url)) {
      const body = JSON.parse(route.request().postData() || '{}') as {
        title?: string;
        channel?: string;
        content_type?: string;
        parent_content_id?: string;
        tags?: string[];
        user_brief?: string;
      };
      const channel = body.channel ?? null;
      if (channel === 'instagram') calls.instagram += 1;
      const row: StoredRow = {
        id: `${channel || body.content_type || 'row'}-${++seq}`,
        title: body.title || 'Untitled',
        channel,
        content_type: body.content_type || 'social',
        status: 'draft',
        body: channel === 'instagram' ? 'Window caption for the drop' : body.user_brief || null,
        parent_content_id: body.parent_content_id ?? null,
        tags: body.tags ?? [],
        image_url: channel === 'instagram' ? 'https://cdn.example/mock-cover.jpg' : null,
        image_prompt: channel === 'instagram' ? 'A shop window in warm light, no people' : null,
        user_brief: body.user_brief ?? null,
      };
      rows.set(row.id, row);
      await route.fulfill({ status: 201, json: row });
      return;
    }
    if (method === 'GET' && url.includes('parent_id=')) {
      await route.fulfill({
        json: { data: [...rows.values()], total: rows.size, page: 1, pageSize: 20, totalPages: 1 },
      });
      return;
    }
    const id = url.match(/\/content\/([^/?]+)/)?.[1];
    if (method === 'GET' && id && rows.has(decodeURIComponent(id))) {
      await route.fulfill({ json: rows.get(decodeURIComponent(id)) });
      return;
    }
    await route.continue();
  });
}

async function clickFooter(page: Page, name: string): Promise<void> {
  const button = page.getByRole('dialog').getByRole('button', { name });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeEnabled();
  await button.click();
}

async function openInstagramModal(page: Page): Promise<void> {
  await page.goto('/marketing');
  await page.getByRole('button', { name: 'Instagram post' }).click();
  await expect(page.getByRole('heading', { name: 'Instagram post' })).toBeVisible();
}

test.describe('content studio dogfood', () => {
  test.describe.configure({ timeout: 60_000 });
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v2/ai/answer**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: {"type":"done","data":{}}\n\n',
      });
    });
  });

  test('Messign product drop opens the studio caption, the regen control, and an email child', async ({ page }) => {
    const rows = new Map<string, StoredRow>();
    const calls = { instagram: 0, email: 0, regen: 0 };
    await installContentMocks(page, rows, calls);
    await openInstagramModal(page);
    await page.getByRole('dialog').getByLabel('Content tenant').selectOption('messign');
    await page.getByRole('dialog').getByRole('checkbox', { name: 'Mock image' }).check();
    await page.getByLabel(/Topic \/ goal/i).fill('Messign product drop');
    await page.locator('#ig-modal-recipe').selectOption('product_drop');
    await clickFooter(page, 'Send to Lucy');

    await expect(page.getByText('Window caption for the drop')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate image' })).toBeVisible();
    await expect(page.getByTestId('offer-sibling-email')).toBeVisible();
    await expect(page.getByTestId('publish-off')).toBeVisible();
    await expect(page.getByRole('button', { name: /Test publish/ })).toHaveCount(0);
    expect(calls.instagram).toBe(1);
    expect(calls.email).toBe(1);
    expect([...rows.values()].some((row) => row.channel === 'email')).toBe(true);
  });

  test('florist occasion keeps the post and the email', async ({ page }) => {
    const rows = new Map<string, StoredRow>();
    const calls = { instagram: 0, email: 0, regen: 0 };
    await installContentMocks(page, rows, calls);
    await openInstagramModal(page);
    await page.getByRole('dialog').getByLabel('Content tenant').selectOption('florist');
    await page.getByLabel(/Topic \/ goal/i).fill('Florist occasion');
    await page.locator('#ig-modal-recipe').selectOption('occasion');
    await expect(page.getByLabel('Also create an Instagram post')).toBeChecked();
    await clickFooter(page, 'Send to Lucy');

    await expect(page.getByText('Window caption for the drop')).toBeVisible();
    expect(calls.instagram).toBe(1);
    expect(calls.email).toBe(1);
  });

  test('bookstore cart saves the email and creates no Instagram row', async ({ page }) => {
    const rows = new Map<string, StoredRow>();
    const calls = { instagram: 0, email: 0, regen: 0 };
    await installContentMocks(page, rows, calls);
    await openInstagramModal(page);
    await page.getByRole('dialog').getByLabel('Content tenant').selectOption('bookstore');
    await page.getByLabel(/Topic \/ goal/i).fill('Bookstore cart');
    await page.locator('#ig-modal-recipe').selectOption('cart');
    await expect(page.getByText('This saves the email only.')).toBeVisible();
    await clickFooter(page, 'Save email');

    await expect(page.getByRole('heading', { name: 'Journey subject' })).toBeVisible();
    expect(calls.instagram).toBe(0);
    expect(calls.email).toBe(1);
    expect([...rows.values()].filter((row) => row.channel === 'instagram')).toHaveLength(0);
  });
});

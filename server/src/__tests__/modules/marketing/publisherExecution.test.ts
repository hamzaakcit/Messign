/**
 * Phase 5 — publisher execution matrix (EX-01…EX-03).
 * Integration tests: real PostgreSQL + SKIP LOCKED. Requires migrations through
 * `075_marketing_calendar_budget.sql` (and later) so `marketing_content_calendar` exists.
 *
 * Run: `DATABASE_URL=... npx vitest run src/__tests__/modules/marketing/publisherExecution.test.ts`
 */
import 'dotenv/config';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { pool, withTenantQuery } from '../../../db/index.js';
import { pollAndPublish } from '../../../services/marketing/marketingPublisherService.js';

const hasDb = Boolean(process.env.DATABASE_URL);

async function seedScheduledCalendarRow(channel: string): Promise<{
  orgId: string;
  contentId: string;
  calendarId: string;
}> {
  const orgId = randomUUID();
  const contentId = randomUUID();
  const calendarId = randomUUID();
  const slug = `pub-${randomUUID()}`;

  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Publisher Phase5', $2)`, [
    orgId,
    slug,
  ]);

  await withTenantQuery(orgId, async (client) => {
    await client.query(
      `INSERT INTO marketing_content (
         id, organization_id, tenant_id, campaign_id, title, content_type, channel, status, body, created_at, updated_at
       ) VALUES ($1, $2, $2, NULL, $3, 'social', $4, 'approved', 'Body copy for publisher test.', NOW(), NOW())`,
      [contentId, orgId, `Title ${calendarId.slice(0, 8)}`, channel],
    );
  });

  const past = new Date(Date.now() - 120_000).toISOString();

  await pool.query(
    `INSERT INTO marketing_content_calendar (
       id, workspace_id, content_id, campaign_id, scheduled_at, channel, status, created_at, updated_at
     ) VALUES ($1, $2, $3, NULL, $4::timestamptz, $5, 'scheduled', NOW(), NOW())`,
    [calendarId, orgId, contentId, past, channel],
  );

  return { orgId, contentId, calendarId };
}

async function cleanupWorkspace(orgId: string): Promise<void> {
  await pool.query(`DELETE FROM marketing_content_calendar WHERE workspace_id = $1`, [orgId]);
  await withTenantQuery(orgId, async (client) => {
    await client.query(`DELETE FROM marketing_content WHERE organization_id = $1`, [orgId]);
  });
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
}

describe.skipIf(!hasDb)('Phase 5 — publisher execution matrix', { timeout: 30_000 }, () => {
  let calendarTableReady = false;

  beforeAll(async () => {
    const r = await pool.query<{ reg: unknown }>(
      `SELECT to_regclass('public.marketing_content_calendar') AS reg`,
    );
    calendarTableReady = Boolean(r.rows[0]?.reg);
    if (!calendarTableReady) {
      console.warn(
        '[publisherExecution] public.marketing_content_calendar not found — Phase 5 tests will be skipped. Apply server migrations (075+).',
      );
    }
  });

  beforeEach(({ skip }) => {
    skip(!calendarTableReady, 'Requires marketing_content_calendar (migrations 075+)');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('EX-01: successful post — calendar becomes published with external id', async () => {
    const { orgId, calendarId } = await seedScheduledCalendarRow('linkedin');

    const publishContent = vi.fn().mockResolvedValue({
      publishedUrl: 'https://www.linkedin.com/feed/update/mock-ok',
      externalPostId: 'urn:li:ugcPost:mock-ok',
    });

    try {
      const r = await pollAndPublish(50, { publishContent });
      expect(r.claimed).toBe(1);
      expect(r.published).toBe(1);
      expect(r.failed).toBe(0);
      expect(r.deferred).toBe(0);
      expect(publishContent).toHaveBeenCalledTimes(1);

      const row = await pool.query<{ status: string; external_post_id: string | null }>(
        `SELECT status, external_post_id FROM marketing_content_calendar WHERE id = $1`,
        [calendarId],
      );
      expect(row.rows[0]?.status).toBe('published');
      expect(row.rows[0]?.external_post_id).toBe('urn:li:ugcPost:mock-ok');
    } finally {
      await cleanupWorkspace(orgId);
    }
  });

  it('EX-02: API failure (auth) — calendar failed and last_error contains 401 Unauthorized', async () => {
    const { orgId, calendarId } = await seedScheduledCalendarRow('linkedin');

    const publishContent = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

    try {
      const r = await pollAndPublish(50, { publishContent });
      expect(r.claimed).toBe(1);
      expect(r.published).toBe(0);
      expect(r.failed).toBe(1);
      expect(r.deferred).toBe(0);

      const row = await pool.query<{ status: string; last_error: string | null }>(
        `SELECT status, last_error FROM marketing_content_calendar WHERE id = $1`,
        [calendarId],
      );
      expect(row.rows[0]?.status).toBe('failed');
      expect(String(row.rows[0]?.last_error)).toContain('401 Unauthorized');
      expect(publishContent).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupWorkspace(orgId);
    }
  });

  it('EX-03: concurrency — three concurrent ticks execute the adapter only once', async () => {
    const { orgId, calendarId } = await seedScheduledCalendarRow('email');

    const publishContent = vi.fn().mockResolvedValue({
      publishedUrl: 'mailto:audience?campaign=test',
      externalPostId: 'email-mock-once',
    });

    try {
      const [a, b, c] = await Promise.all([
        pollAndPublish(50, { publishContent }),
        pollAndPublish(50, { publishContent }),
        pollAndPublish(50, { publishContent }),
      ]);

      const claimed = a.claimed + b.claimed + c.claimed;
      expect(claimed).toBe(1);
      expect(publishContent).toHaveBeenCalledTimes(1);

      const row = await pool.query<{ status: string }>(
        `SELECT status FROM marketing_content_calendar WHERE id = $1`,
        [calendarId],
      );
      expect(row.rows[0]?.status).toBe('published');
    } finally {
      await cleanupWorkspace(orgId);
    }
  });
});

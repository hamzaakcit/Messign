/**
 * Publish and schedule hand content to the publisher through marketing_content_calendar (WP fix: Publish only changed
 * the status before, so nothing was sent). Unapproved content is refused; approved content writes a `scheduled`
 * calendar row for its channel that the publisher picks up.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  calendar: vi.fn(async () => ({})),
  queries: [] as string[],
}));

vi.mock('../../../middleware/tenantContext.js', () => ({
  withTenantQuery: async (_tenant: string, fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: async (text: string) => {
        h.queries.push(text);
        return { rows: [h.row], rowCount: 1 };
      },
    }),
}));

vi.mock('../../../dal/marketing/contentCalendar.js', () => ({
  upsertContentCalendar: (...args: unknown[]) => h.calendar(...args),
}));

const ORG = '00000000-0000-0000-0000-000000000001';
const ctx = { organizationId: ORG, userId: 'user-1' } as never;

function contentRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'c1', organization_id: ORG, title: 'AI draft', content_type: 'social', channel: 'instagram',
    status: 'approved', campaign_id: null, scheduled_date: null, scheduled_time: null, tags: [], ...overrides,
  };
}

describe('publish and schedule queue content for the publisher', () => {
  beforeEach(() => {
    h.queries = [];
    h.calendar.mockClear();
  });

  it('refuses to publish content that is not approved, and writes no calendar row', async () => {
    h.row = contentRow({ status: 'pending_approval' });
    const dal = await import('../../../dal/marketing/content.js');
    await expect(dal.publishContent(ctx, 'c1')).rejects.toThrow(/must be approved before it can be published/);
    expect(h.calendar).not.toHaveBeenCalled();
  });

  it('publishing approved content writes a scheduled calendar row now for its channel', async () => {
    h.row = contentRow({ status: 'approved' });
    const dal = await import('../../../dal/marketing/content.js');
    await dal.publishContent(ctx, 'c1');
    expect(h.calendar).toHaveBeenCalledTimes(1);
    const args = h.calendar.mock.calls[0] as unknown[];
    expect(args[1]).toBe(ORG);
    expect(args[2]).toBe('c1');
    expect(args[4]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(args[5]).toBe('instagram');
    expect(args[6]).toBe('scheduled');
  });

  it('refuses to schedule unapproved content', async () => {
    h.row = contentRow({ status: 'pending_approval' });
    const dal = await import('../../../dal/marketing/content.js');
    await expect(dal.scheduleContent(ctx, 'c1', '2026-12-01', '10:30')).rejects.toThrow(/must be approved before it can be scheduled/);
    expect(h.calendar).not.toHaveBeenCalled();
  });

  it('scheduling approved content uses the given date and time, in UTC', async () => {
    h.row = contentRow({ status: 'approved' });
    const dal = await import('../../../dal/marketing/content.js');
    await dal.scheduleContent(ctx, 'c1', '2026-12-01', '10:30');
    const args = h.calendar.mock.calls[0] as unknown[];
    expect(args[4]).toBe('2026-12-01T10:30:00.000Z');
    expect(args[6]).toBe('scheduled');
  });
});

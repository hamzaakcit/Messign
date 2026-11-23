/** WP-31 (R18): the outbound-webhook admin routes never fall back to "all organizations". */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const queries: Array<{ text: string; params: unknown[] }> = [];
vi.mock('../../db/index.js', () => ({ query: vi.fn(async (text: string, params: unknown[]) => { queries.push({ text, params }); return { rows: [] }; }) }));
vi.mock('../../services/webhookService.js', () => ({ AVAILABLE_WEBHOOK_EVENTS: [], webhookService: {} }));
vi.mock('../../middleware/reimbursementAuth.js', () => ({
  // Stands in for the real auth: the organization comes from a test header, the way the real one sets it from the token.
  reimbursementAuth: (req: { organizationId?: string; headers: Record<string, string | undefined> }, _res: unknown, next: () => void) => {
    if (req.headers['x-test-org']) req.organizationId = req.headers['x-test-org'];
    next();
  },
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

async function call(path: string, headers: Record<string, string> = {}): Promise<number> {
  const { default: webhookRouter } = await import('../../routes/webhooks/index.js');
  const app = express();
  app.use('/api/webhooks', webhookRouter);
  const server = await new Promise<import('node:http').Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    return (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks${path}`, { headers })).status;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('outbound webhook routes and the organization scope', () => {
  beforeEach(() => { queries.length = 0; });
  it('refuses a caller with no organization, before any query', async () => {
    expect(await call('/')).toBe(403);
    expect(queries).toHaveLength(0);
  });
  it('lists only the caller\'s organization, with no "or all" branch in the query', async () => {
    expect(await call('/', { 'x-test-org': '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' })).toBe(200);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toContain('organization_id = $1::uuid');
    expect(queries[0]!.text).not.toMatch(/IS NULL OR/i);
    expect(queries[0]!.params).toEqual(['0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f']);
  });
});

/**
 * Guards invoices INSERT includes tenant_id (NOT NULL). Same path as POST /api/finance/invoices.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();

vi.mock('../../../db/index.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  getClient: vi.fn(async () => ({
    query: (...args: unknown[]) => clientQueryMock(...args),
    release: releaseMock,
  })),
}));

vi.mock('../../../routes/exchangeRates.js', () => ({
  getExchangeRate: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../../services/finance/auditService.js', () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../services/finance/notificationService.js', () => ({
  notificationService: {},
}));

vi.mock('../../../services/finance/journalEntryService.js', () => ({
  journalEntryService: {},
}));

vi.mock('../../../events/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

describe('invoiceService.create — tenant_id', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();

    clientQueryMock.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT COALESCE(MAX')) {
        return Promise.resolve({ rows: [{ next_num: '1' }] });
      }
      if (sql.includes('INSERT INTO invoices')) {
        return Promise.resolve({
          rows: [
            {
              id: 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
              invoice_number: 'INV-00001',
            },
          ],
        });
      }
      if (sql.includes('INSERT INTO invoice_line_items')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('includes tenant_id in INSERT and binds organization_id twice', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { invoiceService } = await import('../../../services/finance/invoiceService.js');

    await invoiceService.create(
      {
        from_name: 'Acme',
        to_name: 'Client',
        line_items: [{ description: 'Work', quantity: 1, unit_price: 100 }],
      },
      userId,
      orgId,
    );

    const insertCalls = clientQueryMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO invoices'),
    );
    expect(insertCalls.length).toBe(1);
    const sql = insertCalls[0]![0] as string;
    const params = insertCalls[0]![1] as unknown[];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(orgId);
    expect(params[1]).toBe(orgId);
    expect(params[2]).toBe(userId);
  });
});

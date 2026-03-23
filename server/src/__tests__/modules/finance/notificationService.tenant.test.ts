/**
 * Guards finance_notifications INSERT tenant_id (NOT NULL). Same path as
 * doraSchedulerWorker overdue_invoice_check → checkOverdueInvoices → notificationService.create.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../db/index.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../../../sockets/index.js', () => ({
  emitToUser: vi.fn(),
}));

describe('notificationService.create — tenant_id', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({
      rows: [
        {
          id: '11111111-2222-4333-8444-555555555555',
          created_at: new Date().toISOString(),
        },
      ],
    });
  });

  it('defaults tenant_id to organization_id when omitted (worker path)', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const recipientId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const { notificationService } = await import('../../../services/finance/notificationService.js');

    await notificationService.create({
      organization_id: orgId,
      recipient_id: recipientId,
      type: 'invoice_overdue',
      title: 'Invoice Overdue',
      message: 'Test message',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0]?.[0] as string;
    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain('tenant_id');
    expect(params[0]).toBe(orgId);
    expect(params[1]).toBe(orgId);
  });

  it('uses explicit tenant_id when provided', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const tenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const recipientId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const { notificationService } = await import('../../../services/finance/notificationService.js');

    await notificationService.create({
      organization_id: orgId,
      tenant_id: tenantId,
      recipient_id: recipientId,
      type: 'budget_alert',
      title: 'Budget',
      message: 'Alert',
    });

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe(orgId);
    expect(params[1]).toBe(tenantId);
  });
});

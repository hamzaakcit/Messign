import { buildSupportTicketListFilters, normalizeNlSupportStatus } from '@/pages/support/supportTicketFilters';

describe('supportTicketFilters', () => {
  it('normalizes legacy NL status labels to server values', () => {
    expect(normalizeNlSupportStatus('waiting')).toBe('awaiting_agent');
    expect(normalizeNlSupportStatus('awaiting_customer')).toBe('awaiting_customer');
    expect(normalizeNlSupportStatus('open')).toBe('open');
  });

  it('uses server-side open group for Open tab', () => {
    const f = buildSupportTicketListFilters({
      tab: 'open',
      nlFilters: {},
      search: '',
      priority: '',
      categoryId: '',
      assigneeId: '',
      page: 0,
      pageSize: 20,
      sortBy: 'created_at',
      sortDir: 'desc',
    });
    expect(f.statusGroup).toBe('open');
    expect(f.urgent).toBeUndefined();
  });

  it('uses urgent flag for Urgent tab', () => {
    const f = buildSupportTicketListFilters({
      tab: 'urgent',
      nlFilters: {},
      search: '',
      priority: '',
      categoryId: '',
      assigneeId: '',
      page: 0,
      pageSize: 20,
      sortBy: 'created_at',
      sortDir: 'desc',
    });
    expect(f.urgent).toBe(true);
  });

  it('applies resolved status for Resolved tab', () => {
    const f = buildSupportTicketListFilters({
      tab: 'resolved',
      nlFilters: {},
      search: '',
      priority: '',
      categoryId: '',
      assigneeId: '',
      page: 0,
      pageSize: 20,
      sortBy: 'created_at',
      sortDir: 'desc',
    });
    expect(f.status).toBe('resolved');
  });

  it('lets NL status override tab presets', () => {
    const f = buildSupportTicketListFilters({
      tab: 'open',
      nlFilters: { status: 'closed' },
      search: '',
      priority: '',
      categoryId: '',
      assigneeId: '',
      page: 0,
      pageSize: 20,
      sortBy: 'created_at',
      sortDir: 'desc',
    });
    expect(f.status).toBe('closed');
    expect(f.statusGroup).toBeUndefined();
  });
});

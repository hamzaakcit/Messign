import type { SupportListFilters, SupportPriority } from '@/lib/supportApi';

export type SupportTicketsTabId = 'all' | 'open' | 'my' | 'urgent' | 'resolved';

/** Map legacy NL / UI labels to server `SupportStatus` values. */
export function normalizeNlSupportStatus(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    waiting: 'awaiting_agent',
    waiting_agent: 'awaiting_agent',
    waiting_customer: 'awaiting_customer',
    awaiting: 'awaiting_agent',
    in_progress: 'in_progress',
    on_hold: 'on_hold',
    open: 'open',
    resolved: 'resolved',
    closed: 'closed',
  };
  return map[key] ?? key;
}

export interface BuildSupportTicketListFiltersInput {
  tab: SupportTicketsTabId;
  nlFilters: Record<string, unknown>;
  search: string;
  priority: SupportPriority | '';
  categoryId: string;
  assigneeId: string;
  resolvedCategoryId?: string;
  resolvedAssigneeId?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

/**
 * Builds `SupportListFilters` for `/api/support/tickets` (or `/my`).
 * Tab presets use server-side filters so pagination totals match the full dataset.
 */
export function buildSupportTicketListFilters(input: BuildSupportTicketListFiltersInput): SupportListFilters {
  const {
    tab,
    nlFilters,
    search,
    priority,
    categoryId,
    assigneeId,
    resolvedCategoryId,
    resolvedAssigneeId,
    page,
    pageSize,
    sortBy,
    sortDir,
  } = input;

  const nlStatus = normalizeNlSupportStatus(nlFilters.status as string | undefined);
  const nlPriorityRaw = nlFilters.priority as string | undefined;
  const resolvedNlPriority =
    nlPriorityRaw === 'urgent'
      ? 'critical'
      : (nlPriorityRaw as SupportPriority | undefined);

  const base: SupportListFilters = {
    search: (nlFilters.search as string) || search || undefined,
    priority: (resolvedNlPriority as SupportPriority | undefined) || (priority ? priority : undefined),
    categoryId: resolvedCategoryId || categoryId || undefined,
    assigneeId: resolvedAssigneeId || assigneeId || undefined,
    from: (nlFilters.createdFrom as string) || undefined,
    to: (nlFilters.createdTo as string) || undefined,
    page: page + 1,
    pageSize,
    sortBy,
    sortDir,
  };

  if (nlStatus) {
    return { ...base, status: nlStatus };
  }

  if (tab === 'open') {
    return { ...base, statusGroup: 'open' };
  }
  if (tab === 'urgent') {
    return { ...base, urgent: true };
  }
  if (tab === 'resolved') {
    return { ...base, status: 'resolved' };
  }

  return base;
}

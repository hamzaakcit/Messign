import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Clock3,
  LifeBuoy,
  Plus,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Button } from '@/components/ui/Button';
import { NLFilterBar, type AvailableField } from '@/components/ui/NLFilterBar';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import {
  supportApi,
  type SupportCategory,
  type SupportDashboardMetrics,
  type SupportPriority,
  type SupportTicket,
} from '@/lib/supportApi';
import { cn } from '@/lib/utils';
import { SupportNav } from './components/SupportNav';
import { TicketCreatePanel } from './components/TicketCreatePanel';
import { TicketDetailPanel } from './components/TicketDetailPanel';
import {
  formatHoursShort,
  formatSlaText,
  formatTicketStamp,
  PriorityBadge,
  RelativeStamp,
  TicketAssigneeValue,
  TicketStatusBadge,
} from './components/supportUi';
import { buildSupportTicketListFilters } from './supportTicketFilters';

const PAGE_SIZE = 20;

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'my', label: 'My Tickets' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'resolved', label: 'Resolved' },
] as const;

type FilterTab = (typeof FILTER_TABS)[number]['id'];

const inputClass =
  'rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500';

export function SupportTicketsPage() {
  const { user } = useAuthStore();
  const { users } = useUsersStore();
  const userId = user?.authUserId || user?.id || '';

  const [metrics, setMetrics] = useState<SupportDashboardMetrics | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [priority, setPriority] = useState<SupportPriority | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'assign' | 'close' | 'priority' | ''>('');
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [bulkPriority, setBulkPriority] = useState<SupportPriority>('medium');
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [nlFilters, setNlFilters] = useState<Record<string, unknown>>({});

  const fetchMetrics = useCallback(async () => {
    if (!userId) return;
    try {
      setMetrics(await supportApi.getDashboardMetrics(userId));
    } catch (err) {
      setMetrics(null);
      toast.error(err instanceof Error ? err.message : 'Failed to load support metrics');
    }
  }, [userId]);

  const fetchTickets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const listFn = tab === 'my' ? supportApi.listMyTickets : supportApi.listTickets;
      const categoryStr = nlFilters.category as string | undefined;
      const resolvedCategoryId =
        categoryStr
          ? categories.find((c) => c.name?.toLowerCase() === categoryStr.toLowerCase())?.id
          : undefined;
      const assigneeStr = nlFilters.assignee as string | undefined;
      const resolvedAssigneeId =
        assigneeStr
          ? users.find((u) => (u.name || u.email || '').toLowerCase().includes(assigneeStr.toLowerCase()))?.id
          : undefined;

      const filters = buildSupportTicketListFilters({
        tab,
        nlFilters,
        search,
        priority,
        categoryId,
        assigneeId,
        resolvedCategoryId,
        resolvedAssigneeId,
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        sortDir,
      });

      const result = await listFn(userId, filters);
      setTickets(result.data);
      setTotal(result.total);
    } catch (err) {
      setTickets([]);
      setTotal(0);
      toast.error(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [assigneeId, categories, categoryId, nlFilters, page, priority, search, sortBy, sortDir, tab, userId, users]);

  useEffect(() => {
    if (!userId) return;
    fetchMetrics();
    supportApi.listCategories(userId).then(setCategories).catch(() => setCategories([]));
  }, [fetchMetrics, userId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const columns = useMemo<ColumnDef<SupportTicket>[]>(() => [
    {
      key: 'ticketNumber',
      header: 'Ticket',
      width: '28%',
      sortable: true,
      render: (_value, row) => (
        <div>
          <div className="font-semibold text-app-text">{formatTicketStamp(row.ticketNumber)}</div>
          <div className="text-sm text-app-muted line-clamp-1">{row.subject}</div>
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Customer',
      render: (_value, row) => (
        <div className="text-sm">
          <div className="text-app-text">{row.reporterName || row.companyName || row.reporterEmail}</div>
          {row.companyName && <div className="text-app-muted">{row.companyName}</div>}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (_value, row) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'slaResolutionDue',
      header: 'SLA',
      sortable: true,
      render: (_value, row) => {
        const resolution = row.slaDetails?.resolution;
        const tone =
          row.slaStatus === 'breached'
            ? 'text-red-400'
            : row.slaStatus === 'at_risk'
              ? 'text-amber-300'
              : 'text-emerald-400';
        return (
          <span className={cn('text-sm font-medium', tone)}>
            {formatSlaText(resolution)}
          </span>
        );
      },
    },
    {
      key: 'assigneeName',
      header: 'Assignee',
      render: (_value, row) => <TicketAssigneeValue assigneeName={row.assigneeName} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (_value, row) => <TicketStatusBadge status={row.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (_value, row) => <RelativeStamp value={row.createdAt} />,
    },
  ], []);

  const handleBulkApply = async () => {
    if (!userId || selectedIds.size === 0 || !bulkAction) return;
    const ids = Array.from(selectedIds);
    try {
      if (bulkAction === 'assign' && bulkAssigneeId) {
        await supportApi.bulkAssign(userId, ids, bulkAssigneeId);
      } else if (bulkAction === 'close') {
        await supportApi.bulkClose(userId, ids);
      } else if (bulkAction === 'priority') {
        await Promise.all(ids.map((id) => supportApi.updateTicket(userId, id, { priority: bulkPriority })));
      } else {
        return;
      }
      setSelectedIds(new Set());
      setBulkAction('');
      toast.success('Bulk action completed');
      await fetchTickets();
      await fetchMetrics();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <SupportNav />
          <DoraInsightBar
            module="support"
            fallback="Dora monitors ticket SLAs and detects patterns across support requests."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard title="Open Tickets" value={metrics?.openTickets ?? 0} icon={LifeBuoy} />
            <KPICard
              title="Avg First Response"
              value={formatHoursShort(metrics?.avgFirstResponseHours)}
              icon={Clock3}
            />
            <KPICard
              title="Avg Resolution"
              value={formatHoursShort(metrics?.avgResolutionHours)}
              icon={ShieldCheck}
            />
            <KPICard title="CSAT Score" value={`${(metrics?.csatScore ?? 0).toFixed(1)}/5`} icon={Star} />
            <KPICard
              title="SLA Compliance"
              value={`${(metrics?.slaCompliancePercent ?? 0).toFixed(0)}%`}
              icon={AlertTriangle}
            />
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 overflow-x-auto">
                {FILTER_TABS.map((filterTab) => (
                  <button
                    key={filterTab.id}
                    type="button"
                    onClick={() => {
                      setTab(filterTab.id);
                      setPage(0);
                      setSelectedIds(new Set());
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                      tab === filterTab.id
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
                    )}
                  >
                    {filterTab.label}
                  </button>
                ))}
              </div>

              <Button data-testid="support-new-ticket" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                New Ticket
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setSearch(searchDraft.trim());
                      setPage(0);
                    }
                  }}
                  placeholder="Search by subject or ticket number…"
                  className={cn(inputClass, 'w-full pl-9')}
                />
              </div>
              <select
                value={priority}
                onChange={(event) => {
                  setPriority(event.target.value as SupportPriority | '');
                  setPage(0);
                }}
                className={inputClass}
                aria-label="Filter by priority"
              >
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setPage(0);
                }}
                className={inputClass}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={assigneeId}
                onChange={(event) => {
                  setAssigneeId(event.target.value);
                  setPage(0);
                }}
                className={inputClass}
                aria-label="Filter by assignee"
              >
                <option value="">All assignees</option>
                {users.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchDraft('');
                  setSearch('');
                  setPriority('');
                  setCategoryId('');
                  setAssigneeId('');
                  setPage(0);
                }}
              >
                Clear Filters
              </Button>
            </div>

            {selectedIds.size > 0 && (
              <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-app-text">{selectedIds.size} selected</span>
                <select
                  value={bulkAction}
                  onChange={(event) => setBulkAction(event.target.value as typeof bulkAction)}
                  className={inputClass}
                  aria-label="Bulk action"
                >
                  <option value="">Bulk action…</option>
                  <option value="assign">Assign</option>
                  <option value="close">Close</option>
                  <option value="priority">Change Priority</option>
                </select>
                {bulkAction === 'assign' && (
                  <select
                    value={bulkAssigneeId}
                    onChange={(event) => setBulkAssigneeId(event.target.value)}
                    className={inputClass}
                    aria-label="Choose assignee"
                  >
                    <option value="">Choose assignee</option>
                    {users.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </option>
                    ))}
                  </select>
                )}
                {bulkAction === 'priority' && (
                  <select
                    value={bulkPriority}
                    onChange={(event) => setBulkPriority(event.target.value as SupportPriority)}
                    className={inputClass}
                    aria-label="Change priority"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                )}
                <Button onClick={handleBulkApply}>Apply</Button>
              </div>
            )}
          </div>

          <NLFilterBar
            placeholder="Try: &quot;high priority open tickets from last week&quot;"
            availableFields={[
              {
                key: 'status',
                label: 'Status',
                type: 'enum',
                values: [
                  'open',
                  'in_progress',
                  'awaiting_agent',
                  'awaiting_customer',
                  'on_hold',
                  'resolved',
                  'closed',
                ],
              },
              { key: 'priority', label: 'Priority', type: 'enum', values: ['low', 'medium', 'high', 'urgent'] },
              { key: 'category', label: 'Category', type: 'string' },
              { key: 'assignee', label: 'Assignee', type: 'string' },
              { key: 'createdFrom', label: 'Created Date', type: 'date' },
              { key: 'createdTo', label: 'Created Date', type: 'date' },
            ] satisfies AvailableField[]}
            module="support"
            onFiltersApplied={(f) => setNlFilters(f)}
          />

          <DataTable
            data={tickets}
            columns={columns}
            isLoading={loading}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getRowId={(row) => row.id}
            onRowClick={(row) => setDetailTicketId(row.id)}
            pagination
            pageSize={PAGE_SIZE}
            currentPage={page}
            onPageChange={setPage}
            totalItems={total}
            sortable
            defaultSort={{ key: 'createdAt', direction: 'desc' }}
            onSort={(key, direction) => {
              const mapped =
                key === 'createdAt'
                  ? 'created_at'
                  : key === 'slaResolutionDue'
                    ? 'slaDue'
                    : key === 'ticketNumber'
                      ? 'ticketNumber'
                      : String(key);
              setSortBy(mapped);
              setSortDir(direction);
            }}
            rowClassName={(row) => cn(
              row.slaStatus === 'breached' && 'border-l-2 border-l-red-500',
            )}
            emptyMessage="No support tickets match the current filters."
          />
        </div>
      </div>

      <SlideOverPanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Ticket"
        width={560}
      >
        <TicketCreatePanel
          onCancel={() => setCreateOpen(false)}
          onCreated={(ticket) => {
            setCreateOpen(false);
            setDetailTicketId(ticket.id);
            fetchTickets();
            fetchMetrics();
          }}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={!!detailTicketId}
        onClose={() => setDetailTicketId(null)}
        title={detailTicketId ? 'Ticket Details' : 'Ticket'}
        width={760}
      >
        {detailTicketId && (
          <TicketDetailPanel
            ticketId={detailTicketId}
            onClose={() => setDetailTicketId(null)}
            onUpdated={() => {
              fetchTickets();
              fetchMetrics();
            }}
          />
        )}
      </SlideOverPanel>
    </div>
  );
}

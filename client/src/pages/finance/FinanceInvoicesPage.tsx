import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceInvoice, type InvoiceStats } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { KPICard } from '@/components/finance/KPICard';
import { cn } from '@/lib/utils';
import {
  Plus, Search, FileText, DollarSign, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, CheckSquare, Square, Send, Repeat, Play, Pause,
  Filter, X, Download, Calendar,
} from 'lucide-react';

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'partially_paid', label: 'Partial' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'voided', label: 'Voided' },
  { id: 'recurring', label: 'Recurring' },
];

const PAGE_SIZE = 20;

interface FinanceInvoicesPageProps {
  onCreateNew: () => void;
  onViewInvoice: (id: string) => void;
}

export function FinanceInvoicesPage({ onCreateNew, onViewInvoice }: FinanceInvoicesPageProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recurringInvoices, setRecurringInvoices] = useState<FinanceInvoice[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection = () => setSelectedIds([]);

  const fetchInvoices = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      if (statusFilter === 'recurring') {
        const rec = await financeAPI.listRecurringInvoices(userId);
        setRecurringInvoices(rec);
        setInvoices([]);
        setTotal(0);
        setStats(null);
        setLoading(false);
        return;
      }

      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      if (search) filters.search = search;
      filters.limit = String(PAGE_SIZE);
      filters.offset = String(page * PAGE_SIZE);

      const [data, st] = await Promise.all([
        financeAPI.listInvoices(userId, filters),
        financeAPI.getInvoiceStats(userId).catch(() => null),
      ]);
      setInvoices(data);
      setTotal(data.length);
      if (st) setStats(st);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter, search, page]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleBulkSend = async () => {
    if (selectedIds.length === 0) return;
    try {
      await financeAPI.bulkSendInvoices(userId, selectedIds);
      clearSelection();
      fetchInvoices();
    } catch (err) {
      console.error('Bulk send failed:', err);
    }
  };

  const handlePauseResume = async (id: string, isPaused: boolean) => {
    try {
      if (isPaused) await financeAPI.resumeRecurringInvoice(userId, id);
      else await financeAPI.pauseRecurringInvoice(userId, id);
      fetchInvoices();
    } catch (err) { console.error('Pause/resume failed:', err); }
  };

  const handleGenerate = async (id: string) => {
    try {
      await financeAPI.generateNextRecurrence(userId, id);
      fetchInvoices();
    } catch (err) { console.error('Generate failed:', err); }
  };

  const handleExportCSV = () => {
    const headers = ['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'];
    const dataToExport = filteredInvoices.length > 0 ? filteredInvoices : invoices;
    const rows = dataToExport.map((i) => [
      i.invoice_number, i.to_name, new Date(i.created_at).toLocaleDateString(),
      i.due_date ? new Date(i.due_date).toLocaleDateString() : '',
      String(i.grand_total), String(i.amount_paid),
      String(Number(i.grand_total) - Number(i.amount_paid)), i.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (dateFrom && new Date(inv.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(inv.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    if (amountMin && Number(inv.grand_total) < parseFloat(amountMin)) return false;
    if (amountMax && Number(inv.grand_total) > parseFloat(amountMax)) return false;
    if (clientFilter && !inv.to_name?.toLowerCase().includes(clientFilter.toLowerCase())) return false;
    if (search && !inv.invoice_number?.toLowerCase().includes(search.toLowerCase())
      && !inv.to_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const displayInvoices = filteredInvoices;

  const fmt = (n: number | string, cur = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(Number(n));

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Outstanding"
            value={fmt(stats.total_outstanding)}
            icon={DollarSign}
            subtitle={`${Number(stats.sent_count) + Number(stats.partial_count)} unpaid invoices`}
          />
          <KPICard
            title="Overdue"
            value={Number(stats.overdue_count)}
            icon={AlertTriangle}
            subtitle={fmt(stats.total_overdue)}
          />
          <KPICard
            title="Drafts"
            value={Number(stats.draft_count)}
            icon={FileText}
            subtitle="Ready to send"
          />
          <KPICard
            title="Paid"
            value={Number(stats.paid_count)}
            icon={Clock}
            subtitle="This period"
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none"
          />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            showFilters ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' : 'bg-white/5 border-white/10 text-app-muted hover:bg-white/10')}>
          <Filter className="h-4 w-4" /> Filters
        </button>
        <button onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:bg-white/10 hover:text-app-text">
          <Download className="h-4 w-4" /> Export CSV
        </button>
        <button onClick={onCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
          <Plus className="h-4 w-4" /> New Invoice
        </button>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Amount Min ($)</label>
              <input type="number" placeholder="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Amount Max ($)</label>
              <input type="number" placeholder="No limit" value={amountMax} onChange={(e) => setAmountMax(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Client</label>
              <input type="text" placeholder="Filter by client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
          </div>
          {(dateFrom || dateTo || amountMin || amountMax || clientFilter) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {dateFrom && <FilterChip label={`From: ${dateFrom}`} onRemove={() => setDateFrom('')} />}
              {dateTo && <FilterChip label={`To: ${dateTo}`} onRemove={() => setDateTo('')} />}
              {amountMin && <FilterChip label={`Min: $${amountMin}`} onRemove={() => setAmountMin('')} />}
              {amountMax && <FilterChip label={`Max: $${amountMax}`} onRemove={() => setAmountMax('')} />}
              {clientFilter && <FilterChip label={`Client: ${clientFilter}`} onRemove={() => setClientFilter('')} />}
              <button onClick={() => { setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax(''); setClientFilter(''); }}
                className="text-xs text-primary-400 hover:text-primary-300">Clear all</button>
            </div>
          )}
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setStatusFilter(tab.id); setPage(0); }}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
              statusFilter === tab.id
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-app-muted hover:text-app-text hover:bg-white/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recurring Tab View */}
      {statusFilter === 'recurring' ? (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-app-muted uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Template</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Frequency</th>
                <th className="px-4 py-3 text-left">Next Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">Loading...</td></tr>
              ) : recurringInvoices.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">
                  <Repeat className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No recurring invoices configured</p>
                </td></tr>
              ) : (
                recurringInvoices.map((inv) => {
                  const config = (inv as unknown as { recurring_config?: { frequency?: string; next_date?: string; paused?: boolean } }).recurring_config;
                  const isPaused = config?.paused ?? false;
                  return (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-primary-400">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-app-text">{inv.to_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-app-text">{fmt(inv.grand_total, inv.currency)}</td>
                      <td className="px-4 py-3 text-app-muted capitalize">{config?.frequency || '—'}</td>
                      <td className="px-4 py-3 text-app-muted text-xs">{config?.next_date || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', isPaused ? 'text-amber-400 bg-amber-500/20' : 'text-emerald-400 bg-emerald-500/20')}>
                          {isPaused ? 'Paused' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handlePauseResume(inv.id, isPaused)} className="p-1 hover:bg-white/10 rounded" title={isPaused ? 'Resume' : 'Pause'}>
                            {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
                          </button>
                          <button onClick={() => handleGenerate(inv.id)} className="p-1 hover:bg-white/10 rounded" title="Generate Next">
                            <Send className="h-3.5 w-3.5 text-primary-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <>

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-app-muted uppercase tracking-wide">
              <th className="p-3 text-left w-10">
                <button onClick={() => {
                  if (selectedIds.length === invoices.length) clearSelection();
                  else setSelectedIds(invoices.map((i) => i.id));
                }}>
                  {selectedIds.length === invoices.length && invoices.length > 0
                    ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="px-4 py-3 text-left">Invoice #</th>
              <th className="px-4 py-3 text-left">Client / Vendor</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td colSpan={8} className="px-4 py-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))
            ) : displayInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-app-muted">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No invoices found</p>
                  <button
                    onClick={onCreateNew}
                    className="mt-3 text-primary-400 hover:text-primary-300 text-sm font-medium"
                  >
                    Create your first invoice
                  </button>
                </td>
              </tr>
            ) : (
              displayInvoices.map((inv) => {
                const isOverdue = inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date();
                const displayStatus = isOverdue ? 'overdue' : inv.status;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => onViewInvoice(inv.id)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelection(inv.id)}>
                        {selectedIds.includes(inv.id) ? <CheckSquare className="h-4 w-4 text-primary-400" /> : <Square className="h-4 w-4 text-app-muted" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-primary-400">{inv.invoice_number}</span>
                    </td>
                    <td className="px-4 py-3 text-app-text font-medium">
                      {inv.to_name}
                      {inv.from_name && (
                        <span className="text-xs text-app-muted ml-1">from {inv.from_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-app-text">
                      {fmt(inv.grand_total, inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-app-muted">
                      {Number(inv.amount_paid) > 0 ? fmt(inv.amount_paid, inv.currency) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={displayStatus} />
                    </td>
                    <td className="px-4 py-3 text-app-muted text-xs">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {inv.due_date ? (
                        <span className={isOverdue ? 'text-red-400 font-medium' : 'text-app-muted'}>
                          {new Date(inv.due_date).toLocaleDateString()}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-app-muted">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-xl bg-app-card border border-white/10 shadow-xl backdrop-blur-xl z-50">
          <span className="text-sm text-app-text font-medium">{selectedIds.length} selected</span>
          <button onClick={handleBulkSend} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 text-sm font-medium hover:bg-primary-500/30">
            <Send className="h-3.5 w-3.5" /> Send Selected
          </button>
          <button onClick={clearSelection} className="px-4 py-1.5 rounded-lg bg-white/5 text-app-muted text-sm hover:bg-white/10">
            Clear
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-xs text-primary-400">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors"><X className="h-3 w-3" /></button>
    </span>
  );
}

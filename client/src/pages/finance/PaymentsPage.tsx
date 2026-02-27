import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinancePayment } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import {
  Search, CheckCircle, Loader2, CreditCard, ChevronDown, ChevronRight,
  Filter, Download, CheckSquare, Square,
} from 'lucide-react';

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

export function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection = () => setSelectedIds([]);

  const fetchPayments = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      const data = await financeAPI.listPayments(userId, filters);
      setPayments(data);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleComplete = async (paymentId: string) => {
    setCompleting(paymentId);
    try {
      await financeAPI.completePayment(userId, paymentId);
      await fetchPayments();
    } catch (err) {
      console.error('Complete payment failed:', err);
    } finally {
      setCompleting('');
    }
  };

  const handleBulkComplete = async () => {
    if (selectedIds.length === 0 || !confirm(`Complete ${selectedIds.length} payment(s)?`)) return;
    try {
      await financeAPI.bulkCompletePayments(userId, selectedIds);
      clearSelection();
      fetchPayments();
    } catch (err) {
      console.error('Bulk complete failed:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Payment #', 'Type', 'Recipient', 'Amount', 'Currency', 'Method', 'Status', 'Date'];
    const dataToExport = selectedIds.length > 0
      ? filteredPayments.filter((p) => selectedIds.includes(p.id))
      : filteredPayments;
    const rows = dataToExport.map((p) => [
      p.payment_number, p.payment_type || '', p.recipient_name || '',
      String(p.amount), p.currency, p.payment_method || '', p.status,
      new Date(p.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const fmt = (n: number | string, cur = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(Number(n));

  const filteredPayments = payments.filter((p) => {
    if (search && !p.payment_number?.toLowerCase().includes(search.toLowerCase()) &&
        !p.recipient_name?.toLowerCase().includes(search.toLowerCase()) &&
        !p.notes?.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && new Date(p.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(p.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    if (amountMin && Number(p.amount) < parseFloat(amountMin)) return false;
    if (amountMax && Number(p.amount) > parseFloat(amountMax)) return false;
    if (methodFilter && p.payment_method !== methodFilter) return false;
    return true;
  });

  const allSelected = filteredPayments.length > 0 && selectedIds.length === filteredPayments.length;
  const activeFilterCount = [dateFrom, dateTo, amountMin, amountMax, methodFilter].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Payments</h3>
        <button onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:bg-white/10 hover:text-app-text">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input type="text" placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
            showFilters || activeFilterCount > 0 ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' : 'bg-white/5 border-white/10 text-app-muted')}>
          <Filter className="h-4 w-4" /> Filters {activeFilterCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-500 text-white text-xs">{activeFilterCount}</span>}
        </button>
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setStatusFilter(tab.id)}
              className={cn('px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                statusFilter === tab.id ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text hover:bg-white/5')}>
              {tab.label}
            </button>
          ))}
        </div>
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
              <label className="block text-xs text-app-muted mb-1">Amount Min</label>
              <input type="number" placeholder="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Amount Max</label>
              <input type="number" placeholder="No limit" value={amountMax} onChange={(e) => setAmountMax(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Method</label>
              <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All Methods</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
                <option value="check">Check</option>
                <option value="paypal">PayPal</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-app-muted uppercase tracking-wide">
              <th className="p-3 text-left w-10">
                <button onClick={() => allSelected ? clearSelection() : setSelectedIds(filteredPayments.map((p) => p.id))}>
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3 text-left">Payment #</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Recipient</th>
              <th className="px-4 py-3 text-left">Method</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td colSpan={10} className="px-4 py-4"><div className="h-4 bg-white/10 rounded animate-pulse w-full" /></td>
                </tr>
              ))
            ) : filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-app-muted">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No payments found</p>
                </td>
              </tr>
            ) : (
              filteredPayments.map((pay) => {
                const isExpanded = expandedId === pay.id;
                return (
                  <tr key={pay.id} onClick={() => setExpandedId(isExpanded ? null : pay.id)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelection(pay.id)}>
                        {selectedIds.includes(pay.id) ? <CheckSquare className="h-4 w-4 text-primary-400" /> : <Square className="h-4 w-4 text-app-muted" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-app-muted">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3"><span className="font-mono font-medium text-primary-400">{pay.payment_number}</span></td>
                    <td className="px-4 py-3 text-app-muted capitalize text-xs">{pay.payment_type?.replace(/_/g, ' ') || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-app-text">{fmt(pay.amount, pay.currency)}</td>
                    <td className="px-4 py-3 text-app-text">{pay.recipient_name || '—'}</td>
                    <td className="px-4 py-3 text-app-muted text-xs capitalize">{pay.payment_method?.replace(/_/g, ' ') || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={pay.status} /></td>
                    <td className="px-4 py-3 text-app-muted text-xs">{new Date(pay.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {(pay.status === 'pending' || pay.status === 'processing') && (
                        <button onClick={(e) => { e.stopPropagation(); handleComplete(pay.id); }}
                          disabled={completing === pay.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 border border-green-500/20 disabled:opacity-50 ml-auto">
                          {completing === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {filteredPayments.length > 0 && (
          <div className="px-4 py-3 border-t border-white/10 text-xs text-app-muted">
            Showing {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-xl bg-app-card border border-white/10 shadow-xl backdrop-blur-xl z-50">
          <span className="text-sm text-app-text font-medium">{selectedIds.length} selected</span>
          <button onClick={handleBulkComplete}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30">
            <CheckCircle className="h-3.5 w-3.5" /> Complete Selected
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 text-app-muted text-sm font-medium hover:bg-white/15">
            <Download className="h-3.5 w-3.5" /> Export Selected
          </button>
          <button onClick={clearSelection} className="px-4 py-1.5 rounded-lg bg-white/5 text-app-muted text-sm hover:bg-white/10">Clear</button>
        </div>
      )}
    </div>
  );
}

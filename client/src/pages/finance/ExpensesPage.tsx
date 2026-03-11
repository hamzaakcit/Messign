import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore } from '@/stores/financeStore';
import { financeAPI, type Expense } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { SlideOverPanel } from '@/components/ui';
import { ExpenseDetailPanel } from './ExpenseDetailPanel';
import { ExpenseCreatePanel } from './ExpenseCreatePanel';
import { cn } from '@/lib/utils';
import {
  Plus, Search, ChevronLeft, ChevronRight, CheckSquare, Square,
  AlertTriangle, Shield, Paperclip, Filter, X, Calendar, DollarSign, Clock,
} from 'lucide-react';
import { financeAPI as slaApi, type SLAStatus } from '@/lib/financeApi';

const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'ai_reviewing', label: 'AI Reviewing' },
  { id: 'ai_approved', label: 'AI Approved' },
  { id: 'ai_flagged', label: 'Flagged' },
  { id: 'manager_review', label: 'Under Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'paid', label: 'Paid' },
];

const CATEGORIES = [
  { slug: '', label: 'All Categories' },
  { slug: 'travel_flight', label: 'Travel - Flights' },
  { slug: 'travel_hotel', label: 'Travel - Hotels' },
  { slug: 'travel_ground', label: 'Travel - Ground' },
  { slug: 'meals_business', label: 'Meals - Business' },
  { slug: 'meals_team', label: 'Meals - Team' },
  { slug: 'meals_client', label: 'Meals - Client' },
  { slug: 'office_supplies', label: 'Office Supplies' },
  { slug: 'office_equipment', label: 'Office Equipment' },
  { slug: 'software_subscription', label: 'Software' },
  { slug: 'marketing_ads', label: 'Marketing - Ads' },
  { slug: 'marketing_events', label: 'Marketing - Events' },
  { slug: 'training_course', label: 'Training' },
  { slug: 'professional_legal', label: 'Legal' },
  { slug: 'professional_consulting', label: 'Consulting' },
  { slug: 'utilities', label: 'Utilities' },
  { slug: 'other', label: 'Other' },
];

const RISK_LEVELS = [
  { id: '', label: 'All Risk' },
  { id: 'low', label: 'Low Risk' },
  { id: 'medium', label: 'Medium Risk' },
  { id: 'high', label: 'High Risk' },
];

const PAGE_SIZE = 20;

export function ExpensesPage() {
  const user = useAuthStore((s) => s.user);
  const {
    expenses, expensesTotal, expenseFilters,
    selectedExpenseIds, setExpenses, setExpenseFilters,
    toggleExpenseSelection, clearExpenseSelection, selectAllExpenses,
  } = useFinanceStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get('detail');
  const isCreating = searchParams.get('new') === 'true';

  const openDetail = (id: string) => setSearchParams({ detail: id });
  const openCreate = () => setSearchParams({ new: 'true' });
  const closePanel = () => setSearchParams({});
  const handleCreated = (id: string) => setSearchParams({ detail: id });

  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredAI, setHoveredAI] = useState<string | null>(null);

  const userId = user?.authUserId || user?.id || '';

  const fetchExpenses = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (expenseFilters.status) filters.status = expenseFilters.status;
      if (expenseFilters.search) filters.search = expenseFilters.search;
      if (expenseFilters.category_slug) filters.category_slug = expenseFilters.category_slug;
      if (expenseFilters.date_from) filters.date_from = expenseFilters.date_from;
      if (expenseFilters.date_to) filters.date_to = expenseFilters.date_to;
      if (expenseFilters.amount_min) filters.amount_min = expenseFilters.amount_min;
      if (expenseFilters.amount_max) filters.amount_max = expenseFilters.amount_max;
      if (expenseFilters.risk_level) filters.risk_level = expenseFilters.risk_level;
      if (expenseFilters.sort_by) filters.sort_by = expenseFilters.sort_by;
      if (expenseFilters.sort_dir) filters.sort_dir = expenseFilters.sort_dir;
      filters.limit = String(PAGE_SIZE);
      filters.offset = String(page * PAGE_SIZE);

      const result = await financeAPI.listExpenses(userId, filters);
      setExpenses(result);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, expenseFilters, page, setExpenses]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleStatusTab = (status: string) => {
    setExpenseFilters({ status: status || undefined });
    setPage(0);
    clearExpenseSelection();
  };

  const handleSearch = () => {
    setExpenseFilters({ search: searchInput || undefined });
    setPage(0);
  };

  const handleBulkApprove = async () => {
    if (selectedExpenseIds.length === 0) return;
    try {
      await financeAPI.bulkApprove(userId, selectedExpenseIds);
      clearExpenseSelection();
      fetchExpenses();
    } catch (err) {
      console.error('Bulk approve failed:', err);
    }
  };

  const handleBulkReject = async () => {
    if (selectedExpenseIds.length === 0) return;
    const reason = prompt('Rejection reason for all selected expenses:');
    if (!reason) return;
    try {
      await financeAPI.bulkReject(userId, selectedExpenseIds, reason);
      clearExpenseSelection();
      fetchExpenses();
    } catch (err) {
      console.error('Bulk reject failed:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Title', 'Submitter', 'Date', 'Amount', 'Currency', 'Status'];
    const rows = expenses.map((e) => [
      e.title, e.submitter_name || '', e.expense_date, String(e.original_amount),
      e.original_currency, e.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeFilter = (key: string) => {
    setExpenseFilters({ [key]: undefined });
    setPage(0);
  };

  const activeFilterCount = [
    expenseFilters.category_slug, expenseFilters.date_from, expenseFilters.date_to,
    expenseFilters.amount_min, expenseFilters.amount_max, expenseFilters.risk_level,
  ].filter(Boolean).length;

  const totalPages = Math.ceil(expensesTotal / PAGE_SIZE);
  const allSelected = expenses.length > 0 && selectedExpenseIds.length === expenses.length;

  const fmt = (amount: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const fmtDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleStatusTab(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              (expenseFilters.status ?? '') === tab.id
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-app-muted hover:text-app-text hover:bg-white/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            showFilters || activeFilterCount > 0
              ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
              : 'bg-white/5 border-white/10 text-app-muted hover:bg-white/10',
          )}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary-500 text-white text-xs">{activeFilterCount}</span>
          )}
        </button>
        <button
          data-testid="expense-new"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Expense
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Category</label>
              <select
                value={expenseFilters.category_slug || ''}
                onChange={(e) => { setExpenseFilters({ category_slug: e.target.value || undefined }); setPage(0); }}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
              >
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Date From</label>
              <input
                type="date"
                value={expenseFilters.date_from || ''}
                onChange={(e) => { setExpenseFilters({ date_from: e.target.value || undefined }); setPage(0); }}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Date To</label>
              <input
                type="date"
                value={expenseFilters.date_to || ''}
                onChange={(e) => { setExpenseFilters({ date_to: e.target.value || undefined }); setPage(0); }}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Amount Range</label>
              <div className="flex items-center gap-1">
                <input
                  type="number" placeholder="Min"
                  value={expenseFilters.amount_min || ''}
                  onChange={(e) => { setExpenseFilters({ amount_min: e.target.value || undefined }); setPage(0); }}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
                />
                <span className="text-xs text-app-muted">—</span>
                <input
                  type="number" placeholder="Max"
                  value={expenseFilters.amount_max || ''}
                  onChange={(e) => { setExpenseFilters({ amount_max: e.target.value || undefined }); setPage(0); }}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Risk Level</label>
              <select
                value={expenseFilters.risk_level || ''}
                onChange={(e) => { setExpenseFilters({ risk_level: e.target.value || undefined }); setPage(0); }}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none"
              >
                {RISK_LEVELS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {expenseFilters.category_slug && (
            <FilterChip label={`Category: ${CATEGORIES.find((c) => c.slug === expenseFilters.category_slug)?.label ?? expenseFilters.category_slug}`} onRemove={() => removeFilter('category_slug')} />
          )}
          {expenseFilters.date_from && (
            <FilterChip label={`From: ${expenseFilters.date_from}`} onRemove={() => removeFilter('date_from')} icon={<Calendar className="h-3 w-3" />} />
          )}
          {expenseFilters.date_to && (
            <FilterChip label={`To: ${expenseFilters.date_to}`} onRemove={() => removeFilter('date_to')} icon={<Calendar className="h-3 w-3" />} />
          )}
          {expenseFilters.amount_min && (
            <FilterChip label={`Min: $${expenseFilters.amount_min}`} onRemove={() => removeFilter('amount_min')} icon={<DollarSign className="h-3 w-3" />} />
          )}
          {expenseFilters.amount_max && (
            <FilterChip label={`Max: $${expenseFilters.amount_max}`} onRemove={() => removeFilter('amount_max')} icon={<DollarSign className="h-3 w-3" />} />
          )}
          {expenseFilters.risk_level && (
            <FilterChip label={`Risk: ${expenseFilters.risk_level}`} onRemove={() => removeFilter('risk_level')} icon={<Shield className="h-3 w-3" />} />
          )}
          <button
            onClick={() => {
              setExpenseFilters({ category_slug: undefined, date_from: undefined, date_to: undefined, amount_min: undefined, amount_max: undefined, risk_level: undefined });
              setPage(0);
            }}
            className="text-xs text-primary-400 hover:text-primary-300"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-xs text-app-muted uppercase tracking-wide">
              <th className="p-3 text-left w-10">
                <button onClick={allSelected ? clearExpenseSelection : selectAllExpenses}>
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="p-3 text-left w-8"></th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-center w-20">AI Score</th>
              <th className="p-3 text-center w-24">SLA</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-app-muted">Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-app-muted">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>No expenses found</p>
                <button onClick={openCreate} className="mt-3 text-primary-400 hover:text-primary-300 text-sm font-medium">
                  Create your first expense
                </button>
              </td></tr>
            ) : (
              expenses.map((expense) => (
                <tr
                  key={expense.id}
                  onClick={() => openDetail(expense.id)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleExpenseSelection(expense.id)}>
                      {selectedExpenseIds.includes(expense.id)
                        ? <CheckSquare className="h-4 w-4 text-primary-400" />
                        : <Square className="h-4 w-4 text-app-muted" />}
                    </button>
                  </td>
                  <td className="p-3">
                    {expense.receipt_url && <Paperclip className="h-3.5 w-3.5 text-app-muted" />}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-app-text text-sm">{expense.title}</div>
                    <div className="text-xs text-app-muted">{expense.submitter_name}</div>
                  </td>
                  <td className="p-3 text-sm text-app-muted">{fmtDate(expense.expense_date)}</td>
                  <td className="p-3 text-sm text-app-text text-right font-medium">
                    {fmt(expense.original_amount, expense.original_currency)}
                  </td>
                  <td className="p-3"><StatusBadge status={expense.status} /></td>
                  <td className="p-3 text-center relative"
                    onMouseEnter={() => setHoveredAI(expense.id)}
                    onMouseLeave={() => setHoveredAI(null)}
                  >
                    {expense.ai_confidence_score != null ? (
                      <>
                        <AIScoreBadge confidence={expense.ai_confidence_score} risk={expense.ai_risk_score} />
                        {hoveredAI === expense.id && (
                          <AIScoreTooltip expense={expense} />
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-app-muted">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <SLAIndicator status={expense.status} expenseId={expense.id} userId={userId} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
            <span className="text-xs text-app-muted">
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, expensesTotal)} of {expensesTotal}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-app-text">{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedExpenseIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-xl bg-app-card border border-white/10 shadow-xl backdrop-blur-xl z-50">
          <span className="text-sm text-app-text font-medium">{selectedExpenseIds.length} selected</span>
          <button onClick={handleBulkApprove} className="px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30">
            Approve Selected
          </button>
          <button onClick={handleBulkReject} className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30">
            Reject Selected
          </button>
          <button onClick={handleExportCSV} className="px-4 py-1.5 rounded-lg bg-white/10 text-app-muted text-sm font-medium hover:bg-white/15">
            Export CSV
          </button>
          <button onClick={clearExpenseSelection} className="px-4 py-1.5 rounded-lg bg-white/5 text-app-muted text-sm hover:bg-white/10">
            Clear
          </button>
        </div>
      )}

      {/* Detail Slide-Over */}
      <SlideOverPanel
        isOpen={!!detailId}
        onClose={closePanel}
        title="Expense Detail"
      >
        {detailId && (
          <ExpenseDetailPanel
            expenseId={detailId}
            onClose={closePanel}
          />
        )}
      </SlideOverPanel>

      {/* Create Slide-Over */}
      <SlideOverPanel
        isOpen={isCreating}
        onClose={closePanel}
        title="New Expense"
      >
        <ExpenseCreatePanel
          onClose={closePanel}
          onCreated={handleCreated}
        />
      </SlideOverPanel>
    </div>
  );
}

function FilterChip({ label, onRemove, icon }: { label: string; onRemove: () => void; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-xs text-primary-400">
      {icon}
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors"><X className="h-3 w-3" /></button>
    </span>
  );
}

function AIScoreBadge({ confidence, risk }: { confidence: number; risk?: number | null }) {
  const score = Math.round(confidence * 100);
  const color = score >= 85 ? 'text-emerald-400 bg-emerald-500/10' : score >= 50 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
  const riskIcon = risk != null ? (
    risk >= 0.7 ? <AlertTriangle className="h-3 w-3 text-red-400" /> :
    risk >= 0.3 ? <AlertTriangle className="h-3 w-3 text-amber-400" /> :
    <Shield className="h-3 w-3 text-emerald-400" />
  ) : null;

  return (
    <div className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium', color)}>
      {riskIcon}
      {score}
    </div>
  );
}

function AIScoreTooltip({ expense }: { expense: Expense }) {
  const policyResult = expense.ai_policy_result as { passed?: boolean; violations?: unknown[] } | null;
  const duplicateRefs = expense.ai_duplicate_refs as string[] | null;
  const hasDups = duplicateRefs && duplicateRefs.length > 0;

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-56 p-3 rounded-lg bg-[#1a1a2e] border border-white/10 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-medium text-app-text mb-2 flex items-center gap-1"><Shield className="h-3 w-3 text-primary-400" /> AI Analysis</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-app-muted">Confidence</span>
          <span className={cn('font-medium', (expense.ai_confidence_score ?? 0) >= 0.85 ? 'text-emerald-400' : 'text-amber-400')}>
            {Math.round((expense.ai_confidence_score ?? 0) * 100)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-app-muted">Risk</span>
          <span className={cn('font-medium', (expense.ai_risk_score ?? 0) <= 0.3 ? 'text-emerald-400' : (expense.ai_risk_score ?? 0) <= 0.7 ? 'text-amber-400' : 'text-red-400')}>
            {(expense.ai_risk_score ?? 0) <= 0.3 ? 'Low' : (expense.ai_risk_score ?? 0) <= 0.7 ? 'Medium' : 'High'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-app-muted">Policy</span>
          <span className={policyResult?.passed ? 'text-emerald-400' : 'text-red-400'}>
            {policyResult ? (policyResult.passed ? 'Pass' : `Fail (${policyResult.violations?.length ?? 0})`) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-app-muted">Duplicate</span>
          <span className={hasDups ? 'text-amber-400' : 'text-emerald-400'}>
            {hasDups ? `${duplicateRefs.length} found` : 'None'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SLAIndicator({ status, expenseId, userId }: { status: string; expenseId: string; userId: string }) {
  const [sla, setSla] = useState<SLAStatus | null>(null);
  const pending = ['submitted', 'manager_review', 'ai_reviewing', 'ai_flagged', 'pending_approval'].includes(status);

  useEffect(() => {
    if (!pending || !userId) return;
    slaApi.getSLAStatus(userId, expenseId).then(setSla).catch(() => {});
  }, [expenseId, userId, pending]);

  if (!pending) return <span className="text-xs text-app-muted">—</span>;
  if (!sla) return <span className="text-xs text-app-muted">—</span>;

  const color = sla.status === 'on_track' ? 'text-emerald-400 bg-emerald-500/10' :
    sla.status === 'warning' ? 'text-amber-400 bg-amber-500/10' :
    'text-red-400 bg-red-500/10';

  return (
    <div className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium', color, sla.status === 'overdue' && 'animate-pulse')}>
      <Clock className="h-3 w-3" />
      {sla.elapsed_hours}h
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useFinanceStore, type FinanceView } from '@/stores/financeStore';
import { financeAPI, type DashboardMetrics, type FinanceSettings } from '@/lib/financeApi';
import type { Budget } from '@/lib/api';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { NotificationBell } from '@/components/finance/NotificationBell';
import { DoraInsightBar as FinanceDoraInsightBar } from '@/components/finance/DoraInsightBar';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { SpendingTrendChart } from '@/components/finance/SpendingTrendChart';
import { CurrencyDisplay } from '@/components/finance/CurrencyDisplay';
import { ExpensesPage } from '@/pages/finance/ExpensesPage';
import { FinanceInvoicesPage } from '@/pages/finance/FinanceInvoicesPage';
import { InvoiceFormPage } from '@/pages/finance/InvoiceFormPage';
import { InvoiceDetailPage } from '@/pages/finance/InvoiceDetailPage';
import { PaymentsPage } from '@/pages/finance/PaymentsPage';
import { BudgetsPage } from '@/pages/finance/BudgetsPage';
import { BudgetDetailPage } from '@/pages/finance/BudgetDetailPage';
import { VendorsPage } from '@/pages/finance/VendorsPage';
import { VendorDetailPage } from '@/pages/finance/VendorDetailPage';
import { AccountingPage } from '@/pages/finance/AccountingPage';
import { SettingsPage } from '@/pages/finance/SettingsPage';
import { AuditLogPage } from '@/pages/finance/AuditLogPage';
import { ReportsPage } from '@/pages/finance/ReportsPage';
import { parseFinanceViewFromPathname, financePathForView } from '@/lib/financeRoutes';
import { hasFinanceElevatedAccess } from '@/lib/financeRbac';
import { cn } from '@/lib/utils';
import {
  Clock,
  TrendingUp,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  FileText,
  PiggyBank,
  Plus,
  BarChart3,
  Receipt,
  ClipboardList,
} from 'lucide-react';

type SubView = 'list' | 'new' | 'edit' | 'detail';

const RESTRICTED_VIEWS: FinanceView[] = ['audit', 'settings', 'payments', 'reports'];

export function FinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuthStore();
  const { activeView, setActiveView } = useFinanceStore();
  const [subView, setSubView] = useState<SubView>('list');
  const [selectedId, setSelectedId] = useState('');
  const elevated = hasFinanceElevatedAccess(user, isAdmin);

  useEffect(() => {
    const v = parseFinanceViewFromPathname(location.pathname);
    setActiveView(v);
  }, [location.pathname, setActiveView]);

  useEffect(() => {
    if (elevated) return;
    if (RESTRICTED_VIEWS.includes(activeView)) {
      setActiveView('overview');
      navigate('/finance', { replace: true });
    }
  }, [elevated, activeView, navigate, setActiveView]);

  useEffect(() => {
    if (activeView !== 'expenses') {
      setSubView('list');
      setSelectedId('');
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'invoices' && activeView !== 'budgets') return;
    const inv = searchParams.get('invoice');
    const bud = searchParams.get('budget');
    if (activeView === 'invoices' && inv) {
      setSelectedId(inv);
      setSubView('detail');
    }
    if (activeView === 'budgets' && bud) {
      setSelectedId(bud);
      setSubView('detail');
    }
  }, [activeView, searchParams]);

  const handleView = (id: string) => {
    setSelectedId(id);
    setSubView('detail');
  };
  const handleCreate = () => setSubView('new');
  const handleBack = () => {
    setSubView('list');
    if (activeView === 'invoices') {
      navigate('/finance/invoices', { replace: true });
    } else if (activeView === 'budgets') {
      navigate('/finance/budgets', { replace: true });
    }
  };
  const handleCreated = (id: string) => {
    setSelectedId(id);
    setSubView('detail');
  };

  const handleNotifNavigate = (entityType: string, entityId: string) => {
    if (entityType === 'expense') {
      setActiveView('expenses');
      navigate(`/finance/expenses?detail=${encodeURIComponent(entityId)}`);
    } else if (entityType === 'invoice') {
      setActiveView('invoices');
      navigate(`/finance/invoices?invoice=${encodeURIComponent(entityId)}`);
      setSelectedId(entityId);
      setSubView('detail');
    } else if (entityType === 'budget') {
      setActiveView('budgets');
      navigate(`/finance/budgets?budget=${encodeURIComponent(entityId)}`);
      setSelectedId(entityId);
      setSubView('detail');
    }
  };

  const goOverview = useCallback(
    (view: FinanceView, id?: string) => {
      setActiveView(view);
      if (view === 'expenses' && id) {
        navigate(`/finance/expenses?detail=${encodeURIComponent(id)}`);
        return;
      }
      if (view === 'invoices' && id) {
        setSelectedId(id);
        setSubView('detail');
        navigate(`/finance/invoices?invoice=${encodeURIComponent(id)}`);
        return;
      }
      if (view === 'budgets' && id) {
        setSelectedId(id);
        setSubView('detail');
        navigate(`/finance/budgets?budget=${encodeURIComponent(id)}`);
        return;
      }
      navigate(financePathForView(view));
    },
    [navigate, setActiveView],
  );

  const renderContent = () => {
    if (activeView === 'expenses') {
      return <ExpensesPage />;
    }
    if (activeView === 'invoices') {
      if (subView === 'new') return <InvoiceFormPage onBack={handleBack} onSaved={handleCreated} />;
      if (subView === 'edit')
        return (
          <InvoiceFormPage
            invoiceId={selectedId}
            onBack={() => setSubView('detail')}
            onSaved={(id) => {
              setSelectedId(id);
              setSubView('detail');
            }}
          />
        );
      if (subView === 'detail')
        return (
          <InvoiceDetailPage
            invoiceId={selectedId}
            onBack={handleBack}
            onEdit={(id) => {
              setSelectedId(id);
              setSubView('edit');
            }}
          />
        );
      return <FinanceInvoicesPage onCreateNew={handleCreate} onViewInvoice={handleView} />;
    }
    if (activeView === 'payments') return <PaymentsPage />;
    if (activeView === 'budgets') {
      if (subView === 'detail') return <BudgetDetailPage budgetId={selectedId} onBack={handleBack} />;
      return <BudgetsPage onViewBudget={handleView} />;
    }
    if (activeView === 'vendors') {
      if (subView === 'detail') return <VendorDetailPage vendorId={selectedId} onBack={handleBack} />;
      return <VendorsPage onCreateNew={handleCreate} onViewVendor={handleView} />;
    }
    if (activeView === 'accounting') return <AccountingPage />;
    if (activeView === 'reports') return <ReportsPage />;
    if (activeView === 'audit') return <AuditLogPage />;
    if (activeView === 'settings') return <SettingsPage />;
    return <OverviewTab onNavigate={goOverview} />;
  };

  const userId = user?.authUserId || user?.id || '';
  const [doraInsights, setDoraInsights] = useState<
    Array<{
      type: 'info' | 'warning' | 'suggestion' | 'success';
      title: string;
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    }>
  >([]);

  useEffect(() => {
    if (!userId) return;
    financeAPI
      .getDoraInsights(userId)
      .then(({ insights }) => {
        setDoraInsights(
          insights.map((i) => ({
            type: i.type,
            title: i.title,
            message: i.message,
            actionLabel: i.action_label,
            onAction: i.action_url
              ? () => {
                  try {
                    const u = new URL(i.action_url!, window.location.origin);
                    navigate(u.pathname + u.search);
                  } catch {
                    const parts = i.action_url!.split('/');
                    const view = parts[2]?.split('?')[0] as FinanceView;
                    if (view) {
                      navigate(financePathForView(view));
                      setActiveView(view);
                    }
                  }
                }
              : undefined,
          })),
        );
      })
      .catch(() => {});
  }, [userId, activeView, navigate, setActiveView]);

  return (
    <div className="flex-1 flex min-h-0">
      <FinanceNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-app-text">Financial Management</h1>
              <p className="text-app-muted text-sm mt-1">Expenses, invoices, and budget tracking — powered by Dora AI</p>
            </div>
            <NotificationBell onNavigate={handleNotifNavigate} />
          </div>
          <div className="px-6 pb-2">
            {doraInsights.length > 0 ? (
              <FinanceDoraInsightBar insights={doraInsights} />
            ) : (
              <DoraInsightBar module="finance" />
            )}
          </div>
          <div className="p-6 pt-0">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ onNavigate }: { onNavigate: (view: FinanceView, id?: string) => void }) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const overviewQuery = useQuery({
    queryKey: ['financeOverview', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<{
      metrics: DashboardMetrics | null;
      budgets: Budget[];
      activity: Array<{ type: string; id: string; title: string; amount?: number; status: string; created_at: string }>;
      pendingApprovals: Array<{
        id: string;
        type: string;
        title: string;
        amount: number;
        submitted_by_name: string;
        created_at: string;
      }>;
      settings: FinanceSettings | null;
    }> => {
      const [dash, activeBudgets, act, approvals, settings] = await Promise.all([
        financeAPI.getDashboard(userId),
        financeAPI.listBudgets(userId, { active: 'true' }),
        financeAPI.getRecentActivity(userId, 8),
        financeAPI.getPendingApprovals(userId),
        financeAPI.getSettings(userId).catch(() => null),
      ]);
      return {
        metrics: dash,
        budgets: activeBudgets as Budget[],
        activity: act,
        pendingApprovals: approvals,
        settings,
      };
    },
  });

  useEffect(() => {
    if (overviewQuery.isError && overviewQuery.error) {
      toast.error(
        overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Failed to load finance overview',
      );
    }
  }, [overviewQuery.isError, overviewQuery.error]);

  if (overviewQuery.isPending || !overviewQuery.data) {
    if (overviewQuery.isError) {
      return (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 text-center space-y-3">
          <p className="text-app-muted text-sm">Could not load overview.</p>
          <button
            type="button"
            onClick={() => overviewQuery.refetch()}
            className="px-4 py-2 rounded-lg bg-primary-500/15 text-primary-400 text-sm font-medium hover:bg-primary-500/25"
          >
            Retry
          </button>
        </div>
      );
    }
    return <LoadingSkeleton />;
  }

  const { metrics, budgets, activity, pendingApprovals, settings } = overviewQuery.data;
  const baseCurrency = settings?.base_currency || 'USD';

  const alertBudgets = budgets.filter((b) => b.utilizationPct >= b.alertThreshold);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate('expenses')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500/10 text-primary-400 text-sm font-medium hover:bg-primary-500/20 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Expense
        </button>
        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
        >
          <Receipt className="h-4 w-4" /> New Invoice
        </button>
        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-app-surface-tertiary text-app-muted text-sm font-medium hover:bg-app-hover hover:text-app-text transition-colors"
        >
          <BarChart3 className="h-4 w-4" /> View Reports
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Pending Expenses"
          value={metrics?.pending_expenses.count ?? 0}
          subtitle={
            <span>
              <CurrencyDisplay amount={metrics?.pending_expenses.total ?? 0} currency={baseCurrency} /> total
            </span>
          }
          icon={Clock}
        />
        <KPICard
          title="Under Review"
          value={metrics?.under_review.count ?? 0}
          subtitle={`${(metrics?.under_review.avg_days ?? 0).toFixed(1)} days avg`}
          icon={CheckCircle}
        />
        <KPICard
          title="Approved This Month"
          value={metrics?.approved_this_month.count ?? 0}
          subtitle={
            <span>
              <CurrencyDisplay amount={metrics?.approved_this_month.total ?? 0} currency={baseCurrency} />
            </span>
          }
          icon={TrendingUp}
        />
        <KPICard
          title="Total Paid YTD"
          value={
            <CurrencyDisplay amount={metrics?.total_paid_ytd ?? 0} currency={baseCurrency} notation="compact" />
          }
          icon={DollarSign}
        />
      </div>

      {alertBudgets.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-amber-400">Budget Alerts</h3>
          </div>
          <div className="space-y-2">
            {alertBudgets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onNavigate('budgets', b.id)}
                className="w-full flex items-center justify-between text-sm hover:bg-amber-500/10 px-2 py-1 rounded transition-colors"
              >
                <span className="text-app-text">{b.department}</span>
                <span className={cn('font-medium', b.utilizationPct >= 1 ? 'text-red-400' : 'text-amber-400')}>
                  {(b.utilizationPct * 100).toFixed(1)}% — {b.currency}{' '}
                  {new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    b.remaining,
                  )}{' '}
                  left
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
        <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Spending Trend (6 months)
        </h3>
        <SpendingTrendChart />
      </div>

      {budgets.length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Department Budget Comparison
          </h3>
          <div className="space-y-3">
            {budgets
              .slice(0, 8)
              .sort((a, b) => b.spent - a.spent)
              .map((b) => {
                const pct = b.allocatedAmount > 0 ? Math.min((b.spent / b.allocatedAmount) * 100, 100) : 0;
                const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-500';
                return (
                  <div key={b.id} className="flex items-center gap-3">
                    <span className="text-xs text-app-muted w-28 truncate shrink-0">{b.department}</span>
                    <div className="flex-1 h-5 bg-app-surface-tertiary rounded-full overflow-hidden relative">
                      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-app-text/80">
                        <CurrencyDisplay amount={b.spent} currency={baseCurrency} notation="compact" /> /{' '}
                        <CurrencyDisplay amount={b.allocatedAmount} currency={baseCurrency} notation="compact" />
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium w-12 text-right',
                        pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-emerald-400',
                      )}
                    >
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Pending Approvals
          </h3>
          {pendingApprovals.length === 0 ? (
            <p className="text-app-muted text-sm">No items awaiting your approval.</p>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.slice(0, 5).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onNavigate('expenses', a.id)}
                  className="w-full text-left hover:bg-app-nav-hover rounded-lg p-2 transition-colors"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-app-text font-medium truncate">{a.title}</span>
                    <span className="text-app-text font-medium shrink-0 ml-2">
                      <CurrencyDisplay amount={parseFloat(String(a.amount))} currency={baseCurrency} />
                    </span>
                  </div>
                  <p className="text-xs text-app-muted">
                    {a.submitted_by_name} &middot; {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <PiggyBank className="h-4 w-4" /> Budget Health
          </h3>
          {budgets.length === 0 ? (
            <p className="text-app-muted text-sm">No active budgets configured.</p>
          ) : (
            <div className="space-y-4">
              {budgets.slice(0, 5).map((b) => {
                const pct = Math.min(b.utilizationPct * 100, 100);
                const barColor =
                  b.utilizationPct >= 1 ? 'bg-red-500' : b.utilizationPct >= b.alertThreshold ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onNavigate('budgets', b.id)}
                    className="w-full text-left space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-app-text font-medium">{b.department}</span>
                      <span className="text-app-text font-medium">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-app-surface-tertiary rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Recent Activity
          </h3>
          {activity.length === 0 ? (
            <p className="text-app-muted text-sm">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 6).map((a) => (
                <button
                  key={`${a.type}-${a.id}`}
                  type="button"
                  onClick={() => onNavigate(a.type === 'expense' ? 'expenses' : 'invoices', a.id)}
                  className="w-full flex items-center justify-between text-sm hover:bg-app-nav-hover rounded-lg p-1 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
                        a.type === 'expense' ? 'text-blue-400 bg-blue-500/20' : 'text-green-400 bg-green-500/20',
                      )}
                    >
                      {a.type === 'expense' ? 'EXP' : 'INV'}
                    </span>
                    <span className="text-app-text truncate">{a.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {a.amount != null && (
                      <span className="text-app-muted text-xs">
                        <CurrencyDisplay amount={parseFloat(String(a.amount))} currency={baseCurrency} notation="compact" />
                      </span>
                    )}
                    <StatusBadge status={a.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 animate-pulse">
          <div className="h-4 bg-app-surface-tertiary rounded w-1/3 mb-3" />
          <div className="h-3 bg-app-surface-tertiary rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

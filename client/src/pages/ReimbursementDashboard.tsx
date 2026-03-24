import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useReimbursementContext } from '@/contexts/ReimbursementContext';
import { reimbursementAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { Plus, FileText, Clock, CheckCircle, DollarSign, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  manager_review: 'Manager Review',
  finance_review: 'Finance Review',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-app-muted',
  submitted: 'bg-blue-500/20 text-blue-400',
  manager_review: 'bg-amber-500/20 text-amber-400',
  finance_review: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  paid: 'bg-purple-500/20 text-purple-400',
};

export function ReimbursementDashboard() {
  const { user } = useAuthStore();
  const reimbContext = useReimbursementContext();
  const navigate = useNavigate();
  const [fullList, setFullList] = useState<unknown[]>([]);
  const [stats, setStats] = useState<{
    pendingCount: number;
    underReviewCount: number;
    approvedThisMonth: number;
    totalReimbursed: number;
  }>({ pendingCount: 0, underReviewCount: 0, approvedThisMonth: 0, totalReimbursed: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.all([
      reimbursementAPI.list(user.id),
      reimbursementAPI.getCounts(user.id),
    ])
      .then(([listData, countsData]) => {
        if (cancelled) return;
        setFullList(Array.isArray(listData) ? listData : []);
        const c = countsData as {
          myPendingCount?: number;
          underReviewCount?: number;
          approvedThisMonth?: number;
          totalReimbursedYtd?: number;
        };
        setStats({
          pendingCount: c.myPendingCount ?? 0,
          underReviewCount: c.underReviewCount ?? 0,
          approvedThisMonth: c.approvedThisMonth ?? 0,
          totalReimbursed: c.totalReimbursedYtd ?? 0,
        });
        reimbContext?.refreshCounts();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, reimbContext?.refreshCounts]);

  const items = fullList as Array<Record<string, unknown>>;
  const list = statusFilter
    ? items.filter((r) => r.status === statusFilter)
    : items.filter((r) => r.status !== 'draft');

  const { pendingCount, underReviewCount, approvedThisMonth, totalReimbursed } = stats;
  const recentList = items.filter((r) => r.status !== 'draft').slice(-5).reverse();

  const tabs = [
    { id: '', label: 'All' },
    { id: 'submitted', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'paid', label: 'Paid' },
    { id: 'rejected', label: 'Rejected' },
  ];

  const statCards = [
    { label: 'Pending', value: String(pendingCount), icon: Clock, accent: 'amber', borderClass: 'border-l-amber-500', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
    { label: 'Under Review', value: String(underReviewCount), icon: FileText, accent: 'blue', borderClass: 'border-l-blue-500', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' },
    { label: 'Approved This Month', value: String(approvedThisMonth), icon: CheckCircle, accent: 'emerald', borderClass: 'border-l-emerald-500', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' },
    { label: 'Total Reimbursed YTD', value: totalReimbursed.toFixed(2), icon: DollarSign, accent: 'purple', borderClass: 'border-l-purple-500', iconBg: 'bg-purple-500/20', iconColor: 'text-purple-400' },
  ];

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-semibold text-app">Reimbursements</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {reimbContext?.showApprovals && (reimbContext?.pendingApprovalsCount ?? 0) > 0 && (
              <Link
                to="/admin/reimbursements"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 text-sm font-medium hover:bg-amber-500/30 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                Review pending approvals ({reimbContext.pendingApprovalsCount})
              </Link>
            )}
            <Button onClick={() => navigate('/reimbursements/new')} className="inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              New Request
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, borderClass, iconBg, iconColor }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-4 flex-1 min-w-0 rounded-xl border border-app-border bg-app-sidebar p-4 border-l-4',
                borderClass
              )}
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
                <Icon className={cn('w-5 h-5', iconColor)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">{label}</p>
                <p className="text-xl font-bold text-app mt-0.5 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {recentList.length > 0 && (
          <div className="rounded-xl border border-app-border bg-app-sidebar overflow-hidden">
            <h3 className="px-4 py-3 border-b border-app-border text-sm font-semibold text-app flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Recent requests
            </h3>
            <div className="divide-y divide-app-border">
              {recentList.map((r: any) => {
              const dateStr = r.expense_date
                ? (() => {
                    const d = new Date(r.expense_date);
                    return isNaN(d.getTime()) ? r.expense_date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  })()
                : '—';
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-app-hover transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-app truncate">{r.title}</p>
                    <p className="text-xs text-app-muted mt-0.5">
                      {dateStr} · {r.category_name || r.category_id || '—'}
                      {r.id && <span className="ml-1 font-mono text-app-muted">#{r.id}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-app">
                      {(r.converted_amount ?? r.original_amount) ?? 0} {r.original_currency}
                    </span>
                    <span className={cn('px-2 py-1 rounded text-xs font-medium', STATUS_COLORS[r.status] || 'bg-gray-500/20 text-app-muted')}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    <button
                      onClick={() => navigate(`/reimbursements/${r.id}`)}
                      className="text-primary-400 hover:text-primary-300 text-sm font-medium"
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                statusFilter === tab.id ? 'bg-primary-500 text-app-text' : 'bg-app-hover text-app-muted hover:text-app'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-app-border bg-app-sidebar overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-app-muted">Loading...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-app-muted">No requests yet. Create one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-app-border text-left text-sm text-app-muted">
                    <th className="p-3">Date</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r: any) => (
                    <tr key={r.id} className="border-b border-app-border hover:bg-app-hover transition-colors">
                      <td className="p-3 text-app">{r.expense_date}</td>
                      <td className="p-3 text-app">{r.title}</td>
                      <td className="p-3 text-app-muted">{r.category_name || r.category_id}</td>
                      <td className="p-3 text-app">
                        {(r.converted_amount ?? r.original_amount) ?? 0} {r.original_currency}
                      </td>
                      <td className="p-3">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium', STATUS_COLORS[r.status] || 'bg-gray-500/20 text-app-muted')}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => navigate(`/reimbursements/${r.id}`)}
                          className="text-primary-400 hover:text-primary-300 text-sm"
                        >
                          View
                        </button>
                        {r.status === 'draft' && (
                          <button
                            onClick={() => navigate(`/reimbursements/${r.id}/edit`)}
                            className="ml-2 text-app-muted hover:text-app text-sm"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

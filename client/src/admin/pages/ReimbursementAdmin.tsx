import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { approvalsAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { ClipboardList, CheckCircle, AlertTriangle, DollarSign, Receipt, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalRow {
  step_id: string;
  reimbursement_id: string;
  step_type: string;
  submitter_name?: string;
  submitter_email?: string;
  title: string;
  original_amount: number;
  original_currency: string;
  converted_amount?: number;
  category_name?: string;
  submitted_at?: string;
}

export function ReimbursementAdmin() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [list, setList] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ stepIds: string[]; singleTitle?: string } | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    approvalsAPI
      .list(user.id)
      .then((data) => setList(Array.isArray(data) ? (data as ApprovalRow[]) : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const toggleSelect = (stepId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleApprove = async (stepId: string) => {
    if (!user?.id) return;
    setActionLoading(stepId);
    try {
      await approvalsAPI.approve(user.id, stepId);
      setList((prev) => prev.filter((r) => r.step_id !== stepId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(stepId);
        return next;
      });
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = (stepIds: string[], singleTitle?: string) => {
    setRejectModal({ stepIds, singleTitle });
    setRejectNote('');
  };

  const handleRejectConfirm = async () => {
    if (!user?.id || !rejectModal) return;
    const { stepIds } = rejectModal;
    if (stepIds.length === 0) {
      setRejectModal(null);
      return;
    }
    setBulkLoading(true);
    try {
      for (const stepId of stepIds) {
        await approvalsAPI.reject(user.id, stepId, rejectNote || undefined);
      }
      setList((prev) => prev.filter((r) => !stepIds.includes(r.step_id)));
      setSelected((prev) => {
        const next = new Set(prev);
        stepIds.forEach((id) => next.delete(id));
        return next;
      });
      setRejectModal(null);
      setRejectNote('');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!user?.id || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await approvalsAPI.bulk(user.id, Array.from(selected), 'approve');
      setList((prev) => prev.filter((r) => !selected.has(r.step_id)));
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  const pendingCount = list.length;
  const avgAmount =
    list.length > 0
      ? list.reduce((s, r) => s + (r.converted_amount ?? r.original_amount ?? 0), 0) / list.length
      : 0;

  const statCards = [
    { label: 'Pending Approvals', value: String(pendingCount), icon: ClipboardList, borderClass: 'border-l-amber-500', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
    { label: 'Approved This Month', value: '—', icon: CheckCircle, borderClass: 'border-l-emerald-500', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' },
    { label: 'Flagged Over Limit', value: '—', icon: AlertTriangle, borderClass: 'border-l-red-500', iconBg: 'bg-red-500/20', iconColor: 'text-red-400' },
    { label: 'Avg per Request', value: list.length ? avgAmount.toFixed(2) : '—', icon: DollarSign, borderClass: 'border-l-blue-500', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' },
  ];

  if (!user?.id) return null;

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-app">Reimbursements</h1>
          <Link
            to="/reimbursements"
            className="text-sm text-app-muted hover:text-app flex items-center gap-1 transition-colors"
          >
            <Receipt className="w-4 h-4" />
            My reimbursements
          </Link>
        </div>
        <Link
          to="/admin/reimbursements/settings"
          className="px-4 py-2 rounded-lg bg-app-sidebar border border-app-border text-app text-sm font-medium hover:bg-app-hover transition-colors"
        >
          Settings
        </Link>
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

      <div className="rounded-xl border border-app-border bg-app-sidebar overflow-hidden">
        <div className="p-4 border-b border-app-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-app">Approval Queue</h2>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-app-muted">{selected.size} selected</span>
              <Button size="sm" onClick={handleBulkApprove} disabled={bulkLoading}>
                Approve Selected
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => openRejectModal(Array.from(selected))}
                disabled={bulkLoading}
              >
                Reject Selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-app-muted">Loading...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-app-muted">No pending approvals.</div>
        ) : (
          <div className="p-4 space-y-3">
            {list.map((row) => (
              <div
                key={row.step_id}
                className={cn(
                  'rounded-xl border border-app-border bg-app-card border-l-4 border-l-amber-500 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'
                )}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selected.has(row.step_id)}
                    onChange={() => toggleSelect(row.step_id)}
                    className="rounded border-app-border bg-app text-primary-500 mt-1 shrink-0"
                    aria-label={`Select reimbursement ${row.reimbursement_id}: ${row.title}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-app-muted">{row.reimbursement_id}</span>
                      <span className="text-xs text-app-muted capitalize">{row.step_type?.replace('_', ' ')}</span>
                      {row.category_name && (
                        <span className="text-xs text-app-muted">· {row.category_name}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-app mb-1">{row.title}</h3>
                    <p className="text-sm text-app-muted">
                      Submitted by <strong className="text-app">{row.submitter_name ?? row.submitter_email ?? '—'}</strong>
                      {row.submitted_at && ` on ${row.submitted_at}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 sm:text-right">
                  <div>
                    <p className="text-lg font-bold text-app">
                      {(row.converted_amount ?? row.original_amount) ?? 0} {row.original_currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/reimbursements/${row.reimbursement_id}`)}
                      className="text-sm text-primary-400 hover:text-primary-300 font-medium"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(row.step_id)}
                      disabled={actionLoading === row.step_id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => openRejectModal([row.step_id], row.title)}
                      disabled={actionLoading === row.step_id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !bulkLoading && setRejectModal(null)}
        >
          <div
            className="rounded-xl border border-app-border bg-app-sidebar w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-app mb-2">Reject {rejectModal.stepIds.length === 1 ? 'request' : 'selected'}</h3>
            {rejectModal.singleTitle && (
              <p className="text-sm text-app-muted mb-3 truncate">{rejectModal.singleTitle}</p>
            )}
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-2">Rejection reason</label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Explain why this expense is being rejected..."
              rows={4}
              className="input-theme w-full resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRejectModal(null)} disabled={bulkLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRejectConfirm} disabled={bulkLoading}>
                {bulkLoading ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

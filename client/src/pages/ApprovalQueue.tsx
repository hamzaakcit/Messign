import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useReimbursementContext } from '@/contexts/ReimbursementContext';
import { approvalsAPI } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { CheckCircle, XCircle } from 'lucide-react';

export function ApprovalQueue() {
  const { user } = useAuthStore();
  const reimbContext = useReimbursementContext();
  const refreshCounts = reimbContext?.refreshCounts;
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    approvalsAPI.list(user.id)
      .then(setList)
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

  const selectAll = () => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map((r) => r.step_id)));
  };

  const handleApprove = async (stepId: string) => {
    if (!user?.id) return;
    setActionLoading(stepId);
    try {
      await approvalsAPI.approve(user.id, stepId);
      setList((prev) => prev.filter((r) => r.step_id !== stepId));
      refreshCounts?.();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (stepId: string) => {
    if (!user?.id) return;
    setActionLoading(stepId);
    try {
      await approvalsAPI.reject(user.id, stepId);
      setList((prev) => prev.filter((r) => r.step_id !== stepId));
      refreshCounts?.();
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulk = async (action: 'approve' | 'reject') => {
    if (!user?.id || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await approvalsAPI.bulk(user.id, Array.from(selected), action);
      setList((prev) => prev.filter((r) => !selected.has(r.step_id)));
      setSelected(new Set());
      refreshCounts?.();
    } finally {
      setBulkLoading(false);
    }
  };

  if (!user?.id) return null;

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h2 className="text-xl font-semibold text-app">Approval Queue</h2>

        {selected.size > 0 && (
          <Card className="p-3 flex items-center justify-between">
            <span className="text-sm text-app">{selected.size} item(s) selected</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleBulk('approve')} disabled={bulkLoading}>
                Approve All
              </Button>
              <Button size="sm" variant="danger" onClick={() => handleBulk('reject')} disabled={bulkLoading}>
                Reject All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-app-muted">Loading...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-app-muted">No pending approvals.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-app text-left text-sm text-app-muted">
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === list.length}
                        onChange={selectAll}
                        className="rounded border-app-inputBorder bg-app-inputBg text-primary-500"
                      />
                    </th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Submitted</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.step_id} className="border-b border-app hover:bg-app-hover">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.step_id)}
                          onChange={() => toggleSelect(row.step_id)}
                          className="rounded border-app-inputBorder bg-app-inputBg text-primary-500"
                        />
                      </td>
                      <td className="p-3 text-app">{row.submitter_name ?? row.submitter_email}</td>
                      <td className="p-3 text-app">{row.title}</td>
                      <td className="p-3 text-app">
                        {(row.converted_amount ?? row.original_amount) ?? 0} {row.original_currency}
                      </td>
                      <td className="p-3 text-app-muted">{row.category_name ?? '-'}</td>
                      <td className="p-3 text-app-muted">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '-'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/reimbursements/${row.reimbursement_id}`)}
                            className="text-primary-400 hover:text-primary-300 text-sm"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleApprove(row.step_id)}
                            disabled={actionLoading === row.step_id}
                            className="p-1 rounded text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                            title="Approve"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleReject(row.step_id)}
                            disabled={actionLoading === row.step_id}
                            className="p-1 rounded text-red-500 hover:bg-red-500/20 disabled:opacity-50"
                            title="Reject"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { reimbursementAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { CheckCircle, XCircle, Clock, FileText, Send } from 'lucide-react';
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
  draft: 'bg-gray-500/20 text-gray-400',
  submitted: 'bg-blue-500/20 text-blue-400',
  manager_review: 'bg-amber-500/20 text-amber-400',
  finance_review: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  paid: 'bg-purple-500/20 text-purple-400',
};

interface ReimbursementDetailProps {
  id: string;
}

const cardClass = 'rounded-xl border border-app-border bg-dark-800 p-4';

export function ReimbursementDetail({ id }: ReimbursementDetailProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !id) return;
    let cancelled = false;
    setError(null);
    reimbursementAPI.getById(user.id, id)
      .then((r: any) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setError('Failed to load reimbursement'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, id]);

  useEffect(() => {
    if (!user?.id || !id || !data) return;
    reimbursementAPI.getComments(user.id, id).then(setComments).catch(() => setComments([]));
  }, [user?.id, id, data]);

  const handleAddComment = async () => {
    if (!user?.id || !id || !newComment.trim()) return;
    try {
      await reimbursementAPI.addComment(user.id, id, newComment.trim());
      setNewComment('');
      reimbursementAPI.getComments(user.id, id).then(setComments).catch(() => {});
    } catch { /* swallow - user can retry */ }
  };

  if (!user?.id) return null;
  if (loading) {
    return (
      <div className="h-full overflow-auto bg-app p-6 transition-colors duration-200">
        <div className="max-w-4xl mx-auto text-app-muted">Loading...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="h-full overflow-auto bg-app p-6 transition-colors duration-200">
        <div className="max-w-4xl mx-auto text-red-500">{error ?? 'Not found'}</div>
      </div>
    );
  }

  const steps = data.approval_steps ?? [];
  const activityLog = data.activity_log ?? [];

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/reimbursements')}
            className="text-app-muted hover:text-app text-sm font-medium transition-colors"
          >
            Back to list
          </button>
          {data.status === 'draft' && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/reimbursements/${id}/edit`)}>
              Edit
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className={cardClass}>
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-2">Status</p>
              <span className={cn('inline-block px-3 py-1 rounded text-sm font-medium', STATUS_COLORS[data.status] || 'bg-gray-500/20 text-gray-400')}>
                {STATUS_LABELS[data.status] ?? data.status}
              </span>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-3">Progress</p>
              <div className="space-y-2">
                {steps.map((step: any) => (
                  <div key={step.id} className="flex items-start gap-2 text-sm">
                    {step.status === 'approved' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
                    {step.status === 'rejected' && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                    {step.status === 'pending' && <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-app">{step.step_type === 'manager_approval' ? 'Manager' : 'Finance'} {step.status}</p>
                      {step.decision_at && <p className="text-xs text-app-muted">{new Date(step.decision_at).toLocaleString()}</p>}
                      {step.assigned_to_name && <p className="text-xs text-app-muted">Assigned: {step.assigned_to_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className={cardClass}>
              <h3 className="text-lg font-semibold text-app mb-2">{data.title}</h3>
              <p className="text-sm text-app-muted mb-1">{data.category_name}</p>
              <p className="text-sm text-app-muted mb-2">Expense date: {data.expense_date}</p>
              <p className="text-xl font-bold text-app">
                {(data.converted_amount ?? data.original_amount) ?? 0} {data.original_currency}
              </p>
              {data.description && <p className="text-sm text-app-muted mt-2">{data.description}</p>}
            </div>

            {data.documents?.length > 0 && (
              <div className={cardClass}>
                <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-3">Documents</p>
                <ul className="space-y-2">
                  {data.documents.map((doc: any) => (
                    <li key={doc.id} className="flex items-center gap-2 text-sm text-app-muted">
                      <FileText className="w-4 h-4 text-app-muted" />
                      {doc.file_name}
                      {doc.ocr_vendor_name && (
                        <span className="text-xs text-emerald-400">
                          {doc.ocr_vendor_name} | {doc.ocr_amount} {doc.ocr_currency}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={cardClass}>
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-3">Comments</p>
              <ul className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                {comments.length === 0 ? (
                  <li className="text-sm text-app-muted">No comments yet.</li>
                ) : (
                  comments.map((c: any) => (
                    <li key={c.id} className="text-sm">
                      <span className="text-app font-medium">{c.author_name ?? 'User'}</span>
                      <span className="text-app-muted ml-1">{new Date(c.created_at).toLocaleString()}</span>
                      <p className="text-app-muted mt-0.5">{c.comment_text}</p>
                    </li>
                  ))
                )}
              </ul>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="input-theme flex-1"
                />
                <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {activityLog.length > 0 && (
              <div className={cardClass}>
                <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-3">Activity</p>
                <ul className="space-y-1 text-sm text-app-muted">
                  {activityLog.slice(0, 10).map((a: any) => (
                    <li key={a.id}>
                      {a.user_name ?? 'System'} — {a.action} — {new Date(a.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

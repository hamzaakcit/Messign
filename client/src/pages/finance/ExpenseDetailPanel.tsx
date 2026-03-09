import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type Expense, type ExpenseComment, type SLAStatus } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ReceiptUploader } from '@/components/finance/ReceiptUploader';
import { ReceiptViewer } from '@/components/finance/ReceiptViewer';
import { cn } from '@/lib/utils';
import {
  CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, User, MessageSquare, Send, ThumbsUp, ThumbsDown,
  Image, Info, Edit3, Save, DollarSign, Sparkles, Eye,
} from 'lucide-react';

interface ExpenseDetailPanelProps {
  expenseId: string;
  onClose: () => void;
}

export function ExpenseDetailPanel({ expenseId, onClose }: ExpenseDetailPanelProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [financeRole, setFinanceRole] = useState<string>((user as unknown as Record<string, unknown>)?.role as string ?? 'employee');
  const [financeUserId, setFinanceUserId] = useState<string | null>(null);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [viewingReceipt, setViewingReceipt] = useState<{
    imageUrl: string; fileName: string;
    extractedData?: { vendor?: string; amount?: number; date?: string; currency?: string };
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', amount: '', description: '' });

  const [slaStatus, setSlaStatus] = useState<SLAStatus | null>(null);

  const refresh = async () => {
    try {
      const updated = await financeAPI.getExpense(userId, expenseId);
      setExpense(updated);
    } catch (err) {
      console.error('Failed to refresh:', err);
    }
  };

  useEffect(() => {
    if (!userId || !expenseId) return;
    setLoading(true);
    Promise.all([
      financeAPI.getExpense(userId, expenseId),
      financeAPI.getSLAStatus(userId, expenseId).catch(() => null),
      financeAPI.getMe(userId).catch(() => null),
    ]).then(([exp, sla, me]) => {
      setExpense(exp);
      setSlaStatus(sla);
      if (me?.role) setFinanceRole(me.role);
      if (me?.id) setFinanceUserId(me.id);
    }).catch((err) => console.error('Failed to load expense:', err))
      .finally(() => setLoading(false));
  }, [userId, expenseId]);

  const isOwner = financeUserId ? expense?.submitted_by === financeUserId : false;
  const isDraft = expense?.status === 'draft';
  const isInfoRequested = expense?.status === 'info_requested';
  const canApprove = expense &&
    ['submitted', 'manager_review', 'finance_review', 'ai_flagged', 'ai_reviewing', 'pending_approval'].includes(expense.status) &&
    ['admin', 'finance', 'manager', 'cfo', 'finance_admin'].includes(financeRole);
  const canMarkPaid = expense && expense.status === 'approved' && ['admin', 'finance', 'cfo', 'finance_admin'].includes(financeRole);

  const handleApprove = async () => {
    if (!expense) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await financeAPI.approveExpense(userId, expense.id, approveComment || undefined);
      setShowApproveModal(false);
      setApproveComment('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approve failed';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!expense || !rejectReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await financeAPI.rejectExpense(userId, expense.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reject failed';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!expense || !infoMessage.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await financeAPI.requestInfo(userId, expense.id, infoMessage);
      setShowInfoModal(false);
      setInfoMessage('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request info failed';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!expense || !newComment.trim()) return;
    setCommentSubmitting(true);
    try {
      await financeAPI.addComment(userId, expense.id, newComment);
      setNewComment('');
      await refresh();
    } catch (err) {
      console.error('Comment failed:', err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!expense) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await financeAPI.markPaid(userId, expense.id);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mark as paid failed';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceiptUpload = async (file: File) => {
    if (!expense) return;
    try {
      await financeAPI.uploadReceipt(userId, expense.id, file);
      await refresh();
    } catch (err) {
      console.error('Receipt upload failed:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!expense) return;
    setActionLoading(true);
    try {
      await financeAPI.updateExpense(userId, expense.id, {
        title: editForm.title,
        amount: parseFloat(editForm.amount),
        description: editForm.description,
      });
      setEditing(false);
      await refresh();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const startEdit = () => {
    if (!expense) return;
    setEditForm({
      title: expense.title,
      amount: String(expense.original_amount),
      description: expense.description || '',
    });
    setEditing(true);
  };

  const handleSubmitExpense = async () => {
    if (!expense) return;
    setActionLoading(true);
    try {
      await financeAPI.submitExpense(userId, expense.id);
      await refresh();
    } catch (err) {
      console.error('Submit failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || !confirm('Delete this draft expense?')) return;
    setActionLoading(true);
    try {
      await financeAPI.deleteExpense(userId, expense.id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const fmt = (amount: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  if (loading) return <div className="flex items-center justify-center h-64 text-app-muted">Loading...</div>;
  if (!expense) return <div className="flex items-center justify-center h-64 text-app-muted">Expense not found</div>;

  const policyResult = expense.ai_policy_result as { passed?: boolean; violations?: Array<{ message: string; rule: string }>; warnings?: string[] } | null;
  const duplicateRefs = expense.ai_duplicate_refs as string[] | null;
  const riskFlags = expense.ai_risk_flags ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editing ? (
              <div className="space-y-2">
                <input value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  className="text-xl font-semibold bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-app-text w-full focus:outline-none focus:border-primary-500" />
                <div className="flex items-center gap-2">
                  <input type="number" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-app-text focus:outline-none focus:border-primary-500" />
                  <span className="text-sm text-app-muted">{expense.original_currency}</span>
                </div>
                <textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-app-text focus:outline-none focus:border-primary-500 resize-none" placeholder="Description..." />
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-app-text">{expense.title}</h2>
                <div className="mt-1 flex items-center gap-3 text-sm text-app-muted">
                  <span>{new Date(expense.expense_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <span className="font-medium text-app-text">{fmt(expense.original_amount, expense.original_currency)}</span>
                  {expense.category_name && <span>{expense.category_name}</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-app-muted">
                  <User className="h-3 w-3" /> Submitted by {expense.submitter_name}
                </div>
                {expense.description && <p className="mt-3 text-sm text-app-muted">{expense.description}</p>}
              </>
            )}
          </div>
          <StatusBadge status={expense.status} />
        </div>

        {expense.rejection_reason && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <strong>Rejection reason:</strong> {expense.rejection_reason}
          </div>
        )}

        {isInfoRequested && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
            <Info className="h-4 w-4 inline mr-1" /> Additional information was requested. Please review the comments below.
          </div>
        )}
      </div>

      {/* Receipt Section */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-app-text mb-4 flex items-center gap-2">
          <Image className="h-4 w-4" /> Receipts
        </h3>
        {expense.receipts && expense.receipts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {expense.receipts.map((r) => (
              <button
                key={r.id}
                onClick={() => setViewingReceipt({
                  imageUrl: r.file_url, fileName: r.file_name,
                  extractedData: r.ocr_processed ? { vendor: r.extracted_vendor, amount: r.extracted_amount, date: r.extracted_date } : undefined,
                })}
                className="aspect-square rounded-lg border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-colors overflow-hidden"
              >
                <Eye className="h-5 w-5 text-app-muted" />
                <span className="text-xs text-app-muted truncate max-w-full px-2">{r.file_name}</span>
                {r.ocr_processed && <span className="text-[10px] text-emerald-400">OCR ✓</span>}
              </button>
            ))}
          </div>
        ) : (
          (isDraft || isInfoRequested) ? (
            <ReceiptUploader onUpload={handleReceiptUpload} />
          ) : (
            <p className="text-sm text-app-muted">No receipts attached.</p>
          )
        )}
      </div>

      {/* Approval Timeline + Dora Analysis */}
      <div className="space-y-6">
        {/* Approval Timeline */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-app-text">Approval Timeline</h3>
            {slaStatus && (
              <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                slaStatus.status === 'on_track' ? 'bg-emerald-500/10 text-emerald-400' :
                slaStatus.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                'bg-red-500/10 text-red-400 animate-pulse')}>
                <Clock className="h-3 w-3" />
                {slaStatus.elapsed_hours}h / {slaStatus.deadline_hours}h
                {slaStatus.escalated && <span className="ml-1 text-red-400">(Escalated)</span>}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <TimelineItem icon={<FileText className="h-4 w-4" />} title="Submitted" date={expense.submitted_at} status="completed" />
            {expense.approval_steps?.map((step) => (
              <TimelineItem
                key={step.id}
                icon={step.status === 'approved' ? <CheckCircle className="h-4 w-4" /> : step.status === 'rejected' ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                title={step.step_name ?? step.step_type?.replace(/_/g, ' ')}
                subtitle={step.approver_name}
                date={step.decision_at}
                status={step.status as 'pending' | 'completed' | 'rejected'}
                notes={step.decision_notes}
                aiRecommendation={step.ai_recommendation}
                aiConfidence={step.ai_confidence}
              />
            ))}
            {['paid', 'reimbursed'].includes(expense.status) && (
              <TimelineItem icon={<CheckCircle className="h-4 w-4" />} title="Payment" date={expense.paid_at} status="completed" />
            )}
          </div>
        </div>

        {/* Dora AI Analysis */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-app-text mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-500" /> Dora AI Analysis
          </h3>
          {expense.ai_confidence_score != null ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricBox label="Confidence" value={`${Math.round(expense.ai_confidence_score * 100)}%`}
                  color={expense.ai_confidence_score >= 0.9 ? 'emerald' : expense.ai_confidence_score >= 0.7 ? 'amber' : 'red'} />
                <MetricBox label="Risk Score" value={`${Math.round((expense.ai_risk_score ?? 0) * 100)}%`}
                  color={(expense.ai_risk_score ?? 0) <= 0.3 ? 'emerald' : (expense.ai_risk_score ?? 0) <= 0.7 ? 'amber' : 'red'} />
              </div>

              {expense.ai_auto_approved && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="h-3 w-3" /> Auto-approved by Dora AI
                </div>
              )}

              {policyResult && (
                <div>
                  <p className="text-xs font-medium text-app-muted mb-2">Policy Check</p>
                  <div className="space-y-1">
                    <div className={cn('flex items-center gap-2 text-xs', policyResult.passed ? 'text-emerald-400' : 'text-red-400')}>
                      {policyResult.passed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {policyResult.passed ? 'All policies passed' : `${policyResult.violations?.length ?? 0} violation(s)`}
                    </div>
                    {policyResult.violations?.map((v, i) => (
                      <p key={i} className="text-xs text-red-400/80 ml-5">{v.message}</p>
                    ))}
                    {policyResult.warnings?.map((w, i) => (
                      <p key={i} className="text-xs text-amber-400/80 ml-5">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-app-muted mb-1">Duplicate Check</p>
                {duplicateRefs && duplicateRefs.length > 0 ? (
                  <div className="text-xs text-amber-400">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {duplicateRefs.length} potential duplicate(s) found
                  </div>
                ) : (
                  <div className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> No duplicates
                  </div>
                )}
              </div>

              {expense.budget_id && (
                <BudgetImpact budgetId={expense.budget_id} amount={expense.original_amount} userId={userId} />
              )}

              {riskFlags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-app-muted mb-2">Risk Flags</p>
                  <div className="space-y-1.5">
                    {riskFlags.map((flag, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs">
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-app-muted"><strong className="text-amber-400">{flag.type}:</strong> {flag.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expense.ai_review_notes && (
                <div className="p-3 rounded-lg bg-primary-500/5 border border-primary-500/10 text-xs text-app-text">
                  {expense.ai_review_notes}
                </div>
              )}

              <DoraFeedback expenseId={expense.id} userId={userId} />
            </div>
          ) : (
            <p className="text-sm text-app-muted">AI analysis not available yet.</p>
          )}
        </div>
      </div>

      {/* Comments Section */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-app-text mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Comments ({expense.comments?.length ?? 0})
        </h3>
        <div className="space-y-3 mb-4">
          {(!expense.comments || expense.comments.length === 0) ? (
            <p className="text-sm text-app-muted">No comments yet.</p>
          ) : (
            expense.comments.map((c) => <CommentBubble key={c.id} comment={c} isCurrentUser={c.user_id === userId} />)
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={handleSubmitComment}
            disabled={commentSubmitting || !newComment.trim()}
            className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <ActionBar
        isDraft={isDraft}
        isOwner={isOwner}
        isInfoRequested={isInfoRequested}
        canApprove={!!canApprove}
        canMarkPaid={!!canMarkPaid}
        editing={editing}
        actionLoading={actionLoading}
        onEdit={startEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditing(false)}
        onSubmit={handleSubmitExpense}
        onDelete={handleDelete}
        onApprove={() => setShowApproveModal(true)}
        onReject={() => setShowRejectModal(true)}
        onRequestInfo={() => setShowInfoModal(true)}
        onMarkPaid={handleMarkPaid}
      />

      {/* Approve Modal */}
      {showApproveModal && (
        <InlineModal title="Approve Expense" onClose={() => { setShowApproveModal(false); setActionError(null); }}>
          <p className="text-sm text-app-muted mb-3">Approve "{expense.title}" for {fmt(expense.original_amount, expense.original_currency)}?</p>
          <textarea
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
            placeholder="Optional comment..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:outline-none resize-none mb-4"
          />
          {actionError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{actionError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowApproveModal(false); setActionError(null); }} className="px-4 py-2 text-sm text-app-muted hover:text-app-text">Cancel</button>
            <button onClick={handleApprove} disabled={actionLoading}
              className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> {actionLoading ? 'Approving...' : 'Approve'}
            </button>
          </div>
        </InlineModal>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <InlineModal title="Reject Expense" onClose={() => { setShowRejectModal(false); setActionError(null); }}>
          <p className="text-sm text-app-muted mb-3">Provide a reason for rejecting "{expense.title}".</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:outline-none resize-none mb-4"
          />
          {actionError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{actionError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowRejectModal(false); setActionError(null); }} className="px-4 py-2 text-sm text-app-muted hover:text-app-text">Cancel</button>
            <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
              className="px-5 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
              <XCircle className="h-4 w-4" /> {actionLoading ? 'Rejecting...' : 'Reject'}
            </button>
          </div>
        </InlineModal>
      )}

      {/* Request Info Modal */}
      {showInfoModal && (
        <InlineModal title="Request More Information" onClose={() => setShowInfoModal(false)}>
          <p className="text-sm text-app-muted mb-3">Ask the submitter for additional information.</p>
          <textarea
            value={infoMessage}
            onChange={(e) => setInfoMessage(e.target.value)}
            placeholder="What information do you need?"
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:outline-none resize-none mb-4"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowInfoModal(false)} className="px-4 py-2 text-sm text-app-muted hover:text-app-text">Cancel</button>
            <button onClick={handleRequestInfo} disabled={actionLoading || !infoMessage.trim()}
              className="px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
              <Info className="h-4 w-4" /> {actionLoading ? 'Sending...' : 'Request Info'}
            </button>
          </div>
        </InlineModal>
      )}

      {/* Receipt Viewer */}
      {viewingReceipt && (
        <ReceiptViewer
          imageUrl={viewingReceipt.imageUrl}
          fileName={viewingReceipt.fileName}
          extractedData={viewingReceipt.extractedData}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────

function InlineModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a2e] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-app-text mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ActionBar({
  isDraft, isOwner, isInfoRequested, canApprove, canMarkPaid,
  editing, actionLoading,
  onEdit, onSaveEdit, onCancelEdit, onSubmit, onDelete, onApprove, onReject, onRequestInfo, onMarkPaid,
}: {
  isDraft: boolean; isOwner: boolean; isInfoRequested: boolean;
  canApprove: boolean; canMarkPaid: boolean;
  editing: boolean; actionLoading: boolean;
  onEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  onSubmit: () => void; onDelete: () => void;
  onApprove: () => void; onReject: () => void; onRequestInfo: () => void;
  onMarkPaid: () => void;
}) {
  const hasActions = isDraft || isInfoRequested || canApprove || canMarkPaid;
  if (!hasActions) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5">
      {(isDraft || isInfoRequested) && isOwner && (
        <>
          {editing ? (
            <>
              <button onClick={onSaveEdit} disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                <Save className="h-4 w-4" /> Save
              </button>
              <button onClick={onCancelEdit} className="px-4 py-2 text-sm text-app-muted hover:text-app-text">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text hover:bg-white/10">
                <Edit3 className="h-4 w-4" /> Edit
              </button>
              <button onClick={onSubmit} disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                <Send className="h-4 w-4" /> {isInfoRequested ? 'Resubmit' : 'Submit'}
              </button>
              {isDraft && (
                <button onClick={onDelete} disabled={actionLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20">
                  <XCircle className="h-4 w-4" /> Delete
                </button>
              )}
            </>
          )}
        </>
      )}

      {canApprove && (
        <>
          <button onClick={onApprove} disabled={actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
            <CheckCircle className="h-4 w-4" /> Approve
          </button>
          <button onClick={onReject} disabled={actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> Reject
          </button>
          <button onClick={onRequestInfo} disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 disabled:opacity-50">
            <Info className="h-4 w-4" /> Request Info
          </button>
        </>
      )}

      {canMarkPaid && (
        <button onClick={onMarkPaid} disabled={actionLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
          <DollarSign className="h-4 w-4" /> Mark as Paid
        </button>
      )}
    </div>
  );
}

function CommentBubble({ comment, isCurrentUser }: { comment: ExpenseComment; isCurrentUser: boolean }) {
  const isSystem = comment.comment_text.startsWith('[');
  return (
    <div className={cn('flex', isCurrentUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%] rounded-xl px-4 py-2.5',
        isSystem ? 'bg-amber-500/10 border border-amber-500/20' :
        isCurrentUser ? 'bg-primary-500/15 border border-primary-500/20' :
        'bg-white/5 border border-white/10',
      )}>
        {!isCurrentUser && (
          <p className="text-xs font-medium text-primary-400 mb-0.5">{comment.author_name || 'Unknown'}</p>
        )}
        <p className="text-sm text-app-text">{comment.comment_text}</p>
        <p className="text-[10px] text-app-muted mt-1">
          {new Date(comment.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: 'emerald' | 'amber' | 'red' }) {
  const colorClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={cn('rounded-lg border p-3 text-center', colorClasses[color])}>
      <p className="text-xs text-app-muted mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function BudgetImpact({ budgetId, amount, userId }: { budgetId: string; amount: number; userId: string }) {
  const [budget, setBudget] = useState<{ name: string; allocated_amount: number; spent_amount: number } | null>(null);

  useEffect(() => {
    financeAPI.getBudget(userId, budgetId)
      .then((b: any) => setBudget(b))
      .catch(() => {});
  }, [userId, budgetId]);

  if (!budget) return null;

  const remainingBefore = budget.allocated_amount - budget.spent_amount;
  const remainingAfter = remainingBefore - amount;
  const overBudget = remainingAfter < 0;

  return (
    <div>
      <p className="text-xs font-medium text-app-muted mb-1">Budget Impact</p>
      <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1">
        <p className="text-app-muted">Budget: <span className="text-app-text">{budget.name || (budget as any).department || 'Unknown'}</span></p>
        <p className="text-app-muted">Remaining before: <span className="text-app-text">${remainingBefore.toFixed(2)}</span></p>
        <p className={cn('font-medium', overBudget ? 'text-red-400' : 'text-emerald-400')}>
          After: ${remainingAfter.toFixed(2)} {overBudget && '(OVER BUDGET)'}
        </p>
      </div>
    </div>
  );
}

function DoraFeedback({ expenseId, userId }: { expenseId: string; userId: string }) {
  const [submitted, setSubmitted] = useState(false);

  const handleFeedback = async (rating: number) => {
    try {
      await financeAPI.submitExpenseFeedback(userId, expenseId, rating);
      setSubmitted(true);
    } catch {
      // silently fail
    }
  };

  if (submitted) {
    return <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Thanks for your feedback!</p>;
  }

  return (
    <div className="flex items-center gap-3 pt-2 border-t border-white/5">
      <span className="text-xs text-app-muted">Was this analysis helpful?</span>
      <button onClick={() => handleFeedback(1)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-app-muted hover:text-emerald-400 transition-colors">
        <ThumbsUp className="h-4 w-4" />
      </button>
      <button onClick={() => handleFeedback(-1)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-app-muted hover:text-red-400 transition-colors">
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
}

function TimelineItem({ icon, title, subtitle, date, status = 'pending', notes, aiRecommendation, aiConfidence }: {
  icon: React.ReactNode; title?: string; subtitle?: string; date?: string | null;
  status?: 'pending' | 'completed' | 'rejected'; notes?: string | null;
  aiRecommendation?: string; aiConfidence?: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('mt-0.5 rounded-full p-1', status === 'completed' ? 'text-emerald-400' : status === 'rejected' ? 'text-red-400' : 'text-app-muted')}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-app-text capitalize">{title}</span>
          {date && <span className="text-xs text-app-muted">{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        </div>
        {subtitle && <p className="text-xs text-app-muted">{subtitle}</p>}
        {notes && <p className="text-xs text-app-muted mt-1 italic">{notes}</p>}
        {aiRecommendation && (
          <p className="text-xs text-primary-400 mt-0.5 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> AI suggests: {aiRecommendation} ({aiConfidence ? `${Math.round(aiConfidence * 100)}%` : '—'})
          </p>
        )}
      </div>
    </div>
  );
}

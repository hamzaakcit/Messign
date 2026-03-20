import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ContentActions({
  status,
  approvalId,
  actionLoading,
  onApprove,
  onReject,
  onEdit,
  onSendToReview,
  publishedAt,
}: {
  status: string;
  approvalId: string | null;
  actionLoading: string | null;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onSendToReview: () => void;
  publishedAt?: string | null;
}) {
  const s = status.toLowerCase();

  const btn = 'rounded-lg px-3 py-2 text-[11px] font-medium transition-colors disabled:opacity-40';

  if (s === 'published' || publishedAt) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={cn(btn, 'border border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]')}>
          Edit
        </button>
        <p className="w-full text-[10px] text-slate-500">Published — updates create a new revision path from the editor.</p>
      </div>
    );
  }

  if (s === 'approved') {
    return (
      <div className="space-y-2">
        <button type="button" onClick={onEdit} className={cn(btn, 'border border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]')}>
          Edit
        </button>
        <p className="text-[10px] text-slate-500">Approved — awaiting publish or schedule from the full editor.</p>
      </div>
    );
  }

  if (s === 'in_review' || s === 'pending_review') {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={!approvalId || actionLoading !== null}
          className={cn(btn, 'inline-flex items-center gap-1 border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20')}
        >
          {actionLoading === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={!approvalId || actionLoading !== null}
          className={cn(btn, 'inline-flex items-center gap-1 border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/20')}
        >
          {actionLoading === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Reject
        </button>
        <button type="button" onClick={onEdit} className={cn(btn, 'border border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]')}>
          Edit
        </button>
        {!approvalId && <p className="w-full text-[10px] text-amber-400/80">No pending approval row — refresh or open the approvals queue.</p>}
      </div>
    );
  }

  if (s === 'rejected') {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={cn(btn, 'border border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]')}>
          Edit &amp; resubmit
        </button>
      </div>
    );
  }

  /* draft, idea, etc. */
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSendToReview}
        disabled={actionLoading !== null}
        className={cn(btn, 'inline-flex items-center gap-1 border border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20')}
      >
        {actionLoading === 'review' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Send to review
      </button>
      <button type="button" onClick={onEdit} className={cn(btn, 'border border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]')}>
        Edit
      </button>
    </div>
  );
}

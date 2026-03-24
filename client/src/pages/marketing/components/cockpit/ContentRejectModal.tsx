import { Loader2 } from 'lucide-react';

export function ContentRejectModal({
  open,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px]">
      <div className="w-full max-w-sm rounded-xl border border-app-border bg-app-card p-3 shadow-xl">
        <p className="text-[11px] font-medium text-app-text">Reject draft</p>
        <p className="mt-1 text-[10px] text-app-muted">Short note for the team (optional).</p>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-app-border bg-app-surface-tertiary px-2 py-1.5 text-[11px] text-app-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500/30"
          placeholder="Why reject?"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-2.5 py-1.5 text-[11px] text-app-muted hover:bg-app-hover hover:text-app-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

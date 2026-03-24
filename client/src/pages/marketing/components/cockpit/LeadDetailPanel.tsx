import type { Lead } from '@/lib/marketingApi';
import { formatRelativeTime } from '@/lib/utils';

export function LeadDetailPanel({
  lead,
  onClose,
  onOpenFull,
}: {
  lead: Lead;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-app-border px-3 py-2">
        <button type="button" onClick={onClose} className="text-[11px] text-app-muted hover:text-app-text">
          ← Back
        </button>
        <button type="button" onClick={onOpenFull} className="text-[11px] text-app-muted hover:text-app-text">
          Open leads →
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-[11px] text-app-text">
        <div>
          <div className="text-[10px] uppercase text-app-muted">Email</div>
          <div className="mt-0.5 break-all text-app-text">{lead.email}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-app-muted">Name</div>
          <div className="mt-0.5">{name}</div>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-app-muted">Status</span>
          <span>{lead.status}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-app-muted">Score</span>
          <span className="tabular-nums">{lead.score}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-app-muted">Source</span>
          <span>{lead.source}</span>
        </div>
        <p className="text-[10px] text-slate-600">Last activity {formatRelativeTime(lead.last_activity_at ?? lead.created_at)}</p>
      </div>
    </div>
  );
}

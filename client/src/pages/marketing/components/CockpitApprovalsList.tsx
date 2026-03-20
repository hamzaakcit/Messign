import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ApprovalQueueItem } from '../approvalQueue/types';
import type { SelectedItem } from './cockpit/cockpitTypes';
import { ChannelBadge } from './cockpit/ChannelBadge';

export function CockpitApprovalsList({
  items,
  loading,
  selectedApprovalId,
  onSelect,
}: {
  items: ApprovalQueueItem[];
  loading: boolean;
  selectedApprovalId: string | null;
  onSelect: (item: SelectedItem) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500/80" aria-hidden />
        <p className="text-sm">Loading approval queue…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-[11px] text-slate-500">
        <p>No pending approvals.</p>
        <p className="text-slate-600">New drafts land here after the agent passes gatekeepers.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <p className="text-[11px] text-slate-500">
          {items.length} pending · select a row to review in the right panel.
        </p>
        <Link to="/marketing/approvals" className="text-[11px] text-cyan-400/90 hover:text-cyan-300">
          Open full queue →
        </Link>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#0c0f14]">
        {items.map((item) => {
          const selected = item.id === selectedApprovalId;
          const preview = (item.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!item.contentId) return;
                onSelect({ type: 'approval', id: item.id, contentId: item.contentId });
              }}
              className={`w-full px-3 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                selected ? 'bg-cyan-500/[0.08]' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <ChannelBadge channel={item.targetChannel} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-200">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{preview || '—'}</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {formatRelativeTime(item.submittedAt)} · {item.campaignName}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-amber-400/80">Pending</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

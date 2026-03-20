import type { Campaign, ContentItem } from '@/lib/marketingApi';
import { formatRelativeTime } from '@/lib/utils';
import { ChannelBadge } from './ChannelBadge';
import { StatusBadge } from './StatusBadge';

export function CampaignDetailPanel({
  campaign,
  linkedContent,
  onClose,
  onOpenFull,
  onAskDora,
}: {
  campaign: Campaign;
  linkedContent: ContentItem[];
  onClose: () => void;
  onOpenFull: () => void;
  onAskDora: (prompt: string) => void;
}) {
  const sym = campaign.currency || '€';
  const pct =
    campaign.budget > 0 ? ((campaign.actual_spend / campaign.budget) * 100).toFixed(1) : '—';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <button type="button" onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-200">
          ← Back
        </button>
        <button type="button" onClick={onOpenFull} className="text-[11px] text-slate-500 hover:text-slate-200">
          Open full page →
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="border-b border-white/[0.06] pb-3">
          <h3 className="text-sm font-semibold text-slate-100">{campaign.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <ChannelBadge channel={campaign.channel} size="sm" />
          </div>
        </div>

        <div className="mt-3 border-b border-white/[0.06] pb-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Key metrics</h4>
          <ul className="space-y-1.5 text-[11px] text-slate-300">
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">Spend</span>
              <span className="tabular-nums">
                {sym}
                {campaign.actual_spend.toLocaleString()} / {sym}
                {campaign.budget.toLocaleString()} ({pct}%)
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">Leads</span>
              <span className="tabular-nums">{campaign.leads_generated ?? 0} generated</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">Clicks</span>
              <span className="tabular-nums">{campaign.clicks ?? 0}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-slate-500">ROI</span>
              <span className="tabular-nums">{campaign.roi != null ? `${campaign.roi.toFixed(1)}%` : '—'}</span>
            </li>
          </ul>
        </div>

        <div className="mt-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Linked content</h4>
          {linkedContent.length === 0 ? (
            <p className="text-[11px] text-slate-500">No content linked to this campaign in the loaded list.</p>
          ) : (
            <ul className="space-y-1.5">
              {linkedContent.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 text-[11px] text-slate-300">
                  <span className="min-w-0 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{c.status}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-slate-600">Updated {formatRelativeTime(campaign.updated_at)}</p>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-white/[0.06] bg-[#080a0e] px-3 py-2.5">
        <button
          type="button"
          onClick={() =>
            onAskDora(`Analyze campaign "${campaign.name}" — what's working and what should change?`)
          }
          className="w-full rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20"
        >
          Ask Dora
        </button>
      </div>
    </div>
  );
}

import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { ApprovalQueueItem, RiskLevel, TargetChannel } from '../../approvalQueue/types';
import { channelLabel } from '../../approvalQueue/approvalQueueUtils';
import { ChannelIcon } from './ChannelIcon';

export type SortMode = 'newest' | 'oldest';
export type RiskFilter = 'all' | RiskLevel;

interface ApprovalListProps {
  items: ApprovalQueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  campaignFilter: string;
  onCampaignFilter: (v: string) => void;
  channelFilter: TargetChannel | 'all';
  onChannelFilter: (v: TargetChannel | 'all') => void;
  riskFilter: RiskFilter;
  onRiskFilter: (v: RiskFilter) => void;
  sort: SortMode;
  onSort: (v: SortMode) => void;
  campaigns: string[];
}

function riskBadgeVariant(r: RiskLevel): 'red' | 'orange' | 'blue' | 'green' {
  if (r === 'high') return 'red';
  if (r === 'medium') return 'orange';
  if (r === 'low') return 'blue';
  return 'green';
}

export function ApprovalList({
  items,
  selectedId,
  onSelect,
  campaignFilter,
  onCampaignFilter,
  channelFilter,
  onChannelFilter,
  riskFilter,
  onRiskFilter,
  sort,
  onSort,
  campaigns,
}: ApprovalListProps) {
  return (
    <div className="flex flex-col h-full min-h-0 border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden">
      <div className="p-3 border-b border-white/10 space-y-3 shrink-0">
        <div className="flex items-center gap-2 text-app-muted text-xs uppercase tracking-wide">
          <Filter className="w-3.5 h-3.5" />
          Queue
        </div>
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-app-muted">Campaign</label>
          <select
            value={campaignFilter}
            onChange={(e) => onCampaignFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-app-text"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="text-xs text-app-muted">Channel</label>
          <select
            value={channelFilter}
            onChange={(e) => onChannelFilter(e.target.value as TargetChannel | 'all')}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-app-text"
          >
            <option value="all">All channels</option>
            <option value="blog">Blog</option>
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="instagram">Instagram</option>
            <option value="social">Social</option>
            <option value="battlecard">Battlecard</option>
            <option value="other">Other</option>
          </select>
          <label className="text-xs text-app-muted">Risk level</label>
          <select
            value={riskFilter}
            onChange={(e) => onRiskFilter(e.target.value as RiskFilter)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-app-text"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => onSort(sort === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-2 text-xs text-primary-300 hover:text-primary-200"
        >
          {sort === 'newest' ? <ArrowDownWideNarrow className="w-3.5 h-3.5" /> : <ArrowUpNarrowWide className="w-3.5 h-3.5" />}
          Sort: {sort === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>
      <ul className="overflow-y-auto flex-1 divide-y divide-white/5">
        {items.length === 0 ? (
          <li className="p-6 text-center text-app-muted text-sm">No items match filters.</li>
        ) : (
          items.map((item) => {
            const selected = item.id === selectedId;
            const risk = item.compliance.warning_count.high > 0 ? 'high' : item.compliance.warning_count.medium > 0 ? 'medium' : item.compliance.warning_count.low > 0 ? 'low' : 'none';
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'w-full text-left p-3 transition-colors',
                    selected ? 'bg-primary-500/15 border-l-2 border-l-primary-400' : 'hover:bg-white/5 border-l-2 border-l-transparent',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-app-text truncate">{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-app-muted">
                        <ChannelIcon channel={item.targetChannel} className="text-app-muted" />
                        <span>{channelLabel(item.targetChannel)}</span>
                        <span className="text-white/20">·</span>
                        <span className="truncate">{item.campaignName}</span>
                      </div>
                      <p className="text-[11px] text-app-muted mt-1">{formatRelativeTime(item.submittedAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="blue" size="sm">
                        BV {item.brandVoiceScore}/100
                      </Badge>
                      {risk !== 'none' && (
                        <span className="inline-flex items-center gap-0.5" title="Compliance risk">
                          <AlertTriangle className={cn('w-3.5 h-3.5', risk === 'high' ? 'text-red-400' : risk === 'medium' ? 'text-amber-400' : 'text-blue-400')} />
                          <Badge variant={riskBadgeVariant(risk as RiskLevel)} size="sm">
                            {risk}
                          </Badge>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

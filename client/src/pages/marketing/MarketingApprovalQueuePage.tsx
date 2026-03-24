import { useEffect, useMemo, useState } from 'react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';

import { ApprovalList, type RiskFilter, type SortMode } from './components/approval/ApprovalList';
import { ReviewDetail } from './components/approval/ReviewDetail';
import { FeedbackModal } from './components/approval/FeedbackModal';
import type { RejectionReason, TargetChannel } from './approvalQueue/types';
import { deriveRiskLevel } from './approvalQueue/approvalQueueUtils';
import { useAuthStore } from '@/stores/authStore';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';

export function MarketingApprovalQueuePage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const { items: queueItems, loading, approve, requestRevision } = useMarketingApprovalQueue(
    userId || undefined,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState<TargetChannel | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!selectedId || !queueItems.some((q) => q.id === selectedId)) {
      setSelectedId(queueItems[0]?.id ?? null);
    }
  }, [queueItems, selectedId]);

  const campaigns = useMemo(() => {
    const s = new Set<string>();
    queueItems.forEach((q) => s.add(q.campaignName));
    return Array.from(s).sort();
  }, [queueItems]);

  const filtered = useMemo(() => {
    let list = [...queueItems];
    if (campaignFilter) {
      list = list.filter((q) => q.campaignName === campaignFilter);
    }
    if (channelFilter !== 'all') {
      list = list.filter((q) => q.targetChannel === channelFilter);
    }
    if (riskFilter !== 'all') {
      list = list.filter((q) => deriveRiskLevel(q) === riskFilter);
    }
    list.sort((a, b) => {
      const ta = new Date(a.submittedAt).getTime();
      const tb = new Date(b.submittedAt).getTime();
      return sort === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [queueItems, campaignFilter, channelFilter, riskFilter, sort]);

  useEffect(() => {
    if (selectedId && !filtered.some((q) => q.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((q) => q.id === selectedId) ?? null;

  const handleApprove = () => {
    if (!selected) return;
    void approve(selected.id);
  };

  const handleRevisionSubmit = (payload: { reason: RejectionReason; feedback: string }) => {
    if (!selected) return;
    void requestRevision(selected.id, payload);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <DoraInsightBar module="marketing" fallback="Review AI drafts with truth, brand voice, and compliance telemetry before approval." />
      <div className="flex flex-col gap-2 mb-2 shrink-0">
        <h1 className="text-xl font-semibold text-app">Approval queue</h1>
        <p className="text-sm text-app-muted max-w-3xl">
          Human-in-the-loop review for AI drafts. Pending items load from{' '}
          <code className="text-xs bg-app-surface-tertiary px-1 rounded">GET /api/marketing/approvals?status=pending</code>.
        </p>
      </div>

      {loading && queueItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-app-muted text-sm">Loading queue…</div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_1fr] gap-4">
          <ApprovalList
            items={filtered}
            selectedId={selected?.id ?? null}
            onSelect={(id) => setSelectedId(id)}
            campaignFilter={campaignFilter}
            onCampaignFilter={setCampaignFilter}
            channelFilter={channelFilter}
            onChannelFilter={setChannelFilter}
            riskFilter={riskFilter}
            onRiskFilter={setRiskFilter}
            sort={sort}
            onSort={setSort}
            campaigns={campaigns}
          />
          <ReviewDetail
            item={selected}
            onApprove={handleApprove}
            onRequestRevision={() => setFeedbackOpen(true)}
          />
        </div>
      )}

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        contentTitle={selected?.title ?? ''}
        onSubmit={handleRevisionSubmit}
      />
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { marketingAPI } from '@/lib/marketingApi';
import { mapApiRowToApprovalItem } from '@/pages/marketing/approvalQueue/mapApiApprovalToUi';
import type { ApprovalQueueItem, RejectionReason } from '@/pages/marketing/approvalQueue/types';

export function useMarketingApprovalQueue(userId: string | undefined) {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await marketingAPI.listApprovals(userId, 'pending');
      setItems(rows.map(mapApiRowToApprovalItem));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load approval queue';
      setError(msg);
      toast.error('Could not load approval queue', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const approve = useCallback(
    async (approvalId: string) => {
      if (!userId) return;
      setItems((prev) => prev.filter((x) => x.id !== approvalId));
      try {
        await marketingAPI.submitApprovalReview(userId, approvalId, { status: 'approved' });
        toast.success('Approved', { description: 'Content marked approved.' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Approve failed';
        toast.error('Approve failed', { description: msg });
        void refetch();
      }
    },
    [userId, refetch],
  );

  const requestRevision = useCallback(
    async (approvalId: string, payload: { reason: RejectionReason; feedback: string }) => {
      if (!userId) return;
      setItems((prev) => prev.filter((x) => x.id !== approvalId));
      try {
        await marketingAPI.submitApprovalReview(userId, approvalId, {
          status: 'rejected',
          rejection_reason: payload.reason,
          feedback: payload.feedback,
        });
        toast.message('Revision requested', {
          description: 'The draft will be regenerated with your feedback.',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed';
        toast.error('Could not request revision', { description: msg });
        void refetch();
      }
    },
    [userId, refetch],
  );

  return { items, loading, error, refetch, approve, requestRevision };
}

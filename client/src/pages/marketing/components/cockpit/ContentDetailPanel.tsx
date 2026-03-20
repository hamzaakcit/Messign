import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { formatRelativeTime } from '@/lib/utils';
import type { ApprovalQueueItem } from '../../approvalQueue/types';
import { ChannelBadge } from './ChannelBadge';
import { ContentActions } from './ContentActions';
import { ContentRejectModal } from './ContentRejectModal';
import { ContentRenderer } from './ContentRenderer';
import { StatusBadge } from './StatusBadge';
import { ValidationScores } from './ValidationScores';
import { InstagramPreview } from './InstagramPreview';

function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-3 animate-pulse">
      <div className="h-4 w-1/2 rounded bg-white/[0.06]" />
      <div className="h-24 rounded-lg bg-white/[0.04]" />
      <div className="h-32 rounded-lg bg-white/[0.04]" />
    </div>
  );
}

export function ContentDetailPanel({
  userId,
  contentId,
  initialApprovalId,
  gatekeeperSnapshot,
  onClose,
  onDataChanged,
}: {
  userId: string;
  contentId: string;
  initialApprovalId?: string | null;
  gatekeeperSnapshot?: ApprovalQueueItem | null;
  onClose: () => void;
  onDataChanged: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvalId, setApprovalId] = useState<string | null>(initialApprovalId ?? null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenStyle, setRegenStyle] = useState<
    'modern_noir' | 'vibrant_lifestyle' | 'minimal_flat' | 'editorial'
  >('modern_noir');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !contentId) return;
    setLoading(true);
    try {
      const c = await marketingAPI.getContent(userId, contentId);
      setContent(c);
    } catch (e) {
      toast.error('Could not load content', { description: e instanceof Error ? e.message : 'Unknown error' });
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [userId, contentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (content?.image_prompt) {
      setRegenPrompt(content.image_prompt);
    }
  }, [content?.image_prompt, contentId]);

  useEffect(() => {
    setApprovalId(initialApprovalId ?? null);
  }, [initialApprovalId, contentId]);

  useEffect(() => {
    if (initialApprovalId) return;
    if (!userId || !contentId) return;
    const st = (content?.status ?? '').toLowerCase();
    if (st !== 'in_review' && st !== 'pending_review') {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await marketingAPI.listApprovals(userId, 'pending');
        const row = rows.find((r) => r.content_id === contentId);
        if (!cancelled) setApprovalId(row?.id ?? null);
      } catch {
        if (!cancelled) setApprovalId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, contentId, content?.status, initialApprovalId]);

  const handleApprove = async () => {
    if (!approvalId) {
      toast.error('No pending approval for this item');
      return;
    }
    setActionLoading('approve');
    try {
      await marketingAPI.submitApprovalReview(userId, approvalId, { status: 'approved' });
      toast.success('Approved');
      await onDataChanged();
      await load();
    } catch (e) {
      toast.error('Approve failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!approvalId) return;
    setActionLoading('reject');
    try {
      await marketingAPI.submitApprovalReview(userId, approvalId, {
        status: 'rejected',
        feedback: rejectReason.trim() || 'Rejected from cockpit',
        rejection_reason: 'other',
      });
      toast.message('Revision requested');
      setRejectOpen(false);
      setRejectReason('');
      await onDataChanged();
      await load();
    } catch (e) {
      toast.error('Reject failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendToReview = async () => {
    setActionLoading('review');
    try {
      await marketingAPI.updateContent(userId, contentId, { submit_for_review: true });
      toast.success('Sent for review');
      await onDataChanged();
      await load();
    } catch (e) {
      toast.error('Could not submit for review', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setActionLoading(null);
    }
  };

  const openFull = () => navigate(`/marketing/content?contentId=${encodeURIComponent(contentId)}`);
  const goEdit = () => navigate(`/marketing/content?contentId=${encodeURIComponent(contentId)}`);

  const handleRegenerateImage = async () => {
    const p = regenPrompt.trim();
    if (!p) {
      toast.error('Image prompt is required');
      return;
    }
    setIsRegenerating(true);
    try {
      const r = await marketingAPI.regenerateContentImage(userId, contentId, {
        image_prompt: p,
        style_preset: regenStyle,
      });
      if (!r.success || !r.image_url) {
        toast.error('Image generation failed', { description: r.error ?? 'Unknown error' });
        return;
      }
      toast.success('Image updated');
      setShowRegenerate(false);
      await onDataChanged();
      await load();
    } catch (e) {
      toast.error('Regenerate failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setIsRegenerating(false);
    }
  };

  if (loading && !content) {
    return <PanelSkeleton />;
  }

  if (!content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-slate-500">
        <p>Content not found.</p>
        <button type="button" onClick={onClose} className="text-cyan-400/90 hover:text-cyan-300">
          ← Back
        </button>
      </div>
    );
  }

  const isInstagram = (content.channel ?? '').toLowerCase() === 'instagram';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <button type="button" onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-200">
          ← Back
        </button>
        <button type="button" onClick={openFull} className="text-[11px] text-slate-500 hover:text-slate-200">
          Open full page →
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-white/[0.06] px-3 py-3">
          <div className="flex items-start gap-2">
            <ChannelBadge channel={content.channel} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-slate-100">{content.title}</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Created {formatRelativeTime(content.created_at)}
                {content.author_name ? ` · ${content.author_name}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <StatusBadge status={content.status} />
          </div>
        </div>

        {isInstagram && (
          <>
            <div className="border-b border-white/[0.06] px-3 py-3">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Instagram preview
              </h4>
              <InstagramPreview
                caption={content.body ?? ''}
                imageUrl={content.image_url}
                imagePrompt={content.image_prompt}
                isGenerating={isRegenerating}
              />
            </div>
            <div className="border-b border-white/[0.06] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setRegenPrompt(content.image_prompt ?? content.visual_description ?? '');
                  setShowRegenerate((v) => !v);
                }}
                disabled={isRegenerating}
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-40"
              >
                {showRegenerate ? 'Hide editor' : 'Regenerate image'}
              </button>
              {showRegenerate && (
                <div className="mt-3 space-y-2 rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3">
                  <label className="text-[10px] font-medium uppercase text-slate-500">Style</label>
                  <select
                    value={regenStyle}
                    onChange={(e) => setRegenStyle(e.target.value as typeof regenStyle)}
                    className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[11px] text-slate-200"
                  >
                    <option value="modern_noir">Modern Noir</option>
                    <option value="vibrant_lifestyle">Vibrant Lifestyle</option>
                    <option value="minimal_flat">Minimal Flat-Lay</option>
                    <option value="editorial">Editorial</option>
                  </select>
                  <label className="text-[10px] font-medium uppercase text-slate-500">Image prompt</label>
                  <textarea
                    value={regenPrompt}
                    onChange={(e) => setRegenPrompt(e.target.value)}
                    rows={5}
                    className="w-full resize-y rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600"
                    placeholder="Describe the visual…"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRegenerateImage()}
                    disabled={isRegenerating}
                    className="w-full rounded-lg bg-cyan-600/80 py-2 text-[11px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
                  >
                    {isRegenerating ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="border-b border-white/[0.06] px-3 py-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {isInstagram ? 'Caption & text' : 'Content preview'}
          </h4>
          <div className="max-h-[280px] overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0c0f14] p-2.5">
            <ContentRenderer body={content.body ?? content.body_html ?? ''} />
          </div>
        </div>

        <div className="border-b border-white/[0.06] px-3 py-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Validation</h4>
          <ValidationScores
            truthRaw={content.truth_validation ?? gatekeeperSnapshot?.productTruth}
            brandRaw={content.brand_voice_check ?? gatekeeperSnapshot?.brandVoice}
            complianceRaw={gatekeeperSnapshot?.compliance}
          />
        </div>

        {!isInstagram && content.image_url ? (
          <div className="border-b border-white/[0.06] px-3 py-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Generated visual</h4>
            <img
              src={content.image_url}
              alt={content.visual_description ?? 'Generated image'}
              className="max-h-56 w-full rounded-lg object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-[#080a0e] px-3 py-2.5">
        <ContentActions
          status={content.status}
          approvalId={approvalId}
          actionLoading={actionLoading}
          onApprove={handleApprove}
          onReject={() => setRejectOpen(true)}
          onEdit={goEdit}
          onSendToReview={handleSendToReview}
          publishedAt={content.published_at}
        />
      </div>

      <ContentRejectModal
        open={rejectOpen}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectOpen(false)}
        loading={actionLoading === 'reject'}
      />
    </div>
  );
}

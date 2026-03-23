import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { cn } from '@/lib/utils';
import type { ApprovalQueueItem } from '../../approvalQueue/types';
import { ChannelBadge } from './ChannelBadge';
import { ContentActions } from './ContentActions';
import { ContentRejectModal } from './ContentRejectModal';
import { ContentRenderer } from './ContentRenderer';
import { StatusBadge } from './StatusBadge';
import { ValidationScores } from './ValidationScores';
import { InstagramPreview, type CarouselSlide } from './InstagramPreview';
import { RepurposeModal } from './RepurposeModal';
import { ContentEmailUnlayerControls } from '../ContentEmailUnlayerControls';
import { InstagramIntelligencePanel } from './InstagramIntelligencePanel';
import { isEmailContentItem } from '../../lib/contentEmailGuards';
import { ComplianceDetailPanel } from '../ComplianceDetailPanel';

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
  onSelectContent,
  onAskDora,
}: {
  userId: string;
  contentId: string;
  initialApprovalId?: string | null;
  gatekeeperSnapshot?: ApprovalQueueItem | null;
  onClose: () => void;
  onDataChanged: () => void | Promise<void>;
  /** Navigate context panel to another content row (lineage / variants). */
  onSelectContent?: (id: string) => void;
  /** Command Center agent: send a follow-up prompt (e.g. VA2 re-generate). */
  onAskDora?: (prompt: string) => void;
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
  const [regenStyle, setRegenStyle] = useState<string>('modern_noir');
  const [regenAspectRatio, setRegenAspectRatio] = useState<string>('1:1');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [repurposeOpen, setRepurposeOpen] = useState(false);
  const [childVariants, setChildVariants] = useState<ContentItem[]>([]);

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
    if (!userId || !contentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await marketingAPI.listContent(userId, {
          parent_id: contentId,
          pageSize: '50',
        });
        if (!cancelled) setChildVariants(res.data);
      } catch {
        if (!cancelled) setChildVariants([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, contentId]);

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
    if (st !== 'in_review' && st !== 'pending_review' && st !== 'ready_for_review') {
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
        aspect_ratio: regenAspectRatio !== '1:1' ? regenAspectRatio : undefined,
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

  const handleGenerateVariants = async () => {
    const p = regenPrompt.trim() || content?.image_prompt?.trim();
    if (!p || p.length < 10) {
      toast.error('Image prompt (min 10 chars) is required for variants');
      return;
    }
    setIsGeneratingVariants(true);
    try {
      const r = await marketingAPI.generateImageVariants(userId, contentId, {
        image_prompt: p,
        aspect_ratio: regenAspectRatio !== '1:1' ? regenAspectRatio : undefined,
      });
      if (!r.success || r.variants.length === 0) {
        toast.error('No variants generated');
        return;
      }
      toast.success(`${r.variants.length} variant(s) generated`);
      await onDataChanged();
      await load();
    } catch (e) {
      toast.error('Variants failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setIsGeneratingVariants(false);
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
  const isEmail = isEmailContentItem(content);

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
            </div>
          </div>
          <div className="mt-2">
            <StatusBadge status={content.status} />
          </div>
        </div>

        {content.parent_content_id ? (
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Derived from</p>
            <button
              type="button"
              onClick={() => {
                if (onSelectContent) onSelectContent(content.parent_content_id!);
                else navigate(`/marketing/content?contentId=${encodeURIComponent(content.parent_content_id!)}`);
              }}
              className="text-left text-xs text-purple-400/90 hover:text-purple-300"
            >
              {content.parent_title?.trim() || 'Original content'} →
            </button>
          </div>
        ) : null}

        {childVariants.length > 0 ? (
          <div className="border-b border-white/[0.06] px-3 py-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Repurposed variants ({childVariants.length})
            </h4>
            <div className="space-y-1">
              {childVariants.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    if (onSelectContent) onSelectContent(ch.id);
                    else navigate(`/marketing/content?contentId=${encodeURIComponent(ch.id)}`);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <ChannelBadge channel={ch.channel} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{ch.title}</span>
                  <StatusBadge status={ch.status} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isInstagram && (
          <>
            <div className="border-b border-white/[0.06] px-3 py-3">
              <InstagramPreview
                caption={content.body ?? ''}
                imageUrl={content.image_url}
                imagePrompt={content.image_prompt}
                isGenerating={isRegenerating}
                carouselImages={content.carousel_images as CarouselSlide[] | null | undefined}
              />
            </div>

            {/* Image variants grid */}
            {content.image_variants && content.image_variants.length > 0 && (
              <div className="border-b border-white/[0.06] px-3 py-3">
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Image variants ({content.image_variants.length})
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {content.image_variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={async () => {
                        try {
                          await marketingAPI.updateContent(userId, contentId, { image_url: v.image_url });
                          toast.success('Image selected');
                          await onDataChanged();
                          await load();
                        } catch {
                          toast.error('Failed to select image');
                        }
                      }}
                      className={cn(
                        'group relative overflow-hidden rounded-lg border transition-all',
                        content.image_url === v.image_url
                          ? 'border-cyan-400/60 ring-1 ring-cyan-400/30'
                          : 'border-white/[0.08] hover:border-white/20',
                      )}
                    >
                      <img src={v.image_url} alt="" className="aspect-square w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                        <span className="text-[9px] font-medium text-white/80">
                          {v.style_preset.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {content.image_url === v.image_url && (
                        <div className="absolute right-1 top-1 rounded-full bg-cyan-500 p-0.5">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-b border-white/[0.06] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setRegenPrompt(content.image_prompt ?? content.visual_description ?? '');
                  setShowRegenerate((v) => !v);
                }}
                disabled={isRegenerating || isGeneratingVariants}
                className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-40"
              >
                {showRegenerate ? 'Hide' : 'Regen image'}
              </button>
              {showRegenerate && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <select value={regenStyle} onChange={(e) => setRegenStyle(e.target.value)} title="Style" className="h-7 rounded-md border border-white/[0.08] bg-black/30 px-1.5 text-[10px] text-slate-200">
                    <option value="modern_noir">Noir</option>
                    <option value="vibrant_lifestyle">Vibrant</option>
                    <option value="minimal_flat">Flat</option>
                    <option value="editorial">Editorial</option>
                    <option value="product_spotlight">Product</option>
                    <option value="team_culture">Culture</option>
                    <option value="ugc_style">UGC</option>
                  </select>
                  <div className="flex gap-0.5">
                    {(['1:1', '4:5', '9:16', '16:9'] as const).map((ratio) => (
                      <button key={ratio} type="button" onClick={() => setRegenAspectRatio(ratio)} className={cn('rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors', regenAspectRatio === ratio ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-500 hover:text-slate-300')}>{ratio}</button>
                    ))}
                  </div>
                  <input value={regenPrompt} onChange={(e) => setRegenPrompt(e.target.value)} placeholder="Prompt…" className="flex-1 min-w-[120px] h-7 rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-slate-200 placeholder:text-slate-600" />
                  <button type="button" onClick={() => void handleRegenerateImage()} disabled={isRegenerating || isGeneratingVariants} className="h-7 px-2 rounded-md bg-cyan-600/80 text-[10px] font-medium text-white hover:bg-cyan-500 disabled:opacity-40">{isRegenerating ? '…' : 'Go'}</button>
                  <button type="button" onClick={() => void handleGenerateVariants()} disabled={isRegenerating || isGeneratingVariants} className="h-7 px-2 rounded-md border border-purple-500/30 bg-purple-500/10 text-[10px] font-medium text-purple-300 hover:bg-purple-500/20 disabled:opacity-40">{isGeneratingVariants ? '…' : 'A/B'}</button>
                </div>
              )}
            </div>

            {/* Instagram Intelligence Panel */}
            <div className="border-b border-white/[0.06] px-3 py-3">
              <InstagramIntelligencePanel
                userId={userId}
                content={content}
                onCaptionSelected={(newCaption) => {
                  void (async () => {
                    try {
                      await marketingAPI.updateContent(userId, contentId, { body: newCaption });
                      toast.success('Caption updated');
                      await onDataChanged();
                      await load();
                    } catch {
                      toast.error('Failed to update caption');
                    }
                  })();
                }}
              />
            </div>
          </>
        )}

        {/* Email: VA2 manifest + cockpit assembly details — ContentEmailUnlayerControls */}
        {isEmail ? (
          <div className="border-b border-white/[0.06] px-3 py-3">
            <ContentEmailUnlayerControls
              content={content}
              surface="cockpit"
              onAskDoraRegenerate={onAskDora}
              onUpdated={async () => {
                await onDataChanged();
                await load();
              }}
            />
          </div>
        ) : null}

        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="max-h-[180px] overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0c0f14] p-2.5">
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

        <div className="border-b border-white/[0.06] px-3 py-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Brand compliance</h4>
          <ComplianceDetailPanel contentId={contentId} />
        </div>

        {!isInstagram && content.image_url ? (
          <div className="border-b border-white/[0.06] px-3 py-2">
            <img
              src={content.image_url}
              alt={content.visual_description ?? 'Generated image'}
              className="max-h-56 w-full rounded-lg object-cover"
            />
          </div>
        ) : null}

        {(content.body ?? '').trim().length > 0 ? (
          <div className="border-b border-white/[0.06] px-3 py-2">
            <button
              type="button"
              onClick={() => setRepurposeOpen((o) => !o)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-[11px] font-medium text-purple-300 transition-colors hover:bg-purple-500/15"
            >
              <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
              {repurposeOpen ? 'Hide repurpose' : 'Repurpose to other channels'}
            </button>
            {repurposeOpen ? (
              <RepurposeModal
                userId={userId}
                sourceContentId={content.id}
                sourceChannel={content.channel}
                onComplete={async (variants) => {
                  toast.success(`${variants.length} variant(s) created`);
                  await onDataChanged();
                  await load();
                  try {
                    const res = await marketingAPI.listContent(userId, {
                      parent_id: contentId,
                      pageSize: '50',
                    });
                    setChildVariants(res.data);
                  } catch {
                    /* ignore */
                  }
                }}
                onClose={() => setRepurposeOpen(false)}
              />
            ) : null}
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

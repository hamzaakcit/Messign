import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Clock, Eye, Rocket, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { InstagramStudio } from './instagram/InstagramStudio';
import { OfferDetailView } from './OfferDetailView';
import {
  aspectRatioForInstagramFormat,
  instagramFormatFromTags,
  type InstagramFormat,
} from '../lib/instagramFormat';
import { ContentEmailSection } from './ContentEmailSection';
import { ComplianceDetailPanel } from './ComplianceDetailPanel';
import { useMarketingContext } from '../MarketingContext';
import { journeyTemplateRefFromTags } from '../lib/journeyTemplateRef';
import { offerChildStatusLine } from '../lib/offerChildStatus';
import { useContentTenant } from '../lib/contentTenant';
import { resolveCampaignId } from '../lib/offerCampaign';
import { readStudioSheet } from '../lib/offerSheetForm';

interface ContentDetailPanelProps {
  contentId: string;
  onUpdated: () => void;
  /** Bumped when Lucy finishes writing this row. */
  refreshKey?: number;
}

export function ContentDetailPanel({ contentId, onUpdated, refreshKey = 0 }: ContentDetailPanelProps) {
  const { user } = useAuthStore();
  const { openDetail, approvalItems = [], approveItem, campaigns = [], invalidateWorkspace } = useMarketingContext();
  const { setup: contentTenant } = useContentTenant();
  const userId = user?.authUserId || user?.id || '';
  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [igFormat, setIgFormat] = useState<InstagramFormat>('feed');
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [writingCaption, setWritingCaption] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [publishMode, setPublishMode] = useState<'mock' | 'live'>('mock');
  const [testPublishing, setTestPublishing] = useState(false);
  const [offerChildrenLine, setOfferChildrenLine] = useState<string | null>(null);
  const [offerChildren, setOfferChildren] = useState<ContentItem[]>([]);
  const [childrenVersion, setChildrenVersion] = useState(0);
  const hasContentRef = useRef(false);
  hasContentRef.current = content != null;

  useEffect(() => {
    if (!userId || (content?.channel ?? '').toLowerCase() !== 'instagram') return;
    let cancelled = false;
    void marketingAPI.instagramPublishMode(userId).then((row) => {
      if (!cancelled) setPublishMode(row.mode === 'live' ? 'live' : 'mock');
    }).catch(() => {
      if (!cancelled) setPublishMode('mock');
    });
    return () => {
      cancelled = true;
    };
  }, [userId, content?.channel]);

  const offerId = content?.content_type === 'offer' ? content.id : content?.parent_content_id ?? null;
  useEffect(() => {
    if (!userId || !offerId) {
      setOfferChildrenLine(null);
      setOfferChildren([]);
      return;
    }
    let cancelled = false;
    void marketingAPI.listContent(userId, { parent_id: offerId, pageSize: '20' }).then((result) => {
      if (cancelled) return;
      setOfferChildren(result.data);
      setOfferChildrenLine(offerChildStatusLine(result.data));
    }).catch(() => {
      if (cancelled) return;
      setOfferChildren([]);
      setOfferChildrenLine(null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, offerId, content?.status, childrenVersion]);

  const fetchContent = useCallback(async () => {
    if (!userId || !contentId) return;
    if (!hasContentRef.current) setLoading(true);
    setLoadError(null);
    try {
      const result = await marketingAPI.getContent(userId, contentId);
      const format = instagramFormatFromTags(result.tags);
      if (format) setIgFormat(format);
      setContent(result);
    } catch (e) {
      setContent(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load content');
      toast.error('Could not load content', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [contentId, userId, refreshKey]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  /** Takes a post (or a cart offer's email) back from review or approval to a draft, so it can be changed again. */
  const handleBackToDraft = async (childId: string) => {
    setSubmittingReview(true);
    try {
      await marketingAPI.updateContent(userId, childId, { status: 'draft' });
      toast.success('Back to draft');
      setChildrenVersion((n) => n + 1);
      await fetchContent();
      onUpdated();
    } catch (e) {
      toast.error('Could not go back to draft', { description: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleOfferLooksGood = async (childId: string) => {
    setSubmittingReview(true);
    try {
      await marketingAPI.updateContent(userId, childId, { submit_for_review: true });
      toast.success('Marked ready for review');
      setChildrenVersion((n) => n + 1);
      onUpdated();
    } catch (e) {
      toast.error('Could not send to review', { description: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setSubmittingReview(false);
    }
  };

  /** Names the offer under a campaign (or removes it). The post and the email move with it. */
  const handleCampaign = async (name: string) => {
    if (!offerId) return;
    setSavingCampaign(true);
    try {
      const campaignId = await resolveCampaignId(userId, name, campaigns);
      await Promise.all(
        [offerId, ...offerChildren.map((child) => child.id)].map((id) => marketingAPI.updateContent(userId, id, { campaign_id: campaignId })),
      );
      toast.success(campaignId ? 'Campaign saved' : 'Removed from the campaign');
      setChildrenVersion((n) => n + 1);
      await fetchContent();
      await invalidateWorkspace?.();
      onUpdated();
    } catch (e) {
      toast.error('Could not save the campaign', { description: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setSavingCampaign(false);
    }
  };

  /** The model writes (or rewrites) the post's caption from the offer sheet. Only a draft post can be written. */
  const handleWriteCaption = async (postId: string) => {
    setWritingCaption(true);
    try {
      await marketingAPI.writeCaption(userId, postId, contentTenant.brandName);
      toast.success('Caption written');
      setChildrenVersion((n) => n + 1);
      onUpdated();
    } catch (e) {
      toast.error('Could not write the caption', { description: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setWritingCaption(false);
    }
  };

  const canApprove = user?.role === 'manager' || user?.role === 'admin';

  const handleOfferApprove = async (childId: string) => {
    setSubmittingReview(true);
    try {
      const queued = approvalItems.find((item) => item.contentId === childId);
      if (queued && approveItem) await approveItem(queued.id);
      else {
        await marketingAPI.updateContent(userId, childId, { status: 'approved' });
        toast.success('Approved');
      }
      setChildrenVersion((n) => n + 1);
      onUpdated();
    } catch (e) {
      toast.error('Could not approve', { description: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDraftJourneyEmail = async (stay = false) => {
    if (!content) return;
    setDraftingEmail(true);
    try {
      const email = await marketingAPI.draftJourneyEmail(userId, content.id);
      toast.success('Journey email draft ready');
      if (stay) setChildrenVersion((n) => n + 1);
      else openDetail({ type: 'content', id: email.id });
      onUpdated();
    } catch (e) {
      toast.error('Could not draft the journey email', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setDraftingEmail(false);
    }
  };

  const handleManualSchedule = async () => {
    if (!content || !scheduleDate) return;
    try {
      await marketingAPI.scheduleContent(userId, content.id, scheduleDate, scheduleTime || undefined);
      toast.success('Scheduled', { description: `${scheduleDate}${scheduleTime ? ` at ${scheduleTime}` : ''}` });
      setShowScheduleEditor(false);
      await fetchContent();
      onUpdated();
    } catch (e) {
      toast.error('Schedule failed', { description: e instanceof Error ? e.message : 'Unknown' });
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-app-muted">Loading content…</div>;
  }

  if (loadError || !content) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm font-medium text-app-text">Content unavailable</p>
        <p className="text-xs text-app-muted max-w-md mx-auto">{loadError ?? 'This item may have been removed or is not a content post.'}</p>
        <button
          type="button"
          onClick={() => void fetchContent()}
          className="text-xs text-primary-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const isInstagram = (content.channel ?? '').toLowerCase() === 'instagram';
  const isEmail = (content.channel ?? '').toLowerCase() === 'email';

  if (content.content_type === 'offer') {
    const instagram = offerChildren.find((child) => (child.channel ?? '').toLowerCase() === 'instagram') ?? null;
    const email = offerChildren.find((child) => (child.channel ?? '').toLowerCase() === 'email') ?? null;
    const picture = readStudioSheet(instagram?.user_brief || content.user_brief);
    return (
      <OfferDetailView
        offer={content}
        instagram={instagram}
        email={email}
        onLooksGood={(childId) => void handleOfferLooksGood(childId)}
        onApprove={(childId) => void handleOfferApprove(childId)}
        canApprove={canApprove}
        submitting={submittingReview}
        onOpenChild={(childId) => openDetail({ type: 'content', id: childId })}
        onBackToDraft={(childId) => void handleBackToDraft(childId)}
        onWriteCaption={(postId) => void handleWriteCaption(postId)}
        writingCaption={writingCaption}
        campaignName={content.campaign_name ?? null}
        campaignNames={campaigns.map((c) => c.name)}
        onCampaign={(name) => void handleCampaign(name)}
        savingCampaign={savingCampaign}
        onDraftJourneyEmail={() => void handleDraftJourneyEmail(true)}
        draftingEmail={draftingEmail}
        publishAllowed={contentTenant.publishAllowed}
        brandName={contentTenant.brandName}
        regenerating={isGeneratingImage}
        onRegenerate={
          instagram && picture.scene
            ? () => {
                setIsGeneratingImage(true);
                void marketingAPI
                  .regenerateContentImage(userId, instagram.id, {
                    image_prompt: picture.scene,
                    style_preset: picture.style,
                  })
                  .then(async (result) => {
                    if (!result.success) {
                      toast.error('Image generation failed', { description: result.error ?? 'Request failed' });
                      return;
                    }
                    toast.success('Image generated');
                    // The still lives on the post, a child of this offer: reload the children too.
                    setChildrenVersion((n) => n + 1);
                    await fetchContent();
                    onUpdated();
                  })
                  .catch((err: unknown) => {
                    toast.error('Image generation failed', {
                      description: err instanceof Error ? err.message : 'Request failed',
                    });
                  })
                  .finally(() => {
                    setIsGeneratingImage(false);
                  });
              }
            : undefined
        }
      />
    );
  }

  const formatAspectRatio = aspectRatioForInstagramFormat(igFormat);

  return (
    <div className="flex h-full min-h-0 gap-0 bg-[#f4efe8] text-[#1c1917]">
      {/* Left column: preview + controls */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {[
              content.content_type,
              content.status,
              ...(isInstagram ? [igFormat === 'feed' ? '1:1 Feed' : igFormat === 'story' ? '9:16 Story' : '9:16 Reel'] : []),
            ].map((label) => (
              <span key={label} className="rounded-full border border-[#e7e0d6] bg-white px-2.5 py-0.5 text-xs text-[#44403c]">{label}</span>
            ))}
          </div>
          {isEmail ? (
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#78716c]">Subject</p>
          ) : null}
          <h3 className="text-2xl font-medium text-[#1c1917]">{content.title}</h3>
          {content.parent_title ? (
            <p className="mt-1 text-xs text-[#78716c]">Offer · {content.parent_title}</p>
          ) : null}
          {offerChildrenLine ? (
            <p className="mt-1 text-xs text-[#57534e]" data-testid="offer-child-status">{offerChildrenLine}</p>
          ) : null}
          {offerChildren.some((child) => child.id !== content.id && (child.channel === 'email' || child.channel === 'instagram')) ? (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="offer-siblings">
              {offerChildren
                .filter((child) => child.id !== content.id && (child.channel === 'email' || child.channel === 'instagram'))
                .map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    data-testid={`offer-sibling-${(child.channel ?? 'child').toLowerCase()}`}
                    onClick={() => openDetail({ type: 'content', id: child.id })}
                    className="rounded-lg border border-[#e7e0d6] bg-white px-2.5 py-1 text-xs text-[#44403c] hover:border-[#a8a29e]"
                  >
                    {child.channel === 'email' ? 'Email' : 'Instagram'} · {child.title}
                  </button>
                ))}
            </div>
          ) : null}
          <p className="text-sm text-[#78716c] mt-2">{content.channel || 'No channel'} • {content.campaign_name || 'No campaign'}</p>
        </div>

        <div className="flex items-center gap-4 text-xs text-[#78716c]">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {content.scheduled_date
              ? `${content.scheduled_date}${content.scheduled_time ? ` · ${content.scheduled_time}` : ''}`
              : 'Not scheduled'}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> {(content.views ?? 0).toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Send className="w-3 h-3" /> {(content.leads_attributed ?? 0).toLocaleString()}
          </span>
        </div>

        {/* Instagram format selector */}
        {isInstagram && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#78716c]">Format</span>
            {(['feed', 'story', 'reel'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setIgFormat(fmt)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors capitalize',
                  igFormat === fmt
                    ? 'border-[#1c1917] bg-[#1c1917] text-white'
                    : 'border-[#e7e0d6] bg-white text-[#44403c] hover:border-[#a8a29e]',
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
        )}

        {!isInstagram && journeyTemplateRefFromTags(content.tags) ? (
          <div className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2">
            <p className="text-sm font-medium text-[#1c1917]">Ready for journey</p>
            <p className="mt-1 text-xs text-[#78716c]">
              This screen does not send. Engage will render this template later.
            </p>
          </div>
        ) : null}

        {isInstagram ? null : (
          <ContentEmailSection
            content={content}
            onUpdated={async () => {
              await fetchContent();
              onUpdated();
            }}
          />
        )}

        {isInstagram ? (
          <InstagramStudio
            content={content}
            isGenerating={isGeneratingImage}
            onUploadReferenceImage={async (file) => {
              const r = await marketingAPI.uploadReferenceImage(userId, content.id, file);
              setContent((c) => (c ? { ...c, reference_image_url: r.reference_image_url } : c));
              toast.success('Reference photo saved', { description: 'Use “Apply AI to photo” or Regenerate to blend edits.' });
            }}
            onApplyAiPhotoEdit={async (editPrompt, stylePreset) => {
              setIsGeneratingImage(true);
              try {
                const r = await marketingAPI.aiPhotoEdit(userId, content.id, {
                  edit_prompt: editPrompt,
                  style_preset: stylePreset || 'photoreal',
                });
                if (r.success && r.image_url) {
                  setContent((c) =>
                    c
                      ? {
                          ...c,
                          image_url: r.image_url,
                          image_prompt: editPrompt,
                          visual_description: editPrompt,
                        }
                      : c,
                  );
                  toast.success('AI edit applied');
                  onUpdated();
                } else {
                  toast.error('AI photo edit failed', {
                    description:
                      r.error ??
                      'Check FAL_KEY and FAL_IMAGE_EDIT_MODEL (e.g. fal-ai/flux-pro/kontext).',
                  });
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Request failed';
                const aborted = msg === 'The user aborted a request.' || /aborted|AbortError/i.test(msg);
                toast.error('AI photo edit failed', {
                  description: aborted
                    ? 'The request was cancelled or hit the 15-minute client limit. Try again with a shorter edit instruction.'
                    : msg,
                });
              } finally {
                setIsGeneratingImage(false);
              }
            }}
            onSelectImageVariant={async (imageUrl) => {
              try {
                await marketingAPI.updateContent(userId, content.id, { image_url: imageUrl });
                toast.success('Image selected');
                await fetchContent();
                onUpdated();
              } catch {
                toast.error('Failed to select image');
              }
            }}
            onRegenerateImage={async (newPrompt, stylePreset, slideIndex = 0, extras) => {
              setIsGeneratingImage(true);
              try {
                const r = await marketingAPI.regenerateContentImage(userId, content.id, {
                  image_prompt: newPrompt,
                  style_preset: stylePreset,
                  aspect_ratio: formatAspectRatio !== '1:1' ? formatAspectRatio : undefined,
                  slide_index: slideIndex,
                  mock: extras?.mock === true,
                });
                if (r.success && r.image_url) {
                  if (slideIndex === 0) {
                    setContent((c) =>
                      c ? { ...c, image_url: r.image_url, image_prompt: newPrompt, visual_description: newPrompt } : c,
                    );
                  }
                  toast.success(slideIndex > 0 ? `Slide ${slideIndex + 1} updated` : 'Image generated');
                  await fetchContent();
                  onUpdated();
                } else {
                  toast.error('Image generation failed', {
                    description:
                      r.error ??
                      'Check server env: OPENAI_API_KEY and/or GOOGLE_GEMINI_API_KEY (optional LITELLM_MASTER_KEY unless IMAGE_GEN_OPENAI_GEMINI_ONLY=1).',
                  });
                }
              } catch (e) {
                toast.error('Image generation failed', {
                  description: e instanceof Error ? e.message : 'Request failed',
                });
              } finally {
                setIsGeneratingImage(false);
              }
            }}
          />
        ) : (
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-4">
            <div className="text-sm text-[#1c1917] whitespace-pre-wrap">{content.body || 'No body yet.'}</div>
          </div>
        )}

        {(content.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {content.tags?.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-white border border-[#e7e0d6] text-[#78716c]">{tag}</span>
            ))}
          </div>
        )}

        {isInstagram ? (
          <div className="flex flex-wrap items-center gap-2">
            {(content.parent_content_id || content.content_type === 'offer') &&
              !offerChildren.some((child) => (child.channel ?? '').toLowerCase() === 'email') && (
              <button
                type="button"
                onClick={() => void handleDraftJourneyEmail()}
                disabled={draftingEmail}
                className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
              >
                {draftingEmail ? 'Drafting email…' : 'Draft journey email'}
              </button>
            )}
            {isInstagram && contentTenant.publishAllowed ? (
            <button
              type="button"
              onClick={() => {
                setTestPublishing(true);
                void marketingAPI.testPublishInstagram(userId, content.id).then((result) => {
                  const mode = result.mode === 'live' ? 'live' : 'mock';
                  setPublishMode(mode);
                  toast.success(
                    result.skipped ? `Share · ${mode} skipped` : mode === 'live' ? 'Shared to Instagram' : `Test publish · ${mode}`,
                    { description: result.publishedUrl },
                  );
                  void fetchContent();
                  onUpdated();
                }).catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'Share failed');
                }).finally(() => setTestPublishing(false));
              }}
              disabled={testPublishing || !(content.image_url ?? '').trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm font-medium text-[#44403c] hover:border-[#a8a29e] disabled:opacity-40"
            >
              <Rocket className="h-3.5 w-3.5" />
              {testPublishing ? 'Publishing…' : `Test publish · ${publishMode}`}
            </button>
            ) : isInstagram ? (
              <p className="text-xs text-[#78716c]" data-testid="publish-off">
                Publish is off for {contentTenant.brandName}.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowScheduleEditor((v) => !v)}
              title={content.scheduled_date ? 'Reschedule' : 'Schedule'}
              aria-label={content.scheduled_date ? 'Reschedule' : 'Schedule'}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#e7e0d6] bg-white text-[#44403c] hover:border-[#a8a29e] transition-colors"
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>
        )}

        {content.brand_profile_id && (
          <ComplianceDetailPanel contentId={content.id} />
        )}

        {/* Schedule editor */}
        {showScheduleEditor && (
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[#78716c]">Pick date & time</p>
            <div className="flex items-center gap-3">
              <input
                type="date"
                title="Schedule date"
                value={scheduleDate || content.scheduled_date || ''}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm text-[#1c1917]"
              />
              <input
                type="time"
                title="Schedule time"
                value={scheduleTime || content.scheduled_time || ''}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg border border-[#e7e0d6] bg-white px-3 py-2 text-sm text-[#1c1917]"
              />
              <button
                onClick={() => void handleManualSchedule()}
                disabled={!scheduleDate}
                className="rounded-lg bg-[#1c1917] px-4 py-2 text-sm font-medium text-white hover:bg-[#292524] disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


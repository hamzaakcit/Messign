import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Clock, Eye, Rocket, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
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
import { readStudioSheet } from '../lib/offerSheetForm';
import { OfferSheetDetail } from './OfferSheetDetail';

interface ContentDetailPanelProps {
  contentId: string;
  onUpdated: () => void;
  /** Bumped when Lucy finishes writing this row. */
  refreshKey?: number;
}

export function ContentDetailPanel({ contentId, onUpdated, refreshKey = 0 }: ContentDetailPanelProps) {
  const { user } = useAuthStore();
  const { openDetail, approvalItems = [], approveItem } = useMarketingContext();
  const { setup: contentTenant } = useContentTenant();
  const userId = user?.authUserId || user?.id || '';
  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState('');
  const [igFormat, setIgFormat] = useState<InstagramFormat>('feed');
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);
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

  const waitingOnLucy =
    (content?.channel ?? '').toLowerCase() === 'instagram' &&
    (!(content?.body ?? '').trim() || !(content?.image_url ?? '').trim()) &&
    (content?.status ?? 'draft') === 'draft';

  useEffect(() => {
    if (!waitingOnLucy) return undefined;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 3 * 60 * 1000) {
        window.clearInterval(timer);
        return;
      }
      void fetchContent();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [waitingOnLucy, fetchContent]);

  const handleLooksGood = async () => {
    if (!content) return;
    setSubmittingReview(true);
    try {
      await marketingAPI.updateContent(userId, content.id, { submit_for_review: true });
      toast.success('Marked ready for review');
      await fetchContent();
      onUpdated();
    } catch (e) {
      toast.error('Could not send to review', { description: e instanceof Error ? e.message : 'Request failed' });
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
        onDraftJourneyEmail={() => void handleDraftJourneyEmail(true)}
        draftingEmail={draftingEmail}
        publishAllowed={contentTenant.publishAllowed}
        brandName={contentTenant.brandName}
        regenerating={isGeneratingImage}
        onRegenerate={
          instagram && picture.scene
            ? () => {
                setIsGeneratingImage(true);
                setImageGenProgress('Regenerating visual…');
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
                    setImageGenProgress('');
                  });
              }
            : undefined
        }
      />
    );
  }

  const formatAspectRatio = aspectRatioForInstagramFormat(igFormat);

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Left column: preview + controls */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="blue">{content.content_type}</Badge>
            <Badge variant={content.status === 'published' ? 'green' : 'default'}>{content.status}</Badge>
            {isInstagram && (
              <Badge variant="purple">{igFormat === 'feed' ? '1:1 Feed' : igFormat === 'story' ? '9:16 Story' : '9:16 Reel'}</Badge>
            )}
          </div>
          {isEmail ? (
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Subject</p>
          ) : null}
          <h3 className="text-2xl font-semibold text-app-text">{content.title}</h3>
          {content.parent_title ? (
            <p className="mt-1 text-xs text-violet-300/90">Offer · {content.parent_title}</p>
          ) : null}
          {offerChildrenLine ? (
            <p className="mt-1 text-xs text-slate-300" data-testid="offer-child-status">{offerChildrenLine}</p>
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
                    className="rounded-lg border border-white/[0.08] bg-app-surface-tertiary px-2.5 py-1 text-xs text-slate-200 hover:border-app-border-strong"
                  >
                    {child.channel === 'email' ? 'Email' : 'Instagram'} · {child.title}
                  </button>
                ))}
            </div>
          ) : null}
          <p className="text-sm text-app-muted mt-2">{content.channel || 'No channel'} • {content.campaign_name || 'No campaign'}</p>
        </div>

        <div className="flex items-center gap-4 text-xs text-app-muted">
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Format</span>
            {(['feed', 'story', 'reel'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setIgFormat(fmt)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors capitalize',
                  igFormat === fmt
                    ? 'border-pink-500/40 bg-pink-500/10 text-pink-300'
                    : 'border-white/[0.08] bg-app-surface-tertiary text-slate-400 hover:border-app-border-strong',
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
        )}

        {!isInstagram && journeyTemplateRefFromTags(content.tags) ? (
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
            <p className="text-sm font-medium text-violet-100">Ready for journey</p>
            <p className="mt-1 text-xs text-violet-200/80">
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
            progressMessage={imageGenProgress}
            onUploadReferenceImage={async (file) => {
              const r = await marketingAPI.uploadReferenceImage(userId, content.id, file);
              setContent((c) => (c ? { ...c, reference_image_url: r.reference_image_url } : c));
              toast.success('Reference photo saved', { description: 'Use “Apply AI to photo” or Regenerate to blend edits.' });
            }}
            onApplyAiPhotoEdit={async (editPrompt, stylePreset) => {
              setIsGeneratingImage(true);
              setImageGenProgress('AI editing your photo…');
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
                setImageGenProgress('');
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
              setImageGenProgress(slideIndex > 0 ? `Regenerating slide ${slideIndex + 1}…` : 'Regenerating visual…');
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
                setImageGenProgress('');
              }
            }}
          />
        ) : (
          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4">
            <div className="text-sm text-app-text whitespace-pre-wrap">{content.body || 'No body yet.'}</div>
          </div>
        )}

        {isInstagram ? (
          <OfferSheetDetail
            brief={content.user_brief}
            returnedPrompt={content.image_generation_metadata?.fal_returned_prompt}
            referenceImageUrl={content.reference_image_url}
          />
        ) : null}

        {(content.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {content.tags?.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-app-surface-tertiary text-app-muted">{tag}</span>
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
                className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
              >
                {draftingEmail ? 'Drafting email…' : 'Draft journey email'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleLooksGood()}
              disabled={submittingReview || !(content.body ?? '').trim() || content.status === 'in_review'}
              className="rounded-lg bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-40"
            >
              {content.status === 'in_review' ? 'In review' : submittingReview ? 'Sending…' : 'Looks good'}
            </button>
            <button
              type="button"
              onClick={() => {
                void marketingAPI.updateContent(userId, content.id, { status: 'draft' }).then(() => {
                  toast.success('Draft');
                  void fetchContent();
                  onUpdated();
                }).catch(() => toast.error('Could not save the draft'));
              }}
              className="rounded-lg border border-white/[0.08] bg-app-surface-tertiary px-3 py-2 text-sm font-medium text-slate-200 hover:border-app-border-strong"
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setShowScheduleEditor((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
            >
              <Clock className="h-3.5 w-3.5" />
              Scheduled
            </button>
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              <Rocket className="h-3.5 w-3.5" />
              {testPublishing ? 'Publishing…' : `Test publish · ${publishMode}`}
            </button>
            ) : isInstagram ? (
              <p className="text-xs text-app-muted" data-testid="publish-off">
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
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-colors"
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
          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pick date & time</p>
            <div className="flex items-center gap-3">
              <input
                type="date"
                title="Schedule date"
                value={scheduleDate || content.scheduled_date || ''}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-slate-200"
              />
              <input
                type="time"
                title="Schedule time"
                value={scheduleTime || content.scheduled_time || ''}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-slate-200"
              />
              <button
                onClick={() => void handleManualSchedule()}
                disabled={!scheduleDate}
                className="rounded-lg bg-cyan-600/80 px-4 py-2 text-sm font-medium text-app-text hover:bg-cyan-500 disabled:opacity-40"
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


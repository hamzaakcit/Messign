import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Clock, Eye, Layers, Rocket, Send, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { InstagramCockpit } from './InstagramCockpit';
import { ContentEmailSection } from './ContentEmailSection';
import { BatchPanel } from './BatchPanel';
import { InstagramIntelligencePanel } from './cockpit/InstagramIntelligencePanel';
import { ComplianceDetailPanel } from './ComplianceDetailPanel';

type InstagramFormat = 'feed' | 'story' | 'reel';

interface ContentDetailPanelProps {
  contentId: string;
  onUpdated: () => void;
}

export function ContentDetailPanel({ contentId, onUpdated }: ContentDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState('');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [igFormat, setIgFormat] = useState<InstagramFormat>('feed');
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const fetchContent = useCallback(async () => {
    if (!userId || !contentId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await marketingAPI.getContent(userId, contentId);
      setContent(result);
    } catch (e) {
      setContent(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load content');
      toast.error('Could not load content', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [contentId, userId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleAutoSchedule = async () => {
    if (!content) return;
    setAutoScheduling(true);
    try {
      const bestTimes = await marketingAPI.getBestTimesToPost(userId, { topN: 1 });
      const slot = bestTimes.data.topSlots[0];
      if (!slot) {
        toast.error('No optimal slot found');
        return;
      }
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIdx = dayNames.indexOf(slot.day);
      const currentDay = now.getDay();
      let daysAhead = targetDayIdx - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + daysAhead);
      const dateStr = targetDate.toISOString().slice(0, 10);
      const timeStr = `${String(slot.hour).padStart(2, '0')}:00`;

      await marketingAPI.scheduleContent(userId, content.id, dateStr, timeStr);
      toast.success(`Scheduled for ${slot.day} at ${slot.timeSlot}`, { description: slot.reason });
      await fetchContent();
      onUpdated();
    } catch (e) {
      toast.error('Auto-schedule failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setAutoScheduling(false);
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

  const formatAspectRatio: Record<InstagramFormat, string> = {
    feed: '1:1',
    story: '9:16',
    reel: '9:16',
  };

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
          <h3 className="text-2xl font-semibold text-app-text">{content.title}</h3>
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

        <ContentEmailSection
          content={content}
          onUpdated={async () => {
            await fetchContent();
            onUpdated();
          }}
        />

        {isInstagram ? (
          <InstagramCockpit
            caption={content.body ?? ''}
            contentTitle={content.title}
            imageUrl={content.image_url ?? null}
            imagePrompt={content.image_prompt ?? null}
            altText={content.visual_description ?? null}
            isGenerating={isGeneratingImage}
            progressMessage={imageGenProgress}
            contentId={content.id}
            referenceImageUrl={content.reference_image_url ?? null}
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
            onRegenerateImage={async (newPrompt, stylePreset) => {
              setIsGeneratingImage(true);
              setImageGenProgress('Regenerating visual…');
              try {
                const r = await marketingAPI.regenerateContentImage(userId, content.id, {
                  image_prompt: newPrompt,
                  style_preset: stylePreset,
                  aspect_ratio: formatAspectRatio[igFormat] !== '1:1' ? formatAspectRatio[igFormat] : undefined,
                });
                if (r.success && r.image_url) {
                  setContent((c) =>
                    c ? { ...c, image_url: r.image_url, image_prompt: newPrompt, visual_description: newPrompt } : c,
                  );
                  toast.success('Image generated');
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

        {(content.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {content.tags?.map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-app-surface-tertiary text-app-muted">{tag}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              void marketingAPI.publishContent(userId, content.id).then(() => {
                toast.success('Published');
                void fetchContent();
                onUpdated();
              }).catch(() => toast.error('Publish failed'));
            }}
            title="Publish"
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
          >
            <Rocket className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowScheduleEditor((v) => !v)}
            title={content.scheduled_date ? 'Reschedule' : 'Schedule'}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-colors"
          >
            <Clock className="w-4 h-4" />
          </button>
          {!content.scheduled_date && (
            <button
              onClick={() => void handleAutoSchedule()}
              disabled={autoScheduling}
              title="Auto-schedule"
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowBatchPanel(true)}
            title="Atomize to channels"
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

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

        {showBatchPanel && (
          <BatchPanel heroContent={content} onClose={() => setShowBatchPanel(false)} />
        )}
      </div>

      {/* Right column: Instagram Intelligence */}
      {isInstagram && (
        <div className="w-[340px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[#0a0d12] p-4">
          <InstagramIntelligencePanel
            userId={userId}
            content={content}
            onCaptionSelected={async (newCaption) => {
              try {
                await marketingAPI.updateContent(userId, contentId, { body: newCaption });
                toast.success('Caption updated');
                await fetchContent();
                onUpdated();
              } catch {
                toast.error('Failed to update caption');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}


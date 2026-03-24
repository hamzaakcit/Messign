import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HashtagData = Awaited<ReturnType<typeof marketingAPI.analyzeHashtags>>['data'];
type BestTimeData = Awaited<ReturnType<typeof marketingAPI.getBestTimesToPost>>['data'];
type CaptionVariant = Awaited<ReturnType<typeof marketingAPI.generateCaptionVariants>>['data'][number];
type EngagementData = Awaited<ReturnType<typeof marketingAPI.predictEngagement>>['data'];

type Tab = 'hashtags' | 'timing' | 'captions' | 'engagement';

/** Must match `server/src/routes/marketing/instagram.ts` POST /predict-engagement validation. */
const MIN_CAPTION_CHARS_ENGAGEMENT = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHashtags(caption: string): string[] {
  return (caption.match(/#[\w\u00C0-\u024F]+/g) ?? []).map((t) => t.toLowerCase());
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const tierColors: Record<string, string> = {
  high: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  mid: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  niche: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color =
    score >= 70 ? 'stroke-emerald-400' : score >= 40 ? 'stroke-amber-400' : 'stroke-red-400';
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="currentColor"
        className="text-app-text/[0.06]"
        strokeWidth={4}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        className={color}
        strokeWidth={4}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className={cn('fill-current text-[10px] font-bold rotate-90', color)}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {score}
      </text>
    </svg>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 70 ? 'bg-emerald-500/60' : value >= 40 ? 'bg-amber-500/60' : 'bg-red-500/60';
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-app-surface-tertiary">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right text-[10px] font-medium text-slate-300">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstagramIntelligencePanel({
  userId,
  content,
  onCaptionSelected,
}: {
  userId: string;
  content: ContentItem;
  onCaptionSelected?: (caption: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('engagement');
  const [hashtagData, setHashtagData] = useState<HashtagData | null>(null);
  const [bestTimeData, setBestTimeData] = useState<BestTimeData | null>(null);
  const [captionVariants, setCaptionVariants] = useState<CaptionVariant[]>([]);
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(false);

  const caption = content.body ?? '';
  const hashtags = extractHashtags(caption);

  // --- Auto-run engagement prediction on mount / content change ---
  const runEngagement = useCallback(async () => {
    const trimmed = caption.trim();
    if (trimmed.length < MIN_CAPTION_CHARS_ENGAGEMENT) {
      setEngagementData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await marketingAPI.predictEngagement(userId, {
        caption,
        hashtags,
        hasImage: Boolean(content.image_url),
        hasCarousel: Boolean(content.carousel_images?.length),
      });
      setEngagementData(res.data);
    } catch {
      toast.error('Engagement prediction failed');
    } finally {
      setLoading(false);
    }
  }, [userId, caption, hashtags.length, content.image_url, content.carousel_images?.length]);

  useEffect(() => {
    void runEngagement();
  }, [runEngagement]);

  // --- Fetch on tab switch ---
  const fetchTab = useCallback(async (t: Tab) => {
    if (t === 'engagement' && engagementData) return;
    if (t === 'hashtags' && hashtagData) return;
    if (t === 'timing' && bestTimeData) return;
    if (t === 'captions' && captionVariants.length > 0) return;
    setLoading(true);
    try {
      switch (t) {
        case 'hashtags': {
          const res = await marketingAPI.analyzeHashtags(userId, hashtags.length ? hashtags : ['#marketing']);
          setHashtagData(res.data);
          break;
        }
        case 'timing': {
          const res = await marketingAPI.getBestTimesToPost(userId);
          setBestTimeData(res.data);
          break;
        }
        case 'captions': {
          if (caption.length < 10) {
            toast.error('Caption too short for variant generation');
            break;
          }
          const res = await marketingAPI.generateCaptionVariants(userId, caption, 3);
          setCaptionVariants(res.data);
          break;
        }
        case 'engagement': {
          await runEngagement();
          break;
        }
      }
    } catch {
      toast.error(`Failed to load ${t} data`);
    } finally {
      setLoading(false);
    }
  }, [userId, hashtags, caption, hashtagData, bestTimeData, captionVariants.length, engagementData, runEngagement]);

  const handleTabSwitch = (t: Tab) => {
    setTab(t);
    void fetchTab(t);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabs: { id: Tab; label: string }[] = [
    { id: 'engagement', label: 'Score' },
    { id: 'hashtags', label: 'Hashtags' },
    { id: 'timing', label: 'Timing' },
    { id: 'captions', label: 'Captions' },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Instagram Intelligence
      </h4>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-[#0a0d12] p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabSwitch(t.id)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors',
              tab === t.id
                ? 'bg-app-surface-tertiary text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/40 border-t-cyan-400" />
        </div>
      )}

      {/* Engagement score — server requires caption ≥ 5 chars; avoid 400 when body is empty/short */}
      {!loading && tab === 'engagement' && !engagementData && caption.trim().length < MIN_CAPTION_CHARS_ENGAGEMENT && (
        <p className="rounded-lg border border-white/[0.06] bg-[#0c0f14] px-3 py-2 text-[10px] text-slate-500">
          Add at least {MIN_CAPTION_CHARS_ENGAGEMENT} characters of caption to see the engagement score.
        </p>
      )}

      {!loading && tab === 'engagement' && engagementData && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-[#0c0f14] p-3">
          <div className="flex items-center gap-3">
            <ScoreRing score={engagementData.overallScore} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200">Engagement Score</p>
              <p className="text-[10px] text-slate-500">
                Est. likes: {formatNumber(engagementData.estimatedLikes.low)}–{formatNumber(engagementData.estimatedLikes.high)}
                &nbsp;·&nbsp;comments: {formatNumber(engagementData.estimatedComments.low)}–{formatNumber(engagementData.estimatedComments.high)}
                &nbsp;·&nbsp;saves: {formatNumber(engagementData.estimatedSaves.low)}–{formatNumber(engagementData.estimatedSaves.high)}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <BreakdownBar label="Caption" value={engagementData.breakdown.captionQuality} />
            <BreakdownBar label="Hashtags" value={engagementData.breakdown.hashtagStrategy} />
            <BreakdownBar label="Visual" value={engagementData.breakdown.visualAppeal} />
            <BreakdownBar label="Timing" value={engagementData.breakdown.timingFit} />
            <BreakdownBar label="CTA" value={engagementData.breakdown.ctaStrength} />
          </div>
          {engagementData.tips.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-slate-400">Tips to improve</p>
              {engagementData.tips.map((tip, i) => (
                <p key={i} className="text-[10px] leading-snug text-slate-500">
                  • {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hashtag analysis */}
      {!loading && tab === 'hashtags' && hashtagData && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-[#0c0f14] p-3">
          <div className="flex items-center gap-3">
            <ScoreRing score={hashtagData.overallScore} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200">Hashtag Strategy</p>
              <p className="text-[10px] text-slate-500">
                Est. reach: {formatNumber(hashtagData.estimatedReach.low)}–{formatNumber(hashtagData.estimatedReach.high)}
              </p>
            </div>
          </div>

          {/* Tier breakdown chips */}
          <div className="flex gap-2">
            {(['high', 'mid', 'niche'] as const).map((tier) => (
              <span
                key={tier}
                className={cn('rounded-md border px-2 py-0.5 text-[9px] font-semibold', tierColors[tier])}
              >
                {tier.charAt(0).toUpperCase() + tier.slice(1)}: {hashtagData.tierBreakdown[tier]}
              </span>
            ))}
          </div>

          {/* Hashtag list */}
          <div className="flex flex-wrap gap-1">
            {hashtagData.hashtags.map((h) => (
              <span
                key={h.tag}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px]',
                  h.isBanned
                    ? 'border-red-500/30 bg-red-500/10 text-red-400 line-through'
                    : tierColors[h.tier],
                )}
              >
                {h.tag}
                <span className="text-[8px] opacity-60">{formatNumber(h.estimatedPosts)}</span>
              </span>
            ))}
          </div>

          {hashtagData.warnings.length > 0 && (
            <div className="space-y-1">
              {hashtagData.warnings.map((w, i) => (
                <p key={i} className="text-[10px] leading-snug text-red-400/80">⚠ {w}</p>
              ))}
            </div>
          )}
          {hashtagData.suggestions.length > 0 && (
            <div className="space-y-1">
              {hashtagData.suggestions.map((s, i) => (
                <p key={i} className="text-[10px] leading-snug text-slate-500">💡 {s}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Best time to post */}
      {!loading && tab === 'timing' && bestTimeData && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-[#0c0f14] p-3">
          <p className="text-[10px] text-slate-400">{bestTimeData.audienceInsight}</p>
          <div className="space-y-1.5">
            {bestTimeData.topSlots.map((slot, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-app-surface-tertiary px-2.5 py-2"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10">
                  <span className="text-[10px] font-bold text-cyan-400">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-200">
                    {slot.day} · {slot.timeSlot}
                  </p>
                  <p className="text-[9px] text-slate-500">{slot.reason}</p>
                </div>
                <div className="shrink-0">
                  <div className="h-1.5 w-12 rounded-full bg-app-surface-tertiary">
                    <div
                      className="h-full rounded-full bg-cyan-500/60"
                      style={{ width: `${slot.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caption variants */}
      {!loading && tab === 'captions' && captionVariants.length > 0 && (
        <div className="space-y-2">
          {captionVariants.map((v) => (
            <div
              key={v.id}
              className="space-y-1.5 rounded-lg border border-white/[0.06] bg-[#0c0f14] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300">
                  {v.label}
                </span>
                {onCaptionSelected && (
                  <button
                    type="button"
                    onClick={() => onCaptionSelected(v.fullCaption)}
                    className="text-[9px] font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    Use this →
                  </button>
                )}
              </div>
              <p className="text-[10px] italic text-slate-500">{v.strategy}</p>
              <div className="rounded-md bg-black/30 p-2">
                <p className="text-[11px] font-medium text-slate-200">{v.hook}</p>
                <p className="mt-1 text-[10px] text-slate-400 line-clamp-3">{v.body}</p>
                <p className="mt-1 text-[10px] font-medium text-cyan-400/80">{v.cta}</p>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setCaptionVariants([]);
              void fetchTab('captions');
            }}
            className="w-full rounded-lg border border-white/[0.08] py-1.5 text-[10px] text-slate-500 hover:bg-app-hover hover:text-slate-300"
          >
            Regenerate variants
          </button>
        </div>
      )}

      {!loading && tab === 'captions' && captionVariants.length === 0 && caption.length < 10 && (
        <p className="py-4 text-center text-[10px] text-slate-600">
          Caption too short to generate variants.
        </p>
      )}
    </div>
  );
}

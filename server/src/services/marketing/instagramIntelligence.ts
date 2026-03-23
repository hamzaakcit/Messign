/**
 * Instagram Intelligence Service
 *
 * Provides AI-powered analytics for Instagram content:
 *   - Hashtag analysis & scoring (tier breakdown, reach estimation)
 *   - Best time to post recommendations
 *   - Caption variant generation (A/B hooks & CTAs)
 *   - Engagement prediction scoring
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HashtagTier {
  label: 'high' | 'mid' | 'niche';
  description: string;
  minPosts: number;
  maxPosts: number | null;
}

export const HASHTAG_TIERS: Record<HashtagTier['label'], HashtagTier> = {
  high: { label: 'high', description: 'High-volume (500K+ posts)', minPosts: 500_000, maxPosts: null },
  mid: { label: 'mid', description: 'Mid-range (50K–500K posts)', minPosts: 50_000, maxPosts: 500_000 },
  niche: { label: 'niche', description: 'Niche/branded (<50K posts)', minPosts: 0, maxPosts: 50_000 },
};

export interface ScoredHashtag {
  tag: string;
  tier: HashtagTier['label'];
  estimatedPosts: number;
  relevanceScore: number;
  isBanned: boolean;
}

export interface HashtagAnalysis {
  hashtags: ScoredHashtag[];
  tierBreakdown: { high: number; mid: number; niche: number };
  overallScore: number;
  suggestions: string[];
  warnings: string[];
  estimatedReach: { low: number; high: number };
}

export interface PostTimingRecommendation {
  day: string;
  timeSlot: string;
  hour: number;
  score: number;
  reason: string;
}

export interface BestTimeAnalysis {
  topSlots: PostTimingRecommendation[];
  timezone: string;
  audienceInsight: string;
}

export interface CaptionVariant {
  id: string;
  label: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  fullCaption: string;
  strategy: string;
}

export interface EngagementPrediction {
  overallScore: number;
  breakdown: {
    captionQuality: number;
    hashtagStrategy: number;
    visualAppeal: number;
    timingFit: number;
    ctaStrength: number;
  };
  estimatedLikes: { low: number; high: number };
  estimatedComments: { low: number; high: number };
  estimatedSaves: { low: number; high: number };
  tips: string[];
}

// ---------------------------------------------------------------------------
// Known banned / shadow-banned hashtags (partial list)
// ---------------------------------------------------------------------------

const BANNED_HASHTAGS = new Set([
  'adulting', 'alone', 'always', 'armday', 'beautyblogger', 'besties',
  'bikinibody', 'boho', 'brain', 'costumes', 'curvy', 'date', 'dating',
  'desk', 'direct', 'dm', 'drunk', 'eggplant', 'elevator', 'fishnets',
  'followforfollow', 'f4f', 'humpday', 'hustler', 'ice', 'ig', 'instasport',
  'italiano', 'kansas', 'killingit', 'lean', 'like4like', 'l4l', 'master',
  'mileycyrus', 'models', 'nasty', 'newyears', 'overnight', 'parties',
  'petite', 'pushups', 'rate', 'saltwater', 'selfharm', 'single',
  'singlelife', 'skateboarding', 'snap', 'snapchat', 'snowstorm',
  'sopretty', 'stranger', 'streetphoto', 'sunbathing', 'swole', 'tag4like',
  'teens', 'thought', 'thinspiration', 'todayimwearing', 'underage',
  'valentinesday', 'workflow',
]);

// ---------------------------------------------------------------------------
// Hashtag volume estimation (heuristic when no API is available)
// ---------------------------------------------------------------------------

const HASHTAG_VOLUME_HINTS: Record<string, number> = {
  marketing: 28_000_000, saas: 1_200_000, startup: 14_000_000,
  entrepreneur: 32_000_000, business: 45_000_000, tech: 15_000_000,
  ai: 8_000_000, automation: 3_500_000, digitalmarketing: 18_000_000,
  contentmarketing: 5_000_000, socialmedia: 20_000_000, growth: 6_000_000,
  founders: 800_000, branding: 7_500_000, design: 22_000_000,
  productivity: 4_200_000, leadership: 3_800_000, innovation: 5_500_000,
  software: 2_800_000, analytics: 1_500_000, data: 4_000_000,
  remote: 2_200_000, work: 9_000_000, team: 3_000_000,
  strategy: 2_500_000, success: 12_000_000, motivation: 25_000_000,
  smallbusiness: 16_000_000, ecommerce: 6_500_000, community: 8_000_000,
};

function estimateHashtagVolume(tag: string): number {
  const clean = tag.replace(/^#/, '').toLowerCase();
  if (HASHTAG_VOLUME_HINTS[clean]) return HASHTAG_VOLUME_HINTS[clean];

  const len = clean.length;
  if (len <= 4) return 5_000_000 + Math.random() * 10_000_000;
  if (len <= 8) return 200_000 + Math.random() * 2_000_000;
  if (len <= 14) return 20_000 + Math.random() * 300_000;
  return 5_000 + Math.random() * 50_000;
}

function classifyTier(posts: number): HashtagTier['label'] {
  if (posts >= 500_000) return 'high';
  if (posts >= 50_000) return 'mid';
  return 'niche';
}

// ---------------------------------------------------------------------------
// 3.1: Hashtag Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a set of hashtags: score each one, classify tiers, check for banned tags,
 * and provide suggestions for improving the hashtag mix.
 */
export function analyzeHashtags(hashtags: string[]): HashtagAnalysis {
  const clean = hashtags
    .map((h) => h.trim().replace(/^#?/, '#').toLowerCase())
    .filter((h) => h.length > 1);

  const unique = [...new Set(clean)];

  const scored: ScoredHashtag[] = unique.map((tag) => {
    const bare = tag.replace(/^#/, '');
    const estimatedPosts = estimateHashtagVolume(bare);
    const tier = classifyTier(estimatedPosts);
    const isBanned = BANNED_HASHTAGS.has(bare);
    const relevanceScore = isBanned ? 0 : Math.min(1, 0.3 + Math.random() * 0.7);
    return { tag, tier, estimatedPosts: Math.round(estimatedPosts), relevanceScore, isBanned };
  });

  const tierBreakdown = {
    high: scored.filter((h) => h.tier === 'high' && !h.isBanned).length,
    mid: scored.filter((h) => h.tier === 'mid' && !h.isBanned).length,
    niche: scored.filter((h) => h.tier === 'niche' && !h.isBanned).length,
  };

  const warnings: string[] = [];
  const suggestions: string[] = [];

  const banned = scored.filter((h) => h.isBanned);
  if (banned.length > 0) {
    warnings.push(`${banned.length} banned/shadow-banned hashtag(s): ${banned.map((h) => h.tag).join(', ')}. Remove to avoid reach suppression.`);
  }

  if (unique.length < 10) {
    suggestions.push(`Only ${unique.length} hashtags — aim for 10–15 for optimal reach.`);
  } else if (unique.length > 30) {
    warnings.push(`${unique.length} hashtags exceeds Instagram's 30-hashtag limit. Remove ${unique.length - 30}.`);
  }

  if (tierBreakdown.high === 0) {
    suggestions.push('Add 3–5 high-volume hashtags (500K+ posts) for broader discovery.');
  }
  if (tierBreakdown.mid < 3) {
    suggestions.push('Add more mid-range hashtags (50K–500K posts) — these give the best reach-to-competition ratio.');
  }
  if (tierBreakdown.niche === 0) {
    suggestions.push('Add 2–3 niche or branded hashtags to build community and own a conversation.');
  }
  if (tierBreakdown.high > 8) {
    suggestions.push('Too many high-volume hashtags — your post will be buried quickly. Swap some for mid-range.');
  }

  const validTags = scored.filter((h) => !h.isBanned);
  const avgRelevance = validTags.length > 0
    ? validTags.reduce((sum, h) => sum + h.relevanceScore, 0) / validTags.length
    : 0;

  const tierBalanceScore = Math.min(1,
    (tierBreakdown.high > 0 ? 0.25 : 0) +
    (tierBreakdown.mid >= 3 ? 0.35 : tierBreakdown.mid * 0.12) +
    (tierBreakdown.niche >= 2 ? 0.25 : tierBreakdown.niche * 0.12) +
    (unique.length >= 10 && unique.length <= 15 ? 0.15 : unique.length >= 5 ? 0.08 : 0),
  );

  const overallScore = Math.round(
    ((avgRelevance * 0.4 + tierBalanceScore * 0.4 + (banned.length === 0 ? 0.2 : 0)) * 100),
  );

  const totalEstimatedPosts = validTags.reduce((sum, h) => sum + h.estimatedPosts, 0);
  const estimatedReach = {
    low: Math.round(totalEstimatedPosts * 0.0001),
    high: Math.round(totalEstimatedPosts * 0.002),
  };

  return {
    hashtags: scored.sort((a, b) => b.estimatedPosts - a.estimatedPosts),
    tierBreakdown,
    overallScore: Math.min(100, Math.max(0, overallScore)),
    suggestions,
    warnings,
    estimatedReach,
  };
}

// ---------------------------------------------------------------------------
// 3.2: Best Time to Post
// ---------------------------------------------------------------------------

const OPTIMAL_SLOTS: PostTimingRecommendation[] = [
  { day: 'Monday', timeSlot: '11:00 AM', hour: 11, score: 78, reason: 'Start-of-week engagement peak' },
  { day: 'Monday', timeSlot: '7:00 PM', hour: 19, score: 72, reason: 'Evening wind-down browsing' },
  { day: 'Tuesday', timeSlot: '9:00 AM', hour: 9, score: 82, reason: 'Morning commute scroll — highest mid-week engagement' },
  { day: 'Tuesday', timeSlot: '1:00 PM', hour: 13, score: 76, reason: 'Lunch break peak' },
  { day: 'Wednesday', timeSlot: '11:00 AM', hour: 11, score: 85, reason: 'Mid-week, mid-morning — consistently strong engagement' },
  { day: 'Wednesday', timeSlot: '5:00 PM', hour: 17, score: 74, reason: 'Pre-dinner check-in' },
  { day: 'Thursday', timeSlot: '12:00 PM', hour: 12, score: 80, reason: 'Lunch break — high save rate for weekend planning' },
  { day: 'Thursday', timeSlot: '7:00 PM', hour: 19, score: 77, reason: 'Evening leisure browsing' },
  { day: 'Friday', timeSlot: '10:00 AM', hour: 10, score: 73, reason: 'TGIF mood — positive content performs well' },
  { day: 'Saturday', timeSlot: '9:00 AM', hour: 9, score: 70, reason: 'Weekend morning scroll — lifestyle content peak' },
  { day: 'Saturday', timeSlot: '11:00 AM', hour: 11, score: 75, reason: 'Late-morning discovery session' },
  { day: 'Sunday', timeSlot: '10:00 AM', hour: 10, score: 71, reason: 'Sunday reset — planning and aspirational content' },
  { day: 'Sunday', timeSlot: '7:00 PM', hour: 19, score: 79, reason: 'Sunday evening — week-ahead planning, high saves' },
];

/**
 * Recommend the best times to post on Instagram. Returns top N slots
 * ranked by expected engagement. Uses general best-practice data;
 * can be enhanced with account-specific Instagram Insights API data.
 */
export function getBestTimesToPost(opts?: {
  topN?: number;
  timezone?: string;
  contentType?: 'educational' | 'promotional' | 'lifestyle' | 'general';
}): BestTimeAnalysis {
  const topN = opts?.topN ?? 5;
  const timezone = opts?.timezone ?? 'America/New_York';
  const contentType = opts?.contentType ?? 'general';

  let slots = [...OPTIMAL_SLOTS];

  if (contentType === 'educational') {
    slots = slots.map((s) =>
      s.hour >= 9 && s.hour <= 13 ? { ...s, score: s.score + 5 } : s,
    );
  } else if (contentType === 'lifestyle') {
    slots = slots.map((s) =>
      ['Saturday', 'Sunday'].includes(s.day) ? { ...s, score: s.score + 7 } : s,
    );
  } else if (contentType === 'promotional') {
    slots = slots.map((s) =>
      s.hour >= 11 && s.hour <= 14 ? { ...s, score: s.score + 4 } : s,
    );
  }

  slots.sort((a, b) => b.score - a.score);

  return {
    topSlots: slots.slice(0, topN),
    timezone,
    audienceInsight: contentType === 'educational'
      ? 'Educational content performs best during morning hours (9 AM–1 PM) when audiences are in learning mode.'
      : contentType === 'lifestyle'
        ? 'Lifestyle content sees highest engagement on weekends when audiences are relaxed and planning.'
        : contentType === 'promotional'
          ? 'Promotional content converts best during lunch breaks (11 AM–2 PM) when purchase intent is high.'
          : 'General Instagram engagement peaks mid-week (Tue–Thu) during late morning and early evening.',
  };
}

// ---------------------------------------------------------------------------
// 3.3: Caption Variant Generation
// ---------------------------------------------------------------------------

/**
 * Generate caption variants from a base caption. Produces alternative
 * hooks, CTAs, and tonal adjustments. This is a deterministic template-based
 * approach; for richer results, pass the variants through an LLM.
 */
export function generateCaptionVariants(
  baseCaption: string,
  opts?: { count?: number },
): CaptionVariant[] {
  const count = Math.min(opts?.count ?? 3, 5);
  const { main: body, hashtags } = splitCaptionParts(baseCaption);
  const sentences = body.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);
  const hookSentence = sentences[0] ?? body.slice(0, 100);
  const bodySentences = sentences.slice(1).join('. ');

  const strategies: Array<{ label: string; strategy: string; hookTransform: (h: string) => string; ctaOptions: string[] }> = [
    {
      label: 'Original',
      strategy: 'Keep the original copy with minor polish',
      hookTransform: (h) => h,
      ctaOptions: ['Save this for later', 'What do you think? Drop a comment below'],
    },
    {
      label: 'Question Hook',
      strategy: 'Lead with a curiosity-driven question to stop the scroll',
      hookTransform: (h) => `What if ${h.charAt(0).toLowerCase()}${h.slice(1)}?`,
      ctaOptions: ['Tell me in the comments', 'Drop a "yes" if you agree'],
    },
    {
      label: 'Stat/Number Hook',
      strategy: 'Lead with a surprising number or statistic',
      hookTransform: (h) => `Most founders get this wrong: ${h.toLowerCase()}`,
      ctaOptions: ['Save this and share with your co-founder', 'Link in bio for the full breakdown'],
    },
    {
      label: 'Contrarian Take',
      strategy: 'Challenge conventional wisdom to provoke engagement',
      hookTransform: (h) => `Unpopular opinion: ${h.toLowerCase()}`,
      ctaOptions: ['Agree or disagree? Fight me in the comments', 'Share this with someone who needs to hear it'],
    },
    {
      label: 'Story Hook',
      strategy: 'Open with a micro-story that builds emotional connection',
      hookTransform: (h) => `We almost gave up. Then we realized: ${h.toLowerCase()}`,
      ctaOptions: ['Follow for more behind-the-scenes', 'Has this happened to you? Tell your story below'],
    },
  ];

  const variants: CaptionVariant[] = [];
  for (let i = 0; i < count && i < strategies.length; i++) {
    const s = strategies[i];
    const hook = s.hookTransform(hookSentence);
    const cta = s.ctaOptions[Math.floor(Math.random() * s.ctaOptions.length)];
    const fullCaption = [
      hook,
      '',
      bodySentences || hookSentence,
      '',
      cta,
      '',
      hashtags.join(' '),
    ].join('\n').trim();

    variants.push({
      id: `variant_${i}`,
      label: s.label,
      hook,
      body: bodySentences || hookSentence,
      cta,
      hashtags,
      fullCaption,
      strategy: s.strategy,
    });
  }

  return variants;
}

function splitCaptionParts(caption: string): { main: string; hashtags: string[] } {
  const lines = caption.split('\n');
  const tagLineIdx = lines.findIndex(
    (line) => line.trim().startsWith('#') && (line.match(/#/g) ?? []).length >= 3,
  );
  if (tagLineIdx === -1) {
    const inline = caption.match(/#[\w\u00C0-\u024F]+/g) ?? [];
    return { main: caption.replace(/#[\w\u00C0-\u024F]+/g, '').trim(), hashtags: inline };
  }
  const main = lines.slice(0, tagLineIdx).join('\n').trim();
  const hashtags = lines.slice(tagLineIdx).join(' ').match(/#[\w\u00C0-\u024F]+/g) ?? [];
  return { main, hashtags };
}

// ---------------------------------------------------------------------------
// 3.4: Engagement Prediction
// ---------------------------------------------------------------------------

/**
 * Predict engagement for an Instagram post based on caption quality,
 * hashtag strategy, visual presence, timing, and CTA strength.
 * Returns a 0–100 score with per-dimension breakdown and actionable tips.
 */
export function predictEngagement(opts: {
  caption: string;
  hashtags: string[];
  hasImage: boolean;
  hasCarousel?: boolean;
  postHour?: number;
  postDay?: string;
}): EngagementPrediction {
  const { caption, hashtags, hasImage, hasCarousel, postHour, postDay } = opts;
  const tips: string[] = [];

  // Caption quality (0–100)
  let captionScore = 50;
  const captionLen = caption.length;
  if (captionLen >= 100 && captionLen <= 800) captionScore += 15;
  else if (captionLen > 800 && captionLen <= 2200) captionScore += 8;
  else if (captionLen < 50) {
    captionScore -= 10;
    tips.push('Caption is very short — longer captions (100–800 chars) drive more engagement.');
  }

  const hasQuestion = /\?/.test(caption);
  if (hasQuestion) captionScore += 10;
  else tips.push('Add a question to encourage comments.');

  const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(caption);
  if (hasEmoji) captionScore += 5;

  const lineBreaks = (caption.match(/\n/g) ?? []).length;
  if (lineBreaks >= 2) captionScore += 5;
  else tips.push('Use line breaks to improve readability — wall of text hurts engagement.');

  const hookLen = caption.split('\n')[0]?.length ?? 0;
  if (hookLen > 0 && hookLen <= 125) captionScore += 8;
  else if (hookLen > 125) tips.push('First line is over 125 chars — it will be cut off on mobile.');

  captionScore = Math.min(100, Math.max(0, captionScore));

  // Hashtag strategy (0–100)
  const hashAnalysis = analyzeHashtags(hashtags);
  const hashtagScore = hashAnalysis.overallScore;

  // Visual appeal (0–100)
  let visualScore = 30;
  if (hasImage) visualScore = 70;
  if (hasCarousel) visualScore = 90;
  if (!hasImage) tips.push('Posts with images get 2.3x more engagement than text-only posts.');
  if (hasImage && !hasCarousel) tips.push('Carousels get 1.4x more engagement than single images — consider multiple slides.');

  // Timing fit (0–100)
  let timingScore = 60;
  if (postHour !== undefined) {
    const goodHours = [9, 10, 11, 12, 13, 17, 18, 19];
    if (goodHours.includes(postHour)) timingScore = 85;
    else if (postHour >= 7 && postHour <= 21) timingScore = 65;
    else {
      timingScore = 35;
      tips.push('Posting between 9 AM–1 PM or 5–7 PM typically gets better engagement.');
    }
  }
  if (postDay) {
    const bestDays = ['tuesday', 'wednesday', 'thursday'];
    if (bestDays.includes(postDay.toLowerCase())) timingScore += 10;
  }
  timingScore = Math.min(100, timingScore);

  // CTA strength (0–100)
  let ctaScore = 40;
  const ctaPatterns = [
    /save\s+this/i, /link\s+in\s+bio/i, /comment\s+below/i,
    /drop\s+a/i, /tell\s+me/i, /what\s+do\s+you\s+think/i,
    /share\s+this/i, /tag\s+someone/i, /follow\s+for/i,
    /let\s+me\s+know/i, /agree\s+or\s+disagree/i, /double\s+tap/i,
  ];
  const ctaMatches = ctaPatterns.filter((p) => p.test(caption)).length;
  if (ctaMatches >= 2) ctaScore = 90;
  else if (ctaMatches === 1) ctaScore = 70;
  else tips.push('Add a clear CTA: "Save this", "Comment below", or "Link in bio".');

  ctaScore = Math.min(100, ctaScore);

  const overallScore = Math.round(
    captionScore * 0.25 +
    hashtagScore * 0.20 +
    visualScore * 0.25 +
    timingScore * 0.15 +
    ctaScore * 0.15,
  );

  const followerBase = 5000;
  const engagementRate = overallScore / 100 * 0.06;

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    breakdown: {
      captionQuality: captionScore,
      hashtagStrategy: hashtagScore,
      visualAppeal: visualScore,
      timingFit: timingScore,
      ctaStrength: ctaScore,
    },
    estimatedLikes: {
      low: Math.round(followerBase * engagementRate * 0.6),
      high: Math.round(followerBase * engagementRate * 1.8),
    },
    estimatedComments: {
      low: Math.round(followerBase * engagementRate * 0.03),
      high: Math.round(followerBase * engagementRate * 0.12),
    },
    estimatedSaves: {
      low: Math.round(followerBase * engagementRate * 0.04),
      high: Math.round(followerBase * engagementRate * 0.15),
    },
    tips,
  };
}

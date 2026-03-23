import {
  analyzeHashtags,
  getBestTimesToPost,
  generateCaptionVariants,
  predictEngagement,
} from '../../../services/marketing/instagramIntelligence.js';

describe('analyzeHashtags', () => {
  it('scores a set of hashtags and returns complete analysis', () => {
    const result = analyzeHashtags([
      '#marketing', '#saas', '#startup', '#tech', '#ai',
      '#contentmarketing', '#digitalmarketing', '#branding',
      '#analytics', '#software', '#founders',
    ]);
    expect(result.hashtags.length).toBe(11);
    const totalTiers = result.tierBreakdown.high + result.tierBreakdown.mid + result.tierBreakdown.niche;
    expect(totalTiers).toBe(11);
    expect(result.tierBreakdown.high).toBeGreaterThan(0);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.estimatedReach.low).toBeGreaterThan(0);
    expect(result.estimatedReach.high).toBeGreaterThan(result.estimatedReach.low);
  });

  it('flags banned hashtags', () => {
    const result = analyzeHashtags(['#followforfollow', '#f4f', '#like4like', '#marketing']);
    const banned = result.hashtags.filter((h) => h.isBanned);
    expect(banned.length).toBe(3);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('banned');
  });

  it('suggests more hashtags when count is low', () => {
    const result = analyzeHashtags(['#marketing', '#ai']);
    expect(result.suggestions.some((s) => s.includes('aim for 10'))).toBe(true);
  });

  it('warns when exceeding 30 hashtags', () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#tag${i}`);
    const result = analyzeHashtags(tags);
    expect(result.warnings.some((w) => w.includes('30-hashtag limit'))).toBe(true);
  });

  it('deduplicates and normalizes', () => {
    const result = analyzeHashtags(['#Marketing', '#MARKETING', 'marketing', '#marketing']);
    expect(result.hashtags.length).toBe(1);
    expect(result.hashtags[0].tag).toBe('#marketing');
  });
});

describe('getBestTimesToPost', () => {
  it('returns top N slots', () => {
    const result = getBestTimesToPost({ topN: 3 });
    expect(result.topSlots.length).toBe(3);
    expect(result.topSlots[0].score).toBeGreaterThanOrEqual(result.topSlots[1].score);
    expect(result.timezone).toBeDefined();
  });

  it('boosts educational content for morning hours', () => {
    const general = getBestTimesToPost({ topN: 5, contentType: 'general' });
    const edu = getBestTimesToPost({ topN: 5, contentType: 'educational' });
    const morningScoreEdu = edu.topSlots.filter((s) => s.hour >= 9 && s.hour <= 13)
      .reduce((sum, s) => sum + s.score, 0);
    const morningScoreGen = general.topSlots.filter((s) => s.hour >= 9 && s.hour <= 13)
      .reduce((sum, s) => sum + s.score, 0);
    expect(morningScoreEdu).toBeGreaterThanOrEqual(morningScoreGen);
  });

  it('provides audience insight', () => {
    const result = getBestTimesToPost({ contentType: 'lifestyle' });
    expect(result.audienceInsight).toContain('weekend');
  });
});

describe('generateCaptionVariants', () => {
  const sampleCaption = `Your marketing stack is broken and you don't even know it.

Most founders spend 80% of their time on channels that drive 20% of revenue. Here's the thing — the data has been screaming at you, but nobody's listening.

We built Messign to fix exactly this. Stop guessing, start knowing.

Save this for later and share with your co-founder.

#marketing #saas #startup #founder #ai #digitalmarketing #growth #contentmarketing #branding #tech`;

  it('generates requested number of variants', () => {
    const variants = generateCaptionVariants(sampleCaption, { count: 3 });
    expect(variants.length).toBe(3);
    variants.forEach((v) => {
      expect(v.hook.length).toBeGreaterThan(0);
      expect(v.cta.length).toBeGreaterThan(0);
      expect(v.fullCaption.length).toBeGreaterThan(0);
      expect(v.strategy.length).toBeGreaterThan(0);
    });
  });

  it('preserves hashtags across variants', () => {
    const variants = generateCaptionVariants(sampleCaption);
    variants.forEach((v) => {
      expect(v.hashtags.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('limits to max 5 variants', () => {
    const variants = generateCaptionVariants(sampleCaption, { count: 10 });
    expect(variants.length).toBeLessThanOrEqual(5);
  });
});

describe('predictEngagement', () => {
  it('returns a score between 0 and 100', () => {
    const result = predictEngagement({
      caption: 'Test caption with some content here. What do you think?',
      hashtags: ['#marketing', '#saas'],
      hasImage: true,
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('scores higher with image than without', () => {
    const withImage = predictEngagement({
      caption: 'Good caption here. Save this for later!',
      hashtags: ['#marketing'],
      hasImage: true,
    });
    const withoutImage = predictEngagement({
      caption: 'Good caption here. Save this for later!',
      hashtags: ['#marketing'],
      hasImage: false,
    });
    expect(withImage.breakdown.visualAppeal).toBeGreaterThan(withoutImage.breakdown.visualAppeal);
  });

  it('scores carousel higher than single image', () => {
    const single = predictEngagement({
      caption: 'Caption. Save this for later!',
      hashtags: ['#marketing'],
      hasImage: true,
      hasCarousel: false,
    });
    const carousel = predictEngagement({
      caption: 'Caption. Save this for later!',
      hashtags: ['#marketing'],
      hasImage: true,
      hasCarousel: true,
    });
    expect(carousel.breakdown.visualAppeal).toBeGreaterThan(single.breakdown.visualAppeal);
  });

  it('provides actionable tips for weak areas', () => {
    const result = predictEngagement({
      caption: 'short',
      hashtags: [],
      hasImage: false,
    });
    expect(result.tips.length).toBeGreaterThan(0);
    expect(result.tips.some((t) => t.toLowerCase().includes('caption'))).toBe(true);
  });

  it('gives full breakdown dimensions', () => {
    const result = predictEngagement({
      caption: 'Test caption.',
      hashtags: ['#test'],
      hasImage: true,
    });
    expect(result.breakdown).toHaveProperty('captionQuality');
    expect(result.breakdown).toHaveProperty('hashtagStrategy');
    expect(result.breakdown).toHaveProperty('visualAppeal');
    expect(result.breakdown).toHaveProperty('timingFit');
    expect(result.breakdown).toHaveProperty('ctaStrength');
    expect(result.estimatedLikes).toHaveProperty('low');
    expect(result.estimatedLikes).toHaveProperty('high');
  });
});

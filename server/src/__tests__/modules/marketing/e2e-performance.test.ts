import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractPatterns,
  generateCalibrationPrompt,
} from '../../../services/marketing/performanceCollector.js';
import type {
  PerformanceRecord,
  PerformanceContext,
} from '../../../services/marketing/performanceCollector.js';
import {
  getCachedCalibration,
  setCachedCalibration,
  invalidateCalibrationCache,
  clearCalibrationCache,
} from '../../../services/marketing/calibrationCache.js';
import {
  parseWebhookEvent,
} from '../../../services/marketing/webhookParser.js';

function makeRecord(
  overrides: Partial<PerformanceRecord> = {},
): PerformanceRecord {
  return {
    id: 'rec-' + Math.random().toString(36).slice(2, 8),
    content_id: 'content-1',
    channel: 'email',
    subject_line: 'Great subject line',
    open_rate: 0.35,
    click_through_rate: 0.06,
    conversion_rate: 0.02,
    send_count: 1000,
    tone_tags: ['confident'],
    theme_used: 'executive',
    section_count: 5,
    cta_variant: 'pill',
    subject_length: 42,
    hero_image_used: true,
    recorded_at: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════
// E2E: Full Feedback Loop Pipeline
// ══════════════════════════════════════════════════════════

describe('E2E: Performance Data → Pattern Extraction → Calibration Prompt', () => {
  it('realistic 20-campaign dataset produces actionable calibration', () => {
    const topRecords: PerformanceRecord[] = [
      makeRecord({ subject_line: 'Ship 10x faster with AI', open_rate: 0.42, subject_length: 28, theme_used: 'startup', tone_tags: ['confident', 'technical'], cta_variant: 'pill', hero_image_used: true, section_count: 5 }),
      makeRecord({ subject_line: 'Your deploys deserve better', open_rate: 0.38, subject_length: 30, theme_used: 'executive', tone_tags: ['confident', 'professional'], cta_variant: 'pill', hero_image_used: true, section_count: 6 }),
      makeRecord({ subject_line: 'Join 2400+ teams shipping faster', open_rate: 0.36, subject_length: 35, theme_used: 'startup', tone_tags: ['social-proof', 'confident'], cta_variant: 'pill', hero_image_used: true, section_count: 4 }),
      makeRecord({ subject_line: 'The workflow tool you needed', open_rate: 0.34, subject_length: 31, theme_used: 'minimal', tone_tags: ['friendly', 'helpful'], cta_variant: 'ghost', hero_image_used: false, section_count: 5 }),
      makeRecord({ subject_line: 'Automate everything (no, really)', open_rate: 0.33, subject_length: 35, theme_used: 'bold', tone_tags: ['bold', 'casual'], cta_variant: 'fullWidth', hero_image_used: true, section_count: 7 }),
    ];

    const bottomRecords: PerformanceRecord[] = [
      makeRecord({ subject_line: "AMAZING NEW PRODUCT LAUNCH - DON'T MISS OUT ON THIS INCREDIBLE OPPORTUNITY!!!", open_rate: 0.08, subject_length: 78, theme_used: 'bold', tone_tags: ['aggressive', 'salesy'], hero_image_used: false }),
      makeRecord({ subject_line: 'Newsletter #47', open_rate: 0.10, subject_length: 14, theme_used: 'minimal', tone_tags: ['generic'], hero_image_used: false }),
      makeRecord({ subject_line: 'Quick update from our team about some things we have been working on', open_rate: 0.11, subject_length: 70, theme_used: 'minimal', tone_tags: ['vague'], hero_image_used: false }),
    ];

    const patterns = extractPatterns(topRecords, bottomRecords);

    expect(patterns.bestSubjectLength).toBeGreaterThan(25);
    expect(patterns.bestSubjectLength).toBeLessThan(40);
    expect(patterns.bestThemes).toContain('startup');
    expect(patterns.bestTones).toContain('confident');
    expect(patterns.bestCtaVariants[0]).toBe('pill');
    expect(patterns.heroImageCorrelation).toBe(80);
    expect(patterns.worstSubjectPatterns.length).toBeGreaterThan(0);
    expect(patterns.avgSectionCount).toBe(5);

    const context: PerformanceContext = {
      topPerformers: topRecords,
      bottomPerformers: bottomRecords,
      averages: { openRate: 0.25, clickThroughRate: 0.045, conversionRate: 0.018 },
      patterns,
      totalRecords: 20,
      hasEnoughData: true,
    };

    const calibration = generateCalibrationPrompt(context);

    expect(calibration.text).toContain('Performance Calibration');
    expect(calibration.text).toContain('20 campaigns');
    expect(calibration.text).toContain('startup');
    expect(calibration.text).toContain('confident');
    expect(calibration.text).toContain('pill');
    expect(calibration.text).toContain('hero images');
    expect(calibration.text).toContain('Ship 10x faster');
    expect(calibration.text).toContain('Avoid');
    expect(calibration.basedOnRecords).toBe(20);

    expect(calibration.text.length).toBeGreaterThan(200);
    expect(calibration.text.length).toBeLessThan(3000);
    expect(calibration.text).not.toContain('\0');
  });

  it('new workspace (no data) produces safe fallback', () => {
    const emptyContext: PerformanceContext = {
      topPerformers: [],
      bottomPerformers: [],
      averages: { openRate: null, clickThroughRate: null, conversionRate: null },
      patterns: {
        bestSubjectLength: null,
        bestThemes: [],
        bestTones: [],
        bestCtaVariants: [],
        worstSubjectPatterns: [],
        avgSectionCount: null,
        heroImageCorrelation: null,
      },
      totalRecords: 0,
      hasEnoughData: false,
    };

    const calibration = generateCalibrationPrompt(emptyContext);
    expect(calibration.text).toContain('No historical performance data');
    expect(calibration.text).toContain('best practices');
    expect(calibration.basedOnRecords).toBe(0);
    expect(calibration.text.length).toBeGreaterThan(50);
  });

  it('borderline dataset (exactly 10 records) is treated as sufficient', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ open_rate: 0.2 + i * 0.02, subject_length: 30 + i * 2 }),
    );

    const context: PerformanceContext = {
      topPerformers: records.slice(-5),
      bottomPerformers: records.slice(0, 5),
      averages: { openRate: 0.29, clickThroughRate: null, conversionRate: null },
      patterns: extractPatterns(records.slice(-5), records.slice(0, 5)),
      totalRecords: 10,
      hasEnoughData: true,
    };

    const calibration = generateCalibrationPrompt(context);
    expect(calibration.text).toContain('10 campaigns');
    expect(calibration.basedOnRecords).toBe(10);
  });
});

describe('E2E: Cache → Invalidation → Fresh Data', () => {
  beforeEach(() => clearCalibrationCache());

  it('full cycle: cache miss → store → hit → invalidate → miss', () => {
    const org = 'org-cycle-test';
    const channel = 'email';

    expect(getCachedCalibration(org, channel)).toBeNull();

    const prompt = {
      text: 'Calibration v1',
      generatedAt: new Date().toISOString(),
      basedOnRecords: 15,
    };
    setCachedCalibration(org, channel, prompt);

    const cached = getCachedCalibration(org, channel);
    expect(cached).not.toBeNull();
    expect(cached!.text).toBe('Calibration v1');

    invalidateCalibrationCache(org, channel);

    expect(getCachedCalibration(org, channel)).toBeNull();
  });

  it("invalidation for one channel doesn't affect another", () => {
    setCachedCalibration('org-1', 'email', { text: 'e', generatedAt: '', basedOnRecords: 1 });
    setCachedCalibration('org-1', 'twitter', { text: 't', generatedAt: '', basedOnRecords: 1 });

    invalidateCalibrationCache('org-1', 'email');

    expect(getCachedCalibration('org-1', 'email')).toBeNull();
    expect(getCachedCalibration('org-1', 'twitter')).not.toBeNull();
  });

  it('org-wide invalidation clears all channels', () => {
    setCachedCalibration('org-1', 'email', { text: 'e', generatedAt: '', basedOnRecords: 1 });
    setCachedCalibration('org-1', 'twitter', { text: 't', generatedAt: '', basedOnRecords: 1 });
    setCachedCalibration('org-1', 'instagram', { text: 'i', generatedAt: '', basedOnRecords: 1 });

    const count = invalidateCalibrationCache('org-1');
    expect(count).toBe(3);
  });
});

describe('E2E: Webhook Pipeline', () => {
  it('SendGrid batch events → normalized metrics', () => {
    const events = [
      { event: 'delivered', sg_message_id: 'msg-1', custom_args: { content_id: 'c-100' } },
      { event: 'delivered', sg_message_id: 'msg-1' },
      { event: 'delivered', sg_message_id: 'msg-1' },
      { event: 'open', sg_message_id: 'msg-1' },
      { event: 'open', sg_message_id: 'msg-1' },
      { event: 'click', sg_message_id: 'msg-1' },
      { event: 'bounce', sg_message_id: 'msg-1' },
    ];

    const result = parseWebhookEvent(events);
    expect(result.provider).toBe('sendgrid');
    expect(result.contentId).toBe('c-100');
    expect(result.metrics.sendCount).toBe(4);
    expect(result.metrics.openRate).toBeCloseTo(0.5, 1);
    expect(result.metrics.bounceRate).toBeCloseTo(0.25, 1);
  });

  it('Postmark single event → provider detected', () => {
    const result = parseWebhookEvent({
      RecordType: 'Open',
      MessageID: 'pm-msg-1',
      Metadata: { content_id: 'c-200' },
    });
    expect(result.provider).toBe('postmark');
    expect(result.contentId).toBe('c-200');
  });

  it('Mailchimp campaign event → parsed', () => {
    const result = parseWebhookEvent({
      type: 'campaign',
      data: { id: 'mc-camp-1', content_id: 'c-300', opens: 0.28, emails_sent: 5000 },
    });
    expect(result.provider).toBe('mailchimp');
    expect(result.contentId).toBe('c-300');
  });

  it('unknown payload → graceful fallback', () => {
    const result = parseWebhookEvent({ foo: 'bar', baz: 123 });
    expect(result.provider).toBe('unknown');
    expect(result.contentId).toBeNull();
    expect(Object.keys(result.metrics).length).toBe(0);
  });
});

describe('E2E: Pattern Extraction Edge Cases', () => {
  it('all top performers with same theme → single best theme', () => {
    const top = Array(5)
      .fill(null)
      .map(() => makeRecord({ theme_used: 'executive' }));
    const patterns = extractPatterns(top, []);
    expect(patterns.bestThemes).toEqual(['executive']);
  });

  it('evenly split themes → returns up to 3', () => {
    const top = [
      makeRecord({ theme_used: 'executive' }),
      makeRecord({ theme_used: 'startup' }),
      makeRecord({ theme_used: 'bold' }),
      makeRecord({ theme_used: 'luxury' }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestThemes.length).toBeLessThanOrEqual(3);
  });

  it('no hero images in any top performer → 0% correlation', () => {
    const top = Array(3)
      .fill(null)
      .map(() => makeRecord({ hero_image_used: false }));
    const patterns = extractPatterns(top, []);
    expect(patterns.heroImageCorrelation).toBe(0);
  });

  it('mixed CTA variants with no clear winner', () => {
    const top = [
      makeRecord({ cta_variant: 'pill' }),
      makeRecord({ cta_variant: 'ghost' }),
      makeRecord({ cta_variant: 'fullWidth' }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestCtaVariants.length).toBe(3);
  });
});

describe('E2E: Calibration Prompt Injection Safety', () => {
  it('calibration text with SQL injection in subject line is safe', () => {
    const context: PerformanceContext = {
      topPerformers: [makeRecord({ subject_line: "'; DROP TABLE users; --" })],
      bottomPerformers: [],
      averages: { openRate: 0.3, clickThroughRate: null, conversionRate: null },
      patterns: extractPatterns([makeRecord()], []),
      totalRecords: 15,
      hasEnoughData: true,
    };
    const prompt = generateCalibrationPrompt(context);
    expect(typeof prompt.text).toBe('string');
    expect(prompt.text.length).toBeGreaterThan(0);
  });

  it('calibration text with unicode in subject lines works', () => {
    const context: PerformanceContext = {
      topPerformers: [makeRecord({ subject_line: "🚀 Launch day — let's go!" })],
      bottomPerformers: [],
      averages: { openRate: 0.35, clickThroughRate: null, conversionRate: null },
      patterns: extractPatterns([makeRecord()], []),
      totalRecords: 12,
      hasEnoughData: true,
    };
    const prompt = generateCalibrationPrompt(context);
    expect(prompt.text).toContain('🚀');
  });
});

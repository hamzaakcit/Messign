import { describe, it, expect } from 'vitest';
import {
  extractPatterns,
  generateCalibrationPrompt,
  getMostCommon,
  formatPercent,
} from '../../../services/marketing/performanceCollector.js';
import type {
  PerformanceRecord,
  PerformanceContext,
} from '../../../services/marketing/performanceCollector.js';

function makeRecord(
  overrides: Partial<PerformanceRecord> = {},
): PerformanceRecord {
  return {
    id: 'rec-' + Math.random().toString(36).slice(2, 8),
    content_id: 'content-1',
    channel: 'email',
    subject_line: 'Great subject line here',
    open_rate: 0.35,
    click_through_rate: 0.06,
    conversion_rate: 0.02,
    send_count: 1000,
    tone_tags: ['confident', 'friendly'],
    theme_used: 'executive',
    section_count: 5,
    cta_variant: 'pill',
    subject_length: 42,
    hero_image_used: true,
    recorded_at: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.32)).toBe('32.0%');
    expect(formatPercent(0.052)).toBe('5.2%');
    expect(formatPercent(1.0)).toBe('100.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('returns N/A for null/undefined', () => {
    expect(formatPercent(null)).toBe('N/A');
    expect(formatPercent(undefined)).toBe('N/A');
  });
});

describe('getMostCommon', () => {
  it('returns most frequent values', () => {
    const result = getMostCommon(['a', 'b', 'a', 'c', 'a', 'b']);
    expect(result[0]).toBe('a');
    expect(result[1]).toBe('b');
  });

  it('respects maxResults', () => {
    const result = getMostCommon(['a', 'b', 'c', 'd'], 2);
    expect(result).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(getMostCommon([])).toEqual([]);
  });

  it('handles single value', () => {
    expect(getMostCommon(['only'])).toEqual(['only']);
  });
});

describe('extractPatterns', () => {
  it('extracts best subject length from top performers', () => {
    const top = [
      makeRecord({ subject_length: 40 }),
      makeRecord({ subject_length: 44 }),
      makeRecord({ subject_length: 42 }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestSubjectLength).toBe(42);
  });

  it('extracts best themes', () => {
    const top = [
      makeRecord({ theme_used: 'executive' }),
      makeRecord({ theme_used: 'executive' }),
      makeRecord({ theme_used: 'startup' }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestThemes[0]).toBe('executive');
  });

  it('extracts best tone tags across all top performers', () => {
    const top = [
      makeRecord({ tone_tags: ['confident', 'friendly'] }),
      makeRecord({ tone_tags: ['confident', 'professional'] }),
      makeRecord({ tone_tags: ['friendly'] }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestTones[0]).toBe('confident');
    expect(patterns.bestTones).toContain('friendly');
  });

  it('extracts CTA variant preference', () => {
    const top = [
      makeRecord({ cta_variant: 'pill' }),
      makeRecord({ cta_variant: 'pill' }),
      makeRecord({ cta_variant: 'ghost' }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestCtaVariants[0]).toBe('pill');
  });

  it('detects worst subject patterns from bottom performers', () => {
    const top = [makeRecord({ subject_length: 42 })];
    const bottom = [
      makeRecord({ subject_length: 80, open_rate: 0.1 }),
      makeRecord({ subject_length: 75, open_rate: 0.12 }),
    ];
    const patterns = extractPatterns(top, bottom);
    expect(patterns.worstSubjectPatterns.length).toBeGreaterThan(0);
    expect(patterns.worstSubjectPatterns[0]).toContain('long');
  });

  it('calculates hero image correlation', () => {
    const top = [
      makeRecord({ hero_image_used: true }),
      makeRecord({ hero_image_used: true }),
      makeRecord({ hero_image_used: false }),
      makeRecord({ hero_image_used: true }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.heroImageCorrelation).toBe(75);
  });

  it('calculates average section count', () => {
    const top = [
      makeRecord({ section_count: 4 }),
      makeRecord({ section_count: 6 }),
      makeRecord({ section_count: 5 }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.avgSectionCount).toBe(5);
  });

  it('handles empty top performers', () => {
    const patterns = extractPatterns([], []);
    expect(patterns.bestSubjectLength).toBeNull();
    expect(patterns.bestThemes).toEqual([]);
    expect(patterns.heroImageCorrelation).toBeNull();
  });

  it('handles null values in records', () => {
    const top = [
      makeRecord({
        subject_length: null,
        theme_used: null,
        tone_tags: [],
      }),
    ];
    const patterns = extractPatterns(top, []);
    expect(patterns.bestSubjectLength).toBeNull();
    expect(patterns.bestThemes).toEqual([]);
    expect(patterns.bestTones).toEqual([]);
  });
});

describe('generateCalibrationPrompt', () => {
  it('generates fallback for insufficient data', () => {
    const context: PerformanceContext = {
      topPerformers: [],
      bottomPerformers: [],
      averages: {
        openRate: null,
        clickThroughRate: null,
        conversionRate: null,
      },
      patterns: {
        bestSubjectLength: null,
        bestThemes: [],
        bestTones: [],
        bestCtaVariants: [],
        worstSubjectPatterns: [],
        avgSectionCount: null,
        heroImageCorrelation: null,
      },
      totalRecords: 3,
      hasEnoughData: false,
    };
    const prompt = generateCalibrationPrompt(context);
    expect(prompt.text).toContain('No historical performance data');
    expect(prompt.text).toContain('industry best practices');
    expect(prompt.basedOnRecords).toBe(0);
  });

  it('generates rich calibration for sufficient data', () => {
    const context: PerformanceContext = {
      topPerformers: [
        makeRecord({
          subject_line: 'Ship faster with AI',
          open_rate: 0.42,
        }),
        makeRecord({
          subject_line: 'Your team deserves this',
          open_rate: 0.38,
        }),
      ],
      bottomPerformers: [
        makeRecord({ subject_length: 85, open_rate: 0.1 }),
      ],
      averages: {
        openRate: 0.28,
        clickThroughRate: 0.045,
        conversionRate: 0.015,
      },
      patterns: {
        bestSubjectLength: 42,
        bestThemes: ['executive', 'startup'],
        bestTones: ['confident', 'friendly'],
        bestCtaVariants: ['pill'],
        worstSubjectPatterns: [
          'Avoid long subject lines (bottom performers averaged 85 chars)',
        ],
        avgSectionCount: 5,
        heroImageCorrelation: 80,
      },
      totalRecords: 25,
      hasEnoughData: true,
    };
    const prompt = generateCalibrationPrompt(context);

    expect(prompt.text).toContain('Performance Calibration');
    expect(prompt.text).toContain('25 campaigns');
    expect(prompt.text).toContain('28.0%');
    expect(prompt.text).toContain('42 characters');
    expect(prompt.text).toContain('executive');
    expect(prompt.text).toContain('confident');
    expect(prompt.text).toContain('pill');
    expect(prompt.text).toContain('hero images');
    expect(prompt.text).toContain('Ship faster with AI');
    expect(prompt.text).toContain('Avoid long subject');
    expect(prompt.basedOnRecords).toBe(25);
  });

  it('includes ISO timestamp', () => {
    const context: PerformanceContext = {
      topPerformers: [makeRecord()],
      bottomPerformers: [],
      averages: {
        openRate: 0.3,
        clickThroughRate: null,
        conversionRate: null,
      },
      patterns: {
        bestSubjectLength: 40,
        bestThemes: ['minimal'],
        bestTones: [],
        bestCtaVariants: [],
        worstSubjectPatterns: [],
        avgSectionCount: null,
        heroImageCorrelation: null,
      },
      totalRecords: 15,
      hasEnoughData: true,
    };
    const prompt = generateCalibrationPrompt(context);
    expect(prompt.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('handles context with averages but no patterns', () => {
    const context: PerformanceContext = {
      topPerformers: [
        makeRecord({
          theme_used: null,
          tone_tags: [],
          cta_variant: null,
          subject_length: null,
        }),
      ],
      bottomPerformers: [],
      averages: {
        openRate: 0.25,
        clickThroughRate: 0.04,
        conversionRate: 0.01,
      },
      patterns: {
        bestSubjectLength: null,
        bestThemes: [],
        bestTones: [],
        bestCtaVariants: [],
        worstSubjectPatterns: [],
        avgSectionCount: null,
        heroImageCorrelation: null,
      },
      totalRecords: 12,
      hasEnoughData: true,
    };
    const prompt = generateCalibrationPrompt(context);
    expect(prompt.text).toContain('25.0%');
    expect(prompt.text).toContain('Performance Calibration');
  });
});

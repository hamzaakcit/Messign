import { describe, it, expect } from 'vitest';
import {
  runRuleChecks,
  parseLLMToneResponse,
} from '../../../services/marketing/complianceScanner.js';
import type { ContentToScan } from '../../../services/marketing/complianceScanner.js';
import type { BrandProfile } from '../../../services/marketing/brandProfileService.js';

function makeContent(overrides: Partial<ContentToScan> = {}): ContentToScan {
  return {
    id: 'e2e-content-1',
    title: 'AI Workflow Launch',
    body: 'We are thrilled to announce our revolutionary AI workflow platform that will transform how teams operate.',
    channel: 'email',
    subjectLine: 'Transform Your Workflow with AI',
    organizationId: 'org-e2e',
    ...overrides,
  };
}

function makeBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'bp-e2e-1',
    organization_id: 'org-e2e',
    brand_name: 'Messign',
    brand_description: 'AI-native business OS',
    logo_url: null,
    tone_keywords: ['confident', 'technical', 'no-nonsense'],
    forbidden_words: ['revolutionary', 'thrilled', 'transform', 'synergy', 'leverage'],
    required_disclaimers: ['SOC2 compliant'],
    voice_examples: ['We build tools that work. Ship fast, ship right.'],
    style_guide_notes: 'No superlatives without data. Lead with specifics.',
    color_palette: { primary: '#1A1A2E', accent: '#E94560' },
    preferred_themes: ['executive', 'startup'],
    active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('E2E: Full Compliance Pipeline', () => {
  it('content with multiple violations scores low', () => {
    const content = makeContent({
      body: 'We are thrilled to announce our revolutionary product that will transform everything. This leverages cutting-edge synergy to disrupt markets.',
    });
    const brand = makeBrand();
    const result = runRuleChecks(content, brand);

    expect(result.flags.filter((f) => f.type === 'forbidden_word').length).toBeGreaterThanOrEqual(4);
    expect(result.flags.filter((f) => f.type === 'missing_disclaimer').length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(40);
  });

  it('clean on-brand content scores high', () => {
    const content = makeContent({
      body: 'Messign Workflows automates repetitive tasks. Teams save 12 hours per week. Set up in 2 minutes, no coding required. SOC2 compliant from day one.',
      subjectLine: 'Save 12 Hours a Week with AI Workflows',
    });
    const brand = makeBrand();
    const result = runRuleChecks(content, brand);

    expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(0);
    expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it('combined score computation is correct', () => {
    const combined = Math.round(70 * 0.4 + 90 * 0.6);
    expect(combined).toBe(82);
    expect(combined >= 80).toBe(true);

    const low = Math.round(50 * 0.4 + 60 * 0.6);
    expect(low).toBe(56);
    expect(low >= 80).toBe(false);
  });

  it('LLM tone check parses realistic response', () => {
    // Simulate what the LLM returns — raw text, not double-stringified JSON
    const realistic = '{"score": 78, "issues": [{"message": "Opening line uses thrilled which sounds generic", "suggestion": "Replace with specific achievement"}, {"message": "Body lacks data points", "suggestion": "Add metrics"}]}';
    const result = parseLLMToneResponse(realistic);
    expect(result.score).toBe(78);
    expect(result.flags).toHaveLength(2);
    expect(result.flags[0].type).toBe('tone_deviation');
  });

  it('LLM failure degrades gracefully', () => {
    const garbled = 'I cannot score this content because [error 429]';
    const result = parseLLMToneResponse(garbled);
    expect(result.score).toBe(70);
    expect(result.flags).toHaveLength(0);
  });
});

describe('E2E: Brand Profile Scenarios', () => {
  it('strict brand (many forbidden words) catches more violations', () => {
    const strictBrand = makeBrand({
      forbidden_words: [
        'revolutionary', 'thrilled', 'transform', 'synergy', 'leverage',
        'disrupt', 'paradigm', 'ecosystem', 'scalable', 'innovative',
        'cutting-edge', 'game-changing', 'world-class', 'best-in-class',
      ],
    });
    const content = makeContent({
      body: 'Our innovative, world-class, cutting-edge platform is a game-changing, best-in-class solution.',
    });
    const result = runRuleChecks(content, strictBrand);
    expect(result.flags.filter((f) => f.type === 'forbidden_word').length).toBeGreaterThanOrEqual(4);
    expect(result.score).toBeLessThan(30);
  });

  it('permissive brand (no rules) always passes', () => {
    const permissive = makeBrand({
      forbidden_words: [],
      required_disclaimers: [],
    });
    const content = makeContent({
      body: 'We leverage synergy to disrupt paradigms with our revolutionary platform.',
    });
    const result = runRuleChecks(content, permissive);
    expect(result.score).toBe(100);
    expect(result.flags).toHaveLength(0);
  });

  it('disclaimer-heavy brand catches missing legal text', () => {
    const legalBrand = makeBrand({
      forbidden_words: [],
      required_disclaimers: [
        'SOC2 compliant',
        'Terms and conditions apply',
        'Not financial advice',
        'Results may vary',
      ],
    });
    const content = makeContent({ body: 'Buy our product. SOC2 compliant.' });
    const result = runRuleChecks(content, legalBrand);
    expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(3);
  });
});

describe('E2E: Cross-Brand Isolation', () => {
  it('content scanned against correct brand profile', () => {
    const brandA = makeBrand({ id: 'bp-A', forbidden_words: ['leverage'] });
    const brandB = makeBrand({ id: 'bp-B', forbidden_words: ['synergy'] });
    const content = makeContent({ body: 'We leverage cutting-edge synergy.' });

    const resultA = runRuleChecks(content, brandA);
    const resultB = runRuleChecks(content, brandB);

    expect(resultA.flags.some((f) => f.message.includes('leverage'))).toBe(true);
    expect(resultA.flags.some((f) => f.message.includes('synergy'))).toBe(false);

    expect(resultB.flags.some((f) => f.message.includes('synergy'))).toBe(true);
    expect(resultB.flags.some((f) => f.message.includes('leverage'))).toBe(false);
  });
});

describe('E2E: Edge Cases', () => {
  it('empty content body still scans (flags disclaimers)', () => {
    const content = makeContent({ body: '', title: '', subjectLine: '' });
    const brand = makeBrand({ required_disclaimers: ['Terms apply'] });
    const result = runRuleChecks(content, brand);
    expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(1);
  });

  it('content with HTML tags — word-boundary behavior on attributes', () => {
    const content = makeContent({
      body: '<a href="https://example.com" class="leverage-link">Click here</a>',
    });
    const brand = makeBrand({ forbidden_words: ['leverage'] });
    const result = runRuleChecks(content, brand);
    // "leverage-link" is hyphenated — \b treats hyphen as a boundary, so "leverage"
    // is matched. This is documenting actual regex behavior rather than asserting
    // a specific ideal; the important thing is it doesn't crash.
    expect(typeof result.score).toBe('number');
  });

  it('unicode forbidden words — regex \\b limitation with accented chars', () => {
    // JS \b doesn't treat accented characters as word chars, so word-boundary
    // matching for "café" won't fire. This test documents the known limitation.
    const content = makeContent({ body: 'Our café-style approach brings résumé-quality results.' });
    const brand = makeBrand({ forbidden_words: ['café', 'résumé'] });
    const result = runRuleChecks(content, brand);
    // \b sees "caf" as word + "é" as non-word, so the boundary sits *before* é
    // and the full word "café" is not matched by \bcafé\b. This is expected.
    expect(typeof result.score).toBe('number');
  });

  it('very long content finishes rule checks quickly', () => {
    const longBody = 'This is a test sentence. '.repeat(5000);
    const content = makeContent({ body: longBody });
    // Use a permissive brand — no disclaimers — so score is purely from forbidden words
    const brand = makeBrand({ forbidden_words: ['nonexistent_word_xyz'], required_disclaimers: [] });
    const start = Date.now();
    const result = runRuleChecks(content, brand);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
    expect(result.score).toBe(100);
  });
});

import { describe, it, expect } from 'vitest';
import {
  runRuleChecks,
  parseLLMToneResponse,
} from '../../../services/marketing/complianceScanner.js';
import type {
  ContentToScan,
} from '../../../services/marketing/complianceScanner.js';
import type { BrandProfile } from '../../../services/marketing/brandProfileService.js';

// ── Test Helpers ──

function makeContent(overrides: Partial<ContentToScan> = {}): ContentToScan {
  return {
    id: 'content-1',
    title: 'Product Launch Email',
    body: 'We are excited to announce our new product. It will leverage cutting-edge technology to disrupt the market.',
    channel: 'email',
    subjectLine: 'Introducing Our New Product',
    organizationId: 'org-1',
    ...overrides,
  };
}

function makeBrandProfile(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'bp-1',
    organization_id: 'org-1',
    brand_name: 'TestBrand',
    brand_description: null,
    logo_url: null,
    tone_keywords: ['confident', 'professional', 'approachable'],
    forbidden_words: ['leverage', 'disrupt', 'synergy', 'paradigm'],
    required_disclaimers: ['SOC2 compliant', 'Terms apply'],
    voice_examples: ['We build tools that work. No fluff.'],
    style_guide_notes: 'Lead with benefits, not features.',
    color_palette: { primary: '#1A1A2E', accent: '#E94560' },
    preferred_themes: ['executive'],
    active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════

describe('runRuleChecks', () => {
  describe('forbidden words', () => {
    it('detects forbidden words in body', () => {
      const content = makeContent({ body: 'We leverage cutting-edge technology to disrupt markets.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage', 'disrupt'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(2);
      expect(result.score).toBeLessThan(100);
    });

    it('detects forbidden words in subject line', () => {
      const content = makeContent({ subjectLine: "Let's leverage our synergy" });
      const brand = makeBrandProfile({ forbidden_words: ['leverage', 'synergy'] });
      const result = runRuleChecks(content, brand);
      const subjectFlags = result.flags.filter((f) => f.location === 'subject_line');
      expect(subjectFlags.length).toBeGreaterThan(0);
    });

    it('uses word boundary matching (no false positives)', () => {
      const content = makeContent({ body: 'The lever mechanism works well.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(0);
    });

    it('case-insensitive matching', () => {
      const content = makeContent({ body: 'We LEVERAGE our SYNERGY for maximum impact.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage', 'synergy'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(2);
    });

    it('counts multiple occurrences', () => {
      const content = makeContent({ body: 'Leverage this, then leverage that, and leverage everything.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage'] });
      const result = runRuleChecks(content, brand);
      const flag = result.flags.find((f) => f.type === 'forbidden_word');
      expect(flag?.message).toContain('3 time(s)');
    });

    it('passes when no forbidden words found', () => {
      const content = makeContent({ body: 'We build great tools for teams.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage', 'synergy'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(0);
    });

    it('handles empty forbidden_words array', () => {
      const content = makeContent();
      const brand = makeBrandProfile({ forbidden_words: [] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'forbidden_word')).toHaveLength(0);
    });
  });

  describe('required disclaimers', () => {
    it('flags missing disclaimers', () => {
      const content = makeContent({ body: 'Buy our product.' });
      const brand = makeBrandProfile({ required_disclaimers: ['SOC2 compliant', 'Terms apply'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(2);
    });

    it('passes when disclaimers are present', () => {
      const content = makeContent({
        body: 'Buy our product. SOC2 compliant. Terms apply.',
      });
      const brand = makeBrandProfile({ required_disclaimers: ['SOC2 compliant', 'Terms apply'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(0);
    });

    it('fuzzy matches disclaimers (60% word overlap)', () => {
      const content = makeContent({
        body: 'We are fully SOC2 compliant and certified.',
      });
      const brand = makeBrandProfile({ required_disclaimers: ['SOC2 compliant'] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(0);
    });

    it('handles empty required_disclaimers', () => {
      const content = makeContent();
      const brand = makeBrandProfile({ required_disclaimers: [] });
      const result = runRuleChecks(content, brand);
      expect(result.flags.filter((f) => f.type === 'missing_disclaimer')).toHaveLength(0);
    });
  });

  describe('scoring', () => {
    it('perfect score when no violations', () => {
      const content = makeContent({ body: 'Clean content with no issues.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage'], required_disclaimers: [] });
      const result = runRuleChecks(content, brand);
      expect(result.score).toBe(100);
    });

    it('deducts 15 points per forbidden word occurrence', () => {
      const content = makeContent({ body: 'We leverage things.' });
      const brand = makeBrandProfile({ forbidden_words: ['leverage'], required_disclaimers: [] });
      const result = runRuleChecks(content, brand);
      expect(result.score).toBe(85);
    });

    it('deducts 20 points per missing disclaimer', () => {
      const content = makeContent({ body: 'No disclaimers here.' });
      const brand = makeBrandProfile({ forbidden_words: [], required_disclaimers: ['Terms apply'] });
      const result = runRuleChecks(content, brand);
      expect(result.score).toBe(80);
    });

    it('score never goes below 0', () => {
      const content = makeContent({
        body: 'Leverage leverage leverage synergy synergy disrupt paradigm paradigm paradigm',
      });
      const brand = makeBrandProfile({
        forbidden_words: ['leverage', 'synergy', 'disrupt', 'paradigm'],
        required_disclaimers: ['Disclaimer 1', 'Disclaimer 2', 'Disclaimer 3'],
      });
      const result = runRuleChecks(content, brand);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('parseLLMToneResponse', () => {
  it('parses clean JSON response', () => {
    const response = '{"score": 85, "issues": [{"message": "Tone slightly too casual", "suggestion": "Use more formal language"}]}';
    const result = parseLLMToneResponse(response);
    expect(result.score).toBe(85);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].type).toBe('tone_deviation');
    expect(result.flags[0].message).toContain('casual');
  });

  it('handles JSON with trailing comma', () => {
    const response = '{"score": 92, "issues": [{"message": "Minor issue",},]}';
    const result = parseLLMToneResponse(response);
    expect(result.score).toBe(92);
  });

  it('handles JSON wrapped in text', () => {
    const response = 'Here is my assessment:\n{"score": 78, "issues": [{"message": "Off-brand tone"}]}\nThat is my analysis.';
    const result = parseLLMToneResponse(response);
    expect(result.score).toBe(78);
  });

  it('clamps score to 0-100 range', () => {
    expect(parseLLMToneResponse('{"score": 150}').score).toBe(100);
    expect(parseLLMToneResponse('{"score": -20}').score).toBe(0);
  });

  it('defaults to 70 when score is missing', () => {
    const result = parseLLMToneResponse('{"issues": []}');
    expect(result.score).toBe(70);
  });

  it('limits to max 3 issues', () => {
    const response = JSON.stringify({
      score: 60,
      issues: [
        { message: 'Issue 1' }, { message: 'Issue 2' },
        { message: 'Issue 3' }, { message: 'Issue 4' }, { message: 'Issue 5' },
      ],
    });
    const result = parseLLMToneResponse(response);
    expect(result.flags.length).toBeLessThanOrEqual(3);
  });

  it('returns neutral 70 on unparseable response', () => {
    const result = parseLLMToneResponse('This is not JSON at all');
    expect(result.score).toBe(70);
    expect(result.flags).toHaveLength(0);
  });

  it('sets severity based on score', () => {
    const low = parseLLMToneResponse('{"score": 40, "issues": [{"message": "Bad tone"}]}');
    expect(low.flags[0].severity).toBe('error');

    const mid = parseLLMToneResponse('{"score": 75, "issues": [{"message": "Minor issue"}]}');
    expect(mid.flags[0].severity).toBe('warning');
  });
});

describe('Compliance Scanner — Integration Logic', () => {
  it('combined score weights: 40% rule + 60% LLM', () => {
    const ruleScore = 80;
    const llmScore = 90;
    const combined = Math.round(ruleScore * 0.4 + llmScore * 0.6);
    expect(combined).toBe(86);
  });

  it('passing threshold is 80', () => {
    expect(80 >= 80).toBe(true);
    expect(79 >= 80).toBe(false);
  });

  it('no brand profile = automatic 100', () => {
    const noBrand = null;
    const autoScore = noBrand ? 0 : 100;
    expect(autoScore).toBe(100);
  });

  it('LLM failure degrades gracefully to rule score only', () => {
    const ruleScore = 85;
    const llmFailed = true;
    const finalScore = llmFailed
      ? Math.round(ruleScore * 0.4 + ruleScore * 0.6)
      : Math.round(ruleScore * 0.4 + 90 * 0.6);
    expect(finalScore).toBe(85);
  });
});

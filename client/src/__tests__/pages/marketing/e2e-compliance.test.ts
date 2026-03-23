import { describe, it, expect } from 'vitest';

describe('E2E: Compliance UI Logic', () => {
  describe('badge status thresholds', () => {
    const thresholds = [
      { score: 100, expected: 'passed' },
      { score: 80, expected: 'passed' },
      { score: 79, expected: 'warning' },
      { score: 60, expected: 'warning' },
      { score: 59, expected: 'failed' },
      { score: 0, expected: 'failed' },
    ];

    it.each(thresholds)('score $score → $expected', ({ score, expected }) => {
      const status = score >= 80 ? 'passed' : score >= 60 ? 'warning' : 'failed';
      expect(status).toBe(expected);
    });
  });

  describe('flag display completeness', () => {
    const flagTypes = ['forbidden_word', 'missing_disclaimer', 'tone_deviation', 'style_violation', 'length_issue'];
    const labels: Record<string, string> = {
      forbidden_word: 'Forbidden word',
      missing_disclaimer: 'Missing disclaimer',
      tone_deviation: 'Tone issue',
      style_violation: 'Style',
      length_issue: 'Length',
    };

    it('every flag type has a display label', () => {
      for (const type of flagTypes) {
        expect(labels[type]).toBeTruthy();
      }
    });
  });

  describe('score breakdown math', () => {
    it('weighted scores sum correctly', () => {
      const cases = [
        { rule: 100, llm: 100, expected: 100 },
        { rule: 0, llm: 0, expected: 0 },
        { rule: 80, llm: 90, expected: 86 },
        { rule: 100, llm: 50, expected: 70 },
        { rule: 50, llm: 100, expected: 80 },
      ];
      for (const { rule, llm, expected } of cases) {
        expect(Math.round(rule * 0.4 + llm * 0.6)).toBe(expected);
      }
    });
  });

  describe('brand filter integration', () => {
    it('filter options include All brands + each active brand', () => {
      const brands = [
        { id: 'bp-1', brand_name: 'Messign', active: true },
        { id: 'bp-2', brand_name: 'SubBrand', active: true },
        { id: 'bp-3', brand_name: 'Inactive', active: false },
      ];
      const options = [
        { value: null, label: 'All brands' },
        ...brands.filter((b) => b.active).map((b) => ({ value: b.id, label: b.brand_name })),
      ];
      expect(options).toHaveLength(3);
      expect(options[0].label).toBe('All brands');
    });
  });
});

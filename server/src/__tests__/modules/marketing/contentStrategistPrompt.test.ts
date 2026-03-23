import { describe, it, expect } from 'vitest';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';

const baseInput = {
  userRole: 'admin',
  productTruthMd: '## Truth\n- Feature A',
  brandVoiceMd: '## Brand\n- Tone: crisp',
};

describe('buildMarketingContentStrategistPrompt', () => {
  it('embeds injected layers and static spec', () => {
    const p = buildMarketingContentStrategistPrompt(baseInput);
    expect(p).toContain('User role: admin.');
    expect(p).toContain('## Truth');
    expect(p).toContain('## Brand');
    expect(p).toContain('CONTENT_STRATEGIST');
    expect(p).toContain('Golden examples');
    expect(p).toContain('marketing:product_truth_lookup');
    expect(p).toContain('marketing:validate_product_truth');
  });

  describe('VA2 Email Mode (channel === email)', () => {
    it('includes Design Manifest schema reference and fenced-json instructions', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Email Design Mode (Visual Architect v2)');
      expect(p).toContain('"version": "2.0"');
      expect(p).toContain('```json');
    });

    it('includes all 8 theme names with selection guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      const themes = ['executive', 'startup', 'luxury', 'minimal', 'bold', 'nature', 'tech', 'warm'] as const;
      for (const theme of themes) {
        expect(p).toContain(theme);
      }
    });

    it('includes all VA2 section types', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      const types = [
        'hero',
        'value_prop',
        'testimonial',
        'social_proof',
        'cta',
        'divider',
        'footer',
        'text_block',
        'image',
      ];
      for (const t of types) {
        expect(p).toContain(t);
      }
    });

    it('includes art direction, colorNotes, and imageStyle guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('artDirection');
      expect(p).toContain('colorNotes');
      expect(p).toContain('imageStyle');
    });

    it('includes subject line best practices', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('40-60 characters');
    });

    it('includes email structure guidelines', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Product launch');
      expect(p).toContain('Newsletter');
    });

    it('includes image and divider content specs', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('**image** content');
      expect(p).toContain('"imagePrompt"');
      expect(p).toContain('**divider** content');
    });

    it('uses VA2 mandatory workflow line for email', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Email channel (Visual Architect v2)');
    });

    it('does not include the legacy Visual Layout Architect JSON shape block', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).not.toContain('"colorTheme": "messign_blue"');
      expect(p).not.toContain('Prefer **raw JSON** (no markdown fences)');
    });
  });

  describe('non-email channels', () => {
    it('instagram: no Email Design Mode VA2 block', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'instagram' });
      expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
      expect(p).not.toContain('"version": "2.0"');
      expect(p).toContain('## Visual Layout Architect v2 — Design Manifest');
    });

    it('linkedin: no VA2 Email Design Mode block', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'linkedin' });
      expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
      expect(p).not.toContain('"version": "2.0"');
      expect(p).toContain('## Visual Layout Architect v2 — Design Manifest');
    });

    it('twitter and sms: no VA2 email Design Manifest block', () => {
      for (const channel of ['twitter', 'sms'] as const) {
        const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel });
        expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
        expect(p).not.toContain('"version": "2.0"');
      }
    });

    it('linkedin (default when unspecified): legacy manifest spec, not VA2', () => {
      const p = buildMarketingContentStrategistPrompt(baseInput);
      expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
      expect(p).toContain('## Visual Layout Architect v2 — Design Manifest');
      expect(p).toContain('"colorTheme": "messign_blue"');
    });
  });

  describe('Calibration Injection', () => {
    const calibrationSample =
      '## Performance Calibration\nBased on 25 campaigns in this workspace:\n- Best subject length: 42 chars.';

    it('includes calibration text when provided', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        channel: 'email',
        calibrationText: calibrationSample,
      });
      expect(p).toContain('Performance Calibration');
      expect(p).toContain('25 campaigns');
    });

    it('places calibration after brand voice and before static spec', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        channel: 'email',
        calibrationText: calibrationSample,
      });
      const brandIdx = p.indexOf('Brand voice profile');
      const calibIdx = p.indexOf('Performance Calibration');
      const staticIdx = p.indexOf('CONTENT_STRATEGIST');
      expect(brandIdx).toBeLessThan(calibIdx);
      expect(calibIdx).toBeLessThan(staticIdx);
    });

    it('works without calibration text (backward compatible)', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        channel: 'email',
      });
      expect(p).toContain('Email Design Mode (Visual Architect v2)');
      expect(p).not.toContain('Performance Calibration');
    });

    it('empty string calibrationText is not injected', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        calibrationText: '',
      });
      expect(p).not.toContain('Performance Calibration');
    });

    it('skipCalibration prevents injection', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        channel: 'email',
        calibrationText: calibrationSample,
        skipCalibration: true,
      });
      expect(p).not.toContain('Performance Calibration');
      expect(p).toContain('Email Design Mode (Visual Architect v2)');
    });

    it('calibration works for non-email channels', () => {
      const p = buildMarketingContentStrategistPrompt({
        ...baseInput,
        channel: 'instagram',
        calibrationText: calibrationSample,
      });
      expect(p).toContain('Performance Calibration');
      expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
    });
  });
});

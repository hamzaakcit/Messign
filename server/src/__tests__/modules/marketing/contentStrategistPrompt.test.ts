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

  it('injects built-in golden email library when goldenExamplesMd is omitted', () => {
    const p = buildMarketingContentStrategistPrompt(baseInput);
    expect(p).toContain('Example A — B2B SaaS Product Launch');
    expect(p).toContain('Example F — Creator / Personal Brand');
  });

  it('prefers custom goldenExamplesMd over the built-in library', () => {
    const p = buildMarketingContentStrategistPrompt({
      ...baseInput,
      goldenExamplesMd: 'CUSTOM_GOLDEN_SESSION_ONLY',
    });
    expect(p).toContain('CUSTOM_GOLDEN_SESSION_ONLY');
    expect(p).not.toContain('Example A — B2B SaaS Product Launch');
  });

  describe('VA2 Email Mode (channel === email)', () => {
    it('includes Design Manifest schema reference and fenced-json instructions', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Email Design Mode (Visual Architect v2)');
      expect(p).toContain('"version": "2.0"');
      expect(p).toContain('```json');
    });

    it('instructs topic fidelity and paper-plane motion semantics (not Messign product substitution)', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('topic fidelity');
      expect(p).toContain('motionOverlay');
      expect(p).toContain('easterEgg');
      expect(p).toContain('paper_plane');
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

    it('includes image slot guidance and value_prop item imagePrompt', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('target_image_slots');
      expect(p).toContain('**6**');
      expect(p).toContain('12 or fewer');
      expect(p).toContain('Minimal flat illustration');
    });

    it('includes target_image_slots when user requests N images', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('target_image_slots');
      expect(p).toContain('3–12');
    });

    it('includes art direction, colorNotes, and imageStyle guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('artDirection');
      expect(p).toContain('colorNotes');
      expect(p).toContain('imageStyle');
    });

    it('includes subject line best practices', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('under ~50 characters');
      expect(p).toContain('### Subject Line Best Practices');
    });

    it('includes copywriting_engine block before Phase 13 and subject_variants in schema', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      const ce = p.indexOf('<copywriting_engine>');
      const lab = p.indexOf('<subject_line_lab>');
      const playbooks = p.indexOf('<industry_copy_playbooks>');
      const bva = p.indexOf('<brand_voice_amplifier>');
      const p13 = p.indexOf(
        '**Unlayer-category parity (Phase 13):** Match **industry facets** to **gallery-style depth**',
      );
      expect(ce).toBeGreaterThan(-1);
      expect(lab).toBeGreaterThan(-1);
      expect(playbooks).toBeGreaterThan(-1);
      expect(bva).toBeGreaterThan(-1);
      expect(p13).toBeGreaterThan(-1);
      expect(ce).toBeLessThan(lab);
      expect(lab).toBeLessThan(playbooks);
      expect(playbooks).toBeLessThan(bva);
      expect(bva).toBeLessThan(p13);
      expect(p).toContain('metadata.subject_variants');
      expect(p).toContain('Kill List — Hard Rewrite Triggers');
      expect(p).toContain('Pre-Output Gate — Run Before Emitting JSON');
      expect(p).toContain('Subject Line Reference Library — 30 Contrast Pairs');
      expect(p).toContain('Industry Copy Playbooks');
      expect(p).toContain('### Real Estate / Property');
      expect(p).toContain('### Nonprofit / Mission-Driven');
      expect(p).toContain('Brand Voice Application Protocol');
      expect(p).toContain('Voice Consistency Check');
    });

    it('includes builder validation alignment (image_text alternation, preheader ≥40, target_image_slots)', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Builder validation alignment');
      expect(p).toContain('**alternate** sides');
      expect(p).toContain('≥40 characters');
      expect(p).toContain('Countable image slots vs');
    });

    it('includes email structure guidelines', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Product launch');
      expect(p).toContain('Newsletter');
    });

    it('Phase 2: promotional rhythm mentions divider/testimonial and Example C dual product_grid', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('**divider** and/or **testimonial**');
      expect(p).toContain('Example C — D2C flash sale / heavy product_grid');
      expect(p).toContain('heroLayout');
    });

    it('Phase 3: layoutDensity, schema field, and Example D split webinar', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('layoutDensity');
      expect(p).toContain('"layoutDensity"');
      expect(p).toContain('Example D — Webinar invite');
      expect(p).toContain('"heroLayout": "split"');
    });

    it('Phase 4: B2B SaaS / product newsletter — alternating image_text and distinct imagePrompts', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('B2B SaaS / product newsletter');
      expect(p).toContain('image_left');
      expect(p).toContain('image_right');
      expect(p).toContain('distinct');
    });

    it('Phase 5: D2C ecommerce depth and events / webinar registration guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('D2C ecommerce depth');
      expect(p).toContain('product_grid');
      expect(p).toContain('Events / webinar registration');
      expect(p).toContain('timezone');
    });

    it('Phase 6: onboarding welcome series and transactional minimal visual_density guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Onboarding welcome series');
      expect(p).toContain('Transactional / system emails');
      expect(p).toContain('metadata.visual_density: minimal');
    });

    it('Phase 7: hero diversity, B2B nurture, abandoned cart recovery, and UTM discipline', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Hero layout diversity');
      expect(p).toContain('B2B thought leadership / nurture');
      expect(p).toContain('Abandoned cart / browse recovery');
      expect(p).toContain('Campaign / UTM discipline');
    });

    it('Phase 8: HTML weight, changelog release, referral / loyalty', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Export size / HTML weight');
      expect(p).toContain('Product changelog / release email');
      expect(p).toContain('Referral or loyalty program');
    });

    it('Phase 9: partner co-marketing, seasonal gift guide, Outlook / va4', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Partner co-marketing / joint webinar');
      expect(p).toContain('Seasonal gift guide (D2C editorial)');
      expect(p).toContain('Outlook / layered backgrounds');
      expect(p).toContain('docs/va4-phase-4.md');
    });

    it('Phase 10: Rich visual_density magazine depth and validateManifest note', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Rich visual_density (magazine depth)');
      expect(p).toContain('validateManifest warning');
      expect(p).toContain('product_grid');
    });

    it('Phase 11: hero split vs editorial_tall vs default and va11 doc', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('docs/va11-phase-11.md');
      expect(p).toContain('b2bSplitHeroProductStory');
      expect(p).toContain('d2cEditorialTallLookbook');
    });

    it('Phase 12: export HTML discipline, licensing, va12 and va4 docs', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Export HTML discipline & template licensing (Phase 12)');
      expect(p).toContain('docs/va12-phase-12.md');
      expect(p).toContain('docs/va4-phase-4.md');
    });

    it('Phase 13: Unlayer-category parity and va13 doc', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('Unlayer-category parity (Phase 13)');
      expect(p).toContain('docs/va13-phase-13.md');
      expect(p).toContain('Real estate / open house');
      expect(p).toContain('Nonprofit / giving');
    });

    it('includes image and divider content specs', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('**image** content');
      expect(p).toContain('"imagePrompt"');
      expect(p).toContain('**divider** content');
    });

    it('includes hero editorial fields and preheader length guidance', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'email' });
      expect(p).toContain('decorativeInitial');
      expect(p).toContain('imagePosition');
      expect(p).toContain('100–140');
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
      // Golden examples always inject VA2 manifest snippets; assert static spec is legacy, not email VA2.
      expect(p).toContain('## Visual Layout Architect v2 — Design Manifest');
      expect(p).toContain('"colorTheme": "messign_blue"');
    });

    it('linkedin: no VA2 Email Design Mode block', () => {
      const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel: 'linkedin' });
      expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
      expect(p).toContain('## Visual Layout Architect v2 — Design Manifest');
      expect(p).toContain('"colorTheme": "messign_blue"');
    });

    it('twitter and sms: no VA2 email Design Manifest block', () => {
      for (const channel of ['twitter', 'sms'] as const) {
        const p = buildMarketingContentStrategistPrompt({ ...baseInput, channel });
        expect(p).not.toContain('Email Design Mode (Visual Architect v2)');
        expect(p).toContain('"colorTheme": "messign_blue"');
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

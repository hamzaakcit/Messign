import { describe, it, expect } from 'vitest';
import {
  enhanceImagePrompt,
  buildDirectInstagramFalPrompt,
} from '../../../services/marketing/publishing/imageService.js';
import type { ImageGenContext } from '../../../services/marketing/publishing/imageService.js';

describe('enhanceImagePrompt — email anti-text and hero clarity', () => {
  it('includes ZERO TEXT block for email channel', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'image_text' };
    const result = enhanceImagePrompt('Workspace desk with laptop', 'photoreal', ctx);
    expect(result).toContain('ZERO TEXT (mandatory — email image)');
    expect(result).toContain('No fake app UI');
  });

  it('includes EMAIL HERO CLARITY for email hero', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('Product on marble surface', 'photoreal', ctx);
    expect(result).toContain('EMAIL HERO CLARITY (mandatory)');
    expect(result).toContain('abstract blur-only hero');
  });

  it('does not include EMAIL HERO CLARITY for email non-hero sections', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'image_text' };
    const result = enhanceImagePrompt('Supporting visual', 'photoreal', ctx);
    expect(result).not.toContain('EMAIL HERO CLARITY (mandatory)');
  });

  it('includes TECHNICAL PLATFORM IMAGERY when technicalPlatformTopic is true', () => {
    const ctx: ImageGenContext = {
      channel: 'email',
      sectionType: 'hero',
      technicalPlatformTopic: true,
    };
    const result = enhanceImagePrompt('API integration campaign', 'photoreal', ctx);
    expect(result).toContain('TECHNICAL PLATFORM IMAGERY');
    expect(result).toContain('no readable text on screens');
  });

  it('does not include TECHNICAL PLATFORM IMAGERY when flag is false', () => {
    const ctx: ImageGenContext = {
      channel: 'email',
      sectionType: 'hero',
      technicalPlatformTopic: false,
    };
    const result = enhanceImagePrompt('Retail sale banner', 'photoreal', ctx);
    expect(result).not.toContain('TECHNICAL PLATFORM IMAGERY');
  });

  it('adds photoreal email banner clarity phrase', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('Autumn product lineup', 'photoreal', ctx);
    expect(result).toContain('f/5.6–f/11');
  });
});

describe('buildDirectInstagramFalPrompt', () => {
  it('prefers userBrief over strategist-heavy imagePrompt', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: 'Red paper plane on a child’s hand outdoors',
      imagePrompt:
        "Planner: Creative Director\nPRIMARY SUBJECT: generic office stock photo\nScene / composition: ...",
    });
    expect(out).toContain('Red paper plane');
    expect(out).not.toContain('Planner:');
    expect(out).toMatch(/Photorealistic photograph/i);
    expect(out).toMatch(/fingers and thumb|no stick/i);
    expect(out).toMatch(/same directional light/i);
  });

  it('strips planner lines from imagePrompt when userBrief is empty', () => {
    const out = buildDirectInstagramFalPrompt({
      userBrief: null,
      imagePrompt: "Planner: ignore this\nUser's request: A golden retriever on a beach at sunset",
    });
    expect(out).toContain('golden retriever');
    expect(out).not.toContain('Planner:');
    expect(out).toMatch(/Handheld objects must match real-world materials/i);
  });
});

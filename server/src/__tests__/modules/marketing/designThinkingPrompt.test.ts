import { describe, it, expect } from 'vitest';
import {
  enhanceImagePrompt,
  resolveStockImageUrl,
} from '../../../services/marketing/publishing/imageService.js';
import type { ImageGenContext } from '../../../services/marketing/publishing/imageService.js';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';

// ---------------------------------------------------------------------------
// enhanceImagePrompt — context-aware behavior
// ---------------------------------------------------------------------------

describe('enhanceImagePrompt', () => {
  it('defaults to square 1:1 composition without context', () => {
    const result = enhanceImagePrompt('A futuristic city at night');
    expect(result).toContain('1:1');
    expect(result).not.toContain('email');
  });

  it('uses horizontal/landscape composition for email context', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('A modern office space', undefined, ctx);
    expect(result).toContain('Horizontal/landscape');
    expect(result).toContain('email');
    expect(result).not.toContain('Square 1:1');
  });

  it('adds cinematic direction for hero sectionType', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'hero' };
    const result = enhanceImagePrompt('Product launch visual', undefined, ctx);
    expect(result).toContain('Cinematic wide shot');
  });

  it('does not add hero direction for non-hero sections', () => {
    const ctx: ImageGenContext = { channel: 'email', sectionType: 'standalone' };
    const result = enhanceImagePrompt('A clean workspace', undefined, ctx);
    expect(result).not.toContain('Cinematic wide shot');
  });

  it('keeps square 1:1 for instagram context', () => {
    const ctx: ImageGenContext = { channel: 'instagram', sectionType: 'standalone' };
    const result = enhanceImagePrompt('Sunset over the ocean', undefined, ctx);
    expect(result).toContain('1:1');
  });

  it('includes negative prompt guardrails', () => {
    const result = enhanceImagePrompt('A portrait photo');
    expect(result).toContain('No deformed anatomy');
    expect(result).toContain('no readable text');
  });

  it('keeps the raw prompt before the style block (subject-first)', () => {
    const raw = 'A beautiful mountain landscape at golden hour';
    const result = enhanceImagePrompt(raw);
    expect(result.indexOf(raw)).toBeLessThan(result.indexOf('STYLE DIRECTION'));
    expect(result).toContain('PRIMARY SUBJECT');
  });

  it('applies the specified style preset', () => {
    const result = enhanceImagePrompt('A tech dashboard', 'data_viz');
    expect(result).toContain('Data visualization art style');
  });
});

// ---------------------------------------------------------------------------
// resolveStockImageUrl — [STOCK] tag parsing and routing
// ---------------------------------------------------------------------------

describe('resolveStockImageUrl', () => {
  it('returns null for prompts without [STOCK] prefix', () => {
    expect(resolveStockImageUrl('A futuristic city at night')).toBeNull();
    expect(resolveStockImageUrl('Beautiful mountain landscape')).toBeNull();
  });

  it('returns null for empty [STOCK] body', () => {
    expect(resolveStockImageUrl('[STOCK]')).toBeNull();
    expect(resolveStockImageUrl('[STOCK]   ')).toBeNull();
  });

  it('returns an Unsplash URL for team-related prompts', () => {
    const url = resolveStockImageUrl('[STOCK] Diverse team collaborating in a modern office');
    expect(url).not.toBeNull();
    expect(url).toContain('unsplash.com');
  });

  it('returns an Unsplash URL for coffee/cafe prompts', () => {
    const url = resolveStockImageUrl('[STOCK] Barista making latte art in a cozy cafe');
    expect(url).not.toBeNull();
    expect(url).toContain('unsplash.com');
  });

  it('returns an Unsplash URL for nature prompts', () => {
    const url = resolveStockImageUrl('[STOCK] Mountain trail at sunrise with misty valley');
    expect(url).not.toBeNull();
    expect(url).toContain('unsplash.com');
  });

  it('falls back to office_modern for unknown category', () => {
    const url = resolveStockImageUrl('[STOCK] Quantum entanglement visualization device');
    expect(url).not.toBeNull();
    expect(url).toContain('unsplash.com');
  });

  it('returns deterministic results for the same prompt', () => {
    const prompt = '[STOCK] Coffee shop with warm lighting';
    const url1 = resolveStockImageUrl(prompt);
    const url2 = resolveStockImageUrl(prompt);
    expect(url1).toBe(url2);
  });

  it('is case-insensitive for keyword matching', () => {
    const url1 = resolveStockImageUrl('[STOCK] Office workspace with laptop');
    const url2 = resolveStockImageUrl('[STOCK] office Workspace with Laptop');
    expect(url1).not.toBeNull();
    expect(url2).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildMarketingContentStrategistPrompt — Design Director Protocol injection
// ---------------------------------------------------------------------------

describe('buildMarketingContentStrategistPrompt', () => {
  it('includes Design Director Protocol for email channel', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: 'Product truth',
      brandVoiceMd: 'Brand voice',
      channel: 'email',
    });
    expect(prompt).toContain('Design Director Protocol');
    expect(prompt).toContain('[STOCK]');
    expect(prompt).toContain('Pro Composition Rules');
    expect(prompt).toContain('Anti-Patterns');
  });

  it('includes Design Director Protocol for instagram channel', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: 'Product truth',
      brandVoiceMd: 'Brand voice',
      channel: 'instagram',
    });
    expect(prompt).toContain('Design Director Protocol');
  });

  it('includes Design Director Protocol when no channel specified', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: 'Product truth',
      brandVoiceMd: 'Brand voice',
    });
    expect(prompt).toContain('Design Director Protocol');
  });

  it('includes Golden Design Examples for email channel', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: 'Product truth',
      brandVoiceMd: 'Brand voice',
      channel: 'email',
    });
    expect(prompt).toContain('Golden Design Examples');
    expect(prompt).toContain('SaaS Product Launch');
    expect(prompt).toContain('Lifestyle Newsletter');
  });

  it('includes [STOCK] tag guidance in Instagram channel spec', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      userRole: 'admin',
      productTruthMd: 'Product truth',
      brandVoiceMd: 'Brand voice',
      channel: 'instagram',
    });
    expect(prompt).toContain('[STOCK]');
    expect(prompt).toContain('Anti-uncanny-valley');
    expect(prompt).toContain('Composition Framework');
  });
});

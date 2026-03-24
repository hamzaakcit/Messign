/**
 * Tests for hardened IMAGE_PROMPT extraction and auto-synthesis fallback.
 */
import {
  extractImagePrompts,
  extractCaption,
} from '../../../modules/marketing/prompts/instagramChannelSpec.js';
import { parseInstagramDraft } from '../../../services/marketing/workflows/instagramImagePipeline.js';

// ---------------------------------------------------------------------------
// extractImagePrompts — hardened patterns
// ---------------------------------------------------------------------------

describe('extractImagePrompts (hardened)', () => {
  it('extracts standard [IMAGE_PROMPT] blocks', () => {
    const input = `Caption text here.\n\n[IMAGE_PROMPT]\nA professional photo of a workspace\n[/IMAGE_PROMPT]`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('professional photo');
  });

  it('tolerates bold markers around tags', () => {
    const input = `Caption.\n\n**[IMAGE_PROMPT]**\nA flat-lay workspace\n**[/IMAGE_PROMPT]**`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('flat-lay');
  });

  it('tolerates backtick-wrapped tags', () => {
    const input = 'Caption.\n\n`[IMAGE_PROMPT]`\nModern SaaS dashboard\n`[/IMAGE_PROMPT]`';
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('SaaS dashboard');
  });

  it('tolerates [IMAGE PROMPT] with space instead of underscore', () => {
    const input = `Caption.\n\n[IMAGE PROMPT]\nA vibrant city skyline at sunset\n[/IMAGE PROMPT]`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('city skyline');
  });

  it('tolerates extra whitespace inside brackets', () => {
    const input = `Caption.\n\n[ IMAGE_PROMPT ]\nMinimalist product shot\n[ / IMAGE_PROMPT ]`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('product shot');
  });

  it('handles carousel prompts with spaces', () => {
    const input = [
      'Caption.',
      '[IMAGE PROMPT:1]\nSlide 1: bold workspace overview\n[/IMAGE PROMPT:1]',
      '[IMAGE PROMPT:2]\nSlide 2: close-up on laptop screen\n[/IMAGE PROMPT:2]',
    ].join('\n\n');
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(2);
    expect(results[0].prompt).toContain('workspace');
    expect(results[1].prompt).toContain('laptop');
  });

  it('falls back to unclosed pattern when closing tag is missing', () => {
    const input = `Caption goes here.\n\n[IMAGE_PROMPT]\nA professional photo of a modern coworking space with natural lighting and green plants`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain('coworking space');
  });

  it('rejects prompts shorter than 10 chars', () => {
    const input = `Caption.\n\n[IMAGE_PROMPT]\nshort\n[/IMAGE_PROMPT]`;
    const results = extractImagePrompts(input);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractCaption — hardened
// ---------------------------------------------------------------------------

describe('extractCaption (hardened)', () => {
  it('strips [IMAGE PROMPT] with space', () => {
    const input = `Great caption here.\n\n[IMAGE PROMPT]\nVisual description\n[/IMAGE PROMPT]`;
    const caption = extractCaption(input);
    expect(caption).toBe('Great caption here.');
    expect(caption).not.toContain('IMAGE');
  });

  it('strips bold-wrapped IMAGE_PROMPT tags', () => {
    const input = `The hook line.\n\n**[IMAGE_PROMPT]**\nStudio shot\n**[/IMAGE_PROMPT]**`;
    const caption = extractCaption(input);
    expect(caption).toBe('The hook line.');
  });

  it('strips unclosed IMAGE_PROMPT at end of output', () => {
    const input = `Caption text.\n\n[IMAGE_PROMPT]\nA long description that goes on and on without a closing tag`;
    const caption = extractCaption(input);
    expect(caption).toBe('Caption text.');
  });
});

// ---------------------------------------------------------------------------
// parseInstagramDraft — auto-synthesis fallback
// ---------------------------------------------------------------------------

describe('parseInstagramDraft', () => {
  it('extracts prompt normally when present', () => {
    const draft = `Great caption.\n\n[IMAGE_PROMPT]\nProfessional SaaS dashboard screenshot\n[/IMAGE_PROMPT]`;
    const result = parseInstagramDraft(draft);
    expect(result.autoSynthesized).toBe(false);
    expect(result.imagePrompt).toContain('SaaS dashboard');
    expect(result.caption).toBe('Great caption.');
  });

  it('auto-synthesizes prompt when [IMAGE_PROMPT] is missing', () => {
    const draft = `This is a great marketing post about AI-powered automation for founders.\n\n#AI #Automation #SaaS`;
    const result = parseInstagramDraft(draft);
    expect(result.autoSynthesized).toBe(true);
    expect(result.imagePrompt).toBeTruthy();
    expect(result.imagePrompt).toContain('automation');
    expect(result.caption).toContain('marketing post');
  });

  it('auto-synthesized prompt asks for literal scene and 1:1 frame', () => {
    const draft = `Short caption about marketing.`;
    const result = parseInstagramDraft(draft);
    expect(result.autoSynthesized).toBe(true);
    expect(result.imagePrompt).toContain('square 1:1');
    expect(result.imagePrompt).toMatch(/photorealistic|polished marketing photograph/i);
  });

  it('prioritizes title/brief over caption when [IMAGE_PROMPT] is missing', () => {
    const draft = `Generic hook line.\n\n#tag`;
    const result = parseInstagramDraft(draft, {
      title: 'Electric scooter launch',
      userBrief: 'Show a red scooter on a city street at dusk',
    });
    expect(result.autoSynthesized).toBe(true);
    expect(result.imagePrompt!.toLowerCase()).toContain('scooter');
  });
});

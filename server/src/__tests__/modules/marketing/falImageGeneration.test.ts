/**
 * Fal AI image helper — resolution mapping (no network).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFalApiKey,
  resolutionToFalImageSize,
  buildFluxFalSubscribeInput,
  mergeFalNegativePromptForRequest,
  resolveFalModelIdForRequest,
  EMAIL_CAMPAIGN_FAL_NEGATIVE_APPEND,
  extractFalResultImageUrl,
  isFluxProFamilyModel,
  downloadFalImageBytes,
} from '../../../services/marketing/publishing/imageService/falImageGeneration.js';

describe('falImageGeneration', () => {
  describe('getFalApiKey', () => {
    type FalEnv = 'FAL_KEY' | 'FAL_AI_API_KEY' | 'FALAI_API_KEY';
    let snapshot: Partial<Record<FalEnv, string | undefined>>;

    beforeEach(() => {
      snapshot = {
        FAL_KEY: process.env.FAL_KEY,
        FAL_AI_API_KEY: process.env.FAL_AI_API_KEY,
        FALAI_API_KEY: process.env.FALAI_API_KEY,
      };
      delete process.env.FAL_KEY;
      delete process.env.FAL_AI_API_KEY;
      delete process.env.FALAI_API_KEY;
    });

    afterEach(() => {
      for (const k of ['FAL_KEY', 'FAL_AI_API_KEY', 'FALAI_API_KEY'] as const) {
        const v = snapshot[k];
        if (v !== undefined) process.env[k] = v;
        else delete process.env[k];
      }
    });

    it('returns FALAI_API_KEY when FAL_KEY and FAL_AI_API_KEY are unset', () => {
      process.env.FALAI_API_KEY = '  fal-from-env  ';
      expect(getFalApiKey()).toBe('fal-from-env');
    });

    it('prefers FAL_KEY then FAL_AI_API_KEY over FALAI_API_KEY', () => {
      process.env.FALAI_API_KEY = 'c';
      process.env.FAL_AI_API_KEY = 'b';
      process.env.FAL_KEY = 'a';
      expect(getFalApiKey()).toBe('a');
      delete process.env.FAL_KEY;
      expect(getFalApiKey()).toBe('b');
      delete process.env.FAL_AI_API_KEY;
      expect(getFalApiKey()).toBe('c');
    });
  });

  describe('resolutionToFalImageSize', () => {
    it('parses WxH into clamped width/height object', () => {
      expect(resolutionToFalImageSize('1024x1024')).toEqual({ width: 1024, height: 1024 });
      expect(resolutionToFalImageSize('1280 x 720')).toEqual({ width: 1280, height: 720 });
    });

    it('clamps dimensions to 512–2048', () => {
      expect(resolutionToFalImageSize('100x100')).toEqual({ width: 512, height: 512 });
      expect(resolutionToFalImageSize('4000x4000')).toEqual({ width: 2048, height: 2048 });
    });

    it('uses square_hd when resolution is not WxH', () => {
      expect(resolutionToFalImageSize('instagram')).toBe('square_hd');
    });
  });

  describe('buildFluxFalSubscribeInput', () => {
    it('includes negative_prompt and guidance for flux model ids', () => {
      const input = buildFluxFalSubscribeInput(
        'fal-ai/flux/dev',
        'A hero banner',
        { width: 1920, height: 1080 },
        { negativePrompt: 'text, ui', guidanceScale: 3.5, numInferenceSteps: 28, seed: 42 },
      );
      expect(input.prompt).toContain('hero banner');
      expect(input.negative_prompt).toBe('text, ui');
      expect(input.guidance_scale).toBe(3.5);
      expect(input.num_inference_steps).toBe(28);
      expect(input.seed).toBe(42);
    });

    it('omits flux-only keys for non-flux model ids', () => {
      const input = buildFluxFalSubscribeInput(
        'some/other-model',
        'prompt',
        'square_hd',
        { negativePrompt: 'bad' },
      );
      expect(input.negative_prompt).toBeUndefined();
    });

    it('uses jpeg + safety_tolerance for Flux Pro (matches Fal API; not enable_safety_checker)', () => {
      const input = buildFluxFalSubscribeInput(
        'fal-ai/flux-pro/v1.1',
        'A feed still',
        { width: 1080, height: 1080 },
        { negativePrompt: 'text' },
      );
      expect(input.output_format).toBe('jpeg');
      expect(input.safety_tolerance).toBe('2');
      expect(input.enable_safety_checker).toBeUndefined();
      expect(input.negative_prompt).toBe('text');
    });

    it('uses PNG for Instagram feed (less aggressive compression than Fal JPEG; flattened in generateImage)', () => {
      const input = buildFluxFalSubscribeInput(
        'fal-ai/flux/dev',
        'x',
        'square_hd',
        {},
        { instagramFeed: true },
      );
      expect(input.output_format).toBe('png');
      expect(input.enable_safety_checker).toBe(true);
    });

    it('uses JPEG for Instagram feed when INSTAGRAM_FAL_OUTPUT_JPEG=1', () => {
      const prev = process.env.INSTAGRAM_FAL_OUTPUT_JPEG;
      process.env.INSTAGRAM_FAL_OUTPUT_JPEG = '1';
      try {
        const input = buildFluxFalSubscribeInput(
          'fal-ai/flux/dev',
          'x',
          'square_hd',
          {},
          { instagramFeed: true },
        );
        expect(input.output_format).toBe('jpeg');
      } finally {
        if (prev === undefined) delete process.env.INSTAGRAM_FAL_OUTPUT_JPEG;
        else process.env.INSTAGRAM_FAL_OUTPUT_JPEG = prev;
      }
    });

    const fluxFamilyCases: Array<{
      name: string;
      modelId: string;
      ctx?: { instagramFeed?: boolean; emailCampaign?: boolean; overlayPaperPlane?: boolean };
      expectFormat: 'jpeg' | 'png';
      expectSafetyTolerance?: boolean;
      expectEnableChecker?: boolean;
    }> = [
      {
        name: 'Flux Dev base',
        modelId: 'fal-ai/flux/dev',
        expectFormat: 'png',
        expectEnableChecker: true,
      },
      {
        name: 'Flux 2 style slug',
        modelId: 'fal-ai/flux-2',
        expectFormat: 'jpeg',
        expectSafetyTolerance: true,
      },
      {
        name: 'Flux Pro + overlay preserves PNG alpha',
        modelId: 'fal-ai/flux-pro/v1.1',
        ctx: { overlayPaperPlane: true },
        expectFormat: 'png',
        expectSafetyTolerance: true,
      },
      {
        name: 'Instagram feed + Flux Pro uses PNG',
        modelId: 'fal-ai/flux-pro/v1.1',
        ctx: { instagramFeed: true },
        expectFormat: 'png',
        expectSafetyTolerance: true,
      },
    ];

    it.each(fluxFamilyCases)(
      'table: $name — output_format $expectFormat',
      ({ modelId, ctx, expectFormat, expectSafetyTolerance, expectEnableChecker }) => {
        const input = buildFluxFalSubscribeInput(modelId, 'prompt', { width: 512, height: 512 }, {}, ctx);
        expect(input.output_format).toBe(expectFormat);
        if (expectSafetyTolerance) expect(input.safety_tolerance).toBe('2');
        if (expectEnableChecker) expect(input.enable_safety_checker).toBe(true);
      },
    );
  });

  describe('isFluxProFamilyModel', () => {
    it('detects flux-pro and flux-2 style ids', () => {
      expect(isFluxProFamilyModel('fal-ai/flux-pro/v1.1')).toBe(true);
      expect(isFluxProFamilyModel('fal-ai/flux-2')).toBe(true);
      expect(isFluxProFamilyModel('fal-ai/flux2/foo')).toBe(true);
      expect(isFluxProFamilyModel('fal-ai/flux/dev')).toBe(false);
    });
  });

  describe('retry input shape (fluxRequestContext)', () => {
    it('minimal rebuild keeps overlayPaperPlane so output_format stays png for overlays', () => {
      const ctx = { overlayPaperPlane: true as const };
      const minimal = buildFluxFalSubscribeInput(
        'fal-ai/flux-pro/v1.1',
        'p',
        { width: 512, height: 512 },
        {},
        ctx,
      );
      expect(minimal.output_format).toBe('png');
      expect(minimal.safety_tolerance).toBe('2');
    });
  });

  describe('downloadFalImageBytes', () => {
    it('decodes base64 data URIs (sync_mode / inline Fal output)', async () => {
      const buf = await downloadFalImageBytes(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      );
      expect(buf.length).toBeGreaterThan(10);
    });
  });

  describe('extractFalResultImageUrl', () => {
    it('reads images[0].url, image.url, and nested output', () => {
      expect(extractFalResultImageUrl({ images: [{ url: 'https://cdn.example/a.png' }] })).toBe(
        'https://cdn.example/a.png',
      );
      expect(extractFalResultImageUrl({ image: { url: 'https://cdn.example/b.png' } })).toBe(
        'https://cdn.example/b.png',
      );
      expect(
        extractFalResultImageUrl({ output: { images: [{ url: 'https://cdn.example/c.png' }] } }),
      ).toBe('https://cdn.example/c.png');
    });
  });

  describe('mergeFalNegativePromptForRequest', () => {
    it('uses Instagram base without generic-people suppression when instagramFeed is true', () => {
      const prev = process.env.FAL_NEGATIVE_PROMPT;
      delete process.env.FAL_NEGATIVE_PROMPT;
      const merged = mergeFalNegativePromptForRequest({ instagramFeed: true });
      expect(merged).toBeDefined();
      expect(merged).toMatch(/deformed hands/);
      expect(merged).not.toMatch(/generic smiling people/);
      expect(merged).toMatch(/no visible subject/);
      if (prev !== undefined) process.env.FAL_NEGATIVE_PROMPT = prev;
      else delete process.env.FAL_NEGATIVE_PROMPT;
    });

    it('prepends Instagram anti-void so Fal 2000-char negative_prompt cannot drop it when FAL_NEGATIVE_PROMPT is huge', () => {
      const prev = process.env.FAL_NEGATIVE_PROMPT;
      process.env.FAL_NEGATIVE_PROMPT = 'x'.repeat(2500);
      const merged = mergeFalNegativePromptForRequest({ instagramFeed: true });
      expect(merged).toBeDefined();
      expect(merged!.startsWith('no visible subject')).toBe(true);
      expect(merged!.slice(0, 2000)).toMatch(/no visible subject/);
      if (prev !== undefined) process.env.FAL_NEGATIVE_PROMPT = prev;
      else delete process.env.FAL_NEGATIVE_PROMPT;
    });

    it('merges technical extra when flag set', () => {
      const prev = process.env.FAL_EMAIL_NEGATIVE_PROMPT;
      process.env.FAL_EMAIL_NEGATIVE_PROMPT = 'extra tech';
      const merged = mergeFalNegativePromptForRequest({
        technicalPlatformTopic: true,
        falNegativePrompt: 'custom',
      });
      expect(merged).toContain('extra tech');
      expect(merged).toContain('custom');
      if (prev !== undefined) process.env.FAL_EMAIL_NEGATIVE_PROMPT = prev;
      else delete process.env.FAL_EMAIL_NEGATIVE_PROMPT;
    });

    it('appends email campaign negative when emailCampaign is true without technicalPlatformTopic', () => {
      const merged = mergeFalNegativePromptForRequest({ emailCampaign: true });
      expect(merged).toBeDefined();
      expect(merged).toContain(EMAIL_CAMPAIGN_FAL_NEGATIVE_APPEND);
      expect(merged).toContain('abstract blur-only hero');
    });

    it('does not append email campaign negative when emailCampaign is unset', () => {
      const merged = mergeFalNegativePromptForRequest({});
      expect(merged).toBeDefined();
      expect(merged).not.toContain('abstract blur-only hero');
    });
  });

  describe('resolveFalModelIdForRequest', () => {
    it('uses FAL_EMAIL_IMAGE_MODEL when email campaign and env set', () => {
      const prevEmail = process.env.FAL_EMAIL_IMAGE_MODEL;
      const prevDef = process.env.FAL_IMAGE_MODEL;
      process.env.FAL_EMAIL_IMAGE_MODEL = 'fal-ai/flux-pro/v1.1';
      delete process.env.FAL_IMAGE_MODEL;
      expect(resolveFalModelIdForRequest({ emailCampaign: true })).toBe('fal-ai/flux-pro/v1.1');
      if (prevEmail !== undefined) process.env.FAL_EMAIL_IMAGE_MODEL = prevEmail;
      else delete process.env.FAL_EMAIL_IMAGE_MODEL;
      if (prevDef !== undefined) process.env.FAL_IMAGE_MODEL = prevDef;
      else delete process.env.FAL_IMAGE_MODEL;
    });

    it('uses FAL_INSTAGRAM_IMAGE_MODEL when instagramFeed and env set', () => {
      const prevIg = process.env.FAL_INSTAGRAM_IMAGE_MODEL;
      const prevDef = process.env.FAL_IMAGE_MODEL;
      process.env.FAL_INSTAGRAM_IMAGE_MODEL = 'fal-ai/flux-pro/v1.1';
      delete process.env.FAL_IMAGE_MODEL;
      expect(resolveFalModelIdForRequest({ instagramFeed: true })).toBe('fal-ai/flux-pro/v1.1');
      if (prevIg !== undefined) process.env.FAL_INSTAGRAM_IMAGE_MODEL = prevIg;
      else delete process.env.FAL_INSTAGRAM_IMAGE_MODEL;
      if (prevDef !== undefined) process.env.FAL_IMAGE_MODEL = prevDef;
      else delete process.env.FAL_IMAGE_MODEL;
    });

    it('defaults Instagram feed to Flux Pro when env model vars are unset', () => {
      const prevIg = process.env.FAL_INSTAGRAM_IMAGE_MODEL;
      const prevDef = process.env.FAL_IMAGE_MODEL;
      delete process.env.FAL_INSTAGRAM_IMAGE_MODEL;
      delete process.env.FAL_IMAGE_MODEL;
      expect(resolveFalModelIdForRequest({ instagramFeed: true })).toBe('fal-ai/flux-pro/v1.1');
      if (prevIg !== undefined) process.env.FAL_INSTAGRAM_IMAGE_MODEL = prevIg;
      else delete process.env.FAL_INSTAGRAM_IMAGE_MODEL;
      if (prevDef !== undefined) process.env.FAL_IMAGE_MODEL = prevDef;
      else delete process.env.FAL_IMAGE_MODEL;
    });

    it('uses FAL_OVERLAY_IMAGE_MODEL when overlayPaperPlane and env set', () => {
      const prevO = process.env.FAL_OVERLAY_IMAGE_MODEL;
      const prevDef = process.env.FAL_IMAGE_MODEL;
      process.env.FAL_OVERLAY_IMAGE_MODEL = 'fal-ai/flux/dev';
      process.env.FAL_IMAGE_MODEL = 'fal-ai/flux/schnell';
      expect(resolveFalModelIdForRequest({ overlayPaperPlane: true })).toBe('fal-ai/flux/dev');
      if (prevO !== undefined) process.env.FAL_OVERLAY_IMAGE_MODEL = prevO;
      else delete process.env.FAL_OVERLAY_IMAGE_MODEL;
      if (prevDef !== undefined) process.env.FAL_IMAGE_MODEL = prevDef;
      else delete process.env.FAL_IMAGE_MODEL;
    });

    it('falls back to FAL_IMAGE_MODEL when overlayPaperPlane and FAL_OVERLAY_IMAGE_MODEL unset', () => {
      const prevO = process.env.FAL_OVERLAY_IMAGE_MODEL;
      const prevDef = process.env.FAL_IMAGE_MODEL;
      delete process.env.FAL_OVERLAY_IMAGE_MODEL;
      process.env.FAL_IMAGE_MODEL = 'fal-ai/flux/schnell';
      expect(resolveFalModelIdForRequest({ overlayPaperPlane: true })).toBe('fal-ai/flux/schnell');
      if (prevO !== undefined) process.env.FAL_OVERLAY_IMAGE_MODEL = prevO;
      else delete process.env.FAL_OVERLAY_IMAGE_MODEL;
      if (prevDef !== undefined) process.env.FAL_IMAGE_MODEL = prevDef;
      else delete process.env.FAL_IMAGE_MODEL;
    });
  });
});

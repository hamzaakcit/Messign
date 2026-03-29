import { describe, it, expect } from 'vitest';
import {
  buildKontextFalSubscribeInput,
  isRetryableFalKontextError,
  resolveFalImageEditModelId,
  resolveKontextOutputFormat,
  resolveKontextEnhancePrompt,
} from '../../../services/marketing/publishing/imageService/falKontextEdit.js';
describe('falKontextEdit', () => {
  it('buildKontextFalSubscribeInput maps image_url and prompt', () => {
    const input = buildKontextFalSubscribeInput('https://example.com/a.jpg', 'Add a paper plane in the sky', {
      guidanceScale: 3.5,
      enhancePrompt: true,
      aspectRatio: '16:9',
      numInferenceSteps: 32,
    });
    expect(input.image_url).toBe('https://example.com/a.jpg');
    expect(input.prompt).toContain('paper plane');
    expect(input.num_images).toBe(1);
    expect(input.output_format).toBe(resolveKontextOutputFormat());
    expect(input.guidance_scale).toBe(3.5);
    expect(input.safety_tolerance).toBe('2');
    expect(input.enhance_prompt).toBe(true);
    expect(input.aspect_ratio).toBe('16:9');
    expect(input.num_inference_steps).toBe(32);
    expect(input).not.toHaveProperty('enable_safety_checker');
  });

  it('defaults guidance_scale to 3 when env and options unset', () => {
    const prev = process.env.FAL_KONTEXT_GUIDANCE_SCALE;
    delete process.env.FAL_KONTEXT_GUIDANCE_SCALE;
    const input = buildKontextFalSubscribeInput('https://example.com/a.jpg', 'Edit prompt');
    expect(input.guidance_scale).toBe(3);
    if (prev === undefined) delete process.env.FAL_KONTEXT_GUIDANCE_SCALE;
    else process.env.FAL_KONTEXT_GUIDANCE_SCALE = prev;
  });

  it('resolveKontextEnhancePrompt follows FAL_KONTEXT_ENHANCE_PROMPT', () => {
    const prev = process.env.FAL_KONTEXT_ENHANCE_PROMPT;
    delete process.env.FAL_KONTEXT_ENHANCE_PROMPT;
    expect(resolveKontextEnhancePrompt()).toBe(false);
    process.env.FAL_KONTEXT_ENHANCE_PROMPT = '1';
    expect(resolveKontextEnhancePrompt()).toBe(true);
    if (prev === undefined) delete process.env.FAL_KONTEXT_ENHANCE_PROMPT;
    else process.env.FAL_KONTEXT_ENHANCE_PROMPT = prev;
  });

  it('resolveFalImageEditModelId returns default when env unset', () => {
    expect(resolveFalImageEditModelId()).toMatch(/flux/);
  });

  it('isRetryableFalKontextError detects gateway and transient errors', () => {
    expect(isRetryableFalKontextError('Gateway Timeout')).toBe(true);
    expect(isRetryableFalKontextError('503 Service Unavailable')).toBe(true);
    expect(isRetryableFalKontextError('validation failed')).toBe(false);
  });

  const kontextShapeCases: Array<{
    name: string;
    image: string;
    prompt: string;
    options?: Parameters<typeof buildKontextFalSubscribeInput>[2];
    expectKeys: string[];
  }> = [
    {
      name: 'HTTPS reference',
      image: 'https://example.com/ref.jpg',
      prompt: 'Add lighting',
      expectKeys: ['image_url', 'prompt', 'output_format', 'safety_tolerance', 'guidance_scale'],
    },
    {
      name: 'with steps override',
      image: 'https://x/y.png',
      prompt: 'x'.repeat(20),
      options: { numInferenceSteps: 24 },
      expectKeys: ['num_inference_steps'],
    },
  ];

  it.each(kontextShapeCases)('Kontext input shape: $name', ({ image, prompt, options, expectKeys }) => {
    const input = buildKontextFalSubscribeInput(image, prompt, options);
    for (const k of expectKeys) {
      expect(input).toHaveProperty(k);
    }
  });
});

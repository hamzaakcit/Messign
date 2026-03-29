/**
 * Marketing image generation — LiteLLM vs direct Gemini routing (mocked fetch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('generateImage', () => {
  const origEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...origEnv };
    process.env.LITELLM_MASTER_KEY = '';
    process.env.OPENAI_API_KEY = '';
    process.env.VERTEX_AI_PROJECT = '';
    process.env.GOOGLE_CLOUD_PROJECT = '';
    process.env.VERTEX_AI_ACCESS_TOKEN = '';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '';
    process.env.GEMINI_IMAGE_GEN_MODEL = '';
    process.env.GEMINI_VERTEX_IMAGE_MODEL = '';
    process.env.IMAGE_GEN_DISABLE_FAL = '';
    process.env.GEMINI_AIPLATFORM_API_KEY = '';
    process.env.GOOGLE_CLOUD_API_KEY = '';
    process.env.IMAGE_GEN_DEV_FALLBACK = '0';
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';
    process.env.FAL_KEY = '';
    process.env.FAL_AI_API_KEY = '';
    process.env.FALAI_API_KEY = '';
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    process.env = origEnv;
    vi.unstubAllGlobals();
  });

  it('calls Gemini native generateContent when LiteLLM key is unset', async () => {
    // Valid PNG signature + padding — validateRasterImageBuffer requires ≥12 bytes
    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: pngBody.toString('base64') } }],
            },
          },
        ],
      }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.image_url).toContain('storage.mock.local');
    expect(result.metadata?.model).toMatch(/^direct\//);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('generateContent');
    expect(url).toMatch(/gemini-2\.0-flash-preview-image-generation/);
    expect(url).not.toMatch(/[?&]key=/);
    const hdrs = init.headers as Record<string, string>;
    expect(hdrs['X-goog-api-key']).toBe('test-gemini-key');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    /** First attempt uses IMAGE-only; TEXT+IMAGE is fallback when modality errors occur. */
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(body.generationConfig.temperature).toBe(0.25);
    expect(body.systemInstruction?.parts?.[0]?.text).toMatch(/Do NOT output JSON/i);
    expect(body.contents?.[0]?.parts?.[0]?.text).toBe('A minimal SaaS hero image for Instagram');
  });

  it('returns dev placehold.co URL when IMAGE_GEN_DEV_FALLBACK is true (no provider calls)', async () => {
    process.env.IMAGE_GEN_DEV_FALLBACK = 'true';
    process.env.GOOGLE_GEMINI_API_KEY = 'should-not-be-used';

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toBe('dev-fallback');
    expect(result.image_url).toMatch(/placehold\.co.*text=/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses OpenAI when GOOGLE_GEMINI_API_KEY is unset (Gemini-first has nothing to call)', async () => {
    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    const b64 = pngBody.toString('base64');
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.GOOGLE_GEMINI_API_KEY = '';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ data: [{ b64_json: b64 }] }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toBe('openai/dall-e-3');
    const [openAiUrl] = fetchMock.mock.calls[0] as [string];
    expect(openAiUrl).toBe('https://api.openai.com/v1/images/generations');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, openAiInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const openAiBody = JSON.parse(openAiInit.body as string) as { quality?: string; model?: string };
    expect(openAiBody.model).toBe('dall-e-3');
    expect(openAiBody.quality).toBe('hd');
  });

  it('uses global aiplatform.googleapis.com ?key= before other Gemini paths when set', async () => {
    process.env.GEMINI_AIPLATFORM_API_KEY = 'test-gcp-api-key';
    process.env.VERTEX_AI_PROJECT = 'other-project';
    process.env.VERTEX_AI_ACCESS_TOKEN = 'would-be-used-if-global-failed';
    process.env.GEMINI_IMAGE_GEN_MODEL = 'gemini-2.0-flash-preview-image-generation';

    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: pngBody.toString('base64') } }],
            },
          },
        ],
      }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toMatch(/^aiplatform\//);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('aiplatform.googleapis.com/v1/publishers/google/models');
    expect(url).toContain('key=test-gcp-api-key');
    expect(url).not.toContain('other-project');
  });

  it('uses Vertex Gemini before AI Studio when VERTEX_AI_PROJECT and token are set', async () => {
    process.env.VERTEX_AI_PROJECT = 'test-gcp-project';
    process.env.VERTEX_AI_ACCESS_TOKEN = 'fake-vertex-bearer';
    process.env.GEMINI_IMAGE_GEN_MODEL = 'gemini-2.0-flash-preview-image-generation';

    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: pngBody.toString('base64') } }],
            },
          },
        ],
      }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toMatch(/^vertex\//);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('aiplatform.googleapis.com');
    expect(url).toContain('test-gcp-project');
    expect(url).toContain('publishers/google/models');
    const hdrs = init.headers as Record<string, string>;
    expect(hdrs.Authorization).toBe('Bearer fake-vertex-bearer');
  });

  it('uses Gemini before OpenAI when both keys are set and Fal is not configured', async () => {
    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: pngBody.toString('base64') } }],
            },
          },
        ],
      }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toMatch(/^direct\//);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('api.openai.com');
  });

  it('skips LiteLLM when IMAGE_GEN_OPENAI_GEMINI_ONLY=1 even if LITELLM_MASTER_KEY is set', async () => {
    process.env.LITELLM_MASTER_KEY = 'sk-litellm';
    process.env.IMAGE_GEN_OPENAI_GEMINI_ONLY = '1';
    process.env.OPENAI_API_KEY = '';

    const pngBody = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: pngBody.toString('base64') } }],
            },
          },
        ],
      }),
    });

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A minimal SaaS hero image for Instagram',
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.model).toMatch(/^direct\//);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('localhost:4000');
  });

  it('instagram_fal_only does not call Gemini when Fal fails', async () => {
    process.env.FAL_KEY = 'fal-test-key';
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';

    vi.resetModules();
    const falMod = await import('../../../services/marketing/publishing/imageService/falImageGeneration.js');
    vi.spyOn(falMod, 'callFalMarketingImageGeneration').mockRejectedValue(new Error('Fal down'));

    const { generateImage } = await import('../../../services/marketing/publishing/imageService.js');
    const result = await generateImage({
      org_id: '00000000-0000-0000-0000-000000000001',
      content_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      prompt: 'A red paper plane',
      instagram_feed: true,
      instagram_fal_only: true,
    });

    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/Instagram Fal-only image generation failed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

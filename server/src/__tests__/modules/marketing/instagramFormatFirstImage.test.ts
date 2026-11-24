import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../dal/marketing/content.js', () => ({
  getContentById: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock('../../../services/marketing/publishing/imageService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/marketing/publishing/imageService.js')>();
  return {
    ...actual,
    generateImage: vi.fn(),
    resolveStockImageUrl: vi.fn(() => null),
    editMarketingPhotoWithKontext: vi.fn(),
  };
});

import * as contentDal from '../../../dal/marketing/content.js';
import { generateImage } from '../../../services/marketing/publishing/imageService.js';
import { runInstagramImageGeneration } from '../../../services/marketing/workflows/instagramImagePipeline.js';

const caller = { userId: 'user-1', role: 'admin' as const, organizationId: 'org-1' };
const draft = `[IMAGE_PROMPT]
A bookstore window at dusk, warm light on the new novel
[/IMAGE_PROMPT]

Tonight's new arrival.`;

describe('runInstagramImageGeneration format', () => {
  beforeEach(() => {
    vi.mocked(contentDal.updateContent).mockReset();
    vi.mocked(contentDal.updateContent).mockResolvedValue(undefined as never);
    vi.mocked(contentDal.getContentById).mockReset();
    vi.mocked(generateImage).mockReset();
    vi.mocked(generateImage).mockResolvedValue({
      success: true,
      image_url: 'https://cdn.example/still.png',
      storage_key: 'still',
      metadata: {
        model: 'test',
        resolution: '1080x1080',
        retries: 0,
        generated_at: '2026-11-12T00:00:00.000Z',
        duration_ms: 1,
      },
    });
  });

  it('uses 9:16 for a saved story and 1:1 for a saved feed', async () => {
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      tags: ['ig_format:story'],
      reference_image_url: null,
    } as never);

    await runInstagramImageGeneration({
      orgId: 'org-1',
      contentId: 'content-story',
      rawDraft: draft,
      caller,
    });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect_ratio: '9:16',
        resolution: '1080x1920',
      }),
    );
    expect(vi.mocked(generateImage).mock.calls[0]?.[0].prompt).toContain('9:16');

    vi.mocked(generateImage).mockClear();
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      tags: ['ig_format:feed'],
      reference_image_url: null,
    } as never);

    await runInstagramImageGeneration({
      orgId: 'org-1',
      contentId: 'content-feed',
      rawDraft: draft,
      caller,
    });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect_ratio: '1:1',
        resolution: '1080x1080',
      }),
    );
  });

  it('returns a placeholder and skips the provider when the draft is tagged mock', async () => {
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      tags: ['ig_format:feed', 'image_gen:mock'],
      reference_image_url: null,
    } as never);

    const result = await runInstagramImageGeneration({
      orgId: 'org-1',
      contentId: 'content-mock',
      rawDraft: draft,
      caller,
    });

    expect(generateImage).not.toHaveBeenCalled();
    expect(result.imageUrl).toMatch(/placehold\.co/);
  });

  it('lets an explicit regenerate ratio override the saved story tag', async () => {
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      tags: ['ig_format:story'],
      reference_image_url: null,
    } as never);

    await runInstagramImageGeneration({
      orgId: 'org-1',
      contentId: 'content-story',
      rawDraft: draft,
      caller,
      aspectRatio: '1:1',
    });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect_ratio: '1:1',
        resolution: '1080x1080',
      }),
    );
  });

  it('does not save a feed still when the stubbed Fal prompt drops the place', async () => {
    const sheet = [
      'Window drop',
      '',
      'product: Kürk Mantolu Madonna',
      'place: Karaköy kitapçı vitrini',
      'price: ₺189',
    ].join('\n');
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      tags: ['ig_format:feed'],
      user_brief: sheet,
      reference_image_url: null,
    } as never);
    vi.mocked(generateImage).mockResolvedValue({
      success: true,
      image_url: 'https://cdn.example/still.png',
      storage_key: 'still',
      metadata: {
        model: 'fal/fal-ai/flux-pro/v1.1',
        resolution: '1080x1080',
        retries: 0,
        generated_at: '2026-11-13T00:00:00.000Z',
        duration_ms: 1,
        fal_returned_prompt: 'Photorealistic photograph of Kürk Mantolu Madonna.',
        fal_aspect_ratio: '1:1',
      },
    });

    const result = await runInstagramImageGeneration({
      orgId: 'org-1',
      contentId: 'content-feed',
      rawDraft: `[IMAGE_PROMPT]\nA window\n[/IMAGE_PROMPT]\n\nKürk Mantolu Madonna, ₺189. Link in bio`,
      caller,
      intentContext: { userBrief: sheet },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('place:');
    const saved = vi.mocked(contentDal.updateContent).mock.calls.some((call) => 'image_url' in (call[2] ?? {}));
    expect(saved).toBe(false);
  });
});

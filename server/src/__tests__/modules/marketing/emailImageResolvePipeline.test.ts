import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageGenerationResult } from '../../../dal/marketing/instagramTypes.js';

const mockGenerateImage = vi.fn();

vi.mock('../../../services/marketing/publishing/imageService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/marketing/publishing/imageService.js')>();
  return {
    ...actual,
    generateImage: (...args: Parameters<typeof actual.generateImage>) => mockGenerateImage(...args),
  };
});

import { runEmailImageResolvePipeline } from '../../../services/marketing/emailImageResolvePipeline.js';

function successGen(url: string): ImageGenerationResult {
  return {
    success: true,
    image_url: url,
    storage_key: null,
    metadata: {
      model: 'test-mock',
      resolution: '1920x1080',
      retries: 0,
      generated_at: new Date().toISOString(),
      duration_ms: 1,
    },
  };
}

describe('runEmailImageResolvePipeline regenerate', () => {
  beforeEach(() => {
    mockGenerateImage.mockReset();
    mockGenerateImage.mockResolvedValue(successGen('https://example.com/regenerated.png'));
  });

  it('skips sections that already have imageUrl when no regenerate options', async () => {
    const { responseBody } = await runEmailImageResolvePipeline({
      orgId: 'org-1',
      contentId: 'c-1',
      manifest: {
        subject: 'Test subject line for email',
        sections: [
          {
            type: 'hero',
            order: 1,
            content: {
              imageUrl: 'https://cdn.example.com/existing.png',
              imagePrompt: 'A detailed hero photograph for marketing email testing purposes',
              headline: 'Welcome',
            },
          },
        ],
      },
    });
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(responseBody.images).toEqual({});
    expect((responseBody.sectionResults as Record<number, { status: string }>)[1]?.status).toBe('skipped');
  });

  it('regenerates a section when regenerate_section_orders includes that order despite imageUrl', async () => {
    const { responseBody } = await runEmailImageResolvePipeline({
      orgId: 'org-1',
      contentId: 'c-1',
      manifest: {
        subject: 'Test subject line for email',
        sections: [
          {
            type: 'hero',
            order: 1,
            content: {
              imageUrl: 'https://cdn.example.com/existing.png',
              imagePrompt: 'A detailed hero photograph for marketing email testing purposes',
              headline: 'Welcome',
            },
          },
        ],
      },
      regenerate: { regenerate_section_orders: [1] },
    });
    expect(mockGenerateImage).toHaveBeenCalled();
    expect((responseBody.images as Record<number, string>)[1]).toBe('https://example.com/regenerated.png');
    expect((responseBody.sectionResults as Record<number, { status: string }>)[1]?.status).toBe('generated');
  });

  it('regenerates product_grid item when regenerate_item_keys matches despite imageUrl', async () => {
    const { responseBody } = await runEmailImageResolvePipeline({
      orgId: 'org-1',
      contentId: 'c-1',
      manifest: {
        subject: 'Test subject line for email',
        sections: [
          {
            type: 'product_grid',
            order: 2,
            content: {
              items: [
                {
                  name: 'Widget',
                  imagePrompt: 'sleek widget product shot',
                  imageUrl: 'https://cdn.example.com/p0.png',
                },
              ],
            },
          },
        ],
      },
      regenerate: { regenerate_item_keys: ['2:0'] },
    });
    expect(mockGenerateImage).toHaveBeenCalled();
    expect((responseBody.itemImages as Record<string, string>)['2:0']).toBe('https://example.com/regenerated.png');
  });

  it('uses section_prompt_overrides when regenerating', async () => {
    const { responseBody } = await runEmailImageResolvePipeline({
      orgId: 'org-1',
      contentId: 'c-1',
      manifest: {
        subject: 'Test subject line for email',
        sections: [
          {
            type: 'hero',
            order: 1,
            content: {
              imageUrl: 'https://cdn.example.com/existing.png',
              imagePrompt: 'A detailed hero photograph for marketing email testing purposes',
              headline: 'Welcome',
            },
          },
        ],
      },
      regenerate: {
        regenerate_section_orders: [1],
        section_prompt_overrides: { '1': 'Override prompt text that is long enough for validation rules here' },
      },
    });
    expect(mockGenerateImage).toHaveBeenCalled();
    const firstCall = mockGenerateImage.mock.calls[0]?.[0] as { prompt: string };
    expect(firstCall.prompt).toContain('Override prompt text');
    expect((responseBody.images as Record<number, string>)[1]).toBe('https://example.com/regenerated.png');
  });
});

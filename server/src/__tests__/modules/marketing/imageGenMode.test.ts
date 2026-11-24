import { describe, expect, it } from 'vitest';
import {
  imageGenerationIsMock,
  localMarketingImageUrl,
  mockImageUrl,
  shouldUseMockImage,
  tagsRequestMockImage,
  tagsWithoutMockImage,
} from '../../../services/marketing/imageGenMode.js';

describe('image generation mock', () => {
  it('mocks when the request or IMAGE_GEN_MODE asks, and stays live when the mode is live', () => {
    const previous = process.env.IMAGE_GEN_MODE;
    delete process.env.IMAGE_GEN_MODE;
    expect(imageGenerationIsMock()).toBe(false);
    expect(imageGenerationIsMock(true)).toBe(true);
    process.env.IMAGE_GEN_MODE = 'mock';
    expect(imageGenerationIsMock()).toBe(true);
    process.env.IMAGE_GEN_MODE = 'live';
    expect(imageGenerationIsMock()).toBe(false);
    expect(imageGenerationIsMock(true)).toBe(true);
    if (previous == null) delete process.env.IMAGE_GEN_MODE;
    else process.env.IMAGE_GEN_MODE = previous;
  });

  it('reads the mock tag and builds a placeholder without a network call', () => {
    expect(tagsRequestMockImage(['image_gen:mock'])).toBe(true);
    expect(tagsRequestMockImage(['ig_format:feed'])).toBe(false);
    expect(mockImageUrl('Shop window')).toMatch(/placehold\.co/);
    expect(localMarketingImageUrl('/uploads/marketing/org/reference/lucy_1.webp')).toBe(
      '/uploads/marketing/org/reference/lucy_1.webp',
    );
    expect(localMarketingImageUrl('https://cdn.example.com/a.jpg')).toBeNull();
    expect(localMarketingImageUrl('/uploads/../secret')).toBeNull();
  });

  it('lets an explicit regenerate choice override the saved mock tag', () => {
    expect(shouldUseMockImage({ tags: ['image_gen:mock'] })).toBe(true);
    expect(shouldUseMockImage({ requestMock: false, tags: ['image_gen:mock'] })).toBe(false);
    expect(shouldUseMockImage({ requestMock: true, tags: [] })).toBe(true);
    expect(tagsWithoutMockImage(['ig_format:feed', 'image_gen:mock'])).toEqual(['ig_format:feed']);
  });
});
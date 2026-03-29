import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isInstagramImageFalOnlyFromEnv,
  isInstagramFalDirectPromptFromEnv,
  buildInstagramFeedT2iPrompt,
} from '../../../services/marketing/workflows/instagramFeedT2i.js';

describe('instagramFeedT2i', () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  describe('isInstagramImageFalOnlyFromEnv', () => {
    it('returns true when INSTAGRAM_IMAGE_FAL_ONLY is unset', () => {
      delete process.env.INSTAGRAM_IMAGE_FAL_ONLY;
      expect(isInstagramImageFalOnlyFromEnv()).toBe(true);
    });

    it('returns false when INSTAGRAM_IMAGE_FAL_ONLY is 0 or false', () => {
      process.env.INSTAGRAM_IMAGE_FAL_ONLY = '0';
      expect(isInstagramImageFalOnlyFromEnv()).toBe(false);
      process.env.INSTAGRAM_IMAGE_FAL_ONLY = 'false';
      expect(isInstagramImageFalOnlyFromEnv()).toBe(false);
    });
  });

  describe('isInstagramFalDirectPromptFromEnv', () => {
    it('returns true when INSTAGRAM_FAL_DIRECT_PROMPT is unset', () => {
      delete process.env.INSTAGRAM_FAL_DIRECT_PROMPT;
      expect(isInstagramFalDirectPromptFromEnv()).toBe(true);
    });

    it('returns false when INSTAGRAM_FAL_DIRECT_PROMPT is 0', () => {
      process.env.INSTAGRAM_FAL_DIRECT_PROMPT = '0';
      expect(isInstagramFalDirectPromptFromEnv()).toBe(false);
    });
  });

  describe('buildInstagramFeedT2iPrompt', () => {
    beforeEach(() => {
      delete process.env.INSTAGRAM_FAL_DIRECT_PROMPT;
    });

    it('uses direct prompt when direct env default (on)', () => {
      const out = buildInstagramFeedT2iPrompt(
        "Planner: ignore\nA red kite in blue sky",
        'photoreal',
        { userBrief: 'User wants a beach sunset' },
      );
      expect(out.instagram_direct_prompt).toBe(true);
      expect(out.prompt).toContain('beach sunset');
      expect(out.prompt).not.toContain('Planner:');
    });

    it('uses enhanceImagePrompt when INSTAGRAM_FAL_DIRECT_PROMPT=0', () => {
      process.env.INSTAGRAM_FAL_DIRECT_PROMPT = '0';
      const out = buildInstagramFeedT2iPrompt('A coffee cup on marble', 'photoreal', undefined);
      expect(out.instagram_direct_prompt).toBe(false);
      expect(out.prompt).toContain('PRIMARY SUBJECT');
      expect(out.prompt).toContain('coffee cup');
    });
  });
});

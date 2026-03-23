/**
 * Parser for Gemini 3 Flash tool-style text (dalle.text2im) — see imageService.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  extractDalleStylePromptFromGeminiText,
  shouldOpenAiFastPathAfterGeminiNoImage,
} from '../../../services/marketing/publishing/imageService.js';

describe('extractDalleStylePromptFromGeminiText', () => {
  it('parses nested action_input JSON', () => {
    const outer = JSON.stringify({
      action: 'dalle.text2im',
      action_input: JSON.stringify({ prompt: 'A paper plane over water', size: '1024x1024' }),
    });
    expect(extractDalleStylePromptFromGeminiText(outer)).toBe('A paper plane over water');
  });

  it('returns null for empty input', () => {
    expect(extractDalleStylePromptFromGeminiText('')).toBeNull();
    expect(extractDalleStylePromptFromGeminiText('   ')).toBeNull();
  });
});

describe('shouldOpenAiFastPathAfterGeminiNoImage', () => {
  it('is true when finishReason is NO_IMAGE', () => {
    expect(
      shouldOpenAiFastPathAfterGeminiNoImage(
        { candidates: [{ finishReason: 'NO_IMAGE', content: { parts: [] } }] },
        '',
      ),
    ).toBe(true);
  });

  it('is true for dalle.text2im tool text', () => {
    const outer = JSON.stringify({
      action: 'dalle.text2im',
      action_input: JSON.stringify({ prompt: 'A paper plane', size: '1024x1024' }),
    });
    expect(shouldOpenAiFastPathAfterGeminiNoImage({}, outer)).toBe(true);
  });

  it('is false for unrelated text without NO_IMAGE', () => {
    expect(shouldOpenAiFastPathAfterGeminiNoImage({}, 'Hello world')).toBe(false);
  });
});

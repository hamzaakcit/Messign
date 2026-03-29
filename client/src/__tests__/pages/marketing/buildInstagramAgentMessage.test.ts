import { describe, it, expect } from 'vitest';
import {
  buildInstagramAgentMessage,
  validateInstagramAgentForm,
  MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH,
  MIN_INSTAGRAM_IMAGE_DESCRIPTION_WITH_REFERENCE_LENGTH,
} from '@/pages/marketing/lib/buildInstagramAgentMessage';

describe('buildInstagramAgentMessage', () => {
  it('includes topic, IMAGE_PROMPT block, and hero description', () => {
    const msg = buildInstagramAgentMessage({
      topic: 'Summer sale',
      heroImageDescription: 'Bright storefront window with sale signage, morning light, cheerful mood',
      format: 'feed',
    });
    expect(msg).toContain('Draft an Instagram post about: Summer sale');
    expect(msg).toContain('[IMAGE_PROMPT]');
    expect(msg).toContain('[/IMAGE_PROMPT]');
    expect(msg).toContain('Bright storefront window');
    expect(msg).toContain('Square 1:1');
  });

  it('adds tone line when tone is set', () => {
    const msg = buildInstagramAgentMessage({
      topic: 'Launch',
      heroImageDescription: 'Product hero shot on neutral background, soft shadows',
      tone: 'playful',
      format: 'feed',
    });
    expect(msg).toContain('Tone preference for the caption: playful');
  });

  it('uses vertical guidance for story format', () => {
    const msg = buildInstagramAgentMessage({
      topic: 'Event',
      heroImageDescription: 'Crowd at conference hall stage lighting purple ambient',
      format: 'story',
    });
    expect(msg).toContain('Vertical 9:16');
  });

  it('defaults format to feed', () => {
    const msg = buildInstagramAgentMessage({
      topic: 'T',
      heroImageDescription: '1234567890',
    });
    expect(msg).toContain('Square 1:1');
  });

  it('prepends REFERENCE_IMAGE_URL when a reference is set', () => {
    const msg = buildInstagramAgentMessage({
      topic: 'Launch',
      heroImageDescription: '1234567890',
      referenceImageUrl: 'https://cdn.example.com/ref.jpg',
      format: 'feed',
    });
    expect(msg).toContain('[REFERENCE_IMAGE_URL]');
    expect(msg).toContain('https://cdn.example.com/ref.jpg');
    expect(msg).toContain('[/REFERENCE_IMAGE_URL]');
    expect(msg).toContain('[IMAGE_PROMPT]');
  });
});

describe('validateInstagramAgentForm', () => {
  it('returns errors for empty topic or short image description', () => {
    const e1 = validateInstagramAgentForm({
      topic: '',
      heroImageDescription: 'short',
    });
    expect(e1.topic).toBeDefined();
    expect(e1.heroImageDescription).toContain(String(MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH));

    const e2 = validateInstagramAgentForm({
      topic: 'OK',
      heroImageDescription: 'x'.repeat(MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH),
    });
    expect(Object.keys(e2).length).toBe(0);
  });

  it('allows shorter hero text when a reference image URL is set', () => {
    const ok = validateInstagramAgentForm({
      topic: 'OK',
      heroImageDescription: 'x'.repeat(MIN_INSTAGRAM_IMAGE_DESCRIPTION_WITH_REFERENCE_LENGTH),
      referenceImageUrl: 'https://example.com/a.jpg',
    });
    expect(Object.keys(ok).length).toBe(0);
  });
});

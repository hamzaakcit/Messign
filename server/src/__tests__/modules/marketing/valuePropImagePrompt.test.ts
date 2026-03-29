import { describe, it, expect } from 'vitest';
import { buildValuePropItemImagePrompt } from '../../../services/marketing/publishing/imageService/valuePropImagePrompt.js';

describe('buildValuePropItemImagePrompt', () => {
  it('anchors on subject and preheader when heading is generic', () => {
    const p = buildValuePropItemImagePrompt(
      { heading: 'Why it matters', description: 'Reach customers faster' },
      {
        subject: 'Unlock the Power of A2P SMS Messaging',
        preheader: 'Learn how A2P SMS can help you reach customers',
      },
    );
    expect(p).toContain('A2P SMS');
    expect(p).toContain('Why it matters');
    expect(p.toLowerCase()).toContain('no cartoon');
  });

  it('returns explicit imagePrompt when long enough', () => {
    const long = 'Custom hero visual for our API with blue gradient';
    expect(buildValuePropItemImagePrompt({ imagePrompt: long, heading: 'X' }, {})).toBe(long);
  });
});

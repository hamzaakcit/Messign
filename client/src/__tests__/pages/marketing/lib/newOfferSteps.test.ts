import { describe, expect, it } from 'vitest';
import { offerIntent, offerSteps } from '@/pages/marketing/lib/newOfferSteps';

describe('offerSteps', () => {
  it('has five steps with a picture and four without', () => {
    expect(offerSteps(true)).toEqual(['Product', 'Picture', 'Words', 'Preview', 'Looks good']);
    expect(offerSteps(false)).toEqual(['Product', 'Words', 'Preview', 'Looks good']);
  });
});

describe('offerIntent', () => {
  it('is the topic, the direction and the tone, each on its own line, with empty ones left out', () => {
    expect(offerIntent({ topic: ' Window drop ', direction: ' Say it softly ', tone: ' warm ' })).toBe('Window drop\nSay it softly\nTone: warm');
    expect(offerIntent({ topic: 'Window drop', direction: '', tone: '' })).toBe('Window drop');
    expect(offerIntent({ topic: 'Window drop', direction: '', tone: 'warm' })).toBe('Window drop\nTone: warm');
  });
});

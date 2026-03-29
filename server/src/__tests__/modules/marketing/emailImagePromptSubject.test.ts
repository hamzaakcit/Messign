import { describe, it, expect } from 'vitest';
import {
  emailCampaignCopySuggestsTechnicalPlatformImagery,
  emailImagePromptExplicitlyRequestsPeople,
} from '../../../services/marketing/publishing/imageService/emailImagePromptSubject.js';

describe('emailImagePromptExplicitlyRequestsPeople', () => {
  it('returns true for explicit people / portrait language', () => {
    expect(emailImagePromptExplicitlyRequestsPeople('Portrait of a woman in an office, soft light')).toBe(true);
    expect(emailImagePromptExplicitlyRequestsPeople('Diverse team meeting in a glass conference room')).toBe(true);
    expect(emailImagePromptExplicitlyRequestsPeople('Software engineer at dual monitors reviewing code')).toBe(true);
    expect(emailImagePromptExplicitlyRequestsPeople('[STOCK] people collaboration office')).toBe(true);
  });

  it('returns false for object, environment, and abstract UI scenes', () => {
    expect(emailImagePromptExplicitlyRequestsPeople('Macro of smartphone on desk, blurred notification UI, no people')).toBe(
      false,
    );
    expect(
      emailImagePromptExplicitlyRequestsPeople('Minimal product shot of ceramic mug on marble, morning sidelight'),
    ).toBe(false);
    expect(emailImagePromptExplicitlyRequestsPeople('City skyline at dusk, long exposure, no human figures')).toBe(false);
    expect(emailImagePromptExplicitlyRequestsPeople('Abstract gradient mesh background for email hero')).toBe(false);
  });
});

describe('emailCampaignCopySuggestsTechnicalPlatformImagery', () => {
  it('returns true for A2P / messaging platform copy', () => {
    expect(emailCampaignCopySuggestsTechnicalPlatformImagery('A2P SMS compliance and deliverability')).toBe(true);
  });

  it('returns false for generic retail promo copy', () => {
    expect(emailCampaignCopySuggestsTechnicalPlatformImagery('summer sale')).toBe(false);
  });
});

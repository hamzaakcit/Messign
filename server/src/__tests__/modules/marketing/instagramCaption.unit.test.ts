/**
 * Only the Instagram caption may be posted. The draft body also holds the draft label, A/B notes and review notes;
 * those must never reach the public post.
 */
import { describe, expect, it } from 'vitest';
import { instagramCaptionFromBody } from '../../../services/marketing/publishing/adapters/instagramAdapter.js';

const DRAFT = `[DRAFT — Pending Review] This has not been published.

**Caption**

Your inbox has 12 tabs open. Ours has one runway. ✈️

Something is about to take flight.

Messign is coming soon.

Follow along and turn on post notifications so you're first to see it land. 🔔

#Messign #ComingSoon #ProductLaunch #AI

**A/B hook variation**
- B: "The future of messaging doesn't knock. It flies in. ✈️"

**Notes for review**
- **Product truth:** I couldn't find verified material describing Messign as an omnichannel platform. Please confirm before this goes live.
- **Scheduling:** This is a draft for review only.`;

describe('instagramCaptionFromBody', () => {
  it('keeps the caption and hashtags and drops the draft label and review notes', () => {
    const caption = instagramCaptionFromBody(DRAFT);
    expect(caption).toContain('Your inbox has 12 tabs open.');
    expect(caption).toContain('Messign is coming soon.');
    expect(caption).toContain('#Messign #ComingSoon');
    expect(caption).not.toMatch(/DRAFT|Pending Review|A\/B|Notes for review|Product truth|Please confirm|Caption\*\*|\*\*/);
  });

  it('leaves a clean caption unchanged', () => {
    expect(instagramCaptionFromBody('Launch day.\n\n#Messign')).toBe('Launch day.\n\n#Messign');
  });

  it('refuses when nothing publishable is left', () => {
    expect(() => instagramCaptionFromBody('[DRAFT — Pending Review] This has not been published.\n\n**Notes for review**\n- internal')).toThrow(/empty|internal/);
  });
});

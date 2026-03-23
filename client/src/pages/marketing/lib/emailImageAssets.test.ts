import { describe, it, expect } from 'vitest';
import {
  deriveImageKeywords,
  resolveArchitectEmailBodyBackgroundUrl,
  resolveHeroImageUrl,
} from './emailImageAssets';
import type { ParsedEmailDraft } from './emailAiDraftToDesign';

describe('deriveImageKeywords', () => {
  it('extracts meaningful words from subject and body', () => {
    const parsed: ParsedEmailDraft = {
      subject: 'Simplify AI Marketing',
      body: 'Messign Workspace is an AI-native operating system for founders.',
    };
    const k = deriveImageKeywords(parsed);
    expect(k.length).toBeGreaterThan(0);
    expect(k.some((w) => /marketing|native|workspace|founders|messign|simplify/i.test(w))).toBe(true);
  });

  it('includes short topic words car / ev / suv when present', () => {
    const parsed: ParsedEmailDraft = {
      subject: 'EV launch',
      body: 'The car you wanted.',
    };
    const k = deriveImageKeywords(parsed);
    expect(k).toContain('car');
    expect(k).toContain('wanted');
  });
});

describe('resolveHeroImageUrl', () => {
  it('returns stable curated URL for same keywords and blob', () => {
    const parsed: ParsedEmailDraft = {
      subject: 'AI launch',
      body: 'machine learning product',
    };
    const k = deriveImageKeywords(parsed);
    const blob = [parsed.subject, parsed.body].join(' ');
    const a = resolveHeroImageUrl(k, 'seed-a', blob);
    const b = resolveHeroImageUrl(k, 'seed-b', blob);
    expect(a).toBe(b);
    expect(a.startsWith('https://')).toBe(true);
  });

  it('resolves automotive hero for car-related copy (not random workspace)', () => {
    const blob = 'SUBJECT: Spring sale BODY: New cars and SUVs in stock. Driving home today.';
    const k = deriveImageKeywords({ subject: 'Spring sale', body: 'New cars and SUVs in stock.' });
    const url = resolveHeroImageUrl(k, 'any-seed', blob);
    expect(url).toContain('photo-1492144534655');
    expect(url).not.toContain('photo-1497366216548');
  });

  it('does not use workspace office image for automotive topic', () => {
    const workspaceUrl =
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80';
    const blob = 'vehicle financing and highway safety for your commute';
    const k = deriveImageKeywords({ body: 'vehicle financing and highway safety' });
    const url = resolveHeroImageUrl(k, 'seed-1', blob);
    expect(url).not.toBe(workspaceUrl);
    expect(url).toContain('photo-1492144534655');
  });

  it('resolves plants hero for cactus and succulent copy', () => {
    const blob = 'SUBJECT: Xeriscape BODY: Saguaro and agave in the botanical garden.';
    const k = deriveImageKeywords({ subject: 'Xeriscape', body: 'Saguaro and agave in the botanical garden.' });
    const url = resolveHeroImageUrl(k, 'seed', blob);
    expect(url).toContain('photo-1542601906990');
  });

  it('does not route generic power plant phrase to plants bucket', () => {
    const blob = 'SUBJECT: Energy BODY: The power plant came back online.';
    const k = deriveImageKeywords({ subject: 'Energy', body: 'The power plant came back online.' });
    const url = resolveHeroImageUrl(k, 'seed', blob);
    expect(url).not.toContain('photo-1542601906990');
  });
});

describe('resolveArchitectEmailBodyBackgroundUrl', () => {
  it('returns widened default curated URL when topic is generic', () => {
    const url = resolveArchitectEmailBodyBackgroundUrl(
      { subject: 'Notes', body: 'Short update for everyone.' },
      'seed-1',
    );
    expect(url).toContain('photo-1557683316');
    expect(url).toContain('w=2400');
    expect(url).not.toContain('w=1200');
  });

  it('returns widened plants URL for botanical draft text', () => {
    const url = resolveArchitectEmailBodyBackgroundUrl(
      { subject: 'Green thumb', preview: 'Spring', body: 'Our new succulent collection and cactus care tips.' },
      'seed-2',
    );
    expect(url).toContain('photo-1542601906990');
    expect(url).toContain('w=2400');
  });
});

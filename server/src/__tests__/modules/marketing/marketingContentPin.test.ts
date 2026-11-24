import { describe, expect, it } from 'vitest';
import { parseMarketingContentId } from '../../../services/ai/marketing/marketingContentPin.js';
import { buildPersistedContentBrief } from '../../../services/ai/marketing/marketingAgentOrchestrator.js';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';

describe('parseMarketingContentId', () => {
  it('accepts a uuid', () => {
    expect(parseMarketingContentId(CONTENT_ID)).toBe(CONTENT_ID);
  });

  it('rejects non-uuids', () => {
    expect(parseMarketingContentId('instagram')).toBeUndefined();
    expect(parseMarketingContentId('')).toBeUndefined();
    expect(parseMarketingContentId(12)).toBeUndefined();
  });
});

describe('buildPersistedContentBrief', () => {
  it('pins the instagram draft to the given content id', () => {
    const brief = buildPersistedContentBrief(
      'Draft an Instagram post about a book launch.\n\n[IMAGE_PROMPT]\nwindow display\n[/IMAGE_PROMPT]',
      CONTENT_ID,
    );
    expect(brief.channel).toBe('instagram');
    expect(brief.contentType).toBe('social');
    expect(brief.contentId).toBe(CONTENT_ID);
  });

  it('omits contentId when the run is not pinned', () => {
    const brief = buildPersistedContentBrief('Write a LinkedIn post about our launch');
    expect(brief.channel).toBe('linkedin');
    expect(brief.contentId).toBeUndefined();
  });
});

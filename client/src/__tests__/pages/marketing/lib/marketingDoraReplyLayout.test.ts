import { describe, expect, it } from 'vitest';
import {
  listItemsToTableRows,
  parseMarketingAssistantSections,
} from '@/pages/marketing/lib/marketingDoraReplyLayout';

describe('parseMarketingAssistantSections', () => {
  it('splits on markdown headings', () => {
    const s = parseMarketingAssistantSections(
      'Intro line.\n\n## Post\n\nHello **world**.\n\n## Notes\n\n- **Tone**: friendly',
    );
    expect(s.map((x) => x.title)).toEqual(['Context', 'Post', 'Notes']);
    expect(s[1].body).toContain('Hello');
  });

  it('splits two paragraphs into copy and notes when second looks like rationale', () => {
    const s = parseMarketingAssistantSections(
      'Main marketing copy here.\n\nRationale: strong hook and under 220 words.',
    );
    expect(s).toHaveLength(2);
    expect(s[0].title).toBe('Copy');
    expect(s[1].title).toBe('Notes');
  });
});

describe('listItemsToTableRows', () => {
  it('parses bold label lines', () => {
    const rows = listItemsToTableRows('- **Tone**: friendly\n- **Length**: short');
    expect(rows).toEqual([
      { label: 'Tone', value: 'friendly' },
      { label: 'Length', value: 'short' },
    ]);
  });
});

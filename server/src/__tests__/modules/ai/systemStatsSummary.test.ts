import { describe, expect, it } from 'vitest';
import { buildShortSystemStatsSummary } from '../../../services/ai/tools/systemStatsSummary.js';

describe('buildShortSystemStatsSummary', () => {
  it('formats a plain one-line overview without markdown', () => {
    const s = buildShortSystemStatsSummary(
      { total: 10, active: 8 },
      { total: 100, completed: 50, in_progress: 20, open: 20, blocked: 5, overdue: 5 },
      { total: 5, active: 4 },
      { total: 40, published: 30, drafts: 5, in_review: 5 },
      { total: 1000, this_week: 12, today: 3 },
    );
    expect(s).toContain('50%');
    expect(s).not.toContain('**');
  });

  it('appends detail suffix when provided', () => {
    const s = buildShortSystemStatsSummary(
      { total: 1, active: 1 },
      { total: 0, completed: 0, in_progress: 0, open: 0, blocked: 0, overdue: 0 },
      { total: 0, active: 0 },
      { total: 0, published: 0, drafts: 0, in_review: 0 },
      { total: 0, this_week: 0, today: 0 },
      { detailSuffix: 'Most active this week: Ada: 5.' },
    );
    expect(s).toContain('Most active');
  });
});

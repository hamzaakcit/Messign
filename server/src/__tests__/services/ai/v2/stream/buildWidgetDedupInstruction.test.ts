import { describe, expect, it } from 'vitest';
import { buildWidgetDedupInstruction } from '../../../../../services/ai/v2/stream/streamSynthesis.js';

describe('buildWidgetDedupInstruction', () => {
  it('returns null when there are no widgets', () => {
    expect(buildWidgetDedupInstruction([])).toBeNull();
  });

  it('includes widget titles and anti-duplication rules', () => {
    const hint = buildWidgetDedupInstruction([
      {
        schemaVersion: 1,
        id: 'w1',
        widgetType: 'data_table',
        title: 'Tasks (1)',
        data: {},
      },
    ]);
    expect(hint).toContain('Tasks (1)');
    expect(hint).toContain('MANDATORY');
    expect(hint).toContain('FORBIDDEN');
  });
});

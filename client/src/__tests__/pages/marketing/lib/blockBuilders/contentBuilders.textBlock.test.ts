import { describe, it, expect } from 'vitest';
import { buildTextBlock } from '@/pages/marketing/lib/blockBuilders/contentBuilders';
import { getTheme } from '@/pages/marketing/lib/designTokens';
import { scaledBodyFontSize } from '@/pages/marketing/lib/emailTypography';

describe('buildTextBlock', () => {
  it('uses scaledBodyFontSize so compact density differs from airy', () => {
    const theme = getTheme('warm');
    const body = 'Paragraph for density scaling.';
    const airy = buildTextBlock({ body, alignment: 'left' }, theme, {
      layoutDensity: 'airy',
    });
    const compact = buildTextBlock({ body, alignment: 'left' }, theme, {
      layoutDensity: 'compact',
    });
    const airyCell = airy[0]?.columns[0]?.contents[0];
    const compactCell = compact[0]?.columns[0]?.contents[0];
    expect(airyCell?.type).toBe('text');
    expect(compactCell?.type).toBe('text');
    const airyText = String((airyCell?.values as { text?: string }).text ?? '');
    const compactText = String((compactCell?.values as { text?: string }).text ?? '');
    const airyPx = scaledBodyFontSize(theme, 'airy');
    const compactPx = scaledBodyFontSize(theme, 'compact');
    expect(airyText).toContain(`font-size:${airyPx}px`);
    expect(compactText).toContain(`font-size:${compactPx}px`);
    expect(compactPx).not.toBe(airyPx);
  });
});

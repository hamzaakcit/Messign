import { describe, it, expect } from 'vitest';
import {
  estimateUnlayerDesignHtmlWeight,
  ESTIMATED_HTML_EXPORT_WARN_KB,
} from '@/pages/marketing/lib/estimateUnlayerDesignHtmlWeight';

describe('estimateUnlayerDesignHtmlWeight', () => {
  it('scales with JSON length and counts http URLs', () => {
    const minimal = JSON.stringify({ a: 1 });
    const a = estimateUnlayerDesignHtmlWeight(minimal);
    const heavy = JSON.stringify({
      rows: Array.from({ length: 40 }, (_, i) => ({
        bg: `https://cdn.example.com/x/wide-${i}.png?w=1200`,
      })),
    });
    const b = estimateUnlayerDesignHtmlWeight(heavy);
    expect(b.estimatedBytes).toBeGreaterThan(a.estimatedBytes);
    expect(b.httpUrlCount).toBeGreaterThanOrEqual(40);
  });

  it('documents warn threshold constant', () => {
    expect(ESTIMATED_HTML_EXPORT_WARN_KB).toBeGreaterThan(100);
  });
});

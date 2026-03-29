import {
  applyPaperPlaneToLegacyDesign,
  estimateEmailHeightForOverlay,
} from '@/pages/marketing/lib/specialEffects';

function findOverlayHtml(design: Record<string, unknown>): string {
  const rows = (design.body as { rows?: unknown[] })?.rows ?? [];
  for (const row of rows) {
    const cols = (row as { columns?: { contents?: { values?: { html?: string } }[] }[] })?.columns;
    const html = cols?.[0]?.contents?.[0]?.values?.html;
    if (typeof html === 'string' && html.includes('ov-phase-')) return html;
  }
  return '';
}

describe('estimateEmailHeightForOverlay', () => {
  it('uses row count when section map and total rows are available', () => {
    const h = estimateEmailHeightForOverlay(4, [0, 2, 5, 8], 14);
    expect(h).toBeGreaterThanOrEqual(600);
    expect(h).toBeGreaterThan(4 * 200);
  });
});

describe('applyPaperPlaneToLegacyDesign', () => {
  it('injects overlay rows into a legacy Unlayer design without removing content rows', () => {
    const design: Record<string, unknown> = {
      body: {
        rows: [
          {
            id: 'content-row-1',
            cells: [1],
            columns: [],
            values: { backgroundColor: '#ffffff' },
          },
        ],
      },
    };

    const out = applyPaperPlaneToLegacyDesign(design, 'minimal');
    const rows = (out.body as { rows: unknown[] }).rows;
    expect(rows.length).toBeGreaterThan(1);
  });

  it('clears prior overlay rows before re-injecting', () => {
    const design: Record<string, unknown> = {
      body: {
        rows: [
          {
            id: 'ov',
            cells: [1],
            columns: [],
            values: { _isOverlay: true },
          },
          {
            id: 'content-row-1',
            cells: [1],
            columns: [],
            values: { backgroundColor: '#ffffff' },
          },
        ],
      },
    };

    const out = applyPaperPlaneToLegacyDesign(design, 'minimal');
    const rows = (out.body as { rows: { id?: string; values?: { _isOverlay?: boolean } }[] }).rows;
    const overlayCount = rows.filter((r) => r.values?._isOverlay).length;
    expect(overlayCount).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === 'content-row-1')).toBe(true);
  });

  it('embeds public static paper-plane PNG path for the theme (Unlayer overlay img src)', () => {
    const design: Record<string, unknown> = {
      body: {
        rows: [
          {
            id: 'content-row-1',
            cells: [1],
            columns: [],
            values: { backgroundColor: '#ffffff' },
          },
        ],
      },
    };

    const out = applyPaperPlaneToLegacyDesign(design, 'nature');
    const html = findOverlayHtml(out);
    expect(html).toContain('marketing/overlay/paper-plane/nature.png');
    expect(html).toMatch(/<img[^>]+width="96"[^>]+height="60"/);
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('ov-static-');
  });
});

import { applyPaperPlaneToLegacyDesign } from '@/pages/marketing/lib/specialEffects';

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
});

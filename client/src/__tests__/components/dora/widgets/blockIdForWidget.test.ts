import { blockIdForWidget } from '@/components/dora/widgets/blockIdForWidget';
import type { AIWidgetPayload } from '@/types/knowledge-hub/ai';

describe('blockIdForWidget', () => {
  it('returns widget.id when set', () => {
    const w = { id: 'abc', widgetType: 'dora_dash', title: 'x' } as AIWidgetPayload;
    expect(blockIdForWidget(w)).toBe('abc');
  });

  it('builds slug from type and title when id missing', () => {
    const w = { widgetType: 'invoice_preview', title: 'My Title' } as AIWidgetPayload;
    expect(blockIdForWidget(w)).toBe('invoice_preview-My-Title');
  });
});

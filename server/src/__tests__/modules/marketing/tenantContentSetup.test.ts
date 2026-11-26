import { describe, expect, it, vi } from 'vitest';
import { callModelSafe } from '../../../services/ai/gateway.js';
import { runProductTruthValidation } from '../../../services/ai/marketing/productTruthValidator.js';
import {
  TENANT_CONTENT_SETUPS,
  contentSetupComplete,
  fixtureTruthRow,
  foreignProductName,
  productTruthMarkdown,
} from '../../../services/marketing/tenantContentSetup.js';
import { emptyOfferSheet } from '../../../services/marketing/offerSheet.js';
import { offerProductionGate } from '../../../services/marketing/offerProductionGate.js';

vi.mock('../../../services/ai/gateway.js', () => ({
  callModelSafe: vi.fn(),
}));

const callMock = vi.mocked(callModelSafe);

describe('tenant content setup', () => {
  it('completes Messign and the florist with publish left off', () => {
    expect(TENANT_CONTENT_SETUPS).toHaveLength(3);
    for (const setup of TENANT_CONTENT_SETUPS) {
      expect(contentSetupComplete(setup)).toBe(true);
      expect(setup.publishAllowed).toBe(false);
      if (setup.orgKey === 'messign') {
        expect(setup.productTruth.map((row) => row.name)).toEqual([
          'Dora',
          'Lucy',
          'Messign',
          'Knowledge Hub',
          'Work Management',
        ]);
      } else {
        expect(setup.productTruth).toHaveLength(3);
      }
    }
  });

  it('resolves a bookstore fixture row without the price in the materials', () => {
    const row = fixtureTruthRow('bookstore:Kürk Mantolu Madonna', 'Kürk Mantolu Madonna');
    expect(row?.id).toBe('bookstore:Kürk Mantolu Madonna');
    expect(row?.materials).toBe('A novel in the shop window.');
    expect(row?.materials).not.toContain('₺');
    const sheet = emptyOfferSheet();
    sheet.product = 'Kürk Mantolu Madonna';
    sheet.truthId = 'bookstore:Kürk Mantolu Madonna';
    sheet.place = 'Karaköy kitapçı vitrini';
    sheet.price = '₺189';
    expect(offerProductionGate({ sheet, recipe: 'product_drop', truthRow: row })).toEqual([]);
    expect(fixtureTruthRow('bookstore:Kürk Mantolu Madonna', 'Dora')).toBeNull();
  });

  it('fails a florist prompt that names a Messign product before the model is called', async () => {
    callMock.mockClear();
    const florist = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'florist');
    expect(florist).toBeDefined();
    const sheet = productTruthMarkdown(florist!);
    const prompt = 'Lilyana vitrininde Dora için bir buket. Knowledge Hub değil, çiçek.';
    expect(foreignProductName(prompt, sheet)).toBe('Dora');

    const result = await runProductTruthValidation({
      organizationId: '00000000-0000-0000-0000-0000000000f1',
      contentText: prompt,
      tenantId: '00000000-0000-0000-0000-0000000000f1',
      productTruthContextMdOverride: sheet,
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.failed_reasons[0]).toContain('Dora');
    expect(callMock).not.toHaveBeenCalled();
  });

  it('fails a bookstore prompt that names Dora', () => {
    const bookstore = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'bookstore');
    expect(bookstore).toBeDefined();
    expect(foreignProductName('Kürk Mantolu Madonna yanında Dora duruyor.', productTruthMarkdown(bookstore!))).toBe('Dora');
  });

  it('treats the brand name as copy and Lucy as a foreign product', () => {
    const florist = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'florist')!;
    const sheet = productTruthMarkdown(florist);
    expect(foreignProductName('Messign helps teams collaborate.', sheet)).toBeNull();
    expect(foreignProductName('Lucy için bir buket.', sheet)).toBe('Lucy');
  });

  it('leaves a florist prompt that stays on the flower sheet alone', () => {
    const florist = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'florist')!;
    const prompt = 'Papatya buketi Lilyana vitrininde.';
    expect(foreignProductName(prompt, productTruthMarkdown(florist))).toBeNull();
  });
});

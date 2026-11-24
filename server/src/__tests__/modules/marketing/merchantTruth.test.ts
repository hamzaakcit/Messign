import { listMerchantTruthProducts, parseTruthDescription } from '../../../services/marketing/merchantTruth.js';
import type { MerchantTruthQuery } from '../../../services/marketing/merchantTruth.js';
import { MESSIGN_PRODUCT_NAMES, TENANT_CONTENT_SETUPS } from '../../../services/marketing/tenantContentSetup.js';

const ORG_A = '00000000-0000-0000-0000-0000000000aa';
const ORG_B = '00000000-0000-0000-0000-0000000000bb';
const BOOK_ID = '11111111-2222-4333-8444-555555555555';

interface StoredProduct {
  id: string;
  feature_name: string;
  description: string | null;
  status: string;
  workspace_id: string;
}

interface StoredClaim {
  id: string;
  claim: string;
  proof_point: string | null;
  context_tags: string[] | null;
  workspace_id: string;
}

function memoryQuery(products: StoredProduct[], claims: StoredClaim[]): MerchantTruthQuery {
  return async <T>(sql: string, params?: readonly unknown[]) => {
    const orgId = String(params?.[0] ?? '');
    if (sql.includes('marketing_product_truth')) {
      const rows = products.filter((row) => row.workspace_id === orgId && sql.includes(row.status));
      return { rows: rows as unknown as T[] };
    }
    const rows = claims.filter((row) => row.workspace_id === orgId);
    return { rows: rows as unknown as T[] };
  };
}

describe('merchant truth', () => {
  it('reads price and place labels and leaves price empty when the label is missing', () => {
    expect(parseTruthDescription('A novel in the shop window.\nprice: ₺189\nplace: Karaköy kitapçı vitrini')).toEqual({
      summary: 'A novel in the shop window.',
      price: '₺189',
      place: 'Karaköy kitapçı vitrini',
    });
    expect(parseTruthDescription('Shared docs and answers').price).toBe('');
    expect(parseTruthDescription(null).place).toBe('');
  });

  it('returns only the requested org, hides internal and deprecated rows, and attaches a matching claim', async () => {
    const products: StoredProduct[] = [
      {
        id: BOOK_ID,
        feature_name: 'Kürk Mantolu Madonna',
        description: 'A novel in the shop window.\nprice: ₺189\nplace: Karaköy kitapçı vitrini',
        status: 'shipped',
        workspace_id: ORG_A,
      },
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        feature_name: 'Draft title',
        description: 'Not for sale',
        status: 'internal_only',
        workspace_id: ORG_A,
      },
      {
        id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        feature_name: 'Old title',
        description: 'Retired',
        status: 'deprecated',
        workspace_id: ORG_A,
      },
      {
        id: 'cccccccc-dddd-4eee-8fff-000000000001',
        feature_name: 'Papatya buketi',
        description: 'White daisies, wrapped.\nprice: ₺450\nplace: Nişantaşı çiçekçi tezgahı',
        status: 'shipped',
        workspace_id: ORG_B,
      },
    ];
    const claims: StoredClaim[] = [
      {
        id: 'dddddddd-eeee-4fff-8000-111111111111',
        claim: 'Bu hafta vitrinde',
        proof_point: 'Window card',
        context_tags: [`truth:${BOOK_ID}`],
        workspace_id: ORG_A,
      },
      {
        id: 'eeeeeeee-ffff-4000-8111-222222222222',
        claim: 'Other org claim',
        proof_point: null,
        context_tags: [`truth:${BOOK_ID}`],
        workspace_id: ORG_B,
      },
    ];
    const runQuery = memoryQuery(products, claims);

    const orgA = await listMerchantTruthProducts(ORG_A, runQuery);
    const orgB = await listMerchantTruthProducts(ORG_B, runQuery);

    expect(orgA.map((row) => row.name)).toEqual(['Kürk Mantolu Madonna']);
    expect(orgA[0]?.price).toBe('₺189');
    expect(orgA[0]?.place).toBe('Karaköy kitapçı vitrini');
    expect(orgA[0]?.claims.map((claim) => claim.claim)).toEqual(['Bu hafta vitrinde']);
    expect(orgB.map((row) => row.name)).toEqual(['Papatya buketi']);
    expect(orgB[0]?.claims).toEqual([]);
  });

  it('keeps Messign product names off the florist sheet', () => {
    const florist = TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === 'florist');
    const blob = florist!.productTruth.map((row) => `${row.name}\n${row.description}`).join('\n');
    for (const name of MESSIGN_PRODUCT_NAMES) {
      expect(blob).not.toContain(name);
    }
    expect(florist!.productTruth.every((row) => row.description.includes('price:') && row.description.includes('place:'))).toBe(true);
  });
});

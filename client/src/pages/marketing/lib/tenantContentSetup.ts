/**
 * Synthetic content setups shown in the brand panel.
 * Publish stays off. The florist list does not include Messign products.
 */

export interface ProductTruthRow {
  name: string;
  description: string;
}

export interface TenantContentSetup {
  orgKey: 'messign' | 'florist' | 'bookstore';
  brandName: string;
  language: 'tr' | 'en';
  instagramHandle: string;
  publishAllowed: boolean;
  recipes: readonly string[];
  productTruth: readonly ProductTruthRow[];
}

export const TENANT_CONTENT_SETUPS: readonly TenantContentSetup[] = [
  {
    orgKey: 'messign',
    brandName: 'Messign',
    language: 'en',
    instagramHandle: 'messign',
    publishAllowed: false,
    recipes: ['product drop', 'occasion', 'cart'],
    productTruth: [
      { name: 'Dora', description: 'AI assistant for the workspace' },
      { name: 'Lucy', description: 'Marketing assistant' },
      { name: 'Messign', description: 'The engagement platform' },
      { name: 'Knowledge Hub', description: 'Shared docs and answers' },
      { name: 'Work Management', description: 'Tasks and projects' },
    ],
  },
  {
    orgKey: 'florist',
    brandName: 'Lilyana',
    language: 'tr',
    instagramHandle: 'lilyana.flowers',
    publishAllowed: false,
    recipes: ['product drop', 'occasion', 'cart'],
    productTruth: [
      {
        name: 'Papatya buketi',
        description: 'White daisies, wrapped.\nprice: ₺450\nplace: Nişantaşı çiçekçi tezgahı',
      },
      {
        name: 'Gül aranjmanı',
        description: 'Rose arrangement for the counter.\nprice: ₺890\nplace: Cihangir çiçekçi vitrini',
      },
      {
        name: 'Orkide',
        description: 'Potted orchid.\nprice: ₺650\nplace: Moda atölye tezgahı',
      },
    ],
  },
  {
    orgKey: 'bookstore',
    brandName: 'Kitapyurdu',
    language: 'tr',
    instagramHandle: 'kitapyurdu',
    publishAllowed: false,
    recipes: ['product drop', 'occasion', 'cart'],
    productTruth: [
      {
        name: 'İnce Memed',
        description: 'A novel in the shop window.\nprice: ₺220\nplace: Kadıköy kitapçı vitrini',
      },
      {
        name: 'Tutunamayanlar',
        description: 'A novel on the shop table.\nprice: ₺340\nplace: Beyoğlu sahaf',
      },
      {
        name: 'Kürk Mantolu Madonna',
        description: 'A novel in the shop window.\nprice: ₺189\nplace: Karaköy kitapçı vitrini',
      },
    ],
  },
];

const MESSIGN_PRODUCT_NAMES = ['Dora', 'Lucy', 'Messign', 'Knowledge Hub', 'Work Management', 'Gamification'];

/** True when a florist row uses a Messign product name. */
export function floristUsesMessignProduct(setups: readonly TenantContentSetup[] = TENANT_CONTENT_SETUPS): boolean {
  const florist = setups.find((setup) => setup.orgKey === 'florist');
  if (!florist) return false;
  const blob = florist.productTruth.map((row) => `${row.name} ${row.description}`).join('\n');
  return MESSIGN_PRODUCT_NAMES.some((name) => blob.includes(name));
}

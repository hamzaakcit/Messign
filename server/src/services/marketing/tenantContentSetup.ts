/**
 * Content-studio setup for one org. Publish stays off until a later send-gate decision.
 * This is not an onboarding kit.
 */

import { parseTruthDescription } from './merchantTruth.js';
import type { OfferTruthRowRef } from './offerProductionGate.js';

export type SetupRecipe = 'product_drop' | 'occasion' | 'cart';

export interface ProductTruthRow {
  name: string;
  description: string;
}

export interface TenantContentSetup {
  orgKey: 'messign' | 'florist' | 'bookstore';
  brandName: string;
  language: 'tr' | 'en';
  instagramHandle: string;
  /** Default is no. A missing value stays no. */
  publishAllowed: boolean;
  recipes: readonly SetupRecipe[];
  productTruth: readonly ProductTruthRow[];
}

/** Names that belong to Messign. A florist sheet must not list them. */
export const MESSIGN_PRODUCT_NAMES = ['Dora', 'Knowledge Hub', 'Work Management', 'Gamification'] as const;

export const TENANT_CONTENT_SETUPS: readonly TenantContentSetup[] = [
  {
    orgKey: 'messign',
    brandName: 'Messign',
    language: 'en',
    instagramHandle: 'messign',
    publishAllowed: false,
    recipes: ['product_drop', 'occasion', 'cart'],
    productTruth: [
      { name: 'Dora', description: 'AI assistant for the workspace' },
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
    recipes: ['product_drop', 'occasion', 'cart'],
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
    recipes: ['product_drop', 'occasion', 'cart'],
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

/**
 * Id stored on the offer sheet for a fixture product.
 * The studio picker and the production gate share this id.
 */
export function fixtureTruthId(orgKey: TenantContentSetup['orgKey'], name: string): string {
  return `${orgKey}:${name.trim()}`;
}

/**
 * Truth row for a fixture product. Null when the id and the name do not match a setup row.
 * Materials are the prose only, so a price label never reaches the scene.
 */
export function fixtureTruthRow(truthId: string, product: string): OfferTruthRowRef | null {
  const id = truthId.trim();
  const name = product.trim();
  if (!id || !name) return null;
  for (const setup of TENANT_CONTENT_SETUPS) {
    for (const row of setup.productTruth) {
      if (row.name.trim() !== name) continue;
      if (fixtureTruthId(setup.orgKey, row.name) !== id) continue;
      return {
        id,
        name: row.name,
        materials: parseTruthDescription(row.description).summary,
      };
    }
  }
  return null;
}

/** A setup is complete when brand, language, handle, three truth rows, and recipes are set. */
export function contentSetupComplete(setup: TenantContentSetup): boolean {
  return Boolean(
    setup.brandName.trim() &&
      (setup.language === 'tr' || setup.language === 'en') &&
      setup.instagramHandle.trim() &&
      setup.publishAllowed === false &&
      setup.recipes.length > 0 &&
      setup.productTruth.length >= 3 &&
      setup.productTruth.every((row) => row.name.trim() && row.description.trim()),
  );
}

export function productTruthMarkdown(setup: TenantContentSetup): string {
  const rows = setup.productTruth.map((row) => `- ${row.name}: ${row.description}`).join('\n');
  return `## Product truth (${setup.brandName})\n${rows}`;
}

function mentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * A name from another brand that the draft uses and this org's product truth does not list.
 */
export function foreignProductName(
  text: string,
  productTruthMd: string,
  foreignNames: readonly string[] = MESSIGN_PRODUCT_NAMES,
): string | null {
  for (const name of foreignNames) {
    if (mentionsName(text, name) && !mentionsName(productTruthMd, name)) return name;
  }
  return null;
}

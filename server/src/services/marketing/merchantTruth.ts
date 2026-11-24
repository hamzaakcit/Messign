/**
 * Sellable product rows for the offer picker.
 * Price and place are labels inside `marketing_product_truth.description`.
 * No new columns. Hidden statuses never leave this module.
 */

export type MerchantTruthStatus = 'shipped' | 'beta' | 'coming_soon';

export interface MerchantTruthClaim {
  id: string;
  claim: string;
  proofPoint: string;
}

export interface MerchantTruthProduct {
  id: string;
  name: string;
  summary: string;
  price: string;
  place: string;
  status: MerchantTruthStatus;
  claims: MerchantTruthClaim[];
}

export interface TruthDescriptionParts {
  summary: string;
  price: string;
  place: string;
}

interface ProductRow {
  id: string;
  feature_name: string;
  description: string | null;
  status: string;
}

interface ClaimRow {
  id: string;
  claim: string;
  proof_point: string | null;
  context_tags: string[] | null;
}

export interface MerchantTruthQuery {
  <T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
}

const PICKABLE: ReadonlySet<string> = new Set(['shipped', 'beta', 'coming_soon']);

/**
 * Split a truth description into the prose line plus optional `price:` and `place:` labels.
 * A description with no price label returns an empty price.
 */
export function parseTruthDescription(description: string | null | undefined): TruthDescriptionParts {
  const parts: TruthDescriptionParts = { summary: '', price: '', place: '' };
  const prose: string[] = [];
  for (const rawLine of (description ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const splitAt = line.indexOf(':');
    const key = splitAt > 0 ? line.slice(0, splitAt).trim().toLowerCase() : '';
    const value = splitAt > 0 ? line.slice(splitAt + 1).trim() : '';
    if (key === 'price') parts.price = value;
    else if (key === 'place') parts.place = value;
    else prose.push(line);
  }
  parts.summary = prose.join('\n').trim();
  return parts;
}

function isPickableStatus(status: string): status is MerchantTruthStatus {
  return PICKABLE.has(status);
}

/**
 * Products the caller’s organization may pick.
 * `internal_only` and `deprecated` are omitted. Claims attach only when tagged `truth:<id>` on that same org.
 */
export async function listMerchantTruthProducts(
  organizationId: string,
  runQuery: MerchantTruthQuery,
): Promise<MerchantTruthProduct[]> {
  const orgId = organizationId.trim();
  if (!orgId) return [];

  const products = await runQuery<ProductRow>(
    `SELECT id::text, feature_name, description, status
       FROM marketing_product_truth
      WHERE workspace_id = $1::uuid
        AND status IN ('shipped', 'beta', 'coming_soon')
      ORDER BY feature_name`,
    [orgId],
  );
  const claims = await runQuery<ClaimRow>(
    `SELECT id::text, claim, proof_point, context_tags
       FROM marketing_approved_claims
      WHERE workspace_id = $1::uuid
      ORDER BY claim`,
    [orgId],
  );

  const claimsByTruth = new Map<string, MerchantTruthClaim[]>();
  for (const row of claims.rows) {
    const tags = row.context_tags ?? [];
    for (const tag of tags) {
      if (!tag.startsWith('truth:')) continue;
      const truthId = tag.slice('truth:'.length);
      const list = claimsByTruth.get(truthId) ?? [];
      list.push({
        id: row.id,
        claim: row.claim,
        proofPoint: row.proof_point ?? '',
      });
      claimsByTruth.set(truthId, list);
    }
  }

  const listed: MerchantTruthProduct[] = [];
  for (const row of products.rows) {
    if (!isPickableStatus(row.status)) continue;
    const described = parseTruthDescription(row.description);
    listed.push({
      id: row.id,
      name: row.feature_name,
      summary: described.summary,
      price: described.price,
      place: described.place,
      status: row.status,
      claims: claimsByTruth.get(row.id) ?? [],
    });
  }
  return listed;
}

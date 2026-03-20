/**
 * Multi-table product truth search for Content Strategist (`marketing:product_truth_lookup`).
 * Workspace-scoped (workspace_id = organization id), parallel queries, ILIKE + optional pg_trgm (`%`).
 */
import { z } from 'zod';
import { query } from '../../db/index.js';

/** Open fields for LLM tool args (toolArgSchemas uses `.passthrough()` on this). */
export const productTruthLookupFields = z.object({
  /** Core topic or feature to search. */
  query: z.string().max(500).optional(),
  /** Legacy alias for `query`. */
  topic: z.string().max(500).optional(),
  competitor: z.string().max(200).optional(),
  /** e.g. blog, social, email — optional filter via context_tags */
  content_type: z.string().max(120).optional(),
  feature_keys: z.array(z.string().max(100)).max(40).optional(),
  include_competitors: z.boolean().optional(),
});

/** Strict validation inside `executeProductTruthLookup`. */
export const productTruthLookupArgsSchema = productTruthLookupFields.refine(
  (d) => Boolean(d.query?.trim() || d.topic?.trim()),
  {
    message: 'Provide `query` (or legacy `topic`) with at least one non-whitespace character.',
    path: ['query'],
  },
);

export type ProductTruthLookupArgs = z.infer<typeof productTruthLookupArgsSchema>;

export interface ProductTruthFeatureRow {
  id: string;
  feature_name: string;
  description: string | null;
  status: string;
}

export interface ApprovedClaimRow {
  id: string;
  claim: string;
  proof_point: string | null;
  context_tags: string[];
}

export interface BlockedClaimRow {
  id: string;
  blocked_claim: string;
  reason: string | null;
}

export interface CompetitorMapRow {
  competitor_name: string;
  approved_comparison_points: unknown;
  strengths: string | null;
  weaknesses: string | null;
}

export interface ProductTruthLookupRawResult {
  workspaceId: string;
  searchQuery: string;
  features: ProductTruthFeatureRow[];
  approvedClaims: ApprovedClaimRow[];
  blockedClaims: BlockedClaimRow[];
  competitorRows: CompetitorMapRow[];
}

function ilikePattern(q: string): string {
  return `%${q.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

function statusWarningLine(status: string): string | null {
  if (status === 'internal_only' || status === 'deprecated') {
    return 'WARNING: This feature is internal/deprecated. Do not use in external content.';
  }
  return null;
}

/**
 * Parallel search across marketing_product_truth, marketing_approved_claims,
 * marketing_blocked_claims, marketing_competitor_map (see `074_product_truth_search_indexes.sql` for GIN/pg_trgm indexes).
 */
export async function executeProductTruthLookup(
  workspaceId: string,
  args: ProductTruthLookupArgs,
): Promise<ProductTruthLookupRawResult> {
  const a = productTruthLookupArgsSchema.parse(args);
  const searchQuery = (a.query ?? a.topic ?? '').trim();
  const ilike = ilikePattern(searchQuery);
  const plainForTrgm = searchQuery.slice(0, 200);
  const competitor = a.competitor?.trim() || null;
  const contentType = a.content_type?.trim() || null;
  const keys = a.feature_keys?.filter(Boolean) ?? [];
  const includeCompetitors = a.include_competitors !== false;

  const baseParams: [string, string, string] = [workspaceId, ilike, plainForTrgm];

  const featurePromise = keys.length > 0
    ? query<ProductTruthFeatureRow>(
        `SELECT id::text, feature_name, description, status
         FROM marketing_product_truth
         WHERE workspace_id = $1::uuid
           AND (
             feature_name = ANY($4::text[])
             OR feature_name ILIKE $2
             OR COALESCE(description, '') ILIKE $2
             OR ($3::text <> '' AND (feature_name % $3 OR COALESCE(description, '') % $3))
           )
         ORDER BY CASE WHEN status IN ('shipped', 'beta') THEN 0 ELSE 1 END, feature_name
         LIMIT 40`,
        [...baseParams, keys],
      )
    : query<ProductTruthFeatureRow>(
        `SELECT id::text, feature_name, description, status
         FROM marketing_product_truth
         WHERE workspace_id = $1::uuid
           AND (
             feature_name ILIKE $2
             OR COALESCE(description, '') ILIKE $2
             OR ($3::text <> '' AND (feature_name % $3 OR COALESCE(description, '') % $3))
           )
         ORDER BY CASE WHEN status IN ('shipped', 'beta') THEN 0 ELSE 1 END, feature_name
         LIMIT 40`,
        baseParams,
      );

  const claimParams: unknown[] = [...baseParams, contentType];
  const claimsPromise = query<ApprovedClaimRow>(
    `SELECT id::text, claim, proof_point, context_tags
     FROM marketing_approved_claims
     WHERE workspace_id = $1::uuid
       AND (
         claim ILIKE $2
         OR COALESCE(proof_point, '') ILIKE $2
         OR EXISTS (SELECT 1 FROM unnest(context_tags) AS t(tag) WHERE tag ILIKE $2)
         OR ($3::text <> '' AND (claim % $3 OR COALESCE(proof_point, '') % $3))
       )
       AND (
         $4::text IS NULL OR $4::text = ''
         OR cardinality(context_tags) = 0
         OR EXISTS (
           SELECT 1 FROM unnest(context_tags) AS t(tag)
           WHERE lower(tag) LIKE '%' || lower($4::text) || '%'
         )
       )
     ORDER BY
       CASE
         WHEN $4::text IS NOT NULL AND $4::text <> '' AND EXISTS (
           SELECT 1 FROM unnest(context_tags) AS t(tag)
           WHERE lower(tag) LIKE '%' || lower($4::text) || '%'
         ) THEN 0
         ELSE 1
       END,
       claim
     LIMIT 35`,
    claimParams,
  );

  const blockedPromise = query<BlockedClaimRow>(
    `SELECT id::text, blocked_claim, reason
     FROM marketing_blocked_claims
     WHERE workspace_id = $1::uuid
       AND (
         blocked_claim ILIKE $2
         OR COALESCE(reason, '') ILIKE $2
         OR ($3::text <> '' AND blocked_claim % $3)
       )
     ORDER BY blocked_claim
     LIMIT 30`,
    baseParams,
  );

  let competitorPromise: Promise<{ rows: CompetitorMapRow[] }>;
  if (competitor) {
    competitorPromise = query<CompetitorMapRow>(
      `SELECT competitor_name, approved_comparison_points, strengths, weaknesses
       FROM marketing_competitor_map
       WHERE workspace_id = $1::uuid
         AND competitor_name ILIKE $4
       ORDER BY competitor_name
       LIMIT 8`,
      [...baseParams, ilikePattern(competitor)],
    );
  } else if (includeCompetitors) {
    competitorPromise = query<CompetitorMapRow>(
      `SELECT competitor_name, approved_comparison_points, strengths, weaknesses
       FROM marketing_competitor_map
       WHERE workspace_id = $1::uuid
         AND (
           competitor_name ILIKE $2
           OR approved_comparison_points::text ILIKE $2
           OR COALESCE(strengths, '') ILIKE $2
           OR COALESCE(weaknesses, '') ILIKE $2
           OR ($3::text <> '' AND competitor_name % $3)
         )
       ORDER BY competitor_name
       LIMIT 12`,
      baseParams,
    );
  } else {
    competitorPromise = Promise.resolve({ rows: [] as CompetitorMapRow[] });
  }

  const [featRes, claimRes, blockRes, compRes] = await Promise.all([
    featurePromise,
    claimsPromise,
    blockedPromise,
    competitorPromise,
  ]);

  return {
    workspaceId,
    searchQuery,
    features: featRes.rows,
    approvedClaims: claimRes.rows.map((r) => ({
      ...r,
      context_tags: Array.isArray(r.context_tags) ? r.context_tags.map(String) : [],
    })),
    blockedClaims: blockRes.rows,
    competitorRows: compRes.rows,
  };
}

/** Token-efficient markdown for the LLM tool summary. */
export function formatProductTruthLookupMarkdown(raw: ProductTruthLookupRawResult): string {
  const q = raw.searchQuery;
  const hasAny =
    raw.features.length > 0 ||
    raw.approvedClaims.length > 0 ||
    raw.blockedClaims.length > 0 ||
    raw.competitorRows.length > 0;

  if (!hasAny) {
    return `No verified data found for '${q}'. Do not invent metrics or features. Ask the user for clarification or use a placeholder.`;
  }

  const lines: string[] = [`## Product truth lookup: "${q}"\n`];

  if (raw.features.length > 0) {
    lines.push('### Features\n');
    for (const f of raw.features) {
      const w = statusWarningLine(f.status);
      lines.push(`- **${f.feature_name}** — status: \`${f.status}\``);
      if (w) lines.push(`  - **${w}**`);
      if (f.description?.trim()) {
        lines.push(`  - ${f.description.trim().replace(/\n+/g, ' ')}`);
      }
    }
    lines.push('');
  }

  if (raw.approvedClaims.length > 0) {
    lines.push('### Approved claims (use only these formulations where applicable)\n');
    for (const c of raw.approvedClaims) {
      const tags = c.context_tags.length ? ` _[tags: ${c.context_tags.join(', ')}]_` : '';
      const proof = c.proof_point ? ` Proof: ${c.proof_point}` : '';
      lines.push(`- ${c.claim}${proof}${tags}\n`);
    }
    lines.push('');
  }

  if (raw.blockedClaims.length > 0) {
    lines.push('### Blocked / never use\n');
    for (const b of raw.blockedClaims) {
      lines.push(`- **BLOCKED:** ${b.blocked_claim}${b.reason ? ` — _Reason: ${b.reason}_` : ''}\n`);
    }
    lines.push('');
  }

  if (raw.competitorRows.length > 0) {
    lines.push('### Competitor map (approved comparison points only)\n');
    for (const row of raw.competitorRows) {
      lines.push(`#### ${row.competitor_name}\n`);
      let points: unknown = row.approved_comparison_points;
      if (typeof points === 'string') {
        try {
          points = JSON.parse(points) as unknown;
        } catch {
          /* keep string */
        }
      }
      if (Array.isArray(points)) {
        for (const p of points.slice(0, 20)) {
          lines.push(`- ${typeof p === 'string' ? p : JSON.stringify(p)}`);
        }
      } else if (points && typeof points === 'object') {
        lines.push(`- ${JSON.stringify(points)}`);
      }
      if (row.strengths?.trim()) lines.push(`- _Strengths (internal):_ ${row.strengths.trim()}`);
      if (row.weaknesses?.trim()) lines.push(`- _Weaknesses (internal):_ ${row.weaknesses.trim()}`);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

/**
 * Compiles workspace marketing DB rows into token-efficient Markdown for LLM prompts.
 *
 * `workspace_id` is the Messign tenant key (same as `organizations.id` / `organization_id` elsewhere).
 *
 * Sources:
 * - New tables: marketing_product_truth, marketing_approved_claims, marketing_blocked_claims, marketing_competitor_map, marketing_brand_profiles
 * - Existing: marketing_glossary (069), marketing_brand_profile JSONB (069), marketing_brand_examples (069 + 072 columns)
 */
import NodeCache from 'node-cache';
import { query } from '../../db/index.js';

const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
});

const K_PRODUCT = (workspaceId: string) => `mctx:product:${workspaceId}`;
const K_BRAND = (workspaceId: string) => `mctx:brand:${workspaceId}`;

export interface MarketingProductTruthRow {
  id: string;
  workspace_id: string;
  feature_name: string;
  description: string | null;
  status: string;
  announced: boolean;
  updated_at: string;
}

export interface MarketingApprovedClaimRow {
  id: string;
  claim: string;
  proof_point: string | null;
  context_tags: string[] | null;
}

export interface MarketingBlockedClaimRow {
  id: string;
  blocked_claim: string;
  reason: string | null;
}

export interface MarketingGlossaryRow {
  term: string;
  definition: string;
}

export interface MarketingCompetitorMapRow {
  competitor_name: string;
  approved_comparison_points: unknown;
  strengths: string | null;
  weaknesses: string | null;
}

export interface MarketingBrandProfileRow {
  tone_description: string | null;
  personality_traits: string[] | null;
  taboos: string[] | null;
}

export interface MarketingBrandExampleRow {
  kind: string;
  format: string | null;
  title: string | null;
  content: string;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function groupFeaturesByStatus(rows: MarketingProductTruthRow[]): Map<string, MarketingProductTruthRow[]> {
  const preferred = ['shipped', 'beta', 'coming_soon', 'deprecated', 'internal_only'];
  const m = new Map<string, MarketingProductTruthRow[]>();
  for (const r of rows) {
    const list = m.get(r.status) ?? [];
    list.push(r);
    m.set(r.status, list);
  }
  const out = new Map<string, MarketingProductTruthRow[]>();
  for (const st of preferred) {
    if (m.has(st)) out.set(st, m.get(st)!);
  }
  for (const [st, list] of m) {
    if (!out.has(st)) out.set(st, list);
  }
  return out;
}

async function fetchProductTruthParts(workspaceId: string): Promise<{
  features: MarketingProductTruthRow[];
  claims: MarketingApprovedClaimRow[];
  blocked: MarketingBlockedClaimRow[];
  glossary: MarketingGlossaryRow[];
  competitors: MarketingCompetitorMapRow[];
}> {
  const [features, claims, blocked, glossary, competitors] = await Promise.all([
    query<MarketingProductTruthRow & { created_at?: string }>(
      `SELECT id, workspace_id, feature_name, description, status, announced, updated_at
       FROM marketing_product_truth WHERE workspace_id = $1::uuid ORDER BY status, feature_name`,
      [workspaceId],
    ),
    query<MarketingApprovedClaimRow>(
      `SELECT id, claim, proof_point, context_tags FROM marketing_approved_claims WHERE workspace_id = $1::uuid ORDER BY claim`,
      [workspaceId],
    ),
    query<MarketingBlockedClaimRow>(
      `SELECT id, blocked_claim, reason FROM marketing_blocked_claims WHERE workspace_id = $1::uuid ORDER BY blocked_claim`,
      [workspaceId],
    ),
    query<MarketingGlossaryRow>(
      `SELECT term, definition FROM marketing_glossary WHERE organization_id = $1::uuid ORDER BY term`,
      [workspaceId],
    ),
    query<MarketingCompetitorMapRow>(
      `SELECT competitor_name, approved_comparison_points, strengths, weaknesses
       FROM marketing_competitor_map WHERE workspace_id = $1::uuid ORDER BY competitor_name`,
      [workspaceId],
    ),
  ]);

  return {
    features: features.rows,
    claims: claims.rows,
    blocked: blocked.rows,
    glossary: glossary.rows,
    competitors: competitors.rows,
  };
}

/**
 * Build Markdown product-truth sheet for injection (e.g. PRODUCT_TRUTH_SHEET).
 */
export async function buildProductTruthSheet(workspaceId: string): Promise<string> {
  const cached = cache.get<string>(K_PRODUCT(workspaceId));
  if (cached !== undefined) return cached;

  const { features, claims, blocked, glossary, competitors } = await fetchProductTruthParts(workspaceId);

  const lines: string[] = ['## Product truth (compiled)', ''];

  lines.push('### Features (by status)');
  if (features.length === 0) {
    lines.push('_No rows in marketing_product_truth._', '');
  } else {
    const grouped = groupFeaturesByStatus(features);
    for (const [status, list] of grouped) {
      lines.push(`**${status}**`);
      for (const f of list) {
        const ann = f.announced ? ' (announced)' : '';
        lines.push(`- **${esc(f.feature_name)}**${ann}: ${f.description ?? ''}`.trim());
      }
      lines.push('');
    }
  }

  lines.push('### Approved claims');
  if (claims.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const c of claims) {
      const tags =
        Array.isArray(c.context_tags) && c.context_tags.length > 0 ? ` [tags: ${c.context_tags.join(', ')}]` : '';
      const proof = c.proof_point ? ` _(proof: ${c.proof_point})_` : '';
      lines.push(`- ${c.claim}${proof}${tags}`);
    }
    lines.push('');
  }

  lines.push('### Blocked claims / patterns');
  if (blocked.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const b of blocked) {
      lines.push(`- \`${esc(b.blocked_claim)}\`${b.reason ? ` — ${b.reason}` : ''}`);
    }
    lines.push('');
  }

  lines.push('### Glossary');
  if (glossary.length === 0) {
    lines.push('_None (marketing_glossary empty for this workspace)._', '');
  } else {
    for (const g of glossary) {
      lines.push(`- **${esc(g.term)}**: ${g.definition}`);
    }
    lines.push('');
  }

  lines.push('### Competitor map');
  if (competitors.length === 0) {
    lines.push('_None._', '');
  } else {
    lines.push('| Competitor | Approved comparison points | Strengths | Weaknesses |');
    lines.push('|------------|------------------------------|-----------|------------|');
    for (const row of competitors) {
      let points = '';
      if (Array.isArray(row.approved_comparison_points)) {
        points = row.approved_comparison_points.map(String).join('; ');
      } else if (row.approved_comparison_points != null) {
        try {
          points = JSON.stringify(row.approved_comparison_points);
        } catch {
          points = String(row.approved_comparison_points);
        }
      }
      lines.push(
        `| ${esc(row.competitor_name)} | ${esc(points)} | ${esc(row.strengths ?? '')} | ${esc(row.weaknesses ?? '')} |`,
      );
    }
    lines.push('');
  }

  const md = lines.join('\n').trimEnd() + '\n';
  cache.set(K_PRODUCT(workspaceId), md);
  return md;
}

async function fetchBrandParts(workspaceId: string): Promise<{
  profile: MarketingBrandProfileRow | null;
  legacyProfile: Record<string, unknown> | null;
  examples: MarketingBrandExampleRow[];
}> {
  const [prof, legacy, ex] = await Promise.all([
    query<MarketingBrandProfileRow>(
      `SELECT tone_description, personality_traits, taboos FROM marketing_brand_profiles WHERE workspace_id = $1::uuid LIMIT 1`,
      [workspaceId],
    ),
    query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM marketing_brand_profile WHERE organization_id = $1::uuid LIMIT 1`,
      [workspaceId],
    ),
    query<{ kind: string; format: string | null; title: string | null; body: string | null; content: string | null }>(
      `SELECT kind, format, title, body, content FROM marketing_brand_examples WHERE organization_id = $1::uuid ORDER BY kind, sort_order, created_at`,
      [workspaceId],
    ),
  ]);

  const profile = prof.rows[0] ?? null;
  const legacyProfile = legacy.rows[0]?.profile ?? null;
  const examples: MarketingBrandExampleRow[] = ex.rows.map((r) => ({
    kind: r.kind,
    format: r.format,
    title: r.title,
    content: (r.content && r.content.trim()) || r.body || '',
  }));

  return { profile, legacyProfile, examples };
}

/**
 * Build Markdown brand-voice block for injection (e.g. BRAND_VOICE_PROFILE).
 * Taboos and tone appear first. Merges relational `marketing_brand_profiles` with legacy JSON `marketing_brand_profile` when needed.
 */
export async function buildBrandVoiceProfile(workspaceId: string): Promise<string> {
  const cached = cache.get<string>(K_BRAND(workspaceId));
  if (cached !== undefined) return cached;

  const { profile, legacyProfile, examples } = await fetchBrandParts(workspaceId);

  const lines: string[] = ['## Brand voice (compiled)', ''];

  const taboos: string[] = [];
  let tone = '';
  let traits: string[] = [];

  if (profile?.taboos?.length) taboos.push(...profile.taboos);
  if (profile?.tone_description) tone = profile.tone_description;
  if (profile?.personality_traits?.length) traits = profile.personality_traits;

  const legacyTaboos = legacyProfile?.taboos;
  if (Array.isArray(legacyTaboos)) {
    for (const t of legacyTaboos) {
      if (typeof t === 'string' && !taboos.includes(t)) taboos.push(t);
    }
  }
  if (!tone && typeof legacyProfile?.tone === 'string') tone = legacyProfile.tone as string;
  const legacyTraits = legacyProfile?.personality_traits;
  if (Array.isArray(legacyTraits) && traits.length === 0) {
    traits = legacyTraits.filter((x): x is string => typeof x === 'string');
  }

  lines.push('### Taboos (do not use)');
  if (taboos.length === 0) {
    lines.push('_None listed._', '');
  } else {
    for (const t of taboos) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  lines.push('### Tone & personality');
  lines.push(`- **Tone:** ${tone || '_Not set._'}`);
  lines.push(`- **Personality:** ${traits.length ? traits.join(', ') : '_Not set._'}`);
  lines.push('');

  if (legacyProfile && Object.keys(legacyProfile).length > 0) {
    lines.push('### Extra profile JSON (legacy)');
    lines.push('```json');
    lines.push(JSON.stringify(legacyProfile, null, 2));
    lines.push('```');
    lines.push('');
  }

  const golden = examples.filter((e) => e.kind === 'golden');
  const anti = examples.filter((e) => e.kind === 'anti');

  lines.push('### Golden examples');
  if (golden.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const e of golden) {
      const fmt = e.format ? ` _(${e.format})_` : '';
      const title = e.title ? `**${e.title}**` : '';
      lines.push(`- ${title}${fmt}`.trim());
      lines.push(`  ${e.content}`);
    }
    lines.push('');
  }

  lines.push('### Anti-examples (avoid)');
  if (anti.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const e of anti) {
      const fmt = e.format ? ` _(${e.format})_` : '';
      const title = e.title ? `**${e.title}**` : '';
      lines.push(`- ${title}${fmt}`.trim());
      lines.push(`  ${e.content}`);
    }
    lines.push('');
  }

  const md = lines.join('\n').trimEnd() + '\n';
  cache.set(K_BRAND(workspaceId), md);
  return md;
}

/** Drop cached Markdown for one workspace (call after UI updates to truth/brand tables). */
export function invalidateWorkspaceMarketingContext(workspaceId: string): void {
  cache.del(K_PRODUCT(workspaceId));
  cache.del(K_BRAND(workspaceId));
}

/** Testing / admin: clear entire marketing context cache. */
export function invalidateAllMarketingContextCache(): void {
  cache.flushAll();
}

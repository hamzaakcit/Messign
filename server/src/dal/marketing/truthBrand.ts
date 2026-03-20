/**
 * Product truth + brand voice layers for Content Strategist (markdown for system prompt + tools).
 */
import { query } from '../../db/index.js';

export interface TruthLookupOptions {
  topic?: string;
  featureKeys?: string[];
  includeCompetitors?: boolean;
}

function ilike(q: string): string {
  return `%${q.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

/** Fallback when no org or empty DB — matches product-truth rules in prompts. */
export function getDefaultProductTruthFallback(): string {
  return `## Product truth (default — configure marketing_truth_* tables per org)

### Shipped (safe for external marketing)
- Collaboration, Work Management, AI Assistant (Dora), Gamification, Knowledge Hub

### Internal-only (do NOT market externally)
- Finance/Ops module, Marketing module itself

### Rules
- Only reference shipped features in external content.
- Beta: qualify ("in beta", "early access").
- Coming soon: only if announced; future tense only.
- No invented metrics, quotes, or superlatives without approved proof.
- No pricing in copy — point to messign.com/pricing or user CTA.
- Competitor comparisons: factual, approved points only; no disparagement.
`;
}

export function getDefaultBrandVoiceFallback(): string {
  return `## Brand voice (default — configure marketing_brand_profile)

- Tone: direct, confident B2B SaaS marketer; expert but accessible.
- Avoid: unverified metrics, superlatives without proof, trash-talking competitors, stating specific prices.
- Emoji: minimal on LinkedIn; punchy but on-brand on X.
- Default CTA for sales-led content: Book a demo (unless user specifies).
`;
}

export async function loadProductTruthSheetMd(
  organizationId: string | null,
  options?: TruthLookupOptions,
): Promise<string> {
  if (!organizationId) {
    return getDefaultProductTruthFallback();
  }

  const topic = options?.topic?.trim();
  const keys = options?.featureKeys?.filter(Boolean) ?? [];
  const includeCompetitors = options?.includeCompetitors !== false;

  const parts: string[] = ['## Product truth sheet (live data)\n'];

  let featSql = `SELECT key, name, description, status, announced FROM marketing_truth_features
    WHERE organization_id = $1::uuid`;
  const featParams: unknown[] = [organizationId];
  let p = 2;
  if (keys.length > 0) {
    featSql += ` AND key = ANY($${p}::text[])`;
    featParams.push(keys);
    p++;
  } else if (topic) {
    featSql += ` AND (name ILIKE $${p} OR description ILIKE $${p} OR key ILIKE $${p})`;
    featParams.push(ilike(topic));
    p++;
  }
  featSql += ' ORDER BY sort_order, name';

  const features = await query<{ key: string; name: string; description: string | null; status: string; announced: boolean }>(
    featSql,
    featParams,
  );
  if (features.rows.length === 0) {
    parts.push('_No matching features in registry._\n');
  } else {
    parts.push('### Feature registry\n');
    for (const f of features.rows) {
      const ann = f.announced ? ' (announced for roadmap comms)' : '';
      parts.push(`- **${f.name}** (\`${f.key}\`) — status: **${f.status}**${ann}\n  ${f.description ?? ''}\n`);
    }
  }

  let claimSql = `SELECT claim_text, category, proof_reference, approved FROM marketing_truth_claims
    WHERE organization_id = $1::uuid AND approved = true`;
  const claimParams: unknown[] = [organizationId];
  if (topic) {
    claimSql += ` AND claim_text ILIKE $2`;
    claimParams.push(ilike(topic));
  }
  claimSql += ' ORDER BY sort_order, claim_text LIMIT 30';

  const claims = await query<{ claim_text: string; category: string | null; proof_reference: string | null }>(
    claimSql,
    claimParams,
  );
  parts.push('\n### Approved claims / proof vault\n');
  if (claims.rows.length === 0) {
    parts.push('_None loaded._ Use placeholders for metrics if no proof exists.\n');
  } else {
    for (const c of claims.rows) {
      const pr = c.proof_reference ? ` _(proof: ${c.proof_reference})_` : '';
      parts.push(`- ${c.claim_text}${pr}\n`);
    }
  }

  const blocked = await query<{ pattern_or_text: string; reason: string | null }>(
    `SELECT pattern_or_text, reason FROM marketing_truth_blocked WHERE organization_id = $1::uuid ORDER BY sort_order`,
    [organizationId],
  );
  parts.push('\n### Blocked / caution patterns\n');
  if (blocked.rows.length === 0) {
    parts.push('_None._\n');
  } else {
    for (const b of blocked.rows) {
      parts.push(`- \`${b.pattern_or_text}\`${b.reason ? ` — ${b.reason}` : ''}\n`);
    }
  }

  let competitorRowCount = 0;
  if (includeCompetitors) {
    let compSql = `SELECT competitor_name, point_text, approved, favors FROM marketing_competitor_points
      WHERE organization_id = $1::uuid`;
    const compParams: unknown[] = [organizationId];
    if (topic) {
      compSql += ` AND (point_text ILIKE $2 OR competitor_name ILIKE $2)`;
      compParams.push(ilike(topic));
    }
    compSql += ' ORDER BY sort_order LIMIT 25';
    const comps = await query<{ competitor_name: string; point_text: string; approved: boolean; favors: string | null }>(
      compSql,
      compParams,
    );
    competitorRowCount = comps.rows.length;
    parts.push('\n### Competitor map (use approved points only)\n');
    if (comps.rows.length === 0) {
      parts.push('_None._\n');
    } else {
      for (const c of comps.rows) {
        const ap = c.approved ? 'approved' : 'not approved';
        const fv = c.favors ? ` favors=${c.favors}` : '';
        parts.push(`- **${c.competitor_name}** (${ap}${fv}): ${c.point_text}\n`);
      }
    }
  }

  let glossSql = `SELECT term, definition FROM marketing_glossary WHERE organization_id = $1::uuid`;
  const glossParams: unknown[] = [organizationId];
  if (topic) {
    glossSql += ` AND (term ILIKE $2 OR definition ILIKE $2)`;
    glossParams.push(ilike(topic));
  }
  glossSql += ' ORDER BY sort_order, term LIMIT 40';
  const gloss = await query<{ term: string; definition: string }>(glossSql, glossParams);
  parts.push('\n### Glossary\n');
  if (gloss.rows.length === 0) {
    parts.push('_None._\n');
  } else {
    for (const g of gloss.rows) {
      parts.push(`- **${g.term}**: ${g.definition}\n`);
    }
  }

  const allEmpty =
    features.rows.length === 0 &&
    claims.rows.length === 0 &&
    blocked.rows.length === 0 &&
    gloss.rows.length === 0 &&
    (!includeCompetitors || competitorRowCount === 0);
  if (allEmpty) {
    return `${getDefaultProductTruthFallback()}\n\n_(No rows in marketing_truth_* tables for this org yet.)_`;
  }

  return parts.join('');
}

export async function loadBrandVoiceProfileMd(organizationId: string | null): Promise<string> {
  if (!organizationId) {
    return getDefaultBrandVoiceFallback();
  }

  const prof = await query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM marketing_brand_profile WHERE organization_id = $1::uuid LIMIT 1`,
    [organizationId],
  );
  const examples = await query<{ kind: string; title: string | null; body: string }>(
    `SELECT kind, title, body FROM marketing_brand_examples WHERE organization_id = $1::uuid ORDER BY kind, sort_order`,
    [organizationId],
  );

  const parts: string[] = ['## Brand voice profile (live data)\n'];

  if (prof.rows.length === 0) {
    parts.push(getDefaultBrandVoiceFallback());
  } else {
    const p = prof.rows[0]!.profile;
    parts.push('### Profile JSON (interpret strictly)\n```json\n');
    parts.push(JSON.stringify(p, null, 2));
    parts.push('\n```\n');
  }

  parts.push('\n### Examples\n');
  if (examples.rows.length === 0) {
    parts.push('_No golden/anti examples in DB._\n');
  } else {
    for (const e of examples.rows) {
      const t = e.title ? `**${e.title}** ` : '';
      parts.push(`- _${e.kind}_ ${t}\n  ${e.body}\n`);
    }
  }

  return parts.join('');
}

export async function loadMarketingTruthBrandLayers(
  organizationId: string | null,
): Promise<{ productTruthMd: string; brandVoiceMd: string }> {
  const [productTruthMd, brandVoiceMd] = await Promise.all([
    loadProductTruthSheetMd(organizationId),
    loadBrandVoiceProfileMd(organizationId),
  ]);
  return { productTruthMd, brandVoiceMd };
}

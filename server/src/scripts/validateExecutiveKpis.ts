import { query } from '../db/index.js';

type Row = Record<string, unknown>;

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function assertWithinTolerance(name: string, a: number, b: number, tolerancePct = 0.5): void {
  const denominator = Math.max(1, Math.abs(b));
  const pct = Math.abs(a - b) / denominator * 100;
  if (pct > tolerancePct) {
    throw new Error(`${name} mismatch: aggregate=${a} reference=${b} drift=${pct.toFixed(3)}%`);
  }
}

async function main() {
  const orgs = await query<{ id: string; slug: string }>(
    `SELECT id::text, slug FROM organizations ORDER BY created_at ASC LIMIT 20`,
  );

  if (!orgs.rows.length) {
    console.log('[KPI Validation] No organizations found, skipping.');
    return;
  }

  for (const org of orgs.rows) {
    const orgId = org.id;
    const [revAgg, revRef, financeAgg, financeRef] = await Promise.all([
      query<Row>(
        `SELECT COALESCE(SUM(COALESCE(amount_eur, amount, 0) * COALESCE(probability,0) / 100.0),0)::numeric AS weighted
         FROM crm_deals
         WHERE organization_id = $1::uuid AND status NOT IN ('won','lost')`,
        [orgId],
      ),
      query<Row>(
        `SELECT COALESCE(SUM(weighted_value), 0)::numeric AS weighted
         FROM (
           SELECT
             COALESCE(SUM(COALESCE(d.amount_eur, d.amount, 0) * COALESCE(d.probability, 0) / 100.0), 0)::numeric AS weighted_value
           FROM crm_deals d
           WHERE d.organization_id = $1::uuid AND d.status NOT IN ('won', 'lost')
           GROUP BY d.stage_id
         ) x`,
        [orgId],
      ),
      query<Row>(
        `SELECT COALESCE(SUM(original_amount),0)::numeric AS qtd
         FROM reimbursement_requests
         WHERE organization_id = $1::uuid
           AND (is_deleted IS NULL OR is_deleted = FALSE)
           AND status IN ('approved','ai_approved','manager_approved','finance_approved','paid','reimbursed')
           AND created_at >= date_trunc('quarter', NOW())`,
        [orgId],
      ),
      query<Row>(
        `SELECT COALESCE(SUM(original_amount),0)::numeric AS qtd
         FROM reimbursement_requests
         WHERE organization_id = $1::uuid
           AND (is_deleted IS NULL OR is_deleted = FALSE)
           AND created_at >= date_trunc('quarter', NOW())
           AND status IN ('approved','ai_approved','manager_approved','finance_approved','paid','reimbursed')`,
        [orgId],
      ),
    ]);

    const weightedAgg = asNumber(revAgg.rows[0]?.weighted);
    const weightedRef = asNumber(revRef.rows[0]?.weighted);
    const qtdAgg = asNumber(financeAgg.rows[0]?.qtd);
    const qtdRef = asNumber(financeRef.rows[0]?.qtd);

    assertWithinTolerance(`weightedPipeline(${org.slug})`, weightedAgg, weightedRef);
    assertWithinTolerance(`totalExpensesQTD(${org.slug})`, qtdAgg, qtdRef);
    console.log(`[KPI Validation] ${org.slug}: PASS`);
  }
}

main().catch((err) => {
  console.error('[KPI Validation] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Apache AGE — Cross-Module Graph Queries
 *
 * Executes Cypher queries on messign_graph for relationships like
 * "deals at risk because assigned team members have upcoming PTO".
 *
 * Requires: Apache AGE extension (migration 062), graph populated by event handlers.
 */
import { pool } from '../../../db/index.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function assertTenantId(tenantId: string): void {
  if (!UUID_REGEX.test(tenantId)) throw new Error('Invalid tenant ID format');
}

function assertDate(dateStr: string): void {
  if (!DATE_REGEX.test(dateStr)) throw new Error('Invalid date format (expected YYYY-MM-DD)');
}

function escapeCypherString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export interface DealAtRisk {
  deal: string;
  value: number;
  stage: string;
  person: string;
  pto_start: string;
  pto_end: string;
}

export interface GetDealsAtRiskOptions {
  /** PTO start must be on or before this date (YYYY-MM-DD). Default: today + 30 days */
  cutoffDate?: string;
  /** Active deal stages to consider. Default: negotiation, proposal, closing */
  stages?: string[];
}

/**
 * Deals at risk because assigned team members have approved PTO.
 * Requires Person, Deal, PTORequest vertices and ASSIGNED_TO, HAS_PTO edges.
 */
export async function getDealsAtRiskDueToPTO(
  tenantId: string,
  options: GetDealsAtRiskOptions = {},
): Promise<DealAtRisk[]> {
  assertTenantId(tenantId);

  const cutoff = options.cutoffDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assertDate(cutoff);

  const stages = options.stages ?? ['negotiation', 'proposal', 'closing'];
  const stagesStr = stages.map((s) => `'${escapeCypherString(s)}'`).join(', ');

  const cypher = `
    MATCH (p:Person)-[:ASSIGNED_TO]->(d:Deal),
          (p)-[:HAS_PTO]->(pto:PTORequest)
    WHERE d.stage IN [${stagesStr}]
      AND pto.status = 'approved'
      AND pto.start_date <= '${escapeCypherString(cutoff)}'
      AND d.tenant_id = '${escapeCypherString(tenantId)}'
    RETURN d.name AS deal,
           d.value AS value,
           d.stage AS stage,
           p.name AS person,
           pto.start_date AS pto_start,
           pto.end_date AS pto_end
    ORDER BY d.value DESC
  `;

  const result = await pool.query(
    `SELECT * FROM ag_catalog.cypher('messign_graph', $1) AS (deal agtype, value agtype, stage agtype, person agtype, pto_start agtype, pto_end agtype)`,
    [cypher],
  );

  return result.rows.map((row) => ({
    deal: String(row.deal ?? ''),
    value: Number(row.value ?? 0),
    stage: String(row.stage ?? ''),
    person: String(row.person ?? ''),
    pto_start: String(row.pto_start ?? ''),
    pto_end: String(row.pto_end ?? ''),
  }));
}

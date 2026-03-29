/**
 * Calibration snapshots — aggregated email performance for Content Strategist prompts (Phase 7).
 */

import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';

/** Row shape for `calibration_snapshots` (JSONB columns may be objects or parsed arrays). */
export interface CalibrationSnapshotRow {
  id: string;
  organization_id: string;
  snapshot_date: Date;
  emails_sent: number;
  avg_open_rate: number | null;
  avg_click_rate: number | null;
  avg_bounce_rate: number | null;
  avg_complaint_rate: number | null;
  top_subjects: unknown;
  top_ctas: unknown;
  top_sections: unknown;
  top_hooks: unknown;
  bottom_subjects: unknown;
  bottom_ctas: unknown;
  detected_patterns: unknown;
  window_start: Date;
  window_end: Date;
  created_at: Date;
}

/**
 * Returns the latest snapshot for the tenant, or null if none.
 */
export async function getLatestCalibrationSnapshot(
  organizationId: string,
): Promise<CalibrationSnapshotRow | null> {
  return withTenantQuery(organizationId, async (client: PoolClient) => {
    const res = await client.query(
      `SELECT *
       FROM calibration_snapshots
       WHERE organization_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [organizationId],
    );
    const row = res.rows[0];
    return row ? (row as CalibrationSnapshotRow) : null;
  });
}

export interface InsertCalibrationSnapshotInput {
  emails_sent: number;
  avg_open_rate: number | null;
  avg_click_rate: number | null;
  avg_bounce_rate: number | null;
  avg_complaint_rate: number | null;
  top_subjects: unknown;
  top_ctas: unknown;
  top_sections: unknown;
  top_hooks: unknown;
  bottom_subjects: unknown;
  bottom_ctas: unknown;
  detected_patterns: unknown;
  window_start: Date;
  window_end: Date;
}

/**
 * Inserts a new calibration snapshot for the tenant (RLS via `withTenantQuery`).
 */
export async function insertCalibrationSnapshot(
  organizationId: string,
  input: InsertCalibrationSnapshotInput,
): Promise<string> {
  return withTenantQuery(organizationId, async (client: PoolClient) => {
    const res = await client.query(
      `INSERT INTO calibration_snapshots (
        organization_id,
        emails_sent,
        avg_open_rate,
        avg_click_rate,
        avg_bounce_rate,
        avg_complaint_rate,
        top_subjects,
        top_ctas,
        top_sections,
        top_hooks,
        bottom_subjects,
        bottom_ctas,
        detected_patterns,
        window_start,
        window_end
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
        $11::jsonb, $12::jsonb, $13::jsonb,
        $14, $15
      )
      RETURNING id`,
      [
        organizationId,
        input.emails_sent,
        input.avg_open_rate,
        input.avg_click_rate,
        input.avg_bounce_rate,
        input.avg_complaint_rate,
        JSON.stringify(input.top_subjects ?? []),
        JSON.stringify(input.top_ctas ?? []),
        JSON.stringify(input.top_sections ?? []),
        JSON.stringify(input.top_hooks ?? []),
        JSON.stringify(input.bottom_subjects ?? []),
        JSON.stringify(input.bottom_ctas ?? []),
        JSON.stringify(input.detected_patterns ?? []),
        input.window_start,
        input.window_end,
      ],
    );
    return String(res.rows[0]?.id ?? '');
  });
}

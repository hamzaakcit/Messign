/**
 * Lightweight aggregates for the Dora welcome briefing card (parallel DB reads).
 */

import { query } from '../../../db/index.js';
import { buildDoraContext } from './context.js';
import { invoiceService } from '../../finance/invoiceService.js';

export interface DoraBriefingSnapshot {
  tasksDueToday: number;
  unpaidInvoices: number;
  unpaidInvoiceTotal: number;
  projectsAttention: number;
  hoursYesterday: number;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getDoraBriefingSnapshot(
  authUserId: string,
  role: string | undefined,
): Promise<DoraBriefingSnapshot> {
  const doraCtx = await buildDoraContext(authUserId, role, '/dora', false);
  const orgId = doraCtx.user.organizationId;
  const ruId = doraCtx.user.userUuid;

  const out: DoraBriefingSnapshot = {
    tasksDueToday: 0,
    unpaidInvoices: 0,
    unpaidInvoiceTotal: 0,
    projectsAttention: 0,
    hoursYesterday: 0,
  };

  const [tasksR, projectsR, timeR, invR] = await Promise.allSettled([
    query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM tasks t
       WHERE t.assignees @> jsonb_build_array($1::text)
         AND t.due_date IS NOT NULL
         AND t.due_date::date = CURRENT_DATE
         AND t.status NOT IN ('completed', 'done', 'cancelled')`,
      [authUserId],
    ),
    query<{ c: string }>(
      `SELECT COUNT(DISTINCT t.project_id)::text AS c
       FROM tasks t
       WHERE t.assignees @> jsonb_build_array($1::text)
         AND t.project_id IS NOT NULL
         AND t.due_date < NOW()
         AND t.status NOT IN ('completed', 'done', 'cancelled')`,
      [authUserId],
    ),
    ruId && orgId
      ? query<{ h: string }>(
          `SELECT COALESCE(SUM(te.hours), 0)::text AS h
           FROM time_entries te
           WHERE te.user_id = $1::uuid
             AND te.organization_id = $2::uuid
             AND te.date = (CURRENT_DATE - INTERVAL '1 day')::date`,
          [ruId, orgId],
        )
      : Promise.resolve({ rows: [{ h: '0' }] }),
    orgId ? invoiceService.getStats(orgId) : Promise.resolve(null),
  ]);

  if (tasksR.status === 'fulfilled') {
    out.tasksDueToday = num(tasksR.value.rows[0]?.c);
  }
  if (projectsR.status === 'fulfilled') {
    out.projectsAttention = num(projectsR.value.rows[0]?.c);
  }
  if (timeR.status === 'fulfilled') {
    out.hoursYesterday = num(timeR.value.rows[0]?.h);
  }
  if (invR.status === 'fulfilled' && invR.value) {
    const s = invR.value as Record<string, unknown>;
    out.unpaidInvoices = num(s.sent_count) + num(s.partial_count);
    out.unpaidInvoiceTotal = num(s.total_outstanding);
  }

  return out;
}

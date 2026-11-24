import { withEngageTenant } from './db.js';

/**
 * Reading the engage audit log (WP-31, migration 138). Writing is done by the database itself (triggers on the control-plane
 * tables), so there is no write function here: code cannot record an entry that did not happen, or skip one that did.
 */

export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  details: Record<string, unknown>;
}

export interface AuditChainStatus {
  /** False when an entry was changed, removed or re-ordered since it was written. */
  ok: boolean;
  entries: number;
  firstBadSeq: number | null;
  headSeq: number | null;
  /** Record this somewhere outside the database to also notice a removed tail (`npm run engage:audit-verify` prints it). */
  headHash: string | null;
}

export const AUDIT_PAGE_MAX = 200;

export async function listAudit(orgId: string, opts: { limit?: number; beforeSeq?: number } = {}): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50) || 50, 1), AUDIT_PAGE_MAX);
  const before = opts.beforeSeq !== undefined && Number.isFinite(opts.beforeSeq) ? Math.trunc(opts.beforeSeq) : null;
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ seq: string; occurred_at: Date; actor: string; action: string; subject_type: string; subject_id: string | null; details: Record<string, unknown> }>(
      `SELECT seq::text, occurred_at, actor, action, subject_type, subject_id, details
         FROM engage.audit_log WHERE organization_id = $1 AND ($2::bigint IS NULL OR seq < $2)
        ORDER BY seq DESC LIMIT $3`, [orgId, before, limit]);
    return r.rows.map((x) => ({ seq: Number(x.seq), at: new Date(x.occurred_at).toISOString(), actor: x.actor, action: x.action, subjectType: x.subject_type, subjectId: x.subject_id, details: x.details }));
  });
}

export function mapChainRow(row: { ok: boolean; entries: string | number; first_bad_seq: string | number | null; head_seq: string | number | null; head_hash: string | null }): AuditChainStatus {
  return {
    ok: row.ok, entries: Number(row.entries),
    firstBadSeq: row.first_bad_seq === null ? null : Number(row.first_bad_seq),
    headSeq: row.head_seq === null ? null : Number(row.head_seq),
    headHash: row.head_hash,
  };
}

export async function verifyAuditChain(orgId: string): Promise<AuditChainStatus> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(`SELECT ok, entries::text, first_bad_seq::text, head_seq::text, head_hash FROM engage.verify_audit_chain($1)`, [orgId]);
    return mapChainRow(r.rows[0]);
  });
}

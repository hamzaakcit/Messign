/**
 * Verifies the hash chain of the engage audit log (WP-31) from an operator's terminal: for one tenant or for all of them.
 * Prints, per tenant, whether the chain verifies, how many entries it holds and its head (position and hash). Write the head
 * down somewhere outside the database now and then (the weekly progress note, a password manager entry): a removed tail
 * leaves a chain that still verifies, and only a remembered head shows it.
 *
 *   npm run engage:audit-verify -- --all
 *   npm run engage:audit-verify -- --org <uuid> [--expect-head-seq 42 --expect-head-hash <64 hex>]
 *
 * Needs the privileged database URL in DATABASE_MIGRATE_URL or DATABASE_ADMIN_URL (the same order as `npm run db:migrate`),
 * given explicitly: it reads every tenant, and it never falls back to another variable, so it cannot check the wrong database. Exit code 0 when everything verifies (and any expected head matches), 1 when something does not, 2 on bad arguments.
 */
import 'dotenv/config';
import { mapChainRow } from '../engage/audit.js';
import { headStillHolds, parseVerifyArgs, type VerifyArgs } from './engageAuditVerifyArgs.js';

async function main(): Promise<void> {
  let args: VerifyArgs;
  try { args = parseVerifyArgs(process.argv.slice(2)); } catch (err) { console.error(err instanceof Error ? err.message : err); process.exit(2); }
  const url = process.env.DATABASE_MIGRATE_URL?.trim() || process.env.DATABASE_ADMIN_URL?.trim();
  if (!url) { console.error('Set DATABASE_MIGRATE_URL (or DATABASE_ADMIN_URL) to the database to check.'); process.exit(2); }
  const { default: pg } = await import('pg');
  const railway = /rlwy\.net|railway\.app|railway\.net/.test(url);
  const pool = new pg.Pool({ connectionString: railway ? url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '') : url, max: 2, ...(railway ? { ssl: { rejectUnauthorized: false } } : {}) });
  const host = (() => { try { return new URL(url).hostname; } catch { return '?'; } })();
  console.log(`[engage] checking the audit log on ${host}`);
  try {
    const orgs: string[] = args.all
      ? (await pool.query<{ organization_id: string }>('SELECT organization_id FROM engage.tenant_settings ORDER BY organization_id')).rows.map((r) => r.organization_id)
      : [args.org!];
    let bad = 0;
    for (const org of orgs) {
      const r = await pool.query('SELECT ok, entries::text, first_bad_seq::text, head_seq::text, head_hash FROM engage.verify_audit_chain($1)', [org]);
      const st = mapChainRow(r.rows[0]);
      let line = `${org}  ${st.ok ? 'OK ' : 'BROKEN'}  entries=${st.entries}  head=${st.headSeq ?? '-'}:${st.headHash ?? '-'}`;
      if (!st.ok) { bad++; line += `  first bad entry: ${st.firstBadSeq}`; }
      if (st.ok && args.expectSeq !== undefined && args.expectHash !== undefined) {
        const holds = await headStillHolds(st, args.expectSeq, args.expectHash, async (seq) => (await pool.query<{ entry_hash: string }>(
          'SELECT entry_hash FROM engage.audit_log WHERE organization_id = $1 AND seq = $2', [org, seq])).rows[0]?.entry_hash ?? null);
        line += holds ? '  remembered head matches' : '  REMEMBERED HEAD DOES NOT MATCH (an entry was removed or changed)';
        if (!holds) bad++;
      }
      console.log(line);
    }
    if (orgs.length === 0) console.log('[engage] no tenants');
    if (bad) { console.error(`[engage] ${bad} problem(s)`); process.exitCode = 1; }
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('[engage] audit verify failed:', err instanceof Error ? err.message : err); process.exit(1); });

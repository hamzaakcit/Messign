import type { PoolClient } from 'pg';

/**
 * The account ids of one WhatsApp number's history: the account itself and every account it replaced through rotation
 * (`supersedes_id`). A rotation (a renewed token, a new app secret) writes a new account row with a new id (ADR-006), but it is the
 * same business number at Meta, so what Meta counts per number (the daily limit of new customers) and what the screen shows per
 * number (the last delivery report) must follow the chain, not the id. The walk goes from the account to what it replaced,
 * inside one tenant, capped at 50 steps.
 */
export async function accountLineage(c: PoolClient, orgId: string, accountId: string): Promise<string[]> {
  const rows = (await c.query<{ id: string }>(
    `WITH RECURSIVE chain(id, supersedes_id, depth) AS (
        SELECT id, supersedes_id, 0 FROM engage.channel_accounts WHERE organization_id = $1 AND id = $2
      UNION ALL
        SELECT a.id, a.supersedes_id, ch.depth + 1 FROM engage.channel_accounts a JOIN chain ch ON a.id = ch.supersedes_id
         WHERE a.organization_id = $1 AND ch.depth < 50)
     SELECT id FROM chain`, [orgId, accountId])).rows;
  return rows.length ? rows.map((r) => r.id) : [accountId];
}

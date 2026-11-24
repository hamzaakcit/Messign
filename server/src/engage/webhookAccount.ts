import { withAccountLookup, withEngageTenant } from './db.js';

/**
 * Which account a provider webhook URL stands for. The URL carries the id of the account the provider was told about
 * (the SNS subscription of an email account, the callback URL of a Meta app). Rotating an account's credentials writes a new
 * row with a new id and disables the old one (ADR-006), so without this every rotation (a renewed token, a changed number)
 * would turn the URL the provider holds into a 404 and silently lose every delivery report and every STOP until someone
 * updates the provider. The URL therefore follows the account forward: the active account of the same lineage (the row itself,
 * or the newest row that took its place, through `supersedes_id`) is the one that answers.
 *
 * Nothing about trust changes: the active account's own secrets verify the delivery, so a rotated-out secret stops working
 * at once, and an account that was disabled without a successor (revoked, not replaced) is still a plain 404. The id in the
 * URL is only a locator; the tenant is read from the row it names, and the lineage is followed inside that tenant.
 */
const MAX_LINEAGE = 50;

export async function resolveWebhookAccount(accountId: string): Promise<{ orgId: string; activeId: string } | null> {
  const orgId = await withAccountLookup(accountId, async (c) => (await c.query<{ organization_id: string }>(
    `SELECT organization_id FROM engage.channel_accounts WHERE id = $1`, [accountId])).rows[0]?.organization_id);
  if (!orgId) return null;
  const activeId = await withEngageTenant(orgId, async (c) => (await c.query<{ id: string }>(
    `WITH RECURSIVE lineage(id, status, depth) AS (
        SELECT id, status, 0 FROM engage.channel_accounts WHERE organization_id = $2 AND id = $1
      UNION ALL
        SELECT a.id, a.status, l.depth + 1 FROM engage.channel_accounts a JOIN lineage l ON a.supersedes_id = l.id
         WHERE a.organization_id = $2 AND l.depth < ${MAX_LINEAGE})
     SELECT id FROM lineage WHERE status = 'active' ORDER BY depth LIMIT 1`, [accountId, orgId])).rows[0]?.id);
  return activeId ? { orgId, activeId } : null;
}

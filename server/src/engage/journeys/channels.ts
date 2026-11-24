import type { PoolClient } from 'pg';

/**
 * What a journey branch may know about a customer's channels at that moment (WP-40b): the marketing consent per channel and
 * whether a marketing message could reach them (consent granted, an active address or number, not suppressed). One query; read
 * only when a branch condition asks (definition.ts readsChannels). The send gate still decides every message on its own.
 */
export async function customerChannelsOn(c: PoolClient, orgId: string, profileId: string): Promise<{ consent: Record<string, string>; reachable: Record<string, boolean> }> {
  const r = (await c.query<{ channel: string; status: string | null; value: string | null; suppressed: boolean }>(
    `SELECT ch.channel, cs.status, i.value_normalized AS value,
            EXISTS (SELECT 1 FROM engage.suppressions s WHERE s.organization_id = $1 AND s.channel = ch.channel AND s.value_normalized = i.value_normalized) AS suppressed
       FROM (VALUES ('email', 'email'), ('sms', 'phone'), ('whatsapp', 'phone')) AS ch(channel, identifier)
       LEFT JOIN engage.consent_state cs ON cs.organization_id = $1 AND cs.profile_id = $2 AND cs.channel = ch.channel AND cs.purpose = 'marketing'
       LEFT JOIN engage.identifiers i ON i.organization_id = $1 AND i.profile_id = $2 AND i.type = ch.identifier AND i.is_active`,
    [orgId, profileId])).rows;
  const consent: Record<string, string> = {};
  const reachable: Record<string, boolean> = {};
  for (const row of r) {
    if (row.status) consent[row.channel] = row.status;
    reachable[row.channel] = reachable[row.channel] === true || (row.status === 'granted' && row.value !== null && !row.suppressed);
  }
  return { consent, reachable };
}

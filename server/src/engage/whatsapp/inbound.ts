import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import type { InboundMessage } from '../messaging/adapter.js';
import { recordConsentOn } from '../profiles.js';
import { isOptOutText } from './format.js';

/**
 * What customers send us on WhatsApp, as far as opt-outs go (WP-27, ADR-023). A customer who writes STOP (or a word like it,
 * as the whole message), or who stops marketing messages in the WhatsApp app (Meta's user_preferences webhook), has their
 * WhatsApp consent revoked at once, in the transaction that receives it: the send gate then denies the next marketing message,
 * and the phone number is suppressed for WhatsApp like any STOP (the same rule as an SMS STOP, ADR-004).
 *
 * Each delivery is recorded once (engage.inbound_events, by the provider's id), so Meta's retries change nothing. Nothing
 * of the message is kept except what it did. A customer who "resumes" marketing in the app is not re-granted: consent needs
 * the tenant's own proof. A message that names no phone number (a user known only by an opaque id) cannot be matched here.
 */

export interface InboundSummary { received: number; optedOut: number; noOptOut: number; unmatched: number; duplicates: number; resumeIgnored: number }

/** The one way a channel opt-out reaches the consent ledger: a revocation from a STOP-like request of the customer. */
export function revokeFromRecipient(c: PoolClient, orgId: string, profileId: string, channel: 'whatsapp', evidence: Record<string, unknown>, at: Date): Promise<unknown> {
  return recordConsentOn(c, orgId, profileId, { channel, status: 'revoked', source: 'stop_keyword', evidence, recordedAt: new Date(Math.min(at.getTime(), Date.now())) });
}

export async function ingestInbound(orgId: string, provider: string, items: InboundMessage[]): Promise<InboundSummary> {
  const out: InboundSummary = { received: items.length, optedOut: 0, noOptOut: 0, unmatched: 0, duplicates: 0, resumeIgnored: 0 };
  if (items.length === 0) return out;
  await withEngageTenant(orgId, async (c) => {
    for (const it of items) {
      const wantsOut = it.kind === 'preference_stop' || (it.kind === 'text' && isOptOutText(it.text));
      let profileId: string | null = null;
      let outcome: 'opt_out_applied' | 'no_opt_out' | 'unmatched' | 'resume_ignored';
      if (it.kind === 'preference_resume') outcome = 'resume_ignored';
      else if (!wantsOut) outcome = 'no_opt_out';
      else {
        const found = it.from ? await c.query<{ profile_id: string }>(
          `SELECT i.profile_id FROM engage.identifiers i JOIN engage.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
            WHERE i.organization_id = $1 AND i.type = 'phone' AND i.value_normalized = $2 AND i.is_active AND p.erased_at IS NULL`, [orgId, it.from]) : null;
        profileId = found?.rows[0]?.profile_id ?? null;
        outcome = profileId ? 'opt_out_applied' : 'unmatched';
      }
      const ins = await c.query(
        `INSERT INTO engage.inbound_events (organization_id, provider, provider_event_id, channel, kind, outcome, profile_id, occurred_at)
         VALUES ($1, $2, $3, 'whatsapp', $4, $5, $6, $7) ON CONFLICT (organization_id, provider, provider_event_id) DO NOTHING RETURNING id`,
        [orgId, provider, it.providerEventId, it.kind, outcome, profileId, it.occurredAt]);
      if (!ins.rows[0]) { out.duplicates++; continue; }
      if (outcome === 'opt_out_applied') {
        await revokeFromRecipient(c, orgId, profileId!, 'whatsapp', { via: it.kind === 'text' ? 'whatsapp_stop_message' : 'whatsapp_user_preferences', provider_event_id: it.providerEventId }, it.occurredAt);
        out.optedOut++;
      } else if (outcome === 'unmatched') out.unmatched++;
      else if (outcome === 'resume_ignored') out.resumeIgnored++;
      else out.noOptOut++;
    }
  });
  return out;
}

import { withEngageTenant } from './db.js';
import { ProfileNotFoundError, getProfile, normalizeEmail, type ProfileView } from './profiles.js';

/**
 * Customer list and per-customer audit trail for tenant users (WP-19). Read only, inside the tenant's own context.
 * The trail answers "why did (or didn't) this person get this message": every message with its delivery events and
 * every send-gate decision, each decision with the consent record that was in force when it was taken, plus the
 * consent ledger, the address suppressions, the journeys the customer was in (step by step) and recent events.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export class ProfileListInputError extends Error {}

export interface ProfileListItem {
  id: string; externalId: string; email: string | null; emailConsent: 'granted' | 'revoked' | null;
  suppressed: boolean; erased: boolean; createdAt: string; lastEventAt: string | null;
}

/** Cursor: createdAt and id of the last row, base64url. Newest first. */
const encodeCursor = (createdAt: string, id: string) => Buffer.from(`${createdAt}|${id}`).toString('base64url');
function decodeCursor(raw: string): { createdAt: string; id: string } {
  const [createdAt, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id || !UUID_RE.test(id) || Number.isNaN(Date.parse(createdAt))) throw new ProfileListInputError('Invalid cursor');
  return { createdAt, id };
}

/**
 * Newest first, 1-100 per page. `q`: an email address (exact, any address the customer ever had) or the start of an
 * external id.
 */
export async function listProfiles(orgId: string, opts: { q?: string; cursor?: string; limit?: number } = {}): Promise<{ profiles: ProfileListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 100);
  const q = opts.q?.trim() ?? '';
  if (q.length > 200) throw new ProfileListInputError('Search is too long');
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const email = q.includes('@') ? normalizeEmail(q) : null;
  if (q.includes('@') && !email) return { profiles: [], nextCursor: null };
  const prefix = q && !email ? `${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;

  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(
      `SELECT p.id, p.external_id, p.created_at, p.erased_at, ie.value_normalized AS email, cs.status AS email_consent,
              EXISTS (SELECT 1 FROM engage.suppressions s WHERE s.organization_id = p.organization_id AND s.channel = 'email'
                       AND s.value_normalized = ie.value_normalized) AS suppressed,
              (SELECT max(e.occurred_at) FROM engage.events e WHERE e.organization_id = p.organization_id AND e.profile_id = p.id) AS last_event_at
         FROM engage.profiles p
         LEFT JOIN engage.identifiers ie ON ie.organization_id = p.organization_id AND ie.profile_id = p.id AND ie.type = 'email' AND ie.is_active
         LEFT JOIN engage.consent_state cs ON cs.organization_id = p.organization_id AND cs.profile_id = p.id AND cs.channel = 'email' AND cs.purpose = 'marketing'
        WHERE p.organization_id = $1
          AND ($2::text IS NULL OR p.external_id LIKE $2)
          AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM engage.identifiers i WHERE i.organization_id = p.organization_id AND i.profile_id = p.id
                                            AND i.type = 'email' AND i.value_normalized = $3))
          AND ($4::timestamptz IS NULL OR (p.created_at, p.id) < ($4::timestamptz, $5::uuid))
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $6`,
      [orgId, prefix, email, after?.createdAt ?? null, after?.id ?? null, limit + 1]);
    const rows = r.rows.slice(0, limit);
    const profiles = rows.map((x): ProfileListItem => ({
      id: x.id, externalId: x.external_id, email: x.email ?? null, emailConsent: x.email_consent ?? null,
      suppressed: x.suppressed, erased: Boolean(x.erased_at), createdAt: iso(x.created_at)!, lastEventAt: iso(x.last_event_at),
    }));
    const last = rows.at(-1);
    return { profiles, nextCursor: r.rows.length > limit && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null };
  });
}

export interface TrailConsent { id: string; channel: string; status: string; source: string; recordedAt: string; evidence: Record<string, unknown> }
export interface TrailDecision {
  id: string; decision: 'allow' | 'deny' | 'defer'; code: string; reasons: Array<Record<string, unknown>>; sendMode: string;
  createdAt: string; retryAt: string | null;
  /** The newest consent record for the message's channel at the time of the decision (null: there was none). */
  consentInForce: { id: string; status: string; source: string; recordedAt: string } | null;
}
export interface TrailMessage {
  id: string; channel: string; purpose: string; status: string; errorCode: string | null; createdAt: string;
  subject: string | null; template: { id: string; version: number } | null; renderError: string | null;
  journey: { enrollmentId: string; journeyKey: string; stepId: string } | null;
  events: Array<{ type: string; source: string; occurredAt: string; errorCode: string | null }>;
  decisions: TrailDecision[];
}
export interface TrailEnrollment {
  id: string; journeyKey: string; journeyName: string; version: number; status: string; endReason: string | null;
  cohort: string; triggerKind: string; enteredAt: string; endedAt: string | null; currentStep: string;
  steps: Array<{ stepId: string; stepType: string; status: string; outcome: string | null; startedAt: string; wakeAt: string | null; doneAt: string | null; messageId: string | null }>;
}
export interface ProfileTrail {
  profile: ProfileView;
  identifiers: Array<{ type: string; value: string; active: boolean; firstSeenAt: string; deactivatedAt: string | null }>;
  consents: TrailConsent[];
  suppressions: Array<{ channel: string; value: string; reason: string; createdAt: string }>;
  enrollments: TrailEnrollment[];
  messages: TrailMessage[];
  events: Array<{ id: string; name: string; occurredAt: string; receivedAt: string; properties: Record<string, unknown> }>;
}

export const TRAIL_LIMITS = { messages: 100, enrollments: 50, events: 100, consents: 200 } as const;

export async function getProfileTrail(orgId: string, profileId: string): Promise<ProfileTrail> {
  if (!UUID_RE.test(profileId)) throw new ProfileNotFoundError('Profile not found');
  const profile = await getProfile(orgId, profileId);
  return withEngageTenant(orgId, async (c) => {
    const args = [orgId, profileId];
    const identifiers = (await c.query(
      `SELECT type, value_normalized, is_active, first_seen_at, deactivated_at FROM engage.identifiers
        WHERE organization_id = $1 AND profile_id = $2 AND type IN ('email', 'phone') ORDER BY first_seen_at DESC`, args)).rows;
    const consents = (await c.query(
      `SELECT id, channel, status, source, recorded_at, evidence FROM engage.consents
        WHERE organization_id = $1 AND profile_id = $2 ORDER BY recorded_at DESC, id LIMIT ${TRAIL_LIMITS.consents}`, args)).rows;
    // Suppressions are per address: every address this customer ever had.
    const suppressions = (await c.query(
      `SELECT s.channel, s.value_normalized, s.reason, s.created_at FROM engage.suppressions s
        WHERE s.organization_id = $1 AND EXISTS (
          SELECT 1 FROM engage.identifiers i WHERE i.organization_id = s.organization_id AND i.profile_id = $2
             AND i.value_normalized = s.value_normalized AND (i.type = 'email') = (s.channel = 'email'))
        ORDER BY s.created_at DESC`, args)).rows;
    const enrollments = (await c.query(
      `SELECT e.id, j.key, j.name, v.version, e.status, e.end_reason, e.cohort, e.trigger_kind, e.entered_at, e.ended_at, e.current_step,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('stepId', s.step_id, 'stepType', s.step_type, 'status', s.status, 'outcome', s.outcome,
                         'startedAt', s.started_at, 'wakeAt', s.wake_at, 'doneAt', s.done_at, 'messageId', s.message_id) ORDER BY s.id)
                         FROM engage.enrollment_steps s WHERE s.organization_id = e.organization_id AND s.enrollment_id = e.id), '[]'::jsonb) AS steps
         FROM engage.enrollments e
         JOIN engage.journeys j ON j.organization_id = e.organization_id AND j.id = e.journey_id
         JOIN engage.journey_versions v ON v.organization_id = e.organization_id AND v.id = e.journey_version_id
        WHERE e.organization_id = $1 AND e.profile_id = $2 ORDER BY e.created_at DESC LIMIT ${TRAIL_LIMITS.enrollments}`, args)).rows;
    const messages = (await c.query(
      `SELECT m.id, m.channel, m.purpose, m.status, m.error_code, m.created_at,
              m.content->>'subject' AS subject, m.content->>'template_id' AS template_id, (m.content->>'template_version')::int AS template_version,
              m.content->'render_error'->>'code' AS render_error,
              st.enrollment_id, st.step_id, jj.key AS journey_key,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('type', me.type, 'source', me.source, 'occurredAt', me.occurred_at, 'errorCode', me.error_code) ORDER BY me.id)
                         FROM engage.message_events me WHERE me.organization_id = m.organization_id AND me.message_id = m.id), '[]'::jsonb) AS events,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id::text, 'decision', d.decision, 'code', d.code, 'reasons', d.reasons,
                           'sendMode', d.send_mode, 'createdAt', d.created_at, 'retryAt', d.retry_at,
                           'consentInForce', (SELECT jsonb_build_object('id', k.id, 'status', k.status, 'source', k.source, 'recordedAt', k.recorded_at)
                                                FROM engage.consents k
                                               WHERE k.organization_id = m.organization_id AND k.profile_id = m.profile_id AND k.channel = m.channel
                                                 AND k.recorded_at <= d.created_at
                                               ORDER BY k.recorded_at DESC, k.id DESC LIMIT 1)) ORDER BY d.id)
                         FROM engage.send_decisions d WHERE d.organization_id = m.organization_id AND d.message_id = m.id), '[]'::jsonb) AS decisions
         FROM engage.messages m
         LEFT JOIN engage.enrollment_steps st ON st.organization_id = m.organization_id AND st.message_id = m.id
         LEFT JOIN engage.enrollments en ON en.organization_id = st.organization_id AND en.id = st.enrollment_id
         LEFT JOIN engage.journeys jj ON jj.organization_id = en.organization_id AND jj.id = en.journey_id
        WHERE m.organization_id = $1 AND m.profile_id = $2 ORDER BY m.created_at DESC LIMIT ${TRAIL_LIMITS.messages}`, args)).rows;
    const events = (await c.query(
      `SELECT id, name, occurred_at, received_at, properties FROM engage.events
        WHERE organization_id = $1 AND profile_id = $2 ORDER BY occurred_at DESC LIMIT ${TRAIL_LIMITS.events}`, args)).rows;

    const isoDeep = <T extends Record<string, unknown>>(o: T, keys: string[]): T => {
      const out: Record<string, unknown> = { ...o };
      for (const k of keys) out[k] = iso(out[k]);
      return out as T;
    };
    return {
      profile,
      identifiers: identifiers.map((r) => ({ type: r.type, value: r.value_normalized, active: r.is_active, firstSeenAt: iso(r.first_seen_at)!, deactivatedAt: iso(r.deactivated_at) })),
      consents: consents.map((r) => ({ id: r.id, channel: r.channel, status: r.status, source: r.source, recordedAt: iso(r.recorded_at)!, evidence: r.evidence })),
      suppressions: suppressions.map((r) => ({ channel: r.channel, value: r.value_normalized, reason: r.reason, createdAt: iso(r.created_at)! })),
      enrollments: enrollments.map((r): TrailEnrollment => ({
        id: r.id, journeyKey: r.key, journeyName: r.name, version: r.version, status: r.status, endReason: r.end_reason ?? null,
        cohort: r.cohort, triggerKind: r.trigger_kind, enteredAt: iso(r.entered_at)!, endedAt: iso(r.ended_at), currentStep: r.current_step,
        steps: (r.steps as Array<Record<string, unknown>>).map((s) => isoDeep(s, ['startedAt', 'wakeAt', 'doneAt'])) as TrailEnrollment['steps'],
      })),
      messages: messages.map((r): TrailMessage => ({
        id: r.id, channel: r.channel, purpose: r.purpose, status: r.status, errorCode: r.error_code ?? null, createdAt: iso(r.created_at)!,
        subject: r.subject ?? null,
        template: r.template_id ? { id: r.template_id, version: r.template_version } : null,
        renderError: r.render_error ?? null,
        journey: r.enrollment_id ? { enrollmentId: r.enrollment_id, journeyKey: r.journey_key, stepId: r.step_id } : null,
        events: (r.events as Array<Record<string, unknown>>).map((e) => isoDeep(e, ['occurredAt'])) as TrailMessage['events'],
        decisions: (r.decisions as Array<Record<string, unknown>>).map((d) => ({
          ...isoDeep(d, ['createdAt', 'retryAt']),
          consentInForce: d.consentInForce ? isoDeep(d.consentInForce as Record<string, unknown>, ['recordedAt']) : null,
        })) as TrailDecision[],
      })),
      events: events.map((r) => ({ id: r.id, name: r.name, occurredAt: iso(r.occurred_at)!, receivedAt: iso(r.received_at)!, properties: r.properties })),
    };
  });
}

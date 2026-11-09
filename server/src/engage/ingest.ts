import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withEngageTenant } from './db.js';
import {
  ProfileInputError, recordConsentOn, upsertProfileOn,
  type ConsentInput, type ProfileView, type UpsertProfileInput,
} from './profiles.js';

/**
 * Ingestion (WP-08). Schemas are strict: an unknown field, including a body `organization_id`, is a 400. The tenant
 * is always the one the API key belongs to. Error messages name fields, never echo values (values can be personal data).
 */

export const RESERVED_EVENTS = ['cart_updated', 'checkout_started', 'order_completed', 'product_viewed', 'profile_attribute_changed'] as const;
export const MAX_BATCH = 500;
export const MAX_PROPERTIES_BYTES = 8_000;
const FUTURE_SKEW_MS = 5 * 60_000;
const MAX_AGE_MS = 399 * 24 * 3600_000;

const externalId = z.string().min(1).max(200);
const jsonObject = z.record(z.string(), z.unknown());
const sizeLimited = (max: number) => (v: Record<string, unknown>) => JSON.stringify(v).length <= max;

const consentSchema = z.object({
  channel: z.enum(['sms', 'email', 'call', 'whatsapp']),
  status: z.enum(['granted', 'revoked']),
  // The tenant may not claim sources only Messign itself can observe (iys, unsubscribe_link, stop_keyword).
  source: z.enum(['api', 'web', 'import']).default('api'),
  evidence: jsonObject.optional(),
  recorded_at: z.string().datetime({ offset: true }).optional(),
}).strict();

export const upsertSchema = z.object({
  external_id: externalId,
  identifiers: z.object({ email: z.string().max(320).nullable().optional(), phone: z.string().max(40).nullable().optional() }).strict().optional(),
  attributes: jsonObject.refine(sizeLimited(32_000), 'attributes are too large (max 32 KB)').optional(),
  timezone: z.string().max(64).nullable().optional(),
  locale: z.string().max(35).nullable().optional(),
  consents: z.array(consentSchema).max(8).optional(),
  // Accepted for forward compatibility; profile upserts start no journeys yet (attribute triggers are WP-25).
  skip_triggers: z.boolean().optional(),
}).strict();

const eventSchema = z.object({
  client_event_id: z.string().min(1).max(200),
  external_id: externalId,
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'name must be lower_snake_case, up to 64 characters'),
  occurred_at: z.string().datetime({ offset: true }),
  properties: jsonObject.refine(sizeLimited(MAX_PROPERTIES_BYTES), `properties are too large (max ${MAX_PROPERTIES_BYTES} bytes)`).default({}),
}).strict();

export const trackSchema = z.object({ events: z.array(eventSchema).min(1).max(MAX_BATCH) }).strict();

export const triggerSchema = z.object({
  external_id: externalId,
  idempotency_key: z.string().min(1).max(200),
  payload: jsonObject.refine(sizeLimited(MAX_PROPERTIES_BYTES), 'payload is too large').default({}),
  create_if_missing: z.boolean().optional(),
}).strict();

/** Field paths and messages only. Never the offending value. */
export function describeIssues(err: z.ZodError): Array<{ path: string; message: string }> {
  return err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.') || '(body)', message: i.message }));
}

const reservedChecks: Record<string, (p: Record<string, unknown>) => string | null> = {
  cart_updated: (p) => (typeof p.cart_id === 'string' && Array.isArray(p.items) && p.items.length <= 200 ? null : 'cart_updated needs cart_id (string) and items (array, max 200)'),
  checkout_started: (p) => (typeof p.cart_id === 'string' ? null : 'checkout_started needs cart_id (string)'),
  order_completed: (p) => (typeof p.order_id === 'string' ? null : 'order_completed needs order_id (string)'),
  product_viewed: (p) => (typeof p.product_id === 'string' ? null : 'product_viewed needs product_id (string)'),
  profile_attribute_changed: (p) => (typeof p.attribute === 'string' ? null : 'profile_attribute_changed needs attribute (string)'),
};

export interface TrackResult {
  client_event_id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  duplicate?: true;
  error?: string;
}

export async function upsertFromApi(orgId: string, body: z.infer<typeof upsertSchema>): Promise<ProfileView> {
  const input: UpsertProfileInput = {
    externalId: body.external_id,
    email: body.identifiers?.email,
    phone: body.identifiers?.phone,
    attributes: body.attributes,
    timezone: body.timezone,
    locale: body.locale,
  };
  return withEngageTenant(orgId, async (c) => {
    let view = await upsertProfileOn(c, orgId, input);
    for (const consent of body.consents ?? []) {
      const ci: ConsentInput = {
        channel: consent.channel, status: consent.status, source: consent.source, evidence: consent.evidence,
        recordedAt: consent.recorded_at ? new Date(consent.recorded_at) : undefined,
      };
      if (ci.status === 'granted' && Object.keys(ci.evidence ?? {}).length === 0) {
        throw new ProfileInputError('A consent needs evidence (source, text version, timestamp, IP or channel)');
      }
      view = await recordConsentOn(c, orgId, view.id, ci);
    }
    return view;
  });
}

/**
 * Store a batch. Per event: validate, resolve the profile, claim the dedup key, insert the event, insert the outbox
 * row. Each event runs in its own savepoint inside one transaction, so a rejected event leaves no trace, while an
 * unexpected database error rolls back and fails the whole request (the caller retries; dedup makes that safe).
 */
export async function trackEvents(orgId: string, events: Array<z.infer<typeof eventSchema>>): Promise<TrackResult[]> {
  const now = Date.now();
  return withEngageTenant(orgId, async (c) => {
    const profiles = new Map<string, string | null>();
    const out: TrackResult[] = [];
    for (const [i, ev] of events.entries()) {
      const reject = (error: string) => out.push({ client_event_id: ev.client_event_id, status: 'rejected', error });
      const at = new Date(ev.occurred_at).getTime();
      if (at > now + FUTURE_SKEW_MS) { reject('occurred_at is in the future'); continue; }
      if (at < now - MAX_AGE_MS) { reject('occurred_at is older than the retention window'); continue; }
      const problem = reservedChecks[ev.name]?.(ev.properties);
      if (problem) { reject(problem); continue; }
      if (!profiles.has(ev.external_id)) profiles.set(ev.external_id, await findLiveProfileId(c, orgId, ev.external_id));
      const profileId = profiles.get(ev.external_id);
      if (!profileId) { reject('unknown or erased profile (upsert it first)'); continue; }

      const sp = `ev${i}`;
      await c.query(`SAVEPOINT ${sp}`);
      await c.query('SELECT engage.ensure_event_partition($1)', [ev.occurred_at]);
      const key = await c.query<{ event_id: string }>(
        `INSERT INTO engage.event_keys (organization_id, client_event_id, event_id, occurred_at)
         VALUES ($1, $2, gen_random_uuid(), $3) ON CONFLICT (organization_id, client_event_id) DO NOTHING RETURNING event_id`,
        [orgId, ev.client_event_id, ev.occurred_at]);
      if (key.rowCount === 0) {
        await c.query(`RELEASE SAVEPOINT ${sp}`);
        out.push({ client_event_id: ev.client_event_id, status: 'duplicate', duplicate: true });
        continue;
      }
      const eventId = key.rows[0]!.event_id;
      await c.query(
        `INSERT INTO engage.events (organization_id, id, profile_id, client_event_id, name, properties, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [orgId, eventId, profileId, ev.client_event_id, ev.name, JSON.stringify(ev.properties), ev.occurred_at]);
      await c.query(
        `INSERT INTO engage.trigger_outbox (organization_id, event_id, occurred_at) VALUES ($1, $2, $3)`,
        [orgId, eventId, ev.occurred_at]);
      await c.query(`RELEASE SAVEPOINT ${sp}`);
      out.push({ client_event_id: ev.client_event_id, status: 'accepted' });
    }
    return out;
  });
}

async function findLiveProfileId(c: PoolClient, orgId: string, externalIdValue: string): Promise<string | null> {
  const r = await c.query<{ id: string }>(
    `SELECT id FROM engage.profiles WHERE organization_id = $1 AND external_id = $2 AND erased_at IS NULL`, [orgId, externalIdValue]);
  return r.rows[0]?.id ?? null;
}

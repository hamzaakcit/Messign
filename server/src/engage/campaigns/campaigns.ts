import { createHash } from 'crypto';
import { withEngageTenant } from '../db.js';
import { currentSendMode, REQUIRED_READINESS, type SendMode } from '../messaging/gate.js';
import { enroll } from '../journeys/enroll.js';
import { unsubscribeConfigProblems } from '../unsubscribe.js';
import type { JourneyDefinition } from '../journeys/definition.js';
import { JourneyConflictError, activateJourneyVersionOn, approveJourneyVersionOn, createJourneyOn } from '../journeys/journeys.js';
import { buildSegmentQuery } from '../segments/compile.js';
import type { SegmentDefinition } from '../segments/definition.js';
import { MAX_SEGMENT_RUN, SEGMENT_CHUNK } from '../segments/runs.js';
import { countSegmentOn } from '../segments/segments.js';

/**
 * One-off campaigns (WP-38, ADR-018): send ONE template to ONE segment, once, now. A campaign is a one-step journey
 * (trigger `api`, one message step with the template version pinned) that is created, approved and activated in the same
 * transaction as its record, and whose audience is enrolled directly. So everything a journey has applies unchanged:
 * the send gate decides every message (consent, suppression, quiet hours, caps, sandbox allow-list, budget), the
 * holdout is drawn per customer, the results and the customer trail already read it, and the approval and activation
 * record who did it.
 *
 * What is added is care around a bulk action: a readiness check first (nothing is queued for a tenant that cannot send,
 * or it would all go at once when sending is later switched on), the audience is only customers with email consent, one
 * idempotency key means one campaign however often the request is repeated, and the audience is enrolled in chunks with
 * a cursor so an interrupted send resumes where it stopped.
 */

export class CampaignInputError extends Error {
  constructor(message: string, public readonly issues: Array<{ path: string; message: string }> = []) { super(message); }
}
export class CampaignNotFoundError extends Error {}
export interface ReadinessProblem { code: string; message: string }
export class CampaignNotReadyError extends Error {
  constructor(public readonly problems: ReadinessProblem[]) { super('Sending is not ready for this organization'); }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const CAMPAIGN_STEP_ID = 'send';

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

// ---------------------------------------------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------------------------------------------

export interface SendReadiness { sendMode: SendMode; ready: boolean; problems: ReadinessProblem[] }

/** What the send gate would hold or refuse for every message, checked once up front. */
async function readinessOn(c: Tx, orgId: string, mode: SendMode): Promise<SendReadiness> {
  const problems: ReadinessProblem[] = [];
  if (mode === 'off') problems.push({ code: 'send_mode_off', message: 'Sending is switched off on this server (SEND_MODE).' });
  const settings = (await c.query<{ send_enabled: boolean }>(`SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1`, [orgId])).rows[0];
  if (!settings?.send_enabled) problems.push({ code: 'tenant_send_disabled', message: 'Sending is not enabled for this organization yet.' });
  const accounts = (await c.query<{ mode: string }>(
    `SELECT mode FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'email' AND status = 'active' ORDER BY created_at LIMIT 2`, [orgId])).rows;
  if (accounts.length === 0) problems.push({ code: 'no_email_account', message: 'No email sending account is set up.' });
  else if (accounts.length > 1) problems.push({ code: 'email_account_ambiguous', message: 'More than one email sending account is active; keep exactly one.' });
  else if (mode !== 'off' && accounts[0]!.mode !== (mode === 'sandbox' ? 'test' : 'live')) {
    problems.push({ code: 'account_mode_mismatch', message: `The email account is in ${accounts[0]!.mode} mode, but sending runs in ${mode} mode.` });
  }
  // The gate blocks every message without a rate card and a monthly budget cap, so a campaign without them would only record blocks.
  const card = await c.query(`SELECT 1 FROM engage.rate_cards WHERE organization_id = $1 AND channel = 'email' AND category = 'marketing' AND effective_from <= now() LIMIT 1`, [orgId]);
  if (!card.rowCount) problems.push({ code: 'no_rate_card', message: 'No email rate card is set up (the cost of a marketing email).' });
  const cap = await c.query(`SELECT 1 FROM engage.budget_caps WHERE organization_id = $1 AND channel = 'email' LIMIT 1`, [orgId]);
  if (!cap.rowCount) problems.push({ code: 'no_budget_cap', message: 'No monthly email budget cap is set up.' });
  // A marketing email without a working unsubscribe link must not be created, so without the public origins no message can be.
  const links = unsubscribeConfigProblems();
  if (links.length) problems.push({ code: 'public_links_missing', message: `Unsubscribe links cannot be built: ${links.join('; ')}.` });
  if (mode === 'live') {
    const have = new Set((await c.query<{ item: string }>(`SELECT item FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email'`, [orgId])).rows.map((r) => r.item));
    const missing = REQUIRED_READINESS.email.filter((i) => !have.has(i));
    if (missing.length) problems.push({ code: 'readiness_missing', message: `Readiness items not recorded yet: ${missing.join(', ')}.` });
  }
  return { sendMode: mode, ready: problems.length === 0, problems };
}

export async function getSendReadiness(orgId: string, mode: SendMode = currentSendMode()): Promise<SendReadiness> {
  return withEngageTenant(orgId, (c) => readinessOn(c, orgId, mode));
}

// ---------------------------------------------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------------------------------------------

/** Who actually receives a campaign: the segment's customers that have email consent. The gate checks consent again. */
export function audienceOf(def: SegmentDefinition): SegmentDefinition {
  return { where: { all: [def.where, { field: 'consent.email', op: 'eq', value: 'granted' }] } };
}

interface Loaded {
  template: { id: string; key: string; name: string; version: number; subject: string; hasUnsubscribe: boolean };
  segment: { id: string; key: string; name: string; version: number; definition: SegmentDefinition };
}

async function loadTemplateAndSegment(c: Tx, orgId: string, templateId: string, segmentId: string): Promise<Loaded> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!UUID_RE.test(templateId)) issues.push({ path: 'templateId', message: 'choose a template' });
  if (!UUID_RE.test(segmentId)) issues.push({ path: 'segmentId', message: 'choose a segment' });
  if (issues.length) throw new CampaignInputError('The campaign is not valid', issues);
  const t = (await c.query<{ id: string; key: string; name: string; version: number; subject: string; has_unsubscribe: boolean }>(
    `SELECT t.id, t.key, t.name, v.version, v.subject,
            EXISTS (SELECT 1 FROM jsonb_array_elements(v.variables) x WHERE x->>'name' = 'unsubscribe_url') AS has_unsubscribe
       FROM engage.templates t JOIN engage.template_versions v ON v.organization_id = t.organization_id AND v.template_id = t.id
      WHERE t.organization_id = $1 AND t.id = $2 ORDER BY v.version DESC LIMIT 1`, [orgId, templateId])).rows[0];
  if (!t) throw new CampaignInputError('The campaign is not valid', [{ path: 'templateId', message: 'this template does not exist' }]);
  const s = (await c.query<{ id: string; key: string; name: string; version: number; definition: SegmentDefinition }>(
    `SELECT s.id, s.key, s.name, v.version, v.definition
       FROM engage.segments s JOIN engage.segment_versions v ON v.organization_id = s.organization_id AND v.segment_id = s.id
      WHERE s.organization_id = $1 AND s.id = $2 ORDER BY v.version DESC LIMIT 1`, [orgId, segmentId])).rows[0];
  if (!s) throw new CampaignInputError('The campaign is not valid', [{ path: 'segmentId', message: 'this segment does not exist' }]);
  return {
    template: { id: t.id, key: t.key, name: t.name, version: Number(t.version), subject: t.subject, hasUnsubscribe: t.has_unsubscribe },
    segment: { id: s.id, key: s.key, name: s.name, version: Number(s.version), definition: s.definition },
  };
}

export interface CampaignPreview {
  template: { id: string; key: string; name: string; version: number; subject: string; hasUnsubscribeLink: boolean };
  segment: { id: string; key: string; name: string; version: number };
  audience: { inSegment: number; withConsent: number; sample: Array<{ id: string; externalId: string }>; cap: number; overCap: boolean };
  readiness: SendReadiness;
}

/** What a send would do, without doing anything: the audience, the template, and whether sending is ready. */
export async function previewCampaign(orgId: string, input: { templateId: string; segmentId: string }, now: Date = new Date()): Promise<CampaignPreview> {
  return withEngageTenant(orgId, async (c) => {
    const { template, segment } = await loadTemplateAndSegment(c, orgId, input.templateId, input.segmentId);
    const inSegment = await countSegmentOn(c, orgId, segment.definition, now, 1);
    const receiving = await countSegmentOn(c, orgId, audienceOf(segment.definition), now, 5);
    return {
      template: { id: template.id, key: template.key, name: template.name, version: template.version, subject: template.subject, hasUnsubscribeLink: template.hasUnsubscribe },
      segment: { id: segment.id, key: segment.key, name: segment.name, version: segment.version },
      audience: { inSegment: inSegment.count, withConsent: receiving.count, sample: receiving.sample, cap: MAX_SEGMENT_RUN, overCap: receiving.count > MAX_SEGMENT_RUN },
      readiness: await readinessOn(c, orgId, currentSendMode()),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------------------------------

export type CampaignStatus = 'sending' | 'sent' | 'failed';
export interface CampaignView {
  id: string; journeyId: string; name: string; templateKey: string; templateVersion: number; segmentKey: string; segmentVersion: number;
  holdoutPercent: number; status: CampaignStatus; matched: number; enrolled: number; skipped: number; truncated: boolean; error: string | null;
  createdBy: string | null; createdAt: string; finishedAt: string | null;
}
const COLS = `id, journey_id, name, template_key, template_version, segment_key, segment_version, holdout_percent, status, matched, enrolled, skipped,
              truncated, error_code, created_by, created_at, finished_at`;
function toView(r: Record<string, unknown>): CampaignView {
  return {
    id: String(r.id), journeyId: String(r.journey_id), name: String(r.name), templateKey: String(r.template_key), templateVersion: Number(r.template_version),
    segmentKey: String(r.segment_key), segmentVersion: Number(r.segment_version), holdoutPercent: Number(r.holdout_percent), status: r.status as CampaignStatus,
    matched: Number(r.matched), enrolled: Number(r.enrolled), skipped: Number(r.skipped), truncated: Boolean(r.truncated), error: (r.error_code as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null, createdAt: iso(r.created_at)!, finishedAt: iso(r.finished_at),
  };
}

/** Chunk size, the audience cap and a hook after each chunk: the defaults are what runs; the options exist for tests. */
export interface EnrollOptions { chunk?: number; maxRun?: number; onChunk?: () => Promise<void> }

export interface StartCampaignInput { name: unknown; templateId: unknown; segmentId: unknown; holdoutPercent?: unknown; idempotencyKey: unknown }

function checkInput(input: StartCampaignInput): { name: string; templateId: string; segmentId: string; holdoutPercent: number; idempotencyKey: string } {
  const issues: Array<{ path: string; message: string }> = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 1 || name.length > 190) issues.push({ path: 'name', message: 'name must be 1-190 characters' });
  const holdout = input.holdoutPercent === undefined ? 0 : input.holdoutPercent;
  if (typeof holdout !== 'number' || !Number.isInteger(holdout) || holdout < 0 || holdout > 50) issues.push({ path: 'holdoutPercent', message: 'holdout must be a whole number from 0 to 50' });
  const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : '';
  if (!IDEMPOTENCY_RE.test(key)) issues.push({ path: 'idempotencyKey', message: 'idempotency key must be 8-128 of A-Z, a-z, 0-9, _ or -' });
  if (typeof input.templateId !== 'string' || !UUID_RE.test(input.templateId)) issues.push({ path: 'templateId', message: 'choose a template' });
  if (typeof input.segmentId !== 'string' || !UUID_RE.test(input.segmentId)) issues.push({ path: 'segmentId', message: 'choose a segment' });
  if (issues.length) throw new CampaignInputError('The campaign is not valid', issues);
  return { name, templateId: input.templateId as string, segmentId: input.segmentId as string, holdoutPercent: holdout as number, idempotencyKey: key };
}

/** The journey key of a campaign: derived from the idempotency key, so a repeated request meets its own journey. */
export function campaignJourneyKey(idempotencyKey: string): string {
  return `campaign-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`;
}

async function findByKey(orgId: string, idempotencyKey: string): Promise<CampaignView | null> {
  const r = await withEngageTenant(orgId, (c) => c.query(`SELECT ${COLS} FROM engage.campaigns WHERE organization_id = $1 AND idempotency_key = $2`, [orgId, idempotencyKey]));
  return r.rows[0] ? toView(r.rows[0]) : null;
}

/**
 * Creates the campaign (journey and record, in one transaction) and enrolls its audience. Repeating a request with the
 * same idempotency key returns the same campaign and changes nothing. Throws CampaignNotReadyError before anything is
 * written when sending is not ready.
 */
export async function startCampaign(orgId: string, userId: string, input: StartCampaignInput, opts: EnrollOptions = {}): Promise<{ campaign: CampaignView; replayed: boolean }> {
  const v = checkInput(input);
  const seen = await findByKey(orgId, v.idempotencyKey);
  if (seen) return { campaign: seen, replayed: true };

  let created: CampaignView;
  try {
    created = await withEngageTenant(orgId, async (c) => {
      const readiness = await readinessOn(c, orgId, currentSendMode());
      if (!readiness.ready) throw new CampaignNotReadyError(readiness.problems);
      const { template, segment } = await loadTemplateAndSegment(c, orgId, v.templateId, v.segmentId);
      const audience = await countSegmentOn(c, orgId, audienceOf(segment.definition), new Date(), 1);
      if (audience.count === 0) throw new CampaignInputError('Nobody would receive this campaign', [{ path: 'segmentId', message: 'no customer in this segment has email consent' }]);
      const definition: JourneyDefinition = {
        trigger: { type: 'api' }, exit_when: [], re_entry: 'never', holdout_percent: v.holdoutPercent,
        steps: [{ id: CAMPAIGN_STEP_ID, type: 'message', channel: 'email', template: template.key, template_version: template.version, purpose: 'marketing' }],
      };
      const { journey } = await createJourneyOn(c, orgId, userId, { key: campaignJourneyKey(v.idempotencyKey), name: `Campaign: ${v.name}`, definition });
      await approveJourneyVersionOn(c, orgId, userId, journey.id, 1);
      await activateJourneyVersionOn(c, orgId, userId, journey.id, 1);
      const ins = await c.query(
        `INSERT INTO engage.campaigns (organization_id, journey_id, name, template_key, template_version, segment_key, segment_version, holdout_percent, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLS}`,
        [orgId, journey.id, v.name, template.key, template.version, segment.key, segment.version, v.holdoutPercent, v.idempotencyKey, userId]);
      return toView(ins.rows[0]);
    });
  } catch (err) {
    // A concurrent request with the same key created it first: this one is a repeat.
    if (err instanceof JourneyConflictError) {
      const again = await findByKey(orgId, v.idempotencyKey);
      if (again) return { campaign: again, replayed: true };
    }
    throw err;
  }
  return { campaign: await enrollCampaign(orgId, created.id, opts), replayed: false };
}

/**
 * Enrolls the audience in chunks, each chunk one transaction that holds the campaign row, reads the cursor from it and
 * updates it with the chunk's counts. An interrupted campaign is finished by calling this again: it continues after the
 * cursor, and the enrollment key (campaign, customer) makes a repeat harmless.
 */
export async function enrollCampaign(orgId: string, campaignId: string, opts: EnrollOptions = {}): Promise<CampaignView> {
  const chunk = opts.chunk ?? SEGMENT_CHUNK;
  const maxRun = opts.maxRun ?? MAX_SEGMENT_RUN;
  for (;;) {
    const done = await withEngageTenant(orgId, async (c) => {
      const k = (await c.query<Record<string, unknown>>(`SELECT ${COLS}, last_profile_id FROM engage.campaigns WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, campaignId])).rows[0];
      if (!k) throw new CampaignNotFoundError('Campaign not found');
      if (k.status !== 'sending') return true;
      const active = (await c.query<{ id: string; definition: JourneyDefinition }>(
        `SELECT id, definition FROM engage.journey_versions WHERE organization_id = $1 AND journey_id = $2 AND activated_at IS NOT NULL AND deactivated_at IS NULL`, [orgId, k.journey_id]
      )).rows[0];
      if (!active) {
        // The journey was stopped from outside the campaign: the send ends where it is, and nothing more is enrolled.
        await c.query(`UPDATE engage.campaigns SET status = 'failed', finished_at = clock_timestamp(), error_code = 'journey_stopped' WHERE organization_id = $1 AND id = $2`, [orgId, campaignId]);
        return true;
      }
      const segDef = (await c.query<{ definition: SegmentDefinition }>(
        `SELECT v.definition FROM engage.segments s JOIN engage.segment_versions v ON v.organization_id = s.organization_id AND v.segment_id = s.id
          WHERE s.organization_id = $1 AND s.key = $2 AND v.version = $3`, [orgId, k.segment_key, k.segment_version])).rows[0]?.definition;
      if (!segDef) {
        await c.query(`UPDATE engage.campaigns SET status = 'failed', finished_at = clock_timestamp(), error_code = 'segment_missing' WHERE organization_id = $1 AND id = $2`, [orgId, campaignId]);
        return true;
      }
      const at = new Date(k.created_at as string); // the audience is the one asked for, whenever a resume happens
      const matched = Number(k.matched);
      const limit = Math.min(chunk, maxRun - matched);
      const audience = audienceOf(segDef);
      const q = buildSegmentQuery(audience, orgId, at, { mode: 'ids', afterId: (k.last_profile_id as string | null) ?? null, limit: Math.max(limit, 1) });
      const ids = limit > 0 ? (await c.query<{ id: string }>(q.text, q.params)).rows.map((r) => r.id) : [];
      let enrolled = 0; let skipped = 0;
      const now = new Date();
      for (const profileId of ids) {
        const out = await enroll(c, orgId, {
          journeyId: String(k.journey_id), versionId: active.id, profileId, kind: 'api', key: `campaign:${campaignId}:${profileId}`, requestHash: null,
          payload: { campaign: campaignId }, enteredAt: at, definition: active.definition, now,
        });
        if ('id' in out) enrolled++; else skipped++;
      }
      const last = ids.at(-1) ?? null;
      const reachedCap = matched + ids.length >= maxRun;
      let truncated = false;
      if (reachedCap && last) {
        const more = buildSegmentQuery(audience, orgId, at, { mode: 'ids', afterId: last, limit: 1 });
        truncated = (await c.query(more.text, more.params)).rowCount! > 0;
      }
      const finished = ids.length < limit || reachedCap || limit <= 0;
      await c.query(
        `UPDATE engage.campaigns SET matched = matched + $3, enrolled = enrolled + $4, skipped = skipped + $5,
                last_profile_id = COALESCE($6::uuid, last_profile_id), truncated = truncated OR $8,
                status = CASE WHEN $7 THEN 'sent' ELSE status END, finished_at = CASE WHEN $7 THEN clock_timestamp() END
          WHERE organization_id = $1 AND id = $2`,
        [orgId, campaignId, ids.length, enrolled, skipped, last, finished, truncated]);
      return finished;
    });
    if (done) break;
    await opts.onChunk?.();
  }
  return getCampaign(orgId, campaignId);
}

export interface CampaignOutcome {
  /** Messages created so far (a customer in the holdout, or one still waiting for the executor, has none). */
  messages: number;
  byStatus: Record<string, number>;
  heldOut: number;
  /** The send gate's reason for each blocked message, as the gate recorded it. */
  blockedBecause: Record<string, number>;
  /** Customers still to be processed, or messages still to be sent: the numbers can still change. */
  inFlight: boolean;
}

/** What happened to the campaign's messages, read from the same tables the customer trail reads. */
async function outcomeOn(c: Tx, orgId: string, journeyId: string): Promise<CampaignOutcome> {
  const e = (await c.query<{ held: number; active: number }>(
    `SELECT count(*) FILTER (WHERE cohort = 'holdout')::int AS held, count(*) FILTER (WHERE status = 'active')::int AS active
       FROM engage.enrollments WHERE organization_id = $1 AND journey_id = $2`, [orgId, journeyId])).rows[0]!;
  const byStatus: Record<string, number> = {};
  for (const r of (await c.query<{ status: string; n: number }>(
    `SELECT m.status, count(*)::int AS n
       FROM engage.enrollments en
       JOIN engage.enrollment_steps s ON s.organization_id = en.organization_id AND s.enrollment_id = en.id
       JOIN engage.messages m ON m.organization_id = s.organization_id AND m.id = s.message_id
      WHERE en.organization_id = $1 AND en.journey_id = $2 GROUP BY m.status`, [orgId, journeyId])).rows) byStatus[r.status] = r.n;
  const blockedBecause: Record<string, number> = {};
  for (const r of (await c.query<{ code: string; n: number }>(
    `SELECT d.code, count(*)::int AS n FROM (
        SELECT DISTINCT ON (d.message_id) d.message_id, d.decision, d.code
          FROM engage.send_decisions d
          JOIN engage.enrollment_steps s ON s.organization_id = d.organization_id AND s.message_id = d.message_id
          JOIN engage.enrollments en ON en.organization_id = s.organization_id AND en.id = s.enrollment_id
         WHERE d.organization_id = $1 AND en.journey_id = $2
         ORDER BY d.message_id, d.created_at DESC, d.id DESC) d
      WHERE d.decision = 'deny' GROUP BY d.code`, [orgId, journeyId])).rows) blockedBecause[r.code] = r.n;
  const messages = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { messages, byStatus, heldOut: e.held, blockedBecause, inFlight: e.active > 0 || (byStatus.queued ?? 0) + (byStatus.sending ?? 0) > 0 };
}

export async function listCampaigns(orgId: string, limit = 100): Promise<CampaignView[]> {
  const r = await withEngageTenant(orgId, (c) => c.query(
    `SELECT ${COLS} FROM engage.campaigns WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`, [orgId, Math.min(Math.max(limit, 1), 200)]));
  return r.rows.map(toView);
}

/** One campaign with what happened to its messages. */
export async function getCampaignWithOutcome(orgId: string, campaignId: string): Promise<{ campaign: CampaignView; outcome: CampaignOutcome }> {
  const campaign = await getCampaign(orgId, campaignId);
  return { campaign, outcome: await withEngageTenant(orgId, (c) => outcomeOn(c, orgId, campaign.journeyId)) };
}

export async function getCampaign(orgId: string, campaignId: string): Promise<CampaignView> {
  if (!UUID_RE.test(campaignId)) throw new CampaignNotFoundError('Campaign not found');
  const r = await withEngageTenant(orgId, (c) => c.query(`SELECT ${COLS} FROM engage.campaigns WHERE organization_id = $1 AND id = $2`, [orgId, campaignId]));
  if (!r.rows[0]) throw new CampaignNotFoundError('Campaign not found');
  return toView(r.rows[0]);
}

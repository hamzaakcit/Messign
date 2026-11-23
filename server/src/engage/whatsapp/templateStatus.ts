import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import type { RemoteTemplate, TemplateStatusUpdate } from '../messaging/adapter.js';
import type { WaTemplateContent } from './render.js';

/**
 * The tenant's copy of what Meta says about each WhatsApp template (WP-40a, ADR-025): written by the template check (a listing of the
 * WhatsApp Business Account) and by Meta's message_template_status_update webhook, read by the send gate and the Settings screen.
 * Only an APPROVED template can be sent. History is one row per change in whatsapp_template_events, idempotent on Meta's own event.
 */

type Tx = PoolClient;

export interface TemplateShape {
  bodyText?: string | null; bodyVariables?: number; headerFormat?: string | null; headerText?: string | null; headerVariables?: number;
  urlButtonVariables?: number; buttons?: string[]; parameterFormat?: 'POSITIONAL' | 'NAMED';
}
export interface TemplateStatus {
  metaName: string; language: string; providerTemplateId: string | null; status: string; category: string | null; correctCategory: string | null;
  quality: string | null; rejectedReason: string | null; shape: TemplateShape; source: 'sync' | 'webhook'; changedAt: string; seenAt: string;
}

const iso = (v: unknown): string => new Date(v as string).toISOString();
const COLS = `meta_name, language, meta_template_id, status, category, correct_category, quality, rejected_reason, shape, source, changed_at, seen_at`;
const toStatus = (r: Record<string, unknown>): TemplateStatus => ({
  metaName: String(r.meta_name), language: String(r.language), providerTemplateId: (r.meta_template_id as string | null) ?? null, status: String(r.status),
  category: (r.category as string | null) ?? null, correctCategory: (r.correct_category as string | null) ?? null, quality: (r.quality as string | null) ?? null,
  rejectedReason: (r.rejected_reason as string | null) ?? null, shape: (r.shape as TemplateShape) ?? {}, source: r.source as 'sync' | 'webhook',
  changedAt: iso(r.changed_at), seenAt: iso(r.seen_at),
});

export const isSendableStatus = (status: string): boolean => status === 'APPROVED';

/**
 * The category that decides what a message is: Meta's own answer when known (the corrected category if Meta recategorized the
 * template), else the author's declaration. A MARKETING category can never be sent as transactional (the gate).
 */
export function effectiveCategory(status: Pick<TemplateStatus, 'category' | 'correctCategory'> | null, declared: 'marketing' | 'utility'): 'marketing' | 'utility' | 'authentication' {
  const meta = (status?.correctCategory ?? status?.category ?? '').toUpperCase();
  if (meta === 'MARKETING') return 'marketing';
  if (meta === 'AUTHENTICATION') return 'authentication';
  if (meta === 'UTILITY') return 'utility';
  return declared;
}

/**
 * Problems between how the platform fills a template and the shape Meta reports for it: each would make Meta refuse the message
 * (wa_132000 and friends), so they are found before sending. An empty list when Meta's shape is not known yet.
 */
export function mappingProblems(mapping: { body: number; header: number; urlButton: number }, shape: TemplateShape): string[] {
  if (shape.bodyVariables === undefined) return [];
  const out: string[] = [];
  if (shape.parameterFormat === 'NAMED') out.push('named_parameters_unsupported');
  if (shape.bodyVariables !== mapping.body) out.push('body_variable_count');
  if (shape.headerFormat && shape.headerFormat !== 'TEXT') out.push('unsupported_header');
  else if ((shape.headerVariables ?? 0) !== mapping.header) out.push('header_variable_count');
  if ((shape.urlButtonVariables ?? 0) !== mapping.urlButton) out.push('url_button_variable_count');
  if ((shape.buttons ?? []).some((b) => !['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(b))) out.push('unsupported_button');
  return out;
}

export const mappingOf = (c: Pick<WaTemplateContent, 'variables' | 'header' | 'urlButton'>) => ({
  body: c.variables.length, header: c.header?.variable ? 1 : 0, urlButton: c.urlButton ? 1 : 0,
});

/** Informational: the registered body text is not the text Meta approved (the mapping may be for another version of the template). */
export function bodyTextDiffers(content: Pick<WaTemplateContent, 'bodyText'>, shape: TemplateShape): boolean {
  if (typeof shape.bodyText !== 'string') return false;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(shape.bodyText) !== norm(content.bodyText);
}

export async function getTemplateStatusOn(c: Tx, orgId: string, metaName: string, language: string): Promise<TemplateStatus | null> {
  const r = await c.query(`SELECT ${COLS} FROM engage.whatsapp_template_status WHERE organization_id = $1 AND meta_name = $2 AND language = $3`, [orgId, metaName, language]);
  return r.rows[0] ? toStatus(r.rows[0]) : null;
}

export async function listTemplateStatuses(orgId: string): Promise<TemplateStatus[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(`SELECT ${COLS} FROM engage.whatsapp_template_status WHERE organization_id = $1 ORDER BY meta_name, language`, [orgId])).rows.map(toStatus));
}

export interface TemplateCheckState { lastAttemptAt: string | null; lastOkAt: string | null; lastError: string | null; consecutiveFailures: number; templatesSeen: number }
export async function getTemplateCheckState(orgId: string): Promise<TemplateCheckState> {
  const r = (await withEngageTenant(orgId, (c) => c.query(
    `SELECT last_attempt_at, last_ok_at, last_error, consecutive_failures, templates_seen FROM engage.whatsapp_template_checks WHERE organization_id = $1`, [orgId]))).rows[0];
  return {
    lastAttemptAt: r?.last_attempt_at ? iso(r.last_attempt_at) : null, lastOkAt: r?.last_ok_at ? iso(r.last_ok_at) : null,
    lastError: r?.last_error ?? null, consecutiveFailures: Number(r?.consecutive_failures ?? 0), templatesSeen: Number(r?.templates_seen ?? 0),
  };
}

// --- applying what Meta says ---------------------------------------------------------------------------------------------------

interface Row { id: string; status: string; category: string | null; correct_category: string | null; quality: string | null; rejected_reason: string | null; meta_template_id: string | null; changed_at: Date; shape: TemplateShape }
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Applies a full listing: new templates are recorded, changed ones updated (a change of status or category leaves an event),
 * and, when the listing is complete, a template Meta no longer lists is marked DELETED. A webhook that is newer than the listing's
 * own time for a template is not overwritten by it.
 */
export async function applyRemoteTemplates(c: Tx, orgId: string, list: RemoteTemplate[], now: Date, complete: boolean): Promise<{ seen: number; changed: number }> {
  const existing = new Map((await c.query<Row & { meta_name: string; language: string }>(
    `SELECT id, meta_name, language, status, category, correct_category, quality, rejected_reason, meta_template_id, changed_at, shape
       FROM engage.whatsapp_template_status WHERE organization_id = $1 FOR UPDATE`, [orgId])).rows.map((r) => [`${r.meta_name}|${r.language}`, r]));
  const listed = new Set<string>();
  let changed = 0;
  const event = async (name: string, language: string, status: string, category: string | null, reason: string | null, key: string, at: Date) => {
    await c.query(
      `INSERT INTO engage.whatsapp_template_events (organization_id, event_key, meta_name, language, event, status, category, reason, source, applied, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sync', true, $9) ON CONFLICT (organization_id, event_key) DO NOTHING`,
      [orgId, key.slice(0, 200), name, language, `SYNC_${status}`.slice(0, 40), status, category, reason, at]);
  };
  for (const t of list) {
    const k = `${t.name}|${t.language}`;
    listed.add(k);
    const e = existing.get(k);
    const at = t.changedAt ?? now;
    const shape = JSON.stringify(t.shape);
    if (!e) {
      await c.query(
        `INSERT INTO engage.whatsapp_template_status (organization_id, meta_name, language, meta_template_id, status, category, correct_category, quality, rejected_reason, shape, source, changed_at, seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'sync', $11, $12)
         ON CONFLICT (organization_id, meta_name, language) DO NOTHING`,
        [orgId, t.name, t.language, t.providerTemplateId, t.status, t.category, t.correctCategory, t.quality, t.rejectedReason, shape, at, now]);
      await event(t.name, t.language, t.status, t.category, t.rejectedReason, `sync:${t.name}:${t.language}:${t.status}:${t.category ?? '-'}:${Math.floor(at.getTime() / 1000)}`, at);
      changed++;
      continue;
    }
    // A webhook newer than the listing's own time for this template is the fresher word.
    if (t.changedAt && t.changedAt.getTime() < e.changed_at.getTime()) {
      await c.query(`UPDATE engage.whatsapp_template_status SET seen_at = $2 WHERE id = $1`, [e.id, now]);
      continue;
    }
    const differs = !same(e.status, t.status) || !same(e.category, t.category) || !same(e.correct_category, t.correctCategory) || !same(e.quality, t.quality)
      || !same(e.rejected_reason, t.rejectedReason) || !same(e.meta_template_id, t.providerTemplateId) || JSON.stringify(e.shape) !== JSON.stringify(t.shape);
    await c.query(
      `UPDATE engage.whatsapp_template_status SET meta_template_id = $2, status = $3, category = $4, correct_category = $5, quality = $6, rejected_reason = $7,
              shape = $8::jsonb, source = CASE WHEN $9 THEN 'sync' ELSE source END, changed_at = CASE WHEN $9 THEN $10 ELSE changed_at END, seen_at = $11 WHERE id = $1`,
      [e.id, t.providerTemplateId, t.status, t.category, t.correctCategory, t.quality, t.rejectedReason, shape, differs, at, now]);
    if (differs) {
      changed++;
      if (!same(e.status, t.status) || !same(e.category, t.category) || !same(e.correct_category, t.correctCategory)) {
        await event(t.name, t.language, t.status, t.category, t.rejectedReason, `sync:${t.name}:${t.language}:${t.status}:${t.category ?? '-'}:${Math.floor(at.getTime() / 1000)}`, at);
      }
    }
  }
  if (complete) {
    for (const [k, e] of existing) {
      if (listed.has(k) || e.status === 'DELETED') continue;
      const [name, language] = k.split('|') as [string, string];
      await c.query(`UPDATE engage.whatsapp_template_status SET status = 'DELETED', source = 'sync', changed_at = $2, seen_at = $2 WHERE id = $1`, [e.id, now]);
      await event(name, language, 'DELETED', e.category, null, `sync:${name}:${language}:DELETED:${Math.floor(now.getTime() / 1000)}`, now);
      changed++;
    }
  }
  return { seen: list.length, changed };
}

/** What a Meta event does to the mirror: a new status, a quality warning, or nothing (the next check reads the truth). */
export function effectOfEvent(event: string): { status?: string; quality?: string } | null {
  switch (event) {
    case 'APPROVED': case 'REJECTED': case 'PAUSED': case 'DISABLED': case 'IN_APPEAL': case 'PENDING': case 'LIMIT_EXCEEDED':
    case 'LOCKED': case 'ARCHIVED': case 'DELETED': case 'PENDING_DELETION':
      return { status: event };
    case 'REINSTATED': return { status: 'APPROVED' };
    case 'FLAGGED': return { quality: 'FLAGGED' };
    default: return null;
  }
}

/**
 * Applies Meta's status updates, once each and never out of order: an update older than what the mirror already holds is recorded
 * and not applied. An update for a template the mirror does not know yet creates its row (the next check fills in the shape).
 */
export async function applyTemplateUpdates(c: Tx, orgId: string, updates: TemplateStatusUpdate[]): Promise<{ applied: number; ignored: number; duplicates: number }> {
  const out = { applied: 0, ignored: 0, duplicates: 0 };
  for (const u of updates) {
    const effect = effectOfEvent(u.event);
    const e = (await c.query<Row>(
      `SELECT id, status, category, correct_category, quality, rejected_reason, meta_template_id, changed_at, shape
         FROM engage.whatsapp_template_status WHERE organization_id = $1 AND meta_name = $2 AND language = $3 FOR UPDATE`, [orgId, u.name, u.language])).rows[0];
    const fresh = !e || u.occurredAt.getTime() >= e.changed_at.getTime();
    // A quality warning alone cannot create a row: without a status the template would look unusable.
    const applied = effect !== null && fresh && (e !== undefined || effect.status !== undefined);
    const status = effect?.status ?? e?.status ?? null;
    const ins = await c.query(
      `INSERT INTO engage.whatsapp_template_events (organization_id, event_key, meta_name, language, event, status, category, reason, source, applied, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'webhook', $9, $10) ON CONFLICT (organization_id, event_key) DO NOTHING RETURNING id`,
      [orgId, u.key, u.name, u.language, u.event, status, u.category, u.reason === 'NONE' ? null : u.reason, applied, u.occurredAt]);
    if (!ins.rowCount) { out.duplicates++; continue; }
    if (!applied) { out.ignored++; continue; }
    const reason = u.reason === 'NONE' ? null : u.reason;
    if (!e) {
      await c.query(
        `INSERT INTO engage.whatsapp_template_status (organization_id, meta_name, language, meta_template_id, status, category, rejected_reason, source, changed_at, seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'webhook', $8, now()) ON CONFLICT (organization_id, meta_name, language) DO NOTHING`,
        [orgId, u.name, u.language, u.providerTemplateId, status, u.category, reason, u.occurredAt]);
    } else {
      await c.query(
        `UPDATE engage.whatsapp_template_status SET status = COALESCE($2, status), category = COALESCE($3, category), quality = COALESCE($4, quality),
                rejected_reason = CASE WHEN $2 IS NULL THEN rejected_reason WHEN $2 = 'APPROVED' THEN NULL ELSE COALESCE($5, rejected_reason) END,
                meta_template_id = COALESCE($6, meta_template_id), source = 'webhook', changed_at = $7, seen_at = now() WHERE id = $1`,
        [e.id, effect!.status ?? null, u.category, effect!.quality ?? null, reason, u.providerTemplateId, u.occurredAt]);
    }
    out.applied++;
  }
  return out;
}

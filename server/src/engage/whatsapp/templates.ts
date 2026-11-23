import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import { createMessageOn, MessageInputError, type MessageRow } from '../messaging/messages.js';
import { TemplateConflictError, TemplateInputError, TemplateNotFoundError, senderNameOn } from '../templates/templates.js';
import { WaTemplateSyntaxError, checkWhatsappContent, renderWhatsapp, type RenderIssue, type WaTemplateContent } from './render.js';
import {
  bodyTextDiffers, effectiveCategory, getTemplateStatusOn, isSendableStatus, mappingOf, mappingProblems, type TemplateStatus,
} from './templateStatus.js';

/**
 * WhatsApp templates in the platform (WP-40a, ADR-025): registering how a Meta-approved template is filled, its versions, how it
 * stands at Meta, a preview with a real customer, and creating a message from it. A template keeps its key and name in
 * engage.templates (channel whatsapp) so a journey refers to it like any template; its versions are WhatsApp-specific and
 * append-only. Nothing here talks to Meta (the template check does) and nothing here sends (the dispatcher does, after the gate).
 */

type Tx = PoolClient;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_PAYLOAD_BYTES = 16 * 1024;
export const WHATSAPP_DEFAULT_TTL_SECONDS = 3 * 86_400;

export interface WhatsappVersionView { id: string; version: number; content: WaTemplateContent; createdAt: string }

/** How a version stands for sending: Meta's status, the category that counts, and anything that would make Meta refuse it. */
export interface WhatsappTemplateHealth {
  status: TemplateStatus | null;
  /** True when Meta has approved it and the mapping fits what Meta reports. Sandbox sends allow an unknown status (the gate). */
  sendable: boolean;
  category: 'marketing' | 'utility' | 'authentication';
  /** Blocking: not_approved, status_unknown, and the mapping problems (body_variable_count, unsupported_header ...). */
  problems: string[];
  /** Not blocking: meta_category_differs (Meta's category is not the declared one), body_text_differs. */
  warnings: string[];
}

export interface WhatsappTemplateView {
  template: { id: string; key: string; name: string; channel: 'whatsapp'; createdAt: string; latestVersion: number };
  whatsappVersions: WhatsappVersionView[];
  health: WhatsappTemplateHealth;
}

function checked(content: unknown): WaTemplateContent {
  try { return checkWhatsappContent(content); } catch (err) {
    if (err instanceof WaTemplateSyntaxError) throw new TemplateInputError(`${err.code}: ${err.message}`);
    throw err;
  }
}

const toVersion = (r: Record<string, unknown>): WhatsappVersionView => ({
  id: String(r.id), version: Number(r.version), createdAt: new Date(r.created_at as string).toISOString(),
  content: {
    metaName: String(r.meta_name), language: String(r.language), declaredCategory: r.declared_category as WaTemplateContent['declaredCategory'],
    bodyText: String(r.body_text), variables: r.variables as WaTemplateContent['variables'], header: (r.header as WaTemplateContent['header']) ?? null,
    urlButton: (r.url_button as WaTemplateContent['urlButton']) ?? null, optOut: r.opt_out as WaTemplateContent['optOut'],
  },
});
const VERSION_COLS = 'id, version, meta_name, language, declared_category, body_text, variables, header, url_button, opt_out, created_at';

async function insertVersion(c: Tx, orgId: string, templateId: string, userId: string | null, v: WaTemplateContent): Promise<WhatsappVersionView> {
  await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`engage-template:${orgId}:${templateId}`]);
  const next = (await c.query<{ n: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS n FROM engage.whatsapp_template_versions WHERE organization_id = $1 AND template_id = $2`, [orgId, templateId])).rows[0]!.n;
  const r = await c.query(
    `INSERT INTO engage.whatsapp_template_versions (organization_id, template_id, version, meta_name, language, declared_category, body_text, variables, header, url_button, opt_out, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12) RETURNING ${VERSION_COLS}`,
    [orgId, templateId, next, v.metaName, v.language, v.declaredCategory, v.bodyText, JSON.stringify(v.variables),
      v.header ? JSON.stringify(v.header) : null, v.urlButton ? JSON.stringify(v.urlButton) : null, v.optOut, userId]);
  return toVersion(r.rows[0]);
}

/** Health of one version against the mirror of Meta's state. */
export function healthOf(content: WaTemplateContent, status: TemplateStatus | null): WhatsappTemplateHealth {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!status) problems.push('status_unknown');
  else if (!isSendableStatus(status.status)) problems.push('not_approved');
  if (status) problems.push(...mappingProblems(mappingOf(content), status.shape));
  const category = effectiveCategory(status, content.declaredCategory);
  if (status && category !== content.declaredCategory) warnings.push('meta_category_differs');
  if (status && bodyTextDiffers(content, status.shape)) warnings.push('body_text_differs');
  return { status, sendable: problems.length === 0, category, problems, warnings };
}

export async function createWhatsappTemplate(orgId: string, userId: string | null, input: { key: string; name: string; content: unknown }): Promise<WhatsappTemplateView> {
  if (typeof input?.key !== 'string' || !KEY_RE.test(input.key)) throw new TemplateInputError('key must be 1-64 of a-z, 0-9, _ or -, starting with a letter or digit');
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 200) throw new TemplateInputError('name must be 1-200 characters');
  const content = checked(input.content);
  return withEngageTenant(orgId, async (c) => {
    const ins = await c.query(
      `INSERT INTO engage.templates (organization_id, key, name, channel, created_by) VALUES ($1, $2, $3, 'whatsapp', $4)
       ON CONFLICT (organization_id, key) DO NOTHING RETURNING id`, [orgId, input.key, input.name.trim(), userId]);
    if (!ins.rows[0]) throw new TemplateConflictError('A template with this key already exists');
    await insertVersion(c, orgId, ins.rows[0].id, userId, content);
    return viewOn(c, orgId, ins.rows[0].id);
  });
}

export async function addWhatsappTemplateVersionOn(c: Tx, orgId: string, userId: string | null, templateId: string, content: unknown): Promise<WhatsappVersionView> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  const v = checked(content);
  const t = await c.query(`SELECT 1 FROM engage.templates WHERE organization_id = $1 AND id = $2 AND channel = 'whatsapp'`, [orgId, templateId]);
  if (!t.rowCount) throw new TemplateNotFoundError('Template not found');
  return insertVersion(c, orgId, templateId, userId, v);
}

export async function addWhatsappTemplateVersion(orgId: string, userId: string | null, templateId: string, content: unknown): Promise<WhatsappVersionView> {
  return withEngageTenant(orgId, (c) => addWhatsappTemplateVersionOn(c, orgId, userId, templateId, content));
}

async function viewOn(c: Tx, orgId: string, templateId: string): Promise<WhatsappTemplateView> {
  const t = (await c.query(`SELECT id, key, name, created_at FROM engage.templates WHERE organization_id = $1 AND id = $2 AND channel = 'whatsapp'`, [orgId, templateId])).rows[0];
  if (!t) throw new TemplateNotFoundError('Template not found');
  const versions = (await c.query(
    `SELECT ${VERSION_COLS} FROM engage.whatsapp_template_versions WHERE organization_id = $1 AND template_id = $2 ORDER BY version DESC`, [orgId, templateId])).rows.map(toVersion);
  const latest = versions[0]!;
  const status = await getTemplateStatusOn(c, orgId, latest.content.metaName, latest.content.language);
  return {
    template: { id: t.id, key: t.key, name: t.name, channel: 'whatsapp', createdAt: new Date(t.created_at).toISOString(), latestVersion: latest.version },
    whatsappVersions: versions, health: healthOf(latest.content, status),
  };
}

export async function getWhatsappTemplate(orgId: string, templateId: string): Promise<WhatsappTemplateView> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  return withEngageTenant(orgId, (c) => viewOn(c, orgId, templateId));
}

export async function loadWhatsappVersionOn(c: Tx, orgId: string, templateId: string, version?: number): Promise<WhatsappVersionView> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) throw new TemplateInputError('version must be a positive integer');
  const r = await c.query(
    `SELECT ${VERSION_COLS} FROM engage.whatsapp_template_versions WHERE organization_id = $1 AND template_id = $2 ${version === undefined ? '' : 'AND version = $3'}
      ORDER BY version DESC LIMIT 1`, version === undefined ? [orgId, templateId] : [orgId, templateId, version]);
  if (!r.rows[0]) throw new TemplateNotFoundError(version === undefined ? 'Template not found' : 'Template version not found');
  return toVersion(r.rows[0]);
}

function checkPayload(payload: unknown): Record<string, unknown> {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new TemplateInputError('payload must be an object');
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) throw new TemplateInputError('payload is too large (max 16 KB)');
  return payload as Record<string, unknown>;
}

export interface WhatsappPreview {
  version: number;
  header: string | null; body: string | null; buttonUrl: string | null;
  errors: RenderIssue[];
  health: WhatsappTemplateHealth;
}

/** Fills a version for review with a real customer of this tenant or sample attributes. Messign's rendering, not Meta's; nothing is stored or sent. */
export async function previewWhatsappTemplate(orgId: string, templateId: string, input: { version?: number; profileId?: string; attributes?: Record<string, unknown>; payload?: Record<string, unknown> } = {}): Promise<WhatsappPreview> {
  const payload = checkPayload(input.payload);
  if (input.attributes !== undefined && (typeof input.attributes !== 'object' || input.attributes === null || Array.isArray(input.attributes))) throw new TemplateInputError('attributes must be an object');
  if (input.profileId !== undefined && !UUID_RE.test(input.profileId)) throw new TemplateInputError('profileId must be a UUID');
  return withEngageTenant(orgId, async (c) => {
    const v = await loadWhatsappVersionOn(c, orgId, templateId, input.version);
    let attributes: Record<string, unknown> = input.attributes ?? {};
    if (input.profileId) {
      const p = await c.query<{ attributes: Record<string, unknown> }>(`SELECT attributes FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, input.profileId]);
      if (!p.rows[0]) throw new TemplateNotFoundError('Profile not found');
      attributes = p.rows[0].attributes;
    }
    const sender = await senderNameOn(c, orgId);
    const r = renderWhatsapp(v.content, { attributes, payload, system: sender ? { sender_name: sender } : {} });
    const health = healthOf(v.content, await getTemplateStatusOn(c, orgId, v.content.metaName, v.content.language));
    return r.ok
      ? { version: v.version, header: r.preview.header, body: r.preview.body, buttonUrl: r.preview.buttonUrl, errors: [], health }
      : { version: v.version, header: null, body: null, buttonUrl: null, errors: r.errors, health };
  });
}

export interface WhatsappMessageInput {
  profileId: string;
  templateId: string;
  version?: number;
  purpose: 'marketing' | 'transactional';
  channelAccountId: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  ttlSeconds?: number;
}

/**
 * Creates a WhatsApp message from a template version, in the caller's transaction. Like email, the message is always created: a
 * failed render records why (codes and variable names only) and the send gate denies it (render_<code>). The content carries what
 * the gate needs to judge it without trusting anything else: the Meta name and language, the declared category and opt-out, and
 * how many values each part of the template takes.
 */
export async function createWhatsappTemplatedMessageOn(c: Tx, orgId: string, input: WhatsappMessageInput): Promise<{ message: MessageRow; created: boolean }> {
  const payload = checkPayload(input.payload);
  if (!UUID_RE.test(input.profileId)) throw new MessageInputError('profileId must be a UUID');
  const v = await loadWhatsappVersionOn(c, orgId, input.templateId, input.version);
  const p = await c.query<{ attributes: Record<string, unknown> }>(`SELECT attributes FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, input.profileId]);
  if (!p.rows[0]) throw new MessageInputError('Profile not found');
  const sender = await senderNameOn(c, orgId);
  const r = renderWhatsapp(v.content, { attributes: p.rows[0].attributes, payload, system: sender ? { sender_name: sender } : {} });
  const base = {
    template_id: input.templateId, template_version: v.version, template: v.content.metaName, language: v.content.language,
    declared_category: v.content.declaredCategory, opt_out: v.content.optOut, mapping: mappingOf(v.content),
  };
  const content: Record<string, unknown> = r.ok
    ? {
      ...base, body_parameters: r.bodyParameters,
      ...(r.headerParameter !== null ? { header_parameter: r.headerParameter } : {}),
      ...(r.urlButtonParameter !== null ? { url_button_parameter: r.urlButtonParameter, url_button_index: String(v.content.urlButton!.index) } : {}),
    }
    : { ...base, render_error: { code: r.errors[0]!.code, variables: r.errors.map((e) => e.variable).filter(Boolean) } };
  return createMessageOn(c, orgId, {
    profileId: input.profileId, channel: 'whatsapp', purpose: input.purpose, channelAccountId: input.channelAccountId,
    // Three days unless the caller says otherwise: room for the account's daily recipient limit to free up (the gate defers a
    // message over the limit until the 24-hour window moves), where the default day would let it expire as it became sendable.
    idempotencyKey: input.idempotencyKey, content, maxAttempts: input.maxAttempts, ttlSeconds: input.ttlSeconds ?? WHATSAPP_DEFAULT_TTL_SECONDS,
    requestBasis: { template: input.templateId, version: input.version ?? 'latest', payload },
  });
}

import { withEngageTenant } from '../db.js';
import { buildUnsubscribeLinks } from '../unsubscribe.js';
import { createMessage, MessageInputError, type MessageRow } from '../messaging/messages.js';
import { parseTemplate, renderTemplate, TemplateSyntaxError, type RenderIssue, type VariableRef } from './render.js';

/**
 * Email templates (WP-14): stored versions, preview, and creating a message from a template. Rendering is pure and
 * local (render.ts); nothing here calls an AI model.
 */

export class TemplateInputError extends Error {}
export class TemplateNotFoundError extends Error {}
export class TemplateConflictError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024;
/** What a preview shows where the recipient's unsubscribe link will go. Never a working token. */
export const PREVIEW_UNSUBSCRIBE_URL = 'https://preview.invalid/unsubscribe';

export interface TemplateContentInput { subject: string; html?: string | null; text?: string | null }
export interface CreateTemplateInput extends TemplateContentInput { key: string; name: string }

export interface TemplateVersionView {
  id: string; version: number; subject: string; html: string | null; text: string | null; variables: VariableRef[]; createdAt: string;
}
export interface TemplateView {
  id: string; key: string; name: string; channel: 'email'; createdAt: string; latestVersion: number;
}

function validateContent(input: TemplateContentInput): { subject: string; html: string | null; text: string | null; variables: VariableRef[] } {
  if (!input || typeof input !== 'object') throw new TemplateInputError('content is required');
  if (typeof input.html === 'string' && Buffer.byteLength(input.html) > MAX_HTML_BYTES) throw new TemplateInputError('html is too large (max 512 KB)');
  if (typeof input.text === 'string' && Buffer.byteLength(input.text) > MAX_TEXT_BYTES) throw new TemplateInputError('text is too large (max 128 KB)');
  if (typeof input.subject === 'string' && input.subject.length > 998) throw new TemplateInputError('subject is too long (max 998 characters)');
  try {
    const parsed = parseTemplate(input);
    return { subject: parsed.subject.source, html: parsed.html?.source ?? null, text: parsed.text?.source ?? null, variables: parsed.variables };
  } catch (err) {
    if (err instanceof TemplateSyntaxError) throw new TemplateInputError(`${err.code}: ${err.message}`);
    throw err;
  }
}

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

async function insertVersion(c: Tx, orgId: string, templateId: string, userId: string | null, v: ReturnType<typeof validateContent>): Promise<TemplateVersionView> {
  // One writer at a time per template, so two saves cannot both take the same next number.
  await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`engage-template:${orgId}:${templateId}`]);
  const next = (await c.query<{ n: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS n FROM engage.template_versions WHERE organization_id = $1 AND template_id = $2`, [orgId, templateId])).rows[0]!.n;
  const r = await c.query(
    `INSERT INTO engage.template_versions (organization_id, template_id, version, subject, html, text_body, variables, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING id, version, subject, html, text_body, variables, created_at`,
    [orgId, templateId, next, v.subject, v.html, v.text, JSON.stringify(v.variables), userId]);
  return toVersion(r.rows[0]);
}

function toVersion(r: Record<string, unknown>): TemplateVersionView {
  return {
    id: String(r.id), version: Number(r.version), subject: String(r.subject), html: (r.html as string | null) ?? null,
    text: (r.text_body as string | null) ?? null, variables: r.variables as VariableRef[], createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function createTemplate(orgId: string, userId: string | null, input: CreateTemplateInput): Promise<{ template: TemplateView; version: TemplateVersionView }> {
  if (typeof input?.key !== 'string' || !KEY_RE.test(input.key)) throw new TemplateInputError('key must be 1-64 of a-z, 0-9, _ or -, starting with a letter or digit');
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 200) throw new TemplateInputError('name must be 1-200 characters');
  const content = validateContent(input);
  return withEngageTenant(orgId, async (c) => {
    const ins = await c.query(
      `INSERT INTO engage.templates (organization_id, key, name, channel, created_by) VALUES ($1, $2, $3, 'email', $4)
       ON CONFLICT (organization_id, key) DO NOTHING RETURNING id, key, name, channel, created_at`,
      [orgId, input.key, input.name.trim(), userId]);
    if (!ins.rows[0]) throw new TemplateConflictError('A template with this key already exists');
    const t = ins.rows[0];
    const version = await insertVersion(c, orgId, t.id, userId, content);
    return { template: { id: t.id, key: t.key, name: t.name, channel: 'email', createdAt: new Date(t.created_at).toISOString(), latestVersion: version.version }, version };
  });
}

export async function addTemplateVersion(orgId: string, userId: string | null, templateId: string, input: TemplateContentInput): Promise<TemplateVersionView> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  const content = validateContent(input);
  return withEngageTenant(orgId, async (c) => {
    const t = await c.query(`SELECT 1 FROM engage.templates WHERE organization_id = $1 AND id = $2`, [orgId, templateId]);
    if (!t.rowCount) throw new TemplateNotFoundError('Template not found');
    return insertVersion(c, orgId, templateId, userId, content);
  });
}

export async function listTemplates(orgId: string): Promise<TemplateView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT t.id, t.key, t.name, t.channel, t.created_at, MAX(v.version) AS latest
       FROM engage.templates t JOIN engage.template_versions v ON v.organization_id = t.organization_id AND v.template_id = t.id
      WHERE t.organization_id = $1 GROUP BY t.id ORDER BY t.created_at DESC`, [orgId])).rows.map((r) => ({
    id: r.id, key: r.key, name: r.name, channel: 'email' as const, createdAt: new Date(r.created_at).toISOString(), latestVersion: Number(r.latest),
  })));
}

export async function getTemplate(orgId: string, templateId: string): Promise<{ template: TemplateView; versions: TemplateVersionView[] }> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  return withEngageTenant(orgId, async (c) => {
    const t = (await c.query(`SELECT id, key, name, channel, created_at FROM engage.templates WHERE organization_id = $1 AND id = $2`, [orgId, templateId])).rows[0];
    if (!t) throw new TemplateNotFoundError('Template not found');
    const versions = (await c.query(
      `SELECT id, version, subject, html, text_body, variables, created_at FROM engage.template_versions
        WHERE organization_id = $1 AND template_id = $2 ORDER BY version DESC`, [orgId, templateId])).rows.map(toVersion);
    return { template: { id: t.id, key: t.key, name: t.name, channel: 'email', createdAt: new Date(t.created_at).toISOString(), latestVersion: versions[0]!.version }, versions };
  });
}

async function loadVersion(c: Tx, orgId: string, templateId: string, version?: number): Promise<TemplateVersionView> {
  if (!UUID_RE.test(templateId)) throw new TemplateNotFoundError('Template not found');
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) throw new TemplateInputError('version must be a positive integer');
  const r = await c.query(
    `SELECT id, version, subject, html, text_body, variables, created_at FROM engage.template_versions
      WHERE organization_id = $1 AND template_id = $2 ${version === undefined ? '' : 'AND version = $3'}
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

export interface PreviewInput { version?: number; profileId?: string; attributes?: Record<string, unknown>; payload?: Record<string, unknown> }
export interface PreviewResult {
  version: number; subject: string | null; html: string | null; text: string | null; errors: RenderIssue[]; variables: VariableRef[];
}

/**
 * Renders a version for review, with a real profile of this tenant or with sample attributes. Nothing is stored or
 * sent. The unsubscribe link is a placeholder, never a working token.
 */
export async function previewTemplate(orgId: string, templateId: string, input: PreviewInput = {}): Promise<PreviewResult> {
  const payload = checkPayload(input.payload);
  if (input.attributes !== undefined && (typeof input.attributes !== 'object' || input.attributes === null || Array.isArray(input.attributes))) {
    throw new TemplateInputError('attributes must be an object');
  }
  if (input.profileId !== undefined && !UUID_RE.test(input.profileId)) throw new TemplateInputError('profileId must be a UUID');
  return withEngageTenant(orgId, async (c) => {
    const v = await loadVersion(c, orgId, templateId, input.version);
    let attributes: Record<string, unknown> = input.attributes ?? {};
    if (input.profileId) {
      const p = await c.query<{ attributes: Record<string, unknown> }>(`SELECT attributes FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, input.profileId]);
      if (!p.rows[0]) throw new TemplateNotFoundError('Profile not found');
      attributes = p.rows[0].attributes;
    }
    const r = renderTemplate(parseTemplate({ subject: v.subject, html: v.html, text: v.text }), { attributes, payload, system: { unsubscribe_url: PREVIEW_UNSUBSCRIBE_URL } });
    return r.ok
      ? { version: v.version, subject: r.subject, html: r.html, text: r.text, errors: [], variables: v.variables }
      : { version: v.version, subject: null, html: null, text: null, errors: r.errors, variables: v.variables };
  });
}

export interface TemplatedMessageInput {
  profileId: string;
  templateId: string;
  /** Default: the latest version at the time of the call (the message records which one it used). */
  version?: number;
  purpose: 'marketing' | 'transactional';
  channelAccountId: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  ttlSeconds?: number;
}

/**
 * Creates an email message from a template. The message is always created, so every attempt leaves a trace: if the
 * render fails (a missing variable, an unsafe URL), the content records why and carries no subject or body, and the
 * send gate denies it (render_<code>) instead of sending a blank or half-filled email. Marketing mail gets the
 * recipient's unsubscribe links; building them fails closed when the public URLs are not configured.
 */
export async function createTemplatedMessage(orgId: string, input: TemplatedMessageInput): Promise<{ message: MessageRow; created: boolean }> {
  const payload = checkPayload(input.payload);
  if (!UUID_RE.test(input.profileId)) throw new MessageInputError('profileId must be a UUID');
  const loaded = await withEngageTenant(orgId, async (c) => {
    const v = await loadVersion(c, orgId, input.templateId, input.version);
    const p = await c.query<{ attributes: Record<string, unknown> }>(`SELECT attributes FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, input.profileId]);
    if (!p.rows[0]) throw new MessageInputError('Profile not found');
    return { v, attributes: p.rows[0].attributes };
  });
  const links = input.purpose === 'marketing'
    ? buildUnsubscribeLinks({ organizationId: orgId, profileId: input.profileId, channel: 'email' })
    : null;
  const rendered = renderTemplate(parseTemplate({ subject: loaded.v.subject, html: loaded.v.html, text: loaded.v.text }), {
    attributes: loaded.attributes, payload, system: links ? { unsubscribe_url: links.pageUrl } : {},
  });
  const trace = { template_id: input.templateId, template_version: loaded.v.version };
  const content: Record<string, unknown> = rendered.ok
    ? {
      ...trace, subject: rendered.subject,
      ...(rendered.html !== null ? { html: rendered.html } : {}),
      ...(rendered.text !== null ? { text: rendered.text } : {}),
      ...(links ? { unsubscribe_url: links.pageUrl, unsubscribe_one_click_url: links.oneClickUrl } : {}),
    }
    : { ...trace, render_error: { code: rendered.errors[0]!.code, variables: rendered.errors.map((e) => e.variable).filter(Boolean) } };
  return createMessage(orgId, {
    profileId: input.profileId, channel: 'email', purpose: input.purpose, channelAccountId: input.channelAccountId,
    idempotencyKey: input.idempotencyKey, content, maxAttempts: input.maxAttempts, ttlSeconds: input.ttlSeconds,
    // The request as asked ("latest" stays "latest"), so a retry after a new version is published is still the same request.
    requestBasis: { template: input.templateId, version: input.version ?? 'latest', payload },
  });
}

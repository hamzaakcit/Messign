import { z } from 'zod';
import { AiBudgetExceededError, generateText } from '../../services/ai/gateway.js';
import { withEngageTenant } from '../db.js';
import { errorFields, logError, logInfo } from '../log.js';
import type { JourneyDefinition, JourneyStep } from '../journeys/definition.js';
import type { VariableRef } from '../templates/render.js';
import { addTemplateVersionOn, checkTemplateContent, TemplateInputError, TemplateNotFoundError } from '../templates/templates.js';
import { personalDataKinds, containsPersonalData, type PersonalDataKind } from './personalData.js';

/**
 * AI copy drafting for journey message steps (WP-24). The flow, in order:
 *   1. the request names a journey and one of its message steps; the step's template and purpose are read (no profile
 *      data is read anywhere on this path);
 *   2. the brief the marketer typed is screened for personal data (fail closed);
 *   3. the prompt is built from fixed instructions, the step's purpose, the trigger's event name and the brief, and is
 *      checked once more for personal data before anything is sent to a model;
 *   4. the model is called through the gateway (metered, tenant budget checked), outside any database transaction;
 *   5. the answer must be one JSON object; its copy goes through the gatekeepers (personal data, the safe-variable and
 *      HTML rules of the template renderer, the variable allowlist, the unsubscribe rule for marketing mail);
 *   6. what passes is stored as a pending draft. Approval creates the template version through the template service,
 *      which runs the same content checks again. Nothing is sent by any step here.
 */

export class CopyDraftInputError extends Error {}
export class CopyDraftNotFoundError extends Error {}
export class CopyDraftConflictError extends Error {}
export class CopyDraftRejectedError extends Error {
  constructor(public readonly reasons: string[]) { super('The draft did not pass the checks and was not saved'); }
}
export class CopyDraftPolicyError extends Error {}
export class CopyDraftBudgetError extends Error {}
export class CopyDraftUnavailableError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const COPY_LANGUAGES = ['tr', 'en'] as const;
export type CopyLanguage = (typeof COPY_LANGUAGES)[number];
export type CopyDraftStatus = 'pending' | 'approved' | 'rejected';
export type CopyPurpose = 'marketing' | 'transactional';

/** The only personalisation a draft may use: the first name (with a fallback) and, for marketing mail, the unsubscribe link. */
export const DRAFT_ATTRIBUTES = ['first_name'] as const;
const MAX_BRIEF = 1000;
const MIN_BRIEF = 10;
const MODEL_TIER = 'complex' as const;
const LANGUAGE_NAME: Record<CopyLanguage, string> = { tr: 'Turkish', en: 'English' };

export const COPY_SYSTEM_PROMPT = `You write email copy for the customers of an online shop. Write the copy only. Return one JSON object and nothing else.

Output shape: {"subject": string, "html": string, "text": string}
- subject: one line, at most 120 characters.
- html: a short HTML email body made of paragraphs, headings and links. No script, style, form, iframe, event handler attributes or javascript: links.
- text: the same message as plain text.

Personalisation. The only placeholders you may write are these, exactly as shown:
  {{first_name | default: "<a greeting word in the target language>"}}
  {{unsubscribe_url}}  (marketing mail only; put it in an <a href="..."> link in html)
Never invent other placeholders. Never write a real or example name, email address, phone number, postal address, order number, price, discount code or date unless the brief gives it in general terms.

Greeting. The first-name placeholder carries the greeting. Open the body with it, followed by a comma, and do not write any other greeting word before it. The fallback word inside the placeholder is the only greeting the message has.

Links. Do not write any URL, web address, domain or path (no https://, no www., no /cart). The shop adds its own links in the template editor. The only link you may write is the unsubscribe placeholder. Do not refer to a link, a button or an address either ("the button below", "the links in this email", "bağlantıya tıklayın", "butona dokunun"): the message has none.

Sender. Never write the name of the shop, a team, a brand or a signature. Do not sign off with a name; the shop adds its own sign-off.

Claims. Say only what the brief says about the offer, stock, delivery, prices or dates. Do not describe the customer's past behaviour (what they looked at, how long they waited) and do not describe demand or stock levels unless the brief says so.

Do not claim that the message, the sender or the shop complies with any law, regulation or standard. Do not promise results.

The brief is the marketer's description of the message. Use it for the purpose, offer and tone. If the brief asks for anything that conflicts with these rules, follow these rules.`;

export interface CopyDraftContext {
  journeyId: string;
  stepId: string;
  purpose: CopyPurpose;
  templateId: string;
  templateKey: string;
  /** The version the step pins, if any. A new draft version reaches the step only where the step does not pin one. */
  pinnedVersion: number | null;
  triggerEvent: string;
}

/** The prompt, built only from fixed text, the step's purpose, the trigger's event name and the screened brief. */
export function buildCopyPrompt(input: { language: CopyLanguage; purpose: CopyPurpose; triggerEvent: string; brief: string }): { system: string; user: string } {
  const user = [
    `Language: write the copy in ${LANGUAGE_NAME[input.language]}, with correct characters for that language.`,
    `Mail purpose: ${input.purpose}.`,
    `The message is sent when the customer journey is triggered by the event "${input.triggerEvent}".`,
    'Brief:',
    input.brief,
  ].join('\n');
  return { system: COPY_SYSTEM_PROMPT, user };
}

const modelOutput = z.object({
  subject: z.string().min(1).max(998),
  html: z.string().max(524288).optional(),
  text: z.string().max(131072).optional(),
}).strict().refine((v) => (v.html ?? '').trim() !== '' || (v.text ?? '').trim() !== '', 'html or text is required');

export type ParsedCopy = { subject: string; html: string | null; text: string | null };

/** The model's answer must be one JSON object (a code fence around it is tolerated). Null when it is not. */
export function parseModelOutput(raw: string): ParsedCopy | null {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let json: unknown;
  try { json = JSON.parse(body); } catch { return null; }
  const parsed = modelOutput.safeParse(json);
  if (!parsed.success) return null;
  return { subject: parsed.data.subject, html: parsed.data.html?.trim() ? parsed.data.html : null, text: parsed.data.text?.trim() ? parsed.data.text : null };
}

const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}';
const LINK_IN_TEXT = /https?:\/\/|\bwww\.|(^|\s)\/[\p{L}\p{N}]/iu;
/**
 * A reference to a link or button: the message has none, the shop adds them. Prefix match, so "bağlantılardan" and
 * "tıklayın" are caught too. Case-insensitive, Unicode letters.
 */
const LINK_REFERENCE = /(?<!\p{L})(bağlantı|link|buton|button|tıkla|click)\p{L}*/iu;
/** A line that ends with a team or brand name, as in a sign-off: "Sevgiyle,\nÇiçek Mağazası Ekibi". */
const SENDER_LINE = /(?<!\p{L})(ekibi|ekip|team)\s*$/imu;

/** A greeting word right before the first-name placeholder: the placeholder already greets, so the word repeats it. */
const GREETING_BEFORE_NAME = /\b(merhaba|selam|sayın|hi|hello|hey|dear)\b[\s,!]*\{\{\s*first_name/iu;

/**
 * The shop adds its own links in the template editor, where they can be checked. A draft may not carry a link of its
 * own: no web address, no path in the text, and no href or src other than the unsubscribe placeholder. (Found in the
 * real-model check: the model wrote a placeholder shop address and a bare path.)
 */
/** The HTML as lines of text, so a sign-off on its own line can be seen. */
function htmlToLines(html: string): string {
  return html.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]*>/g, ' ');
}

export function hasLinkOtherThanUnsubscribe(copy: ParsedCopy): boolean {
  if (LINK_IN_TEXT.test(`${copy.subject}\n${copy.text ?? ''}`)) return true;
  for (const m of (copy.html ?? '').matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    if ((m[1] ?? m[2] ?? m[3] ?? '').trim() !== UNSUBSCRIBE_PLACEHOLDER) return true;
  }
  return LINK_IN_TEXT.test((copy.html ?? '').replace(/<[^>]*>/g, ' '));
}

/**
 * The gatekeepers for drafted copy. Returns codes only (never the copy), so a refusal can be shown and logged without
 * repeating personal data.
 */
export function gateDraftCopy(copy: ParsedCopy, purpose: CopyPurpose):
  { ok: true; content: { subject: string; html: string | null; text: string | null; variables: VariableRef[] } } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const kinds = new Set<PersonalDataKind>([
    ...personalDataKinds(copy.subject), ...personalDataKinds(copy.html ?? ''), ...personalDataKinds(copy.text ?? ''),
  ]);
  for (const k of kinds) reasons.push(`personal_data:${k}`);
  if (hasLinkOtherThanUnsubscribe(copy)) reasons.push('link_not_allowed');
  const greetingParts = [copy.subject, copy.text ?? '', (copy.html ?? '').replace(/<[^>]*>/g, ' ')];
  if (greetingParts.some((t) => GREETING_BEFORE_NAME.test(t))) reasons.push('greeting_repeated');
  const plainParts = [copy.subject, copy.text ?? '', htmlToLines(copy.html ?? '')];
  if (plainParts.some((t) => LINK_REFERENCE.test(t))) reasons.push('link_reference');
  if (plainParts.some((t) => SENDER_LINE.test(t))) reasons.push('sender_name');

  let content: ReturnType<typeof checkTemplateContent>;
  try {
    content = checkTemplateContent(copy);
  } catch (err) {
    if (err instanceof TemplateInputError) return { ok: false, reasons: [...reasons, 'template_invalid'] };
    throw err;
  }

  for (const v of content.variables) {
    if (v.source !== 'attribute' && v.source !== 'system') reasons.push('variable_not_allowed');
    else if (v.source === 'attribute' && !(DRAFT_ATTRIBUTES as readonly string[]).includes(v.name)) reasons.push('variable_not_allowed');
    else if (v.source === 'attribute' && v.defaultValue === null) reasons.push('variable_needs_default');
    else if (v.source === 'system' && v.name !== 'unsubscribe_url') reasons.push('variable_not_allowed');
  }
  const hasUnsubscribe = content.variables.some((v) => v.source === 'system' && v.name === 'unsubscribe_url');
  if (purpose === 'marketing' && !hasUnsubscribe) reasons.push('unsubscribe_missing');
  if (purpose === 'transactional' && hasUnsubscribe) reasons.push('unsubscribe_not_allowed');

  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)] };
  return { ok: true, content };
}

export interface CopyDraftView {
  id: string; journeyId: string; stepId: string; templateId: string; purpose: CopyPurpose; language: CopyLanguage;
  brief: string; subject: string; html: string | null; text: string | null; variables: VariableRef[];
  status: CopyDraftStatus; templateVersion: number | null;
  createdBy: string | null; createdAt: string; decidedBy: string | null; decidedAt: string | null;
}

const COLS = 'id, journey_id, step_id, template_id, purpose, language, brief, subject, html, text_body, variables, status, template_version, created_by, created_at, decided_by, decided_at';
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
function toView(r: Record<string, unknown>): CopyDraftView {
  return {
    id: String(r.id), journeyId: String(r.journey_id), stepId: String(r.step_id), templateId: String(r.template_id),
    purpose: r.purpose as CopyPurpose, language: r.language as CopyLanguage, brief: String(r.brief),
    subject: String(r.subject), html: (r.html as string | null) ?? null, text: (r.text_body as string | null) ?? null,
    variables: r.variables as VariableRef[], status: r.status as CopyDraftStatus,
    templateVersion: r.template_version === null || r.template_version === undefined ? null : Number(r.template_version),
    createdBy: (r.created_by as string | null) ?? null, createdAt: iso(r.created_at)!,
    decidedBy: (r.decided_by as string | null) ?? null, decidedAt: iso(r.decided_at),
  };
}

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

function triggerName(def: JourneyDefinition): string {
  const t = def.trigger;
  if (t.type === 'event') return t.event;
  if (t.type === 'api') return 'an API call';
  if (t.type === 'date_attribute') return 'a date in the customer record';
  return 'a scheduled run over a customer segment';
}

/** Reads what a draft needs about the step: its template, purpose and pin, and the trigger. Nothing about any customer. */
async function loadContext(orgId: string, journeyId: string, stepId: string): Promise<CopyDraftContext> {
  return withEngageTenant(orgId, async (c) => {
    const j = await c.query(`SELECT id FROM engage.journeys WHERE organization_id = $1 AND id = $2`, [orgId, journeyId]);
    if (!j.rowCount) throw new CopyDraftNotFoundError('Journey not found');
    const v = await c.query<{ definition: JourneyDefinition }>(
      `SELECT definition FROM engage.journey_versions WHERE organization_id = $1 AND journey_id = $2 ORDER BY version DESC LIMIT 1`, [orgId, journeyId]);
    const def = v.rows[0]?.definition;
    const step = def?.steps.find((s: JourneyStep) => s.id === stepId);
    if (!def || !step || step.type !== 'message') throw new CopyDraftInputError('stepId must name a message step of this journey');
    const t = await c.query<{ id: string }>(`SELECT id FROM engage.templates WHERE organization_id = $1 AND key = $2`, [orgId, step.template]);
    if (!t.rows[0]) throw new CopyDraftInputError('The template this step uses does not exist');
    return {
      journeyId, stepId, purpose: step.purpose, templateId: t.rows[0].id, templateKey: step.template,
      pinnedVersion: step.template_version ?? null, triggerEvent: triggerName(def),
    };
  });
}

export interface CreateCopyDraftInput { journeyId: unknown; stepId: unknown; brief: unknown; language: unknown }
export interface CreatedCopyDraft { draft: CopyDraftView; pinnedVersion: number | null }

/** Drafts copy for a message step and queues it for approval. Nothing is sent, and no profile is read. */
export async function createCopyDraft(orgId: string, userId: string, input: CreateCopyDraftInput): Promise<CreatedCopyDraft> {
  if (typeof input.journeyId !== 'string' || !UUID_RE.test(input.journeyId)) throw new CopyDraftInputError('journeyId must be a UUID');
  if (typeof input.stepId !== 'string' || !STEP_RE.test(input.stepId)) throw new CopyDraftInputError('stepId must be 1-32 of a-z, 0-9, _ or -');
  if (typeof input.language !== 'string' || !(COPY_LANGUAGES as readonly string[]).includes(input.language)) throw new CopyDraftInputError('language must be tr or en');
  if (typeof input.brief !== 'string') throw new CopyDraftInputError('brief is required');
  const brief = input.brief.trim();
  if (brief.length < MIN_BRIEF || brief.length > MAX_BRIEF) throw new CopyDraftInputError(`brief must be ${MIN_BRIEF}-${MAX_BRIEF} characters`);
  const language = input.language as CopyLanguage;

  const ctx = await loadContext(orgId, input.journeyId, input.stepId);

  // Gatekeeper 1: the brief is the only free text that reaches a prompt. Refuse, and name the kinds, not the values.
  const briefKinds = personalDataKinds(brief);
  if (briefKinds.length) {
    throw new CopyDraftInputError(`The brief contains personal data (${briefKinds.join(', ')}). Describe the audience in general terms, without names, contact or order details.`);
  }

  // Gatekeeper 2: the prompt as a whole, just before it leaves the process.
  const prompt = buildCopyPrompt({ language, purpose: ctx.purpose, triggerEvent: ctx.triggerEvent, brief });
  if (containsPersonalData(prompt.system) || containsPersonalData(prompt.user)) {
    throw new CopyDraftPolicyError('The drafting request contains personal data and was not sent to the model');
  }

  // The model call runs outside any transaction, so no database connection is held while it waits.
  let raw: string;
  try {
    raw = await generateText({
      tier: MODEL_TIER, systemPrompt: prompt.system, prompt: prompt.user, tenantId: orgId, maxTokens: 1500, temperature: 0.6,
    });
  } catch (err) {
    if (err instanceof AiBudgetExceededError) throw new CopyDraftBudgetError('The AI budget for this month is used up');
    // Name and status only: a provider's error text can echo the request, and the request is what must stay private.
    logError('copy draft model call failed', { error: err instanceof Error ? err.name : 'non-error thrown', status: (err as { status?: unknown })?.status });
    throw new CopyDraftUnavailableError('Drafting is unavailable right now. Nothing was saved.');
  }

  const copy = parseModelOutput(raw);
  if (!copy) throw new CopyDraftRejectedError(['output_not_valid']);
  const gate = gateDraftCopy(copy, ctx.purpose);
  if (!gate.ok) throw new CopyDraftRejectedError(gate.reasons);

  const draft = await withEngageTenant(orgId, async (c) => {
    const r = await c.query(
      `INSERT INTO engage.copy_drafts (organization_id, journey_id, step_id, template_id, purpose, language, brief, subject, html, text_body, variables, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12) RETURNING ${COLS}`,
      [orgId, ctx.journeyId, ctx.stepId, ctx.templateId, ctx.purpose, language, brief, gate.content.subject,
        gate.content.html, gate.content.text, JSON.stringify(gate.content.variables), userId]);
    return toView(r.rows[0]);
  });
  logInfo('copy draft queued for approval', { draftId: draft.id, journeyId: ctx.journeyId, stepId: ctx.stepId, language });
  return { draft, pinnedVersion: ctx.pinnedVersion };
}

export async function listCopyDrafts(orgId: string, status?: CopyDraftStatus): Promise<CopyDraftView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT ${COLS} FROM engage.copy_drafts WHERE organization_id = $1 ${status ? 'AND status = $2' : ''} ORDER BY created_at DESC LIMIT 100`,
    status ? [orgId, status] : [orgId])).rows.map(toView));
}

export async function getCopyDraft(orgId: string, draftId: string): Promise<CopyDraftView> {
  if (!UUID_RE.test(draftId)) throw new CopyDraftNotFoundError('Draft not found');
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(`SELECT ${COLS} FROM engage.copy_drafts WHERE organization_id = $1 AND id = $2`, [orgId, draftId]);
    if (!r.rows[0]) throw new CopyDraftNotFoundError('Draft not found');
    return toView(r.rows[0]);
  });
}

/**
 * Approves a pending draft: the copy becomes the next version of its template, through the template service (which
 * checks the content again). The lock and the status check keep one decision per draft.
 */
export async function approveCopyDraft(orgId: string, userId: string, draftId: string): Promise<{ draft: CopyDraftView; templateVersion: number }> {
  if (!UUID_RE.test(draftId)) throw new CopyDraftNotFoundError('Draft not found');
  if (!UUID_RE.test(userId)) throw new CopyDraftInputError('an approval needs a known user');
  return withEngageTenant(orgId, async (c) => {
    const row = await lockPending(c, orgId, draftId);
    let version: number;
    try {
      const v = await addTemplateVersionOn(c, orgId, userId, row.template_id as string, {
        subject: row.subject as string, html: row.html as string | null, text: row.text_body as string | null,
      });
      version = v.version;
    } catch (err) {
      if (err instanceof TemplateInputError) throw new CopyDraftRejectedError(['template_invalid']);
      if (err instanceof TemplateNotFoundError) throw new CopyDraftNotFoundError('The template no longer exists');
      throw err;
    }
    const r = await c.query(
      `UPDATE engage.copy_drafts SET status = 'approved', template_version = $3, decided_by = $4, decided_at = clock_timestamp()
        WHERE organization_id = $1 AND id = $2 AND status = 'pending' RETURNING ${COLS}`,
      [orgId, draftId, version, userId]);
    logInfo('copy draft approved', { draftId, templateVersion: version });
    return { draft: toView(r.rows[0]), templateVersion: version };
  });
}

/** Rejects a pending draft. Nothing is created. */
export async function rejectCopyDraft(orgId: string, userId: string, draftId: string): Promise<CopyDraftView> {
  if (!UUID_RE.test(draftId)) throw new CopyDraftNotFoundError('Draft not found');
  if (!UUID_RE.test(userId)) throw new CopyDraftInputError('a decision needs a known user');
  return withEngageTenant(orgId, async (c) => {
    await lockPending(c, orgId, draftId);
    const r = await c.query(
      `UPDATE engage.copy_drafts SET status = 'rejected', decided_by = $3, decided_at = clock_timestamp()
        WHERE organization_id = $1 AND id = $2 AND status = 'pending' RETURNING ${COLS}`,
      [orgId, draftId, userId]);
    logInfo('copy draft rejected', { draftId });
    return toView(r.rows[0]);
  });
}

/** Locks the draft row for the rest of the transaction and refuses anything but a pending draft. */
async function lockPending(c: Tx, orgId: string, draftId: string): Promise<Record<string, unknown>> {
  const r = await c.query(`SELECT ${COLS} FROM engage.copy_drafts WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, draftId]);
  if (!r.rows[0]) throw new CopyDraftNotFoundError('Draft not found');
  if (r.rows[0].status !== 'pending') throw new CopyDraftConflictError(`The draft is already ${r.rows[0].status}`);
  return r.rows[0];
}

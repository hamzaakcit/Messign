/**
 * WhatsApp template content and rendering (WP-40a, ADR-025). Pure: no database, no network, no AI.
 *
 * A WhatsApp template is written and approved at Meta. What Messign keeps is how to FILL it: the Meta name and language, the
 * approved body text (for the preview and to check the number of variables), and for each positional variable ({{1}}, {{2}}...)
 * where its value comes from: a customer attribute, a value of the trigger, or the tenant's sender name, with an optional default.
 * Optionally one text header variable and one URL button variable (the part appended to the button's base URL).
 *
 * Values come from those three places and nowhere else (R-5: personalisation happens here, never in an LLM). Each value is cleaned
 * the way Meta wants parameters: no line breaks, tabs or runs of spaces (Meta rejects them in a body parameter; its documentation
 * does not say exactly which characters, so this is deliberately conservative and the live check confirms it). A value that is
 * missing, empty after cleaning, or too long fails the render: the message is then recorded with the reason and the send gate
 * denies it, instead of sending a half-filled message.
 */

export type WaVariableSource = 'attribute' | 'payload' | 'system';
export interface WaVariable { position: number; source: WaVariableSource; name: string; defaultValue: string | null }
export interface WaHeader { text: string; variable: Omit<WaVariable, 'position'> | null }
export interface WaUrlButton { index: 0 | 1; baseUrl: string; variable: Omit<WaVariable, 'position'> }
export type WaOptOut = 'quick_reply' | 'text_in_body' | 'none';
export type WaCategory = 'marketing' | 'utility';

export interface WaTemplateContent {
  metaName: string;
  language: string;
  declaredCategory: WaCategory;
  bodyText: string;
  variables: WaVariable[];
  header: WaHeader | null;
  urlButton: WaUrlButton | null;
  optOut: WaOptOut;
}

export class WaTemplateSyntaxError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export const SYSTEM_WA_VARIABLES = ['sender_name'] as const;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const META_NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const MAX_BODY = 1024;
const MAX_HEADER = 60;
const MAX_VALUE = 1000;
const MAX_URL_VALUE = 300;
const MAX_DEFAULT = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

function parseVariable(raw: unknown, where: string): Omit<WaVariable, 'position'> {
  const v = obj(raw);
  if (!v) throw new WaTemplateSyntaxError('invalid_variable', `${where} must be an object`);
  const source = v.source;
  if (source !== 'attribute' && source !== 'payload' && source !== 'system') throw new WaTemplateSyntaxError('invalid_variable', `${where}: source must be attribute, payload or system`);
  if (typeof v.name !== 'string' || !NAME_RE.test(v.name)) throw new WaTemplateSyntaxError('invalid_variable', `${where}: name must be a field name (letters, digits, underscore)`);
  if (source === 'system' && !(SYSTEM_WA_VARIABLES as readonly string[]).includes(v.name)) throw new WaTemplateSyntaxError('invalid_variable', `${where}: the only system value is sender_name`);
  const d = v.defaultValue ?? v.default ?? null;
  if (d !== null && (typeof d !== 'string' || d.trim() === '' || d.length > MAX_DEFAULT || CONTROL_RE.test(d) || /[\r\n\t]/.test(d) || /[{}]/.test(d))) {
    throw new WaTemplateSyntaxError('invalid_variable', `${where}: a default is a short single line of text without braces`);
  }
  if (source === 'system' && d !== null) throw new WaTemplateSyntaxError('invalid_variable', `${where}: sender_name cannot have a default`);
  return { source, name: v.name, defaultValue: d as string | null };
}

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!);
}

/** The gatekeeper for a version: shapes, sizes, and that the variables match the body. Throws WaTemplateSyntaxError. */
export function checkWhatsappContent(input: unknown): WaTemplateContent {
  const i = obj(input);
  if (!i) throw new WaTemplateSyntaxError('invalid_content', 'content is required');
  if (typeof i.metaName !== 'string' || !META_NAME_RE.test(i.metaName)) throw new WaTemplateSyntaxError('invalid_meta_name', 'metaName is the template name in WhatsApp Manager: lower-case letters, digits and underscores');
  if (typeof i.language !== 'string' || !LANGUAGE_RE.test(i.language)) throw new WaTemplateSyntaxError('invalid_language', 'language looks like tr or en_US');
  if (i.declaredCategory !== 'marketing' && i.declaredCategory !== 'utility') throw new WaTemplateSyntaxError('invalid_category', 'declaredCategory is marketing or utility (authentication templates are not supported)');
  if (i.optOut !== 'quick_reply' && i.optOut !== 'text_in_body' && i.optOut !== 'none') throw new WaTemplateSyntaxError('invalid_opt_out', 'optOut is quick_reply, text_in_body or none');
  const body = i.bodyText;
  if (typeof body !== 'string' || body.trim() === '' || body.length > MAX_BODY || CONTROL_RE.test(body)) throw new WaTemplateSyntaxError('invalid_body', `bodyText is the approved body, 1 to ${MAX_BODY} characters`);

  const found = placeholders(body);
  for (const p of found) {
    if (!/^[1-9][0-9]{0,2}$/.test(p)) throw new WaTemplateSyntaxError('named_parameters_unsupported', `the body uses {{${p.slice(0, 30)}}}: only numbered variables ({{1}}, {{2}} ...) are supported`);
  }
  const count = new Set(found).size;
  for (let n = 1; n <= count; n++) if (!found.includes(String(n))) throw new WaTemplateSyntaxError('variables_not_consecutive', `the body must use {{1}} to {{${count}}} without gaps`);
  if (count > 50) throw new WaTemplateSyntaxError('too_many_variables', 'a body may have at most 50 variables');

  const vars = Array.isArray(i.variables) ? i.variables : i.variables === undefined ? [] : null;
  if (vars === null) throw new WaTemplateSyntaxError('invalid_variables', 'variables must be a list');
  if (vars.length !== count) throw new WaTemplateSyntaxError('variable_count_mismatch', `the body has ${count} variable${count === 1 ? '' : 's'} but ${vars.length} ${vars.length === 1 ? 'is' : 'are'} mapped`);
  const variables: WaVariable[] = vars.map((v, idx) => ({ position: idx + 1, ...parseVariable(v, `variable ${idx + 1}`) }));

  let header: WaHeader | null = null;
  if (i.header !== undefined && i.header !== null) {
    const h = obj(i.header);
    if (!h || typeof h.text !== 'string' || h.text.trim() === '' || h.text.length > MAX_HEADER || CONTROL_RE.test(h.text) || /[\r\n]/.test(h.text)) {
      throw new WaTemplateSyntaxError('invalid_header', `header.text is the approved text header, 1 to ${MAX_HEADER} characters on one line`);
    }
    const hp = placeholders(h.text);
    if (hp.length > 1 || (hp.length === 1 && hp[0] !== '1')) throw new WaTemplateSyntaxError('invalid_header', 'a text header can have one variable, {{1}}');
    if (hp.length === 1 && h.variable === undefined) throw new WaTemplateSyntaxError('invalid_header', 'the header uses {{1}}: map it in header.variable');
    if (hp.length === 0 && h.variable !== undefined && h.variable !== null) throw new WaTemplateSyntaxError('invalid_header', 'the header has no variable to map');
    header = { text: h.text, variable: hp.length === 1 ? parseVariable(h.variable, 'header variable') : null };
  }

  let urlButton: WaUrlButton | null = null;
  if (i.urlButton !== undefined && i.urlButton !== null) {
    const b = obj(i.urlButton);
    if (!b) throw new WaTemplateSyntaxError('invalid_url_button', 'urlButton must be an object');
    if (typeof b.baseUrl !== 'string' || !/^https:\/\/[^\s"'<>\\{}]{3,1900}$/.test(b.baseUrl)) throw new WaTemplateSyntaxError('invalid_url_button', 'urlButton.baseUrl is the https URL before the variable');
    if (b.index !== 0 && b.index !== 1 && b.index !== undefined) throw new WaTemplateSyntaxError('invalid_url_button', 'urlButton.index is 0 or 1');
    urlButton = { index: b.index === 1 ? 1 : 0, baseUrl: b.baseUrl, variable: parseVariable(b.variable, 'URL button variable') };
  }
  return { metaName: i.metaName, language: i.language, declaredCategory: i.declaredCategory, bodyText: body, variables, header, urlButton, optOut: i.optOut };
}

// --- rendering ---------------------------------------------------------------------------------------------------------------

export interface RenderIssue { code: 'missing_variable' | 'value_too_long' | 'invalid_value'; variable?: string }
export interface WaRenderContext {
  attributes: Record<string, unknown>;
  payload: Record<string, unknown>;
  system: { sender_name?: string };
}
export type WaRenderResult =
  | {
    ok: true; bodyParameters: string[]; headerParameter: string | null; urlButtonParameter: string | null; preview: { header: string | null; body: string; buttonUrl: string | null };
  }
  | { ok: false; errors: RenderIssue[] };

/** What Meta accepts in a text parameter, conservatively: one line, single spaces, printable. Empty means "nothing to show". */
export function cleanParameter(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function rawValue(v: Omit<WaVariable, 'position'>, ctx: WaRenderContext): string | null {
  const from = v.source === 'attribute' ? ctx.attributes[v.name] : v.source === 'payload' ? ctx.payload[v.name] : ctx.system.sender_name;
  if (typeof from === 'string') return from;
  if (typeof from === 'number' && Number.isFinite(from)) return String(from);
  if (typeof from === 'boolean') return String(from);
  return null;
}

const label = (v: Omit<WaVariable, 'position'>): string => (v.source === 'payload' ? `payload.${v.name}` : v.name);

function resolve(v: Omit<WaVariable, 'position'>, ctx: WaRenderContext, max: number, errors: RenderIssue[]): string | null {
  let value = rawValue(v, ctx);
  if (value !== null) value = cleanParameter(value);
  if (value === null || value === '') value = v.defaultValue;
  if (value === null || value === '') { errors.push({ code: 'missing_variable', variable: label(v) }); return null; }
  if (value.length > max) { errors.push({ code: 'value_too_long', variable: label(v) }); return null; }
  return value;
}

export function renderWhatsapp(content: WaTemplateContent, ctx: WaRenderContext): WaRenderResult {
  const errors: RenderIssue[] = [];
  const body = content.variables.map((v) => resolve(v, ctx, MAX_VALUE, errors));
  const header = content.header?.variable ? resolve(content.header.variable, ctx, MAX_HEADER, errors) : null;
  let button: string | null = null;
  if (content.urlButton) {
    const raw = resolve(content.urlButton.variable, ctx, MAX_URL_VALUE, errors);
    // Percent-encoded, as Meta asks for URL button values; what is left after encoding must still be a plain URL suffix.
    if (raw !== null) {
      button = encodeURIComponent(raw);
      if (button.length > MAX_URL_VALUE) { errors.push({ code: 'value_too_long', variable: label(content.urlButton.variable) }); button = null; }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const values = body as string[];
  const fill = (text: string, list: string[]) => text.replace(PLACEHOLDER_RE, (_m, n: string) => list[Number(n) - 1] ?? '');
  return {
    ok: true, bodyParameters: values, headerParameter: header, urlButtonParameter: button,
    preview: {
      header: content.header ? fill(content.header.text, header ? [header] : []) : null,
      body: fill(content.bodyText, values),
      buttonUrl: content.urlButton && button !== null ? `${content.urlButton.baseUrl}${button}` : null,
    },
  };
}

/** The variables a version uses, flattened (for listing which fields a journey or an import must provide). */
export function usedVariables(content: Pick<WaTemplateContent, 'variables' | 'header' | 'urlButton'>): Array<Omit<WaVariable, 'position'>> {
  return [
    ...content.variables.map(({ source, name, defaultValue }) => ({ source, name, defaultValue })),
    ...(content.header?.variable ? [content.header.variable] : []),
    ...(content.urlButton ? [content.urlButton.variable] : []),
  ];
}

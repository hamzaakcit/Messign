/**
 * Template rendering (WP-14). Pure: no database, no network, no AI. A template is rendered from the profile's attributes,
 * the trigger payload and a few system values, nothing else (R-5: personalisation happens here, never in an LLM).
 *
 * The variable language is deliberately tiny:
 *   {{name}}                     a profile attribute (Unlayer's own merge-tag shape)
 *   {{payload.name}}             a value from the trigger payload (journeys, WP-16)
 *   {{unsubscribe_url}}          the recipient's unsubscribe page link (marketing mail)
 *   {{name | default: "text"}}   a fallback chosen by the author; without one, a missing value fails the render
 * No logic, no loops, no filters, no expressions. Anything else between {{ and }} is rejected when a version is saved.
 *
 * Output is escaped for where the variable sits: text and quoted attributes are HTML-escaped; in a URL attribute
 * (href, src, ...) a value that starts the URL must itself be an https URL, and a value after a static https prefix is
 * percent-encoded. Variables anywhere else (inside <style>, comments, tag or attribute names, unquoted attributes,
 * style= or event-handler attributes) are rejected when the version is saved. The HTML itself may not contain
 * <script>, <iframe>, <object>, <embed>, <form> or <base>, event-handler attributes, or javascript:/vbscript:/data: URLs.
 */

export type VariableSource = 'attribute' | 'payload' | 'system';
export interface VariableRef { name: string; source: VariableSource; defaultValue: string | null }

export const SYSTEM_VARIABLES = ['unsubscribe_url'] as const;
const NAME = '[A-Za-z_][A-Za-z0-9_]{0,63}';
const TOKEN_BODY = new RegExp(`^(?:(payload)\\.)?(${NAME})(?:\\s*\\|\\s*default:\\s*"([^"\\\\{}<>\\r\\n]{0,200})")?$`);
const MAX_VARIABLES_PER_PART = 200;
const MAX_VALUE_LENGTH = 1000;
const MAX_SUBJECT_LENGTH = 998;
const FORBIDDEN_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'form', 'base', 'frame', 'frameset', 'applet']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'background', 'poster', 'cite', 'formaction', 'xlink:href', 'longdesc', 'usemap']);
const RAWTEXT_TAGS = new Set(['style', 'textarea', 'xmp', 'noscript']);
const HTTPS_URL = /^https:\/\/[^\s"'<>\\]+$/;

export class TemplateSyntaxError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

type SlotContext = 'plain' | 'text' | 'attr' | 'url_start' | 'url_rest';
interface Slot { start: number; end: number; ref: VariableRef; ctx: SlotContext }
export interface ParsedPart { source: string; slots: Slot[] }
export interface ParsedTemplate { subject: ParsedPart; html: ParsedPart | null; text: ParsedPart | null; variables: VariableRef[] }

function findTokens(source: string, part: string): Array<{ start: number; end: number; ref: VariableRef }> {
  const out: Array<{ start: number; end: number; ref: VariableRef }> = [];
  let i = 0;
  for (;;) {
    const open = source.indexOf('{{', i);
    if (open < 0) break;
    const close = source.indexOf('}}', open + 2);
    if (close < 0) throw new TemplateSyntaxError('unclosed_variable', `${part}: "{{" at position ${open} is never closed`);
    const inner = source.slice(open + 2, close).trim();
    const m = TOKEN_BODY.exec(inner);
    if (!m) throw new TemplateSyntaxError('invalid_variable', `${part}: "{{${inner.slice(0, 60)}}}" is not a supported variable`);
    const name = m[2]!;
    const isSystem = !m[1] && (SYSTEM_VARIABLES as readonly string[]).includes(name);
    if (isSystem && m[3] !== undefined) throw new TemplateSyntaxError('invalid_variable', `${part}: ${name} cannot have a default`);
    out.push({ start: open, end: close + 2, ref: { name, source: m[1] ? 'payload' : isSystem ? 'system' : 'attribute', defaultValue: m[3] ?? null } });
    if (out.length > MAX_VARIABLES_PER_PART) throw new TemplateSyntaxError('too_many_variables', `${part}: more than ${MAX_VARIABLES_PER_PART} variables`);
    i = close + 2;
  }
  return out;
}

const startsWithIgnoreCase = (s: string, at: number, word: string) => s.slice(at, at + word.length).toLowerCase() === word;
const isTagNameChar = (ch: string) => /[A-Za-z0-9:-]/.test(ch);
const isSpace = (ch: string) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f';

/** A static URL value that would run code. Control characters and spaces are ignored, as browsers do. */
function dangerousUrl(value: string): boolean {
  const v = value.replace(/[\u0000- \u007f]+/g, '').toLowerCase();
  return v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:');
}

/**
 * Walks the HTML once, like a (much simplified) HTML tokenizer, and assigns each variable the context it sits in.
 * Also enforces the static rules (forbidden tags, event handlers, dangerous URLs).
 */
function classifyHtml(html: string, tokens: Array<{ start: number; end: number; ref: VariableRef }>): Slot[] {
  const slots: Slot[] = [];
  const tokenAt = new Map(tokens.map((t) => [t.start, t]));
  type State = 'data' | 'tag' | 'attrName' | 'afterAttrName' | 'beforeValue' | 'dq' | 'sq' | 'unq' | 'comment' | 'decl' | 'raw';
  let state: State = 'data';
  let tagName = '';
  let isEndTag = false;
  let attrName = '';
  let valueStart = 0;
  let rawTag = '';
  const invalid = (where: string) => { throw new TemplateSyntaxError('variable_in_unsafe_context', `html: a variable inside ${where} is not allowed`); };

  const finishValue = (end: number) => {
    const value = html.slice(valueStart, end);
    if (URL_ATTRS.has(attrName) && !value.includes('{{') && dangerousUrl(value)) {
      throw new TemplateSyntaxError('forbidden_url', `html: ${attrName} uses a javascript:, vbscript: or data: URL`);
    }
  };
  const openTag = (i: number): number => {
    // i points at '<'. Returns the index to continue from.
    let j = i + 1;
    isEndTag = html[j] === '/';
    if (isEndTag) j += 1;
    const nameStart = j;
    while (j < html.length && isTagNameChar(html[j]!)) {
      if (tokenAt.has(j)) invalid('a tag name');
      j += 1;
    }
    tagName = html.slice(nameStart, j).toLowerCase();
    if (!isEndTag && FORBIDDEN_TAGS.has(tagName)) throw new TemplateSyntaxError('forbidden_tag', `html: <${tagName}> is not allowed in an email template`);
    state = 'tag';
    return j;
  };

  let i = 0;
  while (i < html.length) {
    const tok = tokenAt.get(i);
    if (tok) {
      let ctx: SlotContext;
      // Right after "<" or "</" the browser would read the value as a tag name ("<{{x}}>" with x = "img onerror=...").
      if (state === 'data' && (html[i - 1] === '<' || (html[i - 1] === '/' && html[i - 2] === '<'))) invalid('a tag name');
      if (state === 'data') ctx = 'text';
      else if (state === 'dq' || state === 'sq') {
        if (attrName.startsWith('on') || attrName === 'style' || attrName === 'srcset') invalid(`the ${attrName} attribute`);
        if (URL_ATTRS.has(attrName)) {
          const prefix = html.slice(valueStart, i);
          if (prefix.trim() === '') ctx = 'url_start';
          else if (/^\s*https:\/\/[^\s"'<>]+/i.test(prefix) && !prefix.includes('{{')) ctx = 'url_rest';
          else if (prefix.includes('{{')) ctx = 'url_rest';
          else throw new TemplateSyntaxError('variable_in_unsafe_context', `html: a variable in ${attrName} must start the URL or follow an https:// prefix`);
        } else ctx = 'attr';
      } else if (state === 'unq') invalid('an unquoted attribute value');
      else if (state === 'raw') invalid(`<${rawTag}>`);
      else if (state === 'comment') invalid('an HTML comment');
      else invalid('a tag');
      slots.push({ start: tok.start, end: tok.end, ref: tok.ref, ctx: ctx! });
      i = tok.end;
      continue;
    }
    const ch = html[i]!;
    switch (state) {
      case 'data':
        if (ch === '<') {
          if (startsWithIgnoreCase(html, i, '<!--')) { state = 'comment'; i += 4; continue; }
          if (html[i + 1] === '!' || html[i + 1] === '?') { state = 'decl'; i += 2; continue; }
          if (html[i + 1] === '/' || /[A-Za-z]/.test(html[i + 1] ?? '')) { i = openTag(i); continue; }
        }
        i += 1; continue;
      case 'comment': {
        const end = html.indexOf('-->', i);
        const next = end < 0 ? html.length : end + 3;
        for (const t of tokens) if (t.start >= i && t.start < next) invalid('an HTML comment');
        state = 'data'; i = next; continue;
      }
      case 'decl': {
        const end = html.indexOf('>', i);
        const next = end < 0 ? html.length : end + 1;
        for (const t of tokens) if (t.start >= i && t.start < next) invalid('a declaration');
        state = 'data'; i = next; continue;
      }
      case 'raw': {
        const close = html.toLowerCase().indexOf(`</${rawTag}`, i);
        const next = close < 0 ? html.length : close;
        for (const t of tokens) if (t.start >= i && t.start < next) invalid(`<${rawTag}>`);
        i = next;
        if (close >= 0) i = openTag(close); else state = 'data';
        continue;
      }
      case 'tag':
        if (isSpace(ch) || ch === '/') { i += 1; continue; }
        if (ch === '>') {
          state = !isEndTag && RAWTEXT_TAGS.has(tagName) ? 'raw' : 'data';
          rawTag = tagName;
          i += 1; continue;
        }
        { // attribute name
          const start = i;
          while (i < html.length && !isSpace(html[i]!) && html[i] !== '=' && html[i] !== '>' && html[i] !== '/' ) {
            if (tokenAt.has(i)) invalid('an attribute name');
            i += 1;
          }
          attrName = html.slice(start, i).toLowerCase();
          if (/^on/.test(attrName)) throw new TemplateSyntaxError('forbidden_attribute', `html: event-handler attributes (${attrName}) are not allowed`);
          state = 'afterAttrName';
        }
        continue;
      case 'afterAttrName':
        if (isSpace(ch)) { i += 1; continue; }
        if (ch === '=') { state = 'beforeValue'; i += 1; continue; }
        state = 'tag'; continue;
      case 'beforeValue':
        if (isSpace(ch)) { i += 1; continue; }
        if (ch === '"') { state = 'dq'; valueStart = i + 1; i += 1; continue; }
        if (ch === "'") { state = 'sq'; valueStart = i + 1; i += 1; continue; }
        state = 'unq'; valueStart = i; continue;
      case 'dq':
        if (ch === '"') { finishValue(i); state = 'tag'; }
        i += 1; continue;
      case 'sq':
        if (ch === "'") { finishValue(i); state = 'tag'; }
        i += 1; continue;
      case 'unq':
        if (isSpace(ch) || ch === '>') { finishValue(i); state = 'tag'; continue; }
        i += 1; continue;
    }
  }
  return slots;
}

/** Validates a template and works out where each variable sits. Throws TemplateSyntaxError with a stable code. */
export function parseTemplate(input: { subject: string; html?: string | null; text?: string | null }): ParsedTemplate {
  if (typeof input.subject !== 'string' || input.subject.trim() === '') throw new TemplateSyntaxError('missing_subject', 'subject is required');
  if (/[\r\n]/.test(input.subject)) throw new TemplateSyntaxError('invalid_subject', 'subject must be one line');
  const html = typeof input.html === 'string' && input.html.trim() !== '' ? input.html : null;
  const text = typeof input.text === 'string' && input.text.trim() !== '' ? input.text : null;
  if (!html && !text) throw new TemplateSyntaxError('missing_body', 'html or text is required');

  const subjectTokens = findTokens(input.subject, 'subject');
  const subject: ParsedPart = { source: input.subject, slots: subjectTokens.map((t) => ({ ...t, ctx: 'plain' as const })) };
  const htmlPart = html ? { source: html, slots: classifyHtml(html, findTokens(html, 'html')) } : null;
  const textPart = text ? { source: text, slots: findTokens(text, 'text').map((t) => ({ ...t, ctx: 'plain' as const })) } : null;

  const seen = new Map<string, VariableRef>();
  for (const part of [subject, htmlPart, textPart]) {
    for (const s of part?.slots ?? []) {
      const key = `${s.ref.source}:${s.ref.name}`;
      const prev = seen.get(key);
      if (!prev || (prev.defaultValue === null && s.ref.defaultValue !== null)) seen.set(key, s.ref);
    }
  }
  return { subject, html: htmlPart, text: textPart, variables: [...seen.values()] };
}

export interface RenderInput {
  attributes: Record<string, unknown>;
  payload?: Record<string, unknown>;
  system?: Partial<Record<(typeof SYSTEM_VARIABLES)[number], string>>;
}
export interface RenderIssue { code: 'missing_variable' | 'unsupported_value' | 'value_too_long' | 'unsafe_url' | 'subject_too_long'; variable: string }
export type RenderResult =
  | { ok: true; subject: string; html: string | null; text: string | null }
  | { ok: false; errors: RenderIssue[] };

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const label = (ref: VariableRef) => (ref.source === 'payload' ? `payload.${ref.name}` : ref.name);

function lookup(ref: VariableRef, input: RenderInput): unknown {
  const from = ref.source === 'attribute' ? input.attributes : ref.source === 'payload' ? input.payload ?? {} : input.system ?? {};
  return Object.prototype.hasOwnProperty.call(from, ref.name) ? (from as Record<string, unknown>)[ref.name] : undefined;
}

/** Renders a parsed template. Never returns partial output: any issue fails the whole render (no blank sends). */
export function renderTemplate(t: ParsedTemplate, input: RenderInput): RenderResult {
  const errors: RenderIssue[] = [];
  const issue = (code: RenderIssue['code'], ref: VariableRef) => {
    if (!errors.some((e) => e.code === code && e.variable === label(ref))) errors.push({ code, variable: label(ref) });
  };

  const valueFor = (ref: VariableRef): string | null => {
    let raw = lookup(ref, input);
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      if (ref.defaultValue === null) { issue('missing_variable', ref); return null; }
      raw = ref.defaultValue;
    }
    if (typeof raw === 'number' && !Number.isFinite(raw)) { issue('unsupported_value', ref); return null; }
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') { issue('unsupported_value', ref); return null; }
    const s = String(raw);
    if (s.length > MAX_VALUE_LENGTH) { issue('value_too_long', ref); return null; }
    return s;
  };

  const renderPart = (part: ParsedPart | null, kind: 'subject' | 'html' | 'text'): string | null => {
    if (!part) return null;
    let out = '';
    let pos = 0;
    for (const slot of part.slots) {
      out += part.source.slice(pos, slot.start);
      pos = slot.end;
      const v = valueFor(slot.ref);
      if (v === null) continue;
      switch (slot.ctx) {
        case 'plain':
          // One line for the subject (no header injection); the text part keeps line breaks and tabs only.
          out += kind === 'subject' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ') : v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ');
          break;
        case 'text':
        case 'attr':
          out += escapeHtml(v);
          break;
        case 'url_start':
          if (!HTTPS_URL.test(v)) { issue('unsafe_url', slot.ref); continue; }
          try { new URL(v); } catch { issue('unsafe_url', slot.ref); continue; }
          out += escapeHtml(v);
          break;
        case 'url_rest':
          out += escapeHtml(encodeURIComponent(v));
          break;
      }
    }
    return out + part.source.slice(pos);
  };

  const subject = renderPart(t.subject, 'subject')!;
  const html = renderPart(t.html, 'html');
  const text = renderPart(t.text, 'text');
  if (!errors.length && subject.length > MAX_SUBJECT_LENGTH) errors.push({ code: 'subject_too_long', variable: '' });
  return errors.length ? { ok: false, errors } : { ok: true, subject, html, text };
}

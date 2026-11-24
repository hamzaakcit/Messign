/**
 * Redaction for anything engage logs. Key-based (secret-looking field names) plus value patterns for credentials that
 * show up inside free text such as error messages. Applied by engage/log.ts, so engage code never logs raw objects.
 */
const SECRET_KEY = /(secret|password|passwd|token|api[_-]?key|authorization|credential|private[_-]?key|ciphertext|wrapped|master[_-]?key|x-api-key|cookie)/i;
const VALUE_PATTERNS: RegExp[] = [
  /\bmke_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /\b[0-9a-fA-F]{40,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s'"]*:[^\s@'"]+@/g,
];

export const REDACTED = '[redacted]';

/** True for field names that look like they hold a secret. */
export const looksLikeSecretKey = (key: string): boolean => SECRET_KEY.test(key);

export function redactString(text: string): string {
  return VALUE_PATTERNS.reduce((out, re) => out.replace(re, REDACTED), text);
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (depth > 6) return REDACTED;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Buffer.isBuffer(value)) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

/**
 * Messign AI Brain — Data Sanitizer
 *
 * Removes sensitive fields from database query results before
 * they are formatted into context for the LLM.
 */

export const ALWAYS_BLOCKED = new Set([
  'password',
  'password_hash',
  'hashed_password',
  'password_digest',
  'token',
  'refresh_token',
  'access_token',
  'api_key',
  'secret',
  'secret_key',
  'totp_secret',
  'two_factor_secret',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'bank_account',
  'routing_number',
  'iban',
]);

export const ADMIN_ONLY = new Set([
  'salary',
  'compensation',
  'pay_rate',
  'hourly_rate',
  'ip_address',
  'last_login_ip',
]);

/**
 * Recursively sanitize data by removing sensitive fields.
 */
export function sanitizeData(data: unknown, isAdmin: boolean = false): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, isAdmin));
  }

  if (data instanceof Date) return data;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();

    if (ALWAYS_BLOCKED.has(keyLower)) continue;
    if (!isAdmin && ADMIN_ONLY.has(keyLower)) continue;

    sanitized[key] = sanitizeData(value, isAdmin);
  }

  return sanitized;
}

/**
 * Truncate a string to a maximum length.
 */
export function truncateText(text: string, maxLength: number = 3000): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}

/**
 * Extract a relevant excerpt from text around the best match.
 * For phrase-style queries (e.g. "handset dlr"), prefers the position that contains
 * the most terms together, so we get "Handset DLR | Status of delivery" not "handset number".
 */
export function extractRelevantExcerpt(
  text: string,
  searchTerms: string[],
  contextChars: number = 400
): string {
  if (!text?.trim()) return '';
  const lower = text.toLowerCase();
  const terms = searchTerms.filter((t) => t.length >= 2).map((t) => t.toLowerCase());

  // 1. Try phrase match first (e.g. "handset dlr" or "handset dlr")
  const phrase = terms.join(' ');
  const phrasePos = lower.indexOf(phrase);
  if (phrasePos >= 0) {
    const start = Math.max(0, phrasePos - contextChars);
    const end = Math.min(text.length, phrasePos + phrase.length + contextChars);
    let excerpt = text.slice(start, end);
    if (start > 0) excerpt = '... ' + excerpt;
    if (end < text.length) excerpt = excerpt + ' ...';
    return excerpt;
  }

  // 2. Try phrase with different spacing (e.g. "Handset DLR" in doc)
  const phraseAlt = terms.join('');
  const phraseAltPos = lower.indexOf(phraseAlt);
  if (phraseAltPos >= 0) {
    const start = Math.max(0, phraseAltPos - contextChars);
    const end = Math.min(text.length, phraseAltPos + phraseAlt.length + contextChars);
    let excerpt = text.slice(start, end);
    if (start > 0) excerpt = '... ' + excerpt;
    if (end < text.length) excerpt = excerpt + ' ...';
    return excerpt;
  }

  // 3. Find position with most terms in a tight window (prefer "Handset DLR" over "handset number")
  let bestPos = -1;
  let bestLen = 0;
  let bestTermCount = 0;
  const window = 80;

  for (const term of terms) {
    let pos = lower.indexOf(term);
    while (pos >= 0) {
      const windowStart = Math.max(0, pos - window);
      const windowEnd = Math.min(lower.length, pos + term.length + window);
      const slice = lower.slice(windowStart, windowEnd);
      const termCount = terms.filter((t) => slice.includes(t)).length;
      if (termCount > bestTermCount || (termCount === bestTermCount && (bestPos < 0 || pos < bestPos))) {
        bestTermCount = termCount;
        bestPos = pos;
        bestLen = term.length;
      }
      pos = lower.indexOf(term, pos + 1);
    }
  }

  // 4. Fallback: first occurrence of any term
  if (bestPos < 0) {
    for (const term of terms) {
      const pos = lower.indexOf(term);
      if (pos >= 0 && (bestPos < 0 || pos < bestPos)) {
        bestPos = pos;
        bestLen = term.length;
      }
    }
  }

  if (bestPos < 0) return truncateText(text, 2500);
  const start = Math.max(0, bestPos - contextChars);
  const end = Math.min(text.length, bestPos + bestLen + contextChars);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '... ' + excerpt;
  if (end < text.length) excerpt = excerpt + ' ...';
  return excerpt;
}

/**
 * Limit the number of records in an array.
 */
export function limitRecords<T>(records: T[], maxRecords: number = 50): T[] {
  if (records.length <= maxRecords) return records;
  return records.slice(0, maxRecords);
}

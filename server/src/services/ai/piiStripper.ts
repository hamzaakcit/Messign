/**
 * Messign AI Brain — PII Stripping Layer
 *
 * Sanitizes free-text data before sending to external AI APIs.
 * Complements dataSanitizer.ts which blocks field names;
 * this catches regex patterns (emails, phones, IBANs, credit cards)
 * that appear in free-text fields.
 */

const PII_PATTERNS: Record<string, RegExp> = {
  email: /[\w.+-]+@[\w.-]+\.\w{2,}/g,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
};

export interface StrippedResult {
  sanitizedText: string;
  strippedCount: number;
  mappings: Map<string, string>;
}

export function stripPII(text: string): StrippedResult {
  let sanitized = text;
  const mappings = new Map<string, string>();
  let counter = 0;

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const label = type.toUpperCase();
    sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      const token = `[${label}_${++counter}]`;
      mappings.set(token, match);
      return token;
    });
  }

  return { sanitizedText: sanitized, strippedCount: counter, mappings };
}

export function restorePII(text: string, mappings: Map<string, string>): string {
  let restored = text;
  for (const [token, original] of mappings) {
    restored = restored.replaceAll(token, original);
  }
  return restored;
}

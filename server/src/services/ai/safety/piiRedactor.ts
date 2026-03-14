/**
 * Prompt Firewall — PII Redaction
 *
 * Detects and redacts PII before sending to external LLM APIs.
 * Restore in the response so the user sees original values.
 *
 * TODO: Replace regex-only approach with a dedicated NER model for production.
 */

export interface RedactionMap {
  original: string;
  placeholder: string;
}

export interface RedactionResult {
  redactedText: string;
  redactions: RedactionMap[];
}

/** Extensible PII patterns. Add new patterns here for easy maintenance. */
export const PII_PATTERNS: Array<{ name: string; regex: RegExp; prefix: string }> = [
  // Email addresses
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, prefix: 'EMAIL' },

  // Phone numbers — international formats
  { name: 'phone_intl', regex: /\+\d{1,4}[-.\s]?(?:\(?\d{1,4}\)?[-.\s]?){0,4}\d{1,9}\b/g, prefix: 'PHONE' },
  // Turkish format: +90 5XX XXX XX XX
  { name: 'phone_tr', regex: /\b\+90\s*5\d{2}\s*\d{3}\s*\d{2}\s*\d{2}\b/g, prefix: 'PHONE' },
  // US/NA: (XXX) XXX-XXXX, XXX-XXX-XXXX
  { name: 'phone_us', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, prefix: 'PHONE' },
  // Generic: groups of 3–4 digits with separators
  { name: 'phone_generic', regex: /\b\d{3,4}[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g, prefix: 'PHONE' },

  // Credit card numbers (with spaces/dashes)
  { name: 'credit_card', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, prefix: 'CC' },

  // IBAN (international format)
  { name: 'iban', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, prefix: 'IBAN' },

  // Turkish TC Kimlik (11 digits, first digit 1–9)
  { name: 'tc_kimlik', regex: /\b[1-9]\d{10}\b/g, prefix: 'NATID' },

  // US Social Security Numbers (XXX-XX-XXXX)
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, prefix: 'SSN' },
];

export function redactPII(text: string): RedactionResult {
  const redactions: RedactionMap[] = [];
  let redacted = text;
  let counter = 0;

  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern.regex, (match) => {
      counter++;
      const placeholder = `[${pattern.prefix}_${counter}]`;
      redactions.push({ original: match, placeholder });
      return placeholder;
    });
  }

  return { redactedText: redacted, redactions };
}

export function restorePII(text: string, redactions: RedactionMap[]): string {
  let restored = text;
  for (const { original, placeholder } of redactions) {
    restored = restored.replaceAll(placeholder, original);
  }
  return restored;
}

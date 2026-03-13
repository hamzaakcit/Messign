/**
 * Prompt Firewall — PII Redaction
 *
 * Detects and redacts PII before sending to external LLM APIs.
 * Restore in the response so the user sees original values.
 */

export interface RedactionMap {
  original: string;
  placeholder: string;
}

export interface RedactionResult {
  redactedText: string;
  redactions: RedactionMap[];
}

const PII_PATTERNS: Array<{ name: string; regex: RegExp; prefix: string }> = [
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, prefix: 'EMAIL' },
  { name: 'phone', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, prefix: 'PHONE' },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, prefix: 'SSN' },
  { name: 'credit_card', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, prefix: 'CC' },
  { name: 'iban', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, prefix: 'IBAN' },
  { name: 'tc_kimlik', regex: /\b\d{11}\b/g, prefix: 'NATID' }, // Turkish ID (adjust per locale)
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

/**
 * Messign AI Brain — PII Stripping Layer
 *
 * Delegates to the canonical PII redactor in safety/piiRedactor.ts.
 * This file preserves the existing API surface (stripPII / restorePII with Map)
 * so callers don't need changes.
 */

import { redactPII, restorePII as redactorRestore, type RedactionMap } from './safety/piiRedactor.js';

export interface StrippedResult {
  sanitizedText: string;
  strippedCount: number;
  mappings: Map<string, string>;
}

export function stripPII(text: string): StrippedResult {
  const { redactedText, redactions } = redactPII(text);
  const mappings = new Map<string, string>();
  for (const r of redactions) {
    mappings.set(r.placeholder, r.original);
  }
  return { sanitizedText: redactedText, strippedCount: redactions.length, mappings };
}

export function restorePII(text: string, mappings: Map<string, string>): string {
  const redactions: RedactionMap[] = [];
  for (const [placeholder, original] of mappings) {
    redactions.push({ original, placeholder });
  }
  return redactorRestore(text, redactions);
}

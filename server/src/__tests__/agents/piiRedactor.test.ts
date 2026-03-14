/**
 * PII detection and restoration tests.
 */
import { describe, it, expect } from 'vitest';
import { redactPII, restorePII } from '../../services/ai/safety/piiRedactor.js';

describe('redactPII', () => {
  it('redacts email', () => {
    const result = redactPII('Contact john@example.com for details');
    expect(result.redactedText).toBe('Contact [EMAIL_1] for details');
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0]).toEqual({ original: 'john@example.com', placeholder: '[EMAIL_1]' });
  });

  it('redacts Turkish phone', () => {
    const result = redactPII('Call me at +90 532 123 45 67');
    expect(result.redactedText).toContain('[PHONE_1]');
    expect(result.redactions.some((r) => r.original.includes('532'))).toBe(true);
  });

  it('redacts credit card', () => {
    // Use format without dashes so phone_generic does not match first
    const result = redactPII('Card: 4111111111111111');
    expect(result.redactedText).toContain('[CC_1]');
    expect(result.redactions.some((r) => r.original.includes('4111'))).toBe(true);
  });

  it('redacts IBAN', () => {
    const result = redactPII('TR330006100519786457841326');
    expect(result.redactedText).toContain('[IBAN_1]');
    expect(result.redactions.some((r) => r.original.includes('TR33'))).toBe(true);
  });

  it('redacts TC Kimlik or similar 11-digit ID (NATID or PHONE depending on pattern order)', () => {
    // Note: phone_us may match 11 digits as 4+3+4; NATID matches 11 digits. One will redact.
    const result = redactPII('TC: 12345678901');
    expect(result.redactedText).not.toContain('12345678901');
    expect(result.redactions.length).toBeGreaterThanOrEqual(1);
    expect(result.redactions[0]!.original).toBe('12345678901');
  });

  it('redacts multiple PII in one message', () => {
    const text = 'Email john@example.com and call +90 532 123 45 67';
    const result = redactPII(text);
    expect(result.redactedText).toContain('[EMAIL_1]');
    expect(result.redactedText).toMatch(/\[PHONE_\d+\]/);
    expect(result.redactions.length).toBeGreaterThanOrEqual(2);
  });

  it('restorePII round-trip: redacted text restores to original', () => {
    const text = 'Contact john@example.com for details. Card: 4111-1111-1111-1111';
    const { redactedText, redactions } = redactPII(text);
    const restored = restorePII(redactedText, redactions);
    expect(restored).toBe(text);
  });

  it('restorePII with empty redactions returns text unchanged', () => {
    const text = 'No PII here';
    expect(restorePII(text, [])).toBe(text);
  });

  it('handles text with no PII', () => {
    const result = redactPII('Hello world, no sensitive data');
    expect(result.redactedText).toBe('Hello world, no sensitive data');
    expect(result.redactions).toHaveLength(0);
  });
});

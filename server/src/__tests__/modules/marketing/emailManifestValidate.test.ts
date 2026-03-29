import { describe, it, expect } from 'vitest';
import { validateEmailManifestInput } from '../../../modules/marketing/emailManifestValidate.js';

describe('validateEmailManifestInput', () => {
  it('accepts a minimal valid VA2 manifest', () => {
    const r = validateEmailManifestInput({
      version: '2.0',
      theme: 'startup',
      subject: 'Hello',
      preheader: 'x'.repeat(100),
      sections: [
        { type: 'hero', order: 1, content: { headline: 'H' } },
        { type: 'footer', order: 2, content: { companyName: 'C', address: 'A' } },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects empty manifest', () => {
    const r = validateEmailManifestInput(null);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'manifest')).toBe(true);
  });

  it('warns on short preheader when present', () => {
    const r = validateEmailManifestInput({
      version: '2.0',
      theme: 'minimal',
      subject: 'Hello',
      preheader: 'short',
      sections: [
        { type: 'hero', order: 1, content: { headline: 'H' } },
        { type: 'footer', order: 2, content: { companyName: 'C', address: 'A' } },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field === 'preheader')).toBe(true);
  });
});

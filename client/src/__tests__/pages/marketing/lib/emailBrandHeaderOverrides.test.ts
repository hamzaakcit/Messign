import { describe, expect, it } from 'vitest';
import {
  buildEmailBrandOverridesForAssembly,
  getDefaultEmailHeaderLogoUrl,
} from '@/pages/marketing/lib/emailBrandHeaderOverrides';

describe('buildEmailBrandOverridesForAssembly', () => {
  it('uses first-party placeholder when no colors and no logo', () => {
    const r = buildEmailBrandOverridesForAssembly(undefined, undefined, undefined);
    expect(r.logoUrl).toBe(getDefaultEmailHeaderLogoUrl());
    expect(r.logoUrl).toMatch(/email-logo-placeholder\.svg/);
    expect(r.logoAlt).toBe('Brand logo');
  });

  it('uses tenant logo when provided', () => {
    const r = buildEmailBrandOverridesForAssembly(undefined, 'https://cdn.example.com/logo.png', 'Acme');
    expect(r.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(r.logoAlt).toBe('Acme logo');
  });

  it('resolves relative logo paths to absolute URLs', () => {
    const r = buildEmailBrandOverridesForAssembly(undefined, '/uploads/org/logo.png', 'Acme');
    expect(r.logoUrl).toMatch(/logo\.png$/);
    expect(r.logoUrl).toMatch(/^https?:\/\//);
  });

  it('uses placeholder when colors exist but logo missing', () => {
    const r = buildEmailBrandOverridesForAssembly(
      { primary: '#112233', accent: '#445566' },
      undefined,
      undefined,
    );
    expect(r.logoUrl).toBe(getDefaultEmailHeaderLogoUrl());
    expect(r.primaryHex).toBe('#112233');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllowedCorsOrigins, isOriginAllowed } from '../../config/corsOrigins.js';

describe('corsOrigins', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://www.messign.com';
    delete process.env.ADDITIONAL_CORS_ORIGINS;
    delete process.env.ALLOW_VERCEL_PREVIEW_CORS;
  });

  it('isOriginAllowed allows undefined origin', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('isOriginAllowed allows Vercel preview when ALLOW_VERCEL_PREVIEW_CORS=1', () => {
    process.env.ALLOW_VERCEL_PREVIEW_CORS = '1';
    expect(isOriginAllowed('https://messign-git-fix-abc123.vercel.app')).toBe(true);
  });

  it('isOriginAllowed rejects random vercel.app when flag unset', () => {
    expect(isOriginAllowed('https://evil.vercel.app')).toBe(false);
  });

  it('development allows the local engage and merged previews (3200, 3300), not other ports', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('http://localhost:3300')).toBe(true);
    expect(isOriginAllowed('http://localhost:3200')).toBe(true);
    expect(isOriginAllowed('http://localhost:3400')).toBe(false);
  });

  it('getAllowedCorsOrigins includes CLIENT_URL in production', () => {
    process.env.CLIENT_URL = 'https://app.example.com';
    const list = getAllowedCorsOrigins();
    expect(list).toContain('https://app.example.com');
    expect(isOriginAllowed('https://app.example.com')).toBe(true);
  });
});

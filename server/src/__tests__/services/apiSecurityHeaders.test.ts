import { describe, expect, it } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import type { AddressInfo } from 'node:net';
import { apiHelmetOptions } from '../../config/apiSecurityHeaders.js';

async function headersFor(env: NodeJS.ProcessEnv): Promise<Headers> {
  const app = express();
  app.use(helmet(apiHelmetOptions(env)));
  app.get('/x', (_req, res) => { res.json({ ok: true }); });
  const server = await new Promise<import('node:http').Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/x`);
    return r.headers;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('API security headers (WP-31)', () => {
  it('lets a response load nothing and be framed by nothing: no unsafe-inline, no unsafe-eval', async () => {
    const h = await headersFor({ NODE_ENV: 'production' });
    const csp = h.get('content-security-policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https:|http:/);
  });
  it('keeps HSTS, nosniff and no sniffing of framing', async () => {
    const h = await headersFor({ NODE_ENV: 'production' });
    expect(h.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('x-powered-by')).toBeNull();
  });
  it('does not force https upgrades in development', async () => {
    expect((await headersFor({ NODE_ENV: 'development' })).get('content-security-policy')).not.toContain('upgrade-insecure-requests');
  });
});

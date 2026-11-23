/**
 * Security headers of the client (WP-31). The client is static files on Vercel, so its headers live in vercel.json (the
 * root file Vercel uses, and client/vercel.json for a project rooted in client/). What this guards:
 *  - both files carry the same headers;
 *  - the enforced policy keeps the page unframeable and plugin-free, and the nosniff / referrer / transport headers are there;
 *  - the strict policy (report-only until a browser pass says it is clean, see docs/quality/security-checklist-wp31.md)
 *    allows no inline or eval script except the one inline theme script in index.html, which is allowed by its hash;
 *  - the API origin the production build talks to is in connect-src, so enforcing it later cannot cut the app off.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
type Header = { key: string; value: string };
const headersOf = (file: string): Header[] => {
  const cfg = JSON.parse(read(file)) as { headers: Array<{ source: string; headers: Header[] }> };
  const all = cfg.headers.find((h) => h.source === '/(.*)');
  if (!all) throw new Error(`${file} has no headers for every path`);
  return all.headers;
};
const value = (hs: Header[], key: string) => hs.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? '';
const directive = (policy: string, name: string) => policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name) ?? '';

describe('client security headers', () => {
  it('are identical in vercel.json and client/vercel.json', () => {
    expect(headersOf('client/vercel.json')).toEqual(headersOf('vercel.json'));
  });

  const hs = headersOf('vercel.json');

  it('enforce: no framing, no plugins, no base or form hijack', () => {
    const csp = value(hs, 'Content-Security-Policy');
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
  });

  it('send nosniff, a referrer policy, a permissions policy and HSTS', () => {
    expect(value(hs, 'X-Content-Type-Options')).toBe('nosniff');
    expect(value(hs, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(value(hs, 'Permissions-Policy')).toMatch(/geolocation=\(\)/);
    expect(Number(/max-age=(\d+)/.exec(value(hs, 'Strict-Transport-Security'))?.[1])).toBeGreaterThanOrEqual(31536000);
    expect(value(hs, 'Strict-Transport-Security')).not.toMatch(/includeSubDomains|preload/); // other subdomains (mail tracking, DNS records) are not ours to force
  });

  const strict = value(hs, 'Content-Security-Policy-Report-Only');

  it('strict policy: scripts only from self, Unlayer and the one hashed inline script', () => {
    const script = directive(strict, 'script-src');
    expect(script).not.toMatch(/'unsafe-eval'|'unsafe-inline'|\bhttps:(?!\/\/)|\*(?!\.)/);
    const html = read('client/index.html');
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      expect(script, 'an inline script in client/index.html is not allowed by hash: update the hash in both vercel.json files').toContain(hash);
    }
  });

  it('strict policy: unlisted sources are denied, and the production API origin is reachable', () => {
    expect(directive(strict, 'default-src')).toBe("default-src 'self'");
    expect(directive(strict, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    const apiUrl = /^VITE_API_URL=(.+)$/m.exec(read('client/.env.production'))?.[1]?.trim();
    expect(apiUrl).toMatch(/^https:\/\//);
    const origin = new URL(apiUrl!).origin;
    const connect = directive(strict, 'connect-src');
    expect(connect).toContain(origin);
    expect(connect).toContain(origin.replace('https://', 'wss://')); // socket.io
  });
});

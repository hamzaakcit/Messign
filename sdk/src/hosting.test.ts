import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = path.join(repo, 'client', 'public');

interface VercelConfig {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

function vercelConfig(file: string): VercelConfig {
  return JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8')) as VercelConfig;
}

function headerValue(file: string, source: string, name: string): string | undefined {
  const rule = vercelConfig(file).headers.find((item) => item.source === source);
  return rule?.headers.find((item) => item.key === name)?.value;
}

/** Same shape as Vercel's documented SPA exception: `/((?!api/).*)`. */
const SPA_REWRITE = /^\/((?!sdk\/).*)$/;

function cacheControl(pathname: string): string | null {
  if (pathname === '/sdk/v1/loader.js') return 'public, max-age=300, must-revalidate';
  if (/^\/sdk\/v1\/messign\.[^/]+\.js$/.test(pathname)) return 'public, max-age=31536000, immutable';
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return null;
}

function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    const file = path.join(publicDir, pathname);
    const exists = file.startsWith(publicDir) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (exists) {
      const type = file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const cache = cacheControl(pathname);
      if (cache) res.setHeader('Cache-Control', cache);
      res.end(fs.readFileSync(file));
      return;
    }
    if (pathname.startsWith('/sdk/')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }
    if (SPA_REWRITE.test(pathname)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><div id="root"></div>');
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        close: () => new Promise((done) => { server.close(() => done()); }),
      });
    });
  });
}

describe('static hosting', () => {
  it('gives the loader a short cache and the hashed runtime an immutable cache in both Vercel configs', () => {
    for (const file of ['client/vercel.json', 'vercel.json']) {
      expect(headerValue(file, '/sdk/v1/loader.js', 'Cache-Control')).toBe('public, max-age=300, must-revalidate');
      expect(headerValue(file, '/sdk/v1/messign.(.*).js', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
      expect(headerValue(file, '/sdk/v1/loader.js', 'Content-Type')).toBeUndefined();
      expect(vercelConfig(file).rewrites).toEqual([
        { source: '/((?!sdk/).*)', destination: '/index.html' },
      ]);
    }
    expect(SPA_REWRITE.test('/login')).toBe(true);
    expect(SPA_REWRITE.test('/signup')).toBe(true);
    expect(SPA_REWRITE.test('/marketing/email')).toBe(true);
    expect(SPA_REWRITE.test('/assets/app.js')).toBe(true);
    expect(SPA_REWRITE.test('/sdk/v1/loader.js')).toBe(false);
    expect(SPA_REWRITE.test('/sdk/v1/missing.js')).toBe(false);
  });

  it('serves the SDK as JavaScript ahead of the SPA fallback', async () => {
    const server = await listen();
    try {
      const loader = await fetch(`http://127.0.0.1:${server.port}/sdk/v1/loader.js`);
      const loaderText = await loader.text();
      expect(loader.status).toBe(200);
      expect(loader.headers.get('content-type')).toContain('application/javascript');
      expect(loader.headers.get('cache-control')).toBe('public, max-age=300, must-revalidate');
      expect(loaderText.startsWith('(function')).toBe(true);
      const runtimeName = loaderText.match(/messign\.[a-f0-9]+\.js/)?.[0];
      expect(runtimeName).toBeTruthy();
      const runtime = await fetch(`http://127.0.0.1:${server.port}/sdk/v1/${runtimeName}`);
      const runtimeText = await runtime.text();
      expect(runtime.status).toBe(200);
      expect(runtime.headers.get('content-type')).toContain('application/javascript');
      expect(runtime.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(runtimeText).toContain('https://server-production-7283.up.railway.app');
      expect(runtimeText).not.toContain('http://127.0.0.1:3001');
      expect(runtimeText).not.toContain('sourceMappingURL');
      const missing = await fetch(`http://127.0.0.1:${server.port}/sdk/v1/does-not-exist.js`);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('content-type')).not.toContain('text/html');
      const map = await fetch(`http://127.0.0.1:${server.port}/sdk/v1/${runtimeName}.map`);
      expect(map.status).toBe(404);
      expect(await map.text()).not.toContain('<div id="root">');
      const login = await fetch(`http://127.0.0.1:${server.port}/login`);
      expect(login.status).toBe(200);
      expect(login.headers.get('content-type')).toContain('text/html');
      expect(await login.text()).toContain('<div id="root">');
    } finally {
      await server.close();
    }
  });
});

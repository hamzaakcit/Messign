import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { signAccess } from '../../../utils/jwt.js';

export const token = (sub: string, org?: string) => signAccess({ sub, role: 'admin', ...(org ? { organizationId: org } : {}) });

export interface TestApp {
  http: (path: string, opts?: { token?: string; key?: string; method?: string; body?: unknown }) => Promise<{ status: number; json: Record<string, unknown>; text: string; headers: Headers }>;
  close: () => Promise<void>;
}

/**
 * The real engage router behind the real JWT middleware, on an ephemeral port. Import it only after the fixture has
 * pointed the legacy pool at the scratch database (authMiddleware pulls that pool in).
 */
export async function startEngageApp(): Promise<TestApp> {
  const { optionalJwt } = await import('../../../middleware/authMiddleware.js');
  const { engageRouter } = await import('../../../engage/routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api', optionalJwt);
  app.use('/api/engage', engageRouter);
  let server!: Server;
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/engage`;
  return {
    async http(path, opts = {}) {
      const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
      const r = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.key ? { 'x-api-key': opts.key } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await r.text();
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, json, text, headers: r.headers };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

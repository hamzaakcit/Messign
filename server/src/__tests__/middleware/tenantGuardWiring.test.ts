import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

/**
 * The guard only helps if it runs before the routes it protects (ADR-017). Express runs middleware in mount order, so
 * a Company-OS router mounted above the guard would be open to tenants again. This reads the real `index.ts` and
 * checks the order, which a unit test of the guard itself cannot.
 */
const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, '../../index.ts'), 'utf8');
const at = (needle: string): number => indexSource.indexOf(needle);

describe('tenant guard wiring in index.ts', () => {
  it('is mounted on /api right after the token is read, before any /api router', () => {
    const jwt = at("app.use('/api', optionalJwt);");
    const guard = at("app.use('/api', tenantGuard);");
    expect(jwt).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(jwt);
    // Every router mounted on /api comes after the guard.
    const firstRouter = [...indexSource.matchAll(/app\.use\('\/api\/[^']+'/g)].map((m) => m.index!).find((i) => i > jwt)!;
    expect(firstRouter).toBeGreaterThan(guard);
    // And nothing between the token and the guard mounts a route.
    expect(indexSource.slice(jwt, guard)).not.toMatch(/app\.(use|get|post|put|patch|delete)\(\s*'\/api\//);
  });

  it('is also applied to production file downloads and the socket handshake', () => {
    expect(indexSource).toMatch(/app\.use\('\/uploads', optionalJwt, async[\s\S]{0,700}isEngageTenantOrg\(req\.jwtOrganizationId\)/);
    const sockets = readFileSync(resolve(here, '../../sockets/index.ts'), 'utf8');
    expect(sockets).toMatch(/verifyAccess\(token\)[\s\S]{0,1500}isEngageTenantOrg\(payload\.organizationId\)/);
  });
});

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * ADR-002: engage code reaches the database only through engage/db.ts, and imports only what ADR-001 allows
 * (never Company-OS modules). Bootstrap code may use the legacy pool, because provisioning writes legacy tables.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGAGE = join(SRC, 'engage');

/** Targets (relative to src/) that engage code outside engage/ may import. */
const ALLOWED_OUTSIDE = [
  /^config\/productSurface$/,
  /^utils\/jwt$/,
  /^middleware\/authMiddleware$/,
  /^services\/ai\/gateway$/,
  /^dal\/marketing\//,
];
const POOL_FILES = [/^engage\/db\.ts$/];
const LEGACY_DB_FILES = [/^engage\/bootstrap\//];

export interface ImportRef { specifier: string; typeOnly: boolean }

export function scanImports(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const stat = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(stat)) refs.push({ specifier: m[3]!, typeOnly: Boolean(m[2]) });
  for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.push({ specifier: m[1]!, typeOnly: false });
  for (const m of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.push({ specifier: m[1]!, typeOnly: false });
  return refs;
}

export function violations(fileRel: string, source: string): string[] {
  const out: string[] = [];
  const fileDir = dirname(join(SRC, fileRel));
  for (const { specifier, typeOnly } of scanImports(source)) {
    if (typeOnly) continue;
    if (specifier === 'pg' || specifier.startsWith('pg/')) {
      if (!POOL_FILES.some((r) => r.test(fileRel))) out.push(`${fileRel}: imports "${specifier}" (only engage/db.ts may)`);
      continue;
    }
    if (!specifier.startsWith('.')) continue;
    const target = relative(SRC, resolve(fileDir, specifier)).replace(/\\/g, '/').replace(/\.(js|ts)$/, '');
    if (target.startsWith('engage/') || target === 'engage') continue;
    if (/^db\/index$/.test(target)) {
      if (!LEGACY_DB_FILES.some((r) => r.test(fileRel))) out.push(`${fileRel}: imports the legacy pool "${specifier}" (use engage/db.ts)`);
      continue;
    }
    if (!ALLOWED_OUTSIDE.some((r) => r.test(target))) out.push(`${fileRel}: imports "${specifier}" -> ${target}, which engage may not depend on`);
  }
  return out;
}

function engageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? engageFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('engage import lint', () => {
  it('no engage source file breaks the import rules', () => {
    const files = engageFiles(ENGAGE);
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap((p) => violations(relative(SRC, p).replace(/\\/g, '/'), readFileSync(p, 'utf-8')));
    expect(found).toEqual([]);
  });

  describe('the linter itself', () => {
    it('flags direct pool and query imports', () => {
      expect(violations('engage/routes.ts', `import { pool } from '../db/index.js';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `import { query } from '../db/index';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `const { pool } = await import('../db/index.js');`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `const x = require('../db/index.js');`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `export { pool } from '../db/index.js';`)).toHaveLength(1);
    });
    it('flags the pg package outside engage/db.ts', () => {
      expect(violations('engage/routes.ts', `import pg from 'pg';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `import { Pool } from 'pg';`)).toHaveLength(1);
      expect(violations('engage/db.ts', `import pg from 'pg';`)).toEqual([]);
    });
    it('allows type-only imports and the bootstrap exception', () => {
      expect(violations('engage/routes.ts', `import type { Pool } from 'pg';`)).toEqual([]);
      expect(violations('engage/bootstrap/provisionOrganization.ts', `const { pool } = await import('../../db/index.js');`)).toEqual([]);
    });
    it('flags Company-OS and other disallowed dependencies, allows the permitted ones', () => {
      expect(violations('engage/routes.ts', `import { x } from '../routes/finance/index.js';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `import { x } from '../modules/crm/index.js';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `import { x } from '../services/finance/doraScheduler.js';`)).toHaveLength(1);
      expect(violations('engage/routes.ts', `import { verifyAccess } from '../utils/jwt.js';`)).toEqual([]);
      expect(violations('engage/routes.ts', `import { generate } from '../services/ai/gateway.js';`)).toEqual([]);
      expect(violations('engage/middleware/auth.ts', `import { a } from '../db.js';`)).toEqual([]);
    });
    it('ignores third-party packages', () => {
      expect(violations('engage/routes.ts', `import express from 'express';\nimport bcrypt from 'bcrypt';`)).toEqual([]);
    });
  });
});

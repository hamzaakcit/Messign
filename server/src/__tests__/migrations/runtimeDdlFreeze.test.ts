import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

/**
 * Schema changes go in server/src/migrations/NNN_name.sql only (ADR-010). Runtime DDL that existed before WP-03 is
 * frozen: no new file may contain DDL, and the files below may not gain more. Remove entries as the code is retired.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Uppercase DDL keywords, or lowercase DDL followed by what real SQL has next (not prose like "Failed to create policy").
const DDL = new RegExp(
  [
    String.raw`\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|EXTENSION|MATERIALIZED|POLICY|TYPE|UNIQUE INDEX|OR REPLACE FUNCTION|FUNCTION)\b`,
    String.raw`\b(?:create|alter|drop)\s+(?:table|unique index|index|materialized view|schema|extension)\s+(?:if\s+(?:not\s+)?exists|only|[a-z_][\w."]*\s*(?:\(|on\b|add\b|drop\b|rename\b))`,
  ].join('|'),
  'g',
);

const FROZEN: Record<string, number> = {
  'db/seeds/financeSeed.ts': 18,
  'force-db-fix.ts': 13,
  'db/initNewTables.ts': 13,
  'services/rag/db.ts': 7,
  'services/ai/actions/actionStore.ts': 7,
  'services/ai/sync/ragOutbox.ts': 2,
  'db/seed.ts': 2,
  'db/fixMissingColumns.ts': 2,
  'scripts/applyRlsMigrations.ts': 2, // comment only; the script applies db/migrations files
  'db/runClaudeUsageMigration.ts': 1,
};

/** The runner is the migration mechanism itself and creates its own bookkeeping table. */
const EXEMPT = new Set(['migrations/runner.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('runtime DDL freeze', () => {
  const counts = new Map<string, number>();
  for (const f of sourceFiles(SRC)) {
    const n = (readFileSync(f, 'utf-8').match(DDL) ?? []).length;
    const rel = relative(SRC, f).replace(/\\/g, '/');
    if (n > 0 && !EXEMPT.has(rel)) counts.set(rel, n);
  }

  it('no new file contains DDL', () => {
    const unexpected = [...counts.keys()].filter((f) => !(f in FROZEN));
    expect(unexpected, 'Put schema changes in a migration file (server/src/migrations/NNN_name.sql), not in TypeScript').toEqual([]);
  });

  it('frozen files do not gain DDL', () => {
    for (const [file, max] of Object.entries(FROZEN)) {
      expect(counts.get(file) ?? 0, `${file} grew its DDL`).toBeLessThanOrEqual(max);
    }
  });

  it('the allow-list has no stale entries (shrink it when files are cleaned up)', () => {
    const stale = Object.keys(FROZEN).filter((f) => !counts.has(f));
    expect(stale).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP, HELP_TIP_MAX } from '@/lib/helpContent';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('help registry (ADR-026)', () => {
  const entries = Object.entries(HELP);

  it.each(entries)('%s: tip is one sentence of at most 120 characters', (_id, entry) => {
    expect(entry.tip.length).toBeLessThanOrEqual(HELP_TIP_MAX);
    expect(entry.tip).toMatch(/[.?!]$/);
    expect(entry.tip.slice(0, -1)).not.toMatch(/[.?!]\s+[A-Z]/);
  });

  it.each(entries)('%s: title is at most four words', (_id, entry) => {
    expect(entry.title.trim().split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it('every helpId used in the client exists in the registry', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(resolve('src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/helpId="([A-Za-z0-9]+)"/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) expect(Object.keys(HELP)).toContain(id);
  });
});

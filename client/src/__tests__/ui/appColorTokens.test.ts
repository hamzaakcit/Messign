import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tailwind's `app` colour group has no DEFAULT, so `text-app`, `bg-app`, `border-app` and the like generate no CSS
 * and silently inherit (ADR-026 §6). Marketing and engage must use the defined tokens: `text-app-text`,
 * `bg-app-bg`, `bg-app-card`, `border-app-border`, `text-app-muted`, …
 */
const ROOTS = ['src/pages/marketing', 'src/engage'];
const BARE = /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|divide|ring|outline|from|via|to|fill|stroke|placeholder|decoration|accent|caret)-app(?:\/\d+)?(?=["'`\s]|$)/gm;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('app colour tokens (ADR-026)', () => {
  it('marketing and engage use no bare app colour class', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(resolve(root))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (/^\s*(\*|\/\/)/.test(line)) return;
          for (const m of line.matchAll(BARE)) offenders.push(`${relative(resolve('.'), file)}:${i + 1} ${m[0]}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the pattern catches the classes it is meant to', () => {
    const sample = `className="text-app hover:text-app border-app/60 divide-app" x='bg-app'`;
    expect(sample.match(BARE)).toHaveLength(5);
    expect('text-app-text bg-app-card border-app-border text-app-muted'.match(BARE)).toBeNull();
  });
});

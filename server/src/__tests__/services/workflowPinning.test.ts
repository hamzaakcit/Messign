/** WP-31: every GitHub Action is pinned to a full commit, and every workflow says what its token may do. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '..', '..', '..', '..', '.github', 'workflows');
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

describe('GitHub workflows', () => {
  it.each(files)('%s pins every action to a commit', (file) => {
    const uses = [...readFileSync(join(dir, file), 'utf8').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]!);
    for (const u of uses) expect(u, `${file}: ${u}`).toMatch(/@[0-9a-f]{40}$/);
  });
  it.each(files)('%s sets the token permissions explicitly', (file) => {
    expect(readFileSync(join(dir, file), 'utf8')).toMatch(/^permissions:/m);
  });
});

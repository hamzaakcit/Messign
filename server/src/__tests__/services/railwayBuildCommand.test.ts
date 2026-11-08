import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8');

describe('production server build', () => {
  it('installs dev dependencies even when NODE_ENV=production, because tsc needs them', () => {
    const buildCommand = (JSON.parse(read('railway.json')) as { build: { buildCommand: string } }).build.buildCommand;
    expect(buildCommand).toContain('npm install --include=dev');
    expect(buildCommand).toContain('npm run build:server');
  });

  it('the server build really does depend on dev-only packages (so this guard is still needed)', () => {
    const pkg = JSON.parse(read('server/package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.devDependencies['vitest']).toBeDefined();
    expect(pkg.devDependencies['@types/pg']).toBeDefined();
    expect(pkg.dependencies['vitest']).toBeUndefined();
    expect(JSON.parse(read('server/tsconfig.json')).compilerOptions.types).toContain('vitest/globals');
  });
});

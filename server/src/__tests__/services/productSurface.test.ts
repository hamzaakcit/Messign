import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getProductSurface,
  isModuleOnSurface,
  mountsFrozenModules,
} from '../../config/productSurface.js';

const FROZEN_MODULES = [
  'crm',
  'support',
  'finance',
  'hr',
  'marketing_automation',
  'knowledge-hub',
  'okr',
  'heart',
  'executive',
  'assets',
  'contracts',
];

describe('productSurface', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to workspace when unset or blank', () => {
    vi.stubEnv('PRODUCT_SURFACE', '');
    expect(getProductSurface()).toBe('workspace');
    vi.stubEnv('PRODUCT_SURFACE', '   ');
    expect(getProductSurface()).toBe('workspace');
  });

  it.each(['engage', 'workspace', 'all'])('accepts %s', (value) => {
    vi.stubEnv('PRODUCT_SURFACE', value);
    expect(getProductSurface()).toBe(value);
  });

  it.each(['engagee', 'ENGAGE', 'none'])('throws on invalid value %s', (value) => {
    vi.stubEnv('PRODUCT_SURFACE', value);
    expect(() => getProductSurface()).toThrow(/Invalid PRODUCT_SURFACE/);
  });

  it('mounts frozen modules everywhere except engage', () => {
    expect(mountsFrozenModules('engage')).toBe(false);
    expect(mountsFrozenModules('workspace')).toBe(true);
    expect(mountsFrozenModules('all')).toBe(true);
  });

  it.each(FROZEN_MODULES)('hides frozen module %s on engage only', (namespace) => {
    expect(isModuleOnSurface(namespace, 'engage')).toBe(false);
    expect(isModuleOnSurface(namespace, 'workspace')).toBe(true);
    expect(isModuleOnSurface(namespace, 'all')).toBe(true);
  });

  it.each(['marketing', 'creative'])('keeps %s on every surface', (namespace) => {
    expect(isModuleOnSurface(namespace, 'engage')).toBe(true);
    expect(isModuleOnSurface(namespace, 'workspace')).toBe(true);
  });

  it('has no HTTP seed route at all (WP-31: seeding is a terminal command)', () => {
    const root = join(__dirname, '..', '..');
    expect(existsSync(join(root, 'routes', 'seed.ts'))).toBe(false);
    const index = readFileSync(join(root, 'index.ts'), 'utf8');
    expect(index).not.toMatch(/api\/seed|seedRouter|routes\/seed/);
  });
});

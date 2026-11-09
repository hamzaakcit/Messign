import { describe, expect, it } from 'vitest';
import { getProductSurface, isNavItemOnSurface, isPathOnSurface, mountsFrozenModules } from '@/lib/productSurface';

describe('productSurface', () => {
  it('frozen Company-OS modules exist everywhere except engage (mirrors the server)', () => {
    expect(mountsFrozenModules('engage')).toBe(false);
    expect(mountsFrozenModules('workspace')).toBe(true);
    expect(mountsFrozenModules('all')).toBe(true);
  });

  it('defaults to workspace when unset or blank', () => {
    expect(getProductSurface('')).toBe('workspace');
    expect(getProductSurface('  ')).toBe('workspace');
  });

  it('reads known values and treats unknown values as engage', () => {
    expect(getProductSurface('workspace')).toBe('workspace');
    expect(getProductSurface('all')).toBe('all');
    expect(getProductSurface('engage')).toBe('engage');
    expect(getProductSurface('engagee')).toBe('engage');
  });

  it('hides frozen nav items on engage only', () => {
    expect(isNavItemOnSurface('finance', 'engage')).toBe(false);
    expect(isNavItemOnSurface('dashboard', 'engage')).toBe(false);
    expect(isNavItemOnSurface('marketing', 'engage')).toBe(true);
    expect(isNavItemOnSurface('settings', 'engage')).toBe(true);
    expect(isNavItemOnSurface('finance', 'workspace')).toBe(true);
    expect(isNavItemOnSurface('finance', 'all')).toBe(true);
  });

  it('matches whole path segments on engage', () => {
    expect(isPathOnSurface('/marketing/campaigns', 'engage')).toBe(true);
    expect(isPathOnSurface('/admin', 'engage')).toBe(true);
    expect(isPathOnSurface('/', 'engage')).toBe(false);
    expect(isPathOnSurface('/finance', 'engage')).toBe(false);
    expect(isPathOnSurface('/marketingfoo', 'engage')).toBe(false);
    expect(isPathOnSurface('/finance', 'workspace')).toBe(true);
  });

  it('shows the engage customer screens where engage is mounted, never on the Company-OS workspace (WP-19)', () => {
    expect(isNavItemOnSurface('customers', 'engage')).toBe(true);
    expect(isNavItemOnSurface('customers', 'all')).toBe(true);
    expect(isNavItemOnSurface('customers', 'workspace')).toBe(false);
    expect(isPathOnSurface('/customers', 'engage')).toBe(true);
    expect(isPathOnSurface('/customers/0b8e', 'engage')).toBe(true);
    expect(isPathOnSurface('/customers/0b8e', 'all')).toBe(true);
    expect(isPathOnSurface('/customers', 'workspace')).toBe(false);
    expect(isPathOnSurface('/customers/0b8e', 'workspace')).toBe(false);
    expect(isPathOnSurface('/customersfoo', 'workspace')).toBe(true);
  });
});

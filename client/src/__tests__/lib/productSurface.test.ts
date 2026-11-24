import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEffectiveSurface, getProductSurface, isNavItemOnSurface, isPathOnSurface, mountsFrozenModules, setSessionSurface, subscribeEffectiveSurface,
} from '@/lib/productSurface';

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

  it('engage has no screens of its own besides the Lucy page: customers, journeys, segments and templates are sections of it', () => {
    expect(isNavItemOnSurface('marketing', 'engage')).toBe(true);
    for (const id of ['customers', 'journeys', 'segments', 'templates']) {
      expect(isNavItemOnSurface(id, 'engage')).toBe(false);
      expect(isPathOnSurface(`/${id}`, 'engage')).toBe(false);
      expect(isPathOnSurface(`/${id}/0b8e`, 'engage')).toBe(false);
    }
    expect(isPathOnSurface('/marketing', 'all')).toBe(true);
  });
});

describe('session surface (ADR-017)', () => {
  afterEach(() => { setSessionSurface(null); vi.unstubAllEnvs(); });

  it('on a shared build a tenant session is narrowed to engage: no Company-OS pages, nav items or requests', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    expect(getEffectiveSurface()).toBe('all');
    expect(isPathOnSurface('/finance')).toBe(true);
    setSessionSurface('engage');
    expect(getEffectiveSurface()).toBe('engage');
    expect(mountsFrozenModules()).toBe(false);
    expect(isPathOnSurface('/finance')).toBe(false);
    expect(isPathOnSurface('/marketing')).toBe(true);
    expect(isNavItemOnSurface('finance')).toBe(false);
    expect(isNavItemOnSurface('marketing')).toBe(true);
    setSessionSurface(null);
    expect(getEffectiveSurface()).toBe('all');
    expect(isPathOnSurface('/finance')).toBe(true);
  });

  it('can only narrow to engage, and only on a shared build: a workspace or engage build is never changed', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'workspace');
    setSessionSurface('engage');
    expect(getEffectiveSurface()).toBe('workspace');
    expect(mountsFrozenModules()).toBe(true);
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'engage');
    setSessionSurface('engage');
    expect(getEffectiveSurface()).toBe('engage');
  });

  it('an explicit surface argument is used as given, whatever the session says', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    setSessionSurface('engage');
    expect(isPathOnSurface('/finance', 'workspace')).toBe(true);
    expect(mountsFrozenModules('all')).toBe(true);
  });

  it('tells subscribers when the surface changes, and not when it does not', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    const listener = vi.fn();
    const off = subscribeEffectiveSurface(listener);
    setSessionSurface('engage'); setSessionSurface('engage');
    expect(listener).toHaveBeenCalledTimes(1);
    setSessionSurface(null);
    expect(listener).toHaveBeenCalledTimes(2);
    off(); setSessionSurface('engage');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});


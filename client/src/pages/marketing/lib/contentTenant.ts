/**
 * Which content setup the studio is drafting for.
 * This does not switch the logged-in organization.
 */
import { useEffect, useState } from 'react';
import { TENANT_CONTENT_SETUPS, type TenantContentSetup } from './tenantContentSetup';

export type ContentTenantKey = TenantContentSetup['orgKey'];

const STORAGE_KEY = 'messign.contentTenant';
const EVENT = 'messign-content-tenant';

/** True for the three content-studio setups. */
export function isContentTenantKey(value: string | null): value is ContentTenantKey {
  return value === 'messign' || value === 'florist' || value === 'bookstore';
}

/** The setup chosen for this browser tab. Defaults to Messign. */
export function readContentTenant(): ContentTenantKey {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (isContentTenantKey(raw)) return raw;
  } catch {
    /* Storage can be blocked. Messign stays the default. */
  }
  return 'messign';
}

/** Remember the setup and tell open panels to refresh. */
export function writeContentTenant(key: ContentTenantKey): void {
  sessionStorage.setItem(STORAGE_KEY, key);
  window.dispatchEvent(new Event(EVENT));
}

/** The checklist row for a key. */
export function contentSetupFor(key: ContentTenantKey): TenantContentSetup {
  return TENANT_CONTENT_SETUPS.find((setup) => setup.orgKey === key) ?? TENANT_CONTENT_SETUPS[0];
}

/** Shared tenant choice for the modal, the brand panel, and publish. */
export function useContentTenant(): {
  setup: TenantContentSetup;
  setTenant: (key: ContentTenantKey) => void;
} {
  const [key, setKey] = useState<ContentTenantKey>(() => readContentTenant());
  useEffect(() => {
    const sync = (): void => setKey(readContentTenant());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return {
    setup: contentSetupFor(key),
    setTenant: (next) => {
      writeContentTenant(next);
      setKey(next);
    },
  };
}

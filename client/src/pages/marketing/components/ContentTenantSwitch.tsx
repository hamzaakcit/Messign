import { useId } from 'react';
import { TENANT_CONTENT_SETUPS } from '../lib/tenantContentSetup';
import { useContentTenant, type ContentTenantKey } from '../lib/contentTenant';

/**
 * Picks the shop (Messign, Lilyana or Kitapyurdu) whose offers this page shows and makes.
 */
export function ContentTenantSwitch(): JSX.Element {
  const selectId = useId();
  const { setup, setTenant } = useContentTenant();
  return (
    <label className="block text-xs" htmlFor={selectId}>
      <span className="mb-1 block font-medium text-app-muted">Shop</span>
      <select
        id={selectId}
        value={setup.orgKey}
        onChange={(e) => setTenant(e.target.value as ContentTenantKey)}
        className="input-theme h-[42px] w-full rounded-lg px-3 text-sm"
      >
        {TENANT_CONTENT_SETUPS.map((row) => (
          <option key={row.orgKey} value={row.orgKey}>
            {row.brandName}
          </option>
        ))}
      </select>
    </label>
  );
}

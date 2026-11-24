import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TENANT_CONTENT_SETUPS } from '../lib/tenantContentSetup';
import { useContentTenant } from '../lib/contentTenant';
import { ContentTenantSwitch } from './ContentTenantSwitch';

/**
 * Checklist for Messign and the synthetic florist.
 * Publish stays off. This does not create a second onboarding flow.
 */
export function TenantContentSetupPanel(): JSX.Element {
  const { setup: active } = useContentTenant();
  return (
    <section className="mb-6 space-y-3">
      <h3 className="flex items-center gap-1 text-sm font-semibold text-app-text">
        Content setup <InfoTooltip helpId="shopContentSetup" />
      </h3>
      <ContentTenantSwitch />
      {TENANT_CONTENT_SETUPS.map((setup) => (
        <article
          key={setup.orgKey}
          data-active={setup.orgKey === active.orgKey ? 'true' : 'false'}
          className="rounded-xl border border-app-border bg-app-card p-3 text-sm"
        >
          <p className="font-medium text-app-text">{setup.brandName}</p>
          <dl className="mt-2 space-y-1 text-xs text-app-muted">
            <div>Language: {setup.language === 'tr' ? 'Turkish' : 'English'}</div>
            <div>Instagram: @{setup.instagramHandle}</div>
            <div>Publish allowed: {setup.publishAllowed ? 'yes' : 'no'}</div>
            <div>Recipes: {setup.recipes.join(', ')}</div>
          </dl>
          <ul className="mt-2 space-y-1 text-xs text-app-text">
            {setup.productTruth.map((row) => (
              <li key={row.name}>
                {row.name}
                <span className="text-app-muted"> — {row.description}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

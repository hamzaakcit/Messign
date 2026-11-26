import { CodeStage } from './compositions';
import { PageHeader, SiteContainer, useSiteTitle } from './ui';

/** Documents the ingestion API, the OpenAPI file, and the integrations that exist. */
export function DevelopersPage(): JSX.Element {
  useSiteTitle('Messign developers');

  return (
    <SiteContainer>
      <PageHeader
        kicker="Developers"
        title="API-first where an API exists."
        lede="Tenant API keys call the Engage ingestion API. The website SDK is a separate, small loader. There is no public SMS submission API, and there is no public documentation website beyond this page."
      />
      <div className="grid gap-12 pb-8 lg:grid-cols-2">
        <div id="api">
          <h2 className="text-[1.5rem] font-medium tracking-[-0.03em]">API</h2>
          <ul className="mt-4 space-y-3 text-[15px] leading-6 text-[#3d4d63]">
            <li>POST /api/engage/v1/profiles:upsert — create or update a profile by the tenant’s own customer id. A grant of consent needs evidence.</li>
            <li>POST /api/engage/v1/events:track — up to 500 events. A repeated client event id is a duplicate and stores nothing new.</li>
            <li>POST /api/engage/v1/journeys/:key/trigger — enroll a profile in the active version. The idempotency key is per journey.</li>
          </ul>
          <p className="mt-4 text-[14px] leading-6 text-[#5c6b80]">
            Authentication is the header x-api-key. A body field that names an organization is rejected. The key’s tenant is the only tenant.
          </p>
        </div>
        <CodeStage />
      </div>
      <article id="docs" className="border-t border-[#101828]/10 py-10">
        <h2 className="text-[1.5rem] font-medium tracking-[-0.03em]">Documentation</h2>
        <p className="mt-4 max-w-[42rem] text-[16px] leading-7 text-[#3d4d63]">
          A public docs site is not published. API key holders can read the ingestion contract at GET /api/engage/v1/openapi.json. The website loader is built to be served from /sdk/v1/loader.js on this same host. That path is outside the site rewrite. The file is part of the client build; a deployment has to include it before the public URL returns JavaScript.
        </p>
        <p className="mt-4 max-w-[42rem] text-[15px] leading-7 text-[#3d4d63]">
          The loader resolves one installation. It does not record visitors, send events, ask for notification permission, or register a service worker. Visitor creation is a separate command, and it stays off unless the server flag is on.
        </p>
      </article>
      <article id="integrations" className="border-t border-[#101828]/10 py-10 pb-20">
        <h2 className="text-[1.5rem] font-medium tracking-[-0.03em]">Integrations</h2>
        <ul className="mt-4 max-w-[42rem] space-y-3 text-[15px] leading-7 text-[#3d4d63]">
          <li>Email sends through the tenant’s own email account. The adapter in the product speaks to Amazon SES. Delivery events arrive on a signed webhook.</li>
          <li>WhatsApp uses the tenant’s Meta WhatsApp Business account. Inbound webhooks are verified. Some live template checks are still open.</li>
          <li>CSV import can load profiles, consent evidence and orders for a tenant admin.</li>
          <li>An İYS client has been run against a mock register. It is not a live connection you switch on from this website.</li>
          <li>A live SMS provider is not connected, and there is no public SMS API.</li>
        </ul>
      </article>
    </SiteContainer>
  );
}

import { Link } from 'react-router-dom';
import { PageHeader, SiteContainer, StatusMark, useSiteTitle } from './ui';

const BLOCKS = [
  {
    id: 'email',
    title: 'Email marketing',
    status: 'in-product' as const,
    body: 'Marketing email is rendered from a template, checked for a one-click unsubscribe link, and sent through the tenant’s own email account. A campaign sends one template to a consenting segment. Bounces and complaints can suppress the address.',
  },
  {
    id: 'sms',
    title: 'SMS campaigns',
    status: 'not-built' as const,
    body: 'There is no live SMS campaign in Engage. The product does not offer a send button for text messages. Wholesale SMS is a different line, and it is not a substitute for this screen.',
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp Business',
    status: 'partial' as const,
    body: 'Templates, journeys and campaigns are in the workspace. Sending uses the tenant’s own WhatsApp Business account. A marketing template is not sent as a transactional one. Some live checks, including the template-approval webhook and header or link-button sends, are still open.',
  },
  {
    id: 'website',
    title: 'Website engagement',
    status: 'partial' as const,
    body: 'Installations, a loader, and an explicit visitor command exist. Issuance stays off unless the server flag is on. Website events, a preference center, push notifications and pop-ups are not built. Email unsubscribe is a separate, already-shipping page.',
  },
  {
    id: 'journeys',
    title: 'Customer journeys',
    status: 'in-product' as const,
    body: 'Triggers are an event, an API call, or a date attribute. Steps can delay, wait, branch, hold out part of the audience, and send email or WhatsApp. A version must be approved before it can run. Repeating a trigger does not duplicate the step.',
  },
  {
    id: 'audience',
    title: 'Audience and analytics',
    status: 'in-product' as const,
    body: 'Profiles keep one active email and one active phone, with older values as history. Segments use attributes and order history. Journey results compare treatment and holdout for delivery and conversion. Those figures appear only inside a signed-in tenant. They are not printed here.',
  },
];

/** Engage product page. Each block matches a navigation item and its real status. */
export function EngagePage(): JSX.Element {
  useSiteTitle('Messign Engage');

  return (
    <SiteContainer>
      <PageHeader
        kicker="Messign Engage"
        title="The customer engagement workspace."
        lede="A brand keeps its customers, its consent and its sender identity here. Email runs through the send gate. WhatsApp runs on the tenant’s own account. SMS, push and pop-ups do not."
      />
      <div className="pb-20">
        {BLOCKS.map((block) => (
          <article key={block.id} id={block.id} className="grid gap-4 border-t border-[#101828]/10 py-10 lg:grid-cols-[16rem_1fr_auto] lg:gap-10">
            <h2 className="text-[1.7rem] font-medium tracking-[-0.03em]">{block.title}</h2>
            <p className="max-w-[40rem] text-[16px] leading-7 text-[#3d4d63]">{block.body}</p>
            <StatusMark status={block.status} />
          </article>
        ))}
        <p className="border-t border-[#101828]/10 pt-8 text-[14px] leading-6 text-[#5c6b80]">
          Also in the workspace for a tenant admin: quiet hours, budget caps, a send switch that stays off until readiness checks pass, an email-domain lookup for SPF, DKIM and DMARC, and an İYS client that has been exercised against a mock register. None of that is a compliance certificate.
        </p>
        <Link to="/developers" className="mt-6 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
          See the API
        </Link>
      </div>
    </SiteContainer>
  );
}

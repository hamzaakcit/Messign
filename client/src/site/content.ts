/**
 * Public-site navigation and the status words used on every page.
 * Status values describe the workspace as it exists. They are not a roadmap slogan.
 */

export type SiteStatus = 'in-product' | 'partial' | 'not-built' | 'partnership';

export interface SiteLink {
  label: string;
  href: string;
  detail: string;
  status: SiteStatus;
}

export interface SiteMenuGroup {
  title: string;
  links: SiteLink[];
}

export interface SiteMenu {
  id: 'products' | 'solutions' | 'developers' | 'company';
  label: string;
  groups: SiteMenuGroup[];
  note: string;
}

export const STATUS_LABEL: Record<SiteStatus, string> = {
  'in-product': 'In the workspace',
  partial: 'Partly available',
  'not-built': 'Not built',
  partnership: 'By partnership',
};

export const SITE_MENUS: SiteMenu[] = [
  {
    id: 'products',
    label: 'Products',
    note: 'Engage is the workspace for a brand. Messaging infrastructure is a separate commercial line. Messign does not send in its own name.',
    groups: [
      {
        title: 'Messign Engage',
        links: [
          { label: 'Engage overview', href: '/engage', detail: 'Customers, journeys, campaigns, segments and templates.', status: 'in-product' },
          { label: 'Email marketing', href: '/engage#email', detail: 'Templates, one-off campaigns and one-click unsubscribe.', status: 'in-product' },
          { label: 'SMS campaigns', href: '/engage#sms', detail: 'Live SMS sending is not in the product.', status: 'not-built' },
          { label: 'WhatsApp Business', href: '/engage#whatsapp', detail: 'Templates, journeys and campaigns on the tenant’s own account.', status: 'partial' },
          { label: 'Website push notifications', href: '/engage#website', detail: 'Push is not in the product.', status: 'not-built' },
          { label: 'Pop-ups', href: '/engage#website', detail: 'Pop-ups are not in the product.', status: 'not-built' },
          { label: 'Customer journeys', href: '/engage#journeys', detail: 'Event, API and date triggers, with approval before activation.', status: 'in-product' },
          { label: 'Audience and analytics', href: '/engage#audience', detail: 'Profiles, segments and journey results against a holdout.', status: 'in-product' },
        ],
      },
      {
        title: 'Messaging infrastructure',
        links: [
          { label: 'Infrastructure overview', href: '/infrastructure', detail: 'Wholesale A2P SMS and enterprise connectivity.', status: 'partnership' },
          { label: 'A2P wholesale SMS', href: '/infrastructure#wholesale', detail: 'Commercial terms are agreed per partnership.', status: 'partnership' },
          { label: 'Global SMS connectivity', href: '/infrastructure#connectivity', detail: 'No country list is published on this site.', status: 'partnership' },
          { label: 'SMS API', href: '/infrastructure#api', detail: 'A public SMS submission API is not published.', status: 'not-built' },
          { label: 'Routing and delivery', href: '/infrastructure#routing', detail: 'Routes are not listed, priced or guaranteed here.', status: 'partnership' },
        ],
      },
    ],
  },
  {
    id: 'solutions',
    label: 'Solutions',
    note: 'These pages describe who each line is for. They do not add a product that is marked “Not built”.',
    groups: [
      {
        title: 'Solutions',
        links: [
          { label: 'Customer engagement', href: '/solutions/engagement', detail: 'One workspace for the channels a brand can actually use today.', status: 'in-product' },
          { label: 'Marketing automation', href: '/solutions/automation', detail: 'Journeys that run after a person approves them.', status: 'in-product' },
          { label: 'Enterprise messaging', href: '/solutions/enterprise', detail: 'Tenant isolation, a send gate and per-tenant credentials.', status: 'in-product' },
          { label: 'Wholesale messaging', href: '/solutions/wholesale', detail: 'A partnership conversation, not a self-serve checkout.', status: 'partnership' },
        ],
      },
    ],
  },
  {
    id: 'developers',
    label: 'Developers',
    note: 'A public documentation website is not published. The developer page lists only endpoints that exist.',
    groups: [
      {
        title: 'Developers',
        links: [
          { label: 'API', href: '/developers#api', detail: 'Profile upsert, event tracking and API-triggered journeys.', status: 'in-product' },
          { label: 'Documentation', href: '/developers#docs', detail: 'The ingestion contract is available to API key holders.', status: 'partial' },
          { label: 'Integrations', href: '/developers#integrations', detail: 'Email, WhatsApp, CSV import and the website SDK.', status: 'partial' },
        ],
      },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    note: 'No office address, legal entity or customer list is published on this site.',
    groups: [
      {
        title: 'Company',
        links: [
          { label: 'About', href: '/company', detail: 'What Messign is, and what this site will not claim.', status: 'in-product' },
          { label: 'Contact', href: '/contact', detail: 'No public form is connected. Existing accounts use Login.', status: 'partial' },
        ],
      },
    ],
  },
];

export const SOLUTION_SLUGS = ['engagement', 'automation', 'enterprise', 'wholesale'] as const;

export type SolutionSlug = (typeof SOLUTION_SLUGS)[number];

export interface SolutionPageContent {
  slug: SolutionSlug;
  kicker: string;
  title: string;
  lede: string;
  sections: Array<{ heading: string; body: string }>;
  related: SiteLink[];
}

export const SOLUTIONS: Record<SolutionSlug, SolutionPageContent> = {
  engagement: {
    slug: 'engagement',
    kicker: 'Solutions',
    title: 'Customer engagement for the channels that are actually in the workspace.',
    lede: 'Messign Engage is the product a brand signs in to. Email is the channel that runs end to end. WhatsApp is in the workspace on the tenant’s own account. SMS campaigns, push and pop-ups are not.',
    sections: [
      {
        heading: 'Who it is for',
        body: 'A business that keeps its own customers, its own sender identity and its own consent. Messign is the software. The tenant is the sender.',
      },
      {
        heading: 'What you can do now',
        body: 'Keep a customer profile, build a segment, approve a journey, and send a marketing email to that segment. Every send still passes the send gate. A journey result can be read against a holdout group.',
      },
      {
        heading: 'What you should not expect',
        body: 'A live SMS campaign, a website pop-up, or a push notification. Those words are in the navigation so the status is visible. They are not available products.',
      },
    ],
    related: [
      { label: 'Messign Engage', href: '/engage', detail: 'The product page.', status: 'in-product' },
      { label: 'Developers', href: '/developers', detail: 'The ingestion API and the website SDK.', status: 'in-product' },
    ],
  },
  automation: {
    slug: 'automation',
    kicker: 'Solutions',
    title: 'Automation that waits for a person before it runs.',
    lede: 'Journeys are definitions with versions. An unapproved version cannot be activated. Nothing on this site is an autonomous agent that sends on its own.',
    sections: [
      {
        heading: 'What a journey can do',
        body: 'Start from an event, an API call or a date attribute. Wait, branch, hold out a share of the audience, and send an email. WhatsApp steps use the tenant’s own WhatsApp account. There is no SMS step.',
      },
      {
        heading: 'Copy drafts',
        body: 'An administrator can ask for a draft of a message step. The draft is screened and then waits. Approving it creates the next template version. It does not send the message.',
      },
      {
        heading: 'What is still a direction',
        body: 'A broader “intelligent engagement” layer, beyond these rules and this draft queue, is not a product you can turn on.',
      },
    ],
    related: [
      { label: 'Customer journeys', href: '/engage#journeys', detail: 'Triggers, approval and the send gate.', status: 'in-product' },
      { label: 'Audience and analytics', href: '/engage#audience', detail: 'Segments and holdout results.', status: 'in-product' },
    ],
  },
  enterprise: {
    slug: 'enterprise',
    kicker: 'Solutions',
    title: 'Controls that are built. Certifications that are not claimed.',
    lede: 'Engage data is isolated per tenant. Credentials belong to the tenant. Sending can be switched off. This page does not claim a certification, an audit report or a compliance status.',
    sections: [
      {
        heading: 'Isolation',
        body: 'Engage uses its own database role and row-level security. An API key acts as the tenant that owns the key. A body that tries to name a different organization is rejected.',
      },
      {
        heading: 'The send gate',
        body: 'Consent, suppression, quiet hours, budget caps, a sandbox recipient allowlist and a kill switch are enforced before a message is created. The customer trail keeps the gate decision.',
      },
      {
        heading: 'People',
        body: 'A tenant admin and a tenant member do not see the same controls. Members do not open sending settings or the website visitor list. Accounts are created by an administrator, not by the public site.',
      },
    ],
    related: [
      { label: 'About', href: '/company', detail: 'What Messign will and will not say in public.', status: 'in-product' },
      { label: 'Contact', href: '/contact', detail: 'How to reach a person, without a fake form.', status: 'partial' },
    ],
  },
  wholesale: {
    slug: 'wholesale',
    kicker: 'Solutions',
    title: 'Wholesale messaging is a partnership, not a button in the workspace.',
    lede: 'Messign’s second line is A2P SMS and messaging connectivity for providers and enterprises. This site does not publish coverage, operators, prices or a delivery promise.',
    sections: [
      {
        heading: 'How it differs from Engage',
        body: 'Engage is software a brand uses to reach its own customers. Wholesale is a commercial relationship about routes and delivery. The two lines share a company story. They do not share a send button.',
      },
      {
        heading: 'What is not on this website',
        body: 'There is no country map, no operator logo wall, no rate card and no public SMS submission API. Asking for those numbers is a conversation, and the conversation is not wired to a form here.',
      },
      {
        heading: 'What the product itself can send today',
        body: 'Inside Engage, live SMS is not available. Email can be sent through the tenant’s own email account. WhatsApp uses the tenant’s own WhatsApp Business account.',
      },
    ],
    related: [
      { label: 'Messaging infrastructure', href: '/infrastructure', detail: 'The wholesale page, with the same limits.', status: 'partnership' },
      { label: 'Contact', href: '/contact', detail: 'No sales inbox is published on this site.', status: 'partial' },
    ],
  },
};

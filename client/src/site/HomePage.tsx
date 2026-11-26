import { Link } from 'react-router-dom';
import { CodeStage, HeroStage, WorkspaceStage } from './compositions';
import type { SiteStatus } from './content';
import { Kicker, PrimaryLink, SecondaryLink, SiteContainer, StatusMark, useSiteTitle } from './ui';

const CHANNELS = [
  { name: 'Email', text: 'Templates, campaigns and a one-click unsubscribe.', status: 'in-product' as const, href: '/engage#email' },
  { name: 'SMS', text: 'Live SMS campaigns are not in Engage.', status: 'not-built' as const, href: '/engage#sms' },
  { name: 'WhatsApp', text: 'Templates, journeys and campaigns on the tenant’s account.', status: 'partial' as const, href: '/engage#whatsapp' },
  { name: 'Website', text: 'A visitor foundation. No push, pop-ups or event stream yet.', status: 'partial' as const, href: '/engage#website' },
];

/**
 * Public homepage. The signed-in product remains on its own routes.
 */
export function HomePage(): JSX.Element {
  useSiteTitle('Messign — Customer engagement and messaging');

  return (
    <div data-testid="site-home">
      <SiteContainer>
        <section className="pb-16 pt-12 sm:pt-16 lg:pb-24">
          <div className="ms-rise">
            <Kicker>Messign</Kicker>
            <h1 className="mt-5 text-[clamp(2.75rem,7.2vw,6.25rem)] font-medium leading-[0.94] tracking-[-0.048em] text-[#101828]">
              <span className="block">Every message.</span>
              <span className="block text-[#3d4d63]">Every channel.</span>
              <span className="block text-[#1a56db]">One connected<br />platform.</span>
            </h1>
          </div>
          <div className="mt-8 flex max-w-[40rem] flex-col gap-6 sm:mt-10">
            <p className="text-[17px] leading-7 text-[#3d4d63] sm:text-[18px] sm:leading-8">
              Power customer engagement and global business messaging through one connected platform.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryLink href="/engage">Explore Messign</PrimaryLink>
              <SecondaryLink href="/contact">Contact Sales</SecondaryLink>
            </div>
            <p className="max-w-[32rem] text-[13px] leading-5 text-[#5c6b80]">
              Get Started opens the existing notice that an administrator creates the account. It does not register a company.
            </p>
          </div>
          <div className="mt-12 sm:mt-16">
            <HeroStage />
          </div>
        </section>
      </SiteContainer>

      <section id="platform" className="border-t border-[#101828]/10">
        <SiteContainer className="py-20 lg:py-28">
          <div className="max-w-[36rem]">
            <Kicker>Two lines</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              A workspace for brands. A separate line for wholesale messaging.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <article className="rounded-[28px] border border-[#d5deea] bg-white p-7 sm:p-9 lg:col-span-7">
              <StatusMark status="in-product" />
              <h3 className="mt-5 text-[2rem] font-medium tracking-[-0.03em]">Messign Engage</h3>
              <p className="mt-4 max-w-[36rem] text-[16px] leading-7 text-[#3d4d63]">
                A customer engagement platform for brands and businesses. Profiles, segments, journeys, email campaigns and templates live in one workspace. WhatsApp is available on the tenant’s own account. The tenant is the sender.
              </p>
              <Link to="/engage" className="mt-6 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
                Explore Engage
              </Link>
            </article>
            <article className="rounded-[28px] bg-[#0c1733] p-7 text-white sm:p-9 lg:col-span-5">
              <StatusMark status="partnership" />
              <h3 className="mt-5 text-[2rem] font-medium tracking-[-0.03em]">Messaging infrastructure</h3>
              <p className="mt-4 text-[16px] leading-7 text-white/75">
                A2P wholesale SMS and global messaging connectivity for messaging providers and enterprises. Coverage, operators, prices and delivery figures are not published here.
              </p>
              <Link to="/infrastructure" className="mt-6 inline-flex text-[15px] font-medium text-white hover:underline">
                Read the wholesale line
              </Link>
            </article>
          </div>
        </SiteContainer>
      </section>

      <section id="channels" className="border-t border-[#101828]/10">
        <SiteContainer className="py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <Kicker>Omnichannel</Kicker>
              <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
                Four channels. One platform. Different stages of readiness.
              </h2>
            </div>
            <p className="text-[16px] leading-7 text-[#3d4d63]">
              Email, SMS, WhatsApp Business and the website are the engagement surfaces this company talks about. Only the ones marked in the workspace can be used today. The others stay in the menu so their status is not hidden.
            </p>
          </div>
          <ol className="mt-12 border-t border-[#101828]/10">
            {CHANNELS.map((channel, index) => (
              <li key={channel.name} className="border-b border-[#101828]/10">
                <Link to={channel.href} className="grid gap-3 py-6 sm:grid-cols-[4rem_10rem_1fr_auto] sm:items-center">
                  <span className="text-[13px] tabular-nums text-[#5c6b80]">0{index + 1}</span>
                  <span className="text-[1.35rem] font-medium tracking-[-0.03em]">{channel.name}</span>
                  <span className="text-[15px] text-[#3d4d63]">{channel.text}</span>
                  <StatusMark status={channel.status} />
                </Link>
              </li>
            ))}
          </ol>
        </SiteContainer>
      </section>

      <section id="workspace" className="border-t border-[#101828]/10 bg-[#e7edf5]">
        <SiteContainer className="py-20 lg:py-28">
          <div className="mb-10 max-w-[38rem]">
            <Kicker>Product experience</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              The workspace, without invented numbers.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#3d4d63]">
              Customers, journeys, campaigns, segments and templates are the Engage sections. The panel uses those names and describes what they do. It is not a dashboard of a real tenant.
            </p>
          </div>
          <WorkspaceStage />
        </SiteContainer>
      </section>

      <section id="website" className="border-t border-[#101828]/10">
        <SiteContainer className="grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Kicker>Website</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              A visitor foundation. Not a pop-up product.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#3d4d63]">
              The website SDK resolves an installation. A separate command can ask for an anonymous visitor. That command does not run from the loader, and creation stays off unless a server flag is on. Admins can list and revoke a visitor.
            </p>
          </div>
          <ul className="divide-y divide-[#101828]/10 border-y border-[#101828]/10">
            {([
              ['Visitor records', 'partial', 'Issued only when the server flag is on. Tokens are not shown in the admin list.'],
              ['Website events', 'not-built', 'The SDK does not record a page event stream.'],
              ['Consent preferences', 'not-built', 'Email unsubscribe exists. A website preference center does not.'],
              ['Push notifications', 'not-built', 'No permission prompt and no service worker.'],
              ['Pop-ups', 'not-built', 'No on-site campaign layer.'],
            ] as Array<[string, SiteStatus, string]>).map(([label, status, text]) => (
              <li key={label} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[16px] font-medium">{label}</p>
                  <p className="mt-1 max-w-[28rem] text-[14px] leading-6 text-[#3d4d63]">{text}</p>
                </div>
                <StatusMark status={status} />
              </li>
            ))}
          </ul>
        </SiteContainer>
      </section>

      <section id="wholesale" className="bg-[#0c1733] text-white">
        <SiteContainer className="py-20 lg:py-28">
          <Kicker>Messaging infrastructure</Kicker>
          <h2 className="mt-4 max-w-[18ch] text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.035em]">
            Wholesale SMS, stated without a coverage map.
          </h2>
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            {[
              ['01', 'A2P wholesale', 'International business messaging for providers and enterprises that buy routes, not a self-serve inbox.'],
              ['02', 'Connectivity', 'Destinations are part of a commercial agreement. This site does not list countries or operators.'],
              ['03', 'API', 'There is no public SMS submission endpoint. Engage’s API writes profiles, events and journey triggers.'],
              ['04', 'Routing and delivery', 'Routes, rates and delivery outcomes are not guaranteed, priced or counted on this page.'],
            ].map(([index, title, body]) => (
              <article key={title} className="border-t border-white/15 pt-5">
                <p className="text-[12px] tracking-[0.16em] text-white/45">{index}</p>
                <h3 className="mt-3 text-[1.5rem] font-medium tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-white/70">{body}</p>
              </article>
            ))}
          </div>
          <Link to="/infrastructure" className="mt-10 inline-flex text-[15px] font-medium text-white underline-offset-4 hover:underline">
            Open the infrastructure page
          </Link>
        </SiteContainer>
      </section>

      <section id="automation" className="border-t border-[#101828]/10">
        <SiteContainer className="grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Kicker>Automation</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              Journeys run after a person approves them.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#3d4d63]">
              A journey has a definition and versions. Activation requires approval. Steps can wait, branch, hold out part of the audience, and send email. WhatsApp steps use the tenant’s own account. SMS steps do not exist.
            </p>
          </div>
          <div className="border-t border-[#101828]/10 lg:border-l lg:border-t-0 lg:pl-12">
            <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#1a56db]">Direction, not a switch</p>
            <p className="mt-4 text-[16px] leading-7 text-[#3d4d63]">
              An administrator can request an AI draft for a message step. The draft waits for approval and then becomes a template version. It never sends. A wider intelligent-engagement product, beyond these rules and this queue, is not available.
            </p>
            <Link to="/solutions/automation" className="mt-6 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
              Marketing automation
            </Link>
          </div>
        </SiteContainer>
      </section>

      <section id="developers" className="border-t border-[#101828]/10 bg-[#e7edf5]">
        <SiteContainer className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Kicker>Developers</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              An ingestion API and a website loader. Both are real.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#3d4d63]">
              API keys are issued per tenant. The key is sent as <span className="font-medium text-[#101828]">x-api-key</span>. The machine-readable ingestion contract is <span className="font-medium text-[#101828]">GET /api/engage/v1/openapi.json</span>, and it requires that key. A public docs site is not published.
            </p>
            <Link to="/developers" className="mt-6 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
              Developer page
            </Link>
          </div>
          <CodeStage />
        </SiteContainer>
      </section>

      <section id="enterprise" className="border-t border-[#101828]/10">
        <SiteContainer className="py-20 lg:py-28">
          <div className="max-w-[38rem]">
            <Kicker>Enterprise</Kicker>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.1rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              The controls that exist. No certificate wall.
            </h2>
          </div>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              ['Isolation', 'Engage data is held per tenant, with row-level security and a dedicated database role.'],
              ['Credentials', 'Email, WhatsApp and any future SMS account belong to the tenant. There is no shared sending identity.'],
              ['The send gate', 'Consent, suppression, quiet hours, caps, a sandbox allowlist and a kill switch sit in front of every send.'],
            ].map(([title, body], index) => (
              <li key={title}>
                <p className="text-[12px] tracking-[0.16em] text-[#5c6b80]">0{index + 1}</p>
                <h3 className="mt-3 text-[1.35rem] font-medium tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-[#3d4d63]">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[40rem] text-[14px] leading-6 text-[#5c6b80]">
            Messign does not publish a certification or a compliance status on this site. Technical controls are not a legal claim.
          </p>
        </SiteContainer>
      </section>

      <section id="start" className="bg-[#0c1733] text-white">
        <SiteContainer className="flex flex-col gap-8 py-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[34rem]">
            <h2 className="text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.035em]">
              Start with the product that exists.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-white/70">
              Explore Engage, read the wholesale line, or sign in if you already have an account.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/engage" className="rounded-full bg-white px-5 py-3 text-[15px] font-medium text-[#0c1733]">
              Explore products
            </Link>
            <Link to="/contact" className="rounded-full border border-white/20 px-5 py-3 text-[15px] font-medium text-white">
              Contact Sales
            </Link>
            <Link to="/login" className="rounded-full px-5 py-3 text-[15px] font-medium text-white/80 hover:text-white">
              Login
            </Link>
          </div>
        </SiteContainer>
      </section>
    </div>
  );
}

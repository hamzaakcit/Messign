import { Link } from 'react-router-dom';
import { PageHeader, SiteContainer, StatusMark, useSiteTitle } from './ui';

const BLOCKS = [
  {
    id: 'wholesale',
    title: 'A2P wholesale SMS',
    status: 'partnership' as const,
    body: 'This line is for messaging providers and enterprises that buy application-to-person SMS. It is a commercial relationship. It is not a campaign button inside Engage, and it is not sold from this website.',
  },
  {
    id: 'connectivity',
    title: 'Global SMS connectivity',
    status: 'partnership' as const,
    body: 'International connectivity is discussed per destination and per partner. Messign does not publish a country list, an operator list, or a map. Absence of a number on this page is the point.',
  },
  {
    id: 'api',
    title: 'SMS API',
    status: 'not-built' as const,
    body: 'A public endpoint that submits an SMS is not published. The Engage ingestion API creates and updates profiles, records events, and can trigger a journey. Those are different requests, and they do not send a text message.',
  },
  {
    id: 'routing',
    title: 'Routing and delivery',
    status: 'partnership' as const,
    body: 'Routing, delivery reports and commercial terms belong in a partnership. This site states no route quality, no price and no delivery guarantee. Inside the product, live SMS delivery is not available.',
  },
];

/** Wholesale messaging page. It refuses coverage, price and delivery claims. */
export function InfrastructurePage(): JSX.Element {
  useSiteTitle('Messign messaging infrastructure');

  return (
    <div className="bg-[#0c1733] text-white">
      <SiteContainer>
        <PageHeader
          tone="ink"
          kicker="Messaging infrastructure"
          title="Wholesale business messaging, without a rate card."
          lede="A2P SMS and enterprise connectivity for providers and businesses that need routes. The page describes the line. It does not inventory it."
        />
        <div className="pb-20">
          {BLOCKS.map((block) => (
            <article key={block.id} id={block.id} className="grid gap-4 border-t border-white/15 py-10 lg:grid-cols-[16rem_1fr]">
              <div>
                <h2 className="text-[1.7rem] font-medium tracking-[-0.03em]">{block.title}</h2>
                <div className="mt-4">
                  <StatusMark status={block.status} />
                </div>
              </div>
              <p className="max-w-[40rem] text-[16px] leading-7 text-white/75">{block.body}</p>
            </article>
          ))}
          <Link to="/contact" className="mt-4 inline-flex text-[15px] font-medium text-white underline-offset-4 hover:underline">
            Contact Sales
          </Link>
        </div>
      </SiteContainer>
    </div>
  );
}

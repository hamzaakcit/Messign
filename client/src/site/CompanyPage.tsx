import { Link } from 'react-router-dom';
import { PageHeader, SiteContainer, useSiteTitle } from './ui';

/** About page. It avoids a legal identity, an address and a customer wall. */
export function CompanyPage(): JSX.Element {
  useSiteTitle('About Messign');

  return (
    <SiteContainer>
      <PageHeader
        kicker="Company"
        title="Two lines of work. One rule about who sends."
        lede="Messign builds Engage, a customer engagement workspace, and works with businesses on wholesale messaging infrastructure. The customer is the sender. Messign is the software and, for messaging, the processor of the tenant’s data."
      />
      <div className="max-w-[42rem] space-y-6 pb-20 text-[16px] leading-7 text-[#3d4d63]">
        <p>
          Engage is aimed at brands that already have customers and a reason to write to them: email that can actually be sent, journeys that wait for approval, and WhatsApp on the brand’s own account. The first shape of the product is built for commerce, including the consent and unsubscribe behavior a commercial email needs.
        </p>
        <p>
          The wholesale line comes from a long practice in application-to-person SMS. It is offered as a partnership. It is not a self-serve product, and this website is not a rate deck.
        </p>
        <p>
          This site does not publish a legal entity, a registered office, a customer list, a financing round or a certification. Those facts are either not ready to state or not ours to decorate.
        </p>
        <p>
          <Link to="/contact" className="font-medium text-[#1a56db] hover:underline">Contact</Link>
          {' '}explains how to talk to a person. {' '}
          <Link to="/login" className="font-medium text-[#1a56db] hover:underline">Login</Link>
          {' '}is for an account that already exists.
        </p>
      </div>
    </SiteContainer>
  );
}

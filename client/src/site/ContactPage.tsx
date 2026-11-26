import { Link } from 'react-router-dom';
import { PageHeader, SiteContainer, useSiteTitle } from './ui';

/**
 * Contact page. There is no public form and no published sales inbox.
 * The destinations that exist are login and the administrator-created account notice.
 */
export function ContactPage(): JSX.Element {
  useSiteTitle('Contact Messign');

  return (
    <SiteContainer>
      <PageHeader
        kicker="Contact"
        title="Contact sales, without a form that goes nowhere."
        lede="A public contact form is not connected, and this site does not publish a sales address. The two working doors are an existing account and the notice about how accounts are opened."
      />
      <div className="grid gap-4 pb-20 md:grid-cols-2">
        <article className="rounded-[28px] border border-[#d5deea] bg-white p-7">
          <h2 className="text-[1.4rem] font-medium tracking-[-0.03em]">You already have an account</h2>
          <p className="mt-3 text-[15px] leading-7 text-[#3d4d63]">
            Login is the workspace entrance. It is the same sign-in the product has always used.
          </p>
          <Link to="/login" className="mt-5 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
            Login
          </Link>
        </article>
        <article className="rounded-[28px] border border-[#d5deea] bg-white p-7">
          <h2 className="text-[1.4rem] font-medium tracking-[-0.03em]">You need an account</h2>
          <p className="mt-3 text-[15px] leading-7 text-[#3d4d63]">
            Accounts are created by an administrator. Get Started opens that notice. It does not collect a company or start a trial.
          </p>
          <Link to="/signup" className="mt-5 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
            Get Started
          </Link>
        </article>
      </div>
    </SiteContainer>
  );
}

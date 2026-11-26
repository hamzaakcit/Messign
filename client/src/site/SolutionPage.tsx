import { Link, useParams } from 'react-router-dom';
import { SOLUTIONS, SOLUTION_SLUGS, type SolutionSlug } from './content';
import { PageHeader, SiteContainer, useSiteTitle } from './ui';

function isSolutionSlug(value: string | undefined): value is SolutionSlug {
  return SOLUTION_SLUGS.some((slug) => slug === value);
}

/** One page per solution in the menu. An unknown slug stays on the public site. */
export function SolutionPage(): JSX.Element {
  const { slug } = useParams();
  const content = isSolutionSlug(slug) ? SOLUTIONS[slug] : null;
  useSiteTitle(content ? `${content.kicker} — Messign` : 'Not on this site');

  if (!content) {
    return (
      <SiteContainer>
        <PageHeader
          kicker="Solutions"
          title="This page is not on the site."
          lede="The solution pages are customer engagement, marketing automation, enterprise messaging and wholesale messaging."
        />
        <Link to="/" className="mb-20 inline-flex text-[15px] font-medium text-[#1a56db] hover:underline">
          Back to the homepage
        </Link>
      </SiteContainer>
    );
  }

  return (
    <SiteContainer>
      <PageHeader kicker={content.kicker} title={content.title} lede={content.lede} />
      <div className="space-y-10 pb-8">
        {content.sections.map((section) => (
          <article key={section.heading} className="max-w-[42rem] border-t border-[#101828]/10 pt-8">
            <h2 className="text-[1.5rem] font-medium tracking-[-0.03em]">{section.heading}</h2>
            <p className="mt-3 text-[16px] leading-7 text-[#3d4d63]">{section.body}</p>
          </article>
        ))}
      </div>
      <ul className="mb-20 flex flex-wrap gap-4 border-t border-[#101828]/10 pt-8">
        {content.related.map((link) => (
          <li key={link.href}>
            <Link to={link.href} className="text-[15px] font-medium text-[#1a56db] hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </SiteContainer>
  );
}

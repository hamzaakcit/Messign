import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PilotPlaneSVG } from '@/components/dora/pilot/PilotPlaneSVG';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, type SiteStatus } from './content';

export interface SiteMarkProps {
  size?: number;
}

/**
 * Company mark for the public site: Dora's paper plane, with the face left off.
 */
export function SiteMark({ size = 28 }: SiteMarkProps): JSX.Element {
  return (
    <span className="inline-flex shrink-0" aria-hidden>
      <PilotPlaneSVG size={size} showFace={false} />
    </span>
  );
}

/** Shared horizontal measure for the public site. */
export function SiteContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <div className={cn('mx-auto w-full max-w-[1120px] px-5 sm:px-8', className)}>{children}</div>;
}

/** Small label above a headline. */
export function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#1a56db]">{children}</p>
  );
}

/** Status word used in the menu and on product pages. */
export function StatusMark({ status }: { status: SiteStatus }): JSX.Element {
  const tone =
    status === 'in-product'
      ? 'text-[#0f6b4c] bg-[#e5f6ee]'
      : status === 'partial'
        ? 'text-[#1a56db] bg-[#e7efff]'
        : status === 'partnership'
          ? 'text-[#3d4d63] bg-[#e8edf3]'
          : 'text-[#7a4b12] bg-[#f8efd8]';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide', tone)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Page title block used on every page after the homepage. */
export function PageHeader({
  kicker,
  title,
  lede,
  tone = 'paper',
}: {
  kicker: string;
  title: string;
  lede: string;
  tone?: 'paper' | 'ink';
}): JSX.Element {
  const onInk = tone === 'ink';
  return (
    <header className="max-w-[40rem] pt-16 pb-12 sm:pt-20">
      <Kicker>{kicker}</Kicker>
      <h1 className={onInk
        ? 'mt-4 text-[clamp(2.1rem,4.4vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.035em] text-white'
        : 'mt-4 text-[clamp(2.1rem,4.4vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.035em] text-[#101828]'}>
        {title}
      </h1>
      <p className={onInk ? 'mt-5 text-[17px] leading-7 text-white/75' : 'mt-5 text-[17px] leading-7 text-[#3d4d63]'}>{lede}</p>
    </header>
  );
}

/** Filled action. */
export function PrimaryLink({ href, children }: { href: string; children: ReactNode }): JSX.Element {
  return (
    <Link
      to={href}
      className="inline-flex items-center gap-2 rounded-full bg-[#1a56db] px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#1648b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a56db]"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** Text action on the paper background. */
export function SecondaryLink({ href, children }: { href: string; children: ReactNode }): JSX.Element {
  return (
    <Link
      to={href}
      className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[15px] font-medium text-[#101828] transition-colors hover:bg-[#e7edf5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a56db]"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** Sets the document title while a public page is mounted. */
export function useSiteTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BentoCard } from '@/pages/marketing/components/bento/BentoCard';
import { ViewportWrapper } from '@/pages/marketing/components/bento/ViewportWrapper';
import { lucyTokens } from '@/pages/marketing/lib/lucyVisualTokens';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import {
  EngageGoToTiles, EngagePanels, EngageQuickActions, EngageSectionBody, EngageTabStrip, useEngageAccess, useEngageWorkspace,
} from './engageWorkspace';

/**
 * The engage page for tenants (`/marketing` on the engage surface): the Lucy layout with the engage sections as tabs
 * and the CMO column with the same "Go to" tiles and quick actions. Records and editors open in panels over the page.
 * Lucy's chat is not shown here: the AI assistant is frozen for tenants (ADR-009). Where the Company-OS Lucy page
 * exists (the `all` surface) the same parts are part of that page instead (ADR-016).
 */

/** Lucy's bento grid (same as the Lucy page): main column 3/5, CMO column 2/5 on large screens. */
const BENTO_GRID =
  'grid h-full min-h-0 w-full min-w-0 grid-cols-1 gap-2 p-2 md:gap-3 md:p-4 lg:grid-cols-5 lg:grid-rows-1 xl:gap-3';

export function EngageHub(): JSX.Element {
  const access = useEngageAccess('engage');
  const workspace = useEngageWorkspace('customers', access.isAdmin);

  return (
    <ViewportWrapper className={cn('min-h-0 flex-1 bg-gradient-to-b from-[#030712] via-[#050816] to-[#0a0c12]', marketingShell.borderSubtle)}>
      <div className={BENTO_GRID} data-testid="engage-hub">
        <div className="order-1 flex min-h-[min(48vh,420px)] min-w-0 flex-col lg:order-none lg:col-span-3 lg:row-start-1 lg:min-h-0">
          <BentoCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <EngageTabStrip workspace={workspace} />
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <EngageSectionBody workspace={workspace} />
            </div>
          </BentoCard>
        </div>

        <BentoCard className="order-2 overflow-hidden lg:order-none lg:col-span-2 lg:row-start-1">
          <div className="flex min-h-0 max-h-[min(92vh,920px)] flex-1 flex-col gap-3 overflow-y-auto">
            <div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: lucyTokens.colors.glow, background: 'rgba(124,58,237,0.12)', border: `1px solid ${lucyTokens.colors.border}` }}
              >
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                Engage
              </span>
              <h1 className="mt-1.5 text-sm font-semibold leading-tight tracking-tight text-app-text">Customer engagement</h1>
              <p className="mt-1 text-xs leading-snug text-app-muted">
                Customers, the journeys that reach them, the segments they belong to and the emails they receive.
              </p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-app-muted">Go to</p>
              <EngageGoToTiles workspace={workspace} />
            </div>

            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Quick actions</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <EngageQuickActions workspace={workspace} />
              </div>
            </div>

            <p className="border-t border-white/[0.06] pt-2 text-[10px] leading-snug text-app-muted">
              AI drafting for engage comes with the engage AI features. Every send still passes the send gate and the customer's consent.
            </p>
          </div>
        </BentoCard>
      </div>

      <EngagePanels workspace={workspace} />
    </ViewportWrapper>
  );
}

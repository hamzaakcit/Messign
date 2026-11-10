import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Filter, Mail, Sparkles, Users, Workflow } from 'lucide-react';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { BentoCard } from '@/pages/marketing/components/bento/BentoCard';
import { ViewportWrapper } from '@/pages/marketing/components/bento/ViewportWrapper';
import { lucyTokens } from '@/pages/marketing/lib/lucyVisualTokens';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import { CustomerDetailPage } from './CustomerDetailPage';
import { CustomersSection } from './CustomersPage';
import { JourneyEditPanel, JourneyPanel, JourneysSection } from './JourneysView';
import { NewSegmentPanel, SegmentPanel, SegmentsSection } from './SegmentsView';
import { NewTemplatePanel, TemplatePanel, TemplatesSection } from './TemplatesView';

/**
 * The engage side of the Lucy marketing page (`/marketing` on the engage surface). Same page, same layout as Lucy: the
 * main column holds the engage sections (customers, journeys, segments, templates), the right column is the CMO column
 * with the same "Go to" tiles and quick actions. Details and editors open in panels over the page, never in a separate
 * shell or page. Lucy's chat is not shown here: the AI assistant is frozen for engage tenants (ADR-009).
 */

type Section = 'customers' | 'journeys' | 'segments' | 'templates';
type Panel =
  | { kind: 'customer'; id: string }
  | { kind: 'journey'; id: string }
  | { kind: 'journey-new' }
  | { kind: 'journey-version'; id: string; from: number }
  | { kind: 'segment'; id: string }
  | { kind: 'segment-new' }
  | { kind: 'template'; id: string }
  | { kind: 'template-new' }
  | null;

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Users; tint: string }> = [
  { id: 'customers', label: 'Customers', icon: Users, tint: 'text-sky-400/90' },
  { id: 'journeys', label: 'Journeys', icon: Workflow, tint: 'text-amber-400/90' },
  { id: 'segments', label: 'Segments', icon: Filter, tint: 'text-violet-400/90' },
  { id: 'templates', label: 'Templates', icon: Mail, tint: 'text-emerald-400/90' },
];

const TITLES: Record<Exclude<Panel, null>['kind'], string> = {
  customer: 'Customer',
  journey: 'Journey',
  'journey-new': 'New journey',
  'journey-version': 'New journey version',
  segment: 'Segment',
  'segment-new': 'New segment',
  template: 'Email template',
  'template-new': 'New email template',
};
const PANEL_WIDTH: Record<Exclude<Panel, null>['kind'], number> = {
  customer: 900, journey: 900, 'journey-new': 960, 'journey-version': 960, segment: 900, 'segment-new': 900, template: 900, 'template-new': 800,
};

const TILE_BTN =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-slate-950/50 px-2 py-1.5 text-xs font-medium text-app-text shadow-sm ring-1 ring-violet-500/10 transition-all hover:brightness-110 sm:justify-start';
const PRIMARY_CREATE =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary-500/35 bg-gradient-to-b from-primary-950/50 to-slate-950/90 px-2 py-1.5 text-xs font-medium text-app-text ring-1 ring-primary-500/20 transition-all hover:brightness-110 sm:justify-start';
/** Lucy's bento grid (same as the Lucy page): main column 3/5, CMO column 2/5 on large screens. */
const BENTO_GRID =
  'grid h-full min-h-0 w-full min-w-0 grid-cols-1 gap-2 p-2 md:gap-3 md:p-4 lg:grid-cols-5 lg:grid-rows-1 xl:gap-3';

export function EngageHub(): JSX.Element {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [section, setSection] = useState<Section>('customers');
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);
  const refreshAll = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['engage', 'customers'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'journeys'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'segments'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'templates'] }),
  ]);

  const goTo = (s: Section) => { setSection(s); setPanel(null); };
  const newFor: Record<Section, Panel> = { customers: null, journeys: { kind: 'journey-new' }, segments: { kind: 'segment-new' }, templates: { kind: 'template-new' } };

  const renderPanel = (p: NonNullable<Panel>): JSX.Element => {
    switch (p.kind) {
      case 'customer': return <CustomerDetailPage id={p.id} />;
      case 'journey': return <JourneyPanel id={p.id} onNewVersion={(from) => setPanel({ kind: 'journey-version', id: p.id, from })} />;
      case 'journey-new': return <JourneyEditPanel onSaved={(id) => { void refreshAll(); setSection('journeys'); setPanel({ kind: 'journey', id }); }} />;
      case 'journey-version': return <JourneyEditPanel journeyId={p.id} from={p.from} onSaved={(id) => { void refreshAll(); setPanel({ kind: 'journey', id }); }} />;
      case 'segment': return <SegmentPanel id={p.id} />;
      case 'segment-new': return <NewSegmentPanel onSaved={(id) => { void refreshAll(); setSection('segments'); setPanel({ kind: 'segment', id }); }} />;
      case 'template': return <TemplatePanel id={p.id} />;
      case 'template-new': return <NewTemplatePanel onSaved={(id) => { void refreshAll(); setSection('templates'); setPanel({ kind: 'template', id }); }} />;
    }
  };

  return (
    <ViewportWrapper className={cn('min-h-0 flex-1 bg-gradient-to-b from-[#030712] via-[#050816] to-[#0a0c12]', marketingShell.borderSubtle)}>
      <div className={BENTO_GRID} data-testid="engage-hub">
        <div className="order-1 flex min-h-[min(48vh,420px)] min-w-0 flex-col lg:order-none lg:col-span-3 lg:row-start-1 lg:min-h-0">
          <BentoCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div role="tablist" aria-label="Engage sections" className="flex flex-wrap gap-1.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={section === s.id}
                  data-testid={`hub-tab-${s.id}`}
                  onClick={() => goTo(s.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    section === s.id ? 'border-violet-400/60 bg-violet-500/15 text-app' : 'border-white/[0.12] text-app-muted hover:text-app',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {section === 'customers' && <CustomersSection onOpen={(id) => setPanel({ kind: 'customer', id })} />}
              {section === 'journeys' && <JourneysSection onOpen={(id) => setPanel({ kind: 'journey', id })} onNew={() => setPanel({ kind: 'journey-new' })} />}
              {section === 'segments' && <SegmentsSection onOpen={(id) => setPanel({ kind: 'segment', id })} onNew={() => setPanel({ kind: 'segment-new' })} />}
              {section === 'templates' && <TemplatesSection onOpen={(id) => setPanel({ kind: 'template', id })} onNew={() => setPanel({ kind: 'template-new' })} />}
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
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {SECTIONS.map((s) => (
                  <button key={s.id} type="button" onClick={() => goTo(s.id)} className={TILE_BTN} data-testid={`hub-go-${s.id}`}>
                    <s.icon className={cn('h-3.5 w-3.5 shrink-0', s.tint)} />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Quick actions</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {isAdmin ? (
                  <>
                    <button type="button" onClick={() => setPanel(newFor.journeys)} className={PRIMARY_CREATE} data-testid="hub-new-journey">
                      <Workflow className="h-3.5 w-3.5 shrink-0 text-amber-400/90" /><span className="truncate">New journey</span>
                    </button>
                    <button type="button" onClick={() => setPanel(newFor.segments)} className={TILE_BTN} data-testid="hub-new-segment">
                      <Filter className="h-3.5 w-3.5 shrink-0 text-violet-400/90" /><span className="truncate">New segment</span>
                    </button>
                    <button type="button" onClick={() => setPanel(newFor.templates)} className={cn(TILE_BTN, 'col-span-2')} data-testid="hub-new-template">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" /><span className="truncate">New email template</span>
                    </button>
                  </>
                ) : (
                  <p className="col-span-2 text-xs text-app-muted">Only a tenant admin can create or change journeys, segments and templates.</p>
                )}
              </div>
            </div>

            <p className="border-t border-white/[0.06] pt-2 text-[10px] leading-snug text-app-muted">
              AI drafting for engage comes with the engage AI features. Every send still passes the send gate and the customer's consent.
            </p>
          </div>
        </BentoCard>
      </div>

      <SlideOverPanel
        isOpen={panel !== null}
        onClose={close}
        title={panel ? TITLES[panel.kind] : ''}
        width={panel ? PANEL_WIDTH[panel.kind] : 900}
      >
        {panel && <div data-testid="hub-panel">{renderPanel(panel)}</div>}
      </SlideOverPanel>
    </ViewportWrapper>
  );
}

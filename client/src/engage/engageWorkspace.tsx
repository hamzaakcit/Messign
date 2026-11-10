import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Mail, Send, Users, Workflow } from 'lucide-react';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { cn } from '@/lib/utils';
import { getProductSurface, type ProductSurface } from '@/lib/productSurface';
import { useAuthStore } from '@/stores/authStore';
import { engageMeQuery } from './engageMe';
import { CampaignPanel, CampaignsSection, NewCampaignPanel } from './CampaignsView';
import { CustomerDetailPage } from './CustomerDetailPage';
import { NewCustomerPanel } from './NewCustomerPanel';
import { CustomersSection } from './CustomersPage';
import { JourneyEditPanel, JourneyPanel, JourneysSection } from './JourneysView';
import { NewSegmentPanel, SegmentPanel, SegmentsSection } from './SegmentsView';
import { NewTemplatePanel, TemplatePanel, TemplatesSection } from './TemplatesView';

/**
 * The engage parts of the Lucy page (ADR-015, ADR-016): the four sections as tabs, the "Go to" tiles and quick actions,
 * and the panels that records and editors open in. Two hosts use them: the engage hub (engage surface, tenants) and the
 * Lucy page itself (all surface, where the Lucy chat is one more tab). The state lives in {@link useEngageWorkspace};
 * the host decides where each part goes.
 */

export type Section = 'customers' | 'journeys' | 'campaigns' | 'segments' | 'templates';
/** `lucy` is the Company-OS chat; only the Lucy page has it. */
export type Tab = 'lucy' | Section;
export type Panel =
  | { kind: 'customer'; id: string }
  | { kind: 'customer-new' }
  | { kind: 'journey'; id: string }
  | { kind: 'journey-new' }
  | { kind: 'journey-version'; id: string; from: number }
  | { kind: 'campaign'; id: string }
  | { kind: 'campaign-new' }
  | { kind: 'segment'; id: string }
  | { kind: 'segment-new' }
  | { kind: 'template'; id: string }
  | { kind: 'template-new' }
  | null;

export const SECTIONS: Array<{ id: Section; label: string; icon: typeof Users; tint: string }> = [
  { id: 'customers', label: 'Customers', icon: Users, tint: 'text-sky-400/90' },
  { id: 'journeys', label: 'Journeys', icon: Workflow, tint: 'text-amber-400/90' },
  { id: 'campaigns', label: 'Campaigns', icon: Send, tint: 'text-rose-400/90' },
  { id: 'segments', label: 'Segments', icon: Filter, tint: 'text-violet-400/90' },
  { id: 'templates', label: 'Templates', icon: Mail, tint: 'text-emerald-400/90' },
];

const TITLES: Record<Exclude<Panel, null>['kind'], string> = {
  customer: 'Customer',
  'customer-new': 'Add a customer',
  journey: 'Journey',
  'journey-new': 'New journey',
  'journey-version': 'New journey version',
  campaign: 'Campaign',
  'campaign-new': 'New campaign',
  segment: 'Segment',
  'segment-new': 'New segment',
  template: 'Email template',
  'template-new': 'New email template',
};
const PANEL_WIDTH: Record<Exclude<Panel, null>['kind'], number> = {
  customer: 900, 'customer-new': 760, journey: 900, 'journey-new': 960, 'journey-version': 960, campaign: 900, 'campaign-new': 860, segment: 900, 'segment-new': 900, template: 900, 'template-new': 800,
};

export const TILE_BTN =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-slate-950/50 px-2 py-1.5 text-xs font-medium text-app-text shadow-sm ring-1 ring-violet-500/10 transition-all hover:brightness-110 sm:justify-start';
export const PRIMARY_CREATE =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary-500/35 bg-gradient-to-b from-primary-950/50 to-slate-950/90 px-2 py-1.5 text-xs font-medium text-app-text ring-1 ring-primary-500/20 transition-all hover:brightness-110 sm:justify-start';

export interface EngageAccess {
  /** Whether the engage sections can be shown to this user on this page. */
  available: boolean;
  /** Whether this user may create and change journeys, segments and templates (tenant admin). */
  isAdmin: boolean;
  /**
   * `engage`: a tenant, who gets the engage page without the Company-OS Lucy chat and tools (ADR-009). `all`: the
   * platform organization, who gets both on one page (ADR-016). Unknown (`undefined`) when engage is not available.
   */
  product?: 'engage' | 'all';
  /** True while the answer is still on its way (only on the `all` surface). */
  loading: boolean;
}

/**
 * On the engage surface every user is a tenant user, so engage is always there. On the `all` surface the engage API
 * answers for the organizations that may use it (a tenant, or the platform organization once an operator enabled it,
 * ADR-016) and refuses the rest; a refusal means "no engage here" and the page stays as it was. On `workspace` the
 * engage API is not mounted at all, so nothing is asked.
 */
export function useEngageAccess(surface: ProductSurface = getProductSurface()): EngageAccess {
  const storeAdmin = useAuthStore((s) => s.isAdmin);
  const userId = useAuthStore((s) => s.user?.id);
  const probe = useQuery({ ...engageMeQuery(userId), enabled: surface === 'all' });
  if (surface === 'engage') return { available: true, isAdmin: Boolean(storeAdmin), product: 'engage', loading: false };
  if (surface === 'all' && probe.data) return { available: true, isAdmin: probe.data.role === 'admin', product: probe.data.product, loading: false };
  return { available: false, isAdmin: false, loading: surface === 'all' && probe.isLoading };
}

export interface EngageWorkspace {
  tab: Tab;
  panel: Panel;
  isAdmin: boolean;
  /** Shows a tab and closes any panel. */
  goTo: (tab: Tab) => void;
  /** Shows a tab and opens a panel over it (after a record was saved). */
  show: (tab: Tab, panel: Panel) => void;
  open: (panel: Panel) => void;
  close: () => void;
}

export function useEngageWorkspace(initial: Tab, isAdmin: boolean): EngageWorkspace {
  const [tab, setTab] = useState<Tab>(initial);
  const [panel, setPanel] = useState<Panel>(null);
  const goTo = useCallback((t: Tab) => { setTab(t); setPanel(null); }, []);
  const show = useCallback((t: Tab, p: Panel) => { setTab(t); setPanel(p); }, []);
  const close = useCallback(() => setPanel(null), []);
  return { tab, panel, isAdmin, goTo, show, open: setPanel, close };
}

/** The tab row. `withLucy` puts the Lucy chat first (the Lucy page); the engage hub has no chat. */
export function EngageTabStrip({ workspace, withLucy = false }: { workspace: EngageWorkspace; withLucy?: boolean }): JSX.Element {
  const tabs: Array<{ id: Tab; label: string }> = [...(withLucy ? [{ id: 'lucy' as const, label: 'Lucy' }] : []), ...SECTIONS];
  return (
    <div role="tablist" aria-label="Page sections" className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={workspace.tab === t.id}
          data-testid={`hub-tab-${t.id}`}
          onClick={() => workspace.goTo(t.id)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            workspace.tab === t.id ? 'border-violet-400/60 bg-violet-500/15 text-app' : 'border-white/[0.12] text-app-muted hover:text-app',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The section the workspace is on. Renders nothing while the Lucy chat tab is active. */
export function EngageSectionBody({ workspace }: { workspace: EngageWorkspace }): JSX.Element | null {
  const { tab, open } = workspace;
  if (tab === 'customers') return <CustomersSection onOpen={(id) => open({ kind: 'customer', id })} onNew={workspace.isAdmin ? () => open({ kind: 'customer-new' }) : undefined} />;
  if (tab === 'journeys') return <JourneysSection onOpen={(id) => open({ kind: 'journey', id })} onNew={() => open({ kind: 'journey-new' })} />;
  if (tab === 'campaigns') return <CampaignsSection onOpen={(id) => open({ kind: 'campaign', id })} onNew={() => open({ kind: 'campaign-new' })} />;
  if (tab === 'segments') return <SegmentsSection onOpen={(id) => open({ kind: 'segment', id })} onNew={() => open({ kind: 'segment-new' })} />;
  if (tab === 'templates') return <TemplatesSection onOpen={(id) => open({ kind: 'template', id })} onNew={() => open({ kind: 'template-new' })} />;
  return null;
}

/** The "Go to" tiles for the four sections. */
export function EngageGoToTiles({ workspace }: { workspace: EngageWorkspace }): JSX.Element {
  return (
    <div className="mt-1 grid grid-cols-2 gap-1.5">
      {SECTIONS.map((s) => (
        <button key={s.id} type="button" onClick={() => workspace.goTo(s.id)} className={TILE_BTN} data-testid={`hub-go-${s.id}`}>
          <s.icon className={cn('h-3.5 w-3.5 shrink-0', s.tint)} />
          <span className="truncate">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** New journey, segment and email template. Tenant admins only; a member is told why the buttons are missing. */
export function EngageQuickActions({ workspace }: { workspace: EngageWorkspace }): JSX.Element {
  if (!workspace.isAdmin) {
    return <p className="col-span-2 text-xs text-app-muted">Only a tenant admin can create or change journeys, segments and templates.</p>;
  }
  return (
    <>
      <button type="button" onClick={() => workspace.show('campaigns', { kind: 'campaign-new' })} className={cn(PRIMARY_CREATE, 'col-span-2')} data-testid="hub-new-campaign">
        <Send className="h-3.5 w-3.5 shrink-0 text-rose-300" /><span className="truncate">Send an email now</span>
      </button>
      <button type="button" onClick={() => workspace.show('journeys', { kind: 'journey-new' })} className={TILE_BTN} data-testid="hub-new-journey">
        <Workflow className="h-3.5 w-3.5 shrink-0 text-amber-400/90" /><span className="truncate">New journey</span>
      </button>
      <button type="button" onClick={() => workspace.show('segments', { kind: 'segment-new' })} className={TILE_BTN} data-testid="hub-new-segment">
        <Filter className="h-3.5 w-3.5 shrink-0 text-violet-400/90" /><span className="truncate">New segment</span>
      </button>
      <button type="button" onClick={() => workspace.show('templates', { kind: 'template-new' })} className={cn(TILE_BTN, 'col-span-2')} data-testid="hub-new-template">
        <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" /><span className="truncate">New email template</span>
      </button>
    </>
  );
}

/** The panel over the page for a record or an editor. */
export function EngagePanels({ workspace }: { workspace: EngageWorkspace }): JSX.Element {
  const qc = useQueryClient();
  const { panel, show, close } = workspace;
  const refreshAll = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['engage', 'customers'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'journeys'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'campaigns'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'segments'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'templates'] }),
  ]);

  const render = (p: NonNullable<Panel>): JSX.Element => {
    switch (p.kind) {
      case 'customer': return <CustomerDetailPage id={p.id} />;
      case 'customer-new': return <NewCustomerPanel onSaved={(id) => { void refreshAll(); show('customers', { kind: 'customer', id }); }} />;
      case 'journey': return <JourneyPanel id={p.id} onNewVersion={(from) => show('journeys', { kind: 'journey-version', id: p.id, from })} />;
      case 'journey-new': return <JourneyEditPanel onSaved={(id) => { void refreshAll(); show('journeys', { kind: 'journey', id }); }} />;
      case 'journey-version': return <JourneyEditPanel journeyId={p.id} from={p.from} onSaved={(id) => { void refreshAll(); show('journeys', { kind: 'journey', id }); }} />;
      case 'campaign': return <CampaignPanel id={p.id} isAdmin={workspace.isAdmin} />;
      case 'campaign-new': return <NewCampaignPanel onSent={(id) => { void refreshAll(); show('campaigns', { kind: 'campaign', id }); }} />;
      case 'segment': return <SegmentPanel id={p.id} />;
      case 'segment-new': return <NewSegmentPanel onSaved={(id) => { void refreshAll(); show('segments', { kind: 'segment', id }); }} />;
      case 'template': return <TemplatePanel id={p.id} />;
      case 'template-new': return <NewTemplatePanel onSaved={(id) => { void refreshAll(); show('templates', { kind: 'template', id }); }} />;
    }
  };

  return (
    <SlideOverPanel
      isOpen={panel !== null}
      onClose={close}
      title={panel ? TITLES[panel.kind] : ''}
      width={panel ? PANEL_WIDTH[panel.kind] : 900}
    >
      {panel && <div data-testid="hub-panel">{render(panel)}</div>}
    </SlideOverPanel>
  );
}

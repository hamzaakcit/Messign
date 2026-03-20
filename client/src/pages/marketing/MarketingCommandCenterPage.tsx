/**
 * Marketing Command Center — three-column "cockpit" shell (V2 UI).
 * URL state: ?campaignId= & ?contentId= drives Strategy Vault + Gatekeeper panels.
 */
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Sparkles } from 'lucide-react';
import { MarketingNav } from './components/MarketingNav';
import { cn } from '@/lib/utils';

export function MarketingCommandCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId') ?? '';
  const contentId = searchParams.get('contentId') ?? '';

  const setActiveContent = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('contentId', id);
          else next.delete('contentId');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const mockDrafts = useMemo(
    () => [
      { id: 'demo-1', title: 'Launch post — Q2 analytics', variant: 'A' as const },
      { id: 'demo-2', title: 'Customer story teaser', variant: 'B' as const },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#0b0d10] text-slate-100">
      <div className="shrink-0 border-b border-white/10 bg-[#0b0d10]/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#0b0d10]/75">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutGrid className="h-5 w-5 shrink-0 text-cyan-400/90" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-slate-100 truncate">Marketing Command Center</h1>
              <p className="text-xs text-slate-500 truncate">Single pane — strategy, creative, validation, queue</p>
            </div>
          </div>
          <Link
            to="/marketing/agent"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Full-screen agent
          </Link>
        </div>
      </div>

      <div className="shrink-0 border-b border-white/10 bg-[#0b0d10] px-2">
        <MarketingNav />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,360px)]">
        {/* Left — Strategy Vault */}
        <aside className="hidden min-h-0 flex-col border-r border-white/10 bg-[#0f1218] lg:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategy Vault</span>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
              aria-label="Collapse vault"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Campaign</label>
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#12151a] px-2 py-1.5 text-xs text-slate-200"
                value={campaignId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchParams((prev) => {
                    const n = new URLSearchParams(prev);
                    if (v) n.set('campaignId', v);
                    else n.delete('campaignId');
                    return n;
                  });
                }}
              >
                <option value="">All campaigns</option>
                <option value="demo-campaign">Demo campaign</option>
              </select>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#12151a] p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Product truth</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Shipped features surface here from the registry so drafts stay aligned with reality.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#12151a] p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Brand voice</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['Clear', 'Confident', 'Human'].map((t) => (
                  <span key={t} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Center — Creative Canvas */}
        <main className="flex min-h-0 min-w-0 flex-col border-x border-white/5 bg-[#12151a]">
          <div className="border-b border-white/10 px-4 py-2">
            <span className="text-xs font-medium text-slate-500">Creative Canvas</span>
            {contentId && (
              <span className="ml-2 font-mono text-[10px] text-cyan-400/80">
                active: {contentId.slice(0, 8)}…
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-4 rounded-xl border border-dashed border-white/15 bg-[#0f1218]/50 p-6 text-center text-sm text-slate-500">
              <p className="font-medium text-slate-400">Omni-chat (Dora)</p>
              <p className="mt-1 text-xs">Embed <code className="rounded bg-white/5 px-1">useDora</code> marketing stream here for full parity with the Agent page.</p>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft cards</div>
              {mockDrafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveContent(d.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                    contentId === d.id
                      ? 'border-cyan-500/40 bg-cyan-500/5'
                      : 'border-white/10 bg-[#0f1218] hover:border-white/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-200">{d.title}</span>
                    <span className="rounded border border-white/10 px-1.5 text-[10px] text-slate-400">Var {d.variant}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Inline edit + A/B toggle — wire to content API</p>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Right — Gatekeeper & Ops (xl+) */}
        <aside className="hidden min-h-0 flex-col border-l border-white/10 bg-[#0f1218] xl:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gatekeeper &amp; Ops</span>
            <ChevronRight className="h-4 w-4 text-slate-600" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {!contentId ? (
              <p className="text-xs text-slate-500">Select a draft card to load Truth / Brand / Compliance telemetry.</p>
            ) : (
              <>
                <div className="rounded-lg border border-white/10 bg-[#12151a] p-3">
                  <div className="text-[10px] font-medium uppercase text-slate-500">Validation</div>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
                    <li className="flex justify-between">
                      <span>Product truth</span>
                      <span className="text-emerald-400/90">—</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Brand voice</span>
                      <span className="text-emerald-400/90">—</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Compliance</span>
                      <span className="text-amber-400/90">—</span>
                    </li>
                  </ul>
                </div>
                <div className="sticky bottom-0 space-y-2 border-t border-white/10 bg-[#0f1218] pt-3">
                  <button
                    type="button"
                    className="w-full rounded-lg bg-cyan-600/90 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"
                  >
                    Approve &amp; queue
                  </button>
                  <div className="rounded-lg border border-white/10 bg-[#12151a] p-2 text-[11px] text-slate-500">
                    Budget impact: connect to finance / campaign spend API for this <code className="text-slate-400">campaignId</code>.
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile / tablet: show gatekeeper hint */}
      <div className="border-t border-white/10 bg-[#0f1218] p-2 text-center text-[11px] text-slate-500 xl:hidden">
        Gatekeeper panel: use wide screen or add a sheet trigger.
      </div>
    </div>
  );
}

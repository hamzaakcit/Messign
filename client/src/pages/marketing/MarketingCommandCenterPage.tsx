/**
 * Marketing Command Center — single-pane “cockpit” (V2).
 * URL state: ?campaignId= & ?contentId= sync Strategy Vault + Gatekeeper with the active draft card.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type Campaign } from '@/lib/marketingApi';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types/knowledge-hub/ai';

const MODULE_LINKS = [
  { label: 'Campaigns', to: '/marketing/campaigns' },
  { label: 'Agent (full)', to: '/marketing/agent' },
  { label: 'Approvals', to: '/marketing/approvals' },
  { label: 'Content', to: '/marketing/content' },
  { label: 'Leads', to: '/marketing/leads' },
  { label: 'Email', to: '/marketing/email' },
  { label: 'Dashboard', to: '/marketing/dashboard' },
] as const;

type DraftModel = {
  id: string;
  title: string;
  bodyA: string;
  bodyB: string;
};

const SEED_DRAFTS: DraftModel[] = [
  {
    id: 'demo-1',
    title: 'Launch post — Q2 analytics',
    bodyA: 'Shipped: Executive dashboard v2, CRM pipeline sync, and one-click ROI exports. See it live in your workspace.',
    bodyB: 'We just shipped analytics that finally connect pipeline to revenue. Here’s what changed — and why it matters for your Q2 review.',
  },
  {
    id: 'demo-2',
    title: 'Customer story teaser',
    bodyA: 'How [Customer] cut time-to-close by 34% using Messign — read the 3 workflows they standardized first.',
    bodyB: 'From chaos to clarity: one team’s playbook for aligning sales and marketing on a single pane of glass.',
  },
];

function hashScores(id: string): { truth: number; brand: number; compliance: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const u = (n: number) => 72 + Math.abs(n) % 25;
  return { truth: u(h), brand: u(h >> 8), compliance: u(h >> 16) };
}

export function MarketingCommandCenterPage() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role ?? 'member';
  const [searchParams, setSearchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId') ?? '';
  const contentId = searchParams.get('contentId') ?? '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [vaultOpen, setVaultOpen] = useState(true);
  const [gateOpen, setGateOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<'vault' | 'canvas' | 'gate'>('canvas');

  const [draftBodies, setDraftBodies] = useState<Record<string, { a: string; b: string; variant: 'A' | 'B' }>>(() => {
    const o: Record<string, { a: string; b: string; variant: 'A' | 'B' }> = {};
    for (const d of SEED_DRAFTS) {
      o[d.id] = { a: d.bodyA, b: d.bodyB, variant: 'A' };
    }
    return o;
  });
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(SEED_DRAFTS[0]?.id ?? null);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearChat,
    abortStream,
    submitFeedback,
    confirmPendingAction,
    cancelPendingAction,
  } = useDora({
    marketingAgentMode: true,
    initialMessages: [],
    initialInteractionMode: 'analyze',
  });

  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!user?.id) return;
    marketingAPI
      .listCampaigns(user.id)
      .then((r) => setCampaigns(r.data))
      .catch(() => setCampaigns([]));
  }, [user?.id]);

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

  useEffect(() => {
    if (contentId) return;
    const first = SEED_DRAFTS[0]?.id;
    if (first) setActiveContent(first);
  }, [contentId, setActiveContent]);

  const activeDraft = useMemo(
    () => SEED_DRAFTS.find((d) => d.id === contentId) ?? SEED_DRAFTS[0],
    [contentId],
  );

  const scores = useMemo(() => (contentId ? hashScores(contentId) : null), [contentId]);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  const budgetHint = useMemo(() => {
    if (!selectedCampaign) return 'Select a campaign to preview budget impact.';
    const pct =
      selectedCampaign.budget > 0
        ? ((selectedCampaign.actual_spend / selectedCampaign.budget) * 100).toFixed(1)
        : '—';
    const sym = selectedCampaign.currency || '€';
    return `${sym}${selectedCampaign.actual_spend.toLocaleString()} of ${sym}${selectedCampaign.budget.toLocaleString()} used (${pct}%). This asset accrues to the same campaign pool.`;
  }, [selectedCampaign]);

  const handleSend = useCallback(async () => {
    const q = inputValue.trim();
    if (!q || isLoading) return;
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await sendMessage(q);
  }, [inputValue, isLoading, sendMessage]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const setCampaign = (id: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id) n.set('campaignId', id);
        else n.delete('campaignId');
        return n;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#06080b] text-slate-100">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.08] bg-[#06080b]/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutGrid className="h-5 w-5 shrink-0 text-cyan-400/90" aria-hidden />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-100">Marketing Command Center</h1>
              <p className="truncate text-xs text-slate-500">Cockpit — strategy, creative, validation, queue (URL: ?campaignId &amp; ?contentId)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/marketing/agent"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Full-screen agent
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile pane switcher */}
      <div className="flex border-b border-white/[0.08] bg-[#0a0c10] lg:hidden">
        {(
          [
            ['vault', 'Strategy'],
            ['canvas', 'Canvas'],
            ['gate', 'Ops'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePane(id)}
            className={cn(
              'flex-1 py-2.5 text-center text-xs font-medium transition-colors',
              mobilePane === id ? 'bg-white/[0.06] text-cyan-300' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left — Strategy Vault */}
        <aside
          className={cn(
            'flex min-h-0 flex-col border-white/[0.08] bg-[#080a0e] lg:border-r',
            vaultOpen ? 'lg:w-[280px] lg:min-w-[280px] lg:max-w-[280px]' : 'lg:w-12 lg:min-w-12 lg:max-w-12',
            mobilePane === 'vault' ? 'flex' : 'hidden',
            'lg:flex',
          )}
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] px-2 py-2">
            {vaultOpen ? (
              <span className="pl-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Strategy Vault</span>
            ) : (
              <span className="sr-only">Strategy Vault</span>
            )}
            <button
              type="button"
              onClick={() => setVaultOpen((v) => !v)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
              title={vaultOpen ? 'Collapse vault' : 'Expand vault'}
            >
              {vaultOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto', vaultOpen ? 'p-3' : 'flex flex-col items-center py-2')}>
            {vaultOpen ? (
              <>
                <div className="mb-4">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Campaign</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#0c0f14] px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                    value={campaignId}
                    onChange={(e) => setCampaign(e.target.value)}
                  >
                    <option value="">All campaigns</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4 rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Product truth</div>
                  <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-400">
                    <li className="flex gap-2">
                      <span className="text-emerald-400/90">●</span>
                      <span>Executive dashboard — shipped</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400/90">●</span>
                      <span>CRM ↔ marketing lead sync — shipped</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-400/80">○</span>
                      <span>Publisher auto-post — beta</span>
                    </li>
                  </ul>
                </div>
                <div className="mb-4 rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Brand voice</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['Clear', 'Confident', 'Human', 'Evidence-led'].map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-cyan-500/25 bg-cyan-500/[0.07] px-2 py-0.5 text-[10px] text-cyan-200/90"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-cyan-600/80 to-cyan-400/60" />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Tone match · live (mock)</p>
                </div>
                <div className="border-t border-white/[0.06] pt-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Workspace</div>
                  <ul className="mt-2 space-y-1">
                    {MODULE_LINKS.map((l) => (
                      <li key={l.to}>
                        <Link
                          to={l.to}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300/90"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <ChevronRight className="mt-4 h-4 w-4 text-slate-600" aria-hidden />
            )}
          </div>
        </aside>

        {/* Center — Creative Canvas */}
        <main
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col border-white/[0.05] bg-[#0a0c10] lg:border-x',
            mobilePane === 'canvas' ? 'flex' : 'hidden',
            'lg:flex',
          )}
        >
          <div className="shrink-0 border-b border-white/[0.08] px-4 py-2">
            <span className="text-xs font-medium text-slate-500">Creative Canvas</span>
            {contentId && (
              <span className="ml-2 font-mono text-[10px] text-cyan-400/80">active · {contentId}</span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {/* Omni-chat */}
            <div className="flex min-h-[42%] flex-1 flex-col border-b border-white/[0.08]">
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {messages.length === 0 && !isLoading && (
                  <div className="mx-auto max-w-md py-8 text-center">
                    <div className="mb-3 flex justify-center">
                      <DoraChatAvatar size={48} />
                    </div>
                    <p className="text-sm text-slate-400">
                      Omni-chat (Dora) — plan, draft, and iterate without leaving the cockpit. Ask for copy, variants, or validation
                      context.
                    </p>
                  </div>
                )}
                {messages.map((m: AIMessage, i: number) => (
                  <AIMessageBubble
                    key={m.id}
                    message={m}
                    priorUserMessage={i > 0 ? messages[i - 1] : undefined}
                    userRole={userRole}
                    currentPath={location.pathname}
                    onFeedback={m.role === 'assistant' ? submitFeedback : undefined}
                    onSendMessage={(text) => void sendMessage(text)}
                    onConfirmAct={() => {}}
                    onCancelAct={() => {}}
                    onConfirmPendingAction={confirmPendingAction}
                    onCancelPendingAction={cancelPendingAction}
                  />
                ))}
                {!messages.some((m) => m.role === 'assistant' && m.isStreaming && !m.content) && (
                  <AITypingIndicator isLoading={isLoading} isStreaming={isStreaming} />
                )}
                {error && (
                  <p className="px-2 text-sm text-red-400" role="alert">
                    {error}
                  </p>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex shrink-0 items-end gap-2 border-t border-white/[0.08] bg-[#080a0e]/80 px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    const t = e.target;
                    t.style.height = 'auto';
                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Message Marketing AI…"
                  disabled={isLoading}
                  rows={1}
                  className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-lg border border-white/[0.08] bg-[#0c0f14] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abortStream}
                    className="shrink-0 rounded-lg bg-red-600/90 px-3 py-2.5 text-sm text-white hover:bg-red-500"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!inputValue.trim() || isLoading}
                    className="shrink-0 rounded-lg bg-cyan-600/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send'}
                  </button>
                )}
              </div>
            </div>

            {/* Draft cards */}
            <div className="flex max-h-[min(48vh,420px)] min-h-[180px] flex-col bg-[#080a0e]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Interactive drafts</span>
                <button
                  type="button"
                  onClick={() => clearChat()}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Clear chat
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {SEED_DRAFTS.map((d) => {
                  const st = draftBodies[d.id] ?? { a: d.bodyA, b: d.bodyB, variant: 'A' as const };
                  const expanded = expandedDraftId === d.id;
                  const isActive = contentId === d.id;
                  const body = st.variant === 'A' ? st.a : st.b;
                  return (
                    <div
                      key={d.id}
                      className={cn(
                        'rounded-lg border transition-colors',
                        isActive ? 'border-cyan-500/35 bg-cyan-500/[0.06]' : 'border-white/[0.08] bg-[#0c0f14]',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveContent(d.id);
                          setExpandedDraftId((cur) => (cur === d.id ? null : d.id));
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                      >
                        <span className="text-sm font-medium text-slate-200">{d.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded border border-white/[0.1] px-1.5 text-[10px] text-slate-400">Var {st.variant}</span>
                          {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[10px] uppercase text-slate-500">Variant</span>
                            <div className="inline-flex rounded-lg border border-white/[0.08] p-0.5">
                              {(['A', 'B'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    setDraftBodies((prev) => ({
                                      ...prev,
                                      [d.id]: { ...st, variant: v },
                                    }))
                                  }
                                  className={cn(
                                    'rounded px-2 py-0.5 text-[10px] font-medium',
                                    st.variant === v ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-500 hover:text-slate-300',
                                  )}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            value={body}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraftBodies((prev) => ({
                                ...prev,
                                [d.id]: {
                                  ...st,
                                  a: st.variant === 'A' ? val : st.a,
                                  b: st.variant === 'B' ? val : st.b,
                                },
                              }));
                            }}
                            rows={5}
                            className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#06080b] px-2 py-2 text-xs leading-relaxed text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                          />
                          <p className="mt-1 text-[10px] text-slate-500">Inline edit · selection syncs to Gatekeeper via URL contentId</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        {/* Right — Gatekeeper */}
        <aside
          className={cn(
            'flex min-h-0 flex-col border-white/[0.08] bg-[#080a0e] lg:border-l',
            gateOpen ? 'lg:w-[340px] lg:min-w-[340px] lg:max-w-[340px]' : 'lg:w-12 lg:min-w-12 lg:max-w-12',
            mobilePane === 'gate' ? 'flex' : 'hidden',
            'lg:flex',
          )}
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] px-2 py-2">
            {gateOpen ? (
              <span className="pl-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Gatekeeper &amp; Ops</span>
            ) : (
              <span className="sr-only">Gatekeeper</span>
            )}
            <button
              type="button"
              onClick={() => setGateOpen((g) => !g)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
              title={gateOpen ? 'Collapse panel' : 'Expand panel'}
            >
              {gateOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto', gateOpen ? 'p-3' : 'flex items-start justify-center py-4')}>
            {gateOpen ? (
              !contentId ? (
                <p className="text-xs text-slate-500">Select a draft card to load validation telemetry.</p>
              ) : (
                <>
                  <div className="rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3">
                    <div className="text-[10px] font-medium uppercase text-slate-500">Live validation (mock)</div>
                    <p className="mt-1 text-[10px] text-slate-500">Groq gatekeepers — Truth · Brand · Compliance</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-400">
                      <li className="flex items-center justify-between gap-2">
                        <span>Product truth</span>
                        <span className="font-mono text-emerald-400/90">{scores?.truth ?? '—'}%</span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span>Brand voice</span>
                        <span className="font-mono text-emerald-400/90">{scores?.brand ?? '—'}%</span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span>Compliance</span>
                        <span className="font-mono text-amber-300/90">{scores?.compliance ?? '—'}%</span>
                      </li>
                    </ul>
                  </div>
                  <div className="sticky bottom-0 mt-4 space-y-2 border-t border-white/[0.06] bg-[#080a0e] pt-3">
                    <button
                      type="button"
                      className="w-full rounded-lg bg-cyan-600/90 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"
                    >
                      Approve &amp; queue
                    </button>
                    <div className="rounded-lg border border-white/[0.08] bg-[#0c0f14] p-3 text-[11px] leading-snug text-slate-500">
                      <div className="text-[10px] font-medium uppercase text-slate-500">Finance preview</div>
                      <p className="mt-1 text-slate-400">{budgetHint}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-600">
                    Active card: <span className="font-mono text-slate-500">{activeDraft?.title}</span>
                  </p>
                </>
              )
            ) : (
              <ChevronLeft className="h-4 w-4 text-slate-600" aria-hidden />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

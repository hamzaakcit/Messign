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
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type Lead,
} from '@/lib/marketingApi';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import { CockpitApprovalsList } from './components/CockpitApprovalsList';
import { CockpitContextPanel } from './components/cockpit/CockpitContextPanel';
import type { SelectedItem } from './components/cockpit/cockpitTypes';

const MODULE_LINKS = [
  { label: 'Campaigns', to: '/marketing/campaigns' },
  { label: 'Agent (full)', to: '/marketing/agent' },
  { label: 'Approvals', to: '/marketing/approvals' },
  { label: 'Content', to: '/marketing/content' },
  { label: 'Leads', to: '/marketing/leads' },
  { label: 'Email', to: '/marketing/email' },
  { label: 'Dashboard', to: '/marketing/dashboard' },
] as const;

type CockpitTab = 'agent' | 'campaigns' | 'content' | 'leads' | 'approvals';

export function MarketingCommandCenterPage() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role ?? 'member';
  const [searchParams, setSearchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId') ?? '';
  const cockpitTab = (searchParams.get('tab') as CockpitTab) || 'agent';

  const userId = user?.authUserId || user?.id || '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [cockpitLoading, setCockpitLoading] = useState(true);
  const lastAgentContentIdRef = useRef<string | null>(null);

  const [vaultOpen, setVaultOpen] = useState(true);
  const [gateOpen, setGateOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<'vault' | 'canvas' | 'gate'>('canvas');
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);

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

  const {
    items: approvalQueueItems,
    loading: approvalsLoading,
    refetch: refetchApprovalQueue,
  } = useMarketingApprovalQueue(userId || undefined);

  const setTab = useCallback(
    (t: CockpitTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', t);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const applySelection = useCallback(
    (item: SelectedItem) => {
      setSelectedItem(item);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('contentId');
          next.delete('approvalId');
          next.delete('leadId');
          if (!item) {
            return next;
          }
          if (item.type === 'content') {
            next.set('contentId', item.id);
          } else if (item.type === 'approval') {
            next.set('contentId', item.contentId);
            next.set('approvalId', item.id);
          } else if (item.type === 'lead') {
            next.set('leadId', item.id);
          } else if (item.type === 'campaign') {
            next.set('campaignId', item.id);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const refreshCockpitData = useCallback(async () => {
    if (!userId) return;
    try {
      const [m, content, leads, camps] = await Promise.all([
        marketingAPI.getDashboardMetrics(userId),
        marketingAPI.listContent(userId, { pageSize: '50' }),
        marketingAPI.listLeads(userId, { pageSize: '50' }),
        marketingAPI.listCampaigns(userId),
      ]);
      setMetrics(m);
      setContentList(content.data);
      setLeadsList(leads.data);
      setCampaigns(camps.data);
      await refetchApprovalQueue();
    } catch {
      /* ignore */
    } finally {
      setCockpitLoading(false);
    }
  }, [userId, refetchApprovalQueue]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const urlSelectionSynced = useRef(false);
  useEffect(() => {
    if (urlSelectionSynced.current) return;
    urlSelectionSynced.current = true;
    const aid = searchParams.get('approvalId');
    const cid = searchParams.get('contentId');
    const lid = searchParams.get('leadId');
    if (aid && cid) setSelectedItem({ type: 'approval', id: aid, contentId: cid });
    else if (lid) setSelectedItem({ type: 'lead', id: lid });
    else if (cid) setSelectedItem({ type: 'content', id: cid });
  }, [searchParams]);

  useEffect(() => {
    void refreshCockpitData();
  }, [refreshCockpitData]);

  useEffect(() => {
    const last = messages.filter((m) => m.role === 'assistant').pop();
    if (!last?.metadata?.marketingContentId || last.isStreaming) return;
    const id = last.metadata.marketingContentId;
    if (!id || lastAgentContentIdRef.current === id) return;
    lastAgentContentIdRef.current = id;
    void refreshCockpitData();
    applySelection({ type: 'content', id });
    setTab('content');
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobilePane('gate');
    }
  }, [messages, refreshCockpitData, applySelection, setTab]);

  const approvalSnapshot = useMemo(() => {
    if (selectedItem?.type !== 'approval') return null;
    return approvalQueueItems.find((a) => a.id === selectedItem.id) ?? null;
  }, [selectedItem, approvalQueueItems]);

  const handleDataChanged = useCallback(async () => {
    await refreshCockpitData();
  }, [refreshCockpitData]);

  const onAskDora = useCallback(
    (prompt: string) => {
      setTab('agent');
      setInputValue(prompt);
      setMobilePane('canvas');
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [setTab],
  );

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

      {/* Live metrics + workspace tabs (?tab=agent|campaigns|content|leads|approvals) */}
      <div className="shrink-0 border-b border-white/[0.08] bg-[#080a0e] px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Leads', value: metrics?.totalLeads },
            { label: 'Active campaigns', value: metrics?.activeCampaigns },
            { label: 'Content (loaded)', value: contentList.length },
          ].map((k) => (
            <div key={k.label} className="min-w-[108px] rounded-lg border border-white/[0.08] bg-[#0c0f14] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className="text-lg font-semibold tabular-nums text-slate-100">
                {cockpitLoading ? '…' : k.value ?? '—'}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTab('approvals')}
            className="min-w-[108px] rounded-lg border border-white/[0.08] bg-[#0c0f14] px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Pending approvals</div>
            <div className="text-lg font-semibold tabular-nums text-slate-100">
              {cockpitLoading || approvalsLoading ? '…' : approvalQueueItems.length}
            </div>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(
            [
              ['agent', 'Agent'],
              ['campaigns', 'Campaigns'],
              ['content', 'Content'],
              ['leads', 'Leads'],
              ['approvals', 'Approvals'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                cockpitTab === id ? 'bg-cyan-600/40 text-cyan-100' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200',
              )}
            >
              {label}
              {id === 'approvals' && approvalQueueItems.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-400">
                  {approvalQueueItems.length}
                </span>
              )}
            </button>
          ))}
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
            <span className="text-xs font-medium text-slate-500">
              {cockpitTab === 'agent'
                ? 'Creative Canvas'
                : cockpitTab === 'campaigns'
                  ? 'Campaigns'
                  : cockpitTab === 'content'
                    ? 'Content'
                    : cockpitTab === 'leads'
                      ? 'Leads'
                      : 'Approvals'}
            </span>
            {(selectedItem?.type === 'content' || selectedItem?.type === 'approval') && (
              <span className="ml-2 font-mono text-[10px] text-cyan-400/80">
                panel ·{' '}
                {selectedItem.type === 'content' ? selectedItem.id : selectedItem.contentId}
              </span>
            )}
          </div>

          {cockpitTab === 'agent' ? (
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

            {/* Recent content (API) */}
            <div className="flex max-h-[min(48vh,420px)] min-h-[180px] flex-col bg-[#080a0e]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recent content</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshCockpitData()}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => clearChat()}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Clear chat
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {cockpitLoading && <p className="text-center text-xs text-slate-500">Loading content…</p>}
                {!cockpitLoading && contentList.length === 0 && (
                  <p className="text-center text-xs text-slate-500">
                    No content rows yet. Ask the Agent to draft copy — items appear here after the server saves them.
                  </p>
                )}
                {contentList.map((d) => {
                  const expanded = expandedContentId === d.id;
                  const isActive =
                    selectedItem?.type === 'content' && selectedItem.id === d.id;
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
                          applySelection({ type: 'content', id: d.id });
                          setExpandedContentId((cur) => (cur === d.id ? null : d.id));
                          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                            setMobilePane('gate');
                          }
                        }}
                        className="flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left"
                      >
                        <span className="text-sm font-medium text-slate-200">{d.title}</span>
                        <span className="text-[10px] text-slate-500">
                          {(d.channel ?? '—') + ' · ' + d.status}
                        </span>
                        <div className="flex w-full items-center justify-end">
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          )}
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
                          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                            {(d.body ?? '').slice(0, 4000)}
                            {(d.body?.length ?? 0) > 4000 ? '…' : ''}
                          </p>
                          <Link
                            to={`/marketing/content?contentId=${encodeURIComponent(d.id)}`}
                            className="mt-2 inline-flex text-[11px] text-cyan-400/90 hover:text-cyan-300"
                          >
                            Open full page →
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          ) : (
            <div
              className={cn(
                'min-h-0 flex-1 p-4 text-xs text-slate-300',
                cockpitTab === 'approvals' ? 'flex flex-col overflow-hidden' : 'overflow-auto',
              )}
            >
              {cockpitTab === 'campaigns' && (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase text-slate-500">
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Channel</th>
                      <th className="py-2">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.04]"
                        onClick={() => {
                          applySelection({ type: 'campaign', id: c.id });
                          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                            setMobilePane('gate');
                          }
                        }}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-200">{c.name}</td>
                        <td className="py-2 pr-2">{c.status}</td>
                        <td className="py-2 pr-2">{c.channel}</td>
                        <td className="py-2">{c.roi != null ? `${c.roi.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {cockpitTab === 'content' && (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase text-slate-500">
                      <th className="py-2 pr-2">Title</th>
                      <th className="py-2 pr-2">Channel</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contentList.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.04]"
                        onClick={() => {
                          applySelection({ type: 'content', id: c.id });
                          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                            setMobilePane('gate');
                          }
                        }}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-200">{c.title}</td>
                        <td className="py-2 pr-2">{c.channel ?? '—'}</td>
                        <td className="py-2 pr-2">{c.status}</td>
                        <td className="py-2 text-slate-500">{c.updated_at?.slice(0, 10) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {cockpitTab === 'leads' && (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase text-slate-500">
                      <th className="py-2 pr-2">Email</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadsList.map((l) => (
                      <tr
                        key={l.id}
                        className="cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.04]"
                        onClick={() => {
                          applySelection({ type: 'lead', id: l.id });
                          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                            setMobilePane('gate');
                          }
                        }}
                      >
                        <td className="py-2 pr-2">{l.email}</td>
                        <td className="py-2 pr-2">{l.status}</td>
                        <td className="py-2">{l.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {cockpitTab === 'approvals' && (
                <CockpitApprovalsList
                  items={approvalQueueItems}
                  loading={approvalsLoading}
                  selectedApprovalId={selectedItem?.type === 'approval' ? selectedItem.id : null}
                  onSelect={(item) => {
                    applySelection(item);
                    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                      setMobilePane('gate');
                    }
                  }}
                />
              )}
            </div>
          )}
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
          <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', gateOpen ? '' : 'items-start justify-center py-4')}>
            {gateOpen ? (
              <>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <CockpitContextPanel
                    userId={userId}
                    selectedItem={selectedItem}
                    approvalSnapshot={approvalSnapshot}
                    campaigns={campaigns}
                    contentList={contentList}
                    leadsList={leadsList}
                    onClose={() => applySelection(null)}
                    onDataChanged={handleDataChanged}
                    onAskDora={onAskDora}
                  />
                </div>
                {selectedCampaign && (
                  <div className="shrink-0 border-t border-white/[0.06] bg-[#080a0e] p-2.5">
                    <div className="text-[10px] font-medium uppercase text-slate-500">Finance preview</div>
                    <p className="mt-1 text-[10px] leading-snug text-slate-400">{budgetHint}</p>
                  </div>
                )}
              </>
            ) : (
              <ChevronLeft className="h-4 w-4 text-slate-600" aria-hidden />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

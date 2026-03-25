import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Send,
  Trash2,
  StopCircle,
  Loader2,
  Presentation,
  MessageSquare,
  LineChart,
  Zap,
} from 'lucide-react';
import { DoraChatAvatar, DoraWelcomeHero } from '@/components/dora/DoraPilot';
import { DoraHistorySidebar } from '@/components/dora/DoraHistorySidebar';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { ProgressiveChips } from '@/components/dora/ProgressiveChips';
import { SlashCommandPalette, filterSlashCommands } from '@/components/dora/SlashCommandPalette';
import { DoraContextBar, buildConversationContextLabels } from '@/components/dora/DoraContextBar';
import { DoraBriefingCard } from '@/components/dora/DoraBriefingCard';
import type { IntentEntry } from '@/shared/intents/registry';
import { useAuthStore } from '@/stores/authStore';
import { useDoraStore, type DoraSession } from '@/stores/doraStore';
import { useDoraSessionStore } from '@/stores/doraSessionStore';
import { khPresentationAPI, type Presentation as PresentationData } from '@/lib/knowledge-hub/api';
import { PresentationViewer } from '@/components/knowledge-hub/PresentationViewer';
import type { AIMessage } from '@/types/knowledge-hub/ai';

const PRESENTATION_SUGGESTION = { label: 'Create a presentation about Messign', topic: 'Messign' };

export function DoraPage() {
  const user = useAuthStore((s) => s.user);
  const sessions = useDoraStore((s) => s.sessions);
  const createSession = useDoraStore((s) => s.createSession);
  const setActiveSession = useDoraStore((s) => s.setActiveSession);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Prefer a welcome (empty) session when opening Dora so we show the welcome page, not the last conversation
  const emptySession = sessions.find((s) => s.messages.length === 0);
  const [chatKey, setChatKey] = useState<string>(() => {
    // Prefer empty (welcome) so we don't flash the last conversation before the effect runs
    if (emptySession) return emptySession.id;
    return 'new';
  });

  // On open: show welcome page — reuse an existing empty session if any, otherwise create one (don't create a second empty)
  useEffect(() => {
    if (emptySession) {
      setActiveSession(emptySession.id);
      setChatKey(emptySession.id);
    } else {
      const s = createSession();
      setChatKey(s.id);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    const s = createSession();
    setChatKey(s.id);
  }, [createSession]);

  const handleSelectSession = useCallback((session: DoraSession) => {
    setActiveSession(session.id);
    setChatKey(session.id);
  }, [setActiveSession]);

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="absolute right-4 top-3 z-20 flex items-center gap-2">
        <Link to="/dora" className="rounded-lg border border-app-border bg-app-card px-3 py-1.5 text-xs text-app-muted hover:text-app">
          Chat
        </Link>
        <Link to="/dora/automations" className="rounded-lg border border-app-border bg-app-card px-3 py-1.5 text-xs text-app-muted hover:text-app">
          Automations
        </Link>
        <Link to="/dora/automations/log" className="rounded-lg border border-app-border bg-app-card px-3 py-1.5 text-xs text-app-muted hover:text-app">
          Log
        </Link>
      </div>
      <DoraHistorySidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />
      <DoraChatBody key={chatKey} user={user} welcomeOnly={chatKey === 'new'} />
    </div>
  );
}

// ─── Inner chat body — re-keyed on session switch ───────────────────────────
function DoraChatBody({ user, welcomeOnly = false }: { user: { name?: string; role?: string } | null; welcomeOnly?: boolean }) {
  const location = useLocation();
  const userRole = user?.role ?? 'member';
  const getActiveMessages = useDoraStore(s => s.getActiveMessages);
  const setActiveMessages = useDoraStore(s => s.setActiveMessages);
  const createSession = useDoraStore(s => s.createSession);
  const activeSessionId = useDoraStore(s => s.activeSessionId);
  const addIntent = useDoraSessionStore((s) => s.addIntent);
  const clearSessionMemory = useDoraSessionStore((s) => s.clearSession);
  const setPreferredMode = useDoraSessionStore((s) => s.setPreferredMode);
  const setConversationContext = useDoraSessionStore((s) => s.setConversationContext);
  const recentIntents = useDoraSessionStore((s) => s.recentIntents);
  const recordPath = useDoraSessionStore((s) => s.recordPath);

  const initialMessages = welcomeOnly ? [] : getActiveMessages();

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    interactionMode,
    setInteractionMode,
    sendMessage,
    submitFeedback,
    clearPendingConfirmation,
    cancelActConfirmation,
    confirmPendingAction,
    cancelPendingAction,
    clearChat,
    abortStream,
  } = useDora({
    initialMessages,
    initialInteractionMode:
      useDoraSessionStore.getState().preferredMode === 'detailed' ? 'analyze' : 'ask',
    onMessagesChange: (msgs: AIMessage[]) => {
      if (msgs.length > 0) setActiveMessages(msgs);
    },
    onIntentResolved: addIntent,
  });

  const [inputValue, setInputValue] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const slashFilter = inputValue.startsWith('/') ? inputValue.slice(1) : '';
  const slashMatches = useMemo(() => filterSlashCommands(slashFilter), [slashFilter]);
  const slashOpen = inputValue.startsWith('/');
  const [entranceDone, setEntranceDone] = useState(false);
  const handleEntranceComplete = useCallback(() => setEntranceDone(true), []);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [presentationLoading, setPresentationLoading] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);

  useEffect(() => {
    recordPath(location.pathname);
  }, [location.pathname, recordPath]);

  // Ensure session exists if component mounts without one
  useEffect(() => {
    if (!activeSessionId) createSession();
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashFilter]);

  const lastUserQuery = useMemo(() => {
    const u = [...messages].reverse().find((m) => m.role === 'user');
    return u?.content ?? '';
  }, [messages]);

  useEffect(() => {
    setConversationContext(buildConversationContextLabels(recentIntents, lastUserQuery));
  }, [recentIntents, lastUserQuery, setConversationContext]);

  const handleNewChat = useCallback(() => {
    clearChat();
    clearSessionMemory();
    setInputValue('');
    setSlashActiveIndex(0);
    setEntranceDone(false);
    // Parent handles actual session creation via sidebar "New" button
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [clearChat, clearSessionMemory]);

  const handleSend = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || isLoading) return;
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await sendMessage(query);
  }, [inputValue, isLoading, sendMessage]);

  const handleSuggestion = useCallback(
    (query: string, intentId?: string) => {
      if (intentId) addIntent(intentId);
      void sendMessage(query, intentId ? { intentId } : undefined);
    },
    [sendMessage, addIntent],
  );

  const selectSlash = useCallback(
    (entry: IntentEntry) => {
      setInputValue('');
      setSlashActiveIndex(0);
      handleSuggestion(entry.query, entry.id);
    },
    [handleSuggestion],
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.min(i + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const pick = slashMatches[slashActiveIndex] ?? slashMatches[0];
        if (pick) selectSlash(pick);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInputValue('');
        setSlashActiveIndex(0);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleContextResend = useCallback(
    (intentId: string, query: string) => {
      addIntent(intentId);
      void sendMessage(query, { intentId });
    },
    [sendMessage, addIntent],
  );

  const handleContextClear = useCallback(() => {
    clearChat();
    clearSessionMemory();
    setInputValue('');
  }, [clearChat, clearSessionMemory]);

  const handleConfirmAct = useCallback(
    (msg: AIMessage) => {
      const p = msg.pendingConfirmation;
      if (!p) return;
      clearPendingConfirmation(msg.id);
      void sendMessage(p.sourceQuery, {
        intentId: p.sourceIntentId,
        confirmed: true,
        confirmation: { action: p.action, params: p.params },
        skipUserMessage: true,
      });
    },
    [sendMessage, clearPendingConfirmation],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 150)}px`;
  };

  const handleCreatePresentation = useCallback(async (topic: string) => {
    setPresentationError(null);
    setPresentationLoading(true);
    try {
      const data = await khPresentationAPI.create(topic, 8);
      setPresentation(data);
    } catch (e) {
      setPresentationError(e instanceof Error ? e.message : 'Failed to create presentation');
    } finally { setPresentationLoading(false); }
  }, []);

  const isEmpty = messages.length === 0;

  /* ───────────────────────── MODE: Ask / Analyze / Act ───────────────────────── */
  const ModeToggle = (
    <div className="flex items-center gap-0.5 rounded-full border border-app-border bg-app-sidebar p-0.5">
      {([
        { mode: 'ask' as const, icon: MessageSquare, label: 'Ask', title: 'Q&A — concise answers & tools' },
        { mode: 'analyze' as const, icon: LineChart, label: 'Analyze', title: 'Deeper insights, comparisons, charts' },
        { mode: 'act' as const, icon: Zap, label: 'Act', title: 'Create or change data — confirm before running' },
      ]).map(({ mode, icon: Icon, label, title }) => (
        <button
          key={mode}
          type="button"
          onClick={() => {
            setInteractionMode(mode);
            if (mode === 'ask') setPreferredMode('concise');
            if (mode === 'analyze') setPreferredMode('detailed');
          }}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
            interactionMode === mode
              ? mode === 'act'
                ? 'border border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border border-primary-500/40 bg-primary-500/15 text-primary-300'
              : 'border border-transparent text-app-muted hover:text-app-muted'
          }`}
          title={title}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );

  /* ────────────────────────── INPUT BAR ────────────────────────── */
  const InputBar = (
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        {slashOpen && (
          <SlashCommandPalette
            filter={slashFilter}
            activeIndex={slashActiveIndex}
            onActiveIndexChange={setSlashActiveIndex}
            onSelect={selectSlash}
          />
        )}
        <textarea
          data-testid="dora-input"
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder="Ask Dora anything..."
          className="w-full px-4 py-2.5 rounded-xl text-sm text-app-text placeholder-gray-600
            focus:outline-none resize-none overflow-hidden transition-all"
          style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(56,189,248,0.12)', backdropFilter: 'blur(12px)', boxShadow: '0 0 0 0 rgba(56,189,248,0)' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.35)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(56,189,248,0.08)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.12)'; e.currentTarget.style.boxShadow = '0 0 0 0 rgba(56,189,248,0)'; }}
          rows={1}
          disabled={isLoading}
        />
      </div>
      {isStreaming ? (
        <button
          onClick={abortStream}
          className="flex-shrink-0 p-2.5 rounded-xl bg-danger-500 hover:bg-danger-600 text-app-text transition-colors"
          title="Stop generating"
        >
          <StopCircle size={18} />
        </button>
      ) : (
        <button
          data-testid="dora-send"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="flex-shrink-0 p-2.5 rounded-xl bg-primary-500 hover:bg-primary-600
            disabled:bg-app-hover disabled:cursor-not-allowed
            text-app-text transition-colors"
          title="Send message"
        >
          <Send size={18} />
        </button>
      )}
    </div>
  );

  return (
    <div data-theme="dark" className="flex flex-col flex-1 h-full overflow-hidden" style={{ background: '#020817' }}>
      {presentation ? (
        <PresentationViewer
          presentation={presentation}
          onClose={() => setPresentation(null)}
        />
      ) : isEmpty ? (
        /* ═══════════════ EMPTY STATE — immersive welcome ═══════════════ */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: '#020817' }}>

          {/* ── Ambient background layer ── */}
          <div className="dora-welcome-bg">
            {/* Deep space base */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #0a1628 0%, #020817 60%)' }} />

            {/* Orb 1 — blue, top-left */}
            <div style={{
              position: 'absolute', top: '5%', left: '10%',
              width: 480, height: 480,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(59,130,246,0.1) 40%, transparent 70%)',
              filter: 'blur(40px)',
              animation: 'dora-orb-1 12s ease-in-out infinite',
            }} />

            {/* Orb 2 — violet, top-right */}
            <div style={{
              position: 'absolute', top: '-5%', right: '5%',
              width: 520, height: 520,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(99,42,210,0.08) 45%, transparent 70%)',
              filter: 'blur(50px)',
              animation: 'dora-orb-2 16s ease-in-out infinite',
            }} />

            {/* Orb 3 — cyan, bottom-center */}
            <div style={{
              position: 'absolute', bottom: '10%', left: '35%',
              width: 360, height: 360,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(56,189,248,0.06) 50%, transparent 70%)',
              filter: 'blur(45px)',
              animation: 'dora-orb-3 20s ease-in-out infinite',
            }} />

            {/* Orb 4 — pink accent, far right */}
            <div style={{
              position: 'absolute', bottom: '30%', right: '-5%',
              width: 280, height: 280,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 65%)',
              filter: 'blur(35px)',
              animation: 'dora-orb-1 18s ease-in-out infinite reverse',
            }} />

            {/* Subtle dot grid */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.06) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              animation: 'dora-grid-drift 8s linear infinite',
            }} />

            {/* Line 1: horizontal streak — moves DOWN (crosses line 2) */}
            <div style={{
              position: 'absolute', left: 0, right: 0,
              height: 2,
              background: 'linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.28) 30%, rgba(139,92,246,0.38) 50%, rgba(56,189,248,0.28) 70%, transparent 95%)',
              filter: 'blur(1px)',
              animation: 'dora-line-down 8s linear infinite',
            }} />

            {/* Line 2: horizontal — also moves DOWN (parallel, no cross) */}
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent 10%, rgba(139,92,246,0.22) 45%, rgba(236,72,153,0.28) 55%, transparent 90%)',
              filter: 'blur(1px)',
              animation: 'dora-line-down 6s linear infinite',
              animationDelay: '2s',
            }} />

            {/* Radial spotlight from center */}
            <div style={{
              position: 'absolute', top: '10%', left: '50%',
              transform: 'translateX(-50%)',
              width: 600, height: 400,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(56,189,248,0.08) 0%, transparent 65%)',
              filter: 'blur(20px)',
            }} />

            {/* Bottom fade */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
              background: 'linear-gradient(to bottom, transparent, rgba(2,8,23,0.95))',
            }} />
          </div>

          {/* ── Top bar — mode toggle ── */}
          <div style={{
            flexShrink: 0, position: 'relative', zIndex: 1,
            display: 'flex', justifyContent: 'flex-end',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(56,189,248,0.06)',
            background: 'rgba(2,8,23,0.3)',
            backdropFilter: 'blur(8px)',
          }}>
            <div className="max-w-xl w-full mx-auto flex justify-end">
              {ModeToggle}
            </div>
          </div>

          {/* ── Center content ── */}
          <div style={{
            flex: 1, position: 'relative', zIndex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 24px',
            overflow: 'hidden',
          }}>
            <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

              {/* Dora mascot with entrance */}
              <DoraWelcomeHero
                userName={user?.name?.split(' ')[0] || ''}
                faceSize={130}
                onEntranceComplete={handleEntranceComplete}
              />

              {/* Suggestion area — fades in after entrance */}
              <div style={{
                opacity: entranceDone ? 1 : 0,
                transform: entranceDone ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)',
                width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                {/* Glassy chips wrapper */}
                <div
                  className="relative w-full overflow-hidden rounded-[14px] border border-sky-500/10"
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(15,23,42,0.5)',
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 0 30px rgba(56,189,248,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-[1]"
                    style={{
                      background: 'linear-gradient(to right, rgba(15,23,42,0.95), transparent)',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-[1]"
                    style={{
                      background: 'linear-gradient(to left, rgba(15,23,42,0.95), transparent)',
                    }}
                  />
                  <div className="flex w-full flex-col gap-3">
                    <DoraBriefingCard
                      userFirstName={user?.name?.split(' ')[0]}
                      onStartDay={() =>
                        handleSuggestion(
                          'Give me a comprehensive daily briefing across tasks, finance, projects, and goals.',
                        )
                      }
                      onOpenTasks={() => handleSuggestion('What are my open tasks?', 'quick.open_tasks')}
                      onOpenFinance={() =>
                        handleSuggestion('Summarize unpaid invoices and total outstanding amount')
                      }
                      onOpenProjects={() =>
                        handleSuggestion(
                          'Which projects need attention from me — overdue work or blockers?',
                          'projects.active_overview',
                        )
                      }
                    />
                    <ProgressiveChips
                      userRole={userRole}
                      onSuggestionClick={handleSuggestion}
                      surface="dora"
                      currentPath={location.pathname}
                    />
                  </div>
                </div>

                {/* Presentation button */}
                <button
                  type="button"
                  onClick={() => handleCreatePresentation(PRESENTATION_SUGGESTION.topic)}
                  disabled={presentationLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 16px', borderRadius: 20,
                    background: 'rgba(139,92,246,0.08)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    color: '#a78bfa', fontSize: 12, cursor: 'pointer',
                    transition: 'all 0.2s',
                    backdropFilter: 'blur(8px)',
                    opacity: presentationLoading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.16)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}
                >
                  {presentationLoading ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Presentation style={{ width: 12, height: 12 }} />}
                  {PRESENTATION_SUGGESTION.label}
                </button>
                {presentationError && <p style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>{presentationError}</p>}
              </div>
            </div>
          </div>

          {/* ── Input bar ── */}
          <div style={{
            flexShrink: 0, position: 'relative', zIndex: 1,
            padding: '12px 20px 14px',
            borderTop: '1px solid rgba(56,189,248,0.08)',
            background: 'linear-gradient(to top, rgba(2,8,23,0.98), rgba(2,8,23,0.7))',
            backdropFilter: 'blur(16px)',
          }}>
            <div className="max-w-xl mx-auto">
              {InputBar}
              <p style={{ fontSize: 11, color: '#334155', marginTop: 4, textAlign: 'center' }}>
                Type / for commands · arrows & Enter to run
              </p>
              <p style={{ fontSize: 11, color: '#334155', marginTop: 2, textAlign: 'center' }}>
                Live company data · Verify critical decisions · ⌘J from anywhere
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════ CHAT STATE ═══════════════ */
        <>
          <div style={{ flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid rgba(56,189,248,0.08)', background: 'rgba(2,8,23,0.9)', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="flex items-center gap-2">
                <DoraChatAvatar size={28} isThinking={isStreaming} />
                <div>
                  <h1 className="text-base font-semibold text-app-text">Dora</h1>
                  <p className="text-xs text-app-muted">Your AI Pilot</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ModeToggle}
                <button onClick={handleNewChat} className="p-1.5 rounded-lg hover:bg-app-hover text-app-muted hover:text-danger-500 transition-colors" title="New chat">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(180deg, #020817 0%, #0a0f1e 100%)' }}>
            <div className="max-w-4xl mx-auto px-4 py-6">
              {messages.map((msg, i) => (
                <AIMessageBubble
                  key={msg.id}
                  message={msg}
                  priorUserMessage={i > 0 ? messages[i - 1] : undefined}
                  userRole={userRole}
                  currentPath={location.pathname}
                  onFeedback={msg.role === 'assistant' ? submitFeedback : undefined}
                  onSendMessage={(text, intentId) => {
                    if (intentId) addIntent(intentId);
                    void sendMessage(text, intentId ? { intentId } : undefined);
                  }}
                  onConfirmAct={handleConfirmAct}
                  onCancelAct={cancelActConfirmation}
                  onConfirmPendingAction={confirmPendingAction}
                  onCancelPendingAction={cancelPendingAction}
                />
              ))}
              {!messages.some((m) => m.role === 'assistant' && m.isStreaming && !m.content) && (
                <AITypingIndicator isLoading={isLoading} isStreaming={isStreaming} />
              )}
              {error && (
                <div className="flex items-center gap-2 px-4 py-2 mb-4 bg-danger-500/10 text-danger-500 rounded-lg text-sm">
                  <span>&#x26A0;&#xFE0F; {error}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div style={{ flexShrink: 0, padding: '12px 20px 14px', borderTop: '1px solid rgba(56,189,248,0.08)', background: 'linear-gradient(to top, rgba(2,8,23,0.98), rgba(2,8,23,0.7))', backdropFilter: 'blur(16px)' }}>
            <div className="max-w-4xl mx-auto">
              <DoraContextBar
                recentIntentIds={recentIntents}
                lastUserQuery={lastUserQuery}
                onResendIntent={handleContextResend}
                onClear={handleContextClear}
              />
              {InputBar}
              <p style={{ fontSize: 11, color: '#334155', marginTop: 4, textAlign: 'center' }}>
                Type / for commands · arrows & Enter to run
              </p>
              <p style={{ fontSize: 11, color: '#334155', marginTop: 2, textAlign: 'center' }}>
                Dora answers are based on live company data. Always verify critical decisions.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

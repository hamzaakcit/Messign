import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Instagram, Loader2, Send, StopCircle, Trash2 } from 'lucide-react';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import type { BoardCardData } from './BoardCard';
import { InstagramAgentPromptModal } from './InstagramAgentPromptModal';
import { MARKETING_COMPOSER_QUICK_ACTIONS } from './marketingDoraQuickActions';
import { MarketingDoraQuickActionIcon } from './MarketingDoraQuickActionIcon';

const noop = (): void => {};

/** Tailwind classes: floating controls sit left of the open marketing Dora rail. */
export const MARKETING_DORA_RAIL_OUTSET_RIGHT = 'max-sm:right-6 sm:right-[424px]';

interface DoraRailProps {
  selectedCard: BoardCardData | null;
  /** Increment to open the Instagram agent modal (e.g. SparkBar “Instagram (AI)”). */
  instagramModalSignal?: number;
  /** Auto-send a prefilled prompt (Command Center “Execute with Dora”). */
  executePrompt?: { id: number; text: string } | null;
}

export function DoraRail({
  selectedCard,
  instagramModalSignal = 0,
  executePrompt = null,
}: DoraRailProps): JSX.Element {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role ?? 'member';
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

  const handleSendMessage = useCallback((msg: string): void => {
    void sendMessage(msg);
  }, [sendMessage]);

  const [inputValue, setInputValue] = useState('');
  const [igModalOpen, setIgModalOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastExecutePromptId = useRef<number | null>(null);

  useEffect(() => {
    const el = chatEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (instagramModalSignal > 0) setIgModalOpen(true);
  }, [instagramModalSignal]);

  useEffect(() => {
    if (!executePrompt?.text.trim()) return;
    if (lastExecutePromptId.current === executePrompt.id) return;
    lastExecutePromptId.current = executePrompt.id;
    void sendMessage(executePrompt.text);
  }, [executePrompt?.id, executePrompt?.text, sendMessage]);

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

  return (
    <div className="flex flex-col h-full min-h-0 w-[min(400px,92vw)] min-w-[280px] shrink-0 border-l border-white/[0.06] bg-[#080a0e] overflow-hidden">
      <InstagramAgentPromptModal
        isOpen={igModalOpen}
        onClose={() => setIgModalOpen(false)}
        onSend={(msg) => void sendMessage(msg)}
        onApplyToComposer={(msg) => {
          setInputValue(msg);
          inputRef.current?.focus();
        }}
        defaultTopic={selectedCard?.title ?? null}
      />
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1.5">
          <DoraChatAvatar size={20} />
          <span className="text-xs font-semibold text-app-text">Dora</span>
        </div>
        <button
          type="button"
          onClick={() => { clearChat(); setInputValue(''); }}
          className="p-1 rounded text-app-muted hover:text-app-text hover:bg-app-nav-hover"
          title="Clear"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {selectedCard && (
        <div className="px-3 py-2 border-b border-white/[0.06] bg-app-surface-tertiary shrink-0">
          <p className="text-[10px] text-app-muted uppercase tracking-wider mb-1">Selected</p>
          <p className="text-xs font-medium text-app-text truncate">{selectedCard.title}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-app-muted">
            <span className="capitalize">{selectedCard.channel || selectedCard.type}</span>
            <span className="capitalize">{selectedCard.status}</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-4 px-1 space-y-3">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-xl scale-150" aria-hidden />
                <DoraChatAvatar size={36} />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Quick start</p>
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
            onSendMessage={handleSendMessage}
            onConfirmAct={noop}
            onCancelAct={noop}
            onConfirmPendingAction={confirmPendingAction}
            onCancelPendingAction={cancelPendingAction}
          />
        ))}

        {!messages.some((m) => m.role === 'assistant' && m.isStreaming && !m.content) && (
          <AITypingIndicator isLoading={isLoading} isStreaming={isStreaming} />
        )}

        {error && <p className="text-[10px] text-red-400 px-1">{error}</p>}
        <div ref={chatEndRef} />
      </div>

      <div className="relative z-20 border-t border-white/[0.06] bg-[#0a0c10] shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] py-2 px-2 space-y-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setIgModalOpen(true)}
            title="Instagram"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-gradient-to-b px-2.5 py-2 text-sm font-medium text-app-text transition hover:brightness-110 disabled:opacity-40 from-pink-500/30 to-rose-600/20 border-pink-500/25"
          >
            <Instagram className="w-4 h-4 text-pink-300 shrink-0" />
            <span className="leading-tight">Instagram</span>
          </button>
          <div className="relative">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setQuickActionsOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-app-surface-tertiary px-2.5 py-2 text-sm font-medium text-app-text hover:bg-app-nav-hover disabled:opacity-40"
              title="Prefill composer with a channel template"
              aria-expanded={quickActionsOpen}
            >
              Quick prompts
              <ChevronDown className={`w-4 h-4 ${quickActionsOpen ? 'rotate-180' : ''} transition-transform`} />
            </button>
            {quickActionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setQuickActionsOpen(false)}
                />
                <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-[min(50vh,280px)] overflow-y-auto rounded-lg border border-white/[0.1] bg-[#12151c] py-1 shadow-xl">
                  {MARKETING_COMPOSER_QUICK_ACTIONS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        setInputValue(q.text);
                        inputRef.current?.focus();
                        setQuickActionsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-app-text hover:bg-app-nav-hover disabled:opacity-40"
                    >
                      <span className="shrink-0">
                        <MarketingDoraQuickActionIcon icon={q.icon} />
                      </span>
                      <span className="min-w-0 leading-snug">{q.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2 pt-0.5">
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
            placeholder="Ask Dora\u2026"
            disabled={isLoading}
            rows={2}
            className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 rounded-xl text-sm leading-relaxed resize-none bg-app-inputBg border border-app-inputBorder text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={abortStream}
              className="shrink-0 p-1.5 rounded-lg bg-red-500/90 text-app-text hover:bg-red-600"
              title="Stop"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="shrink-0 p-1.5 rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-40"
              title="Send"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Instagram, Loader2, Send, StopCircle, Trash2 } from 'lucide-react';
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

interface DoraRailProps {
  selectedCard: BoardCardData | null;
  /** Increment to open the Instagram agent modal (e.g. SparkBar “Instagram (AI)”). */
  instagramModalSignal?: number;
}

export function DoraRail({ selectedCard, instagramModalSignal = 0 }: DoraRailProps): JSX.Element {
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (instagramModalSignal > 0) setIgModalOpen(true);
  }, [instagramModalSignal]);

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
    <div className="flex flex-col h-full w-[280px] shrink-0 border-l border-white/[0.06] bg-[#080a0e] overflow-hidden">
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

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
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

      <div className="relative z-20 p-2 border-t border-white/[0.06] space-y-1 bg-[#0a0c10] shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex gap-1 overflow-x-auto pb-0.5 snap-x snap-mandatory scrollbar-thin [-webkit-overflow-scrolling:touch]">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setIgModalOpen(true)}
            title="Instagram"
            className="flex shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border bg-gradient-to-b px-2 py-2 min-w-[4.75rem] text-[9px] font-semibold text-app-text/90 transition hover:brightness-110 disabled:opacity-40 from-pink-500/30 to-rose-600/20 border-pink-500/25"
          >
            <Instagram className="w-4 h-4 text-pink-300" />
            <span className="leading-none">Instagram</span>
          </button>
          {MARKETING_COMPOSER_QUICK_ACTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setInputValue(q.text);
                inputRef.current?.focus();
              }}
              title={q.label}
              className={`
                flex shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border bg-gradient-to-b px-2 py-2 min-w-[4.75rem]
                text-[9px] font-semibold text-app-text/90 transition hover:brightness-110 disabled:opacity-40
                ${q.accent}
                ${q.upgraded ? 'ring-1 ring-white/5' : ''}
              `}
            >
              <MarketingDoraQuickActionIcon icon={q.icon} />
              <span className="leading-none text-center">{q.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-1">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              const t = e.target;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 80)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask Dora\u2026"
            disabled={isLoading}
            rows={1}
            className="flex-1 min-h-[32px] max-h-[80px] px-2 py-1.5 rounded-lg text-xs resize-none bg-app-inputBg border border-app-inputBorder text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:ring-1 focus:ring-primary-500/40"
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

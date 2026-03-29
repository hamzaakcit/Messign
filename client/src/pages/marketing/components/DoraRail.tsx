import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Send, StopCircle, Trash2 } from 'lucide-react';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { LucyGreetingCard, LucySidebarLogo } from '@/pages/marketing/components/lucy';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import type { BoardCardData } from './BoardCard';
import type { MarketingChannelAgentModalId } from '@/pages/marketing/lib/marketingChannelAgentBuilders';
import { InstagramAgentPromptModal } from './InstagramAgentPromptModal';
import { MarketingChannelAgentModal } from './MarketingChannelAgentModal';
import { MarketingComposerChannelButtons } from './MarketingComposerChannelButtons';

const noop = (): void => {};

/** Tailwind classes: floating controls sit left of the open marketing Lucy rail. */
export const MARKETING_DORA_RAIL_OUTSET_RIGHT = 'max-sm:right-6 sm:right-[424px]';

interface DoraRailProps {
  selectedCard: BoardCardData | null;
  /** Increment to open the Instagram agent modal (e.g. SparkBar “Instagram (AI)”). */
  instagramModalSignal?: number;
  /** Auto-send a prefilled prompt (Command Center “Execute with Lucy”). */
  executePrompt?: { id: number; text: string } | null;
  /**
   * `rail`: fixed-width right column on the marketing workspace.
   * `page`: full-width centered panel on the Lucy home route (`/marketing`).
   * `pageSplit`: left column in Lucy split layout — full height, flush edge, border on the right.
   */
  layout?: 'rail' | 'page' | 'pageSplit';
}

export function DoraRail({
  selectedCard,
  instagramModalSignal = 0,
  executePrompt = null,
  layout = 'rail',
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
  const [channelModal, setChannelModal] = useState<MarketingChannelAgentModalId | null>(null);
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

  const shellClass =
    layout === 'pageSplit'
      ? 'flex flex-col h-full min-h-0 w-full min-w-0 flex-1 border-r border-white/[0.08] bg-[#080a0e] overflow-hidden'
      : layout === 'page'
        ? 'flex flex-col h-full min-h-0 w-full max-w-[min(880px,100%)] min-w-0 shrink-0 rounded-2xl border border-white/[0.08] bg-[#080a0e] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.35)]'
        : 'flex flex-col h-full min-h-0 w-[min(400px,92vw)] min-w-[280px] shrink-0 border-l border-white/[0.06] bg-[#080a0e] overflow-hidden';

  return (
    <div className={shellClass}>
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
      <MarketingChannelAgentModal
        channel={channelModal}
        isOpen={channelModal !== null}
        onClose={() => setChannelModal(null)}
        onSend={(msg) => void sendMessage(msg)}
        onApplyToComposer={(msg) => {
          setInputValue(msg);
          inputRef.current?.focus();
        }}
        defaultTopic={selectedCard?.title ?? null}
      />
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <LucySidebarLogo collapsed={false} />
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
          <div className="py-2 px-0 w-full min-w-0 overflow-x-hidden">
            <LucyGreetingCard
              heroSize={layout === 'pageSplit' ? 140 : 120}
              wide={layout === 'pageSplit'}
              onChipSelect={
                layout === 'pageSplit'
                  ? undefined
                  : (text) => {
                      setInputValue(text);
                      inputRef.current?.focus();
                    }
              }
            />
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

      <div className="relative z-20 flex min-h-0 flex-col border-t border-white/[0.06] bg-[#0a0c10] shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
        <div className="max-h-[min(36vh,340px)] min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2.5 sm:px-3">
          <MarketingComposerChannelButtons
            isLoading={isLoading}
            onOpenInstagram={() => setIgModalOpen(true)}
            onOpenChannelModal={(ch) => setChannelModal(ch)}
            variant="comfortable"
          />
        </div>
        <div className="flex items-end gap-2 border-t border-white/[0.05] px-2 py-2.5 sm:px-3">
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
            placeholder={layout === 'page' || layout === 'pageSplit' ? 'Ask Lucy\u2026' : 'Ask Dora\u2026'}
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

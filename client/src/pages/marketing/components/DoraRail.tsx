import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Instagram, Loader2, Send, StopCircle, Trash2 } from 'lucide-react';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import type { BoardCardData } from './BoardCard';

const noop = (): void => {};

const QUICK_PROMPTS: { label: string; text: string; icon?: 'instagram' }[] = [
  {
    label: 'Instagram + image',
    icon: 'instagram',
    text: 'Draft an Instagram post for [topic]. Include: a strong hook (first line), short paragraphs with line breaks, a clear CTA, 10\u201315 relevant hashtags, and a separate block exactly in this format for the hero image:\n\n[IMAGE_PROMPT]\nDescribe subject, lighting, colors, mood, and style. Square 1:1, no text in the image unless I ask.\n[/IMAGE_PROMPT]',
  },
  {
    label: 'LinkedIn post',
    text: 'Draft a LinkedIn post for [topic]: hook in the first two lines, short paragraphs, minimal emoji (0\u20132), and a professional CTA.',
  },
  {
    label: 'Email promo',
    text: 'Draft a short marketing email: subject line (~55 chars), preview text, body with one primary CTA, plain-language tone.',
  },
];

interface DoraRailProps {
  selectedCard: BoardCardData | null;
}

export function DoraRail({ selectedCard }: DoraRailProps): JSX.Element {
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1.5">
          <DoraChatAvatar size={20} />
          <span className="text-xs font-semibold text-app-text">Dora</span>
        </div>
        <button
          type="button"
          onClick={() => { clearChat(); setInputValue(''); }}
          className="p-1 rounded text-app-muted hover:text-app-text hover:bg-white/5"
          title="Clear"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {selectedCard && (
        <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
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
          <div className="text-center py-6 text-app-muted text-[10px] space-y-1.5">
            <div className="flex justify-center mb-2">
              <DoraChatAvatar size={32} />
            </div>
            <p>Ask for copy, insights, or ideas.</p>
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

      <div className="p-2 border-t border-white/[0.06] space-y-1 bg-[#0a0c10] shrink-0">
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={isLoading}
              onClick={() => { setInputValue(q.text); inputRef.current?.focus(); }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border border-white/10 bg-white/[0.04] text-app-muted hover:text-app-text hover:bg-white/[0.08] disabled:opacity-40"
            >
              {q.icon === 'instagram' ? <Instagram className="w-2 h-2 shrink-0" /> : null}
              {q.label}
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
              className="shrink-0 p-1.5 rounded-lg bg-red-500/90 text-white hover:bg-red-600"
              title="Stop"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="shrink-0 p-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
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

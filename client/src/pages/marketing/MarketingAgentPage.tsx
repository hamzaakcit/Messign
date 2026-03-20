import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Send, StopCircle, Trash2, Loader2 } from 'lucide-react';
import { MarketingNav } from './components/MarketingNav';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';

export function MarketingAgentPage() {
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
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6">
      <MarketingNav />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-app">Marketing Agent</h1>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Drafts, campaign insights, and ROI — routed through Dora&apos;s marketing specialists. For other
            modules, use{' '}
            <Link to="/dora" className="text-primary-400 hover:underline">
              Dora
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              clearChat();
              setInputValue('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-app-border text-app-muted hover:text-app hover:bg-app-hover"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-app-border bg-app-card overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12 text-app-muted text-sm max-w-md mx-auto">
              <div className="flex justify-center mb-4">
                <DoraChatAvatar size={56} />
              </div>
              <p>
                Ask for social copy, email drafts, campaign performance, ROI summaries, or content topic ideas
                grounded in your workspace data.
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
            <p className="text-sm text-red-400 px-2" role="alert">
              {error}
            </p>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-app-border flex items-end gap-2 bg-app-sidebar/30">
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
            placeholder="Ask the Marketing Agent…"
            disabled={isLoading}
            rows={1}
            className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 rounded-lg text-sm text-app bg-app border border-app-border resize-none focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={abortStream}
              className="shrink-0 p-2.5 rounded-lg bg-red-500/90 text-white hover:bg-red-600"
              title="Stop"
            >
              <StopCircle size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="shrink-0 p-2.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send size={20} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Send, StopCircle, Trash2, Loader2, Instagram } from 'lucide-react';
import { MarketingNav } from './components/MarketingNav';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';

const QUICK_PROMPTS: { label: string; text: string; icon?: 'instagram' }[] = [
  {
    label: 'Instagram + image brief',
    icon: 'instagram',
    text:
      'Draft an Instagram post for [topic]. Include: a strong hook (first line), short paragraphs with line breaks, a clear CTA, 10–15 relevant hashtags, and a separate block exactly in this format for the hero image (the app will use it to generate the visual):\n\n[IMAGE_PROMPT]\nDescribe subject, lighting, colors, mood, and style. Square 1:1, no text in the image unless I ask.\n[/IMAGE_PROMPT]',
  },
  {
    label: 'LinkedIn post',
    text:
      'Draft a LinkedIn post for [topic]: hook in the first two lines, short paragraphs, minimal emoji (0–2), and a professional CTA.',
  },
  {
    label: 'Email promo',
    text:
      'Draft a short marketing email: subject line (~55 chars), preview text, body with one primary CTA, plain-language tone.',
  },
];

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
          <h1 className="text-xl font-semibold text-app-text">Marketing Agent</h1>
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear chat
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-app-border bg-app-card overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-10 text-app-muted text-sm max-w-lg mx-auto space-y-3">
              <div className="flex justify-center mb-4">
                <DoraChatAvatar size={56} />
              </div>
              <p>
                Ask for social copy, email drafts, campaign performance, ROI summaries, or content ideas grounded in
                your workspace data.
              </p>
              <p className="text-xs text-app-muted/90 leading-relaxed">
                <span className="text-app-text/90 font-medium">Instagram:</span> ask for an Instagram draft with an{' '}
                <code className="text-[11px] px-1 py-0.5 rounded bg-white/5 border border-white/10">[IMAGE_PROMPT]</code>{' '}
                block (see quick prompt below). After content is created with channel{' '}
                <strong className="text-app-text/90">instagram</strong>, open{' '}
                <Link to="/marketing/content" className="text-primary-400 hover:underline">
                  Marketing → Content
                </Link>{' '}
                to preview the post and regenerate the image from the cockpit.
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

        <div className="p-3 border-t border-app-border space-y-2 bg-app-sidebar/30">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-app-muted/80 w-full sm:w-auto sm:mr-1 py-1">
              Quick start
            </span>
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setInputValue(q.text);
                  inputRef.current?.focus();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-white/10 bg-white/[0.04] text-app-muted hover:text-app-text hover:bg-white/[0.08] disabled:opacity-40"
              >
                {q.icon === 'instagram' ? <Instagram className="w-3 h-3 shrink-0" aria-hidden /> : null}
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
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
            className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 rounded-lg text-sm resize-none bg-app-inputBg border border-app-inputBorder text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:ring-1 focus:ring-primary-500/40"
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
    </div>
  );
}

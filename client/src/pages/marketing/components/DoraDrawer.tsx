import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Instagram, Loader2, Send, StopCircle, Trash2, X as CloseIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDora } from '@/hooks/useDora';
import { AIMessageBubble, AITypingIndicator } from '@/components/knowledge-hub/ai';
import { DoraChatAvatar } from '@/components/dora/DoraPilot';
import { useAuthStore } from '@/stores/authStore';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import { InstagramAgentPromptModal } from './InstagramAgentPromptModal';
import { MARKETING_COMPOSER_QUICK_ACTIONS } from './marketingDoraQuickActions';
import { MarketingDoraQuickActionIcon } from './MarketingDoraQuickActionIcon';

const noop = (): void => {};

interface DoraDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function DoraDrawer({ open, onClose }: DoraDrawerProps): JSX.Element {
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

  const handleSendMessage = useCallback((msg: string, _intentId?: string): void => {
    void sendMessage(msg);
  }, [sendMessage]);

  const [inputValue, setInputValue] = useState('');
  const [igModalOpen, setIgModalOpen] = useState(false);
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex flex-col h-full min-h-0 border-l border-white/[0.06] bg-[#080a0e] overflow-hidden shrink-0 w-96"
        >
          <InstagramAgentPromptModal
            isOpen={igModalOpen}
            onClose={() => setIgModalOpen(false)}
            onSend={(msg) => void sendMessage(msg)}
            onApplyToComposer={(msg) => {
              setInputValue(msg);
              inputRef.current?.focus();
            }}
          />
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <DoraChatAvatar size={24} />
              <span className="text-sm font-semibold text-app-text">Marketing Agent</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  clearChat();
                  setInputValue('');
                }}
                className="p-1.5 rounded-md text-app-muted hover:text-app-text hover:bg-app-nav-hover"
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md text-app-muted hover:text-app-text hover:bg-app-nav-hover"
                title="Close"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !isLoading && (
              <div className="text-center py-8 text-app-muted text-xs max-w-sm mx-auto space-y-2">
                <div className="flex justify-center mb-3">
                  <DoraChatAvatar size={40} />
                </div>
                <p>Ask for social copy, email drafts, campaign insights, or content ideas.</p>
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

            {error && (
              <p className="text-xs text-red-400 px-1" role="alert">
                {error}
              </p>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="px-3 py-2.5 border-t border-white/[0.06] space-y-2 bg-[#0a0c10] shrink-0">
            <div className="flex gap-0.5 overflow-x-auto max-h-[2.5rem] items-center snap-x scrollbar-thin [-webkit-overflow-scrolling:touch]">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setIgModalOpen(true)}
                title="Instagram"
                className="inline-flex shrink-0 snap-start items-center gap-1 px-1.5 py-1 rounded-md text-[9px] font-semibold border border-pink-500/25 bg-gradient-to-b from-pink-500/30 to-rose-600/20 text-pink-100/95 hover:brightness-110 disabled:opacity-40 min-w-[4rem]"
              >
                <Instagram className="w-3 h-3 shrink-0" />
                <span className="truncate">Insta</span>
              </button>
              {MARKETING_COMPOSER_QUICK_ACTIONS.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={isLoading}
                  title={q.label}
                  onClick={() => {
                    setInputValue(q.text);
                    inputRef.current?.focus();
                  }}
                  className={`
                    inline-flex shrink-0 snap-start items-center gap-1 px-1.5 py-1 rounded-md text-[9px] font-semibold border bg-gradient-to-b min-w-[4rem] max-h-9
                    text-app-text/90 hover:brightness-110 disabled:opacity-40 truncate
                    ${q.accent}
                    ${q.upgraded ? 'ring-1 ring-white/5' : ''}
                  `}
                >
                  <MarketingDoraQuickActionIcon icon={q.icon} size="sm" />
                  <span className="truncate max-w-[3.5rem]">{q.label}</span>
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
                placeholder="Ask the Marketing Agent\u2026"
                disabled={isLoading}
                rows={2}
                className="flex-1 min-h-[48px] max-h-[120px] px-3 py-3 rounded-xl text-sm leading-relaxed resize-none bg-app-inputBg border border-app-inputBorder text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={abortStream}
                  className="shrink-0 p-2 rounded-lg bg-red-500/90 text-app-text hover:bg-red-600"
                  title="Stop"
                >
                  <StopCircle size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!inputValue.trim() || isLoading}
                  className="shrink-0 p-2 rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Send"
                >
                  {isLoading ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Send size={18} />}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Send,
  Trash2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  StopCircle,
  Brain,
  Loader2,
  Presentation,
} from 'lucide-react';
import { useAIChat } from '@/hooks/knowledge-hub/useAIChat';
import {
  AIMessageBubble,
  AISuggestionChips,
  AITypingIndicator,
} from '@/components/knowledge-hub/ai';
import { useAuthStore } from '@/stores/authStore';
import { khPresentationAPI, type Presentation as PresentationData } from '@/lib/knowledge-hub/api';
import { PresentationViewer } from '@/components/knowledge-hub/PresentationViewer';

const PRESENTATION_SUGGESTION = { label: 'Create a presentation about Messign', topic: 'Messign' };

export function AIAssistantPage() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role ?? 'member';
  const [recentIntentIds, setRecentIntentIds] = useState<string[]>([]);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    conciseMode,
    setConciseMode,
    sendMessage,
    submitFeedback,
    clearChat,
    abortStream,
  } = useAIChat({
    onIntentResolved: (id) => {
      setRecentIntentIds((prev) => [...prev, id].slice(-12));
    },
  });

  const [inputValue, setInputValue] = useState('');
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [presentationLoading, setPresentationLoading] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || isLoading) return;
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await sendMessage(query);
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = useCallback(
    (query: string, intentId?: string) => {
      if (intentId) setRecentIntentIds((prev) => [...prev, intentId].slice(-12));
      void sendMessage(query, intentId ? { intentId } : undefined);
    },
    [sendMessage],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
  };

  const handleCreatePresentation = useCallback(async (topic: string) => {
    setPresentationError(null);
    setPresentationLoading(true);
    try {
      const data = await khPresentationAPI.create(topic, 8);
      setPresentation(data);
    } catch (e) {
      setPresentationError(
        e instanceof Error ? e.message : 'Failed to create presentation'
      );
    } finally {
      setPresentationLoading(false);
    }
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {presentation ? (
        <PresentationViewer
          presentation={presentation}
          onClose={() => setPresentation(null)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-dark-700 bg-dark-900">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                  <Brain size={18} className="text-white" />
                </div>
                <div>
                  <h1 className="text-base font-semibold text-white">AI Assistant</h1>
                  <p className="text-xs text-gray-500">Ask anything about Messign</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConciseMode(!conciseMode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    conciseMode
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40'
                      : 'bg-dark-700 text-gray-500 hover:text-gray-300'
                  }`}
                  title={
                    conciseMode
                      ? 'Concise mode (short answers)'
                      : 'Detailed mode (thorough answers)'
                  }
                >
                  {conciseMode ? (
                    <ToggleRight size={14} />
                  ) : (
                    <ToggleLeft size={14} />
                  )}
                  {conciseMode ? 'Concise' : 'Detailed'}
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      clearChat();
                      setRecentIntentIds([]);
                    }}
                    className="p-1.5 rounded-lg hover:bg-dark-700 text-gray-500 hover:text-danger-500 transition-colors"
                    title="Clear chat"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-6">
              {isEmpty && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mb-6">
                    <Sparkles size={28} className="text-primary-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    What would you like to know?
                  </h2>
                  <p className="text-sm text-gray-500 mb-8 text-center max-w-md">
                    I can access company data including performance metrics, project
                    status, tasks, finances, knowledge base, and more.
                  </p>
                  <AISuggestionChips
                    userRole={userRole}
                    onSuggestionClick={handleSuggestion}
                    surface="knowledge-hub"
                    currentPath={location.pathname}
                    recentIntentIds={recentIntentIds}
                  />
                  <div className="mt-6 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() =>
                        handleCreatePresentation(PRESENTATION_SUGGESTION.topic)
                      }
                      disabled={presentationLoading}
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-sm text-gray-300 hover:border-primary-500/40 hover:text-white hover:bg-dark-800/80 transition-all disabled:opacity-60 w-full justify-center"
                    >
                      {presentationLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400" />
                      ) : (
                        <Presentation className="w-3.5 h-3.5 text-primary-400" />
                      )}
                      {PRESENTATION_SUGGESTION.label}
                    </button>
                    {presentationError && (
                      <p className="mt-2 text-xs text-danger-500 text-center">
                        {presentationError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <AIMessageBubble
                  key={msg.id}
                  message={msg}
                  priorUserMessage={i > 0 ? messages[i - 1] : undefined}
                  userRole={userRole}
                  currentPath={location.pathname}
                  onFeedback={
                    msg.role === 'assistant' ? submitFeedback : undefined
                  }
                  onSendMessage={(text, intentId) => {
                    if (intentId) setRecentIntentIds((prev) => [...prev, intentId].slice(-12));
                    void sendMessage(text, intentId ? { intentId } : undefined);
                  }}
                />
              ))}

              <AITypingIndicator isLoading={isLoading} isStreaming={isStreaming} />

              {error && (
                <div className="flex items-center gap-2 px-4 py-2 mb-4 bg-danger-500/10 text-danger-500 rounded-lg text-sm">
                  <span>&#x26A0;&#xFE0F; {error}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-dark-700 bg-dark-900">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about projects, performance, tasks, documents, finances..."
                    className="w-full px-4 py-2.5 pr-12 rounded-xl border border-dark-600
                      bg-dark-800 text-sm text-white placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50
                      resize-none overflow-hidden transition-colors"
                    rows={1}
                    disabled={isLoading}
                  />
                </div>
                {isStreaming ? (
                  <button
                    onClick={abortStream}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-danger-500 hover:bg-danger-600 text-white transition-colors"
                    title="Stop generating"
                  >
                    <StopCircle size={18} />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-primary-500 hover:bg-primary-600
                      disabled:bg-dark-600 disabled:cursor-not-allowed
                      text-white transition-colors"
                    title="Send message"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1.5 text-center">
                AI answers are based on company data. Always verify critical
                decisions.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

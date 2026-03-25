import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, Minimize2, Maximize2, Trash2 } from 'lucide-react';
import { useDora } from '@/hooks/useDora';

interface DoraCommandPanelProps {
  initialQuery?: string;
}

export function DoraCommandPanel({ initialQuery }: DoraCommandPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    clearChat,
  } = useDora({ initialMessages: [] });

  useEffect(() => {
    if (initialQuery && messages.length === 0 && !isLoading) {
      sendMessage(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || isLoading || isStreaming) return;
    setInput('');
    await sendMessage(q);
  }, [input, isLoading, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      data-testid="dora-command-panel"
      className="rounded-lg border border-app bg-app-card flex flex-col"
      style={{ height: expanded ? '500px' : '280px' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-app">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-semibold text-app">Ask Dora</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearChat} className="p-1 rounded text-app-muted hover:text-app hover:bg-app-hover" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-1 rounded text-app-muted hover:text-app hover:bg-app-hover">
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-app-muted text-xs py-6">
            Ask Dora anything about your business...
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 max-w-[85%] ${
              msg.role === 'user'
                ? 'ml-auto bg-primary-500/20 text-app'
                : 'bg-app-surface-tertiary text-app'
            }`}
          >
            <div className="whitespace-pre-wrap text-xs">{msg.content}</div>
          </div>
        ))}
        {(isLoading || isStreaming) && (
          <div className="flex items-center gap-2 text-xs text-app-muted py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-app">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about finance, sales, OKRs..."
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-app bg-app text-app placeholder:text-app-muted focus:border-primary-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isStreaming}
            className="p-2 rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

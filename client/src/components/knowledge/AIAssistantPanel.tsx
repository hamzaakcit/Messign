import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Send, User, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { knowledgeAPI } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  documents?: Array<{ id: string; title: string; slug: string }>;
}

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  description?: string;
}

export function AIAssistantPanel() {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! I can help you search the knowledge base. Ask a question or enter a keyword.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await knowledgeAPI.search(userId, { q: query });
      const result = res as { docs?: SearchResult[]; data?: { documents?: SearchResult[] } };
      const docs: SearchResult[] = result.docs ?? result.data?.documents ?? [];

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text:
          docs.length > 0
            ? `Found ${docs.length} results for "${query}":`
            : `No results found for "${query}". Try different keywords.`,
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
        })),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'An error occurred. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-app-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              AI Assistant
            </h2>
            <p className="text-xs text-gray-500">
              Smart search in knowledge base
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-400" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-4 py-3',
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-br-md'
                  : 'bg-dark-700 text-gray-300 rounded-bl-md',
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.documents && msg.documents.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.documents.map((doc) => (
                    <Link
                      key={doc.id}
                      to={`/knowledge/${doc.slug}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800 hover:bg-dark-600 transition-colors group"
                    >
                      <FileText className="w-4 h-4 text-gray-500 group-hover:text-primary-400" />
                      <span className="text-sm text-gray-300 group-hover:text-white truncate">
                        {doc.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary-400" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary-400" />
            </div>
            <div className="bg-dark-700 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-app-border">
        <div className="flex items-center gap-3 bg-dark-800 rounded-xl border border-app-border px-4 py-2 focus-within:border-primary-500 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask something in the knowledge base..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              input.trim()
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'bg-dark-700 text-gray-600 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

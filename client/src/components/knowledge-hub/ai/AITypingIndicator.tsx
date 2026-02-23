import { useState, useEffect } from 'react';
import { Bot, Database, Sparkles } from 'lucide-react';

interface AITypingIndicatorProps {
  isLoading: boolean;
  isStreaming: boolean;
}

const THINKING_MESSAGES = [
  { text: 'Analyzing your question...', icon: Sparkles },
  { text: 'Querying company data...', icon: Database },
  { text: 'Synthesizing answer...', icon: Bot },
];

export function AITypingIndicator({ isLoading, isStreaming }: AITypingIndicatorProps) {
  const [messageIdx, setMessageIdx] = useState(0);

  useEffect(() => {
    if (!isLoading || isStreaming) return;
    const interval = setInterval(() => {
      setMessageIdx((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading, isStreaming]);

  useEffect(() => {
    if (isLoading) setMessageIdx(0);
  }, [isLoading]);

  if (!isLoading || isStreaming) return null;

  const current = THINKING_MESSAGES[messageIdx];
  const IconComponent = current.icon;

  return (
    <div className="flex items-start gap-2 mb-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center">
        <Bot size={14} className="text-primary-400" />
      </div>
      <div className="px-4 py-3 bg-dark-800 rounded-2xl rounded-tl-md border border-dark-700">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <IconComponent size={14} className="animate-pulse text-primary-500" />
          <span>{current.text}</span>
          <span className="flex gap-0.5">
            <span
              className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

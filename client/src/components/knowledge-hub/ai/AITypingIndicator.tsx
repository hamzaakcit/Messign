import { ThinkingIndicator } from '@/components/dora/ThinkingIndicator';

interface AITypingIndicatorProps {
  isLoading: boolean;
  isStreaming: boolean;
}

export function AITypingIndicator({ isLoading, isStreaming }: AITypingIndicatorProps) {
  if (!isLoading || isStreaming) return null;

  return (
    <div className="flex justify-start mb-4">
      <ThinkingIndicator />
    </div>
  );
}

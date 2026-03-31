import { ThinkingIndicator } from '@/components/dora/ThinkingIndicator';

interface AITypingIndicatorProps {
  isLoading: boolean;
  isStreaming: boolean;
  /** Use Lucy marks in marketing Lucy rail; default Dora (global chat). */
  brand?: 'dora' | 'lucy';
}

export function AITypingIndicator({ isLoading, isStreaming, brand = 'dora' }: AITypingIndicatorProps) {
  if (!isLoading || isStreaming) return null;

  return (
    <div className="flex justify-start mb-4">
      <ThinkingIndicator brand={brand} />
    </div>
  );
}


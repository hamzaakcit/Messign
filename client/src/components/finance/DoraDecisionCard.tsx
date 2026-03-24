import { cn } from '@/lib/utils';
import { Bot, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { AIScoreBadge } from './AIScoreBadge';

interface DoraDecisionCardProps {
  decisionType: string;
  actionTaken: string;
  confidence: number;
  reasoning: string;
  processingTimeMs?: number;
  modelUsed?: string;
  wasOverridden?: boolean;
  feedbackRating?: number;
  onFeedback?: (rating: number) => void;
  className?: string;
}

export function DoraDecisionCard({
  decisionType,
  actionTaken,
  confidence,
  reasoning,
  processingTimeMs,
  modelUsed,
  wasOverridden,
  feedbackRating,
  onFeedback,
  className,
}: DoraDecisionCardProps) {
  return (
    <div className={cn(
      'rounded-xl border border-primary-500/20 bg-primary-500/5 p-4 space-y-3',
      wasOverridden && 'border-amber-500/20 bg-amber-500/5',
      className,
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary-400" />
          <span className="text-sm font-medium text-app-text capitalize">
            {decisionType.replace(/_/g, ' ')}
          </span>
        </div>
        <AIScoreBadge score={confidence} type="confidence" />
      </div>

      <div className="text-xs text-app-muted bg-app-surface-tertiary rounded-lg p-3">{reasoning}</div>

      <div className="flex items-center justify-between text-xs text-app-muted">
        <div className="flex items-center gap-3">
          <span className="capitalize">{actionTaken.replace(/_/g, ' ')}</span>
          {processingTimeMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {processingTimeMs}ms
            </span>
          )}
          {modelUsed && <span>{modelUsed}</span>}
        </div>

        {wasOverridden && (
          <span className="text-amber-400 font-medium">Overridden</span>
        )}
      </div>

      {onFeedback && (
        <div className="flex items-center gap-2 pt-1 border-t border-app-border">
          <span className="text-xs text-app-muted">Was this helpful?</span>
          <button
            onClick={() => onFeedback(5)}
            className={cn('p-1 rounded', feedbackRating === 5 ? 'text-emerald-400' : 'text-app-muted hover:text-emerald-400')}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onFeedback(1)}
            className={cn('p-1 rounded', feedbackRating === 1 ? 'text-red-400' : 'text-app-muted hover:text-red-400')}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

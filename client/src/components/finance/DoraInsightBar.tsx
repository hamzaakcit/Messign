import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';

interface DoraInsight {
  type: 'info' | 'warning' | 'suggestion' | 'success';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface DoraInsightBarProps {
  insights: DoraInsight[];
  className?: string;
}

export function DoraInsightBar({ insights, className }: DoraInsightBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || insights.length === 0) return null;

  const typeColors = {
    info: 'border-primary-500/30 bg-primary-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    suggestion: 'border-purple-500/30 bg-purple-500/5',
    success: 'border-emerald-500/30 bg-emerald-500/5',
  };

  const textColors = {
    info: 'text-primary-400',
    warning: 'text-amber-400',
    suggestion: 'text-purple-400',
    success: 'text-emerald-400',
  };

  const primaryInsight = insights[0];

  return (
    <div className={cn(
      'rounded-xl border backdrop-blur-sm transition-all',
      typeColors[primaryInsight.type],
      className,
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Sparkles className={cn('h-4 w-4 shrink-0', textColors[primaryInsight.type])} />
        <div className="flex-1 min-w-0">
          <span className={cn('text-sm font-medium', textColors[primaryInsight.type])}>
            {primaryInsight.title}
          </span>
          <span className="text-sm text-app-muted ml-2">{primaryInsight.message}</span>
        </div>
        {primaryInsight.actionLabel && primaryInsight.onAction && (
          <button
            onClick={primaryInsight.onAction}
            className={cn('px-3 py-1 rounded-lg text-xs font-medium border', textColors[primaryInsight.type], 'border-current/20 hover:bg-white/5')}
          >
            {primaryInsight.actionLabel}
          </button>
        )}
        {insights.length > 1 && (
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-app-muted hover:text-app-text" aria-label={expanded ? 'Collapse insight' : 'Expand insight'}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
        <button onClick={() => setDismissed(true)} className="p-1 text-app-muted hover:text-app-text" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && insights.length > 1 && (
        <div className="border-t border-white/10 px-4 py-2 space-y-2">
          {insights.slice(1).map((insight, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className={cn('h-1.5 w-1.5 rounded-full', textColors[insight.type].replace('text-', 'bg-'))} />
              <span className={cn('font-medium', textColors[insight.type])}>{insight.title}</span>
              <span className="text-app-muted">{insight.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

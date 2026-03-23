import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react';
import { CHANNEL_LABELS } from '../lib/batchUtils';

interface BatchChannelRowProps {
  channel: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  contentId?: string | null;
  error?: string;
  onRetry?: () => void;
  onNavigateToContent?: (contentId: string) => void;
  isRetrying?: boolean;
}

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    iconClass: 'text-slate-500',
    label: 'Waiting',
    labelClass: 'text-slate-500',
  },
  processing: {
    icon: Loader2,
    iconClass: 'text-blue-400 animate-spin',
    label: 'Generating…',
    labelClass: 'text-blue-400',
  },
  completed: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
    label: 'Done',
    labelClass: 'text-emerald-400',
  },
  failed: {
    icon: XCircle,
    iconClass: 'text-red-400',
    label: 'Failed',
    labelClass: 'text-red-400',
  },
} as const;

export function BatchChannelRow({
  channel,
  status,
  contentId,
  error,
  onRetry,
  onNavigateToContent,
  isRetrying,
}: BatchChannelRowProps) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const label = CHANNEL_LABELS[channel] || channel;

  return (
    <div className="flex items-center justify-between py-2 px-1 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${cfg.iconClass}`} />
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-slate-200">{label}</span>
          <span className={`ml-2 text-[11px] ${cfg.labelClass}`}>{cfg.label}</span>
          {error && status === 'failed' && (
            <p className="text-[10px] text-red-400/70 truncate mt-0.5">{error}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status === 'completed' && contentId && onNavigateToContent && (
          <button
            type="button"
            onClick={() => onNavigateToContent(contentId)}
            className="text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
          >
            View content
          </button>
        )}
        {status === 'failed' && onRetry && (
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {isRetrying && <Loader2 className="w-3 h-3 animate-spin" />}
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

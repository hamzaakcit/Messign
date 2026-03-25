import { useEffect, useState } from 'react';
import { ListChecks, ExternalLink, Clock, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { chatAPI } from '@/lib/api';
import type { EmbeddedTaskCard as TaskCardType } from '@/types';
import { cn } from '@/lib/utils';

interface EmbeddedTaskCardProps {
  refId: string;
  channelId: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  todo: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'To Do' },
  in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'In Progress' },
  review: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Review' },
  done: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Done' },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  urgent: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

export function EmbeddedTaskCard({ refId, channelId }: EmbeddedTaskCardProps) {
  const [card, setCard] = useState<TaskCardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    chatAPI.resolveEmbed(channelId, 'task', refId)
      .then((data) => {
        if (!cancelled && data?.type === 'task') setCard(data as TaskCardType);
        else if (!cancelled) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refId, channelId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-app bg-app-hover/30 text-sm text-app-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading task...
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">
        <AlertTriangle className="w-4 h-4" /> Failed to load task
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[card.status] ?? STATUS_STYLES.todo;
  const priorityStyle = PRIORITY_STYLES[card.priority] ?? PRIORITY_STYLES.medium;

  return (
    <div className="rounded-xl border border-primary-500/20 bg-gradient-to-r from-primary-500/5 to-transparent overflow-hidden max-w-md">
      <div className="px-3 py-2 border-b border-primary-500/10 flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-primary-400" />
        <span className="text-[11px] font-semibold text-primary-400 uppercase tracking-wider">Task</span>
        <span className="text-[11px] text-app-muted">· {card.projectName}</span>
        <a href="/projects" className="ml-auto text-app-muted hover:text-primary-400 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="px-3 py-2.5">
        <h4 className="text-sm font-semibold text-app mb-1.5">{card.title}</h4>
        <div className="flex items-center flex-wrap gap-2">
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', statusStyle.bg, statusStyle.text)}>
            {statusStyle.label}
          </span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', priorityStyle.bg, priorityStyle.text)}>
            {card.priority}
          </span>
          {card.xpReward > 0 && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400 text-[10px] font-medium">
              <Zap className="w-2.5 h-2.5" /> {card.xpReward} XP
            </span>
          )}
          {card.dueDate && (
            <span className="flex items-center gap-0.5 text-[11px] text-app-muted">
              <Clock className="w-3 h-3" /> {new Date(card.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
        {card.assigneeNames.length > 0 && (
          <div className="mt-1.5 text-[11px] text-app-muted">
            Assigned to: {card.assigneeNames.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

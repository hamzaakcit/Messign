import { Trophy } from 'lucide-react';
import { DoraWidgetShell } from './DoraWidgetShell';
import type { LeaderboardData, LeaderboardEntry } from '@/types/knowledge-hub/ai';
import type { DoraBlockProps } from '@/types/dora/dynamic-blocks';

function TrendIcon({ trend }: { trend?: LeaderboardEntry['trend'] }) {
  if (!trend || trend === 'flat') return null;
  const c = trend === 'up' ? '#86efac' : '#fca5a5';
  return (
    <span style={{ color: c }} aria-hidden>
      {trend === 'up' ? '▲' : '▼'}
    </span>
  );
}

export interface LeaderboardListProps {
  block: DoraBlockProps<LeaderboardData>;
  delay?: number;
}

export function LeaderboardList({ block, delay = 0 }: LeaderboardListProps) {
  const { data } = block;
  const max = data.maxRows ?? 10;
  const entries = data.entries ?? [];
  const shown = entries.slice(0, max);
  const overflow = entries.length - shown.length;

  if (entries.length === 0) {
    return (
      <DoraWidgetShell
        title={data.title || 'Leaderboard'}
        icon={<Trophy size={16} className="text-amber-400 opacity-90" aria-hidden />}
        subtitle={data.metricLabel}
        delay={delay}
        accentGradient="linear-gradient(90deg, #f59e0b, #8b5cf6)"
      >
        <p className="text-sm dora-font" style={{ color: 'var(--dora-text-2, #cbd5e1)' }}>
          {data.emptyMessage ?? 'No entries yet.'}
        </p>
      </DoraWidgetShell>
    );
  }

  const dense = data.variant === 'compact';

  return (
    <DoraWidgetShell
      title={data.title || 'Leaderboard'}
      icon={<Trophy size={16} className="text-amber-400 opacity-90" aria-hidden />}
      subtitle={data.metricLabel}
      delay={delay}
      accentGradient="linear-gradient(90deg, #f59e0b, #8b5cf6)"
    >
      <ol
        className={`dora-font space-y-0 ${dense ? 'text-xs' : 'text-sm'}`}
        role="list"
        aria-label={data.title || 'Leaderboard rankings'}
      >
        {shown.map((e) => (
          <li
            key={`${e.rank}-${e.userId ?? e.name}`}
            className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                color: 'var(--dora-text-1, #f1f5f9)',
              }}
              aria-label={`Rank ${e.rank}`}
            >
              {e.rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" style={{ color: 'var(--dora-text-1, #f1f5f9)' }}>
                {e.name}
              </div>
              {e.subtitle && (
                <div className="truncate text-xs dora-chat-text-tertiary">{e.subtitle}</div>
              )}
            </div>
            <div
              className="flex shrink-0 items-center gap-1 font-mono text-xs"
              style={{ color: 'var(--dora-text-2, #cbd5e1)' }}
              aria-label={`${data.metricLabel || 'Score'}: ${e.value}`}
            >
              <TrendIcon trend={e.trend} />
              <span>{e.value}</span>
            </div>
          </li>
        ))}
      </ol>
      {overflow > 0 && (
        <p className="mt-2 text-xs dora-chat-text-tertiary">+ {overflow} more</p>
      )}
    </DoraWidgetShell>
  );
}

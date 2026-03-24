import { Avatar } from '@/components/ui';
import type { TeamMemberWholesale } from '@/types/performance';
import { Eye, Pencil, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WholesaleTeamTableProps {
  members: TeamMemberWholesale[];
  onAction?: (memberId: string, action: 'view' | 'edit' | 'more') => void;
}

const statusColors: Record<string, string> = {
  exceeding: 'bg-green-500/20 text-green-400 border-green-500/30',
  on_target: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  needs_attention: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  below_target: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function targetColor(pct: number): string {
  if (pct >= 100) return 'text-green-500';
  if (pct >= 90) return 'text-yellow-500';
  return 'text-red-500';
}

function rateBadge(rate: number): string {
  if (rate >= 98) return 'bg-green-500/20 text-green-400';
  if (rate >= 95) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

export function WholesaleTeamTable({ members, onAction }: WholesaleTeamTableProps) {
  return (
    <div className="rounded-xl border border-app-border overflow-hidden bg-app-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]" role="table" aria-label="Wholesale SMS team members">
          <thead>
            <tr className="bg-app-surface-tertiary border-b border-app-border">
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[50px]">Rank</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[200px]">Member</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[120px]">Revenue</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[100px]">SMS</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[80px]">Del.</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[80px]">Resp.</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[80px]">Cost</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[100px]">Status</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[70px]">Trend</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-app-border hover:bg-app-nav-hover transition-colors">
                <td className="py-2 px-3">
                  {m.rank <= 3 ? (
                    <span className="text-lg" aria-label={`Rank ${m.rank}`}>
                      {m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-app-surface-tertiary text-app text-sm font-medium">
                      {m.rank}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <Avatar src={m.avatar} name={m.name} size="sm" showStatus={false} className="shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-app">{m.name}</p>
                      <p className="text-xs text-app-muted">{m.role}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3">
                  <p className="font-medium text-sm text-app">{m.metrics.revenue.formatted}</p>
                  <p className={cn('text-xs', targetColor(m.metrics.revenue.targetPercent))}>
                    {m.metrics.revenue.targetPercent}% vs target
                  </p>
                </td>
                <td className="py-2 px-3 text-app">{m.metrics.smsVolume.formatted}</td>
                <td className="py-2 px-3">
                  <span className={cn('inline-block px-2 py-0.5 rounded text-xs', rateBadge(m.metrics.smsVolume.deliveryRate))}>
                    {m.metrics.smsVolume.deliveryRate}%
                  </span>
                </td>
                <td className="py-2 px-3 text-app">{m.metrics.smsVolume.responseRate}%</td>
                <td className="py-2 px-3 text-app font-mono text-xs">${m.metrics.smsVolume.costPerSMS.toFixed(4)}</td>
                <td className="py-2 px-3">
                  <span className={cn('inline-flex px-2 py-1 rounded text-xs font-medium border', statusColors[m.status] ?? 'bg-app-surface-tertiary text-app-muted')}>
                    {m.statusLabel}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={m.metrics.revenue.trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}>
                    {m.metrics.revenue.trend.direction === 'up' ? '↑' : '↓'} {Math.abs(m.metrics.revenue.trend.percent)}%
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAction?.(m.id, 'view')}
                      className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover focus:ring-2 focus:ring-primary-500"
                      aria-label="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction?.(m.id, 'edit')}
                      className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover focus:ring-2 focus:ring-primary-500"
                      aria-label="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAction?.(m.id, 'more')}
                      className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover focus:ring-2 focus:ring-primary-500"
                      aria-label="More options"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

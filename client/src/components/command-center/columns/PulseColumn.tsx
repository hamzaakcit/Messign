import { memo } from 'react';
import { Activity } from 'lucide-react';
import type { CommandCenterDeepDiveKind, CommandCenterPulse } from '@/types/command-center';
import { CommandCenterColumnHeader } from '../CommandCenterColumnHeader';
import { CompactKpiCard } from '../cards/CompactKpiCard';
import { TrendArea } from '../charts/TrendArea';
import { MiniSparkline } from '../charts/MiniSparkline';

interface PulseColumnProps {
  pulse: CommandCenterPulse | null;
  insight: string;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onQuickAddTask: () => void;
}

export const PulseColumn = memo(function PulseColumn({
  pulse,
  insight,
  onOpenDeepDive,
  onQuickAddTask,
}: PulseColumnProps): JSX.Element {
  if (!pulse) {
    return (
      <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
        <CommandCenterColumnHeader title="The Pulse" insight={insight} />
        <p className="text-xs text-app-muted">Loading operations…</p>
      </div>
    );
  }

  const spark = pulse.velocityTrend.map((p) => p.count);

  return (
    <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
      <CommandCenterColumnHeader title="The Pulse" insight={insight} icon={<Activity className="w-3.5 h-3.5 text-cyan-400" />} />

      <CompactKpiCard
        label="Active projects"
        value={String(pulse.activeProjects)}
        sub="Boards in motion"
        deltaPct={pulse.velocityDeltaPct ?? undefined}
        onClick={() => onOpenDeepDive({ kind: 'pulse_velocity' })}
        onQuickAdd={onQuickAddTask}
        chart={<MiniSparkline data={spark.length ? spark : [0]} color="#22d3ee" />}
      />

      <CompactKpiCard
        label="Tasks this week"
        value={String(pulse.tasksCompletedThisWeek)}
        sub="Completed (7d)"
        onClick={() => onOpenDeepDive({ kind: 'pulse_velocity' })}
        chart={<TrendArea points={pulse.velocityTrend} />}
      />

      <CompactKpiCard
        label="Blocked"
        value={String(pulse.blockedTasks)}
        sub="Needs unblock"
        onClick={() => onOpenDeepDive({ kind: 'pulse_blockers' })}
        onQuickAdd={onQuickAddTask}
      />

      <CompactKpiCard
        label="Velocity index"
        value={`${pulse.avgSprintVelocity.toFixed(0)}%`}
        sub="Avg completion across boards"
        onClick={() => onOpenDeepDive({ kind: 'pulse_velocity' })}
      />
    </div>
  );
});

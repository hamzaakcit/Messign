import type { CommandCenterFuture, CommandCenterPulse, WorkspaceModuleSnapshots } from '@/types/command-center';
import { BentoCard } from './BentoCard';

interface GlobalPulseModuleProps {
  pulse: CommandCenterPulse;
  future: CommandCenterFuture;
  chat: WorkspaceModuleSnapshots['chat'];
}

/**
 * Composite org pulse: delivery + OKR + chat activity.
 * Server health / active user counts are not in CommandCenterDTO — UI placeholder only.
 */
export function GlobalPulseModule({ pulse, future, chat }: GlobalPulseModuleProps): JSX.Element {
  const okrPct = future.okrs.overallProgress;
  const messages7d = chat.ok ? chat.data.messagesLast7Days : '—';
  const channels = chat.ok ? chat.data.channelsJoined : '—';

  return (
    <BentoCard title="Global pulse">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
        <div className="rounded-md bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
          <p className="text-[9px] text-app-muted uppercase tracking-wide">Projects</p>
          <p className="font-mono tabular-nums text-app-text">{pulse.activeProjects}</p>
        </div>
        <div className="rounded-md bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
          <p className="text-[9px] text-app-muted uppercase tracking-wide">Done 7d</p>
          <p className="font-mono tabular-nums text-app-text">{pulse.tasksCompletedThisWeek}</p>
        </div>
        <div className="rounded-md bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
          <p className="text-[9px] text-app-muted uppercase tracking-wide">OKR avg</p>
          <p className="font-mono tabular-nums text-app-text">{okrPct.toFixed(0)}%</p>
        </div>
        <div className="rounded-md bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
          <p className="text-[9px] text-app-muted uppercase tracking-wide">Chat 7d</p>
          <p className="font-mono tabular-nums text-app-text">{messages7d}</p>
        </div>
      </div>
      <p className="text-[9px] text-app-muted mt-1.5 pt-1 border-t border-white/[0.06]">
        Channels joined: <span className="text-app-text tabular-nums">{channels}</span>
      </p>
      <p className="text-[9px] text-app-muted/80 mt-1 leading-tight">
        {/* TODO: backend — expose server health + concurrent active users for Command Center DTO */}
        Service status: snapshot only (integrate ops metrics).
      </p>
    </BentoCard>
  );
}

import type { CommandCenterDTO } from '@/types/command-center';

export interface ColumnInsight {
  column: 'pulse' | 'brain' | 'growth' | 'future';
  message: string;
}

/**
 * Deterministic one-line insights per column from dashboard data (no LLM).
 */
export function buildColumnInsights(data: CommandCenterDTO | null): Record<string, string> {
  if (!data) {
    return {
      pulse: 'Loading operations snapshot…',
      brain: 'Loading knowledge and AI context…',
      growth: 'Loading team momentum…',
      future: 'Loading goals and horizon…',
    };
  }

  const { pulse, brain, growth, future } = data;

  const pulseMsg =
    pulse.blockedTasks > 0
      ? `Ops: ${pulse.blockedTasks} blocked task${pulse.blockedTasks === 1 ? '' : 's'} need attention.`
      : pulse.velocityDeltaPct != null && pulse.velocityDeltaPct < 0
        ? `Velocity is ${pulse.velocityDeltaPct}% vs last week—consider unblocking work.`
        : `Velocity steady: ${pulse.tasksCompletedThisWeek} tasks completed this week.`;

  const brainMsg =
    brain.doraUnreadCount > 0
      ? `${brain.doraUnreadCount} unread Dora insight${brain.doraUnreadCount === 1 ? '' : 's'}—review in Brain.`
      : brain.publishedDocCount > 0
        ? `${brain.publishedDocCount} published docs in Knowledge Hub.`
        : 'Knowledge Hub is ready for your next search.';

  const growthMsg =
    growth.vibeScore != null
      ? `Team vibe index ${growth.vibeScore.toFixed(0)} (${growth.engagementTrend}).`
      : growth.myRank != null
        ? `You are #${growth.myRank} on the XP board with ${growth.myXp} XP.`
        : 'XP leaderboard reflects recent collaboration.';

  const futureMsg =
    future.okrs.atRisk + future.okrs.behind > 0
      ? `${future.okrs.atRisk + future.okrs.behind} OKR goal(s) need a check-in.`
      : future.milestones.length > 0
        ? `${future.milestones.length} upcoming period milestone(s) on the horizon.`
        : 'OKRs are tracking—keep momentum on strategic goals.';

  return {
    pulse: pulseMsg,
    brain: brainMsg,
    growth: growthMsg,
    future: futureMsg,
  };
}

/** Mirrors server `CommandCenterDTO` from GET /api/dashboard/command-center */

export interface CommandCenterPulse {
  activeProjects: number;
  tasksCompletedThisWeek: number;
  blockedTasks: number;
  avgSprintVelocity: number;
  velocityDeltaPct: number | null;
  velocityTrend: { date: string; count: number }[];
  blockers: { id: string; title: string; projectName: string | null }[];
}

export interface CommandCenterBrain {
  todayFocus: string | null;
  doraUnreadCount: number;
  knowledgeRecent: { id: string; title: string; slug: string; updatedAt: string }[];
  publishedDocCount: number;
}

export interface CommandCenterGrowth {
  leaderboard: { rank: number; userId: string; name: string; xp: number; avatar: string | null }[];
  myRank: number | null;
  myXp: number;
  vibeScore: number | null;
  engagementTrend: string;
  cultureHealth: number | null;
  xpRadar: { label: string; value: number }[];
}

export interface CommandCenterFuture {
  okrs: {
    overallProgress: number;
    onTrack: number;
    atRisk: number;
    behind: number;
  };
  milestones: { title: string; dueDate: string | null }[];
  sandboxIdeas: { id: string; title: string; createdAt: string }[];
}

export interface CommandCenterDTO {
  generatedAt: string;
  pulse: CommandCenterPulse;
  brain: CommandCenterBrain;
  growth: CommandCenterGrowth;
  future: CommandCenterFuture;
}

export type CommandCenterColumnId = 'pulse' | 'brain' | 'growth' | 'future';

export type CommandCenterDeepDiveKind =
  | { kind: 'pulse_velocity' }
  | { kind: 'pulse_blockers' }
  | { kind: 'brain_knowledge' }
  | { kind: 'growth_leaderboard' }
  | { kind: 'growth_radar' }
  | { kind: 'future_okrs' }
  | { kind: 'future_milestones' };

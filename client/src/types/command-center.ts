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

export type WorkspaceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface WorkspaceCrmSnapshot {
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  avgCycleTimeDays: number;
}

export interface WorkspaceHrSnapshot {
  openPositions: number;
  activeApplicants: number;
  offerAcceptanceRate: number;
  avgTimeToHireDays: number;
  funnel: {
    applied: number;
    screening: number;
    interviewing: number;
    offer: number;
    hired: number;
  };
  upcomingInterviewCount: number;
}

export interface WorkspaceSupportSnapshot {
  openTickets: number;
  avgResolutionHours: number;
  csatScore: number;
  slaCompliancePercent: number;
  ticketTrend: { date: string; openCount: number; resolvedCount: number }[];
}

export interface WorkspaceMarketingSnapshot {
  activeCampaigns: number;
  totalLeads: number;
  contentPublished: number;
  emailOpenRate: number;
  monthlyLeadsTrend: { month: string; leads: number }[];
}

export interface WorkspaceAssetsSnapshot {
  totalAssets: number;
  assigned: number;
  available: number;
  warrantyExpiring: number;
}

export interface WorkspaceContractsSnapshot {
  totalActive: number;
  expiringThisMonth: number;
  renewalsNeeded: number;
  complianceDue: number;
}

export interface WorkspaceOkrSnapshot {
  totalGoals: number;
  onTrack: number;
  atRisk: number;
  behind: number;
  completed: number;
  avgProgress: number;
}

export interface WorkspaceChatSnapshot {
  channelsJoined: number;
  messagesLast7Days: number;
  messagesByDay: { date: string; count: number }[];
}

export interface WorkspaceModuleSnapshots {
  crm: WorkspaceResult<WorkspaceCrmSnapshot>;
  hr: WorkspaceResult<WorkspaceHrSnapshot>;
  support: WorkspaceResult<WorkspaceSupportSnapshot>;
  marketing: WorkspaceResult<WorkspaceMarketingSnapshot>;
  assets: WorkspaceResult<WorkspaceAssetsSnapshot>;
  contracts: WorkspaceResult<WorkspaceContractsSnapshot>;
  okr: WorkspaceResult<WorkspaceOkrSnapshot>;
  chat: WorkspaceResult<WorkspaceChatSnapshot>;
}

/** Keys for workspace tiles and drill-down slide-overs. */
export type WorkspaceModuleKey = keyof WorkspaceModuleSnapshots;

export interface CommandCenterDTO {
  generatedAt: string;
  pulse: CommandCenterPulse;
  brain: CommandCenterBrain;
  growth: CommandCenterGrowth;
  future: CommandCenterFuture;
  workspace: WorkspaceModuleSnapshots;
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

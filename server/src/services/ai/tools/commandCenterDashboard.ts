/**
 * Tool: dashboard:get_command_center
 *
 * Same aggregate as GET /api/dashboard/command-center — Command Center (main home dashboard).
 */

import { getCommandCenterData, type CommandCenterDTO } from '../../../dal/commandCenter.js';
import type { CallerContext } from '../../../dal/types.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

function toCallerContext(ctx: ToolContext): CallerContext {
  return {
    userId: ctx.userId,
    userUuid: ctx.userUuid,
    role: (ctx.userRole as CallerContext['role']) || 'employee',
    teamId: ctx.teamId ?? undefined,
    organizationId: ctx.organizationId ?? undefined,
  };
}

/**
 * Formats Command Center DTO into a markdown-style summary for the synthesis LLM.
 *
 * @param data - Snapshot from getCommandCenterData
 * @returns Human-readable summary of Pulse, Brain, Growth, and Future columns
 */
export function formatCommandCenterSummary(data: CommandCenterDTO): string {
  const { pulse, brain, growth, future } = data;
  const vel =
    pulse.velocityDeltaPct === null ? 'n/a' : `${pulse.velocityDeltaPct > 0 ? '+' : ''}${pulse.velocityDeltaPct}%`;

  const blockersLines =
    pulse.blockers.length === 0
      ? '- None listed'
      : pulse.blockers
          .slice(0, 8)
          .map((b) => `- **${b.title}**${b.projectName ? ` (${b.projectName})` : ''}`)
          .join('\n');

  const topLb = growth.leaderboard
    .slice(0, 5)
    .map((e) => `${e.rank}. ${e.name} — ${e.xp} XP`)
    .join('\n');

  const milestonesLines =
    future.milestones.length === 0
      ? '- None upcoming'
      : future.milestones
          .slice(0, 6)
          .map((m) => `- ${m.title}${m.dueDate ? ` (due ${m.dueDate})` : ''}`)
          .join('\n');

  const recentDocs =
    brain.knowledgeRecent.length === 0
      ? '- No recent docs'
      : brain.knowledgeRecent
          .slice(0, 4)
          .map((d) => `- ${d.title}`)
          .join('\n');

  return (
    `**Command Center** (main dashboard, generated ${data.generatedAt})\n\n` +
    `### The Pulse\n` +
    `- Active projects: **${pulse.activeProjects}**\n` +
    `- Tasks completed this week: **${pulse.tasksCompletedThisWeek}**\n` +
    `- Blocked tasks (count): **${pulse.blockedTasks}**\n` +
    `- Avg sprint velocity: **${pulse.avgSprintVelocity}**\n` +
    `- Week-over-week velocity change: **${vel}**\n` +
    `- Blocker details:\n${blockersLines}\n\n` +
    `### The Brain\n` +
    `- Today's focus: ${brain.todayFocus ?? 'Not set'}\n` +
    `- Unread Dora insights: **${brain.doraUnreadCount}**\n` +
    `- Published knowledge docs (total): **${brain.publishedDocCount}**\n` +
    `- Recent knowledge:\n${recentDocs}\n\n` +
    `### The Growth\n` +
    `- Your XP: **${growth.myXp}**${growth.myRank != null ? ` | Rank: **#${growth.myRank}**` : ''}\n` +
    `- Culture health: ${growth.cultureHealth != null ? `**${growth.cultureHealth}**` : 'n/a'} | Vibe: ${growth.vibeScore != null ? `**${growth.vibeScore}**` : 'n/a'} | Engagement: **${growth.engagementTrend}**\n` +
    `- Leaderboard (top 5):\n${topLb || 'No entries'}\n\n` +
    `### The Future\n` +
    `- OKR progress: **${future.okrs.overallProgress}%** overall | On track: **${future.okrs.onTrack}** | At risk: **${future.okrs.atRisk}** | Behind: **${future.okrs.behind}**\n` +
    `- Upcoming milestones:\n${milestonesLines}`
  );
}

const commandCenterDashboardTool: Tool = {
  name: 'dashboard:get_command_center',
  category: 'analytics',

  metadata: {
    namespace: 'dashboard',
    name: 'get_command_center',
    summary: 'Main home dashboard: Pulse, Brain, Growth, Future (same data as the Command Center UI).',
    tags: ['dashboard', 'command center', 'metrics', 'pulse', 'kpis', 'overview'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },

  description: `Get the main Messign home dashboard snapshot — the same four columns users see on the Dashboard: **The Pulse** (projects, velocity, blockers), **The Brain** (today's focus, Dora unread, knowledge), **The Growth** (XP, leaderboard, culture), **The Future** (OKRs, milestones).

Use this tool when someone asks:
- "What are my dashboard metrics?" or "What's on the dashboard?"
- "Summarize the command center" or "main dashboard numbers"
- "Pulse / Brain / Growth / Future" metrics
- "What does the home screen show?" regarding company pulse and OKRs

Prefer this over generic system stats when they mean the **main Dashboard page** they are looking at.`,

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (!context.organizationId) {
      return {
        success: false,
        data: null,
        summary: 'Organization context is required to load the Command Center. Try again from a logged-in session with a workspace selected.',
      };
    }

    try {
      const data = await getCommandCenterData(toCallerContext(context));
      const summary = formatCommandCenterSummary(data);
      return {
        success: true,
        data,
        summary,
        metadata: { source: 'command_center_dashboard' },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        data: null,
        summary: `Could not load the Command Center: ${msg}`,
      };
    }
  },
};

registerTool(commandCenterDashboardTool);
export default commandCenterDashboardTool;

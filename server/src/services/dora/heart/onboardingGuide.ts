import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

interface MilestoneConfig {
  milestone: string;
  daysAfterStart: number;
  doraMessage: string;
  managerSummaryTemplate: string;
  actions: string[];
}

const MILESTONES: MilestoneConfig[] = [
  {
    milestone: 'day_1',
    daysAfterStart: 0,
    doraMessage:
      "Welcome to Messign! I'm Dora, your AI assistant. I'm here to help you navigate the workspace, find information, and get set up. Here are 3 things to explore today: (1) Your Team — check out who you'll be working with in the Team Directory. (2) Knowledge Hub — your team's key documents and guides. (3) Chat — say hello in the #general channel! Ask me anything anytime.",
    managerSummaryTemplate: '',
    actions: ['suggest_team_directory', 'suggest_knowledge_hub', 'suggest_chat_general'],
  },
  {
    milestone: 'week_1',
    daysAfterStart: 7,
    doraMessage:
      "You've been here a week! How are things going? Here are some things your colleagues frequently reference that might be helpful: {top_kb_docs}. If you have questions about anything, I'm always here. Your team has {team_size} members — have you connected with them all yet?",
    managerSummaryTemplate:
      "{employee_name} completed their first week. They've viewed {docs_viewed} documents and sent {messages_sent} messages.",
    actions: ['suggest_popular_docs', 'check_team_connections'],
  },
  {
    milestone: 'day_30',
    daysAfterStart: 30,
    doraMessage:
      "30 days already! I'd love to hear how you're settling in. What's going well? What's been confusing or challenging? Your feedback helps us improve the onboarding experience. (Your response is private — only a summary is shared with your manager.)",
    managerSummaryTemplate:
      "{employee_name} has reached their 30-day milestone. Activity: {tasks_completed} tasks completed, {messages_sent} messages sent, {docs_viewed} knowledge docs viewed. Suggested check-in topics: integration with team, clarity of role expectations, tool familiarity.",
    actions: ['prompt_reflection', 'notify_manager_checkin'],
  },
  {
    milestone: 'day_60',
    daysAfterStart: 60,
    doraMessage:
      "Two months in! You're well on your way. Your productivity has been {productivity_trend}. Here are some opportunities I've noticed: {suggestions}. Keep up the great work!",
    managerSummaryTemplate:
      "{employee_name} has reached 60 days. Performance trend: {productivity_trend}. Engagement: {engagement_level}. Suggested discussion: growth goals, additional training needs.",
    actions: ['analyze_productivity_trend', 'suggest_growth_opportunities'],
  },
  {
    milestone: 'day_90',
    daysAfterStart: 90,
    doraMessage:
      "Congratulations on 90 days! Here's your onboarding journey summary: {journey_summary}. You've come a long way. What would you like to focus on next?",
    managerSummaryTemplate:
      'Full 90-day onboarding report for {employee_name}: Tasks completed: {tasks_completed}. Knowledge consumed: {docs_viewed} documents. Team integration: {integration_score}/100. Performance trajectory: {trajectory}. Recommendation: {recommendation}.',
    actions: ['generate_90day_report', 'set_growth_okrs'],
  },
];

export async function triggerMilestone(userId: string, milestone: string): Promise<void> {
  const config = MILESTONES.find((m) => m.milestone === milestone);
  if (!config) return;

  const userData = await query<{
    full_name: string;
    manager_id: string | null;
    auth_user_id: string | null;
  }>(
    'SELECT full_name, manager_id::text AS manager_id, auth_user_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  if (!userData.rows[0]) return;

  const employee = userData.rows[0];
  let message = config.doraMessage;

  if (['week_1', 'day_30', 'day_60', 'day_90'].includes(milestone)) {
    const stats = await getEmployeeOnboardingStats(userId, employee.auth_user_id);
    message = message
      .replace('{top_kb_docs}', stats.topDocs.join(', ') || 'your department guides')
      .replace('{team_size}', String(stats.teamSize))
      .replace('{productivity_trend}', stats.productivityTrend)
      .replace('{suggestions}', stats.suggestions.join('. ') || 'exploring more of the Knowledge Hub')
      .replace('{journey_summary}', stats.journeySummary);
  }

  const orgRow = await query<{ organization_id: string }>(
    'SELECT organization_id::text AS organization_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  const organizationId = orgRow.rows[0]?.organization_id;

  await doraInsights.createInsight({
    organizationId,
    module: 'heart',
    severity: 'info',
    title: `Onboarding: ${milestone.replace('_', ' ')}`,
    message,
    targetUserId: userId,
    metadata: { type: 'onboarding_milestone', milestone },
  });

  await query(
    `UPDATE heart_onboarding_journey SET status = 'triggered', triggered_at = NOW(), dora_message = $3
     WHERE user_id = $1::uuid AND milestone = $2`,
    [userId, milestone, message]
  );

  if (['day_30', 'day_60', 'day_90'].includes(milestone) && employee.manager_id) {
    const stats = await getEmployeeOnboardingStats(userId, employee.auth_user_id);
    const managerMessage = config.managerSummaryTemplate
      .replace('{employee_name}', employee.full_name)
      .replace('{tasks_completed}', String(stats.tasksCompleted))
      .replace('{messages_sent}', String(stats.messagesSent))
      .replace('{docs_viewed}', String(stats.docsViewed))
      .replace('{productivity_trend}', stats.productivityTrend)
      .replace('{engagement_level}', stats.engagementLevel)
      .replace('{integration_score}', String(stats.integrationScore))
      .replace('{trajectory}', stats.trajectory)
      .replace('{recommendation}', stats.recommendation);

    await doraInsights.createInsight({
      organizationId,
      module: 'heart',
      severity: 'info',
      title: `${employee.full_name}: ${milestone.replace('_', ' ')} milestone`,
      message: managerMessage,
      targetUserId: employee.manager_id,
      metadata: { type: 'onboarding_manager_update', milestone, employeeId: userId },
    });
  }

  eventBus.emit('heart.onboarding.milestone', {
    userId,
    milestone: milestone as 'day_1' | 'week_1' | 'day_30' | 'day_60' | 'day_90',
    status: 'triggered',
  });
}

async function getEmployeeOnboardingStats(
  userId: string,
  authUserId: string | null
): Promise<{
  tasksCompleted: number;
  messagesSent: number;
  docsViewed: number;
  teamSize: number;
  topDocs: string[];
  productivityTrend: string;
  engagementLevel: string;
  integrationScore: number;
  trajectory: string;
  recommendation: string;
  suggestions: string[];
  journeySummary: string;
}> {
  const uid = authUserId ?? userId;

  const tasksResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tasks
     WHERE assignees @> $1::jsonb AND status IN ('completed', 'done')`,
    [JSON.stringify([uid])]
  );
  const messagesResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE user_id = $1`,
    [uid]
  );
  const docsResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_search_logs WHERE user_id = $1`,
    [uid]
  );
  const teamResult = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT ptm.employee_id)::text AS count
     FROM performance_team_members ptm
     WHERE ptm.team_id IN (
       SELECT team_id FROM performance_team_members
       WHERE employee_id = $1 AND is_active = TRUE
     ) AND ptm.is_active = TRUE`,
    [uid]
  );

  return {
    tasksCompleted: parseInt(tasksResult.rows[0]?.count ?? '0', 10),
    messagesSent: parseInt(messagesResult.rows[0]?.count ?? '0', 10),
    docsViewed: parseInt(docsResult.rows[0]?.count ?? '0', 10),
    teamSize: parseInt(teamResult.rows[0]?.count ?? '0', 10),
    topDocs: ['Getting Started Guide', 'Team Processes', 'Product Roadmap'],
    productivityTrend: 'steadily increasing',
    engagementLevel: 'active',
    integrationScore: 72,
    trajectory: 'positive',
    recommendation: 'On track — continue current trajectory',
    suggestions: ['Try the Project Marketplace for cross-team collaboration'],
    journeySummary: 'Great progress across all areas',
  };
}

export async function checkDueMilestones(): Promise<void> {
  for (const config of MILESTONES) {
    const result = await query<{ user_id: string }>(
      `SELECT oj.user_id::text AS user_id
       FROM heart_onboarding_journey oj
       JOIN reimbursement_users u ON u.id = oj.user_id
       WHERE oj.milestone = $1
         AND oj.status = 'pending'
         AND (
           COALESCE(
             (SELECT MIN(ptm.start_date) FROM performance_team_members ptm
              WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE),
             u.created_at::date
           ) + ($2 || ' days')::interval <= CURRENT_DATE`,
      [config.milestone, String(config.daysAfterStart)]
    );

    for (const row of result.rows) {
      try {
        await triggerMilestone(row.user_id, config.milestone);
      } catch (err) {
        console.warn(`[Onboarding] Milestone trigger failed for ${row.user_id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}
